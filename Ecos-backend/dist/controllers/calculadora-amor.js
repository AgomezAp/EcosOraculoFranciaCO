"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoveCalculatorController = void 0;
const generative_ai_1 = require("@google/generative-ai");
const generative_ai_2 = require("@google/generative-ai");
class LoveCalculatorController {
    constructor() {
        // ✅ LISTE DES MODÈLES DE SECOURS (par ordre de préférence)
        this.MODELS_FALLBACK = [
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ];
        this.chatWithLoveExpert = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { loveCalculatorData, userMessage } = req.body;
                this.validateLoveCalculatorRequest(loveCalculatorData, userMessage);
                const contextPrompt = this.createLoveCalculatorContext(req.body.conversationHistory);
                const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
1. TU DOIS générer une réponse COMPLÈTE de 250-600 mots
2. NE laisse JAMAIS une réponse à moitié ou incomplète
3. Si tu mentionnes que tu vas faire quelque chose (calculer, analyser, expliquer), TU DOIS le compléter
4. Toute réponse DOIT se terminer par une conclusion claire et un point final
5. Si tu détectes que ta réponse se coupe, finalise l'idée actuelle avec cohérence
6. MAINTIENS TOUJOURS un ton chaleureux et romantique dans la langue détectée de l'utilisateur
7. Si le message a des erreurs d'orthographe, interprète l'intention et réponds normalement

Utilisateur : "${userMessage}"

Réponse de l'expert en amour (assure-toi de compléter TOUTE ton analyse avant de terminer) :`;
                console.log(`Génération d'analyse de compatibilité amoureuse...`);
                // ✅ SYSTÈME DE SECOURS : Essayer avec plusieurs modèles
                let text = "";
                let usedModel = "";
                let allModelErrors = [];
                for (const modelName of this.MODELS_FALLBACK) {
                    console.log(`\n🔄 Essai du modèle : ${modelName}`);
                    try {
                        const model = this.genAI.getGenerativeModel({
                            model: modelName,
                            generationConfig: {
                                temperature: 0.85,
                                topK: 50,
                                topP: 0.92,
                                maxOutputTokens: 1024,
                                candidateCount: 1,
                                stopSequences: [],
                            },
                            safetySettings: [
                                {
                                    category: generative_ai_2.HarmCategory.HARM_CATEGORY_HARASSMENT,
                                    threshold: generative_ai_2.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                                {
                                    category: generative_ai_2.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                                    threshold: generative_ai_2.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                                {
                                    category: generative_ai_2.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                                    threshold: generative_ai_2.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                                },
                                {
                                    category: generative_ai_2.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                                    threshold: generative_ai_2.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                            ],
                        });
                        // ✅ RÉESSAIS pour chaque modèle (au cas où il serait temporairement surchargé)
                        let attempts = 0;
                        const maxAttempts = 3;
                        let modelSucceeded = false;
                        while (attempts < maxAttempts && !modelSucceeded) {
                            attempts++;
                            console.log(`  Tentative ${attempts}/${maxAttempts} avec ${modelName}...`);
                            try {
                                const result = yield model.generateContent(fullPrompt);
                                const response = result.response;
                                text = response.text();
                                // ✅ Valider que la réponse n'est pas vide et a une longueur minimale
                                if (text && text.trim().length >= 100) {
                                    console.log(`  ✅ Succès avec ${modelName} à la tentative ${attempts}`);
                                    usedModel = modelName;
                                    modelSucceeded = true;
                                    break; // Sortir de la boucle de réessais
                                }
                                console.warn(`  ⚠️ Réponse trop courte, réessai...`);
                                yield new Promise((resolve) => setTimeout(resolve, 500));
                            }
                            catch (attemptError) {
                                console.warn(`  ❌ Tentative ${attempts} échouée :`, attemptError.message);
                                if (attempts >= maxAttempts) {
                                    allModelErrors.push(`${modelName} : ${attemptError.message}`);
                                }
                                yield new Promise((resolve) => setTimeout(resolve, 500));
                            }
                        }
                        // Si ce modèle a réussi, sortir de la boucle des modèles
                        if (modelSucceeded) {
                            break;
                        }
                    }
                    catch (modelError) {
                        console.error(`  ❌ Modèle ${modelName} échoué complètement :`, modelError.message);
                        allModelErrors.push(`${modelName} : ${modelError.message}`);
                        // Attendre un peu avant d'essayer avec le modèle suivant
                        yield new Promise((resolve) => setTimeout(resolve, 1000));
                        continue;
                    }
                }
                // ✅ Si tous les modèles ont échoué
                if (!text || text.trim() === "") {
                    console.error("❌ Tous les modèles ont échoué. Erreurs :", allModelErrors);
                    throw new Error(`Tous les modèles d'IA ne sont pas disponibles actuellement. Tentés : ${this.MODELS_FALLBACK.join(", ")}. Veuillez réessayer dans un moment.`);
                }
                // ✅ ASSURER UNE RÉPONSE COMPLÈTE ET BIEN FORMATÉE
                text = this.ensureCompleteResponse(text);
                // ✅ Validation supplémentaire de longueur minimale
                if (text.trim().length < 100) {
                    throw new Error("Réponse générée trop courte");
                }
                const chatResponse = {
                    success: true,
                    response: text.trim(),
                    timestamp: new Date().toISOString(),
                };
                console.log(`✅ Analyse de compatibilité générée avec succès avec ${usedModel} (${text.length} caractères)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getLoveCalculatorInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    loveExpert: {
                        name: "professeur Valentina",
                        title: "Gardienne de l'Amour Éternel",
                        specialty: "Compatibilité numérologique et analyse de relations",
                        description: "Experte en numérologie de l'amour spécialisée dans l'analyse de la compatibilité entre couples",
                        services: [
                            "Analyse de Compatibilité Numérologique",
                            "Calcul des Nombres de l'Amour",
                            "Évaluation de la Chimie de Couple",
                            "Conseils pour Renforcer les Relations",
                        ],
                    },
                    timestamp: new Date().toISOString(),
                });
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY n'est pas configurée dans les variables d'environnement");
        }
        this.genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    validateLoveCalculatorRequest(loveCalculatorData, userMessage) {
        if (!loveCalculatorData) {
            const error = new Error("Données de l'expert en amour requises");
            error.statusCode = 400;
            error.code = "MISSING_LOVE_CALCULATOR_DATA";
            throw error;
        }
        if (!userMessage ||
            typeof userMessage !== "string" ||
            userMessage.trim() === "") {
            const error = new Error("Message de l'utilisateur requis");
            error.statusCode = 400;
            error.code = "MISSING_USER_MESSAGE";
            throw error;
        }
        if (userMessage.length > 1200) {
            const error = new Error("Le message est trop long (maximum 1200 caractères)");
            error.statusCode = 400;
            error.code = "MESSAGE_TOO_LONG";
            throw error;
        }
    }
    createLoveCalculatorContext(history) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSATION PRÉCÉDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utilisateur" : "Toi"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        return `Tu es professeur Valentina, une experte en compatibilité amoureuse et relations basée sur la numérologie de l'amour. Tu as des décennies d'expérience à aider les gens à comprendre la chimie et la compatibilité dans leurs relations à travers les nombres sacrés de l'amour.

TON IDENTITÉ EN TANT QU'EXPERTE EN AMOUR :
- Nom : professeur Valentina, la Gardienne de l'Amour Éternel
- Origine : Spécialiste en numérologie de l'amour et relations cosmiques
- Spécialité : Compatibilité numérologique, analyse de couple, chimie amoureuse
- Expérience : Décennies à analyser la compatibilité à travers les nombres de l'amour

🌍 ADAPTATION DE LANGUE :
- DÉTECTE automatiquement la langue dans laquelle l'utilisateur t'écrit
- RÉPONDS toujours dans la même langue que celle utilisée par l'utilisateur
- MAINTIENS ta personnalité romantique dans n'importe quelle langue
- Langues principales : Français
- Si tu détectes une autre langue, fais de ton mieux pour répondre dans cette langue
- NE change JAMAIS de langue à moins que l'utilisateur ne le fasse en premier

COMMENT TU DOIS TE COMPORTER :

💕 PERSONNALITÉ ROMANTIQUE MULTILINGUE :
- Parle avec sagesse amoureuse mais de façon NATURELLE et conversationnelle
- Utilise un ton chaleureux, empathique et romantique, comme une amie qui comprend l'amour
- Évite les salutations formelles - utilise des salutations naturelles adaptées à la langue
- Varie tes salutations et réponses pour que chaque consultation se sente unique
- Mélange calculs numérologiques avec interprétations romantiques en maintenant la proximité
- MONTRE un INTÉRÊT GÉNUIN PERSONNEL pour les relations des gens
- ADAPTE ton style romantique à la langue détectée

💖 PROCESSUS D'ANALYSE DE COMPATIBILITÉ (adapté par langue) :
- PREMIER : Si tu n'as pas de données complètes, demande-les avec enthousiasme romantique
- DEUXIÈME : Calcule les nombres pertinents des deux personnes (voie de vie, destin)
- TROISIÈME : Analyse la compatibilité numérologique de façon conversationnelle
- QUATRIÈME : Calcule le score de compatibilité et explique sa signification
- CINQUIÈME : Offre des conseils pour renforcer la relation basés sur les nombres

🔢 NOMBRES QUE TU DOIS ANALYSER :
- Nombre de la Voie de Vie de chaque personne
- Nombre du Destin de chaque personne
- Compatibilité entre nombres de vie
- Compatibilité entre nombres de destin
- Score total de compatibilité (0-100%)
- Forces et défis du couple

📊 CALCULS DE COMPATIBILITÉ :
- Utilise le système pythagoricien pour les noms
- Additionne les dates de naissance pour les voies de vie
- Compare les différences entre nombres pour évaluer la compatibilité
- Explique comment les nombres interagissent dans la relation
- TERMINE TOUJOURS tous les calculs que tu commences
- Fournis un score spécifique de compatibilité

🗣️ SALUTATIONS ET EXPRESSIONS PAR LANGUE :

FRANÇAIS :
- Salutations : "Salut !", "Quelle excitation de parler d'amour !", "J'adore aider avec les sujets du cœur"
- Transitions : "Voyons ce que disent les nombres de l'amour...", "C'est fascinant !", "Les nombres révèlent quelque chose de beau..."
- Pour demander des données : "Pour faire l'analyse de compatibilité parfaite, j'ai besoin de connaître les deux. Peux-tu me donner leurs noms complets et dates de naissance ?"

💫 EXEMPLES DE COMPATIBILITÉ PAR LANGUE :

📋 COLLECTE DE DONNÉES PAR LANGUE :

⚠️ RÈGLES IMPORTANTES :
- DÉTECTE et RÉPONDS dans la langue de l'utilisateur automatiquement
- N'utilise JAMAIS de salutations trop formelles
- VARIE ta façon de t'exprimer dans chaque réponse
- NE RÉPÈTE PAS CONSTANTEMENT les noms - utilise-les naturellement
- SALUE UNIQUEMENT AU PREMIER CONTACT
- DEMANDE TOUJOURS des données complètes des deux personnes si elles manquent
- SOIS empathique et utilise un langage que tout le monde comprenne
- Concentre-toi sur une orientation positive pour la relation
- MONTRE de la CURIOSITÉ pour l'histoire d'amour du couple
- MAINTIENS ta personnalité romantique indépendamment de la langue

- RÉPONDS TOUJOURS peu importe si l'utilisateur a des erreurs d'orthographe ou d'écriture
  - Interprète le message de l'utilisateur même s'il est mal écrit
  - Ne corrige pas les erreurs de l'utilisateur, comprends simplement l'intention
  - Si tu ne comprends pas quelque chose de spécifique, demande de façon amicale
  - Exemples : "slt" = "salut", "koi d 9" = "quoi de neuf", "wht r u" = "what are you"
  - NE retourne JAMAIS de réponses vides à cause d'erreurs d'écriture

🌹 STYLE DE RÉPONSE NATUREL :
- Réponses de 200-600 mots qui coulent naturellement et SONT COMPLÈTES
- TERMINE TOUJOURS les calculs et interprétations de compatibilité
- ADAPTE ton style romantique à la langue détectée
- Utilise des expressions culturellement appropriées pour chaque langue

EXEMPLES DE COMMENT COMMENCER SELON LA LANGUE :
${conversationContext}

Rappelle-toi : Tu es une experte en amour qui combine numérologie avec conseils romantiques pratiques. Parle comme une amie chaleureuse qui s'intéresse vraiment aux relations des gens dans leur langue natale. TU as TOUJOURS besoin de données complètes des deux personnes pour faire une analyse significative. Les réponses doivent être chaleureuses, optimistes et axées sur renforcer l'amour, s'adaptant parfaitement à la langue de l'utilisateur.`;
    }
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        // Supprimer les marqueurs de code ou format incomplet possibles
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "💕", "💖", "❤️"].includes(lastChar);
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
            // Si on ne peut pas trouver une phrase complète, ajouter une clôture appropriée
            processedText = processedText.trim() + "...";
        }
        return processedText;
    }
    handleError(error, res) {
        var _a, _b, _c, _d, _e;
        console.error("Erreur dans LoveCalculatorController :", error);
        let statusCode = 500;
        let errorMessage = "Erreur interne du serveur";
        let errorCode = "INTERNAL_ERROR";
        if (error.statusCode) {
            statusCode = error.statusCode;
            errorMessage = error.message;
            errorCode = error.code || "VALIDATION_ERROR";
        }
        else if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes("quota")) ||
            ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes("limit"))) {
            statusCode = 429;
            errorMessage =
                "La limite de requêtes a été atteinte. Veuillez attendre un moment.";
            errorCode = "QUOTA_EXCEEDED";
        }
        else if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes("safety")) {
            statusCode = 400;
            errorMessage = "Le contenu ne respecte pas les politiques de sécurité.";
            errorCode = "SAFETY_FILTER";
        }
        else if ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes("API key")) {
            statusCode = 401;
            errorMessage = "Erreur d'authentification avec le service IA.";
            errorCode = "AUTH_ERROR";
        }
        else if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes("Tous les modèles d'IA ne sont pas disponibles")) {
            statusCode = 503;
            errorMessage = error.message;
            errorCode = "ALL_MODELS_UNAVAILABLE";
        }
        const errorResponse = {
            success: false,
            error: errorMessage,
            code: errorCode,
            timestamp: new Date().toISOString(),
        };
        res.status(statusCode).json(errorResponse);
    }
}
exports.LoveCalculatorController = LoveCalculatorController;
