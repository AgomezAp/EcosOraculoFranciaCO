import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  CalculadoraAmorService,
  CompatibilityData,
  ConversationMessage,
  LoveCalculatorResponse,
  LoveExpertInfo,
} from '../../services/calculadora-amor.service';
import { Subject, takeUntil } from 'rxjs';
import { PaypalService } from '../../services/paypal.service';

import { HttpClient } from '@angular/common/http';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RecolectaDatosComponent } from '../recolecta-datos/recolecta-datos.component';
import { environment } from '../../environments/environmets.prod';
import {
  FortuneWheelComponent,
  Prize,
} from '../fortune-wheel/fortune-wheel.component';

@Component({
  selector: 'app-calculadora-amor',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
    MatNativeDateModule,
    RecolectaDatosComponent,
  ],
  templateUrl: './calculadora-amor.component.html',
  styleUrl: './calculadora-amor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalculadoraAmorComponent
  implements OnInit, OnDestroy, AfterViewChecked
{
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  textareaHeight: number = 45;
  private readonly minTextareaHeight = 45;
  private readonly maxTextareaHeight = 120;

  conversationHistory: ConversationMessage[] = [];
  currentMessage: string = '';
  messageInput = new FormControl('');
  isLoading: boolean = false;
  isTyping: boolean = false;
  hasStartedConversation: boolean = false;
  showDataForm: boolean = false;

  showDataModal: boolean = false;
  userData: any = null;

  private shouldAutoScroll = true;
  private lastMessageCount = 0;

  showPaymentModal: boolean = false;

  clientSecret: string | null = null;
  isProcessingPayment: boolean = false;
  paymentError: string | null = null;
  hasUserPaidForLove: boolean = false;
  firstQuestionAsked: boolean = false;

  blockedMessageId: string | null = null;

  showFortuneWheel: boolean = false;
  lovePrizes: Prize[] = [
    {
      id: '1',
      name: "3 Tours de la Roue de l'Amour",
      color: '#ff69b4',
      icon: '💕',
    },
    {
      id: '2',
      name: '1 Analyse Premium de Compatibilité',
      color: '#ff1493',
      icon: '💖',
    },
    {
      id: '4',
      name: 'Réessayez !',
      color: '#dc143c',
      icon: '💘',
    },
  ];

  private wheelTimer: any;
  private backendUrl = environment.apiUrl;

  compatibilityForm: FormGroup;

  loveExpertInfo: LoveExpertInfo | null = null;
  compatibilityData: CompatibilityData | null = null;

  private destroy$ = new Subject<void>();

  // Info del experto en amor
  loveExpertInfo_display = {
    name: 'Maîtresse Valentina',
    title: "Gardienne de l'amour éternel",
    specialty: "Numérologie de l'amour et compatibilité des âmes",
  };

  // Frases de bienvenida aleatorias
  welcomeMessages = [
    "Bienvenue, âme amoureuse ! 💕 Je suis Maîtresse Paula, et je suis ici pour te révéler les secrets du véritable amour. Les cartes de l'amour murmurent des histoires de cœurs unis et de passions éternelles. Es-tu prêt(e) à découvrir la compatibilité de ta relation ?",
    "Les énergies de l'amour me murmurent que tu es venu(e) chercher des réponses du cœur... Les nombres de l'amour révèlent la chimie entre les âmes. Quel secret romantique aimerais-tu connaître ?",
    "Bienvenue dans le temple de l'amour éternel. Les motifs numérologiques de la romance ont annoncé ton arrivée. Laisse-moi calculer la compatibilité de ta relation à travers la numérologie sacrée.",
    "Les nombres de l'amour dansent devant moi et révèlent ta présence... Chaque calcul dévoile un destin romantique. Quel couple aimerais-tu que j'analyse numériquement pour toi ?",
  ];

  constructor(
    private calculadoraAmorService: CalculadoraAmorService,
    private formBuilder: FormBuilder,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private paypalService: PaypalService
  ) {
    this.compatibilityForm = this.createCompatibilityForm();
  }

  async ngOnInit(): Promise<void> {
    this.hasUserPaidForLove =
      sessionStorage.getItem('hasUserPaidForLove_liebesrechner') === 'true';

    const paymentStatus = this.paypalService.checkPaymentStatusFromUrl();

    if (paymentStatus && paymentStatus.status === 'COMPLETED') {
      try {
        const verification = await this.paypalService.verifyAndProcessPayment(
          paymentStatus.token
        );

        if (verification.valid && verification.status === 'approved') {
          this.hasUserPaidForLove = true;
          sessionStorage.setItem('hasUserPaidForLove_liebesrechner', 'true');

          localStorage.removeItem('paypal_payment_completed');

          this.blockedMessageId = null;
          sessionStorage.removeItem('loveBlockedMessageId');

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
              role: 'love_expert',
              message:
                '🎉 Paiement effectué avec succès !\n\n' +
                "✨ Merci pour ton paiement. Tu as maintenant un accès complet aux calculateurs d'amour.\n\n" +
                "💕 Découvrons ensemble les secrets de l'amour !\n\n" +
                "📌 Remarque : Ce paiement est valable uniquement pour le service de calculateur d'amour. Un paiement séparé est requis pour les autres services.",
              timestamp: new Date(),
            };
            this.conversationHistory.push(successMessage);
            this.saveMessagesToSession();
            this.cdr.detectChanges();
            setTimeout(() => this.scrollToBottom(), 200);
          }, 1000);
        } else {
          this.paymentError = "Le paiement n'a pas pu être vérifié.";

          setTimeout(() => {
            const errorMessage: ConversationMessage = {
              role: 'love_expert',
              message:
                "⚠️ Un problème s'est produit lors de la vérification de ton paiement. Veuillez réessayer ou contacter notre support.",
              timestamp: new Date(),
            };
            this.conversationHistory.push(errorMessage);
            this.saveMessagesToSession();
            this.cdr.detectChanges();
          }, 800);
        }
      } catch (error) {
        console.error('Erreur de vérification du paiement PayPal:', error);
        this.paymentError = 'Erreur lors de la vérification du paiement';

        setTimeout(() => {
          const errorMessage: ConversationMessage = {
            role: 'love_expert',
            message:
              "❌ Malheureusement, une erreur s'est produite lors de la vérification du paiement. Veuillez réessayer ultérieurement.",
            timestamp: new Date(),
          };
          this.conversationHistory.push(errorMessage);
          this.saveMessagesToSession();
          this.cdr.detectChanges();
        }, 800);
      }
    }

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

    this.loadLoveData();

    this.loadLoveExpertInfo();
    this.subscribeToCompatibilityData();

    if (
      this.conversationHistory.length > 0 &&
      FortuneWheelComponent.canShowWheel()
    ) {
      this.showLoveWheelAfterDelay(2000);
    }
  }

  private loadLoveData(): void {
    const savedMessages = sessionStorage.getItem('loveMessages');
    const savedFirstQuestion = sessionStorage.getItem('loveFirstQuestionAsked');
    const savedBlockedMessageId = sessionStorage.getItem(
      'loveBlockedMessageId'
    );

    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        this.conversationHistory = parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        this.firstQuestionAsked = savedFirstQuestion === 'true';
        this.blockedMessageId = savedBlockedMessageId || null;
        this.hasStartedConversation = true;
      } catch (error) {
        this.clearSessionData();
        this.initializeLoveWelcomeMessage();
      }
    } else {
      this.initializeLoveWelcomeMessage();
    }
  }

  private initializeLoveWelcomeMessage(): void {
    const randomWelcome =
      this.welcomeMessages[
        Math.floor(Math.random() * this.welcomeMessages.length)
      ];

    const welcomeMessage: ConversationMessage = {
      role: 'love_expert',
      message: randomWelcome,
      timestamp: new Date(),
    };

    this.conversationHistory.push(welcomeMessage);
    this.hasStartedConversation = true;

    if (FortuneWheelComponent.canShowWheel()) {
      this.showLoveWheelAfterDelay(3000);
    }
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

  ngAfterViewChecked(): void {
    if (
      this.shouldAutoScroll &&
      this.conversationHistory.length > this.lastMessageCount
    ) {
      this.scrollToBottom();
      this.lastMessageCount = this.conversationHistory.length;
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
    this.destroy$.next();
    this.destroy$.complete();
  }

  autoResize(event: any): void {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  startConversation(): void {
    if (this.conversationHistory.length === 0) {
      this.initializeLoveWelcomeMessage();
    }
    this.hasStartedConversation = true;
  }

  private createCompatibilityForm(): FormGroup {
    return this.formBuilder.group({
      person1Name: ['', [Validators.required, Validators.minLength(2)]],
      person1BirthDate: ['', Validators.required],
      person2Name: ['', [Validators.required, Validators.minLength(2)]],
      person2BirthDate: ['', Validators.required],
    });
  }

  private loadLoveExpertInfo(): void {
    this.calculadoraAmorService
      .getLoveExpertInfo()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (info) => {
          this.loveExpertInfo = info;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.cdr.markForCheck();
        },
      });
  }

  private subscribeToCompatibilityData(): void {
    this.calculadoraAmorService.compatibilityData$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.compatibilityData = data;
        if (data) {
          this.populateFormWithData(data);
        }
      });
  }

  private populateFormWithData(data: CompatibilityData): void {
    this.compatibilityForm.patchValue({
      person1Name: data.person1Name,
      person1BirthDate: new Date(data.person1BirthDate),
      person2Name: data.person2Name,
      person2BirthDate: new Date(data.person2BirthDate),
    });
  }

  calculateCompatibility(): void {
    if (this.compatibilityForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    const formValues = this.compatibilityForm.value;
    const compatibilityData: CompatibilityData = {
      person1Name: formValues.person1Name.trim(),
      person1BirthDate: this.formatDateForService(formValues.person1BirthDate),
      person2Name: formValues.person2Name.trim(),
      person2BirthDate: this.formatDateForService(formValues.person2BirthDate),
    };

    this.isLoading = true;
    this.calculadoraAmorService
      .calculateCompatibility(compatibilityData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.handleCalculationResponse(response);
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.handleError(error);
          this.cdr.markForCheck();
        },
        complete: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private handleCalculationResponse(response: LoveCalculatorResponse): void {
    if (response.success) {
      this.hasStartedConversation = true;
      this.showDataForm = false;

      const calculationMsg: ConversationMessage = {
        role: 'love_expert',
        message: `✨ J'ai terminé l'analyse numérologique de ${this.compatibilityForm.value.person1Name} et ${this.compatibilityForm.value.person2Name}. Les nombres de l'amour ont révélé des informations fascinantes sur votre compatibilité. Voulez-vous connaître les détails de cette lecture d'amour ?`,
        timestamp: new Date(),
      };

      this.conversationHistory.push(calculationMsg);
      this.saveMessagesToSession();
      this.shouldAutoScroll = true;
    }
  }

  sendMessage(): void {
    if (!this.currentMessage.trim() || this.isLoading) return;

    const userMessage = this.currentMessage.trim();

    if (!this.hasUserPaidForLove && this.firstQuestionAsked) {
      if (this.hasFreeLoveConsultationsAvailable()) {
        this.useFreeLoveConsultation();
      } else {
        this.showFortuneWheel = false;
        this.showPaymentModal = false;

        sessionStorage.setItem('pendingLoveMessage', userMessage);

        this.saveStateBeforePayment();

        setTimeout(() => {
          this.showDataModal = true;
          this.cdr.markForCheck();
        }, 100);

        return;
      }
    }

    this.processLoveUserMessage(userMessage);
  }

  private processLoveUserMessage(userMessage: string): void {
    this.shouldAutoScroll = true;

    const userMsg: ConversationMessage = {
      role: 'user',
      message: userMessage,
      timestamp: new Date(),
    };
    this.conversationHistory.push(userMsg);

    this.saveMessagesToSession();
    this.currentMessage = '';
    this.isTyping = true;
    this.isLoading = true;

    const compatibilityData =
      this.calculadoraAmorService.getCompatibilityData();

    const conversationHistoryForService = this.conversationHistory
      .slice(-10)
      .map((msg) => ({
        role:
          msg.role === 'user' ? ('user' as const) : ('love_expert' as const),
        message: msg.message,
      }));

    this.calculadoraAmorService
      .chatWithLoveExpert(
        userMessage,
        compatibilityData?.person1Name,
        compatibilityData?.person1BirthDate,
        compatibilityData?.person2Name,
        compatibilityData?.person2BirthDate
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          this.isTyping = false;

          if (response.success && response.response) {
            const messageId = Date.now().toString();

            const loveExpertMsg: ConversationMessage = {
              role: 'love_expert',
              message: response.response,
              timestamp: new Date(),
              id: messageId,
            };
            this.conversationHistory.push(loveExpertMsg);

            this.shouldAutoScroll = true;

            if (
              this.firstQuestionAsked &&
              !this.hasUserPaidForLove &&
              !this.hasFreeLoveConsultationsAvailable()
            ) {
              this.blockedMessageId = messageId;
              sessionStorage.setItem('loveBlockedMessageId', messageId);

              setTimeout(() => {
                this.saveStateBeforePayment();

                this.showFortuneWheel = false;
                this.showPaymentModal = false;

                setTimeout(() => {
                  this.showDataModal = true;
                  this.cdr.markForCheck();
                }, 100);
              }, 2000);
            } else if (!this.firstQuestionAsked) {
              this.firstQuestionAsked = true;
              sessionStorage.setItem('loveFirstQuestionAsked', 'true');
            }

            this.saveMessagesToSession();
            this.cdr.markForCheck();
          } else {
            this.handleError(
              "Erreur lors de la récupération de la réponse de l'experte en amour"
            );
          }
        },
        error: (error: any) => {
          this.isLoading = false;
          this.isTyping = false;
          this.handleError('Erreur de connexion. Veuillez réessayer.');
          this.cdr.markForCheck();
        },
      });
  }

  private saveStateBeforePayment(): void {
    this.saveMessagesToSession();
    sessionStorage.setItem(
      'loveFirstQuestionAsked',
      this.firstQuestionAsked.toString()
    );
    if (this.blockedMessageId) {
      sessionStorage.setItem('loveBlockedMessageId', this.blockedMessageId);
    }
  }

  private saveMessagesToSession(): void {
    try {
      const messagesToSave = this.conversationHistory.map((msg) => ({
        ...msg,
        timestamp:
          msg.timestamp instanceof Date
            ? msg.timestamp.toISOString()
            : msg.timestamp,
      }));
      sessionStorage.setItem('loveMessages', JSON.stringify(messagesToSave));
    } catch (error) {}
  }

  private clearSessionData(): void {
    sessionStorage.removeItem('hasUserPaidForLove');
    sessionStorage.removeItem('loveMessages');
    sessionStorage.removeItem('loveFirstQuestionAsked');
    sessionStorage.removeItem('loveBlockedMessageId');
  }

  isMessageBlocked(message: ConversationMessage): boolean {
    return message.id === this.blockedMessageId && !this.hasUserPaidForLove;
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
        "Aucune donnée client trouvée. Veuillez d'abord remplir le formulaire.";
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

    if (this.currentMessage?.trim()) {
      sessionStorage.setItem('pendingLoveMessage', this.currentMessage.trim());
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
        serviceName: "Calculatrice de l'amour",
        returnPath: '/calculateur-amour',
        cancelPath: '/calculateur-amour',
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

  onEnterPressed(event: KeyboardEvent): void {
    if (event.shiftKey) {
      return;
    }

    event.preventDefault();

    if (this.canSendMessage() && !this.isLoading) {
      this.sendMessage();
      setTimeout(() => {
        this.textareaHeight = this.minTextareaHeight;
      }, 50);
    }
  }

  canSendMessage(): boolean {
    return !!(this.currentMessage && this.currentMessage.trim().length > 0);
  }

  resetChat(): void {
    this.conversationHistory = [];

    this.currentMessage = '';

    this.isLoading = false;
    this.isTyping = false;

    this.addWelcomeMessage();

    this.cdr.markForCheck();

    setTimeout(() => {
      this.scrollToBottom();
    }, 100);
  }

  private addWelcomeMessage(): void {
    const welcomeMessage = {
      id: Date.now().toString(),
      role: 'love_expert' as const,
      message:
        "Bonjour ! Je suis Maîtresse Paula, ta guide dans le monde de l'amour et de la compatibilité numérologique. Comment puis-je t'aider aujourd'hui ? 💕",
      timestamp: new Date(),
      isBlocked: false,
    };

    this.conversationHistory.push(welcomeMessage);
  }

  savePersonalData(): void {
    this.showDataForm = false;
  }

  toggleDataForm(): void {
    this.showDataForm = !this.showDataForm;
  }

  newConsultation(): void {
    this.shouldAutoScroll = true;
    this.lastMessageCount = 0;

    if (!this.hasUserPaidForLove) {
      this.firstQuestionAsked = false;
      this.blockedMessageId = null;
      this.clearSessionData();
    } else {
      sessionStorage.removeItem('loveMessages');
      sessionStorage.removeItem('loveFirstQuestionAsked');
      sessionStorage.removeItem('loveBlockedMessageId');
      this.firstQuestionAsked = false;
      this.blockedMessageId = null;
    }

    this.conversationHistory = [];
    this.hasStartedConversation = false;
    this.calculadoraAmorService.resetService();
    this.compatibilityForm.reset();
    this.initializeLoveWelcomeMessage();
    this.cdr.markForCheck();
  }

  trackByMessage(index: number, message: ConversationMessage): string {
    return `${message.role}-${message.timestamp.getTime()}-${index}`;
  }

  formatTime(timestamp: Date | string): string {
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

  private handleError(errorMessage: string): void {
    const errorMsg: ConversationMessage = {
      role: 'love_expert',
      message: `💕 Les énergies de l'amour fluctuent... ${errorMessage} Réessaie quand les vibrations romantiques seront stabilisées.`,
      timestamp: new Date(),
    };
    this.conversationHistory.push(errorMsg);
    this.shouldAutoScroll = true;
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        const element = this.scrollContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) {}
  }

  private formatDateForService(date: Date): string {
    if (!date) return '';

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  private markFormGroupTouched(): void {
    Object.keys(this.compatibilityForm.controls).forEach((key) => {
      const control = this.compatibilityForm.get(key);
      control?.markAsTouched();
    });
  }

  hasFormError(fieldName: string, errorType: string): boolean {
    const field = this.compatibilityForm.get(fieldName);
    return !!(
      field &&
      field.hasError(errorType) &&
      (field.dirty || field.touched)
    );
  }

  getFieldErrorMessage(fieldName: string): string {
    const field = this.compatibilityForm.get(fieldName);

    if (field?.hasError('required')) {
      return 'Ce champ est obligatoire';
    }

    if (field?.hasError('minlength')) {
      return 'Minimum 2 caractères';
    }

    return '';
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

  onUserDataSubmitted(userData: any): void {
    const requiredFields = ['email'];
    const missingFields = requiredFields.filter(
      (field) => !userData[field] || userData[field].toString().trim() === ''
    );

    if (missingFields.length > 0) {
      alert(
        `Pour procéder au paiement, tu dois remplir les champs suivants : ${missingFields.join(
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

      const verificacion = sessionStorage.getItem('userData');
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

  showLoveWheelAfterDelay(delayMs: number = 3000): void {
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
      role: 'love_expert',
      message: `💕 Le véritable amour a conspiré en ta faveur ! Tu as gagné : **${prize.name}** ${prize.icon}\n\nLes forces romantiques de l'univers ont décidé de te bénir avec ce cadeau céleste. L'énergie de l'amour coule à travers toi et révèle des secrets plus profonds sur la compatibilité et la romance. Que l'amour éternel t'accompagne !`,
      timestamp: new Date(),
    };

    this.conversationHistory.push(prizeMessage);
    this.shouldAutoScroll = true;
    this.saveMessagesToSession();

    this.processLovePrize(prize);
  }

  private processLovePrize(prize: Prize): void {
    switch (prize.id) {
      case '1':
        this.addFreeLoveConsultations(3);
        break;
      case '2':
        this.addFreeLoveConsultations(1);
        break;
      case '4':
        break;
      default:
    }
  }

  private addFreeLoveConsultations(count: number): void {
    const current = parseInt(
      sessionStorage.getItem('freeLoveConsultations') || '0'
    );
    const newTotal = current + count;
    sessionStorage.setItem('freeLoveConsultations', newTotal.toString());

    if (this.blockedMessageId && !this.hasUserPaidForLove) {
      this.blockedMessageId = null;
      sessionStorage.removeItem('loveBlockedMessageId');
    }
  }

  private hasFreeLoveConsultationsAvailable(): boolean {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeLoveConsultations') || '0'
    );
    return freeConsultations > 0;
  }

  private useFreeLoveConsultation(): void {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeLoveConsultations') || '0'
    );

    if (freeConsultations > 0) {
      const remaining = freeConsultations - 1;
      sessionStorage.setItem('freeLoveConsultations', remaining.toString());

      const prizeMsg: ConversationMessage = {
        role: 'love_expert',
        message: `✨ *Tu as utilisé une consultation d'amour gratuite* ✨\n\nIl te reste **${remaining}** consultation(s) d'amour gratuite(s) disponible(s).`,
        timestamp: new Date(),
      };
      this.conversationHistory.push(prizeMsg);
      this.shouldAutoScroll = true;
      this.saveMessagesToSession();
    }
  }

  onWheelClosed(): void {
    this.showFortuneWheel = false;
  }

  triggerLoveWheel(): void {
    if (this.showPaymentModal || this.showDataModal) {
      return;
    }

    if (FortuneWheelComponent.canShowWheel()) {
      this.showFortuneWheel = true;
      this.cdr.markForCheck();
    } else {
      alert(
        "Tu n'as pas de tours disponibles. " +
          FortuneWheelComponent.getSpinStatus()
      );
    }
  }

  getSpinStatus(): string {
    return FortuneWheelComponent.getSpinStatus();
  }
}
