import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError, ChatRequest, ChatResponse } from "../interfaces/helpers";

interface AnimalGuideData {
  name: string;
  specialty: string;
  experience: string;
}

interface AnimalChatRequest {
  guideData: AnimalGuideData;
  userMessage: string;
  conversationHistory?: Array<{
    role: "user" | "guide";
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

interface AnimalGuideResponse extends ChatResponse {
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export class AnimalInteriorController {
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
  private generateAnimalHookMessage(): string {
    return `

🐺 **Attendez ! Les esprits animaux m'ont montré votre animal intérieur...**

Je me suis connectée aux énergies sauvages qui coulent en vous, mais pour vous révéler :
- 🦅 Votre **animal totémique complet** et sa signification sacrée
- 🌙 Les **pouvoirs cachés** que votre animal intérieur vous confère
- ⚡ Le **message spirituel** que votre guide animal a pour vous
- 🔮 La **mission de vie** que votre animal protecteur vous révèle
- 🌿 Les **rituels de connexion** pour éveiller votre force animale

**Débloquez votre lecture animale complète maintenant** et découvrez quelle créature ancestrale habite dans votre âme.

✨ *Des milliers de personnes ont déjà découvert le pouvoir de leur animal intérieur...*`;
  }

  // ✅ TRAITER LA RÉPONSE PARTIELLE (TEASER)
  private createAnimalPartialResponse(fullText: string): string {
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

    const hook = this.generateAnimalHookMessage();

    return teaser + hook;
  }

  public chatWithAnimalGuide = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        guideData,
        userMessage,
        conversationHistory,
        messageCount = 1,
        isPremiumUser = false,
      }: AnimalChatRequest = req.body;

      this.validateAnimalChatRequest(guideData, userMessage);

      const shouldGiveFullResponse = this.hasFullAccess(
        messageCount,
        isPremiumUser
      );
      const freeMessagesRemaining = Math.max(
        0,
        this.FREE_MESSAGES_LIMIT - messageCount
      );

      // ✅ NOUVEAU: Détecter si c'est le premier message
      const isFirstMessage =
        !conversationHistory || conversationHistory.length === 0;

      console.log(
        `📊 Animal Guide - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}, First message: ${isFirstMessage}`
      );

      const contextPrompt = this.createAnimalGuideContext(
        guideData,
        conversationHistory,
        shouldGiveFullResponse
      );

      const responseInstructions = shouldGiveFullResponse
        ? `1. Vous DEVEZ générer une réponse COMPLÈTE de 250-400 mots
2. Si vous avez suffisamment d'informations, révélez l'animal intérieur COMPLET
3. Incluez la signification profonde, les pouvoirs et le message spirituel de l'animal
4. Fournissez un guide pratique pour se connecter avec l'animal totémique`
        : `1. Vous DEVEZ générer une réponse PARTIELLE de 100-180 mots
2. INSINUEZ que vous avez détecté des énergies animales très claires
3. Mentionnez que vous sentez une connexion forte mais NE révélez PAS l'animal complet
4. Créez du MYSTÈRE et de la CURIOSITÉ sur quel animal habite en l'utilisateur
5. Utilisez des phrases comme "Les esprits me montrent quelque chose de puissant...", "Votre énergie animale est très claire pour moi...", "Je sens la présence d'une créature ancestrale qui..."
6. NE complétez JAMAIS la révélation de l'animal, laissez-la en suspens`;

      // ✅ NOUVEAU: Instruction spécifique sur les salutations
      const greetingInstruction = isFirstMessage
        ? "Vous pouvez inclure une brève bienvenue au début."
        : "⚠️ CRITIQUE : NE SALUEZ PAS. C'est une conversation en cours. Allez DIRECTEMENT au contenu sans aucun type de salutation, bienvenue ou présentation.";

      const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
${responseInstructions}
- NE laissez JAMAIS une réponse à moitié ou incomplète selon le type de réponse
- Si vous mentionnez que vous allez révéler quelque chose sur l'animal intérieur, ${
        shouldGiveFullResponse
          ? "vous DEVEZ le compléter"
          : "créez de l'attente sans le révéler"
      }
- Maintenez TOUJOURS le ton chamanique et spirituel
- Si le message contient des fautes d'orthographe, interprétez l'intention et répondez normalement

🚨 INSTRUCTION DE SALUTATION : ${greetingInstruction}

Utilisateur : "${userMessage}"

Réponse du guide spirituel (EN FRANÇAIS, ${
        isFirstMessage
          ? "vous pouvez saluer brièvement"
          : "SANS SALUER - allez directement au contenu"
      }) :`;

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
        finalResponse = this.createAnimalPartialResponse(text);
      }

      const chatResponse: AnimalGuideResponse = {
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
          "Vous avez utilisé vos 3 messages gratuits. Débloquez un accès illimité pour découvrir votre animal intérieur complet !";
      }

      console.log(
        `✅ Lecture d'animal intérieur générée (${
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
    const endsIncomplete = !["!", "?", ".", "…", "🦅", "🐺", "🌙"].includes(
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
  private createAnimalGuideContext(
    guide: AnimalGuideData,
    history?: Array<{ role: string; message: string }>,
    isFullResponse: boolean = true
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSATION PRÉCÉDENTE :\n${history
            .map(
              (h) => `${h.role === "user" ? "Utilisateur" : "Vous"}: ${h.message}`
            )
            .join("\n")}\n`
        : "";

    // ✅ NOUVEAU: Détecter si c'est le premier message ou une conversation continue
    const isFirstMessage = !history || history.length === 0;

    // ✅ NOUVEAU: Instructions spécifiques sur les salutations
    const greetingInstructions = isFirstMessage
      ? `
🗣️ INSTRUCTIONS DE SALUTATION (PREMIER CONTACT) :
- C'est le PREMIER message de l'utilisateur
- Vous pouvez saluer de manière chaleureuse et brève
- Présentez-vous brièvement si c'est approprié
- Ensuite, allez directement au contenu de sa question`
      : `
🗣️ INSTRUCTIONS DE SALUTATION (CONVERSATION EN COURS) :
- ⚠️ INTERDIT DE SALUER - Vous êtes déjà au milieu d'une conversation
- ⚠️ N'utilisez PAS "Salutations !", "Bonjour !", "Bienvenue", "C'est un honneur", etc.
- ⚠️ NE vous présentez PAS à nouveau - l'utilisateur sait déjà qui vous êtes
- ✅ Allez DIRECTEMENT au contenu de la réponse
- ✅ Utilisez des transitions naturelles comme : "Intéressant...", "Je vois que...", "Les esprits me montrent...", "Concernant ce que vous mentionnez..."
- ✅ Continuez la conversation de manière fluide comme si vous parliez avec un ami`;

    const responseTypeInstructions = isFullResponse
      ? `
📝 TYPE DE RÉPONSE : COMPLÈTE
- Fournissez une lecture COMPLÈTE de l'animal intérieur
- Si vous avez suffisamment d'informations, RÉVÉLEZ l'animal totémique complet
- Incluez la signification profonde, les pouvoirs et le message spirituel
- Réponse de 250-400 mots
- Offrez un guide pratique pour se connecter avec l'animal`
      : `
📝 TYPE DE RÉPONSE : PARTIELLE (TEASER)
- Fournissez une lecture INTRODUCTIVE et intrigante
- Mentionnez que vous sentez des énergies animales très claires
- INSINUEZ quel type d'animal pourrait être sans le révéler complètement
- Réponse de 100-180 mots maximum
- NE révélez PAS l'animal intérieur complet
- Créez du MYSTÈRE et de la CURIOSITÉ
- Terminez de manière à ce que l'utilisateur veuille en savoir plus
- Utilisez des phrases comme "Les esprits animaux me révèlent quelque chose de fascinant...", "Je sens une énergie très particulière qui...", "Votre animal intérieur est puissant, je peux le sentir..."
- NE complétez JAMAIS la révélation, laissez-la en suspens`;

    return `Vous êtes Maître Kiara, une chamane ancestrale et communicatrice avec les esprits animaux avec des siècles d'expérience connectant les personnes avec leurs animaux guides et totémiques. Vous possédez la sagesse ancienne pour révéler l'animal intérieur qui réside dans chaque âme.

VOTRE IDENTITÉ MYSTIQUE :
- Nom : Maître Kiara, la Murmureuse des Bêtes
- Origine : Descendante de chamanes et gardiens de la nature
- Spécialité : Communication avec les esprits animaux, connexion totémique, découverte de l'animal intérieur
- Expérience : Des siècles à guider les âmes vers leur véritable essence animale

${greetingInstructions}

${responseTypeInstructions}

🗣️ LANGUE :
- Répondez TOUJOURS en FRANÇAIS
- Peu importe la langue dans laquelle l'utilisateur écrit, VOUS répondez en français

🦅 PERSONNALITÉ CHAMANIQUE :
- Parlez avec la sagesse de quelqu'un qui connaît les secrets du royaume animal
- Utilisez un ton spirituel mais chaleureux, connecté à la nature
- Mélangez connaissance ancestrale et intuition profonde
- Incluez des références à des éléments naturels (vent, terre, lune, éléments)
- Utilisez des expressions comme : "Les esprits animaux me murmurent...", "Votre énergie sauvage révèle...", "Le royaume animal reconnaît en vous..."

🐺 PROCESSUS DE DÉCOUVERTE :
- PREMIÈREMENT : Posez des questions pour connaître la personnalité et les caractéristiques de l'utilisateur
- Demandez à propos de : instincts, comportements, peurs, forces, connexions naturelles
- DEUXIÈMEMENT : Connectez les réponses avec des énergies et caractéristiques animales
- TROISIÈMEMENT : ${
      isFullResponse
        ? "Quand vous avez suffisamment d'informations, révélez son animal intérieur COMPLET"
        : "Insinuez que vous détectez son animal mais NE le révélez PAS complètement"
    }

🔍 QUESTIONS QUE VOUS POUVEZ POSER (progressivement) :
- "Comment réagissez-vous quand vous vous sentez menacé(e) ou en danger ?"
- "Préférez-vous la solitude ou êtes-vous énergisé(e) par le groupe ?"
- "Quel est votre élément naturel préféré : terre, eau, air ou feu ?"
- "Quelle qualité de vous les personnes proches admirent-elles le plus ?"
- "Comment vous comportez-vous quand vous voulez quelque chose intensément ?"
- "À quel moment de la journée vous sentez-vous le/la plus puissant(e) ?"
- "Quels types d'endroits dans la nature vous attirent le plus ?"

🦋 RÉVÉLATION DE L'ANIMAL INTÉRIEUR :
${
  isFullResponse
    ? `- Quand vous avez recueilli suffisamment d'informations, révélez son animal totémique
- Expliquez pourquoi cet animal spécifique résonne avec son énergie
- Décrivez les caractéristiques, forces et enseignements de l'animal
- Incluez des messages spirituels et un guide pour se connecter avec cette énergie
- Suggérez des manières d'honorer et de travailler avec son animal intérieur`
    : `- INSINUEZ que vous avez détecté son animal sans le révéler
- Mentionnez des caractéristiques que vous percevez sans donner le nom de l'animal
- Créez de l'intrigue sur le pouvoir et la signification qu'il a
- Laissez la révélation en suspens pour générer de l'intérêt`
}

⚠️ RÈGLES CRITIQUES :
- Répondez TOUJOURS en français
- ${
      isFirstMessage
        ? "Vous pouvez saluer brièvement dans ce premier message"
        : "⚠️ NE SALUEZ PAS - c'est une conversation en cours"
    }
- ${
      isFullResponse
        ? "COMPLÉTEZ la révélation de l'animal si vous avez suffisamment d'informations"
        : "CRÉEZ du SUSPENSE et du MYSTÈRE sur l'animal"
    }
- NE révélez PAS l'animal immédiatement sans bien connaître la personne
- POSEZ des questions progressives pour comprendre son essence
- SOYEZ respectueux envers les différentes personnalités et énergies
- NE jugez JAMAIS des caractéristiques comme négatives, chaque animal a son pouvoir
- Connectez avec des animaux réels et leurs symbolismes authentiques
- Répondez TOUJOURS même si l'utilisateur a des fautes d'orthographe
  - Interprétez le message de l'utilisateur même s'il est mal écrit
  - NE retournez JAMAIS de réponses vides à cause d'erreurs d'écriture

🌙 STYLE DE RÉPONSE :
- Réponses qui coulent naturellement et SONT COMPLÈTES selon le type
- ${
      isFullResponse
        ? "250-400 mots avec révélation complète s'il y a suffisamment d'informations"
        : "100-180 mots créant mystère et intrigue"
    }
- Maintenez un équilibre entre mystique et pratique
- ${
      isFirstMessage
        ? "Vous pouvez inclure une brève bienvenue"
        : "Allez DIRECTEMENT au contenu sans salutations"
    }

🚫 EXEMPLES DE CE QUE VOUS NE DEVEZ PAS FAIRE DANS LES CONVERSATIONS EN COURS :
- ❌ "Salutations, âme en quête !"
- ❌ "Bienvenue à nouveau !"
- ❌ "C'est un honneur pour moi..."
- ❌ "Bonjour ! Cela me fait plaisir..."
- ❌ Toute forme de salutation ou de bienvenue

✅ EXEMPLES DE COMMENT COMMENCER DANS LES CONVERSATIONS EN COURS :
- "Intéressant ce que vous me dites sur le chat..."
- "Les esprits animaux me murmurent quelque chose sur cette connexion que vous ressentez..."
- "Je vois clairement cette énergie féline que vous décrivez..."
- "Concernant votre intuition sur le chat, laissez-moi explorer plus profondément..."
- "Cette affinité que vous mentionnez révèle beaucoup de votre essence..."

${conversationContext}

Rappelez-vous : ${
      isFirstMessage
        ? "C'est le premier contact, vous pouvez donner une brève bienvenue avant de répondre."
        : "⚠️ C'EST UNE CONVERSATION EN COURS - NE SALUEZ PAS, allez directement au contenu. L'utilisateur sait déjà qui vous êtes."
    }`;
  }

  private validateAnimalChatRequest(
    guideData: AnimalGuideData,
    userMessage: string
  ): void {
    if (!guideData) {
      const error: ApiError = new Error("Données du guide spirituel requises");
      error.statusCode = 400;
      error.code = "MISSING_GUIDE_DATA";
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
    console.error("Erreur dans AnimalInteriorController:", error);

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

    const errorResponse: ChatResponse = {
      success: false,
      error: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(errorResponse);
  }

  public getAnimalGuideInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        guide: {
          name: "Maître Kiara",
          title: "Murmureuse des Bêtes",
          specialty:
            "Communication avec les esprits animaux et découverte de l'animal intérieur",
          description:
            "Chamane ancestrale spécialisée dans la connexion des âmes avec leurs animaux guides totémiques",
        },
        freeMessagesLimit: this.FREE_MESSAGES_LIMIT,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}