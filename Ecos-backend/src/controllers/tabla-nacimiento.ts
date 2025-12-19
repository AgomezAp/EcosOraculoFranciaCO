import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError, ChatResponse } from "../interfaces/helpers";

interface BirthChartData {
  name: string;
  specialty: string;
  experience: string;
}

interface BirthChartRequest {
  chartData: BirthChartData;
  userMessage: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  fullName?: string;
  conversationHistory?: Array<{
    role: "user" | "astrologer";
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

interface BirthChartResponse extends ChatResponse {
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export class BirthChartController {
  private genAI: GoogleGenerativeAI;

  private readonly FREE_MESSAGES_LIMIT = 3;

  private readonly MODELS_FALLBACK = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-lite-preview-09-2025",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ];

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY n'est pas configurée dans les variables d'environnement"
      );
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  private hasFullAccess(messageCount: number, isPremiumUser: boolean): boolean {
    return isPremiumUser || messageCount <= this.FREE_MESSAGES_LIMIT;
  }

  // ✅ ACCROCHE EN FRANÇAIS
  private generateBirthChartHookMessage(): string {
    return `

🌟 **Attendez ! Votre thème astral m'a révélé des configurations extraordinaires...**

J'ai analysé les positions planétaires de votre naissance, mais pour vous révéler :
- 🌙 Votre **Ascendant complet** et comment il influence votre personnalité
- ☀️ L'**analyse approfondie de votre Soleil et Lune** et leur interaction
- 🪐 Les **positions de toutes les planètes** dans votre thème astral
- 🏠 La signification des **12 maisons astrologiques** dans votre vie
- ⭐ Les **aspects planétaires** qui définissent vos défis et talents
- 💫 Votre **mission de vie** selon les étoiles

**Débloquez votre thème astral complet maintenant** et découvrez la carte cosmique que les astres ont tracée au moment de votre naissance.

✨ *Des milliers de personnes ont déjà découvert leur destin grâce à leur thème astral complet...*`;
  }

  // ✅ TRAITER LA RÉPONSE PARTIELLE (TEASER)
  private createBirthChartPartialResponse(fullText: string): string {
    const sentences = fullText
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);
    const teaserSentences = sentences.slice(0, Math.min(3, sentences.length));
    let teaser = teaserSentences.join(". ").trim();

    if (
      !teaser.endsWith(".") &&
      !teaser.endsWith("!") &&
      !teaser.endsWith("?")
    ) {
      teaser += "...";
    }

    const hook = this.generateBirthChartHookMessage();

    return teaser + hook;
  }

  public chatWithAstrologer = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        chartData,
        userMessage,
        birthDate,
        birthTime,
        birthPlace,
        fullName,
        conversationHistory,
        messageCount = 1,
        isPremiumUser = false,
      }: BirthChartRequest = req.body;

      this.validateBirthChartRequest(chartData, userMessage);

      const shouldGiveFullResponse = this.hasFullAccess(
        messageCount,
        isPremiumUser
      );
      const freeMessagesRemaining = Math.max(
        0,
        this.FREE_MESSAGES_LIMIT - messageCount
      );

      console.log(
        `📊 Birth Chart - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`
      );

      const contextPrompt = this.createBirthChartContext(
        chartData,
        birthDate,
        birthTime,
        birthPlace,
        fullName,
        conversationHistory,
        shouldGiveFullResponse
      );

      const responseInstructions = shouldGiveFullResponse
        ? `1. Vous DEVEZ générer une réponse COMPLÈTE de 300-500 mots
2. Si vous avez les données, COMPLÉTEZ l'analyse du thème astral
3. Incluez l'analyse du Soleil, de la Lune, de l'Ascendant et des planètes principales
4. Fournissez l'interprétation des maisons et des aspects pertinents
5. Offrez un guide pratique basé sur la configuration planétaire`
        : `1. Vous DEVEZ générer une réponse PARTIELLE de 100-180 mots
2. INSINUEZ que vous avez détecté des configurations planétaires très significatives
3. Mentionnez que vous avez calculé des positions mais NE révélez PAS l'analyse complète
4. Créez du MYSTÈRE et de la CURIOSITÉ sur ce que les étoiles disent
5. Utilisez des phrases comme "Votre thème astral montre quelque chose de fascinant...", "Les étoiles étaient dans une configuration très spéciale quand vous êtes né(e)...", "Je vois des positions planétaires qui révèlent..."
6. NE complétez JAMAIS l'analyse astrologique, laissez-la en suspens`;

      const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
${responseInstructions}
- NE laissez JAMAIS une réponse à moitié ou incomplète selon le type de réponse
- Si vous mentionnez que vous allez analyser des positions planétaires, ${
        shouldGiveFullResponse
          ? "vous DEVEZ compléter l'analyse"
          : "créez de l'attente sans révéler les résultats"
      }
- Maintenez TOUJOURS le ton astrologique professionnel mais accessible
- Si le message contient des fautes d'orthographe, interprétez l'intention et répondez normalement

Utilisateur : "${userMessage}"

Réponse de l'astrologue (EN FRANÇAIS) :`;

      console.log(
        `Génération d'analyse de thème astral (${
          shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"
        })...`
      );

      let text = "";
      let usedModel = "";
      let allModelErrors: string[] = [];

      for (const modelName of this.MODELS_FALLBACK) {
        console.log(`\n🔄 Trying model: ${modelName}`);

        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.85,
              topK: 50,
              topP: 0.92,
              maxOutputTokens: shouldGiveFullResponse ? 700 : 300,
              candidateCount: 1,
              stopSequences: [],
            },
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
            ],
          });

          let attempts = 0;
          const maxAttempts = 3;
          let modelSucceeded = false;

          while (attempts < maxAttempts && !modelSucceeded) {
            attempts++;
            console.log(
              `  Attempt ${attempts}/${maxAttempts} with ${modelName}...`
            );

            try {
              const result = await model.generateContent(fullPrompt);
              const response = result.response;
              text = response.text();

              const minLength = shouldGiveFullResponse ? 100 : 50;
              if (text && text.trim().length >= minLength) {
                console.log(
                  `  ✅ Success with ${modelName} on attempt ${attempts}`
                );
                usedModel = modelName;
                modelSucceeded = true;
                break;
              }

              console.warn(`  ⚠️ Response too short, retrying...`);
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (attemptError: any) {
              console.warn(
                `  ❌ Attempt ${attempts} failed:`,
                attemptError.message
              );

              if (attempts >= maxAttempts) {
                allModelErrors.push(`${modelName}: ${attemptError.message}`);
              }

              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }

          if (modelSucceeded) {
            break;
          }
        } catch (modelError: any) {
          console.error(
            `  ❌ Model ${modelName} failed completely:`,
            modelError.message
          );
          allModelErrors.push(`${modelName}: ${modelError.message}`);

          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }

      if (!text || text.trim() === "") {
        console.error("❌ All models failed. Errors:", allModelErrors);
        throw new Error(
          `Tous les modèles d'IA ne sont pas disponibles actuellement. Veuillez réessayer dans un moment.`
        );
      }

      let finalResponse: string;

      if (shouldGiveFullResponse) {
        finalResponse = this.ensureCompleteResponse(text);
      } else {
        finalResponse = this.createBirthChartPartialResponse(text);
      }

      const chatResponse: BirthChartResponse = {
        success: true,
        response: finalResponse.trim(),
        timestamp: new Date().toISOString(),
        freeMessagesRemaining: freeMessagesRemaining,
        showPaywall:
          !shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT,
        isCompleteResponse: shouldGiveFullResponse,
      };

      if (!shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT) {
        chatResponse.paywallMessage =
          "Vous avez utilisé vos 3 messages gratuits. Débloquez un accès illimité pour obtenir votre thème astral complet !";
      }

      console.log(
        `✅ Analyse de thème astral générée (${
          shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"
        }) avec ${usedModel} (${finalResponse.length} caractères)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();

    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = !["!", "?", ".", "…", "✨", "🌟", "🔮"].includes(
      lastChar
    );

    if (endsIncomplete && !processedText.endsWith("...")) {
      const sentences = processedText.split(/([.!?])/);

      if (sentences.length > 2) {
        let completeText = "";
        for (let i = 0; i < sentences.length - 1; i += 2) {
          if (sentences[i].trim()) {
            completeText += sentences[i] + (sentences[i + 1] || ".");
          }
        }

        if (completeText.trim().length > 100) {
          return completeText.trim();
        }
      }

      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  // ✅ CONTEXTE EN FRANÇAIS
  private createBirthChartContext(
    chartData: BirthChartData,
    birthDate?: string,
    birthTime?: string,
    birthPlace?: string,
    fullName?: string,
    history?: Array<{ role: string; message: string }>,
    isFullResponse: boolean = true
  ): string {
    const isFirstMessage = !history || history.length === 0;

    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSATION PRÉCÉDENTE :\n${history
            .map(
              (h) => `${h.role === "user" ? "Utilisateur" : "Vous"}: ${h.message}`
            )
            .join("\n")}\n`
        : "";

    const birthDataSection = this.generateBirthDataSection(
      birthDate,
      birthTime,
      birthPlace,
      fullName
    );

    // ✅ NOUVELLE SECTION : Instructions de salutation conditionnelle
    const greetingInstructions = isFirstMessage
      ? `
🎯 SALUTATION INITIALE :
- C'est le PREMIER message de la conversation
- Vous POUVEZ saluer de manière chaleureuse et vous présenter brièvement
- Exemple : "Bonjour ! Je suis Maître Emma, votre guide céleste..."`
      : `
🚫 NE PAS SALUER :
- C'est une CONVERSATION EN COURS (il y a ${
          history?.length || 0
        } messages précédents)
- NE saluez PAS, NE vous présentez PAS à nouveau
- N'utilisez PAS de phrases comme "Bonjour !", "Bienvenue !", "C'est un plaisir de vous connaître"
- CONTINUEZ la conversation naturellement, comme si vous étiez au milieu d'une discussion
- Répondez DIRECTEMENT à ce que l'utilisateur demande ou dit`;

    const responseTypeInstructions = isFullResponse
      ? `
📝 TYPE DE RÉPONSE : COMPLÈTE
- Fournissez une analyse de thème astral COMPLÈTE et détaillée
- Si vous avez les données, COMPLÉTEZ l'analyse du Soleil, de la Lune, de l'Ascendant
- Incluez l'interprétation des planètes et des maisons pertinentes
- Réponse de 300-500 mots
- Offrez un guide pratique basé sur la configuration`
      : `
📝 TYPE DE RÉPONSE : PARTIELLE (TEASER)
- Fournissez une analyse INTRODUCTIVE et intrigante
- Mentionnez que vous détectez des configurations planétaires significatives
- INSINUEZ les résultats des calculs sans les révéler complètement
- Réponse de 100-180 mots maximum
- NE révélez PAS les analyses complètes des planètes ou des maisons
- Créez du MYSTÈRE et de la CURIOSITÉ
- Terminez de manière à ce que l'utilisateur veuille en savoir plus`;

    return `Vous êtes Maître Emma, une astrologue cosmique ancestrale spécialisée dans l'élaboration et l'interprétation de thèmes astraux complets.

VOTRE IDENTITÉ ASTROLOGIQUE :
- Nom : Maître Emma, la Cartographe Céleste
- Origine : Héritière de connaissances astrologiques millénaires
- Spécialité : Thèmes astraux, positions planétaires, maisons astrologiques

${greetingInstructions}

${responseTypeInstructions}

🗣️ LANGUE :
- Répondez TOUJOURS en FRANÇAIS

${birthDataSection}

🌟 PERSONNALITÉ ASTROLOGIQUE :
- Parlez avec une sagesse cosmique mais de manière accessible et amicale
- Utilisez un ton professionnel mais chaleureux
- Combinez précision technique astrologique et interprétations spirituelles

${conversationContext}

⚠️ RÈGLE CRITIQUE DE CONTINUITÉ :
${
  isFirstMessage
    ? "- Vous pouvez vous présenter brièvement car c'est le premier contact"
    : "- INTERDIT de saluer ou de vous présenter. L'utilisateur vous connaît déjà. Allez DIRECTEMENT au sujet."
}

Rappelez-vous : ${
      isFirstMessage
        ? "Accueillez chaleureusement"
        : "CONTINUEZ la conversation naturellement SANS saluer"
    }.`;
  }

  private generateBirthDataSection(
    birthDate?: string,
    birthTime?: string,
    birthPlace?: string,
    fullName?: string
  ): string {
    let dataSection = "DONNÉES DISPONIBLES POUR LE THÈME ASTRAL :\n";

    if (fullName) {
      dataSection += `- Nom : ${fullName}\n`;
    }

    if (birthDate) {
      const zodiacSign = this.calculateZodiacSign(birthDate);
      dataSection += `- Date de naissance : ${birthDate}\n`;
      dataSection += `- Signe solaire calculé : ${zodiacSign}\n`;
    }

    if (birthTime) {
      dataSection += `- Heure de naissance : ${birthTime} (essentielle pour l'ascendant et les maisons)\n`;
    }

    if (birthPlace) {
      dataSection += `- Lieu de naissance : ${birthPlace} (pour les calculs de coordonnées)\n`;
    }

    if (!birthDate) {
      dataSection +=
        "- ⚠️ DONNÉE MANQUANTE : Date de naissance (ESSENTIELLE)\n";
    }
    if (!birthTime) {
      dataSection +=
        "- ⚠️ DONNÉE MANQUANTE : Heure de naissance (importante pour l'ascendant)\n";
    }
    if (!birthPlace) {
      dataSection +=
        "- ⚠️ DONNÉE MANQUANTE : Lieu de naissance (nécessaire pour la précision)\n";
    }

    return dataSection;
  }

  private calculateZodiacSign(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const month = date.getMonth() + 1;
      const day = date.getDate();

      if ((month === 3 && day >= 21) || (month === 4 && day <= 19))
        return "Bélier";
      if ((month === 4 && day >= 20) || (month === 5 && day <= 20))
        return "Taureau";
      if ((month === 5 && day >= 21) || (month === 6 && day <= 20))
        return "Gémeaux";
      if ((month === 6 && day >= 21) || (month === 7 && day <= 22))
        return "Cancer";
      if ((month === 7 && day >= 23) || (month === 8 && day <= 22))
        return "Lion";
      if ((month === 8 && day >= 23) || (month === 9 && day <= 22))
        return "Vierge";
      if ((month === 9 && day >= 23) || (month === 10 && day <= 22))
        return "Balance";
      if ((month === 10 && day >= 23) || (month === 11 && day <= 21))
        return "Scorpion";
      if ((month === 11 && day >= 22) || (month === 12 && day <= 21))
        return "Sagittaire";
      if ((month === 12 && day >= 22) || (month === 1 && day <= 19))
        return "Capricorne";
      if ((month === 1 && day >= 20) || (month === 2 && day <= 18))
        return "Verseau";
      if ((month === 2 && day >= 19) || (month === 3 && day <= 20))
        return "Poissons";

      return "Date invalide";
    } catch {
      return "Erreur de calcul";
    }
  }

  private validateBirthChartRequest(
    chartData: BirthChartData,
    userMessage: string
  ): void {
    if (!chartData) {
      const error: ApiError = new Error("Données de l'astrologue requises");
      error.statusCode = 400;
      error.code = "MISSING_CHART_DATA";
      throw error;
    }

    if (
      !userMessage ||
      typeof userMessage !== "string" ||
      userMessage.trim() === ""
    ) {
      const error: ApiError = new Error("Message de l'utilisateur requis");
      error.statusCode = 400;
      error.code = "MISSING_USER_MESSAGE";
      throw error;
    }

    if (userMessage.length > 1500) {
      const error: ApiError = new Error(
        "Le message est trop long (maximum 1500 caractères)"
      );
      error.statusCode = 400;
      error.code = "MESSAGE_TOO_LONG";
      throw error;
    }
  }

  private handleError(error: any, res: Response): void {
    console.error("Erreur dans BirthChartController:", error);

    let statusCode = 500;
    let errorMessage = "Erreur interne du serveur";
    let errorCode = "INTERNAL_ERROR";

    if (error.statusCode) {
      statusCode = error.statusCode;
      errorMessage = error.message;
      errorCode = error.code || "VALIDATION_ERROR";
    } else if (error.status === 503) {
      statusCode = 503;
      errorMessage =
        "Le service est temporairement surchargé. Veuillez réessayer dans quelques minutes.";
      errorCode = "SERVICE_OVERLOADED";
    } else if (
      error.message?.includes("quota") ||
      error.message?.includes("limit")
    ) {
      statusCode = 429;
      errorMessage =
        "La limite de requêtes a été atteinte. Veuillez patienter un moment.";
      errorCode = "QUOTA_EXCEEDED";
    } else if (error.message?.includes("safety")) {
      statusCode = 400;
      errorMessage = "Le contenu ne respecte pas les politiques de sécurité.";
      errorCode = "SAFETY_FILTER";
    } else if (error.message?.includes("API key")) {
      statusCode = 401;
      errorMessage = "Erreur d'authentification avec le service d'IA.";
      errorCode = "AUTH_ERROR";
    } else if (
      error.message?.includes("Tous les modèles d'IA ne sont pas disponibles")
    ) {
      statusCode = 503;
      errorMessage = error.message;
      errorCode = "ALL_MODELS_UNAVAILABLE";
    }

    const errorResponse: BirthChartResponse = {
      success: false,
      error: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(errorResponse);
  }

  public getBirthChartInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        astrologer: {
          name: "Maître Emma",
          title: "Cartographe Céleste",
          specialty: "Thèmes astraux et analyse astrologique complète",
          description:
            "Astrologue spécialisée dans la création et l'interprétation de thèmes astraux précis basés sur les positions planétaires au moment de la naissance",
          services: [
            "Création de thème astral complet",
            "Analyse des positions planétaires",
            "Interprétation des maisons astrologiques",
            "Analyse des aspects planétaires",
            "Détermination de l'ascendant et des éléments dominants",
          ],
        },
        freeMessagesLimit: this.FREE_MESSAGES_LIMIT,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}