import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { OnboardingService, RegisterNumberResult } from '../core/services/onboarding.service';

/**
 * Direct (platform-hosted) number registration — no Facebook/Meta account needed.
 * The platform registers the number under its own WABA via the Cloud API and
 * verifies it with an OTP sent to the number.
 *
 * Note: this path does NOT provide coexistence — the number is hosted on the
 * Cloud API, so the WhatsApp Business App can't run on it simultaneously. Use
 * Embedded Signup if the customer wants to keep their Business App.
 *
 * Only shown to tenants when a super-admin enables direct registration.
 */
@Component({
  selector: 'wa-direct-number-registration',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, MessageModule],
  template: `
    <div class="space-y-3">
      @if (phase() === 'input') {
        <p class="text-xs text-gray-500">
          Enter your number with country code (e.g. +91XXXXXXXXXX). We'll register it on our
          platform and text you a verification code. No Facebook account required.
        </p>
        <div class="flex gap-2">
          <input pInputText [(ngModel)]="phone" placeholder="+91XXXXXXXXXX" class="flex-1 text-sm" />
          <button pButton label="Register" icon="pi pi-check" severity="success" class="p-button-sm"
            [loading]="loading()" [disabled]="!phone.trim()" (click)="register()"></button>
        </div>
      }

      <!-- Non-fatal status messages from registration -->
      @if (result(); as r) {
        @if (r.status === 'already_business') {
          <p-message severity="warn" styleClass="w-full">
            <div>
              <p class="font-semibold text-sm">WhatsApp already active on this number</p>
              <p class="text-xs mt-1">{{ r.message }}</p>
            </div>
          </p-message>
          @if (r.instructions?.length) {
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p class="text-xs font-semibold text-amber-900 mb-1"><i class="pi pi-info-circle mr-1"></i>How to fix:</p>
              <ol class="text-xs text-amber-800 space-y-1 list-decimal pl-4">
                @for (inst of r.instructions!; track inst) { <li>{{ inst }}</li> }
              </ol>
            </div>
          }
        }
        @if (r.status === 'already_occupied') {
          <p-message severity="error" styleClass="w-full">
            <div>
              <p class="font-semibold text-sm">Number unavailable</p>
              <p class="text-xs mt-1">{{ r.message }}</p>
            </div>
          </p-message>
        }
      }

      @if (phase() === 'verify') {
        <div class="border-t border-gray-100 pt-3 space-y-2">
          <p class="text-xs text-gray-600">{{ result()?.message || 'Enter the 6-digit code sent to your number.' }}</p>
          <div class="flex gap-2">
            <input pInputText [(ngModel)]="code" placeholder="123456" maxlength="6" inputmode="numeric"
              class="flex-1 text-sm" style="letter-spacing:0.25em;text-align:center" />
            <button pButton label="Verify" icon="pi pi-check" severity="success" class="p-button-sm"
              [loading]="loading()" [disabled]="code.length < 6" (click)="verify()"></button>
          </div>
          <div class="flex items-center gap-3 text-xs">
            <span class="text-gray-400">Didn't get it?</span>
            <button class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0 text-xs"
              [disabled]="loading()" (click)="resend('sms')">Resend SMS</button>
            <span class="text-gray-300">|</span>
            <button class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0 text-xs"
              [disabled]="loading()" (click)="resend('voice')">Voice call</button>
          </div>
        </div>
      }

      @if (error()) {
        <p class="text-xs text-red-600"><i class="pi pi-exclamation-circle mr-1"></i>{{ error() }}</p>
      }
    </div>
  `,
})
export class DirectNumberRegistrationComponent {
  @Output() connected = new EventEmitter<void>();

  private readonly onboardingService = inject(OnboardingService);
  private readonly messageService = inject(MessageService);

  phase = signal<'input' | 'verify'>('input');
  loading = signal(false);
  error = signal<string | null>(null);
  result = signal<RegisterNumberResult | null>(null);

  phone = '';
  code = '';
  private phoneId: string | null = null;

  register() {
    if (!this.phone.trim()) return;
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);

    this.onboardingService.registerNumber(this.phone.trim()).subscribe({
      next: (r) => {
        this.loading.set(false);
        this.result.set(r);
        this.phoneId = r.phoneId || null;
        if (r.status === 'registered') {
          this.messageService.add({ severity: 'success', summary: 'Number registered', detail: r.message });
          this.connected.emit();
        } else if (r.status === 'needs_verification') {
          this.phase.set('verify'); // OTP already sent by the backend
        }
        // already_business / already_occupied → shown as status messages, stay on input
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not register the number. Please try again.');
      },
    });
  }

  verify() {
    if (!this.phoneId || this.code.length < 6) return;
    this.loading.set(true);
    this.error.set(null);

    this.onboardingService.verifyNumber(this.phoneId, this.code.trim()).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.verified) {
          this.messageService.add({ severity: 'success', summary: 'Number verified', detail: res.message });
          this.connected.emit();
        } else {
          this.error.set(res.message || 'Verification failed. Check the code and try again.');
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Verification failed. Please try again.');
      },
    });
  }

  resend(method: 'sms' | 'voice') {
    if (!this.phoneId) return;
    this.loading.set(true);
    this.error.set(null);
    this.onboardingService.requestVerificationCode(this.phoneId, method).subscribe({
      next: (r) => {
        this.loading.set(false);
        this.messageService.add({ severity: 'info', summary: 'Code sent', detail: r.message });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not resend the code.');
      },
    });
  }
}
