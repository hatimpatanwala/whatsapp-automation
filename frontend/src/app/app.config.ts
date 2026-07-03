import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { tenantInterceptor } from './core/interceptors/tenant.interceptor';
import { apiResponseInterceptor } from './core/interceptors/api-response.interceptor';
import { retryInterceptor } from './core/interceptors/retry.interceptor';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Tally-style keyboard navigation (Phase 3).
    provideAppInitializer(() => inject(KeyboardShortcutsService).init()),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([retryInterceptor, authInterceptor, tenantInterceptor, apiResponseInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          prefix: 'p',
          darkModeSelector: '.dark-mode',
          cssLayer: {
            name: 'primeng',
            order: 'tailwind-base, primeng, tailwind-utilities',
          },
        },
      },
    }),
  ],
};
