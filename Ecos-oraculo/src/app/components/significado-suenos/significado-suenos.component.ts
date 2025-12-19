import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import {
  ConversationMessage,
  DreamChatResponse,
  DreamInterpreterData,
  InterpretadorSuenosService,
} from '../../services/interpretador-suenos.service';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
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

@Component({
  selector: 'app-significado-suenos',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RecolectaDatosComponent,
  ],
  templateUrl: './significado-suenos.component.html',
  styleUrl: './significado-suenos.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignificadoSuenosComponent
  implements OnInit, OnDestroy, AfterViewChecked, AfterViewInit
{
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  // Variables principales du chat
  messageText: string = '';
  messageInput = new FormControl('');
  messages: ConversationMessage[] = [];
  isLoading = false;
  isTyping = false;
  hasStartedConversation = false;

  private shouldAutoScroll = true;
  private lastMessageCount = 0;

  // ✅ NOUVEAU : Système de 3 messages gratuits
  private userMessageCount: number = 0;
  private readonly FREE_MESSAGES_LIMIT = 3;

  // Roue de la fortune
  showFortuneWheel: boolean = false;
  wheelPrizes: Prize[] = [
    {
      id: '1',
      name: '3 interprétations gratuites',
      color: '#4ecdc4',
      icon: '🌙',
    },
    {
      id: '2',
      name: '1 analyse premium des rêves',
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

  // Données à envoyer
  showDataModal: boolean = false;
  userData: any = null;

  // Variables pour le contrôle des paiements
  showPaymentModal: boolean = false;
  clientSecret: string | null = null;
  isProcessingPayment: boolean = false;
  paymentError: string | null = null;
  hasUserPaidForDreams: boolean = false;

  // Propriété pour contrôler les messages bloqués
  blockedMessageId: string | null = null;

  textareaHeight: number = 25;
  private readonly minTextareaHeight = 45;
  private readonly maxTextareaHeight = 120;
  private backendUrl = environment.apiUrl;

  interpreterData: DreamInterpreterData = {
    name: 'Maître Alma',
    specialty: 'Interprétation des rêves et symbolisme onirique',
    experience:
      "Des siècles d'expérience dans l'interprétation des messages du subconscient",
  };

  // Phrases de bienvenue aléatoires
  welcomeMessages = [
    "Ah, je vois que vous êtes venu pour déchiffrer les mystères de votre monde onirique... Les rêves sont des fenêtres vers l'âme. Dites-moi, quelles visions vous ont visité ?",
    'Les énergies cosmiques me murmurent que vous avez des rêves qui doivent être interprétés. Je suis Maître Alma, gardienne des secrets oniriques. Quel message du subconscient vous préoccupe ?',
    "Bienvenue, voyageur des rêves. Les plans astraux m'ont montré votre arrivée. Laissez-moi vous guider à travers les symboles et mystères de vos visions nocturnes.",
    'Le cristal des rêves brille de votre présence... Je sens que vous portez des visions qui doivent être déchiffrées. Faites confiance à mon ancienne sagesse et partagez vos rêves avec moi.',
  ];

  constructor(
    private dreamService: InterpretadorSuenosService,
    private http: HttpClient,
    private elRef: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private paypalService: PaypalService
  ) {}

  ngAfterViewInit(): void {
    this.setVideosSpeed(0.66);
  }

  async ngOnInit(): Promise<void> {
    // Vérifier le paiement de ce service spécifique
    this.hasUserPaidForDreams =
      sessionStorage.getItem('hasUserPaidForDreams_traumdeutung') === 'true';

    // ✅ NOUVEAU : Charger le compteur de messages
    const savedMessageCount = sessionStorage.getItem('dreamUserMessageCount');
    if (savedMessageCount) {
      this.userMessageCount = parseInt(savedMessageCount, 10);
    }

    const paymentStatus = this.paypalService.checkPaymentStatusFromUrl();

    if (paymentStatus && paymentStatus.status === 'COMPLETED') {
      try {
        const verification = await this.paypalService.verifyAndProcessPayment(
          paymentStatus.token
        );

        if (verification.valid && verification.status === 'approved') {
          this.hasUserPaidForDreams = true;
          sessionStorage.setItem('hasUserPaidForDreams_traumdeutung', 'true');
          localStorage.removeItem('paypal_payment_completed');

          this.blockedMessageId = null;
          sessionStorage.removeItem('dreamBlockedMessageId');

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
              role: 'interpreter',
              message:
                '🎉 Paiement effectué avec succès !\n\n' +
                "✨ Merci beaucoup pour votre paiement. Vous avez maintenant un accès complet à l'interprétation des rêves.\n\n" +
                '💭 Découvrons ensemble les secrets de vos rêves !\n\n' +
                "📌 Note : Ce paiement est valable uniquement pour le service d'interprétation des rêves.",
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
              role: 'interpreter',
              message:
                "❌ Le paiement n'a pas pu être vérifié. Veuillez réessayer ou contacter notre support si le problème persiste.",
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
            role: 'interpreter',
            message:
              "❌ Malheureusement, une erreur s'est produite lors de la vérification du paiement. Veuillez réessayer plus tard.",
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
    const savedMessages = sessionStorage.getItem('dreamMessages');
    const savedBlockedMessageId = sessionStorage.getItem(
      'dreamBlockedMessageId'
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

    // Afficher la roulette si nécessaire
    if (this.hasStartedConversation && FortuneWheelComponent.canShowWheel()) {
      this.showWheelAfterDelay(2000);
    }
  }

  // ✅ NOUVEAU : Obtenir les messages gratuits restants
  getFreeMessagesRemaining(): number {
    if (this.hasUserPaidForDreams) {
      return -1; // Illimité
    }
    return Math.max(0, this.FREE_MESSAGES_LIMIT - this.userMessageCount);
  }

  private setVideosSpeed(rate: number): void {
    const host = this.elRef.nativeElement;
    const videos = host.querySelectorAll<HTMLVideoElement>('video');
    videos.forEach((v: any) => {
      const apply = () => (v.playbackRate = rate);
      if (v.readyState >= 1) apply();
      else v.addEventListener('loadedmetadata', apply, { once: true });
    });
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

  onPrizeWon(prize: Prize): void {
    const prizeMessage: ConversationMessage = {
      role: 'interpreter',
      message: `🌙 Les énergies cosmiques vous ont béni ! Vous avez gagné : **${prize.name}** ${prize.icon}\n\nCe cadeau de l'univers onirique a été activé pour vous. Les mystères des rêves se révéleront avec plus de clarté. Que la fortune vous accompagne dans vos prochaines interprétations !`,
      timestamp: new Date(),
      isPrizeAnnouncement: true,
    };

    this.messages.push(prizeMessage);
    this.shouldAutoScroll = true;
    this.saveMessagesToSession();

    this.processDreamPrize(prize);
  }

  private processDreamPrize(prize: Prize): void {
    switch (prize.id) {
      case '1': // 3 Interprétations Gratuites
        this.addFreeDreamConsultations(3);
        break;
      case '2': // 1 Analyse Premium - ACCÈS COMPLET
        this.hasUserPaidForDreams = true;
        sessionStorage.setItem('hasUserPaidForDreams_traumdeutung', 'true');

        if (this.blockedMessageId) {
          this.blockedMessageId = null;
          sessionStorage.removeItem('dreamBlockedMessageId');
        }

        const premiumMessage: ConversationMessage = {
          role: 'interpreter',
          message:
            "✨ **Vous avez débloqué l'accès Premium complet !** ✨\n\nLes secrets du monde onirique vous ont souri de manière extraordinaire. Vous avez maintenant un accès illimité à toute la sagesse des rêves. Vous pouvez consulter sur les interprétations, les symboles oniriques et tous les secrets du subconscient autant de fois que vous le souhaitez.\n\n🌙 *Les portes du royaume des rêves se sont complètement ouvertes pour vous* 🌙",
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

  private addFreeDreamConsultations(count: number): void {
    const current = parseInt(
      sessionStorage.getItem('freeDreamConsultations') || '0'
    );
    const newTotal = current + count;
    sessionStorage.setItem('freeDreamConsultations', newTotal.toString());

    if (this.blockedMessageId && !this.hasUserPaidForDreams) {
      this.blockedMessageId = null;
      sessionStorage.removeItem('dreamBlockedMessageId');
    }

    // Message informatif
    const infoMessage: ConversationMessage = {
      role: 'interpreter',
      message: `✨ *Vous avez reçu ${count} interprétations de rêves gratuites* ✨\n\nVous avez maintenant **${newTotal}** consultations disponibles pour explorer les mystères de vos rêves.`,
      timestamp: new Date(),
    };
    this.messages.push(infoMessage);
    this.shouldAutoScroll = true;
    this.saveMessagesToSession();
  }

  private hasFreeConsultationsAvailable(): boolean {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeDreamConsultations') || '0'
    );
    return freeConsultations > 0;
  }

  private useFreeConsultation(): void {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeDreamConsultations') || '0'
    );

    if (freeConsultations > 0) {
      const remaining = freeConsultations - 1;
      sessionStorage.setItem('freeDreamConsultations', remaining.toString());

      const prizeMsg: ConversationMessage = {
        role: 'interpreter',
        message: `✨ *Vous avez utilisé une interprétation gratuite* ✨\n\nIl vous reste **${remaining}** interprétations gratuites disponibles.`,
        timestamp: new Date(),
      };
      this.messages.push(prizeMsg);
      this.shouldAutoScroll = true;
      this.saveMessagesToSession();
    }
  }

  onWheelClosed(): void {
    this.showFortuneWheel = false;
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
        role: 'interpreter',
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
    if (this.messageText?.trim() && !this.isLoading) {
      const userMessage = this.messageText.trim();

      // Calculer le prochain numéro de message
      const nextMessageCount = this.userMessageCount + 1;

      console.log(
        `📊 Rêves - Message #${nextMessageCount}, Premium : ${this.hasUserPaidForDreams}, Limite : ${this.FREE_MESSAGES_LIMIT}`
      );

      // ✅ Vérifier l'accès
      const canSendMessage =
        this.hasUserPaidForDreams ||
        this.hasFreeConsultationsAvailable() ||
        nextMessageCount <= this.FREE_MESSAGES_LIMIT;

      if (!canSendMessage) {
        console.log('❌ Sans accès - affichage du modal de paiement');

        // Fermer les autres modals
        this.showFortuneWheel = false;
        this.showPaymentModal = false;

        // Sauvegarder le message en attente
        sessionStorage.setItem('pendingDreamMessage', userMessage);
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
        !this.hasUserPaidForDreams &&
        nextMessageCount > this.FREE_MESSAGES_LIMIT &&
        this.hasFreeConsultationsAvailable()
      ) {
        this.useFreeConsultation();
      }

      this.shouldAutoScroll = true;
      this.processUserMessage(userMessage, nextMessageCount);
    }
  }

  // ✅ MODIFIÉ : processUserMessage() pour envoyer messageCount au backend
  private processUserMessage(userMessage: string, messageCount: number): void {
    const userMsg: ConversationMessage = {
      role: 'user',
      message: userMessage,
      timestamp: new Date(),
    };
    this.messages.push(userMsg);

    // ✅ Mettre à jour le compteur
    this.userMessageCount = messageCount;
    sessionStorage.setItem(
      'dreamUserMessageCount',
      this.userMessageCount.toString()
    );

    this.saveMessagesToSession();
    this.messageText = '';
    this.isTyping = true;
    this.isLoading = true;
    this.cdr.markForCheck();

    // Préparer l'historique de conversation
    const conversationHistory = this.messages
      .filter((msg) => msg.message && !msg.isPrizeAnnouncement)
      .slice(-10)
      .map((msg) => ({
        role: msg.role,
        message: msg.message,
        timestamp: msg.timestamp,
      }));

    // ✅ Utiliser la nouvelle méthode avec messageCount
    this.dreamService
      .chatWithInterpreterWithCount(
        userMessage,
        messageCount,
        this.hasUserPaidForDreams,
        conversationHistory
      )
      .subscribe({
        next: (response: DreamChatResponse) => {
          this.isLoading = false;
          this.isTyping = false;

          if (response.success && response.response) {
            const messageId = Date.now().toString();

            const interpreterMsg: ConversationMessage = {
              role: 'interpreter',
              message: response.response,
              timestamp: new Date(),
              id: messageId,
              freeMessagesRemaining: response.freeMessagesRemaining,
              showPaywall: response.showPaywall,
              isCompleteResponse: response.isCompleteResponse,
            };
            this.messages.push(interpreterMsg);

            this.shouldAutoScroll = true;

            console.log(
              `📊 Réponse - Messages restants : ${response.freeMessagesRemaining}, Paywall : ${response.showPaywall}, Complète : ${response.isCompleteResponse}`
            );

            // ✅ Afficher le paywall si le backend l'indique
            if (response.showPaywall && !this.hasUserPaidForDreams) {
              this.blockedMessageId = messageId;
              sessionStorage.setItem('dreamBlockedMessageId', messageId);

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
                "Erreur lors de l'obtention de la réponse de l'interprète"
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
      'dreamUserMessageCount',
      this.userMessageCount.toString()
    );
    if (this.blockedMessageId) {
      sessionStorage.setItem('dreamBlockedMessageId', this.blockedMessageId);
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
      sessionStorage.setItem('dreamMessages', JSON.stringify(messagesToSave));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des messages :', error);
    }
  }

  // ✅ MODIFIÉ : clearSessionData() incluant le compteur
  private clearSessionData(): void {
    sessionStorage.removeItem('hasUserPaidForDreams_traumdeutung');
    sessionStorage.removeItem('dreamMessages');
    sessionStorage.removeItem('dreamBlockedMessageId');
    sessionStorage.removeItem('dreamUserMessageCount');
    sessionStorage.removeItem('freeDreamConsultations');
    sessionStorage.removeItem('pendingDreamMessage');
  }

  isMessageBlocked(message: ConversationMessage): boolean {
    return message.id === this.blockedMessageId && !this.hasUserPaidForDreams;
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

    if (this.messageText?.trim()) {
      sessionStorage.setItem('pendingDreamMessage', this.messageText.trim());
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
        serviceName: 'Signification des Rêves',
        returnPath: '/interpretation-reves',
        cancelPath: '/interpretation-reves',
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

  adjustTextareaHeight(event: any): void {
    const textarea = event.target;
    textarea.style.height = 'auto';
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, this.minTextareaHeight),
      this.maxTextareaHeight
    );
    this.textareaHeight = newHeight;
    textarea.style.height = newHeight + 'px';
  }

  // ✅ MODIFIÉ : newConsultation() réinitialisant le compteur
  newConsultation(): void {
    this.shouldAutoScroll = true;
    this.lastMessageCount = 0;

    if (!this.hasUserPaidForDreams) {
      this.userMessageCount = 0;
      this.blockedMessageId = null;
      this.clearSessionData();
    } else {
      sessionStorage.removeItem('dreamMessages');
      sessionStorage.removeItem('dreamBlockedMessageId');
      sessionStorage.removeItem('dreamUserMessageCount');
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
      role: 'interpreter',
      message: `🔮 Les énergies cosmiques sont perturbées... ${errorMessage} Réessayez quand les vibrations se seront stabilisées.`,
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
      if (this.messageText?.trim() && !this.isLoading) {
        this.sendMessage();
        setTimeout(() => {
          this.textareaHeight = this.minTextareaHeight;
        }, 50);
      }
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

  openDataModalForPayment(): void {
    this.showFortuneWheel = false;
    this.showPaymentModal = false;
    this.saveStateBeforePayment();

    setTimeout(() => {
      this.showDataModal = true;
      this.cdr.markForCheck();
    }, 100);
  }

  getDreamConsultationsCount(): number {
    return parseInt(sessionStorage.getItem('freeDreamConsultations') || '0');
  }

  getPrizesAvailable(): string {
    const prizes: string[] = [];

    const freeConsultations = parseInt(
      sessionStorage.getItem('freeDreamConsultations') || '0'
    );
    if (freeConsultations > 0) {
      prizes.push(
        `${freeConsultations} interprétation${
          freeConsultations > 1 ? 's' : ''
        } gratuite${freeConsultations > 1 ? 's' : ''}`
      );
    }

    return prizes.length > 0 ? prizes.join(', ') : 'Aucun';
  }
}
