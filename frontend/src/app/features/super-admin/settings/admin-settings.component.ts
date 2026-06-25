import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';

interface PlatformConfigView {
  googleClientId: string;
  googleClientSecretSet: boolean;
  googleLoginEnabled: boolean;
  metaAppId: string;
  metaAppSecretSet: boolean;
  metaEmbeddedSignupConfigId: string;
  metaLoginEnabled: boolean;
  googleAvailable: boolean;
  metaAvailable: boolean;
  directRegistrationEnabled: boolean;
}

@Component({
  selector: 'wa-admin-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule, CardModule, ButtonModule,
    InputTextModule, ToggleSwitchModule, ToastModule, TagModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 space-y-6 max-w-3xl">
      <p-toast />

      <div>
        <h1 class="text-2xl font-bold text-gray-900">Authentication & Social Login</h1>
        <p class="text-gray-500 text-sm mt-1">
          Configure how tenants sign up and log in. Social buttons only appear for tenants once a
          provider is enabled and its credentials are set here.
        </p>
      </div>

      @if (loading()) {
        <div class="text-gray-500 text-sm">Loading…</div>
      } @else {
        <!-- Google -->
        <div class="bg-white shadow-sm rounded-xl border border-gray-200 p-6 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h2 class="text-lg font-semibold text-gray-900">Google Login</h2>
              <p-tag [value]="cfg.googleAvailable ? 'Live' : 'Off'"
                     [severity]="cfg.googleAvailable ? 'success' : 'secondary'" />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500">Enabled</span>
              <p-toggleswitch [(ngModel)]="cfg.googleLoginEnabled" />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-semibold text-gray-700">Client ID</label>
              <input pInputText [(ngModel)]="cfg.googleClientId"
                     placeholder="xxxxxxxx.apps.googleusercontent.com" class="w-full text-sm" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-semibold text-gray-700">
                Client Secret
                @if (cfg.googleClientSecretSet) { <span class="text-xs text-green-600 font-normal">(set)</span> }
              </label>
              <input pInputText [(ngModel)]="googleClientSecret" type="password"
                     [placeholder]="cfg.googleClientSecretSet ? 'Leave blank to keep current' : 'Enter client secret'"
                     class="w-full text-sm" />
            </div>
          </div>
          <p class="text-xs text-gray-400">
            Redirect URI to register in Google Cloud Console:
            <code class="bg-gray-100 px-1 rounded">{{ apiOrigin }}/auth/oauth/google/callback</code>
          </p>
        </div>

        <!-- Meta -->
        <div class="bg-white shadow-sm rounded-xl border border-gray-200 p-6 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h2 class="text-lg font-semibold text-gray-900">Meta Login & Embedded Signup</h2>
              <p-tag [value]="cfg.metaAvailable ? 'Live' : 'Off'"
                     [severity]="cfg.metaAvailable ? 'success' : 'secondary'" />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500">Enabled</span>
              <p-toggleswitch [(ngModel)]="cfg.metaLoginEnabled" />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-semibold text-gray-700">App ID</label>
              <input pInputText [(ngModel)]="cfg.metaAppId" placeholder="Meta app ID" class="w-full text-sm" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-semibold text-gray-700">
                App Secret
                @if (cfg.metaAppSecretSet) { <span class="text-xs text-green-600 font-normal">(set)</span> }
              </label>
              <input pInputText [(ngModel)]="metaAppSecret" type="password"
                     [placeholder]="cfg.metaAppSecretSet ? 'Leave blank to keep current' : 'Enter app secret'"
                     class="w-full text-sm" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-semibold text-gray-700">Embedded Signup Config ID</label>
              <input pInputText [(ngModel)]="cfg.metaEmbeddedSignupConfigId"
                     placeholder="Login configuration ID (with Coexistence enabled)" class="w-full text-sm" />
            </div>
          </div>
          <p class="text-xs text-gray-400">
            Same Meta app powers social login + WhatsApp Embedded Signup. Redirect URI for Facebook Login:
            <code class="bg-gray-100 px-1 rounded">{{ apiOrigin }}/auth/oauth/meta/callback</code>.
            WABA accounts &amp; system tokens stay in the WABA dashboard.
          </p>
        </div>

        <!-- Number connection options -->
        <div class="bg-white shadow-sm rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">Number Connection</h2>
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-gray-700">Allow direct number registration</p>
              <p class="text-xs text-gray-500 mt-1 max-w-xl">
                When on, tenants can also register a number directly on the platform WABA (no Facebook
                account) in addition to Embedded Signup. When off, only Embedded Signup is offered.
                Note: direct registration does not support coexistence — the number runs on the Cloud API only.
              </p>
            </div>
            <p-toggleswitch [(ngModel)]="cfg.directRegistrationEnabled" />
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <button pButton label="Reload" icon="pi pi-refresh" class="p-button-text" (click)="load()" [disabled]="saving()"></button>
          <button pButton label="Save changes" icon="pi pi-check" severity="success" (click)="save()" [loading]="saving()"></button>
        </div>
      }
    </div>
  `,
})
export class AdminSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  loading = signal(true);
  saving = signal(false);

  cfg: PlatformConfigView = {
    googleClientId: '', googleClientSecretSet: false, googleLoginEnabled: false,
    metaAppId: '', metaAppSecretSet: false, metaEmbeddedSignupConfigId: '', metaLoginEnabled: false,
    googleAvailable: false, metaAvailable: false, directRegistrationEnabled: false,
  };
  // Secrets are write-only inputs (never populated from the server).
  googleClientSecret = '';
  metaAppSecret = '';

  /** Best-effort backend origin for showing the redirect URIs. */
  readonly apiOrigin = this.resolveApiOrigin();

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.googleClientSecret = '';
    this.metaAppSecret = '';
    this.api.get<PlatformConfigView>('/admin/platform-config').subscribe({
      next: (c) => { this.cfg = c; this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Failed to load settings' }); },
    });
  }

  save() {
    this.saving.set(true);
    const body: Record<string, unknown> = {
      googleClientId: this.cfg.googleClientId,
      googleLoginEnabled: this.cfg.googleLoginEnabled,
      metaAppId: this.cfg.metaAppId,
      metaEmbeddedSignupConfigId: this.cfg.metaEmbeddedSignupConfigId,
      metaLoginEnabled: this.cfg.metaLoginEnabled,
      directRegistrationEnabled: this.cfg.directRegistrationEnabled,
    };
    // Only send a secret when the admin actually typed a new one.
    if (this.googleClientSecret.trim()) body['googleClientSecret'] = this.googleClientSecret.trim();
    if (this.metaAppSecret.trim()) body['metaAppSecret'] = this.metaAppSecret.trim();

    this.api.put<PlatformConfigView>('/admin/platform-config', body).subscribe({
      next: (c) => {
        this.cfg = c;
        this.googleClientSecret = '';
        this.metaAppSecret = '';
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: 'Settings saved' });
      },
      error: () => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Failed to save settings' }); },
    });
  }

  private resolveApiOrigin(): string {
    const base = this.api.baseUrl || '';
    if (base.startsWith('http')) {
      try { return new URL(base).origin; } catch { /* fall through */ }
    }
    return window.location.origin;
  }
}
