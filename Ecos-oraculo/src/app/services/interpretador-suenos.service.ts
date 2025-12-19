import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, timeout } from 'rxjs';
import { environment } from '../environments/environments';

export interface DreamInterpreterData {
  name: string;
  title?: string;
  specialty: string;
  experience: string;
}

export interface ConversationMessage {
  role: 'user' | 'interpreter';
  message: string;
  timestamp: Date | string;
  id?: string;
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  isCompleteResponse?: boolean;
  isPrizeAnnouncement?: boolean;
}

export interface DreamChatRequest {
  interpreterData: DreamInterpreterData;
  userMessage: string;
  conversationHistory?: ConversationMessage[];
  // ✅ NOUVEAUX CHAMPS pour le système de 3 messages gratuits
  messageCount?: number;
  isPremiumUser?: boolean;
}

export interface DreamChatResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp: string;
  // ✅ NOUVEAUX CHAMPS retournés par le backend
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export interface InterpreterInfo {
  success: boolean;
  interpreter: {
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
export class InterpretadorSuenosService {
  private apiUrl = `${environment.apiUrl}`;

  // Données par défaut de l'interprète
  private defaultInterpreterData: DreamInterpreterData = {
    name: 'Maîtresse Alma',
    title: 'Gardienne des Rêves',
    specialty: 'Interprétation des rêves et symbolisme onirique',
    experience:
      "Des siècles d'expérience à interpréter les messages du subconscient",
  };

  constructor(private http: HttpClient) {}

  /**
   * ✅ MÉTHODE PRINCIPALE : Envoyer un message avec compteur de messages
   */
  chatWithInterpreterWithCount(
    userMessage: string,
    messageCount: number,
    isPremiumUser: boolean,
    conversationHistory?: ConversationMessage[]
  ): Observable<DreamChatResponse> {
    const request: DreamChatRequest = {
      interpreterData: this.defaultInterpreterData,
      userMessage: userMessage.trim(),
      conversationHistory,
      messageCount,
      isPremiumUser,
    };

    console.log('📤 Envoi du message de rêves :', {
      messageCount: request.messageCount,
      isPremiumUser: request.isPremiumUser,
      userMessage: request.userMessage.substring(0, 50) + '...',
    });

    return this.http
      .post<DreamChatResponse>(`${this.apiUrl}interpretador-sueno`, request)
      .pipe(
        timeout(60000),
        map((response: DreamChatResponse) => {
          console.log('📥 Réponse de rêves :', {
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
          console.error("Erreur de communication avec l'interprète :", error);
          return of({
            success: false,
            error: this.getErrorMessage(error),
            timestamp: new Date().toISOString(),
          } as DreamChatResponse);
        })
      );
  }

  /**
   * Méthode legacy pour compatibilité
   */
  chatWithInterpreter(
    request: DreamChatRequest
  ): Observable<DreamChatResponse> {
    const fullRequest: DreamChatRequest = {
      ...request,
      interpreterData: request.interpreterData || this.defaultInterpreterData,
      messageCount: request.messageCount || 1,
      isPremiumUser: request.isPremiumUser || false,
    };

    return this.http
      .post<DreamChatResponse>(`${this.apiUrl}interpretador-sueno`, fullRequest)
      .pipe(
        timeout(30000),
        catchError((error: HttpErrorResponse) => {
          console.error('Erreur dans chatWithInterpreter :', error);
          return of({
            success: false,
            error: this.getErrorMessage(error),
            timestamp: new Date().toISOString(),
          } as DreamChatResponse);
        })
      );
  }

  /**
   * Obtenir les informations de l'interprète
   */
  getInterpreterInfo(): Observable<InterpreterInfo> {
    return this.http
      .get<InterpreterInfo>(`${this.apiUrl}interpretador-sueno/info`)
      .pipe(
        timeout(10000),
        catchError((error: HttpErrorResponse) => {
          console.error(
            "Erreur lors de l'obtention des infos de l'interprète :",
            error
          );
          return of({
            success: false,
            interpreter: {
              name: 'Maîtresse Alma',
              title: 'Gardienne des Rêves',
              specialty: 'Interprétation des rêves et symbolisme onirique',
              description: "Erreur de connexion avec l'interprète",
              services: [],
            },
            freeMessagesLimit: 3,
            timestamp: new Date().toISOString(),
          } as InterpreterInfo);
        })
      );
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
      return "Impossible de se connecter à l'interprète des rêves. Réessayez dans quelques minutes.";
    }

    if (error.error?.code === 'RATE_LIMIT_EXCEEDED') {
      return 'Trop de requêtes. Veuillez patienter un moment.';
    }

    if (error.error?.code === 'ALL_MODELS_UNAVAILABLE') {
      return "Tous les modèles d'IA sont temporairement indisponibles. Réessayez dans quelques minutes.";
    }

    return 'Désolé, les énergies oniriques sont perturbées en ce moment. Réessayez plus tard.';
  }
}
