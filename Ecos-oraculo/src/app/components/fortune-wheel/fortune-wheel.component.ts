import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core';
export interface Prize {
  id: string;
  name: string;
  color: string;
  textColor?: string;
  icon?: string;
}

@Component({
  selector: 'app-fortune-wheel',
  imports: [CommonModule],
  standalone: true,
  templateUrl: './fortune-wheel.component.html',
  styleUrl: './fortune-wheel.component.css',
})
export class FortuneWheelComponent implements OnInit, OnDestroy {
  @Input() isVisible: boolean = false;
  @Input() prizes: Prize[] = [
    { id: '1', name: '3 Tours Gratuits', color: '#4ecdc4', icon: '🎲' },
    { id: '2', name: '1 Consultation Premium', color: '#45b7d1', icon: '🔮' },
    { id: '4', name: 'Essayez Encore !', color: '#ff7675', icon: '🔄' },
  ];

  @Output() onPrizeWon = new EventEmitter<Prize>();
  @Output() onWheelClosed = new EventEmitter<void>();

  @ViewChild('wheelElement') wheelElement!: ElementRef;

  // ✅ PROPRIÉTÉS POUR LA ROUE
  segmentAngle: number = 0;
  currentRotation: number = 0;
  isSpinning: boolean = false;
  selectedPrize: Prize | null = null;
  wheelSpinning: boolean = false;

  // ✅ CONTRÔLE D'ÉTAT AMÉLIORÉ
  canSpinWheel: boolean = true;
  isProcessingClick: boolean = false; // ✅ NOUVEAU : Prévenir les clics multiples
  hasUsedDailyFreeSpIn: boolean = false;
  nextFreeSpinTime: Date | null = null;
  spinCooldownTimer: any;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.segmentAngle = 360 / this.prizes.length;
    this.checkSpinAvailability();
    this.startSpinCooldownTimer();
  }

  ngOnDestroy(): void {
    if (this.spinCooldownTimer) {
      clearInterval(this.spinCooldownTimer);
    }
  }
  get currentWheelSpins(): number {
    return this.getWheelSpinsCount();
  }
  // ✅ MÉTHODE PRINCIPALE POUR VÉRIFIER SI LA ROUE PEUT ÊTRE AFFICHÉE
  static canShowWheel(): boolean {
    const wheelSpins = parseInt(sessionStorage.getItem('wheelSpins') || '0');
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');
    const today = new Date().toDateString();


    // A des tours supplémentaires pour la roue
    if (wheelSpins > 0) {
      return true;
    }

    // Nouvel utilisateur (n'a jamais tourné)
    if (!lastSpinDate) {
      return true;
    }

    // A déjà utilisé son tour quotidien gratuit
    if (lastSpinDate === today) {
      return false;
    }

    // Nouveau jour - peut utiliser le tour gratuit
    return true;
  }

  // ✅ MÉTHODE STATIQUE POUR VÉRIFIER DEPUIS D'AUTRES COMPOSANTS
  static getSpinStatus(): string {
    const wheelSpins = parseInt(sessionStorage.getItem('wheelSpins') || '0');
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');
    const today = new Date().toDateString();

    if (wheelSpins > 0) {
      return `${wheelSpins} tours de roue disponibles`;
    }

    if (!lastSpinDate) {
      return 'Tour gratuit disponible';
    }

    if (lastSpinDate !== today) {
      return 'Tour quotidien disponible';
    }

    return "Aucun tour disponible aujourd'hui";
  }

  // ✅ VÉRIFIER LA DISPONIBILITÉ DES TOURS
  checkSpinAvailability(): void {
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');
    const today = new Date().toDateString();
    const wheelSpins = this.getWheelSpinsCount();

    if (!lastSpinDate) {
      // Nouvel utilisateur - première fois
      this.canSpinWheel = true;
      this.hasUsedDailyFreeSpIn = false;
      return;
    }

    // Vérifier si a déjà utilisé le tour quotidien aujourd'hui
    if (lastSpinDate === today) {
      this.hasUsedDailyFreeSpIn = true;
      // Ne peut tourner que s'il a des tours supplémentaires
      this.canSpinWheel = wheelSpins > 0;
    } else {
      // Nouveau jour - peut utiliser le tour gratuit
      this.hasUsedDailyFreeSpIn = false;
      this.canSpinWheel = true;
    }

  }

  async spinWheel() {

    // ✅ VALIDATIONS STRICTES
    if (this.isProcessingClick) {
      return;
    }

    if (!this.canSpinWheel || this.wheelSpinning || this.isSpinning) {
      return;
    }

    // ✅ BLOQUER IMMÉDIATEMENT
    this.isProcessingClick = true;

    // ✅ AFFICHER L'ÉTAT AVANT LE TOUR
    const wheelSpinsBefore = this.getWheelSpinsCount();
    const dreamConsultationsBefore = this.getDreamConsultationsCount();

    try {
      // ✅ ÉTATS DE BLOCAGE
      this.wheelSpinning = true;
      this.isSpinning = true;
      this.canSpinWheel = false;
      this.selectedPrize = null;
      this.cdr.markForCheck(); // ✅ Détecter les changements

      // ✅ UTILISER LE TOUR IMMÉDIATEMENT (CETTE ACTION DIMINUE LE COMPTEUR)
      this.handleSpinUsage();

      // ✅ VÉRIFIER L'ÉTAT APRÈS L'UTILISATION
      const wheelSpinsAfter = this.getWheelSpinsCount();

      // ✅ DÉTERMINER LE PRIX GAGNÉ
      const wonPrize = this.determineWonPrize();

      // ✅ ANIMATION DE ROTATION
      const minSpins = 6;
      const maxSpins = 10;
      const randomSpins = Math.random() * (maxSpins - minSpins) + minSpins;
      const finalRotation = randomSpins * 360;

      // Appliquer la rotation graduelle
      this.currentRotation += finalRotation;

      // ✅ ATTENDRE L'ANIMATION COMPLÈTE
      await this.waitForAnimation(3000);

      // ✅ FINALISER LES ÉTATS D'ANIMATION
      this.wheelSpinning = false;
      this.isSpinning = false;
      this.selectedPrize = wonPrize;
      this.cdr.markForCheck(); // ✅ Détecter les changements CRITIQUES


      // ✅ TRAITER LE PRIX (CETTE ACTION PEUT AJOUTER PLUS DE TOURS/CONSULTATIONS)
      await this.processPrizeWon(wonPrize);

      // ✅ ÉTAT APRÈS LE TRAITEMENT DU PRIX
      const finalWheelSpins = this.getWheelSpinsCount();
      const finalDreamConsultations = this.getDreamConsultationsCount();

      // ✅ METTRE À JOUR LA DISPONIBILITÉ BASÉE SUR L'ÉTAT FINAL
      this.updateSpinAvailabilityAfterPrize(wonPrize);

      // ✅ ÉMETTRE L'ÉVÉNEMENT DU PRIX
      this.onPrizeWon.emit(wonPrize);

      this.cdr.markForCheck(); // ✅ Détecter les changements finaux

    } catch (error) {

      // ✅ RÉINITIALISER LES ÉTATS EN CAS D'ERREUR
      this.wheelSpinning = false;
      this.isSpinning = false;
      this.selectedPrize = null;
      this.cdr.markForCheck(); // ✅ Détecter les changements en erreur

      // Restaurer la disponibilité
      this.checkSpinAvailability();
    } finally {
      // ✅ LIBÉRER LE BLOCAGE APRÈS UN DÉLAI
      setTimeout(() => {
        this.isProcessingClick = false;

        // ✅ VÉRIFICATION FINALE DE DISPONIBILITÉ
        this.checkSpinAvailability();

        this.cdr.markForCheck(); // ✅ Détecter les changements à la libération

      }, 1000);
    }

  }
  private updateSpinAvailabilityAfterPrize(wonPrize: Prize): void {

    const wheelSpins = this.getWheelSpinsCount();
    const today = new Date().toDateString();
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');


    // ✅ LOGIQUE DE DISPONIBILITÉ
    if (wheelSpins > 0) {
      // A des tours supplémentaires disponibles
      this.canSpinWheel = true;
    } else if (!this.hasUsedDailyFreeSpIn) {
      // Vérifier si peut utiliser le tour quotidien (ne devrait pas arriver après en avoir utilisé un)
      this.canSpinWheel = lastSpinDate !== today;
    } else {
      // A déjà utilisé son tour quotidien et n'en a pas d'extra
      this.canSpinWheel = false;
    }

  }
  // ✅ FONCTION AUXILIAIRE POUR ATTENDRE
  private waitForAnimation(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  private handleSpinUsage(): void {
    const wheelSpins = this.getWheelSpinsCount();
    const today = new Date().toDateString();
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');

    if (wheelSpins > 0) {
      // ✅ UTILISER LE TOUR SUPPLÉMENTAIRE DE ROUE
      const newCount = wheelSpins - 1;
      sessionStorage.setItem('wheelSpins', newCount.toString());

      // ✅ METTRE À JOUR IMMÉDIATEMENT LA DISPONIBILITÉ
      this.checkSpinAvailability();
    } else {
      // ✅ UTILISER LE TOUR QUOTIDIEN GRATUIT
      sessionStorage.setItem('lastWheelSpinDate', today);
      sessionStorage.setItem('lastWheelSpinTime', Date.now().toString());
      this.hasUsedDailyFreeSpIn = true;
    }
  }

  // ✅ TRAITER LE PRIX GAGNÉ (AMÉLIORÉ)
  private async processPrizeWon(prize: Prize): Promise<void> {

    switch (prize.id) {
      case '1': // 3 Tours Gratuits de Roue
        this.grantWheelSpins(3);
        break;
      case '2': // 1 Consultation Gratuite de Rêves
        this.grantDreamConsultations(1);
        break;
      case '4': // Essayez Encore
        this.grantRetryChance();
        break;
      default:
    }

    this.savePrizeToHistory(prize);
  }

  // ✅ ACCORDER DES TOURS DE ROUE (SÉPARÉ)
  private grantWheelSpins(count: number): void {
    const currentSpins = this.getWheelSpinsCount();
    sessionStorage.setItem('wheelSpins', (currentSpins + count).toString());
  }

  // ✅ ACCORDER DES CONSULTATIONS DE RÊVES (SÉPARÉ)
  private grantDreamConsultations(count: number): void {
    const currentConsultations = parseInt(
      sessionStorage.getItem('dreamConsultations') || '0'
    );
    sessionStorage.setItem(
      'dreamConsultations',
      (currentConsultations + count).toString()
    );

    // Débloquer le message s'il y en avait un bloqué
    const blockedMessageId = sessionStorage.getItem('blockedMessageId');
    const hasUserPaid =
      sessionStorage.getItem('hasUserPaidForDreams') === 'true';

    if (blockedMessageId && !hasUserPaid) {
      sessionStorage.removeItem('blockedMessageId');
    }
  }

  // ✅ ACCORDER UNE AUTRE OPPORTUNITÉ (NOUVEAU)
  private grantRetryChance(): void {
  }
  shouldShowContinueButton(prize: Prize | null): boolean {
    if (!prize) return false;

    // Prix qui accordent des tours supplémentaires (ne pas fermer le modal)
    const spinsGrantingPrizes = ['1', '4']; // Seulement 3 tours et essayez encore
    return spinsGrantingPrizes.includes(prize.id);
  }
  shouldShowCloseButton(prize: Prize | null): boolean {
    if (!prize) return false;
    return prize.id === '2';
  }
  continueSpinning(): void {
    // ✅ RÉINITIALISER L'ÉTAT POUR PERMETTRE UN AUTRE TOUR
    this.selectedPrize = null;
    this.isProcessingClick = false;
    this.wheelSpinning = false;
    this.isSpinning = false;

    // ✅ VÉRIFIER LA DISPONIBILITÉ MISE À JOUR
    this.checkSpinAvailability();

    this.cdr.markForCheck(); // ✅ Détecter les changements

  }

  // ✅ MÉTHODES AUXILIAIRES MISES À JOUR
  hasFreeSpinsAvailable(): boolean {
    return this.getWheelSpinsCount() > 0;
  }

  getWheelSpinsCount(): number {
    return parseInt(sessionStorage.getItem('wheelSpins') || '0');
  }

  getFreeSpinsCount(): number {
    // Maintenir la compatibilité avec le template
    return this.getWheelSpinsCount();
  }

  getDreamConsultationsCount(): number {
    return parseInt(sessionStorage.getItem('dreamConsultations') || '0');
  }

  getTimeUntilNextSpin(): string {
    if (!this.nextFreeSpinTime) return '';

    const now = new Date().getTime();
    const timeLeft = this.nextFreeSpinTime.getTime() - now;

    if (timeLeft <= 0) return '';

    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }

  // ✅ DÉTERMINER LE PRIX (SANS CHANGEMENTS)
  private determineWonPrize(): Prize {
    const random = Math.random();

    if (random < 0.2) {
      return this.prizes[0]; // 20% - 3 Tours Gratuits
    } else if (random < 0.35) {
      return this.prizes[1]; // 15% - 1 Consultation Premium
    } else {
      return this.prizes[2]; // 65% - Essayez Encore
    }
  }

  // ✅ SAUVEGARDER LE PRIX DANS L'HISTORIQUE
  private savePrizeToHistory(prize: Prize): void {
    const prizeHistory = JSON.parse(
      sessionStorage.getItem('prizeHistory') || '[]'
    );
    prizeHistory.push({
      prize: prize,
      timestamp: new Date().toISOString(),
      claimed: true,
    });
    sessionStorage.setItem('prizeHistory', JSON.stringify(prizeHistory));
  }

  // ✅ TIMER POUR LE COOLDOWN
  startSpinCooldownTimer(): void {
    if (this.spinCooldownTimer) {
      clearInterval(this.spinCooldownTimer);
    }

    if (this.nextFreeSpinTime && !this.canSpinWheel) {
      this.spinCooldownTimer = setInterval(() => {
        const now = new Date().getTime();
        const timeLeft = this.nextFreeSpinTime!.getTime() - now;

        if (timeLeft <= 0) {
          this.canSpinWheel = true;
          this.nextFreeSpinTime = null;
          clearInterval(this.spinCooldownTimer);
          this.cdr.markForCheck(); // ✅ Détecter les changements lorsque le cooldown se termine
        }
      }, 1000);
    }
  }

  // ✅ FERMER LA ROUE
  closeWheel() {
    this.onWheelClosed.emit();
    this.resetWheel();
    this.cdr.markForCheck(); // ✅ Détecter les changements à la fermeture
  }

  // ✅ RÉINITIALISER LA ROUE
  private resetWheel() {
    this.selectedPrize = null;
    this.wheelSpinning = false;
    this.isSpinning = false;
    this.isProcessingClick = false;
    this.cdr.markForCheck(); // ✅ Détecter les changements à la réinitialisation
  }

  // ✅ MÉTHODE POUR FERMER DEPUIS LE TEMPLATE
  onWheelClosedHandler() {
    this.closeWheel();
  }
}
