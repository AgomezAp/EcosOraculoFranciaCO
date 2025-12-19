import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../environments/environmets.prod';

export interface LoveExpert {
  name: string;
  title: string;
  specialty: string;
  description: string;
  services: string[];
}

export interface LoveExpertInfo {
  success: boolean;
  loveExpert: LoveExpert;
  timestamp: string;
}

export interface LoveCalculatorData {
  name: string;
  specialty: string;
  experience: string;
}

export interface LoveCalculatorRequest {
  loveCalculatorData: LoveCalculatorData;
  userMessage: string;
  person1Name?: string;
  person1BirthDate?: string;
  person2Name?: string;
  person2BirthDate?: string;
  conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'user' | 'love_expert';
  message: string;
  timestamp: Date;
  id?: string;
}

export interface LoveCalculatorResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp?: string;
  freeMessagesRemaining?: number; // ✅ NOUVEAU
  showPaywall?: boolean; // ✅ NOUVEAU
  paywallMessage?: string; // ✅ NOUVEAU
  isCompleteResponse?: boolean; // ✅ NOUVEAU
}

export interface CompatibilityData {
  person1Name: string;
  person1BirthDate: string;
  person2Name: string;
  person2BirthDate: string;
}

@Injectable({
  providedIn: 'root',
})
export class CalculadoraAmorService {
  private readonly apiUrl = `${environment.apiUrl}`;
  private conversationHistorySubject = new BehaviorSubject<
    ConversationMessage[]
  >([]);
  private compatibilityDataSubject =
    new BehaviorSubject<CompatibilityData | null>(null);

  public conversationHistory$ = this.conversationHistorySubject.asObservable();
  public compatibilityData$ = this.compatibilityDataSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Obtient les informations de l'expert en amour
   */
  getLoveExpertInfo(): Observable<LoveExpertInfo> {
    return this.http
      .get<LoveExpertInfo>(`${this.apiUrl}info`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Envoie un message à l'expert en amour
   */
  chatWithLoveExpert(
    userMessage: string,
    person1Name?: string,
    person1BirthDate?: string,
    person2Name?: string,
    person2BirthDate?: string,
    conversationHistory?: Array<{
      role: 'user' | 'love_expert';
      message: string;
    }>,
    messageCount?: number, // ✅ NOUVEAU
    isPremiumUser?: boolean // ✅ NOUVEAU
  ): Observable<LoveCalculatorResponse> {
    const currentHistory = this.conversationHistorySubject.value;

    const requestData: LoveCalculatorRequest = {
      loveCalculatorData: {
        name: 'Maîtresse Valentine',
        specialty: 'Compatibilité numérologique et analyse des relations',
        experience:
          "Des décennies à analyser la compatibilité à travers les chiffres de l'amour",
      },
      userMessage,
      person1Name,
      person1BirthDate,
      person2Name,
      person2BirthDate,
      conversationHistory: currentHistory,
    };

    return this.http
      .post<LoveCalculatorResponse>(`${this.apiUrl}chat`, requestData)
      .pipe(
        map((response: any) => {
          if (response.success && response.response) {
            // Ajouter les messages à la conversation
            this.addMessageToHistory('user', userMessage);
            this.addMessageToHistory('love_expert', response.response);
          }
          return response;
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Calcule la compatibilité entre deux personnes
   */
  calculateCompatibility(
    compatibilityData: CompatibilityData
  ): Observable<LoveCalculatorResponse> {
    // Sauvegarder les données de compatibilité
    this.setCompatibilityData(compatibilityData);

    const message = `Je veux connaître la compatibilité entre ${compatibilityData.person1Name} et ${compatibilityData.person2Name}. S'il vous plaît, analysez notre compatibilité numérologique.`;

    return this.chatWithLoveExpert(
      message,
      compatibilityData.person1Name,
      compatibilityData.person1BirthDate,
      compatibilityData.person2Name,
      compatibilityData.person2BirthDate
    );
  }

  /**
   * Obtient des conseils sur les relations
   */
  getRelationshipAdvice(question: string): Observable<LoveCalculatorResponse> {
    const compatibilityData = this.compatibilityDataSubject.value;

    return this.chatWithLoveExpert(
      question,
      compatibilityData?.person1Name,
      compatibilityData?.person1BirthDate,
      compatibilityData?.person2Name,
      compatibilityData?.person2BirthDate
    );
  }

  /**
   * Ajoute un message à l'historique de conversation
   */
  private addMessageToHistory(
    role: 'user' | 'love_expert',
    message: string
  ): void {
    const currentHistory = this.conversationHistorySubject.value;
    const newMessage: ConversationMessage = {
      role,
      message,
      timestamp: new Date(),
    };

    const updatedHistory = [...currentHistory, newMessage];
    this.conversationHistorySubject.next(updatedHistory);
  }

  /**
   * Définit les données de compatibilité
   */
  setCompatibilityData(data: CompatibilityData): void {
    this.compatibilityDataSubject.next(data);
  }

  /**
   * Obtient les données de compatibilité actuelles
   */
  getCompatibilityData(): CompatibilityData | null {
    return this.compatibilityDataSubject.value;
  }

  /**
   * Efface l'historique de conversation
   */
  clearConversationHistory(): void {
    this.conversationHistorySubject.next([]);
  }

  /**
   * Efface les données de compatibilité
   */
  clearCompatibilityData(): void {
    this.compatibilityDataSubject.next(null);
  }

  /**
   * Réinitialise tout le service
   */
  resetService(): void {
    this.clearConversationHistory();
    this.clearCompatibilityData();
  }

  /**
   * Obtient l'historique actuel de conversation
   */
  getCurrentHistory(): ConversationMessage[] {
    return this.conversationHistorySubject.value;
  }

  /**
   * Vérifie si les données de compatibilité sont complètes
   */
  hasCompleteCompatibilityData(): boolean {
    const data = this.compatibilityDataSubject.value;
    return !!(
      data?.person1Name &&
      data?.person1BirthDate &&
      data?.person2Name &&
      data?.person2BirthDate
    );
  }

  /**
   * Formate une date pour le backend
   */
  formatDateForBackend(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Valide les données de compatibilité
   */
  validateCompatibilityData(data: Partial<CompatibilityData>): string[] {
    const errors: string[] = [];

    if (!data.person1Name?.trim()) {
      errors.push('Le nom de la première personne est requis');
    }

    if (!data.person1BirthDate?.trim()) {
      errors.push('La date de naissance de la première personne est requise');
    }

    if (!data.person2Name?.trim()) {
      errors.push('Le nom de la deuxième personne est requis');
    }

    if (!data.person2BirthDate?.trim()) {
      errors.push('La date de naissance de la deuxième personne est requise');
    }

    // Valider le format des dates
    if (data.person1BirthDate && !this.isValidDate(data.person1BirthDate)) {
      errors.push(
        "La date de naissance de la première personne n'est pas valide"
      );
    }

    if (data.person2BirthDate && !this.isValidDate(data.person2BirthDate)) {
      errors.push(
        "La date de naissance de la deuxième personne n'est pas valide"
      );
    }

    return errors;
  }

  /**
   * Vérifie si une date est valide
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Gère les erreurs HTTP
   */
  private handleError = (error: HttpErrorResponse): Observable<never> => {
    console.error('Erreur dans CalculadoraAmorService:', error);

    let errorMessage = 'Erreur inconnue';
    let errorCode = 'UNKNOWN_ERROR';

    if (error.error?.error) {
      errorMessage = error.error.error;
      errorCode = error.error.code || 'API_ERROR';
    } else if (error.status === 0) {
      errorMessage =
        'Impossible de se connecter au serveur. Vérifiez votre connexion Internet.';
      errorCode = 'CONNECTION_ERROR';
    } else if (error.status >= 400 && error.status < 500) {
      errorMessage =
        'Erreur dans la requête. Veuillez vérifier les données envoyées.';
      errorCode = 'CLIENT_ERROR';
    } else if (error.status >= 500) {
      errorMessage = 'Erreur du serveur. Veuillez réessayer plus tard.';
      errorCode = 'SERVER_ERROR';
    }

    return throwError(() => ({
      message: errorMessage,
      code: errorCode,
      status: error.status,
    }));
  };
}
