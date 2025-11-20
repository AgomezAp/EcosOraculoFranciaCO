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
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ZodiacoChinoService } from '../../services/zodiaco-chino.service';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PaypalService } from '../../services/paypal.service';

import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environmets.prod';
import { RecolectaDatosComponent } from '../recolecta-datos/recolecta-datos.component';
import {
  FortuneWheelComponent,
  Prize,
} from '../fortune-wheel/fortune-wheel.component';

interface ChatMessage {
  role: 'user' | 'master';
  message: string;
  timestamp?: string;
  id?: string;
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
  timestamp: string;
}

interface ZodiacAnimal {
  animal?: string;
  symbol?: string;
  year?: number;
  element?: string;
  traits?: string[];
}
@Component({
  selector: 'app-zodiaco-chino',
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
    FortuneWheelComponent,
  ],
  templateUrl: './zodiaco-chino.component.html',
  styleUrl: './zodiaco-chino.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZodiacoChinoComponent
  implements OnInit, AfterViewChecked, OnDestroy, AfterViewInit
{
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  // Propiedades principales
  masterInfo: MasterInfo | null = null;
  userForm: FormGroup;
  isFormCompleted = false;
  isLoading = false;
  currentMessage = '';
  conversationHistory: ChatMessage[] = [];
  zodiacAnimal: ZodiacAnimal = {};
  showDataForm = true;
  isTyping: boolean = false;
  private shouldScrollToBottom = false;
  private shouldAutoScroll = true;
  private lastMessageCount = 0;
  //Variables para control de fortuna
  showFortuneWheel: boolean = false;
  horoscopePrizes: Prize[] = [
    {
      id: '1',
      name: '3 tours de la roue du zodiaque',
      color: '#4ecdc4',
      icon: '🔮',
    },
    {
      id: '2',
      name: '1 Analyse Premium du signe',
      color: '#45b7d1',
      icon: '✨',
    },
    // ✅ ELIMINADO: { id: '3', name: '2 Consultas Astrológicas Extra', color: '#ffeaa7', icon: '🌟' },
    {
      id: '4',
      name: 'Réessayez !',
      color: '#ff7675',
      icon: '🌙',
    },
  ];
  private wheelTimer: any;
  // Variables para control de pagos
  showPaymentModal: boolean = false;

  clientSecret: string | null = null;
  isProcessingPayment: boolean = false;
  paymentError: string | null = null;
  hasUserPaidForHoroscope: boolean = false;
  firstQuestionAsked: boolean = false;
  blockedMessageId: string | null = null;
  //Datos para enviar
  showDataModal: boolean = false;
  userData: any = null;
  private backendUrl = environment.apiUrl;

  constructor(
    private fb: FormBuilder,
    private zodiacoChinoService: ZodiacoChinoService,
    private http: HttpClient,
    private elRef: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private paypalService: PaypalService
  ) {
    // Configuración del formulario para horóscopo
    this.userForm = this.fb.group({
      fullName: [''],
      birthYear: [
        '',
        [Validators.required, Validators.min(1900), Validators.max(2024)],
      ],
      birthDate: [''],
      initialQuestion: [
        'Que pouvez-vous me dire sur mon signe du zodiaque et mon horoscope ?',
      ],
    });
  }
  ngAfterViewInit(): void {
    this.setVideosSpeed(0.7); // 0.5 = más lento, 1 = normal
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
    // ✅ Verificar si venimos de PayPal después de un pago
    this.hasUserPaidForHoroscope =
      sessionStorage.getItem('hasUserPaidForHoroscope_horoscope') === 'true';

    const paymentStatus = this.paypalService.checkPaymentStatusFromUrl();

    if (paymentStatus && paymentStatus.status === 'COMPLETED') {
      try {
        const verification = await this.paypalService.verifyAndProcessPayment(
          paymentStatus.token
        );

        if (verification.valid && verification.status === 'approved') {
          // ✅ Pago SOLO para este servicio (Horoscope)
          this.hasUserPaidForHoroscope = true;
          sessionStorage.setItem('hasUserPaidForHoroscope_horoscope', 'true');

          // NO usar localStorage global
          localStorage.removeItem('paypal_payment_completed');

          this.blockedMessageId = null;
          sessionStorage.removeItem('horoscopeBlockedMessageId');

          // Limpiar URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          // Cerrar modal de pago
          this.showPaymentModal = false;
          this.isProcessingPayment = false;
          this.paymentError = null;
          this.cdr.markForCheck();

          // ✅ MENSAJE DE CONFIRMACIÓN (usando firma correcta de addMessage)
          setTimeout(() => {
            this.addMessage(
              'master',
              '🎉 Paiement effectué avec succès !\n\n' +
                "✨ Merci pour votre paiement. Vous avez maintenant un accès complet à l'Horoscope.\n\n" +
                '🐉 Découvrons ensemble votre avenir astrologique !\n\n' +
                '📌 Remarque : Ce paiement est uniquement valable pour le service Horoscope. Pour les autres services, un paiement séparé est requis.'
            );
            this.cdr.detectChanges();
            setTimeout(() => this.scrollToBottom(), 200);
          }, 1000);
        } else {
          this.paymentError = "Le paiement n'a pas pu être vérifié.";

          setTimeout(() => {
            this.addMessage(
              'master',
              '⚠️ Il y a eu un problème lors de la vérification de votre paiement. Veuillez réessayer ou contacter notre support.'
            );
            this.cdr.detectChanges();
          }, 800);
        }
      } catch (error) {
        this.paymentError = 'Erreur lors de la vérification du paiement';

        setTimeout(() => {
          this.addMessage(
            'master',
            '❌ Une erreur est survenue lors de la vérification du paiement. Veuillez réessayer plus tard.'
          );
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

    // Cargar datos guardados específicos del horóscopo
    this.loadHoroscopeData();

    // ✅ PayPal verifica en ngOnInit() arriba - ya no necesitamos checkHoroscopePaymentStatus()

    this.loadMasterInfo();

    // Solo agregar mensaje de bienvenida si no hay mensajes guardados
    if (this.conversationHistory.length === 0) {
      this.initializeHoroscopeWelcomeMessage();
    }

    // ✅ TAMBIÉN VERIFICAR PARA MENSAJES RESTAURADOS
    if (
      this.conversationHistory.length > 0 &&
      FortuneWheelComponent.canShowWheel()
    ) {
      this.showHoroscopeWheelAfterDelay(2000);
    }
  }
  private loadHoroscopeData(): void {
    const savedMessages = sessionStorage.getItem('horoscopeMessages');
    const savedFirstQuestion = sessionStorage.getItem(
      'horoscopeFirstQuestionAsked'
    );
    const savedBlockedMessageId = sessionStorage.getItem(
      'horoscopeBlockedMessageId'
    );

    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        this.conversationHistory = parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp,
        }));
        this.firstQuestionAsked = savedFirstQuestion === 'true';
        this.blockedMessageId = savedBlockedMessageId || null;
      } catch (error) {
        this.clearHoroscopeSessionData();
        this.initializeHoroscopeWelcomeMessage();
      }
    }
  }
  private initializeHoroscopeWelcomeMessage(): void {
    const welcomeMessage = `Bienvenue dans le royaume des étoiles ! 🔮✨

Je suis l'astrologue María, guide céleste des signes du zodiaque. Pendant des décennies, j'ai étudié les influences des planètes et des constellations qui régissent notre destin.

Chaque personne naît sous la protection d'un signe zodiacal qui influence sa personnalité, son destin et son chemin de vie. Pour révéler les secrets de votre horoscope et les influences célestes, j'ai besoin de votre date de naissance.

Les douze signes (Bélier, Taureau, Gémeaux, Cancer, Lion, Vierge, Balance, Scorpion, Sagittaire, Capricorne, Verseau et Poissons) ont une sagesse ancestrale à partager.

Êtes-vous prêt à découvrir ce que les étoiles révèlent sur votre destin ? 🌙`;

    this.addMessage('master', welcomeMessage);

    // ✅ VERIFICACIÓN DE RULETA HOROSCÓPICA
    if (FortuneWheelComponent.canShowWheel()) {
      this.showHoroscopeWheelAfterDelay(3000);
    } else {
    }
  }
  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }

    if (
      this.shouldAutoScroll &&
      this.conversationHistory.length > this.lastMessageCount
    ) {
      this.scrollToBottom();
      this.lastMessageCount = this.conversationHistory.length;
    }
  }

  ngOnDestroy(): void {
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }
    // ✅ PayPal no requiere limpieza de elementos
  }

  // ✅ Método eliminado - PayPal maneja verificación en ngOnInit()

  private saveHoroscopeMessagesToSession(): void {
    try {
      const messagesToSave = this.conversationHistory.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp,
      }));
      sessionStorage.setItem(
        'horoscopeMessages',
        JSON.stringify(messagesToSave)
      );
    } catch (error) {}
  }

  private clearHoroscopeSessionData(): void {
    sessionStorage.removeItem('hasUserPaidForHoroscope');
    sessionStorage.removeItem('horoscopeMessages');
    sessionStorage.removeItem('horoscopeFirstQuestionAsked');
    sessionStorage.removeItem('horoscopeBlockedMessageId');
  }

  private saveHoroscopeStateBeforePayment(): void {
    this.saveHoroscopeMessagesToSession();
    sessionStorage.setItem(
      'horoscopeFirstQuestionAsked',
      this.firstQuestionAsked.toString()
    );
    if (this.blockedMessageId) {
      sessionStorage.setItem(
        'horoscopeBlockedMessageId',
        this.blockedMessageId
      );
    }
  }

  isMessageBlocked(message: ChatMessage): boolean {
    return (
      message.id === this.blockedMessageId && !this.hasUserPaidForHoroscope
    );
  }

  // ✅ MÉTODO MIGRADO A PAYPAL
  async promptForHoroscopePayment(): Promise<void> {
    this.showPaymentModal = true;
    this.cdr.markForCheck();
    this.paymentError = null;
    this.isProcessingPayment = false;

    // Validar datos de usuario
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
        "E-Mail requise. Veuillez d'abord remplir le formulaire.";
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }

    // Guardar mensaje pendiente si existe
    if (this.currentMessage) {
      sessionStorage.setItem('pendingHoroscopeMessage', this.currentMessage);
    }
  }

  // ✅ MÉTODO MIGRADO A PAYPAL
  async handleHoroscopePaymentSubmit(): Promise<void> {
    this.isProcessingPayment = true;
    this.paymentError = null;
    this.cdr.markForCheck();

    try {
      // Iniciar el flujo de pago de PayPal (redirige al usuario)
      await this.paypalService.initiatePayment({
        amount: '5.00',
        currency: 'EUR',
        serviceName: 'Horoscope',
        returnPath: '/horoscope',
        cancelPath: '/horoscope',
      });

      // El código después de esta línea NO se ejecutará porque
      // el usuario será redirigido a PayPal
    } catch (error: any) {
      this.paymentError =
        error.message || "Erreur lors de l'initialisation du paiement PayPal.";
      this.isProcessingPayment = false;
      this.cdr.markForCheck();
    }
  }

  // ✅ MÉTODO SIMPLIFICADO - PayPal no requiere cleanup
  cancelHoroscopePayment(): void {
    this.showPaymentModal = false;
    this.isProcessingPayment = false;
    this.paymentError = null;
    this.cdr.markForCheck();
  }

  startChatWithoutForm(): void {
    this.showDataForm = false;
  }

  // Cargar información del maestro
  loadMasterInfo(): void {
    this.zodiacoChinoService.getMasterInfo().subscribe({
      next: (info) => {
        this.masterInfo = info;
      },
      error: (error) => {
        // Información predeterminada en caso de error
        this.masterInfo = {
          success: true,
          master: {
            name: 'Astrologue María',
            title: 'Guide céleste des signes',
            specialty: 'Astrologie occidentale et horoscope personnalisé',
            description:
              "Astrologue sage, spécialisée dans l'interprétation des influences célestes et de la sagesse des douze signes du zodiaque",
            services: [
              'Interprétation des signes du zodiaque',
              'Analyse des cartes astrales',
              "Prévisions d'horoscope",
              'Compatibilité entre signes',
              "Conseils basés sur l'astrologie",
            ],
          },
          timestamp: new Date().toISOString(),
        };
      },
    });
  }

  // Iniciar consulta del horóscopo
  startConsultation(): void {
    if (this.userForm.valid && !this.isLoading) {
      this.isLoading = true;
      this.cdr.markForCheck(); // ✅ Detectar cambio de loading

      const formData = this.userForm.value;

      // Calcular animal del zodiaco

      const initialMessage =
        formData.initialQuestion ||
        "Bonjour ! J'aimerais en savoir plus sur mon signe du zodiaque et mon horoscope.";

      // Agregar mensaje del usuario
      this.addMessage('user', initialMessage);

      // Marcar que se hizo la primera pregunta
      if (!this.firstQuestionAsked) {
        this.firstQuestionAsked = true;
        sessionStorage.setItem('horoscopeFirstQuestionAsked', 'true');
      }

      // Preparar datos para enviar al backend
      const consultationData = {
        zodiacData: {
          name: 'Astrologue María',
          specialty: 'Astrologie occidentale et horoscope personnalisé',
          experience:
            "Des décennies d'expérience en interprétation astrologique",
        },
        userMessage: initialMessage,
        fullName: formData.fullName,
        birthYear: formData.birthYear?.toString(),
        birthDate: formData.birthDate,
        conversationHistory: this.conversationHistory,
      };

      // Llamar al servicio
      this.zodiacoChinoService.chatWithMaster(consultationData).subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success && response.response) {
            this.addMessage('master', response.response);
            this.isFormCompleted = true;
            this.showDataForm = false;
            this.saveHoroscopeMessagesToSession();
            this.cdr.markForCheck();
          } else {
            this.handleError("Erreur dans la réponse de l'astrologue");
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.handleError(
            "Erreur de connexion avec l'astrologue : " +
              (error.error?.error || error.message)
          );
          this.cdr.markForCheck();
        },
      });
    }
  }

  sendMessage(): void {
    if (this.currentMessage.trim() && !this.isLoading) {
      const message = this.currentMessage.trim();

      // ✅ LÓGICA ACTUALIZADA: Verificar acceso premium O consultas gratuitas
      if (!this.hasUserPaidForHoroscope && this.firstQuestionAsked) {
        // Verificar si tiene consultas horoscópicas gratis disponibles
        if (this.hasFreeHoroscopeConsultationsAvailable()) {
          this.useFreeHoroscopeConsultation();
          // Continuar con el mensaje sin bloquear
        } else {
          // Si no tiene consultas gratis NI acceso premium, mostrar modal de datos

          // Cerrar otros modales primero
          this.showFortuneWheel = false;
          this.showPaymentModal = false;

          // Guardar el mensaje para procesarlo después del pago
          sessionStorage.setItem('pendingHoroscopeMessage', message);

          this.saveHoroscopeStateBeforePayment();

          // Mostrar modal de datos con timeout
          setTimeout(() => {
            this.showDataModal = true;
            this.cdr.markForCheck();
          }, 100);

          return; // Salir aquí para no procesar el mensaje aún
        }
      }

      // Procesar mensaje normalmente
      this.processHoroscopeUserMessage(message);
    }
  }
  private processHoroscopeUserMessage(message: string): void {
    this.currentMessage = '';
    this.isLoading = true;
    this.isTyping = true;
    this.cdr.markForCheck(); // ✅ Detectar cambios de estado

    // Agregar mensaje del usuario
    this.addMessage('user', message);

    const formData = this.userForm.value;
    const consultationData = {
      zodiacData: {
        name: 'Astrologue María',
        specialty: 'Astrologie occidentale et horoscope personnalisé',
        experience: "Des décennies d'expérience en interprétation astrologique",
      },
      userMessage: message,
      fullName: formData.fullName,
      birthYear: formData.birthYear?.toString(),
      birthDate: formData.birthDate,
      conversationHistory: this.conversationHistory,
    };

    this.zodiacoChinoService.chatWithMaster(consultationData).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.isTyping = false;
        this.cdr.markForCheck(); // ✅ Detectar fin de loading

        if (response.success && response.response) {
          const messageId = Date.now().toString();

          this.addMessage('master', response.response, messageId);

          // ✅ LÓGICA ACTUALIZADA: Solo bloquear si NO tiene acceso premium Y no tiene consultas gratis
          if (
            this.firstQuestionAsked &&
            !this.hasUserPaidForHoroscope && // No tiene acceso premium
            !this.hasFreeHoroscopeConsultationsAvailable() // No tiene consultas gratis
          ) {
            this.blockedMessageId = messageId;
            sessionStorage.setItem('horoscopeBlockedMessageId', messageId);

            setTimeout(() => {
              this.saveHoroscopeStateBeforePayment();

              // Cerrar otros modales
              this.showFortuneWheel = false;
              this.showPaymentModal = false;

              // Mostrar modal de datos
              setTimeout(() => {
                this.showDataModal = true;
                this.cdr.markForCheck();
              }, 100);
            }, 2000);
          } else if (!this.firstQuestionAsked) {
            this.firstQuestionAsked = true;
            sessionStorage.setItem('horoscopeFirstQuestionAsked', 'true');
          }

          this.saveHoroscopeMessagesToSession();
          this.cdr.markForCheck();
        } else {
          this.handleError("Erreur dans la réponse de l'astrologue");
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.isTyping = false;
        this.handleError(
          "Erreur de connexion avec l'astrologue : " +
            (error.error?.error || error.message)
        );
        this.cdr.markForCheck();
      },
    });
  }

  // Manejar tecla Enter
  onEnterKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // Alternar formulario
  toggleDataForm(): void {
    this.showDataForm = !this.showDataForm;
  }

  // Reiniciar consulta
  resetConsultation(): void {
    this.conversationHistory = [];
    this.isFormCompleted = false;
    this.showDataForm = true;
    this.currentMessage = '';
    this.zodiacAnimal = {};
    this.firstQuestionAsked = false;
    this.blockedMessageId = null;

    // Limpiar sessionStorage específico del horóscopo
    if (!this.hasUserPaidForHoroscope) {
      this.clearHoroscopeSessionData();
    } else {
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeFirstQuestionAsked');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
    }

    this.userForm.reset({
      fullName: '',
      birthYear: '',
      birthDate: '',
      initialQuestion:
        'Que pouvez-vous me dire sur mon signe du zodiaque et mon horoscope ?',
    });
    this.initializeHoroscopeWelcomeMessage();
  }

  // Explorar compatibilidad
  exploreCompatibility(): void {
    const message =
      "Pouvez-vous me parler de la compatibilité de mon signe avec d'autres signes ?";
    this.currentMessage = message;
    this.sendMessage();
  }

  // Explorar elementos
  exploreElements(): void {
    const message =
      'Comment les planètes influencent-elles ma personnalité et mon destin?';
    this.currentMessage = message;
    this.sendMessage();
  }
  // Métodos auxiliares
  private addMessage(
    role: 'user' | 'master',
    message: string,
    id?: string
  ): void {
    const newMessage: ChatMessage = {
      role,
      message,
      timestamp: new Date().toISOString(),
      id: id || undefined,
    };
    this.conversationHistory.push(newMessage);
    this.shouldScrollToBottom = true;
    this.saveHoroscopeMessagesToSession();
    this.cdr.markForCheck(); // ✅ CRÍTICO: Detectar cambios en mensajes
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      try {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      } catch (err) {}
    }
  }

  private handleError(message: string): void {
    this.addMessage(
      'master',
      `Je suis désolé(e), ${message}. Veuillez réessayer.`
    );
  }

  formatMessage(content: string): string {
    if (!content) return '';

    let formattedContent = content;

    // Convertir **texto** a <strong>texto</strong> para negrilla
    formattedContent = formattedContent.replace(
      /\*\*(.*?)\*\*/g,
      '<strong>$1</strong>'
    );

    // Convertir saltos de línea a <br> para mejor visualización
    formattedContent = formattedContent.replace(/\n/g, '<br>');

    // Opcional: También puedes manejar *texto* (una sola asterisco) como cursiva
    formattedContent = formattedContent.replace(
      /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
      '<em>$1</em>'
    );

    return formattedContent;
  }

  formatTime(timestamp?: string): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByMessage(index: number, message: ChatMessage): string {
    return `${message.role}-${message.timestamp}-${index}`;
  }

  // Auto-resize del textarea
  autoResize(event: any): void {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  // Manejar tecla Enter
  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // Limpiar chat
  clearChat(): void {
    this.conversationHistory = [];
    this.currentMessage = '';
    this.firstQuestionAsked = false;
    this.blockedMessageId = null;
    this.isLoading = false;

    // Limpiar sessionStorage específico del horóscopo (pero NO userData)
    sessionStorage.removeItem('horoscopeMessages');
    sessionStorage.removeItem('horoscopeFirstQuestionAsked');
    sessionStorage.removeItem('horoscopeBlockedMessageId');

    this.shouldScrollToBottom = true;
    this.initializeHoroscopeWelcomeMessage();
  }
  resetChat(): void {
    // 1. Reset de arrays y mensajes
    this.conversationHistory = [];
    this.currentMessage = '';

    // 2. Reset de estados de carga y typing
    this.isLoading = false;
    this.isTyping = false;

    // 3. Reset de estados de formulario
    this.isFormCompleted = false;
    this.showDataForm = true;

    // 4. Reset de estados de pago y bloqueo
    this.firstQuestionAsked = false;
    this.blockedMessageId = null;

    // 5. Reset de modales
    this.showPaymentModal = false;
    this.showDataModal = false;
    this.showFortuneWheel = false;

    // 6. Reset de variables de scroll y contadores
    this.shouldScrollToBottom = false;
    this.shouldAutoScroll = true;
    this.lastMessageCount = 0; // ← Esta era tu variable contador

    // 7. Reset del zodiac animal
    this.zodiacAnimal = {};

    // 8. ✅ PayPal no requiere cleanup de elementos
    this.isProcessingPayment = false;
    this.paymentError = null;

    // 9. Limpiar timers
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }

    // 10. Limpiar sessionStorage específico del horóscopo (pero NO userData)
    sessionStorage.removeItem('horoscopeMessages');
    sessionStorage.removeItem('horoscopeFirstQuestionAsked');
    sessionStorage.removeItem('horoscopeBlockedMessageId');
    sessionStorage.removeItem('pendingHoroscopeMessage');
    // NO limpiar 'userData' ni 'hasUserPaidForHoroscope'

    // 11. Reset del formulario
    this.userForm.reset({
      fullName: '',
      birthYear: '',
      birthDate: '',
      initialQuestion:
        'Que pouvez-vous me dire sur mon signe du zodiaque et mon horoscope?',
    });

    // 12. Reinicializar mensaje de bienvenida
    this.initializeHoroscopeWelcomeMessage();
    this.cdr.markForCheck();
  }
  onUserDataSubmitted(userData: any): void {
    // ✅ VALIDAR CAMPOS CRÍTICOS ANTES DE PROCEDER
    const requiredFields = ['email']; // ❌ QUITADO 'apellido' - ahora está unificado con nombre
    const missingFields = requiredFields.filter(
      (field) => !userData[field] || userData[field].toString().trim() === ''
    );

    if (missingFields.length > 0) {
      alert(
        `Pour continuer, veuillez remplir les champs suivants : ${missingFields.join(
          ', '
        )}`
      );
      this.showDataModal = true; // Mantener modal abierto
      this.cdr.markForCheck();
      return;
    }

    // ✅ LIMPIAR Y GUARDAR datos INMEDIATAMENTE en memoria Y sessionStorage
    this.userData = {
      ...userData,
      email: userData.email?.toString().trim(),
    };

    // ✅ GUARDAR EN sessionStorage INMEDIATAMENTE
    try {
      sessionStorage.setItem('userData', JSON.stringify(this.userData));

      // Verificar que se guardaron correctamente
      const verificacion = sessionStorage.getItem('userData');
    } catch (error) {}

    this.showDataModal = false;
    this.cdr.markForCheck();

    // ✅ NUEVO: Enviar datos al backend como en otros componentes
    this.sendUserDataToBackend(userData);
  }
  private sendUserDataToBackend(userData: any): void {
    this.http.post(`${this.backendUrl}api/recolecta`, userData).subscribe({
      next: (response) => {
        this.promptForHoroscopePayment();
      },
      error: (error) => {
        this.promptForHoroscopePayment();
      },
    });
  }
  onDataModalClosed(): void {
    this.showDataModal = false;
    this.cdr.markForCheck();
  }
  showHoroscopeWheelAfterDelay(delayMs: number = 3000): void {
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
        this.cdr.markForCheck(); // ✅ Forzar detección de cambios
      } else {
      }
    }, delayMs);
  }

  onPrizeWon(prize: Prize): void {
    const prizeMessage: ChatMessage = {
      role: 'master',
      message: `🔮 Les étoiles se sont alliées en votre faveur ! Vous avez gagné : **${prize.name}** ${prize.icon}\n\nLes forces célestes ont décidé de vous bénir avec ce cadeau sacré. L'énergie du zodiaque circule à travers vous, révélant des secrets plus profonds de votre horoscope personnel. Que la sagesse astrologique vous éclaire !`,
      timestamp: new Date().toISOString(),
    };

    this.conversationHistory.push(prizeMessage);
    this.shouldScrollToBottom = true;
    this.saveHoroscopeMessagesToSession();

    this.processHoroscopePrize(prize);
  }

  onWheelClosed(): void {
    this.showFortuneWheel = false;
  }

  triggerHoroscopeWheel(): void {
    if (this.showPaymentModal || this.showDataModal) {
      return;
    }

    if (FortuneWheelComponent.canShowWheel()) {
      this.showFortuneWheel = true;
      this.cdr.markForCheck(); // ✅ Forzar detección de cambios
    } else {
      alert(
        "Vous n'avez plus de tours disponibles. " +
          FortuneWheelComponent.getSpinStatus()
      );
    }
  }

  getSpinStatus(): string {
    return FortuneWheelComponent.getSpinStatus();
  }

  private processHoroscopePrize(prize: Prize): void {
    switch (prize.id) {
      case '1': // 3 Lecturas Horoscópicas
        this.addFreeHoroscopeConsultations(3);
        break;
      case '2': // 1 Análisis Premium - ACCESO COMPLETO
        this.hasUserPaidForHoroscope = true;
        sessionStorage.setItem('hasUserPaidForHoroscope', 'true');

        // Desbloquear cualquier mensaje bloqueado
        if (this.blockedMessageId) {
          this.blockedMessageId = null;
          sessionStorage.removeItem('horoscopeBlockedMessageId');
        }

        // Agregar mensaje especial para este premio
        const premiumMessage: ChatMessage = {
          role: 'master',
          message:
            "🌟 **Vous avez débloqué l'accès Premium complet !** 🌟\n\nLes étoiles ont exceptionnellement souri sur vous. Vous avez maintenant un accès illimité à toute ma sagesse astrologique. Vous pouvez consulter autant de fois que vous le souhaitez sur votre horoscope, la compatibilité, les prévisions et tous les secrets célestes.\n\n✨ *L'univers a ouvert toutes ses portes pour vous* ✨",
          timestamp: new Date().toISOString(),
        };
        this.conversationHistory.push(premiumMessage);
        this.shouldScrollToBottom = true;
        this.saveHoroscopeMessagesToSession();
        break;
      // ✅ ELIMINADO: case '3' - 2 Consultas Extra
      case '4': // Otra oportunidad
        break;
      default:
    }
  }

  private addFreeHoroscopeConsultations(count: number): void {
    const current = parseInt(
      sessionStorage.getItem('freeHoroscopeConsultations') || '0'
    );
    const newTotal = current + count;
    sessionStorage.setItem('freeHoroscopeConsultations', newTotal.toString());

    if (this.blockedMessageId && !this.hasUserPaidForHoroscope) {
      this.blockedMessageId = null;
      sessionStorage.removeItem('horoscopeBlockedMessageId');
    }
  }

  private hasFreeHoroscopeConsultationsAvailable(): boolean {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeHoroscopeConsultations') || '0'
    );
    return freeConsultations > 0;
  }

  private useFreeHoroscopeConsultation(): void {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeHoroscopeConsultations') || '0'
    );

    if (freeConsultations > 0) {
      const remaining = freeConsultations - 1;
      sessionStorage.setItem(
        'freeHoroscopeConsultations',
        remaining.toString()
      );

      const prizeMsg: ChatMessage = {
        role: 'master',
        message: `✨ *Vous avez utilisé une lecture astrologique gratuite* ✨\n\nIl vous reste **${remaining}** consultations astrologiques disponibles.`,
        timestamp: new Date().toISOString(),
      };
      this.conversationHistory.push(prizeMsg);
      this.shouldScrollToBottom = true;
      this.saveHoroscopeMessagesToSession();
    }
  }

  debugHoroscopeWheel(): void {
    this.showFortuneWheel = true;
    this.cdr.markForCheck(); // ✅ Forzar detección de cambios
  }

  // ✅ MÉTODO AUXILIAR para el template
  getHoroscopeConsultationsCount(): number {
    return parseInt(
      sessionStorage.getItem('freeHoroscopeConsultations') || '0'
    );
  }
}
