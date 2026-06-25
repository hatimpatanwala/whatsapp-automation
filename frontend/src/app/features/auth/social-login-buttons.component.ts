import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

interface AvailableProviders { google: boolean; meta: boolean; }

/**
 * "Continue with Google / Meta" buttons. Each provider only renders when the
 * super-admin has enabled + configured it (GET /auth/oauth/providers). Social
 * login is a full-page browser navigation to the backend OAuth endpoint (not an
 * XHR), so the provider can redirect and the session cookie is set on return.
 */
@Component({
  selector: 'wa-social-login-buttons',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (providers().google || providers().meta) {
      <div class="wa-social-divider"><span>or continue with</span></div>
      <div class="wa-social-buttons">
        @if (providers().google) {
          <button type="button" class="wa-social-btn" (click)="go('google')" [disabled]="busy">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.5 26.9 35.5 24 35.5c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.5l6.5 5.5C40.9 36.6 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"/>
            </svg>
            <span>Google</span>
          </button>
        }
        @if (providers().meta) {
          <button type="button" class="wa-social-btn" (click)="go('meta')" [disabled]="busy">
            <svg width="18" height="18" viewBox="0 0 36 36" aria-hidden="true">
              <path fill="#1877F2" d="M36 18C36 8.1 27.9 0 18 0S0 8.1 0 18c0 9 6.6 16.4 15.2 17.8V23.2h-4.6V18h4.6v-4c0-4.5 2.7-7 6.8-7 2 0 4 .4 4 .4v4.4h-2.3c-2.2 0-2.9 1.4-2.9 2.8V18h5l-.8 5.2h-4.2v12.6C29.4 34.4 36 27 36 18z"/>
            </svg>
            <span>Meta</span>
          </button>
        }
      </div>
    }
  `,
  styles: [`
    .wa-social-divider {
      display: flex; align-items: center; text-align: center;
      color: #9ca3af; font-size: .8rem; margin: 1.25rem 0 1rem;
    }
    .wa-social-divider::before, .wa-social-divider::after {
      content: ''; flex: 1; border-bottom: 1px solid #e5e7eb;
    }
    .wa-social-divider span { padding: 0 .75rem; }
    .wa-social-buttons { display: flex; gap: .75rem; }
    .wa-social-btn {
      flex: 1; display: inline-flex; align-items: center; justify-content: center;
      gap: .5rem; padding: .65rem 1rem; border: 1px solid #d1d5db; border-radius: 8px;
      background: #fff; color: #374151; font-weight: 600; font-size: .9rem; cursor: pointer;
      transition: background .15s, border-color .15s;
    }
    .wa-social-btn:hover:not(:disabled) { background: #f9fafb; border-color: #9ca3af; }
    .wa-social-btn:disabled { opacity: .6; cursor: not-allowed; }
  `],
})
export class SocialLoginButtonsComponent implements OnInit {
  @Input() busy = false;

  private readonly api = inject(ApiService);
  readonly providers = signal<AvailableProviders>({ google: false, meta: false });

  ngOnInit() {
    this.api.get<AvailableProviders>('/auth/oauth/providers').subscribe({
      next: (p) => this.providers.set({ google: !!p?.google, meta: !!p?.meta }),
      error: () => this.providers.set({ google: false, meta: false }),
    });
  }

  go(provider: 'google' | 'meta') {
    // environment.apiUrl is e.g. '/api' (proxied) or a full backend URL.
    window.location.href = `${environment.apiUrl}/auth/oauth/${provider}`;
  }
}
