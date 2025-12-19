import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, timeout } from 'rxjs';
import { environment } from '../environments/environmets.prod';

// ✅ Interface pour les données du conseiller d'orientation
interface VocationalData {
  name: string;
  title?: string;
  specialty: string;
  experience: string;
}

// ✅ Interface du Request - EXPORTÉE
export interface VocationalRequest {
  vocationalData: VocationalData;
  userMessage: string;
  personalInfo?: any;
  assessmentAnswers?: any[];
  conversationHistory?: Array<{
    role: 'user' | 'counselor';
    message: string;
  }>;
  // ✅ NOUVEAUX CHAMPS pour le système de 3 messages gratuits
  messageCount?: number;
  isPremiumUser?: boolean;
}

// ✅ Interface du Response - EXPORTÉE
export interface VocationalResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp?: string;
  // ✅ NOUVEAUX CHAMPS retournés par le backend
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

// ✅ Interface pour les informations du conseiller - EXPORTÉE
export interface CounselorInfo {
  success: boolean;
  counselor: {
    name: string;
    title: string;
    specialty: string;
    description: string;
    services: string[];
  };
  freeMessagesLimit?: number;
  timestamp: string;
}

interface AssessmentQuestion {
  id: number;
  question: string;
  options: Array<{
    value: string;
    label: string;
    category: string;
  }>;
}

interface AssessmentAnswer {
  question: string;
  answer: string;
  category: string;
}

interface VocationalProfile {
  name: string;
  description: string;
  characteristics: string[];
  workEnvironments: string[];
}

@Injectable({
  providedIn: 'root',
})
export class MapaVocacionalService {
  private appUrl: string;
  private apiUrl: string;

  // Données par défaut du conseiller d'orientation
  private defaultVocationalData: VocationalData = {
    name: 'Dr. Valérie',
    title: 'Spécialiste en Orientation Professionnelle',
    specialty: 'Orientation professionnelle et lettres de carrière personnalisées',
    experience:
      'Des années d\'expérience en orientation professionnelle et développement de carrière',
  };

  // Profils professionnels
  private vocationalProfiles: { [key: string]: VocationalProfile } = {
    realistic: {
      name: 'Réaliste',
      description:
        'Préfère les activités pratiques et travailler avec des outils, des machines ou des animaux.',
      characteristics: ['Pratique', 'Mécanicien', 'Athlétique', 'Direct'],
      workEnvironments: [
        'Plein air',
        'Ateliers',
        'Laboratoires',
        'Construction',
      ],
    },
    investigative: {
      name: 'Investigateur',
      description:
        'Aime résoudre des problèmes complexes et mener des recherches.',
      characteristics: ['Analytique', 'Curieux', 'Indépendant', 'Réservé'],
      workEnvironments: [
        'Laboratoires',
        'Universités',
        'Centres de recherche',
      ],
    },
    artistic: {
      name: 'Artistique',
      description:
        'Valorise l\'expression personnelle, la créativité et le travail non structuré.',
      characteristics: ['Créatif', 'Original', 'Indépendant', 'Expressif'],
      workEnvironments: ['Studios', 'Théâtres', 'Agences créatives', 'Musées'],
    },
    social: {
      name: 'Social',
      description: 'Préfère travailler avec les gens, aider et enseigner.',
      characteristics: ['Coopératif', 'Empathique', 'Patient', 'Généreux'],
      workEnvironments: [
        'Écoles',
        'Hôpitaux',
        'ONG',
        'Services sociaux',
      ],
    },
    enterprising: {
      name: 'Entrepreneur',
      description:
        'Aime diriger, persuader et prendre des décisions commerciales.',
      characteristics: ['Ambitieux', 'Énergique', 'Dominant', 'Optimiste'],
      workEnvironments: ['Entreprises', 'Ventes', 'Politique', 'Startups'],
    },
    conventional: {
      name: 'Conventionnel',
      description:
        'Préfère les activités ordonnées, en suivant des procédures établies.',
      characteristics: ['Organisé', 'Précis', 'Efficace', 'Pratique'],
      workEnvironments: [
        'Bureaux',
        'Banques',
        'Comptabilité',
        'Administration',
      ],
    },
  };

  constructor(private http: HttpClient) {
    this.appUrl = environment.apiUrl;
    this.apiUrl = 'api/vocational';
  }

  /**
   * ✅ MÉTHODE PRINCIPALE : Envoyer un message avec compteur de messages
   */
  sendMessageWithCount(
    userMessage: string,
    messageCount: number,
    isPremiumUser: boolean,
    personalInfo?: any,
    assessmentAnswers?: any[],
    conversationHistory?: Array<{ role: 'user' | 'counselor'; message: string }>
  ): Observable<VocationalResponse> {
    const request: VocationalRequest = {
      vocationalData: this.defaultVocationalData,
      userMessage: userMessage.trim(),
      personalInfo,
      assessmentAnswers,
      conversationHistory,
      messageCount,
      isPremiumUser,
    };

    console.log('📤 Envoi du message d\'orientation :', {
      messageCount: request.messageCount,
      isPremiumUser: request.isPremiumUser,
      userMessage: request.userMessage.substring(0, 50) + '...',
    });

    return this.http
      .post<VocationalResponse>(`${this.appUrl}${this.apiUrl}/counselor`, request)
      .pipe(
        timeout(60000),
        map((response: VocationalResponse) => {
          console.log('📥 Réponse d\'orientation :', {
            success: response.success,
            freeMessagesRemaining: response.freeMessagesRemaining,
            showPaywall: response.showPaywall,
            isCompleteResponse: response.isCompleteResponse,
          });

          if (response.success) {
            return response;
          }
          throw new Error(response.error || 'Réponse invalide du serveur');
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('Erreur de communication d\'orientation :', error);
          return of({
            success: false,
            error: this.getErrorMessage(error),
            timestamp: new Date().toISOString(),
          } as VocationalResponse);
        })
      );
  }

  /**
   * Méthode legacy pour compatibilité
   */
  sendMessage(
    userMessage: string,
    personalInfo?: any,
    assessmentAnswers?: any[],
    conversationHistory?: Array<{ role: 'user' | 'counselor'; message: string }>
  ): Observable<string> {
    const request: VocationalRequest = {
      vocationalData: this.defaultVocationalData,
      userMessage: userMessage.trim(),
      personalInfo,
      assessmentAnswers,
      conversationHistory,
      messageCount: 1,
      isPremiumUser: false,
    };

    return this.http
      .post<VocationalResponse>(`${this.appUrl}${this.apiUrl}/counselor`, request)
      .pipe(
        timeout(30000),
        map((response: VocationalResponse) => {
          if (response.success && response.response) {
            return response.response;
          }
          throw new Error(response.error || 'Réponse invalide du serveur');
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('Erreur de communication d\'orientation :', error);
          return of(this.getErrorMessage(error));
        })
      );
  }

  /**
   * Obtenir les questions de l'évaluation
   */
  getAssessmentQuestions(): Observable<AssessmentQuestion[]> {
    return of(this.getDefaultQuestions());
  }

  /**
   * Analyser les réponses de l'évaluation
   */
  analyzeAssessment(answers: AssessmentAnswer[]): Observable<any> {
    const categoryCount: { [key: string]: number } = {};

    answers.forEach((answer) => {
      if (answer.category) {
        categoryCount[answer.category] =
          (categoryCount[answer.category] || 0) + 1;
      }
    });

    const total = answers.length;
    const distribution = Object.entries(categoryCount)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const dominantCategory = distribution[0]?.category || 'social';
    const dominantProfile =
      this.vocationalProfiles[dominantCategory] ||
      this.vocationalProfiles['social'];

    return of({
      profileDistribution: distribution,
      dominantProfile,
      recommendations: this.getRecommendations(dominantCategory),
    });
  }

  /**
   * Obtenir l'emoji de la catégorie
   */
  getCategoryEmoji(category: string): string {
    const emojis: { [key: string]: string } = {
      realistic: '🔧',
      investigative: '🔬',
      artistic: '🎨',
      social: '🤝',
      enterprising: '💼',
      conventional: '📊',
    };
    return emojis[category] || '⭐';
  }

  /**
   * Obtenir la couleur de la catégorie
   */
  getCategoryColor(category: string): string {
    const colors: { [key: string]: string } = {
      realistic: '#4CAF50',
      investigative: '#2196F3',
      artistic: '#9C27B0',
      social: '#FF9800',
      enterprising: '#F44336',
      conventional: '#607D8B',
    };
    return colors[category] || '#757575';
  }

  /**
   * Obtenir les questions par défaut
   */
  private getDefaultQuestions(): AssessmentQuestion[] {
    return [
      {
        id: 1,
        question:
          'Quel type d\'activité préférez-vous faire pendant votre temps libre ?',
        options: [
          {
            value: 'a',
            label: 'Construire ou réparer des choses',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'Lire et rechercher de nouveaux sujets',
            category: 'investigative',
          },
          { value: 'c', label: 'Créer de l\'art ou de la musique', category: 'artistic' },
          { value: 'd', label: 'Aider les autres', category: 'social' },
          {
            value: 'e',
            label: 'Organiser des événements ou diriger des groupes',
            category: 'enterprising',
          },
          {
            value: 'f',
            label: 'Organiser et classer des informations',
            category: 'conventional',
          },
        ],
      },
      {
        id: 2,
        question:
          'Dans quel type d\'environnement de travail vous sentiriez-vous le plus à l\'aise ?',
        options: [
          {
            value: 'a',
            label: 'En plein air ou dans un atelier',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'Dans un laboratoire ou un centre de recherche',
            category: 'investigative',
          },
          { value: 'c', label: 'Dans un studio créatif', category: 'artistic' },
          {
            value: 'd',
            label: 'Dans une école ou un hôpital',
            category: 'social',
          },
          {
            value: 'e',
            label: 'Dans une entreprise ou une startup',
            category: 'enterprising',
          },
          {
            value: 'f',
            label: 'Dans un bureau bien organisé',
            category: 'conventional',
          },
        ],
      },
      {
        id: 3,
        question: 'Laquelle de ces compétences vous décrit le mieux ?',
        options: [
          {
            value: 'a',
            label: 'Habileté manuelle et technique',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'Pensée analytique',
            category: 'investigative',
          },
          {
            value: 'c',
            label: 'Créativité et imagination',
            category: 'artistic',
          },
          { value: 'd', label: 'Empathie et communication', category: 'social' },
          {
            value: 'e',
            label: 'Leadership et persuasion',
            category: 'enterprising',
          },
          {
            value: 'f',
            label: 'Organisation et précision',
            category: 'conventional',
          },
        ],
      },
      {
        id: 4,
        question: 'Quel type de problème préféreriez-vous résoudre ?',
        options: [
          {
            value: 'a',
            label: 'Réparer une machine en panne',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'Découvrir pourquoi quelque chose fonctionne d\'une certaine manière',
            category: 'investigative',
          },
          {
            value: 'c',
            label: 'Concevoir quelque chose de nouveau et original',
            category: 'artistic',
          },
          {
            value: 'd',
            label: 'Aider quelqu\'un avec un problème personnel',
            category: 'social',
          },
          {
            value: 'e',
            label: 'Trouver une opportunité d\'affaires',
            category: 'enterprising',
          },
          {
            value: 'f',
            label: 'Optimiser un processus existant',
            category: 'conventional',
          },
        ],
      },
      {
        id: 5,
        question: 'Quelle matière préfériez-vous à l\'école ?',
        options: [
          {
            value: 'a',
            label: 'Éducation physique ou technologie',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'Sciences ou mathématiques',
            category: 'investigative',
          },
          { value: 'c', label: 'Art ou musique', category: 'artistic' },
          {
            value: 'd',
            label: 'Sciences sociales ou langues',
            category: 'social',
          },
          { value: 'e', label: 'Économie ou débat', category: 'enterprising' },
          {
            value: 'f',
            label: 'Informatique ou comptabilité',
            category: 'conventional',
          },
        ],
      },
    ];
  }

  /**
   * Obtenir les recommandations selon la catégorie
   */
  private getRecommendations(category: string): string[] {
    const recommendations: { [key: string]: string[] } = {
      realistic: [
        'Ingénierie mécanique ou civile',
        'Technicien de maintenance',
        'Menuiserie ou électricité',
        'Agriculture ou médecine vétérinaire',
      ],
      investigative: [
        'Sciences naturelles ou médecine',
        'Recherche scientifique',
        'Analyse de données',
        'Programmation et développement de logiciels',
      ],
      artistic: [
        'Design graphique ou industriel',
        'Beaux-arts ou musique',
        'Architecture',
        'Production audiovisuelle',
      ],
      social: [
        'Psychologie ou travail social',
        'Éducation ou pédagogie',
        'Soins infirmiers ou médecine',
        'Ressources humaines',
      ],
      enterprising: [
        'Administration des affaires',
        'Marketing et ventes',
        'Droit',
        'Entrepreneuriat',
      ],
      conventional: [
        'Comptabilité et finances',
        'Administration publique',
        'Secrétariat exécutif',
        'Logistique et opérations',
      ],
    };
    return recommendations[category] || recommendations['social'];
  }

  /**
   * Gestion des erreurs HTTP
   */
  private getErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 429) {
      return 'Vous avez effectué trop de consultations. Veuillez patienter un moment avant de continuer.';
    }

    if (error.status === 503) {
      return 'Le service est temporairement indisponible. Réessayez dans quelques minutes.';
    }

    if (error.status === 0) {
      return 'Impossible de se connecter au conseiller d\'orientation. Réessayez dans quelques minutes.';
    }

    return 'Désolé, je rencontre des difficultés techniques. Veuillez réessayer plus tard.';
  }
}