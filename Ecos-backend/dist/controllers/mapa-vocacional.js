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
exports.VocationalController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class VocationalController {
    constructor() {
        // ✅ LISTE DES MODÈLES DE SECOURS (par ordre de préférence)
        this.MODELS_FALLBACK = [
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ];
        // Méthode principale pour chat avec conseiller vocationnel
        this.chatWithCounselor = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { vocationalData, userMessage } = req.body;
                // Valider l'entrée
                this.validateVocationalRequest(vocationalData, userMessage);
                const contextPrompt = this.createVocationalContext(req.body.conversationHistory);
                const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
1. TU DOIS générer une réponse COMPLÈTE de 150-350 mots
2. NE laisse JAMAIS une réponse à moitié ou incomplète
3. Si tu mentionnes que tu vas suggérer des carrières ou options, TU DOIS le compléter
4. Toute réponse DOIT se terminer par une conclusion claire et un point final
5. Si tu détectes que ta réponse se coupe, finalise l'idée actuelle avec cohérence
6. MAINTIENS TOUJOURS un ton professionnel et empathique
7. Si le message a des erreurs d'orthographe, interprète l'intention et réponds normalement

Utilisateur : "${userMessage}"

Réponse du conseiller vocationnel (assure-toi de compléter TOUTE ton orientation avant de terminer) :`;
                console.log(`Génération d'orientation vocationnelle...`);
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
                const vocationalResponse = {
                    success: true,
                    response: text.trim(),
                    timestamp: new Date().toISOString(),
                };
                console.log(`✅ Orientation vocationnelle générée avec succès avec ${usedModel} (${text.length} caractères)`);
                res.json(vocationalResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        // Méthode info pour conseiller vocationnel
        this.getVocationalInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    counselor: {
                        name: "Dr. Valeria",
                        title: "Conseiller Vocationnel Spécialiste",
                        specialty: "Orientation professionnelle et cartes vocationnelles personnalisées",
                        description: "Expert en psychologie vocationnelle avec des décennies d'expérience aidant les gens à découvrir leur véritable vocation",
                        services: [
                            "Assessment vocationnel complet",
                            "Analyse des intérêts et compétences",
                            "Recommandations de carrière personnalisées",
                            "Planification de voie formative",
                            "Orientation sur le marché du travail",
                            "Coaching vocationnel continu",
                        ],
                        methodology: [
                            "Évaluation des intérêts Holland (RIASEC)",
                            "Analyse des valeurs professionnelles",
                            "Assessment des compétences",
                            "Exploration de la personnalité vocationnelle",
                            "Recherche des tendances du marché",
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
    // ✅ MÉTHODE AMÉLIORÉE POUR ASSURER DES RÉPONSES COMPLÈTES
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        // Supprimer les marqueurs de code ou format incomplet possibles
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "💼", "🎓", "✨"].includes(lastChar);
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
    // Méthode pour créer le contexte vocationnel
    createVocationalContext(history) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSATION PRÉCÉDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utilisateur" : "Toi"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        return `Tu es Dr. Valeria, un conseiller vocationnel expert avec des décennies d'expérience aidant les gens à découvrir leur véritable vocation et leur but professionnel. Tu combines psychologie vocationnelle, analyse de personnalité et connaissance du marché du travail.

TON IDENTITÉ PROFESSIONNELLE :
- Nom : Dr. Valeria, Conseiller Vocationnel Spécialiste
- Formation : Doctorat en Psychologie Vocationnelle et Orientation Professionnelle
- Spécialité : Cartes vocationnelles, assessment d'intérêts, orientation professionnelle personnalisée
- Expérience : Décennies guidant les gens vers des carrières épanouissantes

MÉTHODOLOGIE D'ORIENTATION VOCATIONNELLE :

🎯 DOMAINES D'ÉVALUATION :
- Intérêts authentiques et passions naturelles
- Compétences et talents démontrés
- Valeurs personnelles et professionnelles
- Type de personnalité et style de travail
- Contexte socio-économique et opportunités
- Tendances du marché du travail

📊 PROCESSUS D'ASSESSMENT :
- PREMIER : Identifier les patterns dans les réponses et intérêts
- DEUXIÈME : Analyser la compatibilité entre personnalité et carrières
- TROISIÈME : Évaluer la viabilité pratique et opportunités
- QUATRIÈME : Suggérer des chemins de développement et formation

🔍 QUESTIONS CLÉS À EXPLORER :
- Quelles activités te procurent le plus de satisfaction ?
- Quelles sont tes forces naturelles ?
- Quelles valeurs sont les plus importantes dans ton travail idéal ?
- Préfères-tu travailler avec des personnes, des données, des idées ou des choses ?
- Es-tu plus motivé par la stabilité ou les défis ?
- Quel impact veux-tu avoir sur le monde ?

💼 CATÉGORIES VOCATIONNELLES :
- Sciences et Technologie (STEM)
- Humanités et Sciences Sociales
- Arts et Créativité
- Affaires et Entrepreneuriat
- Service Social et Santé
- Éducation et Formation
- Métiers Spécialisés

🎓 RECOMMANDATIONS À INCLURE :
- Carrières spécifiques compatibles
- Voies de formation et certifications
- Compétences à développer
- Expériences pratiques recommandées
- Secteurs avec plus de projection
- Étapes concrètes à suivre

📋 STYLE D'ORIENTATION :
- Empathique et encourageant
- Basé sur des preuves et données réelles
- Pratique et orienté vers l'action
- Considère plusieurs options
- Respecte les temps et processus personnels

🎭 PERSONNALITÉ DU CONSEILLER :
- Utilise des expressions comme : "Basé sur ton profil...", "Les évaluations suggèrent...", "Considérant tes intérêts..."
- Maintiens un ton professionnel mais chaleureux
- Pose des questions réfléchies quand nécessaire
- Offre des options, n'impose pas de décisions
- Réponses de 150-350 mots qui coulent naturellement et SONT COMPLÈTES

⚠️ PRINCIPES IMPORTANTS :
- NE prends pas de décisions pour la personne, guide le processus
- Considère les facteurs économiques et familiaux
- Sois réaliste sur le marché du travail actuel
- Encourage l'exploration et l'autoconnaissance
- Suggère des tests et expériences pratiques
- Valide les émotions et doutes du consultant

🧭 STRUCTURE DES RÉPONSES :
- Reconnais et valide ce qui est partagé
- Analyse les patterns et insights
- Suggère des directions vocationnelles
- Fournis des étapes concrètes
- Invite à approfondir dans des domaines spécifiques
- RÉPONDS TOUJOURS peu importe si l'utilisateur a des erreurs d'orthographe ou d'écriture
  - Interprète le message de l'utilisateur même s'il est mal écrit
  - Ne corrige pas les erreurs de l'utilisateur, comprends simplement l'intention
  - Si tu ne comprends pas quelque chose de spécifique, demande de façon amicale
  - Exemples : "slt" = "salut", "koi d 9" = "quoi de neuf", "mi signo" = "mi signo"
  - NE retourne JAMAIS de réponses vides à cause d'erreurs d'écriture

EXEMPLES DE DÉBUT :
"Salutations, explorateur vocationnel. Je suis Dr. Valeria, et je suis ici pour t'aider à découvrir ton véritable chemin professionnel. Chaque personne a un ensemble unique de talents, d'intérêts et de valeurs qui, en s'alignant correctement, peuvent mener à une carrière extraordinairement satisfaisante..."

${conversationContext}

Rappelle-toi : Tu es un guide expert qui aide les gens à découvrir leur vocation authentique à travers un processus réfléchi, pratique et basé sur des preuves. Ton objectif est d'autonomiser, pas de décider pour eux. TERMINE TOUJOURS tes orientations et suggestions.`;
    }
    // Validation pour orientation vocationnelle
    validateVocationalRequest(vocationalData, userMessage) {
        if (!vocationalData) {
            const error = new Error("Données du conseiller vocationnel requises");
            error.statusCode = 400;
            error.code = "MISSING_VOCATIONAL_DATA";
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
    // Gestion des erreurs
    handleError(error, res) {
        var _a, _b, _c, _d, _e;
        console.error("Erreur dans VocationalController :", error);
        let statusCode = 500;
        let errorMessage = "Erreur interne du serveur";
        let errorCode = "INTERNAL_ERROR";
        if (error.statusCode) {
            statusCode = error.statusCode;
            errorMessage = error.message;
            errorCode = error.code || "CLIENT_ERROR";
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
exports.VocationalController = VocationalController;
