import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/services/auth.service';
import { SocialLoginButtonsComponent } from './social-login-buttons.component';

@Component({
  selector: 'wa-register',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    MessageModule,
    SocialLoginButtonsComponent,
  ],
  template: `
    <div class="wa-login-wrapper">
      <div class="wa-login-left">
        <div class="wa-login-left-content">
          <div class="wa-login-brand">
            <i class="pi pi-whatsapp" style="font-size:2.5rem; color: white"></i>
          </div>
          <h1>WA Commerce</h1>
          <p>Start selling on WhatsApp in minutes. Create your store, connect your number, and start receiving orders today.</p>
          <div class="wa-login-features">
            <div class="wa-feature-item">
              <i class="pi pi-check-circle"></i>
              <span>100 free conversations</span>
            </div>
            <div class="wa-feature-item">
              <i class="pi pi-clock"></i>
              <span>Setup in 5 minutes</span>
            </div>
            <div class="wa-feature-item">
              <i class="pi pi-credit-card"></i>
              <span>No credit card required</span>
            </div>
            <div class="wa-feature-item">
              <i class="pi pi-shield"></i>
              <span>Free trial included</span>
            </div>
          </div>
        </div>
      </div>

      <div class="wa-login-right">
        <div class="wa-login-card">
          @if (!otpSent()) {
            <!-- Step 1: Signup Form -->
            <h2>Create your account</h2>
            <p class="wa-login-subtitle">Start your free trial with 100 conversations</p>

            @if (errorMessage()) {
              <p-message severity="error" [text]="errorMessage()!" styleClass="w-full mb-4" />
            }

            <form [formGroup]="signupForm" (ngSubmit)="sendOtp()" class="wa-login-form">
              <div class="wa-form-field">
                <label for="name">Your name</label>
                <input pInputText id="name" type="text" formControlName="name" placeholder="John Doe" />
              </div>

              <div class="wa-form-field">
                <label for="businessName">Business name <span class="optional">(optional)</span></label>
                <input pInputText id="businessName" type="text" formControlName="businessName" placeholder="My Awesome Store" />
              </div>

              <div class="wa-form-field">
                <label for="email">Email address</label>
                <input pInputText id="email" type="email" formControlName="email" placeholder="you&#64;example.com" />
              </div>

              <div class="wa-form-field">
                <label for="password">Password</label>
                <p-password
                  formControlName="password"
                  placeholder="Min. 6 characters"
                  [toggleMask]="true"
                  styleClass="w-full"
                  inputStyleClass="w-full"
                />
              </div>

              <button
                pButton
                type="submit"
                label="Send Verification Code"
                icon="pi pi-envelope"
                iconPos="right"
                [loading]="loading()"
                [disabled]="signupForm.invalid || loading()"
                class="w-full wa-login-btn"
                severity="success"
              ></button>
            </form>

            <wa-social-login-buttons [busy]="loading()" />
          } @else {
            <!-- Step 2: Email OTP Verification -->
            <div class="text-center mb-4">
              <div class="wa-otp-icon">
                <i class="pi pi-envelope" style="font-size:1.5rem; color: #059669"></i>
              </div>
              <h2>Verify your email</h2>
              <p class="wa-login-subtitle">
                We sent a 6-digit code to<br/>
                <strong>{{ signupForm.value.email }}</strong>
              </p>
            </div>

            @if (errorMessage()) {
              <p-message severity="error" [text]="errorMessage()!" styleClass="w-full mb-4" />
            }

            @if (successMessage()) {
              <p-message severity="success" [text]="successMessage()!" styleClass="w-full mb-4" />
            }

            <div class="wa-login-form">
              <div class="wa-form-field">
                <label for="otp">Verification Code</label>
                <input
                  pInputText
                  id="otp"
                  type="text"
                  [(ngModel)]="otpCode"
                  placeholder="123456"
                  maxlength="6"
                  class="wa-otp-input"
                />
              </div>

              <button
                pButton
                label="Create Account"
                icon="pi pi-user-plus"
                iconPos="right"
                [loading]="loading()"
                [disabled]="otpCode.length < 6 || loading()"
                class="w-full wa-login-btn"
                severity="success"
                (click)="verifyOtp()"
              ></button>

              <div class="wa-resend-row">
                <span class="text-gray-400">Didn't receive it?</span>
                <button
                  class="wa-resend-btn"
                  [disabled]="loading()"
                  (click)="resendOtp()"
                >Resend Code</button>
                <span class="text-gray-300">|</span>
                <button
                  class="wa-resend-btn"
                  (click)="goBack()"
                >Change Email</button>
              </div>
            </div>
          }

          <p class="wa-signup-link">
            Already have an account? <a routerLink="/auth/login">Sign in</a>
          </p>

          <p class="wa-login-footer">&copy; {{ year }} WA Commerce</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100dvh; }

    .wa-login-wrapper {
      display: flex;
      height: 100%;
      background: #f8fafc;
    }

    .wa-login-left {
      flex: 1;
      background: linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      color: white;
    }

    .wa-login-left-content {
      max-width: 480px;
    }

    .wa-login-brand {
      width: 64px;
      height: 64px;
      background: rgba(255,255,255,0.15);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5rem;
      backdrop-filter: blur(10px);
    }

    .wa-login-left h1 {
      font-size: 2.25rem;
      font-weight: 700;
      margin-bottom: 1rem;
      letter-spacing: -0.025em;
    }

    .wa-login-left p {
      font-size: 1.05rem;
      line-height: 1.7;
      opacity: 0.85;
      margin-bottom: 2.5rem;
    }

    .wa-login-features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .wa-feature-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: rgba(255,255,255,0.1);
      border-radius: 10px;
      font-size: 0.875rem;
      backdrop-filter: blur(5px);
    }

    .wa-feature-item i { font-size: 1.1rem; }

    .wa-login-right {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      overflow-y: auto;
    }

    .wa-login-card {
      width: 100%;
      max-width: 420px;
      background: white;
      border-radius: 16px;
      padding: 2.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.04);
    }

    .wa-login-card h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #111827;
      margin: 0 0 0.25rem;
    }

    .wa-login-subtitle {
      color: #6b7280;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }

    .wa-login-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .wa-form-field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .wa-form-field label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #374151;
    }

    .wa-form-field .optional {
      font-weight: 400;
      color: #9ca3af;
    }

    .wa-otp-icon {
      width: 56px;
      height: 56px;
      background: #ecfdf5;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem;
    }

    .wa-otp-input {
      font-size: 1.4rem !important;
      letter-spacing: 0.4em;
      text-align: center;
    }

    .wa-resend-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      font-size: 0.8rem;
    }

    .wa-resend-btn {
      color: #059669;
      font-weight: 600;
      font-size: 0.8rem;
      border: 0;
      background: transparent;
      cursor: pointer;
      padding: 0;
    }

    .wa-resend-btn:hover { text-decoration: underline; }
    .wa-resend-btn:disabled { opacity: 0.5; cursor: default; }

    .wa-login-btn { margin-top: 0.5rem; }

    .wa-signup-link {
      text-align: center;
      font-size: 0.85rem;
      color: #6b7280;
      margin-top: 1.25rem;
    }

    .wa-signup-link a {
      color: #059669;
      font-weight: 600;
      text-decoration: none;
    }

    .wa-signup-link a:hover {
      text-decoration: underline;
    }

    .wa-login-footer {
      text-align: center;
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 1rem;
    }

    @media (max-width: 768px) {
      .wa-login-wrapper { flex-direction: column; }
      .wa-login-left { display: none; }
      .wa-login-right { padding: 1.5rem; }
      .wa-login-card { padding: 2rem; }
    }
  `],
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly year = new Date().getFullYear();
  loading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  otpSent = signal(false);
  otpCode = '';

  signupForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    businessName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  sendOtp() {
    if (this.signupForm.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    const { name, businessName, email, password } = this.signupForm.value;

    this.authService.sendEmailOtp({
      name: name!,
      email: email!,
      password: password!,
      businessName: businessName || undefined,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.error) {
          this.errorMessage.set(res.message ?? 'Failed to send verification code.');
          return;
        }
        this.otpSent.set(true);
        this.successMessage.set(null);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Failed to send verification code. Please try again.');
      },
    });
  }

  verifyOtp() {
    if (this.otpCode.length < 6) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    this.authService.verifyEmailOtp({
      email: this.signupForm.value.email!,
      code: this.otpCode,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.error) {
          this.errorMessage.set(res.message ?? 'Verification failed.');
          return;
        }
        this.router.navigate(['/onboarding']);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Invalid verification code. Please try again.');
      },
    });
  }

  resendOtp() {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.sendOtp();
    this.successMessage.set('Verification code resent.');
  }

  goBack() {
    this.otpSent.set(false);
    this.otpCode = '';
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }
}
