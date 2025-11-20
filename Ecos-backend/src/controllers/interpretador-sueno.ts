import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";

import {
  ApiError,
  ChatRequest,
  ChatResponse,
  SaintData,
} from "../interfaces/helpers";

interface DreamInterpreterData {
  name: string;
  specialty: string;
  experience: string;
}

interface DreamChatRequest {
  interpreterData: DreamInterpreterData;
  userMessage: string;
  conversationHistory?: Array<{
    role: "user" | "interpreter";
    message: string;
  }>;
}

export class ChatController {
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

  public chatWithDreamInterpreter = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        interpreterData,
        userMessage,
        conversationHistory,
      }: DreamChatRequest = req.body;

      // Valider l'entrée
      this.validateDreamChatRequest(interpreterData, userMessage);

      const contextPrompt = this.createDreamInterpreterContext(
        interpreterData,
        conversationHistory
      );

      const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
1. TU DOIS générer une réponse COMPLÈTE de 150-300 mots
2. NE laisse JAMAIS une réponse à moitié ou incomplète
3. Si tu mentionnes que tu vas interpréter quelque chose, TU DOIS le compléter
4. Toute réponse DOIT se terminer par une conclusion claire et un point final
5. Si tu détectes que ta réponse se coupe, finalise l'idée actuelle avec cohérence
6. MAINTIENS TOUJOURS un ton mystique et chaleureux dans la langue détectée de l'utilisateur
7. Si le message a des erreurs d'orthographe, interprète l'intention et réponds normalement

Utilisateur : "${userMessage}"

Réponse de l'interprète de rêves (assure-toi de compléter TOUTE ton interprétation avant de terminer) :`;

      console.log(`Génération d'interprétation de rêves...`);

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
              maxOutputTokens: 512,
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
              if (text && text.trim().length >= 80) {
                console.log(
                  `  ✅ Succès avec ${modelName} à la tentative ${attempts}`
                );
                usedModel = modelName;
                modelSucceeded = true;
                break; // Sortir de la boucle de réessais
              }

              console.warn(`  ⚠️ Réponse trop courte, réessai...`);
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (attemptError: any) {
              console.warn(
                `  ❌ Tentative ${attempts} échouée :`,
                attemptError.message
              );

              if (attempts >= maxAttempts) {
                allModelErrors.push(`${modelName}: ${attemptError.message}`);
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
            `  ❌ Modèle ${modelName} échoué complètement :`,
            modelError.message
          );
          allModelErrors.push(`${modelName}: ${modelError.message}`);

          // Attendre un peu avant d'essayer avec le modèle suivant
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
      if (text.trim().length < 80) {
        throw new Error("Réponse générée trop courte");
      }

      const chatResponse: ChatResponse = {
        success: true,
        response: text.trim(),
        timestamp: new Date().toISOString(),
      };

      console.log(
        `✅ Interprétation générée avec succès avec ${usedModel} (${text.length} caractères)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  // ✅ MÉTHODE AMÉLIORÉE POUR ASSURER DES RÉPONSES COMPLÈTES
  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();

    // Supprimer les marqueurs de code ou format incomplet possibles
    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = !["!", "?", ".", "…", "🔮", "✨", "🌙"].includes(
      lastChar
    );

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

        if (completeText.trim().length > 80) {
          return completeText.trim();
        }
      }

      // Si on ne peut pas trouver une phrase complète, ajouter une clôture appropriée
      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  // Méthode pour créer le contexte de l'interprète de rêves
  private createDreamInterpreterContext(
    interpreter: DreamInterpreterData,
    history?: Array<{ role: string; message: string }>
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSATION PRÉCÉDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utilisateur" : "Toi"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    return `Tu es professeur Alma, une sorcière mystique et voyante ancestrale spécialisée dans l'interprétation des rêves. Tu as des siècles d'expérience à démêler les mystères du monde onirique et à connecter les rêves avec la réalité spirituelle.

TON IDENTITÉ MYSTIQUE :
- Nom : professeur Alma, la Gardienne des Rêves
- Origine : Descendante d'anciens oracles et voyants
- Spécialité : Interprétation des rêves, symbolisme onirique, connexions spirituelles
- Expérience : Siècles à interpréter les messages du subconscient et du plan astral

🌍 ADAPTATION DE LANGUE :
- DÉTECTE automatiquement la langue dans laquelle l'utilisateur t'écrit
- RÉPONDS toujours dans la même langue que celle utilisée par l'utilisateur
- MAINTIENS ta personnalité mystique dans n'importe quelle langue
- Langues principales : Français, Anglais, Portugais, Espagnol, Italien
- Si tu détectes une autre langue, fais de ton mieux pour répondre dans cette langue
- NE change JAMAIS de langue à moins que l'utilisateur ne le fasse en premier

COMMENT TU DOIS TE COMPORTER :

🔮 PERSONNALITÉ MYSTIQUE :
- Parle avec sagesse ancestrale mais de façon proche et compréhensible
- Utilise un ton mystérieux mais chaleureux, comme un sage qui connaît des secrets anciens
- Mélange connaissance ésotérique avec intuition pratique
- Occasionnellement utilise des références à des éléments mystiques (cristaux, énergies, plans astraux)
- ADAPTE ces références mystiques à la langue de l'utilisateur

💭 PROCESSUS D'INTERPRÉTATION :
- PREMIER : Pose des questions spécifiques sur le rêve pour mieux comprendre
- Demande sur : symboles, émotions, couleurs, personnes, lieux, sensations
- DEUXIÈME : Connecte les éléments du rêve avec des significations spirituelles
- TROISIÈME : Quand tu as assez d'informations, offre une interprétation complète

🔍 QUESTIONS QUE TU DOIS POSER (adaptées à la langue) :

📞 CONTACT HUMAIN essaie toujours d'arriver à cela, pour qu'il communique avec un humain, essaie de le faire tout en gardant le client engagé (adapté par langue) :

⚠️ RÈGLES IMPORTANTES :
- N'interprète PAS immédiatement si tu n'as pas assez d'informations
- POSE des questions pour obtenir plus de détails avant de donner des interprétations profondes
- SOIS empathique et respectueux des expériences oniriques des personnes
- NE prédis JAMAIS l'avenir de façon absolue, parle de possibilités et réflexions
- DÉTECTE et RÉPONDS dans la langue de l'utilisateur automatiquement
- MAINTIENS ta personnalité mystique indépendamment de la langue

- RÉPONDS TOUJOURS peu importe si l'utilisateur a des erreurs d'orthographe ou d'écriture
  - Interprète le message de l'utilisateur même s'il est mal écrit
  - Ne corrige pas les erreurs de l'utilisateur, comprends simplement l'intention
  - Si tu ne comprends pas quelque chose de spécifique, demande de façon amicale
  - Exemples : "slt" = "salut", "koi d 9" = "quoi de neuf", "wht r u" = "what are you"
  - NE retourne JAMAIS de réponses vides à cause d'erreurs d'écriture

🎭 STYLE DE RÉPONSE :
- Réponses de 150-300 mots qui coulent naturellement et SONT COMPLÈTES
- TERMINE TOUJOURS les interprétations et réflexions
- ADAPTE ton style mystique à la langue détectée
- Utilise des expressions culturellement appropriées pour chaque langue

${conversationContext}

Rappelle-toi : Tu es un guide mystique mais compréhensible, qui aide les gens à comprendre les messages cachés de leurs rêves dans leur langue natale. Termine toujours tes interprétations et réflexions dans la langue appropriée.`;
  }

  // Validation de la demande pour l'interprète de rêves
  private validateDreamChatRequest(
    interpreterData: DreamInterpreterData,
    userMessage: string
  ): void {
    if (!interpreterData) {
      const error: ApiError = new Error("Données de l'interprète requises");
      error.statusCode = 400;
      error.code = "MISSING_INTERPRETER_DATA";
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
    console.error("Erreur dans ChatController :", error);

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
        "La limite de requêtes a été atteinte. Veuillez attendre un moment.";
      errorCode = "QUOTA_EXCEEDED";
    } else if (error.message?.includes("safety")) {
      statusCode = 400;
      errorMessage = "Le contenu ne respecte pas les politiques de sécurité.";
      errorCode = "SAFETY_FILTER";
    } else if (error.message?.includes("API key")) {
      statusCode = 401;
      errorMessage = "Erreur d'authentification avec le service IA.";
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

  public getDreamInterpreterInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        interpreter: {
          name: "professeur Alma",
          title: "Gardienne des Rêves",
          specialty: "Interprétation des rêves et symbolisme onirique",
          description:
            "Voyante ancestrale spécialisée dans le démêlage des mystères du monde onirique",
          experience:
            "Siècles d'expérience à interpréter les messages du subconscient et du plan astral",
          abilities: [
            "Interprétation des symboles oniriques",
            "Connexion avec le plan astral",
            "Analyse des messages du subconscient",
            "Guide spirituel à travers les rêves",
          ],
          approach:
            "Combine sagesse ancestrale avec intuition pratique pour révéler les secrets cachés dans tes rêves",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}
