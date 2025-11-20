import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'accueil',
    pathMatch: 'full',
  },
  {
    path: 'accueil',
    loadComponent: () =>
      import('./components/bienvenida/bienvenida.component').then(
        (m) => m.BienvenidaComponent
      ),
  },
  {
    path: 'interpretation-reves',
    loadComponent: () =>
      import(
        './components/significado-suenos/significado-suenos.component'
      ).then((m) => m.SignificadoSuenosComponent),
  },
  {
    path: 'information-zodiaque',
    loadComponent: () =>
      import(
        './components/informacion-zodiaco/informacion-zodiaco.component'
      ).then((m) => m.InformacionZodiacoComponent),
  },
  {
    path: 'lecture-numerologie',
    loadComponent: () =>
      import(
        './components/lectura-numerologia/lectura-numerologia.component'
      ).then((m) => m.LecturaNumerologiaComponent),
  },
  {
    path: 'carte-vocationnelle',
    loadComponent: () =>
      import('./components/mapa-vocacional/mapa-vocacional.component').then(
        (m) => m.MapaVocacionalComponent
      ),
  },
  {
    path: 'animal-interieur',
    loadComponent: () =>
      import('./components/animal-interior/animal-interior.component').then(
        (m) => m.AnimalInteriorComponent
      ),
  },
  {
    path: 'tableau-naissance',
    loadComponent: () =>
      import('./components/tabla-nacimiento/tabla-nacimiento.component').then(
        (m) => m.TablaNacimientoComponent
      ),
  },
  {
    path: 'horoscope',
    loadComponent: () =>
      import('./components/zodiaco-chino/zodiaco-chino.component').then(
        (m) => m.ZodiacoChinoComponent
      ),
  },
  {
    path: 'calculateur-amour',
    loadComponent: () =>
      import('./components/calculadora-amor/calculadora-amor.component').then(
        (m) => m.CalculadoraAmorComponent
      ),
  },
  {
    path: 'particules',
    loadComponent: () =>
      import('./shared/particles/particles.component').then(
        (m) => m.ParticlesComponent
      ),
  },
  {
    path: 'termes-conditions-ecos',
    loadComponent: () =>
      import(
        './components/terminos-condiciones/terminos-condiciones.component'
      ).then((m) => m.TerminosCondicionesEcos),
  },
  {
    path: 'politiques-cookies',
    loadComponent: () =>
      import('./components/cookies/cookies.component').then(
        (m) => m.CookiesComponent
      ),
  },
];
