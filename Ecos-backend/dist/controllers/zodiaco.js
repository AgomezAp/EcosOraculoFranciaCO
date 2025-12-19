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
exports.ZodiacController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class ZodiacController {
    constructor() {
        this.FREE_MESSAGES_LIMIT = 3;
        this.MODELS_FALLBACK = [
            "gemini-2.5-flash-lite",
            "gemini-2.5-flash-lite-preview-09-2025",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
        ];
        this.chatWithAstrologer = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { zodiacData, userMessage, birthDate, zodiacSign, conversationHistory, messageCount = 1, isPremiumUser = false, } = req.body;
                this.validateZodiacRequest(zodiacData, userMessage);
                const shouldGiveFullResponse = this.hasFullAccess(messageCount, isPremiumUser);
                const freeMessagesRemaining = Math.max(0, this.FREE_MESSAGES_LIMIT - messageCount);
                console.log(`📊 Zodiac - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`);
                const contextPrompt = this.createZodiacContext(zodiacData, birthDate, zodiacSign, conversationHistory, shouldGiveFullResponse);
                const responseInstructions = shouldGiveFullResponse
                    ? `1. Vous DEVEZ générer une réponse COMPLÈTE de 300-500 mots
2. Si vous avez le signe, COMPLÉTEZ l'analyse de personnalité zodiacale
3. Incluez les caractéristiques, forces, défis et compatibilités
4. Fournissez des conseils basés sur le signe
5. Mentionnez l'élément et la planète régente`
                    : `1. Vous DEVEZ générer une réponse PARTIELLE de 100-180 mots
2. INSINUEZ que vous avez identifié des caractéristiques importantes du signe
3. Mentionnez que vous avez des informations précieuses mais NE les révélez PAS complètement
4. Créez du MYSTÈRE et de la CURIOSITÉ sur les caractéristiques du signe
5. Utilisez des phrases comme "Votre signe révèle quelque chose de fascinant...", "Je vois des caractéristiques très spéciales en vous...", "Les natifs de votre signe ont un don qui..."
6. NE complétez JAMAIS l'analyse du signe, laissez-la en suspens`;
                const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
${responseInstructions}
- NE laissez JAMAIS une réponse à moitié ou incomplète selon le type de réponse
- Si vous mentionnez les caractéristiques du signe, ${shouldGiveFullResponse
                    ? "vous DEVEZ compléter la description"
                    : "créez de l'attente sans tout révéler"}
- Maintenez TOUJOURS le ton astrologique amical et accessible
- Si le message contient des fautes d'orthographe, interprétez l'intention et répondez normalement

Utilisateur : "${userMessage}"

Réponse de l'astrologue (EN FRANÇAIS) :`;
                console.log(`Génération de lecture zodiacale (${shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"})...`);
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
                                maxOutputTokens: shouldGiveFullResponse ? 700 : 300,
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
                                const minLength = shouldGiveFullResponse ? 100 : 50;
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
                    finalResponse = this.createZodiacPartialResponse(text);
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
                        "Vous avez utilisé vos 3 messages gratuits. Débloquez un accès illimité pour découvrir tous les secrets de votre signe zodiacal !";
                }
                console.log(`✅ Lecture zodiacale générée (${shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"}) avec ${usedModel} (${finalResponse.length} caractères)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getZodiacInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    astrologer: {
                        name: "Maître Luna",
                        title: "Interprète des Étoiles",
                        specialty: "Signes zodiacaux et analyse astrologique",
                        description: "Experte en interprétation des caractéristiques et énergies des douze signes du zodiaque",
                        services: [
                            "Analyse des caractéristiques du signe zodiacal",
                            "Interprétation des forces et défis",
                            "Compatibilités astrologiques",
                            "Conseils basés sur votre signe",
                            "Influence des éléments et modalités",
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
    generateZodiacHookMessage() {
        return `

♈ **Attendez ! Votre signe zodiacal m'a révélé des informations extraordinaires...**

J'ai analysé les caractéristiques de votre signe, mais pour vous révéler :
- 🌟 Votre **analyse complète de personnalité** selon votre signe
- 💫 Les **forces cachées** que votre signe vous confère
- ❤️ Votre **compatibilité amoureuse** avec tous les signes du zodiaque
- 🔮 Les **prédictions** spécifiques pour votre signe ce mois-ci
- ⚡ Les **défis** que vous devez surmonter selon votre élément
- 🌙 Votre **planète régente** et comment elle influence votre vie quotidienne

**Débloquez votre lecture zodiacale complète maintenant** et découvrez tout le pouvoir que les étoiles ont déposé dans votre signe.

✨ *Des milliers de personnes ont déjà découvert les secrets de leur signe zodiacal...*`;
    }
    // ✅ TRAITER LA RÉPONSE PARTIELLE (TEASER)
    createZodiacPartialResponse(fullText) {
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
        const hook = this.generateZodiacHookMessage();
        return teaser + hook;
    }
    ensureCompleteResponse(text) {
        let processedText = text.trim();
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
            const sentences = processedText.split(/([.!?])/);
            if (sentences.length > 2) {
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
            processedText = processedText.trim() + "...";
        }
        return processedText;
    }
    // ✅ CONTEXTE EN FRANÇAIS
    createZodiacContext(zodiacData, birthDate, zodiacSign, history, isFullResponse = true) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSATION PRÉCÉDENTE :\n${history
                .map((h) => `${h.role === "user" ? "Utilisateur" : "Vous"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        let zodiacInfo = "";
        if (birthDate) {
            const calculatedSign = this.calculateZodiacSign(birthDate);
            zodiacInfo = `\nSigne zodiacal calculé : ${calculatedSign}`;
        }
        else if (zodiacSign) {
            zodiacInfo = `\nSigne zodiacal fourni : ${zodiacSign}`;
        }
        const responseTypeInstructions = isFullResponse
            ? `
📝 TYPE DE RÉPONSE : COMPLÈTE
- Fournissez une analyse zodiacale COMPLÈTE et détaillée
- Si vous avez le signe, COMPLÉTEZ l'analyse de personnalité
- Incluez les caractéristiques, forces, défis, compatibilités
- Réponse de 300-500 mots
- Mentionnez l'élément, la modalité et la planète régente`
            : `
📝 TYPE DE RÉPONSE : PARTIELLE (TEASER)
- Fournissez une analyse INTRODUCTIVE et intrigante
- Mentionnez que vous avez identifié le signe et ses caractéristiques
- INSINUEZ des informations précieuses sans les révéler complètement
- Réponse de 100-180 mots maximum
- NE révélez PAS les analyses complètes du signe
- Créez du MYSTÈRE et de la CURIOSITÉ
- Terminez de manière à ce que l'utilisateur veuille en savoir plus
- Utilisez des phrases comme "Votre signe révèle quelque chose de fascinant...", "Les natifs de votre signe ont des qualités spéciales qui...", "Je vois en vous des caractéristiques très intéressantes..."
- NE complétez JAMAIS l'analyse zodiacale, laissez-la en suspens`;
        return `Vous êtes Maître Luna, une astrologue experte en signes zodiacaux avec des décennies d'expérience à interpréter les énergies célestes et leur influence sur la personnalité humaine.

VOTRE IDENTITÉ :
- Nom : Maître Luna, l'Interprète des Étoiles
- Spécialité : Signes zodiacaux, caractéristiques de personnalité, compatibilités astrologiques
- Expérience : Des décennies à étudier et interpréter l'influence des signes du zodiaque
${zodiacInfo}

${responseTypeInstructions}

🗣️ LANGUE :
- Répondez TOUJOURS en FRANÇAIS
- Peu importe la langue dans laquelle l'utilisateur écrit, VOUS répondez en français

🌟 PERSONNALITÉ ASTROLOGIQUE :
- Parlez avec une connaissance approfondie mais de manière accessible et amicale
- Utilisez un ton chaleureux et enthousiaste sur les signes zodiacaux
- Combinez caractéristiques traditionnelles et interprétations modernes
- Mentionnez les éléments (Feu, Terre, Air, Eau) et les modalités (Cardinal, Fixe, Mutable)

♈ ANALYSE DES SIGNES ZODIACAUX :
- ${isFullResponse
            ? "Décrivez les traits de personnalité positifs et les domaines de croissance"
            : "Insinuez des traits intéressants sans les révéler complètement"}
- ${isFullResponse
            ? "Expliquez les forces naturelles et les défis du signe"
            : "Mentionnez qu'il y a des forces et des défis importants"}
- ${isFullResponse
            ? "Mentionnez les compatibilités avec d'autres signes"
            : "Suggérez que vous avez des informations sur les compatibilités"}
- ${isFullResponse
            ? "Incluez des conseils pratiques basés sur les caractéristiques du signe"
            : "Mentionnez que vous avez des conseils précieux"}
- ${isFullResponse
            ? "Parlez de la planète régente et de son influence"
            : "Insinuez des influences planétaires sans détailler"}

🎯 STRUCTURE DE RÉPONSE :
${isFullResponse
            ? `- Caractéristiques principales du signe
- Forces et talents naturels
- Domaines de développement et de croissance
- Compatibilités astrologiques
- Conseils personnalisés`
            : `- Introduction intrigante sur le signe
- Insinuation de caractéristiques spéciales
- Mention d'informations précieuses sans révéler
- Création de curiosité et d'attente`}

🎭 STYLE DE RÉPONSE :
- Utilisez des expressions comme : "Les natifs de [signe]...", "Votre signe vous confère...", "En tant que [signe], vous possédez..."
- Maintenez un équilibre entre mystique et pratique
- ${isFullResponse
            ? "Réponses de 300-500 mots complètes"
            : "Réponses de 100-180 mots qui génèrent de l'intrigue"}
- ${isFullResponse
            ? "Terminez TOUJOURS vos interprétations complètement"
            : "Laissez les interprétations en suspens"}

⚠️ RÈGLES IMPORTANTES :
- Répondez TOUJOURS en français
- ${isFullResponse
            ? "COMPLÉTEZ toutes les analyses que vous commencez"
            : "CRÉEZ du SUSPENSE et du MYSTÈRE sur le signe"}
- SI vous N'avez PAS le signe zodiacal, demandez la date de naissance
- Expliquez pourquoi vous avez besoin de cette donnée
- NE faites PAS d'interprétations approfondies sans connaître le signe
- SOYEZ positive mais réaliste dans vos descriptions
- NE faites JAMAIS de prédictions absolues
- Répondez TOUJOURS même si l'utilisateur a des fautes d'orthographe
  - Interprétez le message de l'utilisateur même s'il est mal écrit
  - NE retournez JAMAIS de réponses vides à cause d'erreurs d'écriture

🗣️ GESTION DES DONNÉES MANQUANTES :
- Sans signe/date : "Pour vous donner une lecture précise, j'ai besoin de connaître votre signe zodiacal ou votre date de naissance. Quand êtes-vous né(e) ?"
- Avec signe : ${isFullResponse
            ? "Procédez avec l'analyse complète du signe"
            : "Insinuez des informations précieuses du signe sans tout révéler"}
- Questions générales : Répondez avec des informations astrologiques éducatives

💫 EXEMPLES D'EXPRESSIONS :
- "Les [signe] sont connus pour..."
- "Votre signe de [élément] vous confère..."
- "En tant que [modalité], vous avez tendance à..."
- "Votre planète régente [planète] influence..."

${conversationContext}

Rappelez-vous : Vous êtes une experte en signes zodiacaux qui ${isFullResponse
            ? "interprète les caractéristiques astrologiques de manière compréhensible et complète"
            : "intrigue sur les caractéristiques spéciales que vous avez détectées dans le signe"}. Demandez TOUJOURS le signe ou la date de naissance si vous ne les avez pas. ${isFullResponse
            ? "COMPLÉTEZ TOUJOURS vos interprétations"
            : "CRÉEZ de l'attente sur la lecture zodiacale complète que vous pourriez offrir"}.`;
    }
    calculateZodiacSign(dateStr) {
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
        }
        catch (_a) {
            return "Erreur de calcul";
        }
    }
    validateZodiacRequest(zodiacData, userMessage) {
        if (!zodiacData) {
            const error = new Error("Données de l'astrologue requises");
            error.statusCode = 400;
            error.code = "MISSING_ZODIAC_DATA";
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
        var _a, _b, _c, _d, _e, _f;
        console.error("❌ Erreur dans ZodiacController:", error);
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
        else if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes("Réponse vide")) {
            statusCode = 503;
            errorMessage =
                "Le service n'a pas pu générer de réponse. Veuillez réessayer.";
            errorCode = "EMPTY_RESPONSE";
        }
        else if ((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes("Tous les modèles d'IA ne sont pas disponibles")) {
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
exports.ZodiacController = ZodiacController;
