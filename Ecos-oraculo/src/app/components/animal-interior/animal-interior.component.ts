import { CommonModule } from '@angular/common';
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
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AnimalChatRequest,
  AnimalGuideData,
  AnimalInteriorService,
} from '../../services/animal-interior.service';
import { PaypalService } from '../../services/paypal.service';
import { HttpClient } from '@angular/common/http';
import { RecolectaDatosComponent } from '../recolecta-datos/recolecta-datos.component';
import { environment } from '../../environments/environmets.prod';
import {
  FortuneWheelComponent,
  Prize,
} from '../fortune-wheel/fortune-wheel.component';

interface Message {
  role: 'user' | 'guide';
  content: string;
  timestamp: Date;
}

interface ChatMessage {
  sender: string;
  content: string;
  timestamp: Date;
  isUser: boolean;
  id?: string;
}

@Component({
  selector: 'app-animal-interior',
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    RecolectaDatosComponent,
  ],
  templateUrl: './animal-interior.component.html',
  styleUrl: './animal-interior.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimalInteriorComponent
  implements OnInit, OnDestroy, AfterViewChecked, AfterViewInit
{
  @ViewChild('chatContainer') chatContainer!: ElementRef;

  chatMessages: ChatMessage[] = [];
  currentMessage: string = '';
  isLoading: boolean = false;

  // Datos para enviar
  showDataModal: boolean = false;
  userData: any = null;

  // Propiedades para controlar el scroll
  private shouldScrollToBottom: boolean = true;
  private isUserScrolling: boolean = false;
  private lastMessageCount: number = 0;

  // Datos del guía
  private guideData: AnimalGuideData = {
    name: 'Chamane Olivia',
    specialty: 'Guide des Animaux Intérieurs',
    experience: 'Spécialiste en connexion spirituelle avec le règne animal',
  };

  // Propiedades para la ruleta
  showFortuneWheel: boolean = false;
  animalPrizes: Prize[] = [
    {
      id: '1',
      name: '3 tours de la Roue Animale',
      color: '#4ecdc4',
      icon: '🦉',
    },
    {
      id: '2',
      name: '1 Guide Premium des Animaux',
      color: '#45b7d1',
      icon: '🦋',
    },
    {
      id: '4',
      name: 'Réessayez !',
      color: '#ff7675',
      icon: '🌙',
    },
  ];
  private wheelTimer: any;

  // ✅ NUEVO: Sistema de 3 mensajes gratis
  private readonly FREE_MESSAGES_LIMIT = 3;
  private userMessageCount: number = 0; // Contador de mensajes del usuario

  // Stripe/payment
  showPaymentModal: boolean = false;
  clientSecret: string | null = null;
  isProcessingPayment: boolean = false;
  paymentError: string | null = null;
  hasUserPaidForAnimal: boolean = false;
  blockedMessageId: string | null = null;
  private backendUrl = environment.apiUrl;

  constructor(
    private animalService: AnimalInteriorService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private paypalService: PaypalService
  ) {}

  @ViewChild('backgroundVideo') backgroundVideo!: ElementRef<HTMLVideoElement>;

  ngAfterViewInit(): void {
    if (this.backgroundVideo && this.backgroundVideo.nativeElement) {
      this.backgroundVideo.nativeElement.playbackRate = 0.6;
    }
  }

  async ngOnInit(): Promise<void> {
    this.hasUserPaidForAnimal =
      sessionStorage.getItem('hasUserPaidForAnimal_inneresTier') === 'true';

    // ✅ NUEVO: Cargar contador de mensajes desde sessionStorage
    const savedMessageCount = sessionStorage.getItem(
      'animalInteriorUserMessageCount'
    );
    if (savedMessageCount) {
      this.userMessageCount = parseInt(savedMessageCount, 10) || 0;
    }

    const paymentStatus = this.paypalService.checkPaymentStatusFromUrl();

    if (paymentStatus && paymentStatus.status === 'COMPLETED') {
      try {
        const verification = await this.paypalService.verifyAndProcessPayment(
          paymentStatus.token
        );

        if (verification.valid && verification.status === 'approved') {
          this.hasUserPaidForAnimal = true;
          sessionStorage.setItem('hasUserPaidForAnimal_inneresTier', 'true');
          localStorage.removeItem('paypal_payment_completed');

          this.blockedMessageId = null;
          sessionStorage.removeItem('animalInteriorBlockedMessageId');

          // Clear URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          this.addMessage({
            sender: this.guideData.name,
            content:
              '✨ Paiement confirmé ! Vous pouvez maintenant accéder à toute mon expérience et sagesse du règne animal sans limites.',
            timestamp: new Date(),
            isUser: false,
          });

          // ✅ NUEVO: Procesar mensaje pendiente si existe
          const pendingMessage = sessionStorage.getItem('pendingAnimalMessage');
          if (pendingMessage) {
            sessionStorage.removeItem('pendingAnimalMessage');
            setTimeout(() => {
              this.currentMessage = pendingMessage;
              this.sendMessage();
            }, 1000);
          }

          this.cdr.markForCheck();
        }
      } catch (error) {
        console.error('Error verificando pago de PayPal:', error);
        this.paymentError = 'Erreur lors de la vérification du paiement';
      }
    }

    // Cargar datos del usuario desde sessionStorage
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

    const savedMessages = sessionStorage.getItem('animalInteriorMessages');
    const savedBlockedMessageId = sessionStorage.getItem(
      'animalInteriorBlockedMessageId'
    );

    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        this.chatMessages = parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        this.blockedMessageId = savedBlockedMessageId || null;
        this.lastMessageCount = this.chatMessages.length;
      } catch (error) {
        this.initializeWelcomeMessage();
      }
    }

    if (this.chatMessages.length === 0) {
      this.initializeWelcomeMessage();
    }

    if (this.chatMessages.length > 0 && FortuneWheelComponent.canShowWheel()) {
      this.showAnimalWheelAfterDelay(2000);
    }
  }

  private initializeWelcomeMessage(): void {
    this.addMessage({
      sender: 'Chamane Olivia',
      content: `🦉 Bonjour, Chercheur ! Je suis Olivia, votre guide spirituelle du règne animal. Je suis ici pour vous aider à découvrir votre animal intérieur et à vous connecter avec lui.

Que souhaitez-vous explorer sur votre esprit animal ?`,
      timestamp: new Date(),
      isUser: false,
    });

    if (FortuneWheelComponent.canShowWheel()) {
      this.showAnimalWheelAfterDelay(3000);
    }
  }

  ngAfterViewChecked(): void {
    if (
      this.shouldScrollToBottom &&
      !this.isUserScrolling &&
      this.chatMessages.length > this.lastMessageCount
    ) {
      this.scrollToBottom();
      this.lastMessageCount = this.chatMessages.length;
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }
  }

  // ✅ NUEVO: Método para verificar si el usuario tiene acceso completo
  private hasFullAccess(): boolean {
    // Tiene acceso si: ha pagado, tiene consultas gratis de ruleta, o no ha excedido el límite
    return (
      this.hasUserPaidForAnimal ||
      this.hasFreeAnimalConsultationsAvailable() ||
      this.userMessageCount < this.FREE_MESSAGES_LIMIT
    );
  }

  // ✅ NUEVO: Obtener mensajes gratis restantes
  getFreeMessagesRemaining(): number {
    const bonusConsultations = parseInt(
      sessionStorage.getItem('freeAnimalConsultations') || '0'
    );
    const baseRemaining = Math.max(
      0,
      this.FREE_MESSAGES_LIMIT - this.userMessageCount
    );
    return baseRemaining + bonusConsultations;
  }

  // ✅ MÉTODO PRINCIPAL MODIFICADO
  sendMessage(): void {
    if (!this.currentMessage.trim() || this.isLoading) return;
    const userMessage = this.currentMessage.trim();

    // ✅ NUEVA LÓGICA: Verificar acceso ANTES de enviar mensaje
    if (!this.hasUserPaidForAnimal) {
      // Verificar si tiene consultas de ruleta disponibles
      if (this.hasFreeAnimalConsultationsAvailable()) {
        this.useFreeAnimalConsultation();
        // Continuar con el mensaje
      }
      // Verificar si aún tiene mensajes gratis del límite inicial
      else if (this.userMessageCount < this.FREE_MESSAGES_LIMIT) {
        // Incrementar contador (se hace después de enviar)
      }
      // Si excedió el límite, mostrar modal de datos
      else {
        // Cerrar otros modales primero
        this.showFortuneWheel = false;
        this.showPaymentModal = false;

        // Guardar el mensaje para procesarlo después del pago
        sessionStorage.setItem('pendingAnimalMessage', userMessage);
        this.saveStateBeforePayment();

        // Mostrar modal de datos
        setTimeout(() => {
          this.showDataModal = true;
          this.cdr.markForCheck();
        }, 100);

        return; // Salir sin procesar el mensaje
      }
    }

    this.shouldScrollToBottom = true;
    this.processUserMessage(userMessage);
  }

  private processUserMessage(userMessage: string): void {
    this.addMessage({
      sender: 'Vous',
      content: userMessage,
      timestamp: new Date(),
      isUser: true,
    });

    this.currentMessage = '';
    this.isLoading = true;

    // ✅ NUEVO: Incrementar contador de mensajes del usuario
    if (
      !this.hasUserPaidForAnimal &&
      !this.hasFreeAnimalConsultationsAvailable()
    ) {
      this.userMessageCount++;
      sessionStorage.setItem(
        'animalInteriorUserMessageCount',
        this.userMessageCount.toString()
      );
    }

    // Preparar conversationHistory
    const conversationHistory = this.chatMessages.slice(-10).map((msg) => ({
      role: msg.isUser ? ('user' as const) : ('guide' as const),
      message: msg.content,
    }));

    // ✅ NUEVO: Preparar el request con messageCount e isPremiumUser
    const chatRequest: AnimalChatRequest = {
      guideData: this.guideData,
      userMessage: userMessage,
      conversationHistory: conversationHistory,
      messageCount: this.userMessageCount, // ✅ NUEVO
      isPremiumUser: this.hasUserPaidForAnimal, // ✅ NUEVO
    };

    this.animalService.chatWithGuide(chatRequest).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.shouldScrollToBottom = true;

        if (response.success && response.response) {
          const messageId = Date.now().toString();
          this.addMessage({
            sender: 'Chamane Olivia',
            content: response.response,
            timestamp: new Date(),
            isUser: false,
            id: messageId,
          });

          // ✅ NUEVO: Manejar respuesta del backend con información de paywall
          if (response.showPaywall && !this.hasUserPaidForAnimal) {
            this.blockedMessageId = messageId;
            sessionStorage.setItem('animalInteriorBlockedMessageId', messageId);

            // Mostrar modal de datos después de un breve delay
            setTimeout(() => {
              this.saveStateBeforePayment();
              this.showFortuneWheel = false;
              this.showPaymentModal = false;

              setTimeout(() => {
                this.showDataModal = true;
                this.cdr.markForCheck();
              }, 100);
            }, 2000);
          }

          // ✅ NUEVO: Mostrar mensaje de mensajes restantes si aplica
          if (
            response.freeMessagesRemaining !== undefined &&
            response.freeMessagesRemaining > 0 &&
            !this.hasUserPaidForAnimal
          ) {
            // Opcional: mostrar cuántos mensajes gratis quedan
            console.log(
              `Messages gratuits restants : ${response.freeMessagesRemaining}`
            );
          }
        } else {
          this.addMessage({
            sender: 'Chamane Olivia',
            content:
              "🦉 Désolée, je n'ai pas pu me connecter à la sagesse animale en ce moment. Veuillez réessayer.",
            timestamp: new Date(),
            isUser: false,
          });
        }
        this.saveMessagesToSession();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isLoading = false;
        this.shouldScrollToBottom = true;
        this.addMessage({
          sender: 'Chamane Olivia',
          content:
            "🦉 Une erreur s'est produite lors de la connexion spirituelle. Veuillez réessayer.",
          timestamp: new Date(),
          isUser: false,
        });
        this.saveMessagesToSession();
        this.cdr.markForCheck();
      },
    });
  }

  private saveStateBeforePayment(): void {
    this.saveMessagesToSession();
    sessionStorage.setItem(
      'animalInteriorUserMessageCount',
      this.userMessageCount.toString()
    );
    if (this.blockedMessageId) {
      sessionStorage.setItem(
        'animalInteriorBlockedMessageId',
        this.blockedMessageId
      );
    }
  }

  private saveMessagesToSession(): void {
    try {
      const messagesToSave = this.chatMessages.map((msg) => ({
        ...msg,
        timestamp:
          msg.timestamp instanceof Date
            ? msg.timestamp.toISOString()
            : msg.timestamp,
      }));
      sessionStorage.setItem(
        'animalInteriorMessages',
        JSON.stringify(messagesToSave)
      );
    } catch {}
  }

  isMessageBlocked(message: ChatMessage): boolean {
    return message.id === this.blockedMessageId && !this.hasUserPaidForAnimal;
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

    if (this.currentMessage) {
      sessionStorage.setItem('pendingAnimalMessage', this.currentMessage);
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
        serviceName: 'Animal intérieur',
        returnPath: '/animal-interieur',
        cancelPath: '/animal-interieur',
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

  addMessage(message: ChatMessage): void {
    this.chatMessages.push(message);
    this.shouldScrollToBottom = true;
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

  onScroll(event: any): void {
    const element = event.target;
    const isAtBottom =
      element.scrollHeight - element.scrollTop === element.clientHeight;
    this.isUserScrolling = !isAtBottom;
    if (isAtBottom) {
      this.isUserScrolling = false;
    }
  }

  onUserStartScroll(): void {
    this.isUserScrolling = true;
    setTimeout(() => {
      if (this.chatContainer) {
        const element = this.chatContainer.nativeElement;
        const isAtBottom =
          element.scrollHeight - element.scrollTop === element.clientHeight;
        if (isAtBottom) {
          this.isUserScrolling = false;
        }
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

  clearChat(): void {
    this.chatMessages = [];
    this.currentMessage = '';
    this.lastMessageCount = 0;
    this.userMessageCount = 0; // ✅ NUEVO: Resetear contador
    this.blockedMessageId = null;
    this.isLoading = false;

    sessionStorage.removeItem('animalInteriorMessages');
    sessionStorage.removeItem('animalInteriorUserMessageCount'); // ✅ NUEVO
    sessionStorage.removeItem('animalInteriorBlockedMessageId');

    this.shouldScrollToBottom = true;

    this.addMessage({
      sender: 'Chamane Olivia',
      content: `🦉 Bonjour, Chercheur ! Je suis Olivia, votre guide spirituelle du règne animal. Je suis ici pour vous aider à découvrir votre animal intérieur et à vous connecter avec lui.

Que souhaitez-vous explorer sur votre esprit animal ?`,
      timestamp: new Date(),
      isUser: false,
    });

    if (FortuneWheelComponent.canShowWheel()) {
      this.showAnimalWheelAfterDelay(3000);
    }
  }

  onUserDataSubmitted(userData: any): void {
    const requiredFields = ['email'];
    const missingFields = requiredFields.filter(
      (field) => !userData[field] || userData[field].toString().trim() === ''
    );

    if (missingFields.length > 0) {
      alert(
        `Pour continuer avec le paiement, vous devez compléter les informations suivantes : ${missingFields.join(
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
    } catch (error) {}

    this.showDataModal = false;
    this.cdr.markForCheck();

    this.sendUserDataToBackend(userData);
  }

  private sendUserDataToBackend(userData: any): void {
    this.http.post(`${this.backendUrl}api/recolecta`, userData).subscribe({
      next: (response) => {
        this.promptForPayment();
      },
      error: (error) => {
        this.promptForPayment();
      },
    });
  }

  onDataModalClosed(): void {
    this.showDataModal = false;
    this.cdr.markForCheck();
  }

  showAnimalWheelAfterDelay(delayMs: number = 3000): void {
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
    const prizeMessage: ChatMessage = {
      sender: 'Chamane Olivia',
      content: `🦉 Les esprits animaux ont parlé ! Vous avez gagné : **${prize.name}** ${prize.icon}\n\nLes anciens gardiens du règne animal ont décidé de vous bénir avec ce cadeau sacré. L'énergie spirituelle coule à travers vous, vous connectant plus profondément avec votre animal intérieur. Que la sagesse ancestrale vous guide !`,
      timestamp: new Date(),
      isUser: false,
    };

    this.chatMessages.push(prizeMessage);
    this.shouldScrollToBottom = true;
    this.saveMessagesToSession();

    this.processAnimalPrize(prize);
  }

  onWheelClosed(): void {
    this.showFortuneWheel = false;
  }

  triggerAnimalWheel(): void {
    if (this.showPaymentModal || this.showDataModal) {
      return;
    }

    if (FortuneWheelComponent.canShowWheel()) {
      this.showFortuneWheel = true;
      this.cdr.markForCheck();
    } else {
      alert(
        "Vous n'avez pas de tours disponibles. " +
          FortuneWheelComponent.getSpinStatus()
      );
    }
  }

  getSpinStatus(): string {
    return FortuneWheelComponent.getSpinStatus();
  }

  private processAnimalPrize(prize: Prize): void {
    switch (prize.id) {
      case '1': // 3 Conexiones Espirituales
        this.addFreeAnimalConsultations(3);
        break;
      case '2': // 1 Guía Premium - ACCESO COMPLETO
        this.hasUserPaidForAnimal = true;
        sessionStorage.setItem('hasUserPaidForAnimal_inneresTier', 'true');

        if (this.blockedMessageId) {
          this.blockedMessageId = null;
          sessionStorage.removeItem('animalInteriorBlockedMessageId');
        }

        const premiumMessage: ChatMessage = {
          sender: 'Chamane Olivia',
          content:
            "🦋 **Vous avez débloqué l'accès Premium complet !** 🦋\n\nLes esprits animaux vous ont souri d'une manière extraordinaire. Vous avez maintenant un accès illimité à toute la sagesse du règne animal. Vous pouvez consulter sur votre animal intérieur, les connexions spirituelles et tous les mystères ancestraux autant de fois que vous le souhaitez.\n\n✨ *Les gardiens du règne animal ont ouvert toutes leurs portes pour vous* ✨",
          timestamp: new Date(),
          isUser: false,
        };
        this.chatMessages.push(premiumMessage);
        this.shouldScrollToBottom = true;
        this.saveMessagesToSession();
        break;
      case '4': // Otra oportunidad
        break;
      default:
    }
  }

  private addFreeAnimalConsultations(count: number): void {
    const current = parseInt(
      sessionStorage.getItem('freeAnimalConsultations') || '0'
    );
    const newTotal = current + count;
    sessionStorage.setItem('freeAnimalConsultations', newTotal.toString());

    if (this.blockedMessageId && !this.hasUserPaidForAnimal) {
      this.blockedMessageId = null;
      sessionStorage.removeItem('animalInteriorBlockedMessageId');
    }
  }

  private hasFreeAnimalConsultationsAvailable(): boolean {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeAnimalConsultations') || '0'
    );
    return freeConsultations > 0;
  }

  private useFreeAnimalConsultation(): void {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeAnimalConsultations') || '0'
    );

    if (freeConsultations > 0) {
      const remaining = freeConsultations - 1;
      sessionStorage.setItem('freeAnimalConsultations', remaining.toString());

      const prizeMsg: ChatMessage = {
        sender: 'Chamane Olivia',
        content: `✨ *Vous avez utilisé une connexion spirituelle gratuite* ✨\n\nIl vous reste **${remaining}** consultations avec le règne animal disponibles.`,
        timestamp: new Date(),
        isUser: false,
      };
      this.chatMessages.push(prizeMsg);
      this.shouldScrollToBottom = true;
      this.saveMessagesToSession();
    }
  }

  debugAnimalWheel(): void {
    this.showFortuneWheel = true;
    this.cdr.markForCheck();
  }
}
