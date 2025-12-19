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
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {
  NumerologiaService,
  NumerologyResponse,
} from '../../services/numerologia.service';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PaypalService } from '../../services/paypal.service';

import { HttpClient } from '@angular/common/http';
import { RecolectaDatosComponent } from '../recolecta-datos/recolecta-datos.component';
import { environment } from '../../environments/environmets.prod';
import {
  FortuneWheelComponent,
  Prize,
} from '../fortune-wheel/fortune-wheel.component';

interface NumerologyMessage {
  sender: string;
  content: string;
  timestamp: Date;
  isUser: boolean;
  id?: string;
}

interface ConversationMessage {
  role: 'user' | 'numerologist';
  message: string;
  timestamp: Date;
  id?: string;
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  isCompleteResponse?: boolean;
  isPrizeAnnouncement?: boolean;
}

@Component({
  selector: 'app-historia-sagrada',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RecolectaDatosComponent,
  ],
  templateUrl: './lectura-numerologia.component.html',
  styleUrl: './lectura-numerologia.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LecturaNumerologiaComponent
  implements OnInit, OnDestroy, AfterViewChecked, AfterViewInit
{
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  // Variables principales du chat
  messages: ConversationMessage[] = [];
  currentMessage: string = '';
  messageInput = new FormControl('');
  isLoading: boolean = false;
  isTyping: boolean = false;
  hasStartedConversation: boolean = false;
  showDataForm: boolean = false;

  private shouldAutoScroll = true;
  private lastMessageCount = 0;

  // Données à envoyer
  showDataModal: boolean = false;
  userData: any = null;

  // Variables pour le contrôle des paiements
  showPaymentModal: boolean = false;
  clientSecret: string | null = null;
  isProcessingPayment: boolean = false;
  paymentError: string | null = null;
  hasUserPaidForNumerology: boolean = false;

  // ✅ NOUVEAU : Système de 3 messages gratuits
  private userMessageCount: number = 0;
  private readonly FREE_MESSAGES_LIMIT = 3;

  // Modal de la roue de la fortune
  showFortuneWheel: boolean = false;
  numerologyPrizes: Prize[] = [
    {
      id: '1',
      name: '3 lancers de la Roue Numérologique',
      color: '#4ecdc4',
      icon: '🔢',
    },
    {
      id: '2',
      name: '1 Analyse Numérologique Premium',
      color: '#45b7d1',
      icon: '✨',
    },
    {
      id: '4',
      name: 'Réessayez !',
      color: '#ff7675',
      icon: '🔄',
    },
  ];
  private wheelTimer: any;

  // Propriété pour contrôler les messages bloqués
  blockedMessageId: string | null = null;

  private backendUrl = environment.apiUrl;

  // Données personnelles
  fullName: string = '';
  birthDate: string = '';

  // Nombres calculés
  personalNumbers = {
    lifePath: 0,
    destiny: 0,
  };

  // Info du numérologue
  numerologistInfo = {
    name: 'Maître Sophie',
    title: 'Gardienne des Nombres Sacrés',
    specialty: 'Numérologie et vibration numérique universelle',
  };

  // Phrases de bienvenue aléatoires
  welcomeMessages = [
    "Bienvenue, chercheur de la sagesse numérique... Les nombres sont le langage de l'univers et révèlent les secrets de votre destin. Que voulez-vous savoir sur votre vibration numérique ?",
    'Les énergies numériques me murmurent que vous êtes venu chercher des réponses... Je suis Maître Sophie, gardienne des nombres sacrés. Quel secret numérique vous préoccupe ?',
    'Bienvenue au Temple des Nombres Sacrés. Les modèles mathématiques du cosmos ont annoncé votre arrivée. Permettez-moi de vous révéler les secrets de votre code numérique.',
    "Les nombres dansent devant moi et révèlent votre présence... Chaque nombre a une signification, chaque calcul révèle un destin. Quels nombres voulez-vous que j'interprète pour vous ?",
  ];

  constructor(
    @Optional() public dialogRef: MatDialogRef<LecturaNumerologiaComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
    private numerologyService: NumerologiaService,
    private http: HttpClient,
    private elRef: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private paypalService: PaypalService
  ) {}

  ngAfterViewInit(): void {
    this.setVideosSpeed(0.67);
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
    // Vérifier le paiement de ce service spécifique
    this.hasUserPaidForNumerology =
      sessionStorage.getItem('hasUserPaidForNumerology_numerologie') === 'true';

    // ✅ NOUVEAU : Charger le compteur de messages
    const savedMessageCount = sessionStorage.getItem(
      'numerologyUserMessageCount'
    );
    if (savedMessageCount) {
      this.userMessageCount = parseInt(savedMessageCount, 10);
    }

    // Vérifier le paiement PayPal
    const paymentStatus = this.paypalService.checkPaymentStatusFromUrl();

    if (paymentStatus && paymentStatus.status === 'COMPLETED') {
      try {
        const verification = await this.paypalService.verifyAndProcessPayment(
          paymentStatus.token
        );

        if (verification.valid && verification.status === 'approved') {
          this.hasUserPaidForNumerology = true;
          sessionStorage.setItem(
            'hasUserPaidForNumerology_numerologie',
            'true'
          );
          localStorage.removeItem('paypal_payment_completed');

          this.blockedMessageId = null;
          sessionStorage.removeItem('numerologyBlockedMessageId');

          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          this.showPaymentModal = false;
          this.isProcessingPayment = false;
          this.paymentError = null;
          this.cdr.markForCheck();

          setTimeout(() => {
            const successMessage: ConversationMessage = {
              role: 'numerologist',
              message:
                '🎉 Paiement effectué avec succès !\n\n' +
                '✨ Merci pour votre paiement. Vous avez maintenant un accès complet à la lecture de Numérologie.\n\n' +
                '🔢 Découvrons ensemble les secrets des nombres !\n\n' +
                '📌 Note : Ce paiement est valable uniquement pour le service de Numérologie.',
              timestamp: new Date(),
            };
            this.messages.push(successMessage);
            this.saveMessagesToSession();
            this.cdr.detectChanges();
            setTimeout(() => this.scrollToBottom(), 200);
          }, 1000);
        } else {
          this.paymentError = "Le paiement n'a pas pu être vérifié.";

          setTimeout(() => {
            const errorMessage: ConversationMessage = {
              role: 'numerologist',
              message:
                '⚠️ Un problème est survenu lors de la vérification de votre paiement. Veuillez réessayer ou contacter notre support.',
              timestamp: new Date(),
            };
            this.messages.push(errorMessage);
            this.saveMessagesToSession();
            this.cdr.detectChanges();
          }, 800);
        }
      } catch (error) {
        console.error(
          'Erreur lors de la vérification du paiement PayPal :',
          error
        );
        this.paymentError = 'Erreur lors de la vérification du paiement';

        setTimeout(() => {
          const errorMessage: ConversationMessage = {
            role: 'numerologist',
            message:
              "❌ Malheureusement, une erreur s'est produite lors de la vérification de votre paiement. Veuillez réessayer plus tard.",
            timestamp: new Date(),
          };
          this.messages.push(errorMessage);
          this.saveMessagesToSession();
          this.cdr.detectChanges();
        }, 800);
      }
    }

    // Charger les données de l'utilisateur depuis sessionStorage
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

    // Charger les messages sauvegardés
    const savedMessages = sessionStorage.getItem('numerologyMessages');
    const savedBlockedMessageId = sessionStorage.getItem(
      'numerologyBlockedMessageId'
    );

    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        this.messages = parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        this.blockedMessageId = savedBlockedMessageId || null;
        this.hasStartedConversation = true;
      } catch (error) {
        this.clearSessionData();
        this.startConversation();
      }
    } else {
      this.startConversation();
    }

    // Tester la connexion
    this.numerologyService.testConnection().subscribe({
      next: (response) => {},
      error: (error) => {},
    });

    // Afficher la roulette si nécessaire
    if (this.hasStartedConversation && FortuneWheelComponent.canShowWheel()) {
      this.showWheelAfterDelay(2000);
    }
  }

  // ✅ NOUVEAU : Obtenir les messages gratuits restants
  getFreeMessagesRemaining(): number {
    if (this.hasUserPaidForNumerology) {
      return -1; // Illimité
    }
    return Math.max(0, this.FREE_MESSAGES_LIMIT - this.userMessageCount);
  }

  // ✅ NOUVEAU : Vérifier si l'accès est autorisé
  private hasAccess(): boolean {
    if (this.hasUserPaidForNumerology) {
      return true;
    }
    if (this.hasFreeNumerologyConsultationsAvailable()) {
      return true;
    }
    if (this.userMessageCount < this.FREE_MESSAGES_LIMIT) {
      return true;
    }
    return false;
  }

  onWheelClosed(): void {
    this.showFortuneWheel = false;
  }

  triggerFortuneWheel(): void {
    if (this.showPaymentModal || this.showDataModal) {
      return;
    }

    if (FortuneWheelComponent.canShowWheel()) {
      this.showFortuneWheel = true;
      this.cdr.markForCheck();
    } else {
      alert(
        "Vous n'avez pas de lancers disponibles. " +
          FortuneWheelComponent.getSpinStatus()
      );
    }
  }

  getSpinStatus(): string {
    return FortuneWheelComponent.getSpinStatus();
  }

  private processNumerologyPrize(prize: Prize): void {
    switch (prize.id) {
      case '1': // 3 Lectures Gratuites
        this.addFreeNumerologyConsultations(3);
        break;
      case '2': // 1 Analyse Premium - ACCÈS COMPLET
        this.hasUserPaidForNumerology = true;
        sessionStorage.setItem('hasUserPaidForNumerology_numerologie', 'true');

        if (this.blockedMessageId) {
          this.blockedMessageId = null;
          sessionStorage.removeItem('numerologyBlockedMessageId');
        }

        const premiumMessage: ConversationMessage = {
          role: 'numerologist',
          message:
            "✨ **Vous avez débloqué l'accès Premium complet !** ✨\n\nLes nombres sacrés se sont alignés de manière extraordinaire pour vous aider. Vous avez maintenant un accès illimité à toute la connaissance numérologique. Vous pouvez consulter votre chemin de vie, vos nombres du destin, les compatibilités numériques et tous les secrets de la numérologie autant de fois que vous le souhaitez.\n\n🔢 *L'univers numérique a révélé tous ses secrets pour vous* 🔢",
          timestamp: new Date(),
        };
        this.messages.push(premiumMessage);
        this.shouldAutoScroll = true;
        this.saveMessagesToSession();
        break;
      case '4': // Autre opportunité
        break;
      default:
    }
  }

  private addFreeNumerologyConsultations(count: number): void {
    const current = parseInt(
      sessionStorage.getItem('freeNumerologyConsultations') || '0'
    );
    const newTotal = current + count;
    sessionStorage.setItem('freeNumerologyConsultations', newTotal.toString());

    if (this.blockedMessageId && !this.hasUserPaidForNumerology) {
      this.blockedMessageId = null;
      sessionStorage.removeItem('numerologyBlockedMessageId');
    }

    // Message informatif
    const infoMessage: ConversationMessage = {
      role: 'numerologist',
      message: `✨ *Vous avez reçu ${count} consultations numérologiques gratuites* ✨\n\nVous avez maintenant **${newTotal}** consultations disponibles pour explorer les mystères des nombres.`,
      timestamp: new Date(),
    };
    this.messages.push(infoMessage);
    this.shouldAutoScroll = true;
    this.saveMessagesToSession();
  }

  private hasFreeNumerologyConsultationsAvailable(): boolean {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeNumerologyConsultations') || '0'
    );
    return freeConsultations > 0;
  }

  private useFreeNumerologyConsultation(): void {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeNumerologyConsultations') || '0'
    );

    if (freeConsultations > 0) {
      const remaining = freeConsultations - 1;
      sessionStorage.setItem(
        'freeNumerologyConsultations',
        remaining.toString()
      );

      const prizeMsg: ConversationMessage = {
        role: 'numerologist',
        message: `✨ *Vous avez utilisé une consultation numérologique gratuite* ✨\n\nIl vous reste **${remaining}** consultations numérologiques gratuites.`,
        timestamp: new Date(),
      };
      this.messages.push(prizeMsg);
      this.shouldAutoScroll = true;
      this.saveMessagesToSession();
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldAutoScroll && this.messages.length > this.lastMessageCount) {
      this.scrollToBottom();
      this.lastMessageCount = this.messages.length;
    }
  }

  onScroll(event: any): void {
    const element = event.target;
    const threshold = 50;
    const isNearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      threshold;
    this.shouldAutoScroll = isNearBottom;
  }

  ngOnDestroy(): void {
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }
  }

  autoResize(event: any): void {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  startConversation(): void {
    if (this.messages.length === 0) {
      const randomWelcome =
        this.welcomeMessages[
          Math.floor(Math.random() * this.welcomeMessages.length)
        ];

      const welcomeMessage: ConversationMessage = {
        role: 'numerologist',
        message: randomWelcome,
        timestamp: new Date(),
      };

      this.messages.push(welcomeMessage);
    }
    this.hasStartedConversation = true;

    if (FortuneWheelComponent.canShowWheel()) {
      this.showWheelAfterDelay(3000);
    }
  }

  // ✅ MODIFIÉ : sendMessage() avec système de 3 messages gratuits
  sendMessage(): void {
    if (!this.currentMessage.trim() || this.isLoading) return;

    const userMessage = this.currentMessage.trim();

    // Calculer le prochain numéro de message
    const nextMessageCount = this.userMessageCount + 1;

    console.log(
      `📊 Numérologie - Message #${nextMessageCount}, Premium : ${this.hasUserPaidForNumerology}, Limite : ${this.FREE_MESSAGES_LIMIT}`
    );

    // ✅ Vérifier l'accès
    const canSendMessage =
      this.hasUserPaidForNumerology ||
      this.hasFreeNumerologyConsultationsAvailable() ||
      nextMessageCount <= this.FREE_MESSAGES_LIMIT;

    if (!canSendMessage) {
      console.log('❌ Sans accès - affichage du modal de paiement');

      // Fermer les autres modals
      this.showFortuneWheel = false;
      this.showPaymentModal = false;

      // Sauvegarder le message en attente
      sessionStorage.setItem('pendingNumerologyMessage', userMessage);
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
      !this.hasUserPaidForNumerology &&
      nextMessageCount > this.FREE_MESSAGES_LIMIT &&
      this.hasFreeNumerologyConsultationsAvailable()
    ) {
      this.useFreeNumerologyConsultation();
    }

    this.shouldAutoScroll = true;
    this.processUserMessage(userMessage, nextMessageCount);
  }

  // ✅ NOUVEAU : Méthode séparée pour traiter les messages
  private processUserMessage(userMessage: string, messageCount: number): void {
    // Ajouter le message de l'utilisateur
    const userMsg: ConversationMessage = {
      role: 'user',
      message: userMessage,
      timestamp: new Date(),
    };
    this.messages.push(userMsg);

    // ✅ Mettre à jour le compteur
    this.userMessageCount = messageCount;
    sessionStorage.setItem(
      'numerologyUserMessageCount',
      this.userMessageCount.toString()
    );

    this.saveMessagesToSession();
    this.currentMessage = '';
    this.isTyping = true;
    this.isLoading = true;
    this.cdr.markForCheck();

    // Préparer l'historique de conversation
    const conversationHistory = this.messages
      .filter((msg) => msg.message && !msg.isPrizeAnnouncement)
      .slice(-10)
      .map((msg) => ({
        role:
          msg.role === 'user' ? ('user' as const) : ('numerologist' as const),
        message: msg.message,
      }));

    // ✅ Utiliser la nouvelle méthode avec messageCount
    this.numerologyService
      .sendMessageWithCount(
        userMessage,
        messageCount,
        this.hasUserPaidForNumerology,
        this.birthDate || undefined,
        this.fullName || undefined,
        conversationHistory
      )
      .subscribe({
        next: (response: NumerologyResponse) => {
          this.isLoading = false;
          this.isTyping = false;

          if (response.success && response.response) {
            const messageId = Date.now().toString();

            const numerologistMsg: ConversationMessage = {
              role: 'numerologist',
              message: response.response,
              timestamp: new Date(),
              id: messageId,
              freeMessagesRemaining: response.freeMessagesRemaining,
              showPaywall: response.showPaywall,
              isCompleteResponse: response.isCompleteResponse,
            };
            this.messages.push(numerologistMsg);

            this.shouldAutoScroll = true;

            console.log(
              `📊 Réponse - Messages restants : ${response.freeMessagesRemaining}, Paywall : ${response.showPaywall}, Complète : ${response.isCompleteResponse}`
            );

            // ✅ Afficher le paywall si le backend l'indique
            if (response.showPaywall && !this.hasUserPaidForNumerology) {
              this.blockedMessageId = messageId;
              sessionStorage.setItem('numerologyBlockedMessageId', messageId);

              setTimeout(() => {
                this.saveStateBeforePayment();

                this.showFortuneWheel = false;
                this.showPaymentModal = false;

                setTimeout(() => {
                  this.showDataModal = true;
                  this.cdr.markForCheck();
                }, 100);
              }, 2500);
            }

            this.saveMessagesToSession();
            this.cdr.markForCheck();
          } else {
            this.handleError(
              response.error ||
                "Erreur lors de l'obtention de la réponse du numérologue"
            );
          }
        },
        error: (error: any) => {
          this.isLoading = false;
          this.isTyping = false;
          console.error('Erreur dans la réponse :', error);
          this.handleError('Erreur de connexion. Veuillez réessayer.');
          this.cdr.markForCheck();
        },
      });
  }

  private saveStateBeforePayment(): void {
    this.saveMessagesToSession();
    sessionStorage.setItem(
      'numerologyUserMessageCount',
      this.userMessageCount.toString()
    );
    if (this.blockedMessageId) {
      sessionStorage.setItem(
        'numerologyBlockedMessageId',
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
        'numerologyMessages',
        JSON.stringify(messagesToSave)
      );
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des messages :', error);
    }
  }

  // ✅ MODIFIÉ : clearSessionData() incluant le compteur
  private clearSessionData(): void {
    sessionStorage.removeItem('hasUserPaidForNumerology_numerologie');
    sessionStorage.removeItem('numerologyMessages');
    sessionStorage.removeItem('numerologyBlockedMessageId');
    sessionStorage.removeItem('numerologyUserMessageCount');
    sessionStorage.removeItem('freeNumerologyConsultations');
    sessionStorage.removeItem('pendingNumerologyMessage');
  }

  isMessageBlocked(message: ConversationMessage): boolean {
    return (
      message.id === this.blockedMessageId && !this.hasUserPaidForNumerology
    );
  }

  async promptForPayment(): Promise<void> {
    this.showPaymentModal = true;
    this.cdr.markForCheck();
    this.paymentError = null;
    this.isProcessingPayment = false;

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
      this.showPaymentModal = false;
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }

    const email = this.userData.email?.toString().trim();
    if (!email) {
      this.paymentError =
        'Adresse e-mail requise. Veuillez remplir le formulaire.';
      this.showPaymentModal = false;
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }

    if (this.currentMessage?.trim()) {
      sessionStorage.setItem(
        'pendingNumerologyMessage',
        this.currentMessage.trim()
      );
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
        serviceName: 'Lecture de Numérologie',
        returnPath: '/lecture-numerologie',
        cancelPath: '/lecture-numerologie',
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

  savePersonalData(): void {
    if (this.fullName) {
      this.personalNumbers.destiny =
        this.numerologyService.calculateDestinyNumber(this.fullName);
    }

    if (this.birthDate) {
      this.personalNumbers.lifePath = this.numerologyService.calculateLifePath(
        this.birthDate
      );
    }

    this.showDataForm = false;

    if (this.personalNumbers.lifePath || this.personalNumbers.destiny) {
      let numbersMessage = "J'ai calculé vos nombres sacrés :\n\n";

      if (this.personalNumbers.lifePath) {
        numbersMessage += `🔹 Chemin de Vie : ${
          this.personalNumbers.lifePath
        } - ${this.numerologyService.getNumberMeaning(
          this.personalNumbers.lifePath
        )}\n\n`;
      }

      if (this.personalNumbers.destiny) {
        numbersMessage += `🔹 Nombre du Destin : ${
          this.personalNumbers.destiny
        } - ${this.numerologyService.getNumberMeaning(
          this.personalNumbers.destiny
        )}\n\n`;
      }

      numbersMessage +=
        "Voulez-vous que j'approfondisse l'interprétation de l'un de ces nombres ?";

      const numbersMsg: ConversationMessage = {
        role: 'numerologist',
        message: numbersMessage,
        timestamp: new Date(),
      };
      this.messages.push(numbersMsg);
      this.saveMessagesToSession();
    }
  }

  toggleDataForm(): void {
    this.showDataForm = !this.showDataForm;
  }

  // ✅ MODIFIÉ : newConsultation() réinitialisant le compteur
  newConsultation(): void {
    this.shouldAutoScroll = true;
    this.lastMessageCount = 0;

    if (!this.hasUserPaidForNumerology) {
      this.userMessageCount = 0;
      this.blockedMessageId = null;
      this.clearSessionData();
    } else {
      sessionStorage.removeItem('numerologyMessages');
      sessionStorage.removeItem('numerologyBlockedMessageId');
      sessionStorage.removeItem('numerologyUserMessageCount');
      this.userMessageCount = 0;
      this.blockedMessageId = null;
    }

    this.messages = [];
    this.hasStartedConversation = false;
    this.startConversation();
    this.cdr.markForCheck();
  }

  private handleError(errorMessage: string): void {
    const errorMsg: ConversationMessage = {
      role: 'numerologist',
      message: `🔢 Les nombres cosmiques sont en fluctuation... ${errorMessage} Réessayez quand les vibrations numériques se seront stabilisées.`,
      timestamp: new Date(),
    };
    this.messages.push(errorMsg);
    this.shouldAutoScroll = true;
    this.saveMessagesToSession();
    this.cdr.markForCheck();
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        const element = this.scrollContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) {}
  }

  clearConversation(): void {
    this.newConsultation();
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
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'N/A';
    }
  }

  formatMessage(content: string): string {
    if (!content) return '';

    let formattedContent = content;

    formattedContent = formattedContent.replace(
      /\*\*(.*?)\*\*/g,
      '<strong>$1</strong>'
    );

    formattedContent = formattedContent.replace(/\n/g, '<br>');

    formattedContent = formattedContent.replace(
      /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
      '<em>$1</em>'
    );

    return formattedContent;
  }

  closeModal(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  onUserDataSubmitted(userData: any): void {
    const requiredFields = ['email'];
    const missingFields = requiredFields.filter(
      (field) => !userData[field] || userData[field].toString().trim() === ''
    );

    if (missingFields.length > 0) {
      alert(
        `Pour continuer avec le paiement, vous devez compléter les champs suivants : ${missingFields.join(
          ', '
        )}`
      );
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }

    this.userData = {
      ...userData,
      email: userData.email?.toString().trim(),
    };

    try {
      sessionStorage.setItem('userData', JSON.stringify(this.userData));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de userData :', error);
    }

    this.showDataModal = false;
    this.cdr.markForCheck();

    this.sendUserDataToBackend(userData);
  }

  private sendUserDataToBackend(userData: any): void {
    this.http.post(`${this.backendUrl}api/recolecta`, userData).subscribe({
      next: (response) => {
        console.log('Données envoyées au backend :', response);
        this.promptForPayment();
      },
      error: (error) => {
        console.error("Erreur lors de l'envoi des données :", error);
        this.promptForPayment();
      },
    });
  }

  onDataModalClosed(): void {
    this.showDataModal = false;
    this.cdr.markForCheck();
  }

  onPrizeWon(prize: Prize): void {
    const prizeMessage: ConversationMessage = {
      role: 'numerologist',
      message: `🔢 Les nombres sacrés vous ont béni ! Vous avez gagné : **${prize.name}** ${prize.icon}\n\nLes vibrations numériques de l'univers ont décidé de vous favoriser avec ce cadeau cosmique. L'énergie des nombres anciens coule à travers vous, révélant des secrets plus profonds de votre destin numérologique. Que la sagesse des nombres vous guide !`,
      timestamp: new Date(),
      isPrizeAnnouncement: true,
    };

    this.messages.push(prizeMessage);
    this.shouldAutoScroll = true;
    this.saveMessagesToSession();

    this.processNumerologyPrize(prize);
  }

  showWheelAfterDelay(delayMs: number = 3000): void {
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
      }
    }, delayMs);
  }
}
