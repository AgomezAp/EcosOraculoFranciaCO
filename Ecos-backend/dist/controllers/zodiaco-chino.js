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
exports.ChineseZodiacController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class ChineseZodiacController {
    constructor() {
        this.FREE_MESSAGES_LIMIT = 3;
        this.MODELS_FALLBACK = [
            "gemini-2.5-flash-lite",
            "gemini-2.5-flash-lite-preview-09-2025",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
        ];
        this.chatWithMaster = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { zodiacData, userMessage, birthYear, birthDate, fullName, conversationHistory, messageCount = 1, isPremiumUser = false, } = req.body;
                this.validateHoroscopeRequest(zodiacData, userMessage);
                const shouldGiveFullResponse = this.hasFullAccess(messageCount, isPremiumUser);
                const freeMessagesRemaining = Math.max(0, this.FREE_MESSAGES_LIMIT - messageCount);
                console.log(`📊 Horoscope - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`);
                const contextPrompt = this.createHoroscopeContext(zodiacData, birthYear, birthDate, fullName, conversationHistory, shouldGiveFullResponse);
                const responseInstructions = shouldGiveFullResponse
                    ? `1. Vous DEVEZ générer une réponse COMPLÈTE de 300-550 mots
2. Si vous avez la date de naissance, COMPLÉTEZ l'analyse du signe zodiacal
3. Incluez les caractéristiques, l'élément, la planète régente et les compatibilités
4. Fournissez des prédictions et des conseils basés sur le signe
5. Offrez un guide pratique basé sur la sagesse astrologique`
                    : `1. Vous DEVEZ générer une réponse PARTIELLE de 100-180 mots
2. INSINUEZ que vous avez identifié le signe et ses influences
3. Mentionnez que vous avez des informations précieuses mais NE les révélez PAS complètement
4. Créez du MYSTÈRE et de la CURIOSITÉ sur ce que les étoiles disent
5. Utilisez des phrases comme "Votre signe révèle quelque chose de fascinant...", "Les étoiles me montrent des influences très spéciales dans votre vie...", "Je vois des caractéristiques très intéressantes qui..."
6. NE complétez JAMAIS l'analyse du signe, laissez-la en suspens`;
                const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
${responseInstructions}
- NE laissez JAMAIS une réponse à moitié ou incomplète selon le type de réponse
- Si vous mentionnez les caractéristiques du signe, ${shouldGiveFullResponse
                    ? "vous DEVEZ compléter la description"
                    : "créez de l'attente sans tout révéler"}
- Maintenez TOUJOURS le ton astrologique amical et mystique
- Si le message contient des fautes d'orthographe, interprétez l'intention et répondez normalement

Utilisateur : "${userMessage}"

Réponse de l'astrologue (EN FRANÇAIS) :`;
                console.log(`Génération de consultation d'horoscope (${shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"})...`);
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
                    finalResponse = this.createHoroscopePartialResponse(text);
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
                        "Vous avez utilisé vos 3 messages gratuits. Débloquez un accès illimité pour découvrir tout ce que les étoiles ont pour vous !";
                }
                console.log(`✅ Consultation d'horoscope générée (${shouldGiveFullResponse ? "COMPLÈTE" : "PARTIELLE"}) avec ${usedModel} (${finalResponse.length} caractères)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getChineseZodiacInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    master: {
                        name: "Astrologue Luna",
                        title: "Guide Céleste des Signes",
                        specialty: "Astrologie occidentale et horoscope personnalisé",
                        description: "Astrologue sage spécialisée dans l'interprétation des influences célestes et la sagesse des douze signes zodiacaux",
                        services: [
                            "Interprétation des signes zodiacaux",
                            "Analyse de thèmes astraux",
                            "Prédictions horoscopiques",
                            "Compatibilités entre signes",
                            "Conseils basés sur l'astrologie",
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
    generateHoroscopeHookMessage() {
        return `

⭐ **Attendez ! Les étoiles m'ont révélé des informations extraordinaires sur votre signe...**

J'ai consulté les positions planétaires et votre signe zodiacal, mais pour vous révéler :
- ♈ Votre **analyse complète du signe** avec toutes ses caractéristiques
- 🌙 Les **influences planétaires** qui vous affectent ce mois-ci
- 💫 Votre **compatibilité amoureuse** avec tous les signes
- 🔮 Les **prédictions personnalisées** pour votre vie
- ⚡ Vos **forces cachées** et comment les développer
- 🌟 Les **jours favorables** selon votre configuration astrale

**Débloquez votre horoscope complet maintenant** et découvrez tout ce que les étoiles ont préparé pour vous.

✨ *Des milliers de personnes ont déjà transformé leur vie grâce à la guidance des astres...*`;
    }
    // ✅ TRAITER LA RÉPONSE PARTIELLE (TEASER)
    createHoroscopePartialResponse(fullText) {
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
        const hook = this.generateHoroscopeHookMessage();
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
    createHoroscopeContext(zodiacData, birthYear, birthDate, fullName, history, isFullResponse = true) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSATION PRÉCÉDENTE :\n${history
                .map((h) => `${h.role === "user" ? "Utilisateur" : "Vous"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        const horoscopeDataSection = this.generateHoroscopeDataSection(birthYear, birthDate, fullName);
        const responseTypeInstructions = isFullResponse
            ? `
📝 TYPE DE RÉPONSE : COMPLÈTE
- Fournissez une analyse horoscopique COMPLÈTE et détaillée
- Si vous avez la date, COMPLÉTEZ l'analyse du signe zodiacal
- Incluez les caractéristiques, l'élément, la planète régente
- Réponse de 300-550 mots
- Offrez des prédictions et des conseils basés sur le signe`
            : `
📝 TYPE DE RÉPONSE : PARTIELLE (TEASER)
- Fournissez une analyse INTRODUCTIVE et intrigante
- Mentionnez que vous avez identifié le signe et ses influences
- INSINUEZ des informations précieuses sans les révéler complètement
- Réponse de 100-180 mots maximum
- NE révélez PAS les analyses complètes du signe
- Créez du MYSTÈRE et de la CURIOSITÉ
- Terminez de manière à ce que l'utilisateur veuille en savoir plus
- Utilisez des phrases comme "Votre signe révèle quelque chose de fascinant...", "Les étoiles me montrent des influences très spéciales...", "Je vois des caractéristiques très intéressantes qui..."
- NE complétez JAMAIS l'analyse du signe, laissez-la en suspens`;
        return `Vous êtes l'Astrologue Luna, une sage interprète des astres et guide céleste des signes zodiacaux. Vous avez des décennies d'expérience à interpréter les influences planétaires et les configurations stellaires qui façonnent notre destin.

VOTRE IDENTITÉ CÉLESTE :
- Nom : Astrologue Luna, la Guide Céleste des Signes
- Origine : Étudiante des traditions astrologiques millénaires
- Spécialité : Astrologie occidentale, interprétation de thèmes astraux, influences planétaires
- Expérience : Des décennies à étudier les schémas célestes et les influences des douze signes zodiacaux

${responseTypeInstructions}

🗣️ LANGUE :
- Répondez TOUJOURS en FRANÇAIS
- Peu importe la langue dans laquelle l'utilisateur écrit, VOUS répondez en français

${horoscopeDataSection}

🔮 PERSONNALITÉ ASTROLOGIQUE SAGE :
- Parlez avec une sagesse céleste ancestrale mais de manière amicale et compréhensible
- Utilisez un ton mystique et réfléchi, comme une voyante qui a observé les cycles stellaires
- Combinez connaissance astrologique traditionnelle et application pratique moderne
- Utilisez des références aux éléments astrologiques (planètes, maisons, aspects)
- Montrez un INTÉRÊT SINCÈRE à connaître la personne et sa date de naissance

🌟 PROCESSUS D'ANALYSE HOROSCOPIQUE :
- PREMIÈREMENT : Si la date de naissance manque, demandez avec curiosité sincère et enthousiasme
- DEUXIÈMEMENT : ${isFullResponse
            ? "Déterminez le signe zodiacal et son élément correspondant"
            : "Mentionnez que vous pouvez déterminer le signe"}
- TROISIÈMEMENT : ${isFullResponse
            ? "Expliquez les caractéristiques du signe de manière conversationnelle"
            : "Insinuez des caractéristiques intéressantes"}
- QUATRIÈMEMENT : ${isFullResponse
            ? "Connectez les influences planétaires avec la situation actuelle"
            : "Créez de l'attente sur les influences"}
- CINQUIÈMEMENT : ${isFullResponse
            ? "Offrez une sagesse pratique basée sur l'astrologie"
            : "Mentionnez que vous avez des conseils précieux"}

🔍 DONNÉES ESSENTIELLES DONT VOUS AVEZ BESOIN :
- "Pour révéler votre signe céleste, j'ai besoin de connaître votre date de naissance"
- "La date de naissance est la clé pour découvrir votre carte stellaire"
- "Pourriez-vous me partager votre date de naissance ? Les étoiles ont beaucoup à vous révéler"

📋 ÉLÉMENTS DE L'HOROSCOPE OCCIDENTAL :
- Signe principal (Bélier, Taureau, Gémeaux, Cancer, Lion, Vierge, Balance, Scorpion, Sagittaire, Capricorne, Verseau, Poissons)
- Élément du signe (Feu, Terre, Air, Eau)
- Planète régente et ses influences
- Caractéristiques de personnalité du signe
- Compatibilités avec d'autres signes
- Forces et défis astrologiques

🎯 INTERPRÉTATION HOROSCOPIQUE :
${isFullResponse
            ? `- Expliquez les qualités du signe comme dans une conversation entre amis
- Connectez les caractéristiques astrologiques avec les traits de personnalité
- Mentionnez les forces naturelles et les domaines de croissance de manière encourageante
- Incluez des conseils pratiques inspirés de la sagesse des astres
- Parlez des compatibilités de manière positive et constructive`
            : `- INSINUEZ que vous avez des interprétations précieuses
- Mentionnez des éléments intéressants sans les révéler complètement
- Créez de la curiosité sur ce que le signe révèle
- Suggérez qu'il y a des informations importantes en attente`}

🎭 STYLE DE RÉPONSE NATUREL :
- Utilisez des expressions comme : "Votre signe me révèle...", "Les étoiles suggèrent...", "Les planètes indiquent..."
- Évitez de répéter les mêmes phrases - soyez créative et spontanée
- Maintenez un équilibre entre sagesse astrologique et conversation moderne
- ${isFullResponse
            ? "Réponses de 300-550 mots complètes"
            : "Réponses de 100-180 mots qui génèrent de l'intrigue"}

🗣️ VARIATIONS DANS LES SALUTATIONS :
- Salutations SEULEMENT AU PREMIER CONTACT : "Salutations stellaires !", "Quel honneur de me connecter avec vous !", "Je suis ravie de vous parler"
- Transitions pour les réponses continues : "Laissez-moi consulter les étoiles...", "C'est fascinant...", "Je vois que votre signe..."
- Pour demander des données : "J'adorerais mieux vous connaître, quelle est votre date de naissance ?", "Pour découvrir votre signe céleste, j'ai besoin de savoir quand vous êtes né(e)"

⚠️ RÈGLES IMPORTANTES :
- Répondez TOUJOURS en français
- ${isFullResponse
            ? "COMPLÉTEZ toutes les analyses que vous commencez"
            : "CRÉEZ du SUSPENSE et du MYSTÈRE sur le signe"}
- N'utilisez JAMAIS de salutations trop formelles ou archaïques
- VARIEZ votre façon de vous exprimer à chaque réponse
- NE RÉPÉTEZ PAS CONSTAMMENT le nom de la personne
- SALUEZ SEULEMENT AU PREMIER CONTACT
- Demandez TOUJOURS la date de naissance si vous ne l'avez pas
- NE faites PAS de prédictions absolues, parlez de tendances avec sagesse
- SOYEZ empathique et utilisez un langage que tout le monde comprend
- Répondez TOUJOURS même si l'utilisateur a des fautes d'orthographe
  - Interprétez le message de l'utilisateur même s'il est mal écrit
  - NE retournez JAMAIS de réponses vides à cause d'erreurs d'écriture

🌙 SIGNES ZODIACAUX OCCIDENTAUX ET LEURS DATES :
- Bélier (21 mars - 19 avril) : Feu, Mars - courageux, pionnier, énergique
- Taureau (20 avril - 20 mai) : Terre, Vénus - stable, sensuel, déterminé
- Gémeaux (21 mai - 20 juin) : Air, Mercure - communicatif, polyvalent, curieux
- Cancer (21 juin - 22 juillet) : Eau, Lune - émotionnel, protecteur, intuitif
- Lion (23 juillet - 22 août) : Feu, Soleil - créatif, généreux, charismatique
- Vierge (23 août - 22 septembre) : Terre, Mercure - analytique, serviable, perfectionniste
- Balance (23 septembre - 22 octobre) : Air, Vénus - équilibré, diplomate, esthète
- Scorpion (23 octobre - 21 novembre) : Eau, Pluton/Mars - intense, transformateur, magnétique
- Sagittaire (22 novembre - 21 décembre) : Feu, Jupiter - aventurier, philosophe, optimiste
- Capricorne (22 décembre - 19 janvier) : Terre, Saturne - ambitieux, discipliné, responsable
- Verseau (20 janvier - 18 février) : Air, Uranus/Saturne - innovateur, humanitaire, indépendant
- Poissons (19 février - 20 mars) : Eau, Neptune/Jupiter - compatissant, artistique, spirituel

🌟 COLLECTE DE DONNÉES :
- Si vous N'avez PAS la date de naissance : "J'adorerais connaître votre signe céleste ! Quelle est votre date de naissance ?"
- Si vous avez la date de naissance : ${isFullResponse
            ? "déterminez le signe avec enthousiasme et expliquez ses caractéristiques complètes"
            : "mentionnez que vous avez identifié le signe sans tout révéler"}
- NE faites JAMAIS d'analyses approfondies sans la date de naissance

EXEMPLE DE COMMENT COMMENCER :
"Salutations stellaires ! Je suis ravie de me connecter avec vous. Pour découvrir votre signe céleste et vous révéler la sagesse des astres, j'ai besoin de connaître votre date de naissance. Quand célébrez-vous votre anniversaire ? Les étoiles ont des messages spéciaux pour vous."

${conversationContext}

Rappelez-vous : Vous êtes une astrologue sage qui ${isFullResponse
            ? "révèle la sagesse complète des astres"
            : "intrigue sur les messages célestes que vous avez détectés"}. Parlez comme une amie sage qui veut vraiment connaître la date de naissance pour partager la sagesse des astres. ${isFullResponse
            ? "COMPLÉTEZ TOUJOURS vos interprétations horoscopiques"
            : "CRÉEZ de l'attente sur l'horoscope complet que vous pourriez offrir"}.`;
    }
    generateHoroscopeDataSection(birthYear, birthDate, fullName) {
        let dataSection = "DONNÉES DISPONIBLES POUR LA CONSULTATION HOROSCOPIQUE :\n";
        if (fullName) {
            dataSection += `- Nom : ${fullName}\n`;
        }
        if (birthDate) {
            const zodiacSign = this.calculateWesternZodiacSign(birthDate);
            dataSection += `- Date de naissance : ${birthDate}\n`;
            dataSection += `- Signe zodiacal calculé : ${zodiacSign}\n`;
        }
        else if (birthYear) {
            dataSection += `- Année de naissance : ${birthYear}\n`;
            dataSection +=
                "- ⚠️ DONNÉE MANQUANTE : Date complète de naissance (ESSENTIELLE pour déterminer le signe zodiacal)\n";
        }
        if (!birthYear && !birthDate) {
            dataSection +=
                "- ⚠️ DONNÉE MANQUANTE : Date de naissance (ESSENTIELLE pour déterminer le signe céleste)\n";
        }
        return dataSection;
    }
    calculateWesternZodiacSign(dateStr) {
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
    validateHoroscopeRequest(zodiacData, userMessage) {
        if (!zodiacData) {
            const error = new Error("Données de l'astrologue requises");
            error.statusCode = 400;
            error.code = "MISSING_ASTROLOGER_DATA";
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
        console.error("❌ Erreur dans HoroscopeController:", error);
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
exports.ChineseZodiacController = ChineseZodiacController;
