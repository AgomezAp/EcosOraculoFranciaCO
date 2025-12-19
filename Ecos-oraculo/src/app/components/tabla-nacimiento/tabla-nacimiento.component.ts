import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
  Optional,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  BirthChartRequest,
  BirthChartResponse,
  TablaNacimientoService,
} from '../../services/tabla-nacimiento.service';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PaypalService } from '../../services/paypal.service';

import { HttpClient } from '@angular/common/http';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RecolectaDatosComponent } from '../recolecta-datos/recolecta-datos.component';
import { environment } from '../../environments/environmets.prod';
import { Observable, map, catchError, of } from 'rxjs';
import {
  FortuneWheelComponent,
  Prize,
} from '../fortune-wheel/fortune-wheel.component';

interface BirthChartMessage {
  content: string;
  isUser: boolean;
  timestamp: Date;
  sender: string;
}

interface Message {
  sender: string;
  content: string;
  timestamp: Date;
  isUser: boolean;
  id?: string;
}

interface ChartData {
  sunSign?: string;
  moonSign?: string;
  ascendant?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  fullName?: string;
}

interface AstrologerInfo {
  name: string;
  title: string;
  specialty: string;
}

@Component({
  selector: 'app-tabla-nacimiento',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    RecolectaDatosComponent,
  ],
  templateUrl: './tabla-nacimiento.component.html',
  styleUrl: './tabla-nacimiento.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablaNacimientoComponent
  implements OnInit, AfterViewChecked, OnDestroy, AfterViewInit
{
  @ViewChild('chatContainer') chatContainer!: ElementRef;

  // Chat et messages
  messages: Message[] = [];
  currentMessage: string = '';
  isLoading: boolean = false;

  // Contrôle du défilement
  private shouldScrollToBottom: boolean = true;
  private isUserScrolling: boolean = false;
  private lastMessageCount: number = 0;

  // Données personnelles et thème
  chartData: ChartData = {};
  fullName: string = '';
  birthDate: string = '';
  birthTime: string = '';
  birthPlace: string = '';
  showDataForm: boolean = false;

  // Informations de l'astrologue
  astrologerInfo: AstrologerInfo = {
    name: 'Maître Emma',
    title: 'Gardienne des Configurations Célestes',
    specialty: 'Spécialiste en Thèmes Natals et Astrologie Transpersonnelle',
  };

  // Données à envoyer
  showDataModal: boolean = false;
  userData: any = null;

  // Variables pour la roue de la fortune
  showFortuneWheel: boolean = false;
  birthChartPrizes: Prize[] = [
    {
      id: '1',
      name: '3 tours de la Roue Natale',
      color: '#4ecdc4',
      icon: '🌟',
    },
    {
      id: '2',
      name: '1 Analyse Premium du Thème Natal',
      color: '#45b7d1',
      icon: '✨',
    },
    {
      id: '4',
      name: 'Réessayez !',
      color: '#ff7675',
      icon: '🔮',
    },
  ];
  private wheelTimer: any;

  // Système de paiements
  showPaymentModal: boolean = false;
  clientSecret: string | null = null;
  isProcessingPayment: boolean = false;
  paymentError: string | null = null;
  hasUserPaidForBirthTable: boolean = false;
  blockedMessageId: string | null = null;

  // ✅ NOUVEAU : Système de 3 messages gratuits
  private userMessageCount: number = 0;
  private readonly FREE_MESSAGES_LIMIT = 3;

  private backendUrl = environment.apiUrl;

  constructor(
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
    @Optional() public dialogRef: MatDialogRef<TablaNacimientoComponent>,
    private http: HttpClient,
    private tablaNacimientoService: TablaNacimientoService,
    private elRef: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private paypalService: PaypalService
  ) {}

  ngAfterViewInit(): void {
    this.setVideosSpeed(0.6); // 0.5 = plus lent, 1 = normal
  }

  private setVideosSpeed(rate: number): void {
    const host = this.elRef.nativeElement;
    const videos = host.querySelectorAll<HTMLVideoElement>('video');
    videos.forEach((v) => {
      const apply = () => (v.playbackRate = rate);
      if (v.readyState >= 1) apply();
      else v.addEventListener('loadedmetadata', apply, { once: true });
    });
  }

  async ngOnInit(): Promise<void> {
    this.hasUserPaidForBirthTable =
      sessionStorage.getItem('hasUserPaidForBirthTable_geburtstabelle') ===
      'true';

    const paymentStatus = this.paypalService.checkPaymentStatusFromUrl();

    if (paymentStatus && paymentStatus.status === 'COMPLETED') {
      try {
        const verification = await this.paypalService.verifyAndProcessPayment(
          paymentStatus.token
        );

        if (verification.valid && verification.status === 'approved') {
          this.hasUserPaidForBirthTable = true;
          sessionStorage.setItem(
            'hasUserPaidForBirthTable_geburtstabelle',
            'true'
          );
          localStorage.removeItem('paypal_payment_completed');

          this.blockedMessageId = null;
          sessionStorage.removeItem('vocationalBlockedMessageId');

          // Effacer l'URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          this.messages.push({
            sender: 'Maître Emma',
            content:
              '✨ Paiement confirmé ! Vous pouvez maintenant accéder à toute mon expérience.',
            timestamp: new Date(),
            isUser: false,
          });

          this.saveMessagesToSession();

          this.cdr.markForCheck();
        }
      } catch (error) {
        console.error(
          'Erreur lors de la vérification du paiement PayPal :',
          error
        );
        this.paymentError = 'Erreur lors de la vérification du paiement';
      }
    }

    // ✅ NOUVEAU : Charger le compteur de messages
    const savedMessageCount = sessionStorage.getItem(
      'birthChartUserMessageCount'
    );
    if (savedMessageCount) {
      this.userMessageCount = parseInt(savedMessageCount, 10);
    }

    // ✅ NOUVEAU : Charger les données de l'utilisateur depuis sessionStorage
    const savedUserData = sessionStorage.getItem('userData');
    if (savedUserData) {
      try {
        this.userData = JSON.parse(savedUserData);
      } catch (error) {
        this.userData = null;
      }
    } else {
      this.userData = null;
    }

    // Charger les données sauvegardées
    this.loadSavedData();

    // Message de bienvenue
    if (this.messages.length === 0) {
      this.initializeBirthChartWelcomeMessage();
    }

    // ✅ ÉGALEMENT VÉRIFIER POUR LES MESSAGES RESTAURÉS
    if (this.messages.length > 0 && FortuneWheelComponent.canShowWheel()) {
      this.showBirthChartWheelAfterDelay(2000);
    }
  }

  private initializeBirthChartWelcomeMessage(): void {
    this.addMessage({
      sender: 'Maître Emma',
      content: `🌟 Bonjour, chercheur des secrets célestes ! Je suis Emma, votre guide dans le cosmos des configurations astrales. 

Je suis ici pour déchiffrer les secrets cachés dans votre thème natal. Les étoiles ont attendu ce moment pour vous révéler leur sagesse.

Quel aspect de votre thème natal souhaitez-vous explorer en premier ?`,
      timestamp: new Date(),
      isUser: false,
    });

    // ✅ VÉRIFICATION DE LA ROUE NATALE
    if (FortuneWheelComponent.canShowWheel()) {
      this.showBirthChartWheelAfterDelay(3000);
    } else {
    }
  }

  ngAfterViewChecked(): void {
    if (
      this.shouldScrollToBottom &&
      !this.isUserScrolling &&
      this.messages.length > this.lastMessageCount
    ) {
      this.scrollToBottom();
      this.lastMessageCount = this.messages.length;
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }
  }

  private loadSavedData(): void {
    const savedMessages = sessionStorage.getItem('birthChartMessages');
    const savedBlockedMessageId = sessionStorage.getItem(
      'birthChartBlockedMessageId'
    );
    const savedChartData = sessionStorage.getItem('birthChartData');

    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        this.messages = parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        this.blockedMessageId = savedBlockedMessageId || null;
        this.lastMessageCount = this.messages.length;
      } catch (error) {
        // Nettoyer les données corrompues
        this.initializeBirthChartWelcomeMessage();
      }
    }

    if (savedChartData) {
      try {
        this.chartData = JSON.parse(savedChartData);
        this.fullName = this.chartData.fullName || '';
        this.birthDate = this.chartData.birthDate || '';
        this.birthTime = this.chartData.birthTime || '';
        this.birthPlace = this.chartData.birthPlace || '';
      } catch (error) {}
    }
  }

  // ✅ NOUVEAU : Obtenir les messages gratuits restants
  getFreeMessagesRemaining(): number {
    if (this.hasUserPaidForBirthTable) {
      return -1; // Illimité
    }
    return Math.max(0, this.FREE_MESSAGES_LIMIT - this.userMessageCount);
  }

  sendMessage(): void {
    if (this.currentMessage?.trim() && !this.isLoading) {
      const userMessage = this.currentMessage.trim();

      // Calculer le prochain numéro de message
      const nextMessageCount = this.userMessageCount + 1;

      console.log(
        `📊 Thème Natal - Message #${nextMessageCount}, Premium : ${this.hasUserPaidForBirthTable}, Limite : ${this.FREE_MESSAGES_LIMIT}`
      );

      // ✅ Vérifier l'accès
      const canSendMessage =
        this.hasUserPaidForBirthTable ||
        this.hasFreeBirthChartConsultationsAvailable() ||
        nextMessageCount <= this.FREE_MESSAGES_LIMIT;

      if (!canSendMessage) {
        console.log('❌ Sans accès - affichage du modal de paiement');

        // Fermer les autres modals
        this.showFortuneWheel = false;
        this.showPaymentModal = false;

        // Sauvegarder le message en attente
        sessionStorage.setItem('pendingBirthChartMessage', userMessage);
        this.saveStateBeforePayment();

        // Afficher le modal de données
        setTimeout(() => {
          this.showDataModal = true;
          this.cdr.markForCheck();
        }, 100);

        return;
      }

      // ✅ Si utilisation d'une consultation gratuite de la roulette (après les 3 gratuites)
      if (
        !this.hasUserPaidForBirthTable &&
        nextMessageCount > this.FREE_MESSAGES_LIMIT &&
        this.hasFreeBirthChartConsultationsAvailable()
      ) {
        this.useFreeBirthChartConsultation();
      }

      this.shouldScrollToBottom = true;

      // Traiter le message normalement
      this.processBirthChartUserMessage(userMessage, nextMessageCount);
    }
  }

  private processBirthChartUserMessage(
    userMessage: string,
    messageCount: number
  ): void {
    // Ajouter le message de l'utilisateur
    const userMsg = {
      sender: 'Vous',
      content: userMessage,
      timestamp: new Date(),
      isUser: true,
    };
    this.messages.push(userMsg);

    // ✅ Mettre à jour le compteur
    this.userMessageCount = messageCount;
    sessionStorage.setItem(
      'birthChartUserMessageCount',
      this.userMessageCount.toString()
    );

    this.saveMessagesToSession();
    this.currentMessage = '';
    this.isLoading = true;

    // ✅ Utiliser le service réel du thème natal avec compteur
    this.generateAstrologicalResponse(userMessage, messageCount).subscribe({
      next: (response: any) => {
        this.isLoading = false;

        const messageId = Date.now().toString();
        const astrologerMsg = {
          sender: 'Maître Emma',
          content: response,
          timestamp: new Date(),
          isUser: false,
          id: messageId,
        };
        this.messages.push(astrologerMsg);

        this.shouldScrollToBottom = true;

        // ✅ Afficher le paywall si la limite gratuite est dépassée ET pas de consultations de roulette
        const shouldShowPaywall =
          !this.hasUserPaidForBirthTable &&
          messageCount > this.FREE_MESSAGES_LIMIT &&
          !this.hasFreeBirthChartConsultationsAvailable();

        if (shouldShowPaywall) {
          this.blockedMessageId = messageId;
          sessionStorage.setItem('birthChartBlockedMessageId', messageId);

          setTimeout(() => {
            this.saveStateBeforePayment();

            // Fermer les autres modals
            this.showFortuneWheel = false;
            this.showPaymentModal = false;

            // Afficher le modal de données
            setTimeout(() => {
              this.showDataModal = true;
              this.cdr.markForCheck();
            }, 100);
          }, 2000);
        }

        this.saveMessagesToSession();
        this.cdr.markForCheck();
      },
      error: (error: any) => {
        this.isLoading = false;

        const errorMsg = {
          sender: 'Maître Emma',
          content:
            '🌟 Désolée, les configurations célestes sont temporairement perturbées. Veuillez réessayer dans quelques instants.',
          timestamp: new Date(),
          isUser: false,
        };
        this.messages.push(errorMsg);
        this.saveMessagesToSession();
        this.cdr.markForCheck();
      },
    });
  }

  private generateAstrologicalResponse(
    userMessage: string,
    messageCount: number
  ): Observable<string> {
    // Créer l'historique de conversation pour le contexte
    const conversationHistory = this.messages
      .filter((msg) => msg.content && msg.content.trim() !== '')
      .map((msg) => ({
        role: msg.isUser ? ('user' as const) : ('astrologer' as const),
        message: msg.content,
      }));

    // Créer la requête avec la structure correcte
    const request: BirthChartRequest = {
      chartData: {
        name: this.astrologerInfo.name,
        specialty: this.astrologerInfo.specialty,
        experience:
          "Des siècles d'expérience dans l'interprétation des configurations célestes et des secrets des thèmes natals",
      },
      userMessage,
      birthDate: this.birthDate,
      birthTime: this.birthTime,
      birthPlace: this.birthPlace,
      fullName: this.fullName,
      conversationHistory,
    };

    // ✅ Appeler le service avec compteur de messages
    return this.tablaNacimientoService
      .chatWithAstrologerWithCount(
        request,
        messageCount,
        this.hasUserPaidForBirthTable
      )
      .pipe(
        map((response: BirthChartResponse) => {
          if (response.success && response.response) {
            return response.response;
          } else {
            throw new Error(response.error || 'Erreur de service inconnue');
          }
        }),
        catchError((error: any) => {
          return of(
            '🌟 Les configurations célestes sont temporairement voilées. Les étoiles me murmurent que je dois recharger mes énergies cosmiques. Veuillez réessayer dans quelques instants.'
          );
        })
      );
  }

  private saveStateBeforePayment(): void {
    this.saveMessagesToSession();
    this.saveChartData();
    sessionStorage.setItem(
      'birthChartUserMessageCount',
      this.userMessageCount.toString()
    );
    if (this.blockedMessageId) {
      sessionStorage.setItem(
        'birthChartBlockedMessageId',
        this.blockedMessageId
      );
    }
  }

  private saveMessagesToSession(): void {
    try {
      const messagesToSave = this.messages.map((msg) => ({
        ...msg,
        timestamp:
          msg.timestamp instanceof Date
            ? msg.timestamp.toISOString()
            : msg.timestamp,
      }));
      sessionStorage.setItem(
        'birthChartMessages',
        JSON.stringify(messagesToSave)
      );
    } catch {}
  }

  private saveChartData(): void {
    try {
      const dataToSave = {
        ...this.chartData,
        fullName: this.fullName,
        birthDate: this.birthDate,
        birthTime: this.birthTime,
        birthPlace: this.birthPlace,
      };
      sessionStorage.setItem('birthChartData', JSON.stringify(dataToSave));
    } catch {}
  }

  isMessageBlocked(message: Message): boolean {
    return (
      message.id === this.blockedMessageId && !this.hasUserPaidForBirthTable
    );
  }

  async promptForPayment(): Promise<void> {
    this.showPaymentModal = true;
    this.cdr.markForCheck();
    this.paymentError = null;
    this.isProcessingPayment = false;

    // Valider les données de l'utilisateur
    if (!this.userData) {
      const savedUserData = sessionStorage.getItem('userData');
      if (savedUserData) {
        try {
          this.userData = JSON.parse(savedUserData);
        } catch (error) {
          this.userData = null;
        }
      }
    }

    if (!this.userData) {
      this.paymentError =
        "Données du client introuvables. Veuillez d'abord remplir le formulaire.";
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }

    const email = this.userData.email?.toString().trim();
    if (!email) {
      this.paymentError =
        'Adresse e-mail requise. Veuillez remplir le formulaire.';
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }

    // Sauvegarder le message en attente s'il existe
    if (this.currentMessage) {
      sessionStorage.setItem('pendingBirthTableMessage', this.currentMessage);
    }
  }

  async handlePaymentSubmit(): Promise<void> {
    this.isProcessingPayment = true;
    this.paymentError = null;
    this.cdr.markForCheck();

    try {
      await this.paypalService.initiatePayment({
        amount: '4.00',
        currency: 'EUR',
        serviceName: 'Thème de Naissance',
        returnPath: '/tableau-naissance',
        cancelPath: '/tableau-naissance',
      });
    } catch (error: any) {
      this.paymentError =
        error.message || "Erreur lors de l'initialisation du paiement PayPal.";
      this.isProcessingPayment = false;
      this.cdr.markForCheck();
    }
  }

  cancelPayment(): void {
    this.showPaymentModal = false;
    this.isProcessingPayment = false;
    this.paymentError = null;
    this.cdr.markForCheck();
  }

  // Méthodes de gestion des données personnelles
  savePersonalData(): void {
    this.chartData = {
      ...this.chartData,
      fullName: this.fullName,
      birthDate: this.birthDate,
      birthTime: this.birthTime,
      birthPlace: this.birthPlace,
    };

    // Générer des signes d'exemple basés sur les données
    if (this.birthDate) {
      this.generateSampleChartData();
    }

    this.saveChartData();
    this.showDataForm = false;

    this.shouldScrollToBottom = true;
    this.addMessage({
      sender: 'Maître Emma',
      content: `🌟 Parfait, ${this.fullName}. J'ai enregistré vos données célestes. Les configurations de votre naissance à ${this.birthPlace} le ${this.birthDate} révèlent des motifs uniques dans le cosmos. Sur quel aspect spécifique de votre thème natal souhaitez-vous vous concentrer ?`,
      timestamp: new Date(),
      isUser: false,
    });
  }

  private generateSampleChartData(): void {
    // Générer des données d'exemple basées sur la date de naissance
    const date = new Date(this.birthDate);
    const month = date.getMonth() + 1;

    const zodiacSigns = [
      'Capricorne',
      'Verseau',
      'Poissons',
      'Bélier',
      'Taureau',
      'Gémeaux',
      'Cancer',
      'Lion',
      'Vierge',
      'Balance',
      'Scorpion',
      'Sagittaire',
    ];
    const signIndex = Math.floor((month - 1) / 1) % 12;
    this.chartData.sunSign = zodiacSigns[signIndex];
    this.chartData.moonSign = zodiacSigns[(signIndex + 4) % 12];
    this.chartData.ascendant = zodiacSigns[(signIndex + 8) % 12];
  }

  toggleDataForm(): void {
    this.showDataForm = !this.showDataForm;
  }

  // Méthodes utilitaires
  addMessage(message: Message): void {
    this.messages.push(message);
    this.shouldScrollToBottom = true;
  }

  formatMessage(content: string): string {
    if (!content) return '';

    let formattedContent = content;

    // Convertir **texte** en <strong>texte</strong> pour le gras
    formattedContent = formattedContent.replace(
      /\*\*(.*?)\*\*/g,
      '<strong>$1</strong>'
    );

    // Convertir les sauts de ligne en <br> pour une meilleure visualisation
    formattedContent = formattedContent.replace(/\n/g, '<br>');

    // Optionnel : Gérer également *texte* (un seul astérisque) comme italique
    formattedContent = formattedContent.replace(
      /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
      '<em>$1</em>'
    );

    return formattedContent;
  }

  onScroll(event: any): void {
    const element = event.target;
    const isAtBottom =
      element.scrollHeight - element.scrollTop === element.clientHeight;
    this.isUserScrolling = !isAtBottom;
    if (isAtBottom) this.isUserScrolling = false;
  }

  onUserStartScroll(): void {
    this.isUserScrolling = true;
    setTimeout(() => {
      if (this.chatContainer) {
        const element = this.chatContainer.nativeElement;
        const isAtBottom =
          element.scrollHeight - element.scrollTop === element.clientHeight;
        if (isAtBottom) this.isUserScrolling = false;
      }
    }, 3000);
  }

  private scrollToBottom(): void {
    try {
      if (this.chatContainer) {
        const element = this.chatContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch {}
  }

  autoResize(event: any): void {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  getTimeString(timestamp: Date | string): string {
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  }

  closeModal(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  clearChat(): void {
    // Effacer les messages du chat
    this.messages = [];
    this.currentMessage = '';
    this.lastMessageCount = 0;

    // ✅ Réinitialiser le compteur et les états
    if (!this.hasUserPaidForBirthTable) {
      this.userMessageCount = 0;
      this.blockedMessageId = null;
      sessionStorage.removeItem('birthChartMessages');
      sessionStorage.removeItem('birthChartBlockedMessageId');
      sessionStorage.removeItem('birthChartData');
      sessionStorage.removeItem('birthChartUserMessageCount');
      sessionStorage.removeItem('freeBirthChartConsultations');
      sessionStorage.removeItem('pendingBirthChartMessage');
    } else {
      sessionStorage.removeItem('birthChartMessages');
      sessionStorage.removeItem('birthChartBlockedMessageId');
      sessionStorage.removeItem('birthChartData');
      sessionStorage.removeItem('birthChartUserMessageCount');
      this.userMessageCount = 0;
      this.blockedMessageId = null;
    }

    this.isLoading = false;

    // Indiquer qu'il faut défiler car il y a un nouveau message
    this.shouldScrollToBottom = true;

    // Utiliser la méthode séparée pour initialiser
    this.initializeBirthChartWelcomeMessage();
  }

  onUserDataSubmitted(userData: any): void {
    // ✅ VALIDER LES CHAMPS CRITIQUES AVANT DE PROCÉDER
    const requiredFields = ['email'];
    const missingFields = requiredFields.filter(
      (field) => !userData[field] || userData[field].toString().trim() === ''
    );

    if (missingFields.length > 0) {
      alert(
        `Pour continuer, vous devez compléter les champs suivants : ${missingFields.join(
          ', '
        )}`
      );
      this.showDataModal = true; // Garder le modal ouvert
      this.cdr.markForCheck();
      return;
    }

    // ✅ NETTOYER ET SAUVEGARDER les données IMMÉDIATEMENT en mémoire ET sessionStorage
    this.userData = {
      ...userData,
      email: userData.email?.toString().trim(),
    };

    // ✅ SAUVEGARDER dans sessionStorage IMMÉDIATEMENT
    try {
      sessionStorage.setItem('userData', JSON.stringify(this.userData));

      // Vérifier que les données ont été correctement sauvegardées
      const verification = sessionStorage.getItem('userData');
    } catch (error) {}

    this.showDataModal = false;
    this.cdr.markForCheck();

    // ✅ NOUVEAU : Envoyer les données au backend comme dans les autres composants
    this.sendUserDataToBackend(userData);
  }

  private sendUserDataToBackend(userData: any): void {
    this.http.post(`${this.backendUrl}api/recolecta`, userData).subscribe({
      next: (response) => {
        // ✅ APPELER promptForPayment QUI INITIALISE STRIPE
        this.promptForPayment();
      },
      error: (error) => {
        // ✅ QUAND MÊME OUVRIR LE MODAL DE PAIEMENT
        this.promptForPayment();
      },
    });
  }

  onDataModalClosed(): void {
    this.showDataModal = false;
    this.cdr.markForCheck();
  }

  showBirthChartWheelAfterDelay(delayMs: number = 3000): void {
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }

    this.wheelTimer = setTimeout(() => {
      if (
        FortuneWheelComponent.canShowWheel() &&
        !this.showPaymentModal &&
        !this.showDataModal
      ) {
        this.showFortuneWheel = true;
        this.cdr.markForCheck();
      } else {
      }
    }, delayMs);
  }

  onPrizeWon(prize: Prize): void {
    const prizeMessage: Message = {
      sender: 'Maître Emma',
      content: `🌟 Les configurations célestes ont conspiré en votre faveur ! Vous avez gagné : **${prize.name}** ${prize.icon}\n\nLes anciens gardiens des étoiles ont décidé de vous bénir avec ce cadeau sacré. L'énergie cosmique coule à travers vous, révélant des secrets plus profonds de votre thème natal. Que la sagesse céleste vous illumine !`,
      timestamp: new Date(),
      isUser: false,
    };

    this.messages.push(prizeMessage);
    this.shouldScrollToBottom = true;
    this.saveMessagesToSession();

    this.processBirthChartPrize(prize);
  }

  onWheelClosed(): void {
    this.showFortuneWheel = false;
  }

  triggerBirthChartWheel(): void {
    if (this.showPaymentModal || this.showDataModal) {
      return;
    }

    if (FortuneWheelComponent.canShowWheel()) {
      this.showFortuneWheel = true;
      this.cdr.markForCheck();
    } else {
      alert(
        "Vous n'avez plus de lancers disponibles. " +
          FortuneWheelComponent.getSpinStatus()
      );
    }
  }

  getSpinStatus(): string {
    return FortuneWheelComponent.getSpinStatus();
  }

  private processBirthChartPrize(prize: Prize): void {
    switch (prize.id) {
      case '1': // 3 Lectures Astrales
        this.addFreeBirthChartConsultations(3);
        break;
      case '2': // 1 Analyse Premium - ACCÈS COMPLET
        this.hasUserPaidForBirthTable = true;
        sessionStorage.setItem('hasUserPaidBirthChart', 'true');

        // Débloquer tout message bloqué
        if (this.blockedMessageId) {
          this.blockedMessageId = null;
          sessionStorage.removeItem('birthChartBlockedMessageId');
        }

        // Ajouter un message spécial pour ce prix
        const premiumMessage: Message = {
          sender: 'Maître Emma',
          content:
            "🌟 **Vous avez débloqué l'accès Premium complet !** 🌟\n\nLes configurations célestes vous ont souri de manière extraordinaire. Vous avez maintenant un accès illimité à toute ma sagesse sur les thèmes natals. Vous pouvez consulter sur votre configuration astrale, les planètes, les maisons et tous les secrets célestes autant de fois que vous le souhaitez.\n\n✨ *L'univers a ouvert toutes ses portes pour vous* ✨",
          timestamp: new Date(),
          isUser: false,
        };
        this.messages.push(premiumMessage);
        this.shouldScrollToBottom = true;
        this.saveMessagesToSession();
        break;
      case '4': // Autre opportunité
        break;
      default:
    }
  }

  private addFreeBirthChartConsultations(count: number): void {
    const current = parseInt(
      sessionStorage.getItem('freeBirthChartConsultations') || '0'
    );
    const newTotal = current + count;
    sessionStorage.setItem('freeBirthChartConsultations', newTotal.toString());

    if (this.blockedMessageId && !this.hasUserPaidForBirthTable) {
      this.blockedMessageId = null;
      sessionStorage.removeItem('birthChartBlockedMessageId');
    }
  }

  private hasFreeBirthChartConsultationsAvailable(): boolean {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeBirthChartConsultations') || '0'
    );
    return freeConsultations > 0;
  }

  private useFreeBirthChartConsultation(): void {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeBirthChartConsultations') || '0'
    );

    if (freeConsultations > 0) {
      const remaining = freeConsultations - 1;
      sessionStorage.setItem(
        'freeBirthChartConsultations',
        remaining.toString()
      );

      const prizeMsg: Message = {
        sender: 'Maître Emma',
        content: `✨ *Vous avez utilisé une lecture astrale gratuite* ✨\n\nIl vous reste **${remaining}** consultations célestes disponibles.`,
        timestamp: new Date(),
        isUser: false,
      };

      this.messages.push(prizeMsg);
      this.shouldScrollToBottom = true;
      this.saveMessagesToSession();
    }
  }

  debugBirthChartWheel(): void {
    this.showFortuneWheel = true;
    this.cdr.markForCheck();
  }

  // ✅ MÉTHODE AUXILIAIRE pour le template
  getBirthChartConsultationsCount(): number {
    return parseInt(
      sessionStorage.getItem('freeBirthChartConsultations') || '0'
    );
  }

  // ✅ MÉTHODE AUXILIAIRE pour le parsing dans le template
  parseInt(value: string): number {
    return parseInt(value);
  }
}
