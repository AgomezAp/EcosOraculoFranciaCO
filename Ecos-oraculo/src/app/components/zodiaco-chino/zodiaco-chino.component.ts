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
  ],
  templateUrl: './zodiaco-chino.component.html',
  styleUrl: './zodiaco-chino.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZodiacoChinoComponent
  implements OnInit, AfterViewChecked, OnDestroy, AfterViewInit
{
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  // Propriétés principales
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

  // Variables pour le contrôle de la roue de la fortune
  showFortuneWheel: boolean = false;
  horoscopePrizes: Prize[] = [
    {
      id: '1',
      name: '3 tours de la Roue du Signe du Zodiaque',
      color: '#4ecdc4',
      icon: '🔮',
    },
    {
      id: '2',
      name: '1 Analyse Premium du Signe du Zodiaque',
      color: '#45b7d1',
      icon: '✨',
    },
    {
      id: '4',
      name: 'Réessayez !',
      color: '#ff7675',
      icon: '🌙',
    },
  ];
  private wheelTimer: any;

  // Variables pour le contrôle des paiements
  showPaymentModal: boolean = false;
  clientSecret: string | null = null;
  isProcessingPayment: boolean = false;
  paymentError: string | null = null;
  hasUserPaidForHoroscope: boolean = false;
  blockedMessageId: string | null = null;

  // ✅ NOUVEAU : Système de 3 messages gratuits
  private userMessageCount: number = 0;
  private readonly FREE_MESSAGES_LIMIT = 3;

  // Données à envoyer
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
    // Configuration du formulaire pour l'horoscope
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
    this.setVideosSpeed(0.7); // 0.5 = plus lent, 1 = normal
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
    // ✅ Vérifier si nous venons de PayPal après un paiement
    this.hasUserPaidForHoroscope =
      sessionStorage.getItem('hasUserPaidForHoroscope_horoskop') === 'true';

    const paymentStatus = this.paypalService.checkPaymentStatusFromUrl();

    if (paymentStatus && paymentStatus.status === 'COMPLETED') {
      try {
        const verification = await this.paypalService.verifyAndProcessPayment(
          paymentStatus.token
        );

        if (verification.valid && verification.status === 'approved') {
          // ✅ Paiement UNIQUEMENT pour ce service (Horoscope)
          this.hasUserPaidForHoroscope = true;
          sessionStorage.setItem('hasUserPaidForHoroscope_horoskop', 'true');

          // NE PAS utiliser localStorage global
          localStorage.removeItem('paypal_payment_completed');

          this.blockedMessageId = null;
          sessionStorage.removeItem('horoscopeBlockedMessageId');

          // Nettoyer l'URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          // Fermer le modal de paiement
          this.showPaymentModal = false;
          this.isProcessingPayment = false;
          this.paymentError = null;
          this.cdr.markForCheck();

          // ✅ MESSAGE DE CONFIRMATION (utilisant la signature correcte de addMessage)
          setTimeout(() => {
            this.addMessage(
              'master',
              '🎉 Paiement effectué avec succès !\n\n' +
                "✨ Merci pour votre paiement. Vous avez maintenant un accès complet à l'Horoscope Chinois.\n\n" +
                '🐉 Découvrons ensemble votre avenir astrologique !\n\n' +
                "📌 Note : Ce paiement est valable uniquement pour le service d'Horoscope. Pour d'autres services, un paiement séparé est requis."
            );
            this.cdr.detectChanges();
            setTimeout(() => this.scrollToBottom(), 200);
          }, 1000);
        } else {
          this.paymentError = "Le paiement n'a pas pu être vérifié.";

          setTimeout(() => {
            this.addMessage(
              'master',
              '⚠️ Un problème est survenu lors de la vérification de votre paiement. Veuillez réessayer ou contacter notre support.'
            );
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
          this.addMessage(
            'master',
            "❌ Malheureusement, une erreur s'est produite lors de la vérification de votre paiement. Veuillez réessayer plus tard."
          );
          this.cdr.detectChanges();
        }, 800);
      }
    }

    // ✅ NOUVEAU : Charger le compteur de messages
    const savedMessageCount = sessionStorage.getItem(
      'horoscopeUserMessageCount'
    );
    if (savedMessageCount) {
      this.userMessageCount = parseInt(savedMessageCount, 10);
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

    // Charger les données sauvegardées spécifiques à l'horoscope
    this.loadHoroscopeData();

    // ✅ PayPal vérifie dans ngOnInit() ci-dessus - nous n'avons plus besoin de checkHoroscopePaymentStatus()

    this.loadMasterInfo();

    // Ajouter le message de bienvenue uniquement s'il n'y a pas de messages sauvegardés
    if (this.conversationHistory.length === 0) {
      this.initializeHoroscopeWelcomeMessage();
    }

    // ✅ ÉGALEMENT VÉRIFIER POUR LES MESSAGES RESTAURÉS
    if (
      this.conversationHistory.length > 0 &&
      FortuneWheelComponent.canShowWheel()
    ) {
      this.showHoroscopeWheelAfterDelay(2000);
    }
  }

  private loadHoroscopeData(): void {
    const savedMessages = sessionStorage.getItem('horoscopeMessages');
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
        this.blockedMessageId = savedBlockedMessageId || null;
      } catch (error) {
        this.clearHoroscopeSessionData();
        this.initializeHoroscopeWelcomeMessage();
      }
    }
  }

  private initializeHoroscopeWelcomeMessage(): void {
    const welcomeMessage = `Bienvenue au Royaume des Étoiles ! 🔮✨

Je suis l'Astrologue Marie, guide céleste des signes du zodiaque. Depuis des décennies, j'étudie les influences des planètes et des constellations qui guident notre destin.

Chaque personne naît sous la protection d'un signe du zodiaque qui influence sa personnalité, son destin et son chemin de vie. Pour révéler les secrets de votre horoscope et les influences célestes, j'ai besoin de votre date de naissance.

Les douze signes (Bélier, Taureau, Gémeaux, Cancer, Lion, Vierge, Balance, Scorpion, Sagittaire, Capricorne, Verseau et Poissons) ont une sagesse ancestrale à partager.

Êtes-vous prêt à découvrir ce que les étoiles révèlent sur votre destin ? 🌙`;

    this.addMessage('master', welcomeMessage);

    // ✅ VÉRIFICATION DE LA ROUE HOROSCOPIQUE
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
    // ✅ PayPal ne nécessite pas de nettoyage d'éléments
  }

  // ✅ Méthode supprimée - PayPal gère la vérification dans ngOnInit()

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
    sessionStorage.removeItem('horoscopeBlockedMessageId');
    sessionStorage.removeItem('horoscopeUserMessageCount');
    sessionStorage.removeItem('freeHoroscopeConsultations');
    sessionStorage.removeItem('pendingHoroscopeMessage');
  }

  private saveHoroscopeStateBeforePayment(): void {
    this.saveHoroscopeMessagesToSession();
    sessionStorage.setItem(
      'horoscopeUserMessageCount',
      this.userMessageCount.toString()
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

  // ✅ MÉTHODE MIGRÉE VERS PAYPAL
  async promptForHoroscopePayment(): Promise<void> {
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
      sessionStorage.setItem('pendingHoroscopeMessage', this.currentMessage);
    }
  }

  // ✅ MÉTHODE MIGRÉE VERS PAYPAL
  async handleHoroscopePaymentSubmit(): Promise<void> {
    this.isProcessingPayment = true;
    this.paymentError = null;
    this.cdr.markForCheck();

    try {
      // Démarrer le flux de paiement PayPal (redirige l'utilisateur)
      await this.paypalService.initiatePayment({
        amount: '4.00',
        currency: 'EUR',
        serviceName: 'Horoscope',
        returnPath: '/horoscope',
        cancelPath: '/horoscope',
      });

      // Le code après cette ligne NE sera PAS exécuté car
      // l'utilisateur sera redirigé vers PayPal
    } catch (error: any) {
      this.paymentError =
        error.message || 'Erreur lors du démarrage du paiement PayPal.';
      this.isProcessingPayment = false;
      this.cdr.markForCheck();
    }
  }

  // ✅ MÉTHODE SIMPLIFIÉE - PayPal ne nécessite pas de cleanup
  cancelHoroscopePayment(): void {
    this.showPaymentModal = false;
    this.isProcessingPayment = false;
    this.paymentError = null;
    this.cdr.markForCheck();
  }

  startChatWithoutForm(): void {
    this.showDataForm = false;
  }

  // Charger les informations du maître
  loadMasterInfo(): void {
    this.zodiacoChinoService.getMasterInfo().subscribe({
      next: (info) => {
        this.masterInfo = info;
      },
      error: (error) => {
        // Informations par défaut en cas d'erreur
        this.masterInfo = {
          success: true,
          master: {
            name: 'Astrologue Marie',
            title: 'Guide Céleste des Signes',
            specialty: 'Astrologie Occidentale et Horoscope Personnalisé',
            description:
              "Astrologue sage, spécialisée dans l'interprétation des influences célestes et la sagesse des douze signes du zodiaque",
            services: [
              'Interprétation des signes du zodiaque',
              'Analyse des thèmes astraux',
              "Prédictions d'horoscope",
              'Compatibilité entre signes',
              "Conseils basés sur l'astrologie",
            ],
          },
          timestamp: new Date().toISOString(),
        };
      },
    });
  }

  // Démarrer la consultation de l'horoscope
  startConsultation(): void {
    if (this.userForm.valid && !this.isLoading) {
      this.isLoading = true;
      this.cdr.markForCheck(); // ✅ Détecter le changement de loading

      const formData = this.userForm.value;

      // Calculer l'animal du zodiaque

      const initialMessage =
        formData.initialQuestion ||
        "Bonjour ! J'aimerais en savoir plus sur mon signe du zodiaque et mon horoscope.";

      // Ajouter le message de l'utilisateur
      this.addMessage('user', initialMessage);

      // Préparer les données à envoyer au backend
      const consultationData = {
        zodiacData: {
          name: 'Astrologue Marie',
          specialty: 'Astrologie Occidentale et Horoscope Personnalisé',
          experience:
            "Des décennies d'expérience en interprétation astrologique",
        },
        userMessage: initialMessage,
        fullName: formData.fullName,
        birthYear: formData.birthYear?.toString(),
        birthDate: formData.birthDate,
        conversationHistory: this.conversationHistory,
      };

      // ✅ Appeler le service avec compteur de messages (message initial = 1)
      this.zodiacoChinoService
        .chatWithMasterWithCount(
          consultationData,
          1,
          this.hasUserPaidForHoroscope
        )
        .subscribe({
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

  // ✅ NOUVEAU : Obtenir les messages gratuits restants
  getFreeMessagesRemaining(): number {
    if (this.hasUserPaidForHoroscope) {
      return -1; // Illimité
    }
    return Math.max(0, this.FREE_MESSAGES_LIMIT - this.userMessageCount);
  }

  sendMessage(): void {
    if (this.currentMessage.trim() && !this.isLoading) {
      const message = this.currentMessage.trim();

      // Calculer le prochain numéro de message
      const nextMessageCount = this.userMessageCount + 1;

      console.log(
        `📊 Horoscope - Message #${nextMessageCount}, Premium : ${this.hasUserPaidForHoroscope}, Limite : ${this.FREE_MESSAGES_LIMIT}`
      );

      // ✅ Vérifier l'accès
      const canSendMessage =
        this.hasUserPaidForHoroscope ||
        this.hasFreeHoroscopeConsultationsAvailable() ||
        nextMessageCount <= this.FREE_MESSAGES_LIMIT;

      if (!canSendMessage) {
        console.log('❌ Sans accès - affichage du modal de paiement');

        // Fermer les autres modals
        this.showFortuneWheel = false;
        this.showPaymentModal = false;

        // Sauvegarder le message en attente
        sessionStorage.setItem('pendingHoroscopeMessage', message);
        this.saveHoroscopeStateBeforePayment();

        // Afficher le modal de données
        setTimeout(() => {
          this.showDataModal = true;
          this.cdr.markForCheck();
        }, 100);

        return;
      }

      // ✅ Si utilisation d'une consultation gratuite de la roulette (après les 3 gratuites)
      if (
        !this.hasUserPaidForHoroscope &&
        nextMessageCount > this.FREE_MESSAGES_LIMIT &&
        this.hasFreeHoroscopeConsultationsAvailable()
      ) {
        this.useFreeHoroscopeConsultation();
      }

      // Traiter le message normalement
      this.processHoroscopeUserMessage(message, nextMessageCount);
    }
  }

  private processHoroscopeUserMessage(
    message: string,
    messageCount: number
  ): void {
    this.currentMessage = '';
    this.isLoading = true;
    this.isTyping = true;
    this.cdr.markForCheck(); // ✅ Détecter les changements d'état

    // Ajouter le message de l'utilisateur
    this.addMessage('user', message);

    // ✅ Mettre à jour le compteur
    this.userMessageCount = messageCount;
    sessionStorage.setItem(
      'horoscopeUserMessageCount',
      this.userMessageCount.toString()
    );

    const formData = this.userForm.value;
    const consultationData = {
      zodiacData: {
        name: 'Astrologue Marie',
        specialty: 'Astrologie Occidentale et Horoscope Personnalisé',
        experience: "Des décennies d'expérience en interprétation astrologique",
      },
      userMessage: message,
      fullName: formData.fullName,
      birthYear: formData.birthYear?.toString(),
      birthDate: formData.birthDate,
      conversationHistory: this.conversationHistory,
    };

    // ✅ Appeler le service avec compteur de messages
    this.zodiacoChinoService
      .chatWithMasterWithCount(
        consultationData,
        messageCount,
        this.hasUserPaidForHoroscope
      )
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          this.isTyping = false;
          this.cdr.markForCheck(); // ✅ Détecter la fin du loading

          if (response.success && response.response) {
            const messageId = Date.now().toString();

            this.addMessage('master', response.response, messageId);

            // ✅ Afficher le paywall si la limite gratuite est dépassée ET pas de consultations de roulette
            const shouldShowPaywall =
              !this.hasUserPaidForHoroscope &&
              messageCount > this.FREE_MESSAGES_LIMIT &&
              !this.hasFreeHoroscopeConsultationsAvailable();

            if (shouldShowPaywall) {
              this.blockedMessageId = messageId;
              sessionStorage.setItem('horoscopeBlockedMessageId', messageId);

              setTimeout(() => {
                this.saveHoroscopeStateBeforePayment();

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

  // Gérer la touche Entrée
  onEnterKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // Basculer le formulaire
  toggleDataForm(): void {
    this.showDataForm = !this.showDataForm;
  }

  // Réinitialiser la consultation
  resetConsultation(): void {
    this.conversationHistory = [];
    this.isFormCompleted = false;
    this.showDataForm = true;
    this.currentMessage = '';
    this.zodiacAnimal = {};
    this.blockedMessageId = null;

    // ✅ Réinitialiser le compteur
    if (!this.hasUserPaidForHoroscope) {
      this.userMessageCount = 0;
      this.clearHoroscopeSessionData();
    } else {
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      this.userMessageCount = 0;
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

  // Explorer la compatibilité
  exploreCompatibility(): void {
    const message =
      "Pourriez-vous parler de la compatibilité de mon signe du zodiaque avec d'autres signes ?";
    this.currentMessage = message;
    this.sendMessage();
  }

  // Explorer les éléments
  exploreElements(): void {
    const message =
      'Comment les planètes influencent-elles ma personnalité et mon destin ?';
    this.currentMessage = message;
    this.sendMessage();
  }

  // Méthodes auxiliaires
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
    this.cdr.markForCheck(); // ✅ CRITIQUE : Détecter les changements dans les messages
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
    this.addMessage('master', `Désolé, ${message}. Veuillez réessayer.`);
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

  formatTime(timestamp?: string): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByMessage(index: number, message: ChatMessage): string {
    return `${message.role}-${message.timestamp}-${index}`;
  }

  // Auto-resize du textarea
  autoResize(event: any): void {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  // Gérer la touche Entrée
  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // Effacer le chat
  clearChat(): void {
    this.conversationHistory = [];
    this.currentMessage = '';
    this.blockedMessageId = null;
    this.isLoading = false;

    // ✅ Réinitialiser le compteur
    if (!this.hasUserPaidForHoroscope) {
      this.userMessageCount = 0;
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      sessionStorage.removeItem('freeHoroscopeConsultations');
      sessionStorage.removeItem('pendingHoroscopeMessage');
    } else {
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      this.userMessageCount = 0;
    }

    this.shouldScrollToBottom = true;
    this.initializeHoroscopeWelcomeMessage();
  }

  resetChat(): void {
    // 1. Reset des arrays et messages
    this.conversationHistory = [];
    this.currentMessage = '';

    // 2. Reset des états de chargement et typing
    this.isLoading = false;
    this.isTyping = false;

    // 3. Reset des états de formulaire
    this.isFormCompleted = false;
    this.showDataForm = true;

    // 4. Reset des états de paiement et blocage
    this.blockedMessageId = null;

    // 5. Reset des modals
    this.showPaymentModal = false;
    this.showDataModal = false;
    this.showFortuneWheel = false;

    // 6. Reset des variables de scroll et compteurs
    this.shouldScrollToBottom = false;
    this.shouldAutoScroll = true;
    this.lastMessageCount = 0;

    // 7. Reset du zodiac animal
    this.zodiacAnimal = {};

    // 8. ✅ PayPal ne nécessite pas de cleanup d'éléments
    this.isProcessingPayment = false;
    this.paymentError = null;

    // 9. Nettoyer les timers
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }

    // 10. ✅ Réinitialiser le compteur et nettoyer sessionStorage
    if (!this.hasUserPaidForHoroscope) {
      this.userMessageCount = 0;
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      sessionStorage.removeItem('freeHoroscopeConsultations');
      sessionStorage.removeItem('pendingHoroscopeMessage');
    } else {
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      this.userMessageCount = 0;
    }
    // NE PAS nettoyer 'userData' ni 'hasUserPaidForHoroscope'

    // 11. Reset du formulaire
    this.userForm.reset({
      fullName: '',
      birthYear: '',
      birthDate: '',
      initialQuestion:
        'Que pouvez-vous me dire sur mon signe du zodiaque et mon horoscope ?',
    });

    // 12. Réinitialiser le message de bienvenue
    this.initializeHoroscopeWelcomeMessage();
    this.cdr.markForCheck();
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
        this.cdr.markForCheck(); // ✅ Forcer la détection des changements
      } else {
      }
    }, delayMs);
  }

  onPrizeWon(prize: Prize): void {
    const prizeMessage: ChatMessage = {
      role: 'master',
      message: `🔮 Les étoiles ont conspiré en votre faveur ! Vous avez gagné : **${prize.name}** ${prize.icon}\n\nLes forces célestes ont décidé de vous bénir avec ce cadeau sacré. L'énergie du signe du zodiaque coule à travers vous, révélant des secrets plus profonds de votre horoscope personnel. Que la sagesse astrologique vous illumine !`,
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
      this.cdr.markForCheck(); // ✅ Forcer la détection des changements
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

  private processHoroscopePrize(prize: Prize): void {
    switch (prize.id) {
      case '1': // 3 Lectures Horoscopiques
        this.addFreeHoroscopeConsultations(3);
        break;
      case '2': // 1 Analyse Premium - ACCÈS COMPLET
        this.hasUserPaidForHoroscope = true;
        sessionStorage.setItem('hasUserPaidForHoroscope', 'true');

        // Débloquer tout message bloqué
        if (this.blockedMessageId) {
          this.blockedMessageId = null;
          sessionStorage.removeItem('horoscopeBlockedMessageId');
        }

        // Ajouter un message spécial pour ce prix
        const premiumMessage: ChatMessage = {
          role: 'master',
          message:
            "🌟 **Vous avez débloqué l'accès premium complet !** 🌟\n\nLes étoiles vous ont souri exceptionnellement. Vous avez maintenant un accès illimité à toute ma sagesse astrologique. Vous pouvez consulter votre horoscope, la compatibilité, les prédictions et tous les secrets célestes autant de fois que vous le souhaitez.\n\n✨ *L'univers a ouvert toutes les portes pour vous* ✨",
          timestamp: new Date().toISOString(),
        };
        this.conversationHistory.push(premiumMessage);
        this.shouldScrollToBottom = true;
        this.saveHoroscopeMessagesToSession();
        break;
      case '4': // Autre opportunité
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
    this.cdr.markForCheck(); // ✅ Forcer la détection des changements
  }

  // ✅ MÉTHODE AUXILIAIRE pour le template
  getHoroscopeConsultationsCount(): number {
    return parseInt(
      sessionStorage.getItem('freeHoroscopeConsultations') || '0'
    );
  }
}
