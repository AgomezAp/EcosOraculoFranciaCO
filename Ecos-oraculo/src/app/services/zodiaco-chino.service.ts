import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../environments/environments';

interface ChineseZodiacData {
  name: string;
  specialty: string;
  experience: string;
}

interface ChatMessage {
  role: 'user' | 'master';
  message: string;
  timestamp?: string;
}

interface ChineseZodiacRequest {
  zodiacData: ChineseZodiacData;
  userMessage: string;
  birthYear?: string;
  birthDate?: string;
  fullName?: string;
  conversationHistory?: ChatMessage[];
  // ✅ NOUVEAUX CHAMPS pour le système de 3 messages gratuits
  messageCount?: number;
  isPremiumUser?: boolean;
}

interface ChatResponse {
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

interface MasterInfo {
  success: boolean;
  master: {
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
export class ZodiacoChinoService {
  private apiUrl = `${environment.apiUrl}api/zodiaco-chino`;

  constructor(private http: HttpClient) {}

  /**
   * Obtenir les informations du maître
   */
  getMasterInfo(): Observable<MasterInfo> {
    return this.http.get<MasterInfo>(`${this.apiUrl}/info`);
  }

  /**
   * ✅ MÉTHODE PRINCIPALE : Envoyer un message avec compteur de messages
   */
  chatWithMasterWithCount(
    request: ChineseZodiacRequest,
    messageCount: number,
    isPremiumUser: boolean
  ): Observable<ChatResponse> {
    const fullRequest: ChineseZodiacRequest = {
      ...request,
      messageCount,
      isPremiumUser,
    };

    return this.http.post<ChatResponse>(`${this.apiUrl}/chat`, fullRequest);
  }

  /**
   * Méthode legacy pour compatibilité
   */
  chatWithMaster(request: ChineseZodiacRequest): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.apiUrl}/chat`, request);
  }
}
