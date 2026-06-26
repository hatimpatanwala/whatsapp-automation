import { Component, EventEmitter, Input, Output, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { EmbeddedSignupService, EmbeddedSignupConfig, EmbeddedSignupResult } from '../core/services/embedded-signup.service';

/**
 * Reusable "Connect WhatsApp" button that runs Meta's Embedded Signup with
 * Coexistence. Used in onboarding and in tenant Settings → WhatsApp.
 *
 * Flow:
 *  - Click → Meta popup → backend processes the callback.
 *  - If the number qualifies for coexistence, a consent step is shown so the
 *    user explicitly enables Cloud API alongside their WhatsApp Business App.
 *  - Emits (connected) once finished (after consent, or immediately for
 *    non-coexistence numbers).
 *
 * The number is registered under the platform's WABA (platform-billed).
 */
@Component({
  selector: 'wa-embedded-signup-button',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, MessageModule],
  template: `
    <div class="space-y-3">
      <!-- Connect UI (hidden once connected) -->
      @if (!result()?.success) {
        <div class="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
          <i class="pi pi-check-circle text-green-600 mt-0.5" style="font-size:0.85rem"></i>
          <p class="text-xs text-green-800 leading-relaxed">
            <span class="font-semibold">Coexistence enabled:</span> keep using the WhatsApp Business App
            on this number while it also works through our platform. Works for new and existing numbers —
            and if it's a brand-new number, it stays <span class="font-semibold">coexistence-ready</span>,
            so you can install the WhatsApp Business App on it later without any errors.
          </p>
        </div>

        <button
          pButton
          [label]="loading() ? 'Connecting…' : label"
          icon="pi pi-whatsapp"
          severity="success"
          class="w-full"
          [loading]="loading()"
          (click)="start()"
        ></button>

        @if (error()) {
          <p class="text-xs text-red-600">
            <i class="pi pi-exclamation-circle mr-1"></i>{{ error() }}
          </p>
        }

        <p class="flex items-center gap-2 text-xs text-blue-600">
          <i class="pi pi-shield" style="font-size:0.7rem"></i>
          <span>Secure OAuth — we never see your Facebook password.</span>
        </p>
      }

      <!-- Connected -->
      @if (result()?.success) {
        <p-message severity="success" styleClass="w-full">
          <div>
            <p class="font-semibold text-sm">{{ result()!.message }}</p>
            @if (result()!.phoneNumber) {
              <p class="text-xs mt-1">Phone: {{ result()!.phoneNumber }}</p>
            }
            @if (result()!.isCoexistence && coexistenceActivated()) {
              <p class="text-xs mt-1 text-green-700">
                <i class="pi pi-info-circle mr-1"></i>
                Coexistence active — your WhatsApp Business App keeps working alongside our platform.
              </p>
            }
          </div>
        </p-message>
      }

      <!-- Coexistence consent step -->
      @if (needsCoexistenceConsent()) {
        <div class="border border-amber-200 bg-amber-50/60 rounded-xl p-4 space-y-3">
          <div class="flex items-start gap-2">
            <i class="pi pi-link text-amber-600 mt-0.5" style="font-size:0.9rem"></i>
            <div>
              <p class="text-sm font-semibold text-amber-900">Finish coexistence setup</p>
              <p class="text-xs text-amber-800 mt-1 leading-relaxed">
                Keep using your WhatsApp Business App on this number while our platform also sends and
                receives messages through the Cloud API — your chats and contacts stay on your phone.
                You can fully migrate to the Cloud API anytime later.
              </p>
            </div>
          </div>

          @if (showPin) {
            <input pInputText [(ngModel)]="pin" placeholder="Two-step verification PIN (6 digits)"
              maxlength="6" inputmode="numeric" class="w-full text-sm" />
          } @else {
            <button type="button"
              class="text-xs text-amber-700 underline bg-transparent border-0 p-0 cursor-pointer"
              (click)="showPin = true">My number has a two-step verification PIN</button>
          }

          @if (coexistenceError()) {
            <p class="text-xs text-red-600"><i class="pi pi-exclamation-circle mr-1"></i>{{ coexistenceError() }}</p>
          }

          <div class="flex items-center gap-2">
            <button pButton label="Enable Coexistence" icon="pi pi-check" severity="success" class="p-button-sm"
              [loading]="enabling()" (click)="enableCoexistence()"></button>
            <button pButton label="Skip for now" class="p-button-sm p-button-text p-button-secondary"
              [disabled]="enabling()" (click)="skipCoexistence()"></button>
          </div>
        </div>
      }
    </div>
  `,
})
export class EmbeddedSignupButtonComponent {
  @Input() label = 'Connect WhatsApp';
  @Output() connected = new EventEmitter<EmbeddedSignupResult>();

  private readonly embeddedSignupSvc = inject(EmbeddedSignupService);
  private readonly messageService = inject(MessageService);
  private readonly platformId = inject(PLATFORM_ID);

  loading = signal(false);
  error = signal<string | null>(null);
  result = signal<EmbeddedSignupResult | null>(null);

  // Coexistence consent state
  enabling = signal(false);
  coexistenceError = signal<string | null>(null);
  coexistenceActivated = signal(false);
  showPin = false;
  pin = '';

  private fbSdkLoaded = false;
  private config: EmbeddedSignupConfig | null = null;

  /** True when the connected number qualifies for coexistence and isn't activated yet. */
  needsCoexistenceConsent(): boolean {
    const r = this.result();
    return !!(r?.success && r.isCoexistence && r.coexistenceSessionId && !this.coexistenceActivated());
  }

  /** Public entry point — can also be triggered by a host's own button. */
  start() {
    this.error.set(null);
    this.result.set(null);
    this.coexistenceError.set(null);
    this.coexistenceActivated.set(false);
    this.showPin = false;
    this.pin = '';
    this.loading.set(true);

    this.embeddedSignupSvc.getConfig().subscribe({
      next: (config) => {
        this.config = config;
        this.loadFacebookSdk(config);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Failed to load signup configuration');
      },
    });
  }

  /** Register Cloud API alongside the WhatsApp Business App. */
  enableCoexistence() {
    const r = this.result();
    if (!r?.coexistenceSessionId) return;
    this.enabling.set(true);
    this.coexistenceError.set(null);

    this.embeddedSignupSvc.enableCoexistence(r.coexistenceSessionId, this.pin.trim() || undefined).subscribe({
      next: () => {
        this.enabling.set(false);
        this.coexistenceActivated.set(true);
        this.messageService.add({ severity: 'success', summary: 'Coexistence enabled' });
        this.connected.emit(r);
      },
      error: (err) => {
        this.enabling.set(false);
        this.coexistenceError.set(err?.error?.message || 'Could not enable coexistence. You can retry from Settings.');
      },
    });
  }

  /** Continue without explicitly enabling coexistence now. */
  skipCoexistence() {
    const r = this.result();
    this.coexistenceActivated.set(true); // hide the consent panel
    if (r) this.connected.emit(r);
  }

  private loadFacebookSdk(config: EmbeddedSignupConfig) {
    if (!isPlatformBrowser(this.platformId)) return;
    const w = window as any;

    if (this.fbSdkLoaded && w.FB) {
      this.launchFbLogin(config);
      return;
    }

    w.fbAsyncInit = () => {
      w.FB.init({ appId: config.appId, cookie: true, xfbml: true, version: config.version });
      this.fbSdkLoaded = true;
      this.launchFbLogin(config);
    };

    if (document.getElementById('facebook-jssdk')) {
      if (w.FB) {
        this.fbSdkLoaded = true;
        this.launchFbLogin(config);
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  private launchFbLogin(config: EmbeddedSignupConfig) {
    const w = window as any;
    if (!w.FB) {
      this.loading.set(false);
      this.error.set('Facebook SDK not loaded. Please refresh and try again.');
      return;
    }

    w.FB.login(
      (response: any) => {
        if (response.authResponse) {
          const code = response.authResponse.code;
          const sessionInfo: Record<string, any> = {};
          if (response.authResponse.signedRequest) {
            try {
              const payload = response.authResponse.signedRequest.split('.')[1];
              Object.assign(sessionInfo, JSON.parse(atob(payload)));
            } catch {
              // Non-fatal
            }
          }
          this.processCallback(code, sessionInfo);
        } else {
          this.loading.set(false);
          this.error.set('Facebook login was cancelled or failed.');
        }
      },
      {
        config_id: config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: config.loginParams.extras,
      },
    );

    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'WA_EMBEDDED_SIGNUP' && data.data && this.config) {
          (this.config as any)._sessionInfo = data.data;
        }
      } catch {
        // Ignore non-JSON messages
      }
    };
    window.addEventListener('message', messageHandler);
    setTimeout(() => window.removeEventListener('message', messageHandler), 300000);
  }

  private processCallback(code: string, sessionInfo: Record<string, any>) {
    const extraInfo = (this.config as any)?._sessionInfo;
    if (extraInfo) Object.assign(sessionInfo, extraInfo);

    this.embeddedSignupSvc.processCallback({
      code,
      phoneNumberId: sessionInfo['phone_number_id'],
      wabaId: sessionInfo['waba_id'],
      sessionInfo,
    }).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.result.set(result);
        if (result.success) {
          this.messageService.add({ severity: 'success', summary: 'Connected!', detail: result.message });
          // Coexistence numbers get an explicit consent step before we signal done.
          if (!(result.isCoexistence && result.coexistenceSessionId)) {
            this.connected.emit(result);
          }
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Embedded signup failed. Please try again.');
      },
    });
  }
}
