import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, timeout } from 'rxjs';
import { environment } from '../environments/environmets.prod';

// ✅ Interface pour les données du numérologue
interface NumerologyData {
  name: string;
  title?: string;
  specialty: string;
  experience: string;
}

// ✅ Interface du Request - EXPORTÉE
export interface NumerologyRequest {
  numerologyData: NumerologyData;
  userMessage: string;
  birthDate?: string;
  fullName?: string;
  conversationHistory?: Array<{
    role: 'user' | 'numerologist';
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

// ✅ Interface du Response - EXPORTÉE
export interface NumerologyResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp?: string;
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

// ✅ Interface pour les informations du numérologue - EXPORTÉE
export interface NumerologyInfo {
  success: boolean;
  numerologist: {
    name: string;
    title: string;
    specialty: string;
    description: string;
    services: string[];
  };
  freeMessagesLimit?: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class NumerologiaService {
  private appUrl: string;
  private apiUrl: string;

  // Données par défaut du numérologue
  private defaultNumerologyData: NumerologyData = {
    name: 'Maîtresse Sophie',
    title: 'Gardienne des Nombres Sacrés',
    specialty: 'Numérologie pythagoricienne',
    experience:
      'Des décennies d\'expérience dans les vibrations numériques de l\'univers',
  };

  constructor(private http: HttpClient) {
    this.appUrl = environment.apiUrl;
    this.apiUrl = 'api/numerology';
  }

  /**
   * ✅ MÉTHODE PRINCIPALE : Envoyer un message avec compteur de messages
   */
  sendMessageWithCount(
    userMessage: string,
    messageCount: number,
    isPremiumUser: boolean,
    birthDate?: string,
    fullName?: string,
    conversationHistory?: Array<{
      role: 'user' | 'numerologist';
      message: string;
    }>
  ): Observable<NumerologyResponse> {
    const request: NumerologyRequest = {
      numerologyData: this.defaultNumerologyData,
      userMessage: userMessage.trim(),
      birthDate,
      fullName,
      conversationHistory,
      messageCount,
      isPremiumUser,
    };

    console.log('📤 Envoi du message au numérologue :', {
      messageCount: request.messageCount,
      isPremiumUser: request.isPremiumUser,
      userMessage: request.userMessage.substring(0, 50) + '...',
    });

    return this.http
      .post<NumerologyResponse>(
        `${this.appUrl}${this.apiUrl}/numerologist`,
        request
      )
      .pipe(
        timeout(60000),
        map((response: NumerologyResponse) => {
          console.log('📥 Réponse du numérologue :', {
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
          console.error('Erreur de communication avec le numérologue :', error);
          return of({
            success: false,
            error: this.getErrorMessage(error),
            timestamp: new Date().toISOString(),
          } as NumerologyResponse);
        })
      );
  }

  /**
   * Méthode legacy pour compatibilité
   */
  sendMessage(
    userMessage: string,
    birthDate?: string,
    fullName?: string,
    conversationHistory?: Array<{
      role: 'user' | 'numerologist';
      message: string;
    }>
  ): Observable<string> {
    const request: NumerologyRequest = {
      numerologyData: this.defaultNumerologyData,
      userMessage: userMessage.trim(),
      birthDate,
      fullName,
      conversationHistory,
      messageCount: 1,
      isPremiumUser: false,
    };

    console.log(
      'Envoi du message au numérologue (legacy) :',
      this.apiUrl + '/numerologist'
    );

    return this.http
      .post<NumerologyResponse>(
        `${this.appUrl}${this.apiUrl}/numerologist`,
        request
      )
      .pipe(
        timeout(30000),
        map((response: NumerologyResponse) => {
          console.log('Réponse du numérologue :', response);
          if (response.success && response.response) {
            return response.response;
          }
          throw new Error(response.error || 'Réponse invalide du serveur');
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('Erreur de communication avec le numérologue :', error);
          return of(this.getErrorMessage(error));
        })
      );
  }

  /**
   * Obtenir les informations du numérologue
   */
  getNumerologyInfo(): Observable<NumerologyInfo> {
    return this.http
      .get<NumerologyInfo>(`${this.appUrl}${this.apiUrl}/numerologist/info`)
      .pipe(
        timeout(10000),
        catchError((error: HttpErrorResponse) => {
          console.error('Erreur lors de l\'obtention des infos du numérologue :', error);
          return of({
            success: false,
            numerologist: {
              name: 'Maîtresse Sophie',
              title: 'Gardienne des Nombres Sacrés',
              specialty: 'Numérologie pythagoricienne',
              description: 'Erreur de connexion avec le numérologue',
              services: [],
            },
            freeMessagesLimit: 3,
            timestamp: new Date().toISOString(),
          } as NumerologyInfo);
        })
      );
  }

  /**
   * Tester la connexion avec le backend
   */
  testConnection(): Observable<any> {
    return this.http.get(`${this.appUrl}api/health`).pipe(
      timeout(5000),
      catchError((error: HttpErrorResponse) => {
        console.error('Erreur de connexion :', error);
        return of({
          success: false,
          error: 'Impossible de se connecter au service de numérologie',
        });
      })
    );
  }

  /**
   * Calculer le nombre du chemin de vie
   */
  calculateLifePath(birthDate: string): number {
    try {
      const numbers = birthDate.replace(/\D/g, '');
      const sum = numbers
        .split('')
        .reduce((acc, digit) => acc + parseInt(digit), 0);
      return this.reduceToSingleDigit(sum);
    } catch {
      return 0;
    }
  }

  /**
   * Calculer le nombre du destin basé sur le nom
   */
  calculateDestinyNumber(name: string): number {
    const letterValues: { [key: string]: number } = {
      A: 1,
      B: 2,
      C: 3,
      D: 4,
      E: 5,
      F: 6,
      G: 7,
      H: 8,
      I: 9,
      J: 1,
      K: 2,
      L: 3,
      M: 4,
      N: 5,
      O: 6,
      P: 7,
      Q: 8,
      R: 9,
      S: 1,
      T: 2,
      U: 3,
      V: 4,
      W: 5,
      X: 6,
      Y: 7,
      Z: 8,
    };

    const sum = name
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .split('')
      .reduce((acc, letter) => {
        return acc + (letterValues[letter] || 0);
      }, 0);

    return this.reduceToSingleDigit(sum);
  }

  /**
   * Obtenir l'interprétation de base d'un nombre
   */
  getNumberMeaning(number: number): string {
    const meanings: { [key: number]: string } = {
      1: 'Leadership, indépendance, pionnier',
      2: 'Coopération, diplomatie, sensibilité',
      3: 'Créativité, communication, expression',
      4: 'Stabilité, travail acharné, organisation',
      5: 'Liberté, aventure, changement',
      6: 'Responsabilité, attention, harmonie',
      7: 'Spiritualité, introspection, analyse',
      8: 'Pouvoir matériel, ambition, accomplissements',
      9: 'Humanitarisme, compassion, sagesse',
      11: 'Inspiration, intuition, illumination (Nombre Maître)',
      22: 'Constructeur maître, vision pratique (Nombre Maître)',
      33: 'Maître guérisseur, service à l\'humanité (Nombre Maître)',
    };

    return meanings[number] || 'Nombre non reconnu';
  }

  /**
   * Méthode auxiliaire pour réduire à un chiffre unique
   */
  private reduceToSingleDigit(num: number): number {
    while (num > 9 && num !== 11 && num !== 22 && num !== 33) {
      num = num
        .toString()
        .split('')
        .reduce((acc, digit) => acc + parseInt(digit), 0);
    }
    return num;
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
      return 'Impossible de se connecter à la maîtresse de numérologie. Réessayez dans quelques minutes.';
    }

    if (error.error?.code === 'RATE_LIMIT_EXCEEDED') {
      return 'Trop de requêtes. Veuillez patienter un moment.';
    }

    if (error.error?.code === 'MISSING_NUMEROLOGY_DATA') {
      return 'Erreur dans les données du numérologue. Veuillez réessayer.';
    }

    if (error.error?.code === 'ALL_MODELS_UNAVAILABLE') {
      return 'Tous les modèles d\'IA sont temporairement indisponibles. Réessayez dans quelques minutes.';
    }

    return 'Désolé, les énergies numérologiques sont bloquées en ce moment. Je vous invite à méditer et à réessayer plus tard.';
  }
}