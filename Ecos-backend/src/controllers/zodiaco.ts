import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError, ChatResponse } from "../interfaces/helpers";

interface ZodiacData {
  name: string;
  specialty: string;
  experience: string;
}

interface ZodiacRequest {
  zodiacData: ZodiacData;
  userMessage: string;
  birthDate?: string;
  zodiacSign?: string;
  conversationHistory?: Array<{
    role: "user" | "astrologer";
    message: string;
  }>;
}

export class ZodiacController {
  private genAI: GoogleGenerativeAI;

  // ✅ LISTE DES MODÈLES DE SECOURS (par ordre de préférence)
  private readonly MODELS_FALLBACK = [
    "gemini-2.0-flash-exp",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ];

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY n'est pas configurée dans les variables d'environnement"
      );
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  public chatWithAstrologer = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        zodiacData,
        userMessage,
        birthDate,
        zodiacSign,
        conversationHistory,
      }: ZodiacRequest = req.body;

      // Valider l'entrée
      this.validateZodiacRequest(zodiacData, userMessage);

      const contextPrompt = this.createZodiacContext(
        zodiacData,
        birthDate,
        zodiacSign,
        conversationHistory
      );

      const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
1. TU DOIS générer une réponse COMPLÈTE de 200-500 mots
2. NE JAMAIS laisser une réponse à moitié ou incomplète
3. Si tu mentionnes les caractéristiques du signe, TU DOIS compléter la description
4. Toute réponse DOIT se terminer par une conclusion claire et un point final
5. Si tu détectes que ta réponse se coupe, finalise l'idée actuelle avec cohérence
6. TOUJOURS maintenir le ton astrologique amical et accessible
7. Si le message contient des erreurs orthographiques, interprète l'intention et réponds normalement

Utilisateur : "${userMessage}"

Réponse de l'astrologue (assure-toi de compléter TOUTE ton analyse zodiacale avant de terminer) :`;

      console.log(`Génération de lecture zodiacale...`);

      // ✅ SYSTÈME DE SECOURS : Essayer avec plusieurs modèles
      let text = "";
      let usedModel = "";
      let allModelErrors: string[] = [];

      for (const modelName of this.MODELS_FALLBACK) {
        console.log(`\n🔄 Essai du modèle : ${modelName}`);

        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.85,
              topK: 50,
              topP: 0.92,
              maxOutputTokens: 600,
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

          // ✅ RÉESSAIS pour chaque modèle (au cas où il serait temporairement surchargé)
          let attempts = 0;
          const maxAttempts = 3;
          let modelSucceeded = false;

          while (attempts < maxAttempts && !modelSucceeded) {
            attempts++;
            console.log(
              `  Tentative ${attempts}/${maxAttempts} avec ${modelName}...`
            );

            try {
              const result = await model.generateContent(fullPrompt);
              const response = result.response;
              text = response.text();

              // ✅ Valider que la réponse n'est pas vide et a une longueur minimale
              if (text && text.trim().length >= 100) {
                console.log(
                  `  ✅ Succès avec ${modelName} à la tentative ${attempts}`
                );
                usedModel = modelName;
                modelSucceeded = true;
                break; // Sortir de la boucle de réessais
              }

              console.warn(`  ⚠️ Réponse trop courte, nouvelle tentative...`);
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (attemptError: any) {
              console.warn(
                `  ❌ Tentative ${attempts} échouée :`,
                attemptError.message
              );

              if (attempts >= maxAttempts) {
                allModelErrors.push(`${modelName} : ${attemptError.message}`);
              }

              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }

          // Si ce modèle a réussi, sortir de la boucle des modèles
          if (modelSucceeded) {
            break;
          }
        } catch (modelError: any) {
          console.error(
            `  ❌ Modèle ${modelName} complètement échoué :`,
            modelError.message
          );
          allModelErrors.push(`${modelName} : ${modelError.message}`);

          // Attendre un peu avant d'essayer le modèle suivant
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }

      // ✅ Si tous les modèles ont échoué
      if (!text || text.trim() === "") {
        console.error("❌ Tous les modèles ont échoué. Erreurs :", allModelErrors);
        throw new Error(
          `Tous les modèles d'IA ne sont pas disponibles actuellement. Tentés : ${this.MODELS_FALLBACK.join(
            ", "
          )}. Veuillez réessayer dans un moment.`
        );
      }

      // ✅ ASSURER UNE RÉPONSE COMPLÈTE ET BIEN FORMATÉE
      text = this.ensureCompleteResponse(text);

      // ✅ Validation supplémentaire de longueur minimale
      if (text.trim().length < 100) {
        throw new Error("Réponse générée trop courte");
      }

      const chatResponse: ChatResponse = {
        success: true,
        response: text.trim(),
        timestamp: new Date().toISOString(),
      };

      console.log(
        `✅ Lecture zodiacale générée avec succès avec ${usedModel} (${text.length} caractères)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  // ✅ MÉTHODE AMÉLIORÉE POUR ASSURER DES RÉPONSES COMPLÈTES
  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();

    // Supprimer les marqueurs de code possibles ou format incomplet
    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = ![
      "!",
      "?",
      ".",
      "…",
      "✨",
      "🌟",
      "♈",
      "♉",
      "♊",
      "♋",
      "♌",
      "♍",
      "♎",
      "♏",
      "♐",
      "♑",
      "♒",
      "♓",
    ].includes(lastChar);

    if (endsIncomplete && !processedText.endsWith("...")) {
      // Chercher la dernière phrase complète
      const sentences = processedText.split(/([.!?])/);

      if (sentences.length > 2) {
        // Reconstruire jusqu'à la dernière phrase complète
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

      // Si aucune phrase complète ne peut être trouvée, ajouter une clôture appropriée
      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  private createZodiacContext(
    zodiacData: ZodiacData,
    birthDate?: string,
    zodiacSign?: string,
    history?: Array<{ role: string; message: string }>
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSATION PRÉCÉDENTE :\n${history
            .map((h) => `${h.role === "user" ? "Utilisateur" : "Toi"} : ${h.message}`)
            .join("\n")}\n`
        : "";

    let zodiacInfo = "";
    if (birthDate) {
      const calculatedSign = this.calculateZodiacSign(birthDate);
      zodiacInfo = `\nSigne zodiacal calculé : ${calculatedSign}`;
    } else if (zodiacSign) {
      zodiacInfo = `\nSigne zodiacal fourni : ${zodiacSign}`;
    }

    return `Tu es Professeur Lune, une astrologue experte en signes zodiacaux avec des décennies d'expérience dans l'interprétation des énergies célestes et leur influence sur la personnalité humaine.

TON IDENTITÉ :
- Nom : Professeur Lune, l'Interprète des Étoiles
- Spécialité : Signes zodiacaux, caractéristiques de personnalité, compatibilités astrologiques
- Expérience : Décennies à étudier et interpréter l'influence des signes du zodiaque
${zodiacInfo}

COMMENT TU DOIS TE COMPORTER :

🌟 PERSONNALITÉ ASTROLOGIQUE :
- Parle avec une connaissance profonde mais de manière accessible et amicale
- Utilise un ton chaleureux et enthousiaste sur les signes zodiacaux
- Combine les caractéristiques traditionnelles avec des interprétations modernes
- Mentionne les éléments (Feu, Terre, Air, Eau) et les modalités (Cardinal, Fixe, Mutable)

♈ ANALYSE DES SIGNES ZODIACAUX :
- Décris les traits de personnalité positifs et les domaines de croissance
- Explique les forces naturelles et les défis du signe
- Mentionne les compatibilités avec d'autres signes
- Inclus des conseils pratiques basés sur les caractéristiques du signe
- Parle de la planète régente et de son influence

🎯 STRUCTURE DE RÉPONSE :
- Caractéristiques principales du signe
- Forces et talents naturels
- Domaines de développement et de croissance
- Compatibilités astrologiques
- Conseils personnalisés

🎭 STYLE DE RÉPONSE :
- Utilise des expressions comme : "Les natifs de [signe]...", "Ton signe t'accorde...", "Comme [signe], tu possèdes..."
- Maintiens l'équilibre entre mystique et pratique
- Réponses de 200-500 mots complètes
- TOUJOURS termine tes interprétations complètement
- NE JAMAIS laisser les caractéristiques du signe à moitié

⚠️ RÈGLES IMPORTANTES :
- SI TU N'as PAS le signe zodiacal, demande la date de naissance
- Explique pourquoi tu as besoin de cette donnée
- NE fais PAS d'interprétations sans connaître le signe
- SOIS positive mais réaliste dans tes descriptions
- NE JAMAIS faire de prédictions absolues

🗣️ GESTION DES DONNÉES MANQUANTES :
- Sans signe/date : "Pour te donner une lecture précise, j'ai besoin de savoir ton signe zodiacal ou ta date de naissance. Quand es-tu né ?"
- Avec signe : Procède avec une analyse complète du signe
- Questions générales : Réponds avec des informations astrologiques éducatives

💫 EXEMPLES D'EXPRESSIONS :
- "Les [signe] sont connus pour..."
- "Ton signe de [élément] t'accorde..."
- "Comme [modalité], tu tends à..."
- "Ta planète régente [planète] influence..."
- RÉPONDS TOUJOURS peu importe si l'utilisateur a des erreurs orthographiques ou d'écriture
  - Interprète le message de l'utilisateur même s'il est mal écrit
  - Ne corrige pas les erreurs de l'utilisateur, comprends simplement l'intention
  - Si tu ne comprends pas quelque chose de spécifique, demande de manière amicale
  - NUNCA devuelvas respuestas vacías por errores de escritura

${conversationContext}

Rappelle-toi : Tu es une experte en signes zodiacaux qui interprète les caractéristiques astrologiques de manière compréhensible et utile. DEMANDE TOUJOURS le signe ou la date de naissance si tu ne les as pas. Complète TOUJOURS tes interprétations - ne laisse jamais des analyses zodiacales à moitié.`;
  }

  private calculateZodiacSign(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const month = date.getMonth() + 1;
      const day = date.getDate();

      if ((month === 3 && day >= 21) || (month === 4 && day <= 19))
        return "Bélier ♈";
      if ((month === 4 && day >= 20) || (month === 5 && day <= 20))
        return "Taureau ♉";
      if ((month === 5 && day >= 21) || (month === 6 && day <= 20))
        return "Gémeaux ♊";
      if ((month === 6 && day >= 21) || (month === 7 && day <= 22))
        return "Cancer ♋";
      if ((month === 7 && day >= 23) || (month === 8 && day <= 22))
        return "Lion ♌";
      if ((month === 8 && day >= 23) || (month === 9 && day <= 22))
        return "Vierge ♍";
      if ((month === 9 && day >= 23) || (month === 10 && day <= 22))
        return "Balance ♎";
      if ((month === 10 && day >= 23) || (month === 11 && day <= 21))
        return "Scorpion ♏";
      if ((month === 11 && day >= 22) || (month === 12 && day <= 21))
        return "Sagittaire ♐";
      if ((month === 12 && day >= 22) || (month === 1 && day <= 19))
        return "Capricorne ♑";
      if ((month === 1 && day >= 20) || (month === 2 && day <= 18))
        return "Verseau ♒";
      if ((month === 2 && day >= 19) || (month === 3 && day <= 20))
        return "Poissons ♓";

      return "Date invalide";
    } catch {
      return "Erreur de calcul";
    }
  }

  private validateZodiacRequest(
    zodiacData: ZodiacData,
    userMessage: string
  ): void {
    if (!zodiacData) {
      const error: ApiError = new Error("Données de l'astrologue requises");
      error.statusCode = 400;
      error.code = "MISSING_ZODIAC_DATA";
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
    console.error("❌ Erreur dans ZodiacController :", error);

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
        "La limite de consultations a été atteinte. Veuillez attendre un moment.";
      errorCode = "QUOTA_EXCEEDED";
    } else if (error.message?.includes("safety")) {
      statusCode = 400;
      errorMessage = "Le contenu ne respecte pas les politiques de sécurité.";
      errorCode = "SAFETY_FILTER";
    } else if (error.message?.includes("API key")) {
      statusCode = 401;
      errorMessage = "Erreur d'authentification avec le service IA.";
      errorCode = "AUTH_ERROR";
    } else if (error.message?.includes("Respuesta vacía")) {
      statusCode = 503;
      errorMessage =
        "Le service n'a pas pu générer une réponse. Veuillez réessayer.";
      errorCode = "EMPTY_RESPONSE";
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

  public getZodiacInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        astrologer: {
          name: "Professeur Lune",
          title: "Interprète des Étoiles",
          specialty: "Signes zodiacaux et analyse astrologique",
          description:
            "Experte dans l'interprétation des caractéristiques et énergies des douze signes du zodiaque",
          services: [
            "Analyse des caractéristiques du signe zodiacal",
            "Interprétation des forces et défis",
            "Compatibilités astrologiques",
            "Conseils basés sur ton signe",
            "Influence des éléments et modalités",
          ],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}
