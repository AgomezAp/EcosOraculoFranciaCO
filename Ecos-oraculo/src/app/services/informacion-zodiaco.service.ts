import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { environment } from '../environments/environmets.prod';

// ✅ Interfaces mises à jour pour le backend
export interface AstrologerData {
  name: string;
  title: string;
  specialty: string;
  experience: string;
}

export interface ZodiacRequest {
  zodiacData: AstrologerData;
  userMessage: string;
  birthDate?: string;
  zodiacSign?: string;
  conversationHistory?: Array<{
    role: 'user' | 'astrologer';
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

export interface ZodiacResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp: string;
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export interface AstrologerInfoResponse {
  success: boolean;
  astrologer: {
    name: string;
    title: string;
    specialty: string;
    description: string;
    services: string[];
  };
  freeMessagesLimit: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class InformacionZodiacoService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Envoie un message à l'astrologue et reçoit une réponse
   */
  chatWithAstrologer(request: ZodiacRequest): Observable<ZodiacResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.http
      .post<ZodiacResponse>(`${this.apiUrl}api/zodiac/chat`, request, {
        headers,
      })
      .pipe(
        timeout(60000), // 60 secondes de timeout
        catchError((error) => {
          console.error('Erreur dans chatWithAstrologer:', error);

          let errorMessage =
            "Erreur de communication avec l'astrologue. Veuillez réessayer.";
          let errorCode = 'NETWORK_ERROR';

          if (error.status === 429) {
            errorMessage =
              'Trop de requêtes. Veuillez patienter un moment avant de continuer.';
            errorCode = 'RATE_LIMIT';
          } else if (error.status === 503) {
            errorMessage =
              'Le service est temporairement indisponible. Réessayez dans quelques minutes.';
            errorCode = 'SERVICE_UNAVAILABLE';
          } else if (error.status === 400) {
            errorMessage =
              error.error?.error || 'Requête invalide. Vérifiez votre message.';
            errorCode = error.error?.code || 'BAD_REQUEST';
          } else if (error.status === 401) {
            errorMessage = "Erreur d'authentification avec le service.";
            errorCode = 'AUTH_ERROR';
          } else if (error.name === 'TimeoutError') {
            errorMessage =
              'La consultation a pris trop de temps. Veuillez réessayer.';
            errorCode = 'TIMEOUT';
          }

          return throwError(() => ({
            success: false,
            error: errorMessage,
            code: errorCode,
            timestamp: new Date().toISOString(),
          }));
        })
      );
  }

  /**
   * Obtient les informations de l'astrologue
   */
  getAstrologerInfo(): Observable<AstrologerInfoResponse> {
    return this.http
      .get<AstrologerInfoResponse>(`${this.apiUrl}api/zodiac/info`)
      .pipe(
        timeout(10000),
        catchError((error) => {
          console.error('Erreur dans getAstrologerInfo:', error);
          return throwError(() => ({
            success: false,
            error:
              "Erreur lors de l'obtention des informations de l'astrologue",
            timestamp: new Date().toISOString(),
          }));
        })
      );
  }

  /**
   * Calcule le signe du zodiaque en fonction de la date de naissance
   */
  calculateZodiacSign(birthDate: string): string {
    try {
      const date = new Date(birthDate);
      const month = date.getMonth() + 1;
      const day = date.getDate();

      if ((month === 3 && day >= 21) || (month === 4 && day <= 19))
        return 'Bélier ♈';
      if ((month === 4 && day >= 20) || (month === 5 && day <= 20))
        return 'Taureau ♉';
      if ((month === 5 && day >= 21) || (month === 6 && day <= 20))
        return 'Gémeaux ♊';
      if ((month === 6 && day >= 21) || (month === 7 && day <= 22))
        return 'Cancer ♋';
      if ((month === 7 && day >= 23) || (month === 8 && day <= 22))
        return 'Lion ♌';
      if ((month === 8 && day >= 23) || (month === 9 && day <= 22))
        return 'Vierge ♍';
      if ((month === 9 && day >= 23) || (month === 10 && day <= 22))
        return 'Balance ♎';
      if ((month === 10 && day >= 23) || (month === 11 && day <= 21))
        return 'Scorpion ♏';
      if ((month === 11 && day >= 22) || (month === 12 && day <= 21))
        return 'Sagittaire ♐';
      if ((month === 12 && day >= 22) || (month === 1 && day <= 19))
        return 'Capricorne ♑';
      if ((month === 1 && day >= 20) || (month === 2 && day <= 18))
        return 'Verseau ♒';
      if ((month === 2 && day >= 19) || (month === 3 && day <= 20))
        return 'Poissons ♓';

      return 'Signe inconnu';
    } catch {
      return 'Date invalide';
    }
  }
}
