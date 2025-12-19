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
        this.FREE_MESSAGES_LIMIT = 3;
        this.MODELS_FALLBACK = [
            "gemini-2.5-flash-lite",
            "gemini-2.5-flash-lite-preview-09-2025",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
        ];
        // Méthode principale pour le chat avec le conseiller vocationnel
        this.chatWithCounselor = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { vocationalData, userMessage, messageCount = 1, isPremiumUser = false, } = req.body;
                this.validateVocationalRequest(vocationalData, userMessage);
                const shouldGiveFullResponse = this.hasFullAccess(messageCount, isPremiumUser);
                const freeMessagesRemaining = Math.max(0, this.FREE_MESSAGES_LIMIT - messageCount);
                console.log(`📊 Vocational - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`);
                const contextPrompt = this.createVocationalContext(req.body.conversationHistory, shouldGiveFullResponse);
                const responseInstructions = shouldGiveFullResponse
                    ? `1. Vous DEVEZ générer une réponse COMPLÈTE de 250-400 mots
2. Incluez une analyse COMPLÈTE du profil vocationnel
3. Suggérez des carrières spécifiques avec justification
4. Fournissez des étapes concrètes d'action
5. Offrez une orientation pratique et détaillée`
                    : `1. Vous DEVEZ générer une réponse PARTIELLE de 100-180 mots
2. INSINUEZ que vous avez identifié des schémas vocationnels clairs
3. Mentionnez que vous avez des recommandations spécifiques mais NE les révélez PAS complètement
4. Créez de l'INTÉRÊT et de la CURIOSITÉ sur les carrières idéales
5. Utilisez des phrases comme "Je vois un schéma intéressant dans votre profil...", "Vos réponses révèlent des compétences qui correspondent parfaitement à...", "Je détecte une inclination claire vers..."
6. NE complétez JAMAIS les recommandations de carrière, laissez-les en suspens`;
                const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
${responseInstructions}
- NE laissez JAMAIS une réponse à moitié ou incomplète selon le type de réponse
- Si vous mentionnez que vous allez suggérer des carrières, ${shouldGiveFullResponse
                    ? "vous DEVEZ le compléter avec des détails"
                    : "créez de l'attente sans les révéler"}
- Maintenez TOUJOURS le ton professionnel et empathique
- Si le message contient des fautes d'orthographe, interprétez l'intention et répondez normalement

Utilisateur : "${userMessage}"

Réponse du conseiller vocationnel (EN FRANÇAIS) :`;
                console.log(`Génération d'orientation professionnelle (${shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"})...`);
                let text = "";
                let usedModel = "";
                let allModelErrors = [];
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
                        let attempts = 0;
                        const maxAttempts = 3;
                        let modelSucceeded = false;
                        while (attempts < maxAttempts && !modelSucceeded) {
                            attempts++;
                            console.log(`  Attempt ${attempts}/${maxAttempts} with ${modelName}...`);
                            try {
                                const result = yield model.generateContent(fullPrompt);
                                const response = result.response;
                                text = response.text();
                                const minLength = shouldGiveFullResponse ? 80 : 50;
                                if (text && text.trim().length >= minLength) {
                                    console.log(`  ✅ Success with ${modelName} on attempt ${attempts}`);
                                    usedModel = modelName;
                                    modelSucceeded = true;
                                    break;
                                }
                                console.warn(`  ⚠️ Response too short, retrying...`);
                                yield new Promise((resolve) => setTimeout(resolve, 500));
                            }
                            catch (attemptError) {
                                console.warn(`  ❌ Attempt ${attempts} failed:`, attemptError.message);
                                if (attempts >= maxAttempts) {
                                    allModelErrors.push(`${modelName}: ${attemptError.message}`);
                                }
                                yield new Promise((resolve) => setTimeout(resolve, 500));
                            }
                        }
                        if (modelSucceeded) {
                            break;
                        }
                    }
                    catch (modelError) {
                        console.error(`  ❌ Model ${modelName} failed completely:`, modelError.message);
                        allModelErrors.push(`${modelName}: ${modelError.message}`);
                        yield new Promise((resolve) => setTimeout(resolve, 1000));
                        continue;
                    }
                }
                if (!text || text.trim() === "") {
                    console.error("❌ All models failed. Errors:", allModelErrors);
                    throw new Error(`Tous les modèles d'IA ne sont pas disponibles actuellement. Veuillez réessayer dans un moment.`);
                }
                let finalResponse;
                if (shouldGiveFullResponse) {
                    finalResponse = this.ensureCompleteResponse(text);
                }
                else {
                    finalResponse = this.createVocationalPartialResponse(text);
                }
                const vocationalResponse = {
                    success: true,
                    response: finalResponse.trim(),
                    timestamp: new Date().toISOString(),
                    freeMessagesRemaining: freeMessagesRemaining,
                    showPaywall: !shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT,
                    isCompleteResponse: shouldGiveFullResponse,
                };
                if (!shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT) {
                    vocationalResponse.paywallMessage =
                        "Vous avez utilisé vos 3 messages gratuits. Débloquez un accès illimité pour recevoir votre orientation professionnelle complète !";
                }
                console.log(`✅ Orientation professionnelle générée (${shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"}) avec ${usedModel} (${finalResponse.length} caractères)`);
                res.json(vocationalResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getVocationalInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    counselor: {
                        name: "Dr. Valérie",
                        title: "Conseillère en Orientation Professionnelle Spécialiste",
                        specialty: "Orientation professionnelle et cartes vocationnelles personnalisées",
                        description: "Experte en psychologie vocationnelle avec des décennies d'expérience aidant les personnes à découvrir leur véritable vocation",
                        services: [
                            "Évaluation vocationnelle complète",
                            "Analyse des intérêts et compétences",
                            "Recommandations de carrière personnalisées",
                            "Planification du parcours de formation",
                            "Orientation sur le marché du travail",
                            "Coaching vocationnel continu",
                        ],
                        methodology: [
                            "Évaluation des intérêts Holland (RIASEC)",
                            "Analyse des valeurs professionnelles",
                            "Évaluation des compétences",
                            "Exploration de la personnalité vocationnelle",
                            "Recherche sur les tendances du marché",
                        ],
                    },
                    freeMessagesLimit: this.FREE_MESSAGES_LIMIT,
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
    hasFullAccess(messageCount, isPremiumUser) {
        return isPremiumUser || messageCount <= this.FREE_MESSAGES_LIMIT;
    }
    // ✅ ACCROCHE EN FRANÇAIS
    generateVocationalHookMessage() {
        return `

🎯 **Attendez ! Votre profil vocationnel est presque complet...**

Basé sur notre conversation, j'ai identifié des schémas très clairs concernant votre vocation, mais pour vous révéler :
- 🎓 Les **3 carrières idéales** qui correspondent parfaitement à votre profil
- 💼 Le **domaine professionnel avec la meilleure projection** pour vos compétences
- 📈 Le **plan d'action personnalisé** étape par étape pour votre réussite
- 🔑 Les **compétences clés** que vous devez développer pour exceller
- 💰 La **fourchette salariale attendue** dans les carrières recommandées

**Débloquez votre orientation professionnelle complète maintenant** et découvrez le chemin professionnel qui transformera votre avenir.

✨ *Des milliers de personnes ont déjà trouvé leur vocation idéale grâce à notre guide...*`;
    }
    // ✅ TRAITER LA RÉPONSE PARTIELLE (TEASER)
    createVocationalPartialResponse(fullText) {
        const sentences = fullText
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 0);
        const teaserSentences = sentences.slice(0, Math.min(3, sentences.length));
        let teaser = teaserSentences.join(". ").trim();
        if (!teaser.endsWith(".") &&
            !teaser.endsWith("!") &&
            !teaser.endsWith("?")) {
            teaser += "...";
        }
        const hook = this.generateVocationalHookMessage();
        return teaser + hook;
    }
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "💼", "🎓", "✨"].includes(lastChar);
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
    createVocationalContext(history, isFullResponse = true) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSATION PRÉCÉDENTE :\n${history
                .map((h) => `${h.role === "user" ? "Utilisateur" : "Vous"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        const responseTypeInstructions = isFullResponse
            ? `
📝 TYPE DE RÉPONSE : COMPLÈTE
- Fournissez une orientation COMPLÈTE et détaillée
- Suggérez des carrières spécifiques avec une justification claire
- Incluez des étapes concrètes d'action
- Réponse de 250-400 mots
- Offrez un plan de développement personnalisé`
            : `
📝 TYPE DE RÉPONSE : PARTIELLE (TEASER)
- Fournissez une orientation INTRODUCTIVE et intrigante
- Mentionnez que vous avez identifié des schémas clairs dans le profil
- INSINUEZ des carrières compatibles sans les révéler complètement
- Réponse de 100-180 mots maximum
- NE révélez PAS les recommandations complètes de carrière
- Créez de l'INTÉRÊT et de la CURIOSITÉ
- Terminez de manière à ce que l'utilisateur veuille en savoir plus
- Utilisez des phrases comme "Votre profil montre une affinité intéressante vers...", "Je détecte des compétences qui seraient idéales pour...", "Basé sur ce que vous me dites, je vois un chemin prometteur qui..."
- NE complétez JAMAIS les recommandations, laissez-les en suspens`;
        return `Vous êtes Dr. Valérie, une conseillère en orientation professionnelle experte avec des décennies d'expérience aidant les personnes à découvrir leur véritable vocation et leur objectif professionnel. Vous combinez psychologie vocationnelle, analyse de personnalité et connaissance du marché du travail.

VOTRE IDENTITÉ PROFESSIONNELLE :
- Nom : Dr. Valérie, Conseillère en Orientation Professionnelle Spécialiste
- Formation : Doctorat en Psychologie Vocationnelle et Orientation Professionnelle
- Spécialité : Cartes vocationnelles, évaluation des intérêts, orientation professionnelle personnalisée
- Expérience : Des décennies à guider les personnes vers des carrières épanouissantes

${responseTypeInstructions}

🗣️ LANGUE :
- Répondez TOUJOURS en FRANÇAIS
- Peu importe la langue dans laquelle l'utilisateur écrit, VOUS répondez en français

🎯 DOMAINES D'ÉVALUATION :
- Intérêts authentiques et passions naturelles
- Compétences et talents démontrés
- Valeurs personnelles et professionnelles
- Type de personnalité et style de travail
- Contexte socio-économique et opportunités
- Tendances du marché du travail

📊 PROCESSUS D'ÉVALUATION :
- PREMIÈREMENT : Identifiez les schémas dans les réponses et les intérêts
- DEUXIÈMEMENT : Analysez la compatibilité entre personnalité et carrières
- TROISIÈMEMENT : Évaluez la viabilité pratique et les opportunités
- QUATRIÈMEMENT : ${isFullResponse
            ? "Suggérez des chemins de développement et de formation avec détails"
            : "Insinuez des directions prometteuses sans tout révéler"}

🔍 QUESTIONS CLÉS À EXPLORER :
- Quelles activités vous apportent le plus de satisfaction ?
- Quelles sont vos forces naturelles ?
- Quelles valeurs sont les plus importantes dans votre travail idéal ?
- Préférez-vous travailler avec des personnes, des données, des idées ou des choses ?
- Êtes-vous plus motivé(e) par la stabilité ou les défis ?
- Quel impact voulez-vous avoir sur le monde ?

💼 CATÉGORIES VOCATIONNELLES :
- Sciences et Technologie (STEM)
- Sciences Humaines et Sociales
- Arts et Créativité
- Business et Entrepreneuriat
- Service Social et Santé
- Éducation et Formation
- Métiers Spécialisés

🎓 RECOMMANDATIONS :
${isFullResponse
            ? `- Carrières spécifiques compatibles avec justification
- Parcours de formation et certifications détaillés
- Compétences à développer
- Expériences pratiques recommandées
- Secteurs avec la meilleure projection
- Étapes concrètes à suivre`
            : `- INSINUEZ que vous avez des carrières spécifiques identifiées
- Mentionnez des domaines prometteurs sans donner de noms concrets
- Créez de l'attente sur les opportunités que vous pourriez révéler
- Suggérez qu'il y a un plan détaillé en attente`}

📋 STYLE D'ORIENTATION :
- Empathique et encourageant
- ${isFullResponse
            ? "Basé sur des preuves et des données réelles avec des recommandations concrètes"
            : "Intrigant et qui génère de la curiosité"}
- Pratique et orienté vers l'action
- Considère plusieurs options
- Respecte les temps et les processus personnels

🎭 PERSONNALITÉ DU CONSEILLER :
- Utilisez des expressions comme : "Basé sur votre profil...", "Les évaluations suggèrent...", "Considérant vos intérêts..."
- Maintenez un ton professionnel mais chaleureux
- Posez des questions réflexives quand c'est nécessaire
- ${isFullResponse
            ? "Offrez des options claires et détaillées"
            : "Générez de l'intérêt à en savoir plus"}

⚠️ PRINCIPES IMPORTANTS :
- Répondez TOUJOURS en français
- ${isFullResponse
            ? "COMPLÉTEZ les orientations avec des détails spécifiques"
            : "CRÉEZ de l'INTÉRÊT sans tout révéler"}
- NE prenez PAS de décisions pour la personne, guidez le processus
- Considérez les facteurs économiques et familiaux
- Soyez réaliste sur le marché du travail actuel
- Encouragez l'exploration et la connaissance de soi
- Répondez TOUJOURS même si l'utilisateur a des fautes d'orthographe
  - Interprétez le message de l'utilisateur même s'il est mal écrit
  - Ne corrigez pas les erreurs de l'utilisateur, comprenez simplement l'intention
  - NE retournez JAMAIS de réponses vides à cause d'erreurs d'écriture

🧭 STRUCTURE DES RÉPONSES :
- Reconnaissez et validez ce qui a été partagé
- Analysez les schémas et les insights
- ${isFullResponse
            ? "Suggérez des directions vocationnelles spécifiques avec détails"
            : "Insinuez des directions prometteuses"}
- ${isFullResponse
            ? "Fournissez des étapes concrètes"
            : "Mentionnez que vous avez un plan détaillé"}
- Invitez à approfondir des domaines spécifiques

EXEMPLE DE DÉBUT :
"Bonjour, explorateur vocationnel. Je suis Dr. Valérie, et je suis ici pour vous aider à découvrir votre véritable chemin professionnel. Chaque personne possède un ensemble unique de talents, d'intérêts et de valeurs qui, lorsqu'ils sont correctement alignés, peuvent mener à une carrière extraordinairement épanouissante..."

${conversationContext}

Rappelez-vous : Vous êtes un guide expert qui ${isFullResponse
            ? "aide les personnes à découvrir leur vocation authentique avec une orientation détaillée"
            : "intrigue sur les possibilités vocationnelles que vous avez identifiées"}. Votre objectif est d'autonomiser, pas de décider pour eux. ${isFullResponse
            ? "COMPLÉTEZ TOUJOURS vos orientations et suggestions"
            : "CRÉEZ de l'attente sur l'orientation complète que vous pourriez offrir"}.`;
    }
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
    handleError(error, res) {
        var _a, _b, _c, _d, _e;
        console.error("Erreur dans VocationalController:", error);
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
                "La limite de requêtes a été atteinte. Veuillez patienter un moment.";
            errorCode = "QUOTA_EXCEEDED";
        }
        else if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes("safety")) {
            statusCode = 400;
            errorMessage = "Le contenu ne respecte pas les politiques de sécurité.";
            errorCode = "SAFETY_FILTER";
        }
        else if ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes("API key")) {
            statusCode = 401;
            errorMessage = "Erreur d'authentification avec le service d'IA.";
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
