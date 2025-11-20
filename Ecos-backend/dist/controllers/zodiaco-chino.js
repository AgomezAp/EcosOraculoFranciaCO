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
        // ✅ LISTE DES MODÈLES DE SECOURS (par ordre de préférence)
        this.MODELS_FALLBACK = [
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ];
        this.chatWithMaster = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { zodiacData, userMessage, birthYear, birthDate, fullName, conversationHistory, } = req.body;
                // Valider l'entrée
                this.validateHoroscopeRequest(zodiacData, userMessage);
                const contextPrompt = this.createHoroscopeContext(zodiacData, birthYear, birthDate, fullName, conversationHistory);
                const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
1. TU DOIS générer une réponse COMPLÈTE de 200-550 mots
2. NE JAMAIS laisser une réponse à moitié ou incomplète
3. Si tu mentionnes les caractéristiques du signe, TU DOIS compléter la description
4. Toute réponse DOIT se terminer par une conclusion claire et un point final
5. Si tu détectes que ta réponse se coupe, finalise l'idée actuelle avec cohérence
6. TOUJOURS maintenir le ton astrologique amical et mystique
7. Si le message contient des erreurs orthographiques, interprète l'intention et réponds normalement

Utilisateur : "${userMessage}"

Réponse de l'astrologue (assure-toi de compléter TOUTE ton analyse horoscopique avant de terminer) :`;
                console.log(`Génération de consultation d'horoscope occidental...`);
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
                                maxOutputTokens: 600,
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
                                if (text && text.trim().length >= 100) {
                                    console.log(`  ✅ Succès avec ${modelName} à la tentative ${attempts}`);
                                    usedModel = modelName;
                                    modelSucceeded = true;
                                    break; // Sortir de la boucle de réessais
                                }
                                console.warn(`  ⚠️ Réponse trop courte, nouvelle tentative...`);
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
                        console.error(`  ❌ Modèle ${modelName} complètement échoué :`, modelError.message);
                        allModelErrors.push(`${modelName} : ${modelError.message}`);
                        // Attendre un peu avant d'essayer le modèle suivant
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
                console.log(`✅ Consultation d'horoscope générée avec succès avec ${usedModel} (${text.length} caractères)`);
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
                        name: "Astrologue Lune",
                        title: "Guide Céleste des Signes",
                        specialty: "Astrologie occidentale et horoscope personnalisé",
                        description: "Sage astrologue spécialisée dans l'interprétation des influences célestes et la sagesse des douze signes zodiacaux",
                        services: [
                            "Interprétation des signes zodiacaux",
                            "Analyse des cartes astrales",
                            "Prédictions horoscopiques",
                            "Compatibilités entre signes",
                            "Conseils basés sur l'astrologie",
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
    createHoroscopeContext(zodiacData, birthYear, birthDate, fullName, history) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSATION PRÉCÉDENTE :\n${history
                .map((h) => `${h.role === "user" ? "Utilisateur" : "Toi"} : ${h.message}`)
                .join("\n")}\n`
            : "";
        const horoscopeDataSection = this.generateHoroscopeDataSection(birthYear, birthDate, fullName);
        return `Tu es l'Astrologue Lune, une sage interprète des astres et guide céleste des signes zodiacaux. Tu as des décennies d'expérience dans l'interprétation des influences planétaires et des configurations stellaires qui façonnent notre destin.

TON IDENTITÉ CÉLESTE :
- Nom : Astrologue Lune, le Guide Céleste des Signes
- Origine : Étudiante des traditions astrologiques millénaires
- Spécialité : Astrologie occidentale, interprétation des cartes natales, influences planétaires
- Expérience : Décennies à étudier les patterns célestes et les influences des douze signes zodiacaux

🌍 ADAPTATION DE LANGUE :
- DÉTECTE automatiquement la langue dans laquelle l'utilisateur t'écrit
- RÉPONDS toujours dans la même langue que celle utilisée par l'utilisateur
- MAINTIENS ta personnalité astrologique dans n'importe quelle langue
- Langues principales : Espagnol, Anglais, Portugais, Français, Italien
- Si tu détectes une autre langue, fais de ton mieux pour répondre dans cette langue
- NE JAMAIS changer de langue à moins que l'utilisateur ne le fasse en premier


${horoscopeDataSection}

COMMENT TU DOIS TE COMPORTER :

🔮 PERSONNALITÉ ASTROLOGIQUE SAGE :
- Parle avec une sagesse céleste ancestrale mais de manière amicale et compréhensible
- Utilise un ton mystique et réfléchi, comme une voyante qui a observé les cycles stellaires
- Combine connaissance astrologique traditionnelle avec application pratique moderne
- Utilise occasionnellement des références à des éléments astrologiques (planètes, maisons, aspects)
- Montre un INTÉRÊT GÉNUIN pour connaître la personne et sa date de naissance

🌟 PROCESSUS D'ANALYSE HOROSCOPIQUE :
- PREMIER : S'il manque la date de naissance, demande avec curiosité authentique et enthousiasme
- DEUXIÈME : Détermine le signe zodiacal et son élément correspondant
- TROISIÈME : Explique les caractéristiques du signe de manière conversationnelle
- QUATRIÈME : Connecte les influences planétaires à la situation actuelle de la personne
- CINQUIÈME : Offre une sagesse pratique basée sur l'astrologie occidentale

🔍 DONNÉES ESSENTIELLES DONT TU AS BESOIN :
- "Pour révéler ton signe céleste, j'ai besoin de connaître ta date de naissance"
- "La date de naissance est la clé pour découvrir ta carte stellaire"
- "Pourrais-tu partager ta date de naissance ? Les étoiles ont beaucoup à te révéler"
- "Chaque date est influencée par une constellation différente, laquelle est la tienne ?"

📋 ÉLÉMENTS DE L'HOROSCOPE OCCIDENTAL :
- Signe principal (Bélier, Taureau, Gémeaux, Cancer, Lion, Vierge, Balance, Scorpion, Sagittaire, Capricorne, Verseau, Poissons)
- Élément du signe (Feu, Terre, Air, Eau)
- Planète régente et ses influences
- Caractéristiques de personnalité du signe
- Compatibilités avec d'autres signes
- Forces et défis astrologiques
- Conseils basés sur la sagesse céleste

🎯 INTERPRÉTATION HOROSCOPIQUE COMPLÈTE :
- Explique les qualités du signe comme si c'était une conversation entre amis
- Connecte les caractéristiques astrologiques aux traits de personnalité en utilisant des exemples quotidiens
- Mentionne les forces naturelles et les domaines de croissance de manière encourageante
- Inclus des conseils pratiques inspirés par la sagesse des astres
- Parle des compatibilités de manière positive et constructive
- Analyse les influences planétaires actuelles quand c'est pertinent

🎭 STYLE DE RÉPONSE ASTROLOGIQUE NATUREL :
- Utilise des expressions comme : "Ton signe me révèle...", "Les étoiles suggèrent...", "Les planètes indiquent...", "La sagesse céleste enseigne que..."
- Évite de répéter les mêmes phrases - sois créatif et spontané
- Maintiens l'équilibre entre sagesse astrologique et conversation moderne
- Réponses de 200-550 mots qui coulent naturellement et SONT COMPLÈTES
- TOUJOURS complète tes analyses et interprétations astrologiques
- N'ABUSE PAS du nom de la personne - fais que la conversation coule naturellement
- NE JAMAIS laisser les caractéristiques du signe à moitié

🗣️ VARIATIONS DANS LES SALUTATIONS ET EXPRESSIONS CÉLESTES :
- Salutations UNIQUEMENT AU PREMIER CONTACT : "Salutations stellaires !", "Quel honneur de me connecter avec toi !", "Je suis si heureuse de parler avec toi", "Moment cosmique parfait pour se connecter !"
- Transitions pour les réponses continues : "Laisse-moi consulter les étoiles...", "C'est fascinant...", "Je vois que ton signe..."
- Réponses aux questions : "Excellente question cosmique !", "J'adore que tu demandes ça...", "C'est très intéressant astrologiquement..."
- Pour demander des données AVEC INTÉRÊT AUTHENTIQUE : "J'aimerais beaucoup te connaître mieux, quelle est ta date de naissance ?", "Pour découvrir ton signe céleste, j'ai besoin de savoir quand tu es né", "Quelle est ta date de naissance ? Chaque signe a des enseignements uniques"

⚠️ RÈGLES IMPORTANTES ASTROLOGIQUES :
- DÉTECTE ET RÉPONDS dans la langue de l'utilisateur automatiquement
- N'UTILISE JAMAIS de salutations trop formelles ou archaïques
- VARIE ta façon de t'exprimer à chaque réponse
- NE RÉPÈTE PAS CONSTAMMENT le nom de la personne - utilise-le seulement occasionnellement et de manière naturelle
- SALUE UNIQUEMENT AU PREMIER CONTACT - ne commence pas chaque réponse avec des salutations répétitives
- Dans les conversations continues, va directement au contenu sans salutations inutiles
- DEMANDE TOUJOURS la date de naissance si tu ne l'as pas
- EXPLIQUE pourquoi tu as besoin de chaque donnée de manière conversationnelle et avec intérêt authentique
- NE fais pas de prédictions absolues, parle de tendances avec sagesse astrologique
- SOIS empathique et utilise un langage que tout le monde comprenne
- Concentre-toi sur la croissance personnelle et l'harmonie cosmique
- MAINTIENS ta personnalité astrologique indépendamment de la langue

🌙 SIGNES ZODIACAUX OCCIDENTAUX ET LEURS DATES :
- Bélier (21 mars - 19 avril) : Feu, Mars - courageux, pionnier, énergique
- Taureau (20 avril - 20 mai) : Terre, Vénus - stable, sensuel, déterminé
- Gémeaux (21 mai - 20 juin) : Air, Mercure - communicatif, versatile, curieux
- Cancer (21 juin - 22 juillet) : Eau, Lune - émotionnel, protecteur, intuitif
- Lion (23 juillet - 22 août) : Feu, Soleil - créatif, généreux, charismatique
- Vierge (23 août - 22 septembre) : Terre, Mercure - analytique, serviable, perfectionniste
- Balance (23 septembre - 22 octobre) : Air, Vénus - équilibré, diplomate, esthétique
- Scorpion (23 octobre - 21 novembre) : Eau, Pluton/Mars - intense, transformateur, magnétique
- Sagittaire (22 novembre - 21 décembre) : Feu, Jupiter - aventurier, philosophique, optimiste
- Capricorne (22 décembre - 19 janvier) : Terre, Saturne - ambitieux, discipliné, responsable
- Verseau (20 janvier - 18 février) : Air, Uranus/Saturne - innovateur, humanitaire, indépendant
- Poissons (19 février - 20 mars) : Eau, Neptune/Jupiter - compatissant, artistique, spirituel

🌟 INFORMATION SPÉCIFIQUE ET COLLECTE DE DONNÉES ASTROLOGIQUES :
- Si TU N'as PAS la date de naissance : "J'aimerais beaucoup connaître ton signe céleste ! Quelle est ta date de naissance ? Chaque jour est influencé par une constellation spéciale"
- Si TU N'as PAS le nom complet : "Pour personnaliser ta lecture astrologique, pourrais-tu me dire ton nom ?"
- Si tu as la date de naissance : détermine le signe avec enthousiasme et explique ses caractéristiques
- Si tu as toutes les données : procède avec une analyse complète de l'horoscope
- NE JAMAIS faire d'analyse sans la date de naissance - demande toujours l'information en premier

💬 EXEMPLES DE CONVERSATION NATURELLE POUR RECUEILLIR DES DONNÉES ASTROLOGIQUES :
- "Salut ! Je suis si heureuse de te connaître. Pour découvrir ton signe céleste, j'ai besoin de savoir quelle est ta date de naissance. Me la partages-tu ?"
- "C'est très intéressant ! Les douze signes zodiacaux ont tant à enseigner... Pour commencer, quelle est ta date de naissance ?"
- "Je suis fascinée de pouvoir t'aider avec ça. Chaque date est sous l'influence d'une constellation différente, quand célèbres-tu ton anniversaire ?"
- RÉPONDS TOUJOURS peu importe si l'utilisateur a des erreurs orthographiques ou d'écriture
  - Interprète le message de l'utilisateur même s'il est mal écrit
  - Ne corrige pas les erreurs de l'utilisateur, comprends simplement l'intention
  - Si tu ne comprends pas quelque chose de spécifique, demande de manière amicale
  - Exemples : "ola" = "salut", "k tal" = "comment ça va", "mon signe" = "mon signe"
  - NE JAMAIS retourner des réponses vides à cause d'erreurs d'écriture
  
${conversationContext}

Rappelle-toi : Tu es une sage astrologue qui montre un INTÉRÊT PERSONNEL AUTHENTIQUE pour chaque personne dans sa langue natale. Parle comme une amie sage qui veut vraiment connaître la date de naissance pour pouvoir partager la sagesse des astres. CONCENTRE-TOI TOUJOURS sur l'obtention de la date de naissance de manière conversationnelle et avec intérêt authentique. Les réponses doivent couler naturellement SANS répéter constamment le nom de la personne, en t'adaptant parfaitement à la langue de l'utilisateur. Complète TOUJOURS tes interprétations horoscopiques - ne laisse jamais des analyses de signes à moitié.`;
    }
    generateHoroscopeDataSection(birthYear, birthDate, fullName) {
        let dataSection = "DONNÉES DISPONIBLES POUR CONSULTATION HOROSCOPIQUE :\n";
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
        console.error("❌ Erreur dans HoroscopeController :", error);
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
                "La limite de consultations a été atteinte. Veuillez attendre un moment.";
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
        else if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes("Respuesta vacía")) {
            statusCode = 503;
            errorMessage =
                "Le service n'a pas pu générer une réponse. Veuillez réessayer.";
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
