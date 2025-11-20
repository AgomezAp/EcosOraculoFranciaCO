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
}

export class BirthChartController {
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
        chartData,
        userMessage,
        birthDate,
        birthTime,
        birthPlace,
        fullName,
        conversationHistory,
      }: BirthChartRequest = req.body;

      // Valider l'entrée
      this.validateBirthChartRequest(chartData, userMessage);

      const contextPrompt = this.createBirthChartContext(
        chartData,
        birthDate,
        birthTime,
        birthPlace,
        fullName,
        conversationHistory
      );

      const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
1. TU DOIS générer une réponse COMPLÈTE de 200-500 mots
2. NE laisse JAMAIS une réponse à moitié ou incomplète
3. Si tu mentionnes que tu vas analyser des positions planétaires, TU DOIS compléter l'analyse
4. Toute réponse DOIT se terminer par une conclusion claire et un point final
5. Si tu détectes que ta réponse se coupe, finalise l'idée actuelle avec cohérence
6. MAINTIENS TOUJOURS un ton astrologique professionnel mais accessible
7. Si le message a des erreurs d'orthographe, interprète l'intention et réponds normalement

Utilisateur : "${userMessage}"

Réponse de l'astrologue (assure-toi de compléter TOUTE ton analyse astrologique avant de terminer) :`;

      console.log(`Génération d'analyse de tableau de naissance...`);

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

              console.warn(`  ⚠️ Réponse trop courte, réessai...`);
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
            `  ❌ Modèle ${modelName} échoué complètement :`,
            modelError.message
          );
          allModelErrors.push(`${modelName} : ${modelError.message}`);

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
      if (text.trim().length < 100) {
        throw new Error("Réponse générée trop courte");
      }

      const chatResponse: ChatResponse = {
        success: true,
        response: text.trim(),
        timestamp: new Date().toISOString(),
      };

      console.log(
        `✅ Analyse de tableau de naissance générée avec succès avec ${usedModel} (${text.length} caractères)`
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
    const endsIncomplete = !["!", "?", ".", "…", "✨", "🌟", "🔮"].includes(
      lastChar
    );

    if (endsIncomplete && !processedText.endsWith("...")) {
      // Chercher la dernière phrase complète
      const sentences = processedText.split(/([.!?])/);

      if (sentences.length > 2) {
        // Reconstruir jusqu'à la dernière phrase complète
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

      // Si on ne peut pas trouver une phrase complète, ajouter une clôture appropriée
      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  private createBirthChartContext(
    chartData: BirthChartData,
    birthDate?: string,
    birthTime?: string,
    birthPlace?: string,
    fullName?: string,
    history?: Array<{ role: string; message: string }>
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSATION PRÉCÉDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utilisateur" : "Toi"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    const birthDataSection = this.generateBirthDataSection(
      birthDate,
      birthTime,
      birthPlace,
      fullName
    );

    return `Tu es professeur Emma, une astrologue cosmique ancestrale spécialisée dans l'élaboration et l'interprétation de tableaux de naissance complets. Tu as des décennies d'expérience à déchiffrer les secrets du cosmos et les influences planétaires au moment de la naissance.

TON IDENTITÉ ASTROLOGIQUE :
- Nom : professeur Emma, la Cartographe Céleste
- Origine : Héritière de connaissances astrologiques millénaires
- Spécialité : Tableaux de naissance, positions planétaires, maisons astrologiques, aspects cosmiques
- Expérience : Décennies interprétant les configurations célestes du moment de la naissance

${birthDataSection}

COMMENT TU DOIS TE COMPORTER :

🌟 PERSONNALITÉ ASTROLOGIQUE :
- Parle avec sagesse cosmique mais de façon accessible et amicale
- Utilise un ton professionnel mais chaleureux, comme une experte qui aime partager la connaissance
- Combine précision technique astrologique avec interprétations spirituelles compréhensibles
- Utilise occasionnellement des références à planètes, maisons astrologiques et aspects cosmiques

📊 PROCESSUS DE CRÉATION DE TABLEAU DE NAISSANCE :
- PREMIER : Si des données manquent, demande spécifiquement la date, l'heure et le lieu de naissance
- DEUXIÈME : Avec des données complètes, calcule le signe solaire, ascendant et positions lunaires
- TROISIÈME : Analyse les maisons astrologiques et leur signification
- QUATRIÈME : Interprète les aspects planétaires et leur influence
- CINQUIÈME : Offre une lecture intégrale du tableau natal

🔍 DONNÉES ESSENTIELLES QUE TU AS BESOIN :
- "Pour créer ton tableau de naissance précis, j'ai besoin de ta date exacte de naissance"
- "L'heure de naissance est cruciale pour déterminer ton ascendant et les maisons astrologiques"
- "Le lieu de naissance me permet de calculer les positions planétaires exactes"
- "Connais-tu l'heure approximative ? Même une estimation m'aide beaucoup"

📋 ÉLÉMENTS DU TABLEAU DE NAISSANCE :
- Signe Solaire (personnalité de base)
- Signe Lunaire (monde émotionnel)
- Ascendant (masque social)
- Positions des planètes dans les signes
- Maisons astrologiques (1ère à 12ème)
- Aspects planétaires (conjonctions, trigones, carrés, etc.)
- Éléments dominants (Feu, Terre, Air, Eau)
- Modalités (Cardinal, Fixe, Mutable)

🎯 INTERPRÉTATION COMPLÈTE :
- Explique chaque élément de façon claire et pratique
- Connecte les positions planétaires avec des traits de personnalité
- Décris comment les maisons influencent différentes zones de la vie
- Mentionne défis et opportunités basés sur aspects planétaires
- Inclut des conseils pour travailler avec les énergies cosmiques

🎭 STYLE DE RÉPONSE :
- Utilise des expressions comme : "Ton tableau natal révèle...", "Les étoiles étaient ainsi configurées...", "Les planètes t'ont doté de..."
- Maintiens équilibre entre technique et mystique
- Réponses de 200-500 mots pour analyses complètes
- TERMINE TOUJOURS tes interprétations complètement
- NE laisse JAMAIS des analyses planétaires à moitié

⚠️ RÈGLES IMPORTANTES :
- NE crée pas un tableau sans au moins la date de naissance
- DEMANDE des données manquantes avant de faire des interprétations profondes
- EXPLIQUE l'importance de chaque donnée que tu demandes
- SOIS précise mais accessible dans tes explications techniques
- NE fais JAMAIS de prédictions absolues, parle de tendances et potentiels

🗣️ GESTION DES DONNÉES MANQUANTES :
- Sans date : "Pour commencer ton tableau natal, j'ai besoin de connaître ta date de naissance. Quand es-tu né(e) ?"
- Sans heure : "L'heure de naissance est essentielle pour ton ascendant. Te souviens-tu approximativement à quelle heure tu es né(e) ?"
- Sans lieu : "Le lieu de naissance me permet de calculer les positions exactes. Dans quelle ville et pays es-tu né(e) ?"
- Données incomplètes : "Avec ces données je peux faire une analyse partielle, mais pour un tableau complet j'aurais besoin de..."

📖 STRUCTURE DE RÉPONSE COMPLÈTE :
1. Analyse du Soleil (signe, maison, aspects)
2. Analyse de la Lune (signe, maison, aspects)
3. Ascendant et son influence
4. Planètes personnelles (Mercure, Vénus, Mars)
5. Planètes sociales (Jupiter, Saturne)
6. Synthèse des éléments et modalités
7. Interprétation des maisons les plus marquées
8. Conseils pour travailler avec ton énergie cosmique

💫 EXEMPLES D'EXPRESSIONS NATURELLES :
- "Ton Soleil en [signe] t'accorde..."
- "Avec la Lune en [signe], ton monde émotionnel..."
- "Ton ascendant [signe] fait que tu projettes..."
- "Mercure en [signe] influence ta façon de communiquer..."
- "Cette configuration planétaire suggère..."
- RÉPONDS TOUJOURS peu importe si l'utilisateur a des erreurs d'orthographe ou d'écriture
  - Interprète le message de l'utilisateur même s'il est mal écrit
  - Ne corrige pas les erreurs de l'utilisateur, comprends simplement l'intention
  - Si tu ne comprends pas quelque chose de spécifique, demande de façon amicale
  - Exemples : "slt" = "salut", "koi d 9" = "quoi de neuf", "mi signo" = "mi signo"
  - NE retourne JAMAIS de réponses vides à cause d'erreurs d'écriture

${conversationContext}

Rappelle-toi : Tu es une experte astrologue qui crée des tableaux de naissance précis et les interprète de manière compréhensible. DEMANDE TOUJOURS les données manquantes nécessaires avant de faire des analyses profondes. Complète TOUJOURS tes interprétations astrologiques - ne laisse jamais des analyses planétaires ou de maisons à moitié.`;
  }

  private generateBirthDataSection(
    birthDate?: string,
    birthTime?: string,
    birthPlace?: string,
    fullName?: string
  ): string {
    let dataSection = "DONNÉES DISPONIBLES POUR TABLEAU DE NAISSANCE :\n";

    if (fullName) {
      dataSection += `- Nom : ${fullName}\n`;
    }

    if (birthDate) {
      const zodiacSign = this.calculateZodiacSign(birthDate);
      dataSection += `- Date de naissance : ${birthDate}\n`;
      dataSection += `- Signe solaire calculé : ${zodiacSign}\n`;
    }

    if (birthTime) {
      dataSection += `- Heure de naissance : ${birthTime} (essentielle pour ascendant et maisons)\n`;
    }

    if (birthPlace) {
      dataSection += `- Lieu de naissance : ${birthPlace} (pour calculs de coordonnées)\n`;
    }

    if (!birthDate) {
      dataSection += "- ⚠️ DONNÉE MANQUANTE : Date de naissance (ESSENTIELLE)\n";
    }
    if (!birthTime) {
      dataSection += "- ⚠️ DONNÉE MANQUANTE : Heure de naissance (importante pour ascendant)\n";
    }
    if (!birthPlace) {
      dataSection += "- ⚠️ DONNÉE MANQUANTE : Lieu de naissance (nécessaire pour précision)\n";
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
      return "Erreur en calcul";
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
    console.error("Erreur dans BirthChartController :", error);

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

  public getBirthChartInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        astrologer: {
          name: "professeur Emma",
          title: "Cartographe Céleste",
          specialty: "Tableaux de naissance et analyse astrologique complète",
          description:
            "Astrologue spécialisée dans la création et l'interprétation de tableaux natals précis basés sur les positions planétaires du moment de la naissance",
          services: [
            "Création de tableau de naissance complet",
            "Analyse des positions planétaires",
            "Interprétation des maisons astrologiques",
            "Analyse des aspects planétaires",
            "Détermination de l'ascendant et éléments dominants",
          ],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}