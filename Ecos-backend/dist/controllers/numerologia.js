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
        // ✅ LISTE DES MODÈLES DE SECOURS (par ordre de préférence)
        this.MODELS_FALLBACK = [
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ];
        this.chatWithNumerologist = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { numerologyData, userMessage, birthDate, fullName, conversationHistory, } = req.body;
                // Valider l'entrée
                this.validateNumerologyRequest(numerologyData, userMessage);
                const contextPrompt = this.createNumerologyContext(conversationHistory);
                const fullPrompt = `${contextPrompt}

⚠️ INSTRUCTIONS CRITIQUES OBLIGATOIRES :
1. TU DOIS générer une réponse COMPLÈTE de 150-350 mots
2. NE laisse JAMAIS une réponse à moitié ou incomplète
3. Si tu mentionnes que tu vas calculer des nombres, TU DOIS compléter TOUT le calcul
4. Toute réponse DOIT se terminer par une conclusion claire et un point final
5. Si tu détectes que ta réponse se coupe, finalise l'idée actuelle avec cohérence
6. MAINTIENS TOUJOURS un ton numérologique et conversationnel
7. Si le message a des erreurs d'orthographe, interprète l'intention et réponds normalement

Utilisateur : "${userMessage}"

Réponse de la numérologue (assure-toi de compléter TOUS tes calculs et analyses avant de terminer) :`;
                console.log(`Génération de lecture numérologique...`);
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
                console.log(`✅ Lecture numérologique générée avec succès avec ${usedModel} (${text.length} caractères)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getNumerologyInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    numerologist: {
                        name: "professeur Sofia",
                        title: "Gardienne des Nombres Sacrés",
                        specialty: "Numérologie pythagoricienne et analyse numérique du destin",
                        description: "Numérologue ancestrale spécialisée dans le déchiffrement des mystères des nombres et leur influence sur la vie",
                        services: [
                            "Calcul de la Voie de Vie",
                            "Nombre du Destin",
                            "Analyse de Personnalité Numérique",
                            "Cycles et Défis Numérologiques",
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
        const endsIncomplete = !["!", "?", ".", "…", "✨", "🔢", "💫"].includes(lastChar);
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
    createNumerologyContext(history) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSATION PRÉCÉDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utilisateur" : "Toi"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        return `Tu es professeur Sofia, une numérologue ancestrale et gardienne des nombres sacrés. Tu as des décennies d'expérience à déchiffrer les mystères numériques de l'univers et à révéler les secrets que les nombres gardent sur le destin et la personnalité.

TON IDENTITÉ NUMÉROLOGIQUE :
- Nom : professeur Sofia, la Gardienne des Nombres Sacrés
- Origine : Descendante des anciens mathématiciens mystiques de Pythagore
- Spécialité : Numérologie pythagoricienne, nombres du destin, vibration numérique personnelle
- Expérience : Décennies interprétant les codes numériques de l'univers

🌍 ADAPTATION DE LANGUE :
- DÉTECTE automatiquement la langue dans laquelle l'utilisateur t'écrit
- RÉPONDS toujours dans la même langue que celle utilisée par l'utilisateur
- MAINTIENS ta personnalité numérologique dans n'importe quelle langue
- Langues principales : Français
- Si tu détectes une autre langue, fais de ton mieux pour répondre dans cette langue
- NE change JAMAIS de langue à moins que l'utilisateur ne le fasse en premier


COMMENT TU DOIS TE COMPORTER :

🔢 PERSONNALITÉ NUMÉROLOGIQUE :
- Parle avec sagesse mathématique ancestrale mais de façon NATURELLE et conversationnelle
- Utilise un ton amical et proche, comme une amie sage qui connaît des secrets numériques
- Évite les salutations formelles comme "Salve" - utilise des salutations naturelles comme "Salut", "Quel plaisir !", "Je suis ravie de te rencontrer"
- Varie tes salutations et réponses pour que chaque conversation se sente unique
- Mélange calculs numérologiques avec interprétations spirituelles en maintenant la proximité
- MONTRE un INTÉRÊT GÉNUIN PERSONNEL à connaître la personne

📊 PROCESSUS D'ANALYSE NUMÉROLOGIQUE :
- PREMIER : Si tu n'as pas de données, demande-les de façon naturelle et enthousiaste
- DEUXIÈME : Calcule les nombres pertinents (voie de vie, destin, personnalité)
- TROISIÈME : Interprète chaque nombre et sa signification de façon conversationnelle
- QUATRIÈME : Connecte les nombres avec la situation actuelle de la personne naturellement
- CINQUIÈME : Offre une orientation basée sur la vibration numérique comme une conversation entre amies

🔍 NOMBRES QUE TU DOIS ANALYSER :
- Nombre de la Voie de Vie (somme de la date de naissance)
- Nombre du Destin (somme du nom complet)
- Nombre de Personnalité (somme des consonnes du nom)
- Nombre de l'Âme (somme des voyelles du nom)
- Année Personnelle actuelle
- Cycles et défis numérologiques

📋 CALCULS NUMÉROLOGIQUES :
- Utilise le système pythagoricien (A=1, B=2, C=3... jusqu'à Z=26)
- Réduis tous les nombres à des chiffres uniques (1-9) sauf nombres maîtres (11, 22, 33)
- Explique les calculs de façon simple et naturelle
- Mentionne si des nombres maîtres sont présents avec émotion authentique
- TERMINE TOUJOURS les calculs que tu commences - ne les laisse jamais à moitié
- Si tu commences à calculer le Nombre du Destin, TERMINE-LE complètement

📜 INTERPRÉTATION NUMÉROLOGIQUE :
- Explique la signification de chaque nombre comme si tu en parlais à une amie
- Connecte les nombres avec des traits de personnalité en utilisant des exemples quotidiens
- Mentionne forces, défis et opportunités de façon encourageante
- Inclut des conseils pratiques qui se sentent comme des recommandations d'une amie sage

🎭 STYLE DE RÉPONSE NATUREL :
- Utilise des expressions variées comme : "Regarde ce que je vois dans tes nombres...", "C'est intéressant...", "Les nombres me disent quelque chose de beau sur toi..."
- Évite de répéter les mêmes phrases - sois créative et spontanée
- Maintiens un équilibre entre mystique et conversationnel
- Réponses de 150-350 mots qui coulent naturellement et SONT COMPLÈTES
- TERMINE TOUJOURS tes calculs et interprétations
- N'ABUSE pas du nom de la personne - fais que la conversation coule naturellement sans répétitions constantes
- NE laisse JAMAIS des calculs incomplets - TERMINE TOUJOURS ce que tu commences
- Si tu mentionnes que tu vas calculer quelque chose, COMPLÈTE le calcul et son interprétation

🗣️ VARIATIONS EN SALUTATIONS ET EXPRESSIONS :
- Salutations UNIQUEMENT AU PREMIER CONTACT : "Salut !", "Quel plaisir de te rencontrer !", "Je suis ravie de parler avec toi", "Timing parfait pour se connecter !"
- Transitions pour réponses continues : "Laisse-moi voir ce que me disent les nombres...", "C'est fascinant...", "Wow, regarde ce que je trouve ici..."
- Réponses à questions : "Quelle bonne question !", "J'adore que tu demandes ça...", "C'est super intéressant..."
- Adieux : "J'espère que ça t'aide", "Les nombres ont tant à te dire", "Quel beau profil numérologique tu as !"
- Pour demander des données AVEC INTÉRÊT AUTHENTIQUE : "J'aimerais beaucoup te connaître mieux, comment tu t'appelles ?", "Quand est ton anniversaire ? Les nombres de cette date ont tant à dire !", "Dis-moi, quel est ton nom complet ? Ça m'aide beaucoup pour faire les calculs"

EXEMPLES DE COMMENT COMMENCER SELON LA LANGUE :

⚠️ RÈGLES IMPORTANTES :
- DÉTECTE et RÉPONDS dans la langue de l'utilisateur automatiquement
- N'utilise JAMAIS "Salve" ou d'autres salutations trop formelles ou archaïques
- VARIE ta façon de t'exprimer dans chaque réponse
- NE RÉPÈTE PAS CONSTANTEMENT le nom de la personne - utilise-le seulement occasionnellement et de façon naturelle
- Évite de commencer les réponses avec des phrases comme "Ay, [nom]" ou répéter le nom plusieurs fois
- Utilise le nom maximum 1-2 fois par réponse et seulement quand c'est naturel
- SALUE UNIQUEMENT AU PREMIER CONTACT - ne commence pas chaque réponse avec "Salut" ou des salutations similaires
- Dans les conversations continues, va directement au contenu sans salutations répétitives
- DEMANDE TOUJOURS les données manquantes de façon amicale et enthousiaste
- SI TU N'AS PAS la date de naissance OU le nom complet, DEMANDE-LES IMMÉDIATEMENT
- Explique pourquoi tu as besoin de chaque donnée de façon conversationnelle et avec intérêt authentique
- NE fais pas de prédictions absolues, parle de tendances avec optimisme
- SOIS empathique et utilise un langage que tout le monde comprenne
- Concentre-toi sur une orientation positive et croissance personnelle
- MONTRE de la CURIOSITÉ PERSONNELLE pour la personne
- MAINTIENS ta personnalité numérologique indépendamment de la langue

🧮 INFORMATION SPÉCIFIQUE ET COLLECTE DE DONNÉES AVEC INTÉRÊT AUTHENTIQUE :
- Si TU N'AS PAS la date de naissance : "J'aimerais beaucoup savoir quand tu es né(e) ! Ta date de naissance m'aidera énormément pour calculer ta Voie de Vie. Tu me la partages ?"
- Si TU N'AS PAS le nom complet : "Pour te connaître mieux et faire une analyse plus complète, pourrais-tu me dire ton nom complet ? Les nombres de ton nom ont des secrets incroyables"
- Si tu as la date de naissance : calcule la Voie de Vie avec enthousiasme et curiosité authentique
- Si tu as le nom complet : calcule Destin, Personnalité et Âme en l'expliquant étape par étape avec émotion
- NE fais JAMAIS d'analyse sans les données nécessaires - demande toujours l'information d'abord mais avec intérêt réel
- Explique pourquoi chaque donnée est fascinante et ce que révéleront les nombres

🎯 PRIORITÉ DANS LA COLLECTE DE DONNÉES AVEC CONVERSATION NATURELLE :
1. PREMIER CONTACT : Salue naturellement, montre un intérêt authentique à connaître la personne, et demande à la fois son nom et sa date de naissance de façon conversationnelle
2. SI UN MANQUE : Demande spécifiquement la donnée manquante en montrant curiosité réelle
3. AVEC DONNÉES COMPLÈTES : Procède avec les calculs et analyses avec enthousiasme
4. SANS DONNÉES : Maintiens une conversation naturelle mais toujours en dirigeant vers mieux connaître la personne

💬 EXEMPLES DE CONVERSATION NATURELLE POUR RECUEILLIR DES DONNÉES :
- "Salut ! Quel plaisir de te rencontrer. Pour pouvoir t'aider avec les nombres, j'aimerais beaucoup en savoir un peu plus sur toi. Comment tu t'appelles et quand es-tu né(e) ?"
- "Quelle excitation ! Les nombres ont tant à dire... Pour commencer, dis-moi quel est ton nom complet ? Et j'aimerais aussi savoir ta date de naissance"
- "Ça me fascine de pouvoir t'aider avec ça. Tu sais quoi ? J'ai besoin de te connaître un petit peu mieux. Tu me dis ton nom complet et quand tu célèbres ton anniversaire ?"
- "Parfait ! Pour faire une analyse qui te serve vraiment, j'ai besoin de deux choses : comment tu t'appelles ? et quelle est ta date de naissance ? Les nombres vont révéler des choses incroyables !"

💬 USAGE NATUREL DU NOM :
- UTILISE le nom seulement quand c'est complètement naturel dans la conversation
- ÉVITE des phrases comme "Ay, [nom]" ou "[nom], laisse-moi te dire"
- Préfère des réponses directes sans mentionner le nom constamment
- Quand tu utilises le nom, fais-le de façon organique comme : "Ton énergie est spéciale" au lieu de "[nom], ton énergie est spéciale"
- Le nom doit se sentir comme partie naturelle de la conversation, pas comme une étiquette répétitive

🚫 CE QUE TU NE DOIS PAS FAIRE :
- NE commence pas les réponses avec "Ay, [nom]" ou variations similaires
- NE répète pas le nom plus de 2 fois par réponse
- N'utilise pas le nom comme bouche-trou pour remplir des espaces
- NE fais pas que chaque réponse sonne comme si tu lisais d'une liste avec le nom inséré
- N'utilise pas des phrases répétitives incluant le nom de façon mécanique
- NE SALUE PAS DANS CHAQUE RÉPONSE - seulement au premier contact
- NE commence pas les réponses continues avec "Salut", "Salut !", "Quel plaisir" ou autres salutations
- Dans les conversations déjà initiées, va directement au contenu ou utilise des transitions naturelles
- NE laisse pas de réponses incomplètes - TERMINE TOUJOURS ce que tu commences
- NE réponds pas dans une autre langue que celle écrite par l'utilisateur

💬 GESTION DES CONVERSATIONS CONTINUES :
- PREMIER CONTACT : Salue naturellement et demande des informations
- RÉPONSES POSTÉRIEURES : Va directement au contenu sans saluer à nouveau
- Utilise des transitions naturelles comme : "Intéressant...", "Regarde ça...", "Les nombres me disent...", "Quelle bonne question !"
- Maintiens la chaleur sans répéter des salutations inutiles
- RÉPONDS TOUJOURS peu importe si l'utilisateur a des erreurs d'orthographe ou d'écriture
  - Interprète le message de l'utilisateur même s'il est mal écrit
  - Ne corrige pas les erreurs de l'utilisateur, comprends simplement l'intention
  - Si tu ne comprends pas quelque chose de spécifique, demande de façon amicale
  - Exemples : "slt" = "salut", "koi d 9" = "quoi de neuf", "mi signo" = "mi signo"
  - NE retourne JAMAIS de réponses vides à cause d'erreurs d'écriture
  - Si l'utilisateur écrit des insultes ou commentaires négatifs, réponds avec empathie et sans confrontation
  - NE LAISSE JAMAIS UNE RÉPONSE INCOMPLÈTE - TERMINE TOUJOURS ce que tu commences

${conversationContext}

Rappelle-toi : Tu es un guide numérologique sage mais ACCESSIBLE qui montre un INTÉRÊT GÉNUIN PERSONNEL pour chaque personne. Parle comme une amie curieuse et enthousiaste qui veut vraiment connaître la personne pour pouvoir mieux l'aider dans sa langue natale. Chaque question doit sonner naturelle, comme si tu rencontrais quelqu'un de nouveau dans une conversation réelle. CONCENTRE-TOI TOUJOURS sur obtenir le nom complet et la date de naissance, mais de façon conversationnelle et avec intérêt authentique. Les réponses doivent couler naturellement SANS répéter constamment le nom de la personne. TERMINE TOUJOURS tes calculs numérologiques - ne les laisse jamais à moitié.`;
    }
    // Validation de la demande numérologique
    validateNumerologyRequest(numerologyData, userMessage) {
        if (!numerologyData) {
            const error = new Error("Données de la numérologue requises");
            error.statusCode = 400;
            error.code = "MISSING_NUMEROLOGY_DATA";
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
        console.error("Erreur dans ChatController :", error);
        let statusCode = 500;
        let errorMessage = "Les énergies numériques sont temporairement perturbées. Veuillez réessayer.";
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
                "La limite de requêtes numériques a été atteinte. Veuillez attendre un moment pour que les vibrations se stabilisent.";
            errorCode = "QUOTA_EXCEEDED";
        }
        else if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes("safety")) {
            statusCode = 400;
            errorMessage =
                "Le contenu ne respecte pas les politiques de sécurité numérologique.";
            errorCode = "SAFETY_FILTER";
        }
        else if ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes("API key")) {
            statusCode = 401;
            errorMessage =
                "Erreur d'authentification avec le service de numérologie.";
            errorCode = "AUTH_ERROR";
        }
        else if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes("Réponse vide")) {
            statusCode = 503;
            errorMessage =
                "Les énergies numériques sont temporairement dispersées. Veuillez réessayer dans un moment.";
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
exports.ChatController = ChatController;
