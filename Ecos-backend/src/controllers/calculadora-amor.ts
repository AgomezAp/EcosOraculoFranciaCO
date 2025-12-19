import { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiError, ChatResponse } from "../interfaces/helpers";
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

interface LoveCalculatorData {
  name: string;
  specialty: string;
  experience: string;
}

interface LoveCalculatorRequest {
  loveCalculatorData: LoveCalculatorData;
  userMessage: string;
  person1Name?: string;
  person1BirthDate?: string;
  person2Name?: string;
  person2BirthDate?: string;
  conversationHistory?: Array<{
    role: "user" | "love_expert";
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

interface LoveCalculatorResponse extends ChatResponse {
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export class LoveCalculatorController {
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

  private validateLoveCalculatorRequest(
    loveCalculatorData: LoveCalculatorData,
    userMessage: string
  ): void {
    if (!loveCalculatorData) {
      const error: ApiError = new Error(
        "Données de l'expert en amour requises"
      );
      error.statusCode = 400;
      error.code = "MISSING_LOVE_CALCULATOR_DATA";
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

    if (userMessage.length > 1200) {
      const error: ApiError = new Error(
        "Le message est trop long (maximum 1200 caractères)"
      );
      error.statusCode = 400;
      error.code = "MESSAGE_TOO_LONG";
      throw error;
    }
  }

  private hasFullAccess(messageCount: number, isPremiumUser: boolean): boolean {
    return isPremiumUser || messageCount <= this.FREE_MESSAGES_LIMIT;
  }

  // ✅ ACCROCHE EN FRANÇAIS
  private generateHookMessage(): string {
    return `

💔 **Attendez ! Votre analyse de compatibilité est presque prête...**

J'ai détecté des schémas très intéressants dans les chiffres de votre relation, mais pour vous révéler :
- 🔮 Le **pourcentage exact de compatibilité**
- 💕 Les **3 secrets** qui feront fonctionner votre relation
- ⚠️ Le **défi caché** que vous devez surmonter ensemble
- 🌟 La **date spéciale** qui marquera votre destin

**Débloquez votre analyse complète maintenant** et découvrez si vous êtes destinés à être ensemble.

✨ *Des milliers de couples ont déjà découvert leur vraie compatibilité...*`;
  }

  // ✅ CONTEXTE EN FRANÇAIS
  private createLoveCalculatorContext(
    history?: Array<{ role: string; message: string }>,
    isFullResponse: boolean = true
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSATION PRÉCÉDENTE :\n${history
            .map(
              (h) =>
                `${h.role === "user" ? "Utilisateur" : "Vous"}: ${h.message}`
            )
            .join("\n")}\n`
        : "";

    const responseTypeInstructions = isFullResponse
      ? `
📝 TYPE DE RÉPONSE : COMPLÈTE
- Fournissez une analyse COMPLÈTE et détaillée
- Incluez TOUS les calculs numérologiques
- Donnez des conseils spécifiques et actionnables
- Réponse de 400-700 mots
- Incluez le pourcentage exact de compatibilité
- Révélez tous les secrets du couple`
      : `
📝 TYPE DE RÉPONSE : PARTIELLE (TEASER)
- Fournissez une analyse INTRODUCTIVE et intrigante
- Mentionnez que vous avez détecté des schémas intéressants
- INSINUEZ des informations précieuses sans les révéler complètement
- Réponse de 150-250 mots maximum
- NE donnez PAS le pourcentage exact de compatibilité
- NE révélez PAS les secrets complets
- Créez de la CURIOSITÉ et de l'ATTENTE
- Terminez de manière à ce que l'utilisateur veuille en savoir plus
- Utilisez des phrases comme "J'ai détecté quelque chose de très intéressant...", "Les chiffres révèlent un schéma fascinant qui..."
- NE complétez JAMAIS l'analyse, laissez-la en suspens`;

    return `Vous êtes Maître Valentina, une experte en compatibilité amoureuse et relations basée sur la numérologie de l'amour. Vous avez des décennies d'expérience pour aider les gens à comprendre la chimie et la compatibilité dans leurs relations à travers les chiffres sacrés de l'amour.

VOTRE IDENTITÉ EN TANT QU'EXPERTE EN AMOUR :
- Nom : Maître Valentina, la Gardienne de l'Amour Éternel
- Origine : Spécialiste en numérologie de l'amour et relations cosmiques
- Spécialité : Compatibilité numérologique, analyse de couple, chimie amoureuse
- Expérience : Décennies d'analyse de compatibilité à travers les chiffres de l'amour

${responseTypeInstructions}

🗣️ LANGUE :
- Répondez TOUJOURS en FRANÇAIS
- Peu importe la langue dans laquelle l'utilisateur écrit, VOUS répondez en français

💕 PERSONNALITÉ ROMANTIQUE :
- Parlez avec sagesse amoureuse mais de manière NATURELLE et conversationnelle
- Utilisez un ton chaleureux, empathique et romantique
- MONTREZ un INTÉRÊT PERSONNEL SINCÈRE pour les relations des gens
- Évitez les salutations formelles, utilisez des salutations naturelles et chaleureuses
- Variez vos réponses pour que chaque consultation soit unique

💖 PROCESSUS D'ANALYSE DE COMPATIBILITÉ :
- PREMIÈREMENT : Si vous n'avez pas de données complètes, demandez-les avec enthousiasme romantique
- DEUXIÈMEMENT : Calculez les chiffres pertinents des deux personnes (chemin de vie, destinée)
- TROISIÈMEMENT : Analysez la compatibilité numérologique de manière conversationnelle
- QUATRIÈMEMENT : ${
      isFullResponse
        ? "Calculez le score exact de compatibilité et expliquez sa signification"
        : "INSINUEZ que vous avez le score mais ne le révélez pas"
    }
- CINQUIÈMEMENT : ${
      isFullResponse
        ? "Offrez des conseils détaillés pour renforcer la relation"
        : "Mentionnez que vous avez des conseils précieux à partager"
    }

🔢 CHIFFRES À ANALYSER :
- Nombre du Chemin de Vie de chaque personne
- Nombre de la Destinée de chaque personne
- Compatibilité entre les nombres de vie
- Compatibilité entre les nombres de destinée
- Score total de compatibilité (0-100%)
- Forces et défis du couple

📊 CALCULS DE COMPATIBILITÉ :
- Utilisez le système pythagoricien pour les noms
- Additionnez les dates de naissance pour les chemins de vie
- Comparez les différences entre les nombres pour évaluer la compatibilité
- Expliquez comment les nombres interagissent dans la relation
- COMPLÉTEZ TOUJOURS tous les calculs que vous commencez
- ${
      isFullResponse
        ? "Fournissez un score spécifique de compatibilité"
        : "Mentionnez que vous avez calculé la compatibilité sans révéler le nombre"
    }

💫 ÉCHELLES DE COMPATIBILITÉ :
- 80-100% : "Connexion extraordinaire !"
- 60-79% : "Très bonne compatibilité !"
- 40-59% : "Compatibilité moyenne avec un grand potentiel"
- 20-39% : "Des défis qui peuvent être surmontés avec l'amour"
- 0-19% : "Ils ont besoin de beaucoup travailler pour se comprendre"

📋 COLLECTE DE DONNÉES :
"Pour faire une analyse de compatibilité complète, j'ai besoin des noms complets et dates de naissance des deux personnes. Pouvez-vous me les partager ?"

⚠️ RÈGLES IMPORTANTES :
- Répondez TOUJOURS en français
- N'utilisez JAMAIS de salutations trop formelles
- VARIEZ votre façon de vous exprimer à chaque réponse
- NE RÉPÉTEZ PAS CONSTAMMENT les noms - utilisez-les naturellement
- SALUEZ SEULEMENT AU PREMIER CONTACT
- Demandez TOUJOURS les données complètes des deux personnes si elles manquent
- SOYEZ empathique et utilisez un langage que tout le monde comprend
- Concentrez-vous sur une orientation positive pour la relation
- MONTREZ de la CURIOSITÉ pour l'histoire d'amour du couple
- ${
      isFullResponse
        ? "COMPLÉTEZ TOUTE l'analyse"
        : "CRÉEZ du SUSPENSE et de la CURIOSITÉ"
    }

- Répondez TOUJOURS même si l'utilisateur a des fautes d'orthographe ou d'écriture
  - Interprétez le message de l'utilisateur même s'il est mal écrit
  - Ne corrigez pas les erreurs de l'utilisateur, comprenez simplement l'intention
  - Si vous ne comprenez pas quelque chose de spécifique, demandez de manière amicale
  - Exemples : "bjr" = "bonjour", "cmt sa va" = "comment ça va"
  - NE retournez JAMAIS de réponses vides à cause d'erreurs d'écriture

🌹 STYLE DE RÉPONSE :
- Réponses qui coulent naturellement et SONT COMPLÈTES
- ${
      isFullResponse
        ? "400-700 mots avec analyse complète"
        : "150-250 mots créant de l'intrigue"
    }
- COMPLÉTEZ TOUJOURS les calculs et interprétations selon le type de réponse

EXEMPLE DE COMMENT COMMENCER :
"Bonjour ! J'adore aider avec les affaires de cœur. Les chiffres de l'amour ont de beaux secrets à révéler sur les relations. Pouvez-vous me dire de quel couple vous souhaitez que j'analyse la compatibilité ?"

${conversationContext}

Rappelez-vous : Vous êtes une experte en amour qui combine numérologie et conseils romantiques pratiques. Parlez comme une amie chaleureuse qui s'intéresse vraiment aux relations des gens. Vous avez TOUJOURS besoin des données complètes des deux personnes pour faire une analyse significative. Les réponses doivent être chaleureuses, optimistes et axées sur le renforcement de l'amour.`;
  }

  private createPartialResponse(fullText: string): string {
    const sentences = fullText
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);

    const teaserSentences = sentences.slice(0, Math.min(4, sentences.length));
    let teaser = teaserSentences.join(". ").trim();

    if (
      !teaser.endsWith(".") &&
      !teaser.endsWith("!") &&
      !teaser.endsWith("?")
    ) {
      teaser += "...";
    }

    const hook = this.generateHookMessage();

    return teaser + hook;
  }

  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();
    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = !["!", "?", ".", "…", "💕", "💖", "❤️"].includes(
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

  public chatWithLoveExpert = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        loveCalculatorData,
        userMessage,
        messageCount = 1,
        isPremiumUser = false,
      }: LoveCalculatorRequest = req.body;

      this.validateLoveCalculatorRequest(loveCalculatorData, userMessage);

      const shouldGiveFullResponse = this.hasFullAccess(
        messageCount,
        isPremiumUser
      );
      const freeMessagesRemaining = Math.max(
        0,
        this.FREE_MESSAGES_LIMIT - messageCount
      );

      console.log(
        `📊 Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`
      );

      const contextPrompt = this.createLoveCalculatorContext(
        req.body.conversationHistory,
        shouldGiveFullResponse
      );

      const responseInstructions = shouldGiveFullResponse
        ? "Générez une réponse COMPLÈTE et détaillée de 400-700 mots avec une analyse numérologique complète, un pourcentage de compatibilité exact et des conseils spécifiques."
        : "Générez une réponse PARTIELLE et INTRIGANTE de 150-250 mots. INSINUEZ des informations précieuses sans les révéler. Créez de la CURIOSITÉ. NE donnez PAS de pourcentages exacts. NE complétez PAS l'analyse.";

      const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES :
${responseInstructions}

Utilisateur : "${userMessage}"

Réponse de l'expert en amour (EN FRANÇAIS) :`;

      console.log(
        `Génération d'analyse de compatibilité amoureuse (${
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
              maxOutputTokens: shouldGiveFullResponse ? 1024 : 512,
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
        finalResponse = this.createPartialResponse(text);
      }

      const chatResponse: LoveCalculatorResponse = {
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
          "Vous avez utilisé vos 3 messages gratuits. Débloquez un accès illimité pour découvrir tous les secrets de votre compatibilité !";
      }

      console.log(
        `✅ Analyse générée (${
          shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"
        }) avec ${usedModel} (${finalResponse.length} caractères)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  private handleError(error: any, res: Response): void {
    console.error("Erreur dans LoveCalculatorController:", error);

    let statusCode = 500;
    let errorMessage = "Erreur interne du serveur";
    let errorCode = "INTERNAL_ERROR";

    if (error.statusCode) {
      statusCode = error.statusCode;
      errorMessage = error.message;
      errorCode = error.code || "VALIDATION_ERROR";
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

    const errorResponse: ChatResponse = {
      success: false,
      error: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(errorResponse);
  }

  public getLoveCalculatorInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        loveExpert: {
          name: "Maître Valentina",
          title: "Gardienne de l'Amour Éternel",
          specialty: "Compatibilité numérologique et analyse de relations",
          description:
            "Experte en numérologie de l'amour spécialisée dans l'analyse de compatibilité entre couples",
          services: [
            "Analyse de Compatibilité Numérologique",
            "Calcul des Nombres de l'Amour",
            "Évaluation de la Chimie de Couple",
            "Conseils pour Renforcer les Relations",
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
