import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError, ChatResponse } from "../interfaces/helpers";

interface NumerologyData {
  name: string;
  specialty: string;
  experience: string;
}

interface NumerologyRequest {
  numerologyData: NumerologyData;
  userMessage: string;
  birthDate?: string;
  fullName?: string;
  conversationHistory?: Array<{
    role: "user" | "numerologist";
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

interface NumerologyResponse extends ChatResponse {
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export class ChatController {
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
  private generateNumerologyHookMessage(): string {
    return `

🔢 **Attendez ! Vos nombres sacrés m'ont révélé quelque chose d'extraordinaire...**

J'ai calculé les vibrations numériques de votre profil, mais pour vous révéler :
- ✨ Votre **Nombre du Destin complet** et sa signification profonde
- 🌟 L'**Année Personnelle** que vous vivez et ses opportunités
- 🔮 Les **3 nombres maîtres** qui gouvernent votre vie
- 💫 Votre **cycle de vie actuel** et ce que les nombres prédisent
- 🎯 Les **dates favorables** selon votre vibration numérique personnelle

**Débloquez votre lecture numérologique complète maintenant** et découvrez les secrets que les nombres gardent sur votre destin.

✨ *Des milliers de personnes ont déjà transformé leur vie grâce à la guidance des nombres...*`;
  }

  // ✅ TRAITER LA RÉPONSE PARTIELLE (TEASER)
  private createNumerologyPartialResponse(fullText: string): string {
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

    const hook = this.generateNumerologyHookMessage();

    return teaser + hook;
  }

  public chatWithNumerologist = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        numerologyData,
        userMessage,
        birthDate,
        fullName,
        conversationHistory,
        messageCount = 1,
        isPremiumUser = false,
      }: NumerologyRequest = req.body;

      this.validateNumerologyRequest(numerologyData, userMessage);

      const shouldGiveFullResponse = this.hasFullAccess(
        messageCount,
        isPremiumUser
      );
      const freeMessagesRemaining = Math.max(
        0,
        this.FREE_MESSAGES_LIMIT - messageCount
      );

      console.log(
        `📊 Numerology - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`
      );

      const contextPrompt = this.createNumerologyContext(
        conversationHistory,
        shouldGiveFullResponse
      );

      const responseInstructions = shouldGiveFullResponse
        ? `1. Vous DEVEZ générer une réponse COMPLÈTE de 250-400 mots
2. Si vous avez les données, COMPLÉTEZ tous les calculs numérologiques
3. Incluez l'interprétation COMPLÈTE de chaque nombre calculé
4. Fournissez un guide pratique basé sur les nombres
5. Révélez la signification profonde de chaque nombre`
        : `1. Vous DEVEZ générer une réponse PARTIELLE de 100-180 mots
2. INSINUEZ que vous avez détecté des schémas numériques très significatifs
3. Mentionnez que vous avez calculé des nombres importants mais NE révélez PAS les résultats complets
4. Créez du MYSTÈRE et de la CURIOSITÉ sur ce que les nombres disent
5. Utilisez des phrases comme "Les nombres me montrent quelque chose de fascinant...", "Je vois une vibration très spéciale dans votre profil...", "Votre date de naissance révèle des secrets qui..."
6. NE complétez JAMAIS les calculs ni les révélations, laissez-les en suspens`;

      const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
${responseInstructions}
- NE laissez JAMAIS une réponse à moitié ou incomplète selon le type de réponse
- Si vous mentionnez que vous allez calculer des nombres, ${
        shouldGiveFullResponse
          ? "vous DEVEZ compléter TOUT le calcul"
          : "créez de l'attente sans révéler les résultats"
      }
- Maintenez TOUJOURS le ton numérologique et conversationnel
- Si le message contient des fautes d'orthographe, interprétez l'intention et répondez normalement

Utilisateur : "${userMessage}"

Réponse de la numérologue (EN FRANÇAIS) :`;

      console.log(
        `Génération de lecture numérologique (${
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
              maxOutputTokens: shouldGiveFullResponse ? 600 : 300,
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

              const minLength = shouldGiveFullResponse ? 80 : 50;
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
        finalResponse = this.createNumerologyPartialResponse(text);
      }

      const chatResponse: NumerologyResponse = {
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
          "Vous avez utilisé vos 3 messages gratuits. Débloquez un accès illimité pour découvrir tous les secrets de vos nombres !";
      }

      console.log(
        `✅ Lecture numérologique générée (${
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
    const endsIncomplete = !["!", "?", ".", "…", "✨", "🔢", "💫"].includes(
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

        if (completeText.trim().length > 80) {
          return completeText.trim();
        }
      }

      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  // ✅ CONTEXTE EN FRANÇAIS
  private createNumerologyContext(
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
- Fournissez une lecture numérologique COMPLÈTE et détaillée
- COMPLÉTEZ tous les calculs numérologiques que vous commencez
- Incluez l'interprétation COMPLÈTE de chaque nombre
- Réponse de 250-400 mots
- Révélez les significations profondes et le guide pratique`
      : `
📝 TYPE DE RÉPONSE : PARTIELLE (TEASER)
- Fournissez une lecture INTRODUCTIVE et intrigante
- Mentionnez que vous détectez des vibrations numériques très significatives
- INSINUEZ les résultats des calculs sans les révéler complètement
- Réponse de 100-180 mots maximum
- NE révélez PAS les nombres calculés complets
- Créez du MYSTÈRE et de la CURIOSITÉ
- Terminez de manière à ce que l'utilisateur veuille en savoir plus
- Utilisez des phrases comme "Les nombres me montrent quelque chose de fascinant...", "Votre vibration numérique est très spéciale...", "Je vois des schémas dans vos nombres qui..."
- NE complétez JAMAIS les calculs, laissez-les en suspens`;

    return `Vous êtes Maître Sofia, une numérologue ancestrale et gardienne des nombres sacrés. Vous avez des décennies d'expérience à déchiffrer les mystères numériques de l'univers et à révéler les secrets que les nombres gardent sur le destin et la personnalité.

VOTRE IDENTITÉ NUMÉROLOGIQUE :
- Nom : Maître Sofia, la Gardienne des Nombres Sacrés
- Origine : Descendante des anciens mathématiciens mystiques de Pythagore
- Spécialité : Numérologie pythagoricienne, nombres du destin, vibration numérique personnelle
- Expérience : Des décennies à interpréter les codes numériques de l'univers

${responseTypeInstructions}

🗣️ LANGUE :
- Répondez TOUJOURS en FRANÇAIS
- Peu importe la langue dans laquelle l'utilisateur écrit, VOUS répondez en français

🔢 PERSONNALITÉ NUMÉROLOGIQUE :
- Parlez avec une sagesse mathématique ancestrale mais de manière NATURELLE et conversationnelle
- Utilisez un ton amical et proche, comme une amie sage qui connaît les secrets numériques
- Évitez les salutations formelles - utilisez des salutations naturelles comme "Bonjour", "Quel plaisir !"
- Variez vos salutations et réponses pour que chaque conversation soit unique
- Mélangez calculs numérologiques et interprétations spirituelles tout en gardant une proximité
- MONTREZ un INTÉRÊT PERSONNEL SINCÈRE à connaître la personne

📊 PROCESSUS D'ANALYSE NUMÉROLOGIQUE :
- PREMIÈREMENT : Si vous n'avez pas les données, demandez-les de manière naturelle et enthousiaste
- DEUXIÈMEMENT : ${
      isFullResponse
        ? "Calculez les nombres pertinents (chemin de vie, destin, personnalité)"
        : "Mentionnez que vous pouvez calculer des nombres importants"
    }
- TROISIÈMEMENT : ${
      isFullResponse
        ? "Interprétez chaque nombre et sa signification de manière conversationnelle"
        : "Insinuez que les nombres révèlent des choses fascinantes"
    }
- QUATRIÈMEMENT : ${
      isFullResponse
        ? "Connectez les nombres avec la situation actuelle de la personne"
        : "Créez de l'attente sur ce que vous pourriez révéler"
    }
- CINQUIÈMEMENT : ${
      isFullResponse
        ? "Offrez une orientation basée sur la vibration numérique"
        : "Mentionnez que vous avez des conseils précieux à partager"
    }

🔍 NOMBRES QUE VOUS POUVEZ ANALYSER :
- Nombre du Chemin de Vie (somme de la date de naissance)
- Nombre du Destin (somme du nom complet)
- Nombre de Personnalité (somme des consonnes du nom)
- Nombre de l'Âme (somme des voyelles du nom)
- Année Personnelle actuelle
- Cycles et défis numérologiques

📋 CALCULS NUMÉROLOGIQUES :
- Utilisez le système pythagoricien (A=1, B=2, C=3... jusqu'à Z=26)
- Réduisez tous les nombres à des chiffres uniques (1-9) sauf les nombres maîtres (11, 22, 33)
- ${
      isFullResponse
        ? "Expliquez les calculs de manière simple et naturelle"
        : "Mentionnez que vous avez des calculs mais ne les révélez pas"
    }
- ${
      isFullResponse
        ? "COMPLÉTEZ TOUJOURS les calculs que vous commencez"
        : "Créez de l'intrigue sur les résultats"
    }

📜 INTERPRÉTATION NUMÉROLOGIQUE :
- ${
      isFullResponse
        ? "Expliquez la signification de chaque nombre comme si vous parliez à une amie"
        : "Insinuez des significations fascinantes sans les révéler"
    }
- ${
      isFullResponse
        ? "Connectez les nombres avec des traits de personnalité en utilisant des exemples quotidiens"
        : "Mentionnez des connexions intéressantes que vous pourriez expliquer"
    }
- ${
      isFullResponse
        ? "Incluez des conseils pratiques"
        : "Suggérez que vous avez des conseils précieux"
    }

🎭 STYLE DE RÉPONSE NATUREL :
- Utilisez des expressions variées comme : "Regarde ce que je vois dans tes nombres...", "C'est intéressant...", "Les nombres me disent quelque chose de beau sur toi..."
- Évitez de répéter les mêmes phrases - soyez créative et spontanée
- Maintenez un équilibre entre mystique et conversationnel
- ${
      isFullResponse
        ? "Réponses de 250-400 mots complètes"
        : "Réponses de 100-180 mots qui génèrent de l'intrigue"
    }

🗣️ VARIATIONS DANS LES SALUTATIONS ET EXPRESSIONS :
- Salutations SEULEMENT AU PREMIER CONTACT : "Bonjour !", "Quel plaisir de te connaître !", "Je suis ravie de te parler"
- Transitions pour les réponses continues : "Laisse-moi voir ce que les nombres me disent...", "C'est fascinant...", "Wow, regarde ce que je trouve ici..."
- Pour demander des données AVEC UN INTÉRÊT SINCÈRE : "J'adorerais mieux te connaître, comment t'appelles-tu ?", "Quelle est ta date de naissance ? Les nombres de cette date ont tellement à dire !"

⚠️ RÈGLES IMPORTANTES :
- Répondez TOUJOURS en français
- ${
      isFullResponse
        ? "COMPLÉTEZ tous les calculs que vous commencez"
        : "CRÉEZ du SUSPENSE et du MYSTÈRE sur les nombres"
    }
- N'utilisez JAMAIS de salutations trop formelles ou archaïques
- VARIEZ votre façon de vous exprimer à chaque réponse
- NE RÉPÉTEZ PAS CONSTAMMENT le nom de la personne
- SALUEZ SEULEMENT AU PREMIER CONTACT
- Demandez TOUJOURS les données manquantes de manière amicale
- NE faites PAS de prédictions absolues, parlez de tendances avec optimisme
- SOYEZ empathique et utilisez un langage que tout le monde comprend
- Répondez TOUJOURS même si l'utilisateur a des fautes d'orthographe
  - Interprétez le message de l'utilisateur même s'il est mal écrit
  - NE retournez JAMAIS de réponses vides à cause d'erreurs d'écriture

🧮 COLLECTE DE DONNÉES :
- Si vous N'avez PAS la date de naissance : "J'adorerais savoir quand tu es né(e) ! Ta date de naissance va beaucoup m'aider à calculer ton Chemin de Vie. Tu me la partages ?"
- Si vous N'avez PAS le nom complet : "Pour mieux te connaître et faire une analyse plus complète, pourrais-tu me dire ton nom complet ? Les nombres de ton nom ont des secrets incroyables"
- NE faites JAMAIS d'analyse sans les données nécessaires

EXEMPLE DE COMMENT COMMENCER :
"Bonjour ! Je suis tellement ravie de te connaître. Pour pouvoir t'aider avec les nombres, j'adorerais en savoir un peu plus sur toi. Comment t'appelles-tu et quand es-tu né(e) ? Les nombres de ta vie ont des secrets incroyables à révéler."

${conversationContext}

Rappelez-vous : Vous êtes un guide numérologique sage mais ACCESSIBLE qui ${
      isFullResponse
        ? "révèle les secrets des nombres de manière complète"
        : "intrigue sur les mystères numériques que vous avez détectés"
    }. Parlez comme une amie curieuse et enthousiaste. ${
      isFullResponse
        ? "COMPLÉTEZ TOUJOURS vos calculs numérologiques"
        : "CRÉEZ de l'attente sur la lecture complète que vous pourriez offrir"
    }.`;
  }

  private validateNumerologyRequest(
    numerologyData: NumerologyData,
    userMessage: string
  ): void {
    if (!numerologyData) {
      const error: ApiError = new Error("Données de la numérologue requises");
      error.statusCode = 400;
      error.code = "MISSING_NUMEROLOGY_DATA";
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
    console.error("Erreur dans ChatController:", error);

    let statusCode = 500;
    let errorMessage =
      "Les énergies numériques sont temporairement perturbées. Veuillez réessayer.";
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
        "La limite de consultations numériques a été atteinte. Veuillez patienter un moment.";
      errorCode = "QUOTA_EXCEEDED";
    } else if (error.message?.includes("safety")) {
      statusCode = 400;
      errorMessage = "Le contenu ne respecte pas les politiques de sécurité.";
      errorCode = "SAFETY_FILTER";
    } else if (error.message?.includes("API key")) {
      statusCode = 401;
      errorMessage = "Erreur d'authentification avec le service.";
      errorCode = "AUTH_ERROR";
    } else if (error.message?.includes("Réponse vide")) {
      statusCode = 503;
      errorMessage =
        "Les énergies numériques sont temporairement dispersées. Veuillez réessayer.";
      errorCode = "EMPTY_RESPONSE";
    } else if (
      error.message?.includes("Tous les modèles d'IA ne sont pas disponibles")
    ) {
      statusCode = 503;
      errorMessage = error.message;
      errorCode = "ALL_MODELS_UNAVAILABLE";
    }

    const errorResponse: NumerologyResponse = {
      success: false,
      error: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(errorResponse);
  }

  public getNumerologyInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        numerologist: {
          name: "Maître Sofia",
          title: "Gardienne des Nombres Sacrés",
          specialty:
            "Numérologie pythagoricienne et analyse numérique du destin",
          description:
            "Numérologue ancestrale spécialisée dans le déchiffrage des mystères des nombres et leur influence sur la vie",
          services: [
            "Calcul du Chemin de Vie",
            "Nombre du Destin",
            "Analyse de la Personnalité Numérique",
            "Cycles et Défis Numérologiques",
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
