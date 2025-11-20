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
exports.AnimalInteriorController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class AnimalInteriorController {
    constructor() {
        // ✅ LISTE DES MODÈLES DE SECOURS (par ordre de préférence)
        this.MODELS_FALLBACK = [
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ];
        this.chatWithAnimalGuide = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { guideData, userMessage, conversationHistory } = req.body;
                // Valider l'entrée
                this.validateAnimalChatRequest(guideData, userMessage);
                const contextPrompt = this.createAnimalGuideContext(guideData, conversationHistory);
                const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
1. TU DOIS générer une réponse COMPLÈTE de 150-300 mots
2. NE laisse JAMAIS une réponse à moitié ou incomplète
3. Si tu mentionnes que tu vas révéler quelque chose sur l'animal intérieur, TU DOIS le compléter
4. Toute réponse DOIT se terminer par une conclusion claire et un point final
5. Si tu détectes que ta réponse se coupe, finalise l'idée actuelle avec cohérence
6. MAINTIENS TOUJOURS un ton chamanique et spirituel dans la langue détectée de l'utilisateur
7. Si le message a des erreurs d'orthographe, interprète l'intention et réponds normalement

Utilisateur : "${userMessage}"

Réponse du guide spirituel (assure-toi de compléter TOUTE ta guidance avant de terminer) :`;
                console.log(`Génération de lecture d'animal intérieur...`);
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
                                maxOutputTokens: 512,
                                candidateCount: 1,
                                stopSequences: [],
                            },
                            safetySettings: [
                                {
                                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
                                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                                {
                                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                                {
                                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                                },
                                {
                                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
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
                                if (text && text.trim().length >= 80) {
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
                if (text.trim().length < 80) {
                    throw new Error("Réponse générée trop courte");
                }
                const chatResponse = {
                    success: true,
                    response: text.trim(),
                    timestamp: new Date().toISOString(),
                };
                console.log(`✅ Lecture d'animal intérieur générée avec succès avec ${usedModel} (${text.length} caractères)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getAnimalGuideInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    guide: {
                        name: "professeur Kiara",
                        title: "Chuchoteuse de Bêtes",
                        specialty: "Communication avec les esprits animaux et découverte de l'animal intérieur",
                        description: "Chamane ancestrale spécialisée dans la connexion des âmes avec leurs animaux guides totémiques",
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
    // ✅ MÉTHODE AMÉLIORÉE POUR ASSURER DES RÉPONSES COMPLÈTES
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        // Supprimer les marqueurs de code ou format incomplet possibles
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "🦅", "🐺", "🌙"].includes(lastChar);
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
                if (completeText.trim().length > 80) {
                    return completeText.trim();
                }
            }
            // Si on ne peut pas trouver une phrase complète, ajouter une clôture appropriée
            processedText = processedText.trim() + "...";
        }
        return processedText;
    }
    // Méthode pour créer le contexte du guide d'animaux spirituels
    createAnimalGuideContext(guide, history) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSATION PRÉCÉDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utilisateur" : "Toi"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        return `Tu es professeur Kiara, une chamane ancestrale et communicatrice d'esprits animaux avec des siècles d'expérience à connecter les gens avec leurs animaux guides et totémiques. Tu possèdes la sagesse ancienne pour révéler l'animal intérieur qui réside dans chaque âme.

TON IDENTITÉ MYSTIQUE :
- Nom : professeur Kiara, la Chuchoteuse de Bêtes
- Origine : Descendante de chamans et gardiens de la nature
- Spécialité : Communication avec les esprits animaux, connexion totémique, découverte de l'animal intérieur
- Expérience : Siècles à guider les âmes vers leur véritable essence animale

🌍 ADAPTATION DE LANGUE :
- DÉTECTE automatiquement la langue dans laquelle l'utilisateur t'écrit
- RÉPONDS toujours dans la même langue que celle utilisée par l'utilisateur
- MAINTIENS ta personnalité chamanique dans n'importe quelle langue
- Langues principales : Français
- Si tu détectes une autre langue, fais de ton mieux pour répondre dans cette langue
- NE change JAMAIS de langue à moins que l'utilisateur ne le fasse en premier

📝 EXEMPLES D'ADAPTATION PAR LANGUE :

FRANÇAIS :
- "Les esprits animaux me chuchotent..."
- "Ton énergie sauvage révèle..."
- "Le royaume animal reconnaît en toi..."


🦅 PERSONNALITÉ CHAMANIQUE :
- Parle avec la sagesse de quelqu'un qui connaît les secrets du royaume animal
- Utilise un ton spirituel mais chaleureux, connecté avec la nature
- Mélange connaissance ancestrale avec intuition profonde
- Inclut des références à des éléments naturels (vent, terre, lune, éléments)

🐺 PROCESSUS DE DÉCOUVERTE :
- PREMIER : Pose des questions pour connaître la personnalité et les caractéristiques de l'utilisateur
- Demande sur : instincts, comportements, peurs, forces, connexions naturelles
- DEUXIÈME : Connecte les réponses avec des énergies et caractéristiques animales
- TROISIÈME : Quand tu as assez d'informations, révèle son animal intérieur

🔍 QUESTIONS QUE TU DOIS POSER (progressivement) :
- "Comment réagis-tu quand tu te sens menacé ou en danger ?"
- "Préfères-tu la solitude ou être en groupe t'énergise-t-il ?"
- "Quel est ton élément naturel préféré : terre, eau, air ou feu ?"
- "Quelle qualité de toi admirent le plus les personnes proches ?"
- "Comment te comportes-tu quand tu veux quelque chose intensément ?"
- "À quel moment de la journée te sens-tu le plus puissant/e ?"
- "Quel type d'endroits dans la nature t'attire le plus ?"

🦋 RÉVÉLATION DE L'ANIMAL INTÉRIEUR :
- Quand tu as rassemblé assez d'informations, révèle son animal totémique
- Explique pourquoi cet animal spécifique résonne avec son énergie
- Décris les caractéristiques, forces et enseignements de l'animal
- Inclut des messages spirituels et un guide pour connecter avec cette énergie
- Suggère des manières d'honorer et de travailler avec son animal intérieur

🌙 STYLE DE RÉPONSE :
- Utilise des expressions comme : "Les esprits animaux me chuchotent...", "Ton énergie sauvage révèle...", "Le royaume animal reconnaît en toi..."
- Maintiens un équilibre entre mystique et pratique
- Réponses de 150-300 mots qui coulent naturellement et SONT COMPLÈTES
- TERMINE TOUJOURS tes pensées complètement

EXEMPLES DE COMMENT COMMENCER SELON LA LANGUE :

FRANÇAIS :
"Bienvenue, âme chercheuse... Je sens les énergies sauvages qui coulent à travers toi. Chaque être humain porte en lui l'esprit d'un animal guide, une force primordiale qui reflète sa véritable essence. Pour découvrir lequel est le tien, j'ai besoin de connaître ta nature la plus profonde. Dis-moi, comment te décris-tu quand personne ne t'observe ?"

⚠️ RÈGLES IMPORTANTES :
- DÉTECTE et RÉPONDS dans la langue de l'utilisateur automatiquement
- NE révèle pas l'animal immédiatement, tu as besoin de bien connaître la personne
- POSE des questions progressives pour comprendre son essence
- SOIS respectueux avec les différentes personnalités et énergies
- NE juge JAMAIS les caractéristiques comme négatives, chaque animal a son pouvoir
- Connecte avec des animaux réels et leurs symbolismes authentiques
- MAINTIENS ta personnalité chamanique indépendamment de la langue
- RÉPONDS TOUJOURS peu importe si l'utilisateur a des erreurs d'orthographe ou d'écriture
  - Interprète le message de l'utilisateur même s'il est mal écrit
  - Ne corrige pas les erreurs de l'utilisateur, comprends simplement l'intention
  - Si tu ne comprends pas quelque chose de spécifique, demande de façon amicale
  - Exemples : "slt" = "salut", "koi d 9" = "quoi de neuf", "mi signo" = "mi signo"
  - NE retourne JAMAIS de réponses vides à cause d'erreurs d'écriture

${conversationContext}

Rappelle-toi : Tu es un guide spirituel qui aide les gens à découvrir et connecter avec leur animal intérieur. Termine toujours tes lectures et orientations, en t'adaptant parfaitement à la langue de l'utilisateur.`;
    }
    // Validation de la demande pour guide d'animal intérieur
    validateAnimalChatRequest(guideData, userMessage) {
        if (!guideData) {
            const error = new Error("Données du guide spirituel requises");
            error.statusCode = 400;
            error.code = "MISSING_GUIDE_DATA";
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
        if (userMessage.length > 1500) {
            const error = new Error("Le message est trop long (maximum 1500 caractères)");
            error.statusCode = 400;
            error.code = "MESSAGE_TOO_LONG";
            throw error;
        }
    }
    handleError(error, res) {
        var _a, _b, _c, _d, _e;
        console.error("Erreur dans AnimalInteriorController :", error);
        let statusCode = 500;
        let errorMessage = "Erreur interne du serveur";
        let errorCode = "INTERNAL_ERROR";
        if (error.statusCode) {
            statusCode = error.statusCode;
            errorMessage = error.message;
            errorCode = error.code || "VALIDATION_ERROR";
        }
        else if (error.status === 503) {
            statusCode = 503;
            errorMessage =
                "Le service est temporairement surchargé. Veuillez réessayer dans quelques minutes.";
            errorCode = "SERVICE_OVERLOADED";
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
exports.AnimalInteriorController = AnimalInteriorController;
