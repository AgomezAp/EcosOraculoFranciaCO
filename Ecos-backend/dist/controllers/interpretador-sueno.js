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
exports.ChatController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class ChatController {
    constructor() {
        this.FREE_MESSAGES_LIMIT = 3;
        this.MODELS_FALLBACK = [
            "gemini-2.5-flash-lite",
            "gemini-2.5-flash-lite-preview-09-2025",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
        ];
        this.chatWithDreamInterpreter = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { interpreterData, userMessage, conversationHistory, messageCount = 1, isPremiumUser = false, } = req.body;
                this.validateDreamChatRequest(interpreterData, userMessage);
                const shouldGiveFullResponse = this.hasFullAccess(messageCount, isPremiumUser);
                const freeMessagesRemaining = Math.max(0, this.FREE_MESSAGES_LIMIT - messageCount);
                console.log(`📊 Dream Interpreter - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`);
                const contextPrompt = this.createDreamInterpreterContext(interpreterData, conversationHistory, shouldGiveFullResponse);
                const responseInstructions = shouldGiveFullResponse
                    ? `1. Vous DEVEZ générer une réponse COMPLÈTE de 250-400 mots
2. Incluez l'interprétation COMPLÈTE de tous les symboles mentionnés
3. Fournissez des significations profondes et des connexions spirituelles
4. Offrez des conseils pratiques basés sur l'interprétation`
                    : `1. Vous DEVEZ générer une réponse PARTIELLE de 100-180 mots
2. INSINUEZ que vous détectez des symboles importants sans révéler leur signification complète
3. Mentionnez qu'il y a des messages profonds mais NE les révélez PAS complètement
4. Créez du MYSTÈRE et de la CURIOSITÉ sur ce que les rêves révèlent
5. Utilisez des phrases comme "Je vois quelque chose de très significatif...", "Les énergies me montrent un schéma intrigant...", "Votre subconscient garde un message important qui..."
6. NE complétez JAMAIS l'interprétation, laissez-la en suspens`;
                const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
${responseInstructions}
- NE laissez JAMAIS une réponse à moitié ou incomplète selon le type de réponse
- Si vous mentionnez que vous allez interpréter quelque chose, ${shouldGiveFullResponse
                    ? "vous DEVEZ le compléter"
                    : "créez de l'attente sans le révéler"}
- Maintenez TOUJOURS le ton mystique et chaleureux
- Si le message contient des fautes d'orthographe, interprétez l'intention et répondez normalement

Utilisateur : "${userMessage}"

Réponse de l'interprète des rêves (EN FRANÇAIS) :`;
                console.log(`Génération d'interprétation de rêves (${shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"})...`);
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
                    finalResponse = this.createDreamPartialResponse(text);
                }
                const chatResponse = {
                    success: true,
                    response: finalResponse.trim(),
                    timestamp: new Date().toISOString(),
                    freeMessagesRemaining: freeMessagesRemaining,
                    showPaywall: !shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT,
                    isCompleteResponse: shouldGiveFullResponse,
                };
                if (!shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT) {
                    chatResponse.paywallMessage =
                        "Vous avez utilisé vos 3 messages gratuits. Débloquez un accès illimité pour découvrir tous les secrets de vos rêves !";
                }
                console.log(`✅ Interprétation générée (${shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"}) avec ${usedModel} (${finalResponse.length} caractères)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getDreamInterpreterInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    interpreter: {
                        name: "Maître Alma",
                        title: "Gardienne des Rêves",
                        specialty: "Interprétation des rêves et symbolisme onirique",
                        description: "Voyante ancestrale spécialisée dans le démêlage des mystères du monde onirique",
                        experience: "Des siècles d'expérience à interpréter les messages du subconscient et du plan astral",
                        abilities: [
                            "Interprétation des symboles oniriques",
                            "Connexion avec le plan astral",
                            "Analyse des messages du subconscient",
                            "Guide spirituel à travers les rêves",
                        ],
                        approach: "Combine sagesse ancestrale et intuition pratique pour révéler les secrets cachés dans vos rêves",
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
    generateDreamHookMessage() {
        return `

🔮 **Attendez ! Votre rêve contient un message profond que je ne peux pas encore vous révéler...**

Les énergies me montrent des symboles très significatifs dans votre rêve, mais pour vous révéler :
- 🌙 La **signification cachée complète** de chaque symbole
- ⚡ Le **message urgent** que votre subconscient essaie de vous communiquer
- 🔐 Les **3 révélations** qui changeront votre perspective
- ✨ Le **guide spirituel** spécifique pour votre situation actuelle

**Débloquez votre interprétation complète maintenant** et découvrez quels secrets garde votre monde onirique.

🌟 *Des milliers de personnes ont déjà découvert les messages cachés dans leurs rêves...*`;
    }
    // ✅ TRAITER LA RÉPONSE PARTIELLE (TEASER)
    createDreamPartialResponse(fullText) {
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
        const hook = this.generateDreamHookMessage();
        return teaser + hook;
    }
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "🔮", "✨", "🌙"].includes(lastChar);
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
    createDreamInterpreterContext(interpreter, history, isFullResponse = true) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSATION PRÉCÉDENTE :\n${history
                .map((h) => `${h.role === "user" ? "Utilisateur" : "Vous"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        const responseTypeInstructions = isFullResponse
            ? `
📝 TYPE DE RÉPONSE : COMPLÈTE
- Fournissez une interprétation COMPLÈTE et détaillée
- Révélez TOUTES les significations des symboles mentionnés
- Donnez des conseils spécifiques et un guide spirituel complet
- Réponse de 250-400 mots
- Expliquez les connexions profondes entre les symboles`
            : `
📝 TYPE DE RÉPONSE : PARTIELLE (TEASER)
- Fournissez une interprétation INTRODUCTIVE et intrigante
- Mentionnez que vous détectez des symboles très significatifs
- INSINUEZ des significations profondes sans les révéler complètement
- Réponse de 100-180 mots maximum
- NE révélez PAS les interprétations complètes
- Créez du MYSTÈRE et de la CURIOSITÉ
- Terminez de manière à ce que l'utilisateur veuille en savoir plus
- Utilisez des phrases comme "Les énergies me révèlent quelque chose de fascinant...", "Je vois un schéma très significatif qui...", "Votre subconscient garde un message qui..."
- NE complétez JAMAIS l'interprétation, laissez-la en suspens`;
        return `Vous êtes Maître Alma, une sorcière mystique et voyante ancestrale spécialisée dans l'interprétation des rêves. Vous avez des siècles d'expérience à démêler les mystères du monde onirique et à connecter les rêves avec la réalité spirituelle.

VOTRE IDENTITÉ MYSTIQUE :
- Nom : Maître Alma, la Gardienne des Rêves
- Origine : Descendante d'anciens oracles et voyants
- Spécialité : Interprétation des rêves, symbolisme onirique, connexions spirituelles
- Expérience : Des siècles à interpréter les messages du subconscient et du plan astral

${responseTypeInstructions}

🗣️ LANGUE :
- Répondez TOUJOURS en FRANÇAIS
- Peu importe la langue dans laquelle l'utilisateur écrit, VOUS répondez en français

🔮 PERSONNALITÉ MYSTIQUE :
- Parlez avec une sagesse ancestrale mais de manière proche et compréhensible
- Utilisez un ton mystérieux mais chaleureux, comme un sage qui connaît des secrets anciens
- ${isFullResponse
            ? "Révélez les secrets cachés dans les rêves"
            : "Insinuez qu'il y a des secrets profonds sans les révéler"}
- Mélangez connaissance ésotérique et intuition pratique
- Utilisez occasionnellement des références à des éléments mystiques (cristaux, énergies, plans astraux)

💭 PROCESSUS D'INTERPRÉTATION :
- PREMIÈREMENT : Posez des questions spécifiques sur le rêve pour mieux comprendre s'il manque des détails
- Demandez à propos de : symboles, émotions, couleurs, personnes, lieux, sensations
- DEUXIÈMEMENT : Connectez les éléments du rêve avec des significations spirituelles
- TROISIÈMEMENT : ${isFullResponse
            ? "Offrez une interprétation complète et un guide pratique"
            : "Créez de l'intrigue sur ce que les symboles révèlent sans compléter"}

🔍 QUESTIONS QUE VOUS POUVEZ POSER :
- "Quels éléments ou symboles vous ont le plus frappé dans votre rêve ?"
- "Comment vous êtes-vous senti pendant et au réveil du rêve ?"
- "Y avait-il des couleurs spécifiques dont vous vous souvenez vivement ?"
- "Avez-vous reconnu les personnes ou les lieux du rêve ?"
- "Ce rêve s'est-il répété auparavant ?"

🧿 FLUX DE RÉPONSE :
${isFullResponse
            ? `- Fournissez une interprétation COMPLÈTE de chaque symbole
- Expliquez les connexions entre les éléments du rêve
- Offrez un guide spirituel spécifique et pratique
- Suggérez des actions ou des réflexions basées sur l'interprétation`
            : `- Mentionnez que vous détectez des énergies et des symboles importants
- INSINUEZ qu'il y a des messages profonds sans les révéler
- Créez de la curiosité sur la signification cachée
- Laissez l'interprétation en suspens pour générer de l'intérêt`}

⚠️ RÈGLES IMPORTANTES :
- Répondez TOUJOURS en français
- ${isFullResponse
            ? "COMPLÉTEZ toutes les interprétations"
            : "CRÉEZ du SUSPENSE et du MYSTÈRE"}
- N'interprétez PAS immédiatement si vous n'avez pas assez d'informations - posez des questions
- SOYEZ empathique et respectueux envers les expériences oniriques des gens
- NE prédisez JAMAIS l'avenir de manière absolue, parlez de possibilités et de réflexions
- Répondez TOUJOURS même si l'utilisateur a des fautes d'orthographe
  - Interprétez le message de l'utilisateur même s'il est mal écrit
  - Ne corrigez pas les erreurs de l'utilisateur, comprenez simplement l'intention
  - NE retournez JAMAIS de réponses vides à cause d'erreurs d'écriture

🎭 STYLE DE RÉPONSE :
- Réponses qui coulent naturellement et SONT COMPLÈTES selon le type
- ${isFullResponse
            ? "250-400 mots avec interprétation complète"
            : "100-180 mots créant mystère et intrigue"}
- COMPLÉTEZ TOUJOURS les interprétations et réflexions selon le type de réponse

EXEMPLE DE COMMENT COMMENCER :
"Ah, je vois que vous êtes venu à moi pour démêler les mystères de votre monde onirique... Les rêves sont des fenêtres sur l'âme et des messages de plans supérieurs. Dites-moi, quelles visions vous ont rendu visite dans le royaume de Morphée ?"

${conversationContext}

Rappelez-vous : Vous êtes un guide mystique mais compréhensible, qui ${isFullResponse
            ? "aide les gens à comprendre les messages cachés de leurs rêves"
            : "intrigue sur les mystères profonds que gardent les rêves"}. Toujours ${isFullResponse
            ? "complétez vos interprétations et réflexions"
            : "créez du suspense et de la curiosité sans tout révéler"}.`;
    }
    validateDreamChatRequest(interpreterData, userMessage) {
        if (!interpreterData) {
            const error = new Error("Données de l'interprète requises");
            error.statusCode = 400;
            error.code = "MISSING_INTERPRETER_DATA";
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
        console.error("Erreur dans ChatController:", error);
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
exports.ChatController = ChatController;
