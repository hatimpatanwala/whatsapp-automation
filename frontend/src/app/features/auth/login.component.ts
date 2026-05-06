import { Component, inject, signal } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'wa-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    MessageModule,
    RouterLink,
  ],
  template: `
    <div class="wa-login-wrapper">
      <div class="wa-login-left">
        <div class="wa-login-left-content">
          <div class="wa-login-brand">
            <i class="pi pi-whatsapp" style="font-size:2.5rem; color: white"></i>
          </div>
          <h1>WA Commerce</h1>
          <p>The complete WhatsApp commerce platform for modern sellers. Manage products, orders, payments, and customer conversations — all in one place.</p>
          <div class="wa-login-features">
            <div class="wa-feature-item">
              <i class="pi pi-shopping-cart"></i>
              <span>Product Catalog & Orders</span>
            </div>
            <div class="wa-feature-item">
              <i class="pi pi-comments"></i>
              <span>WhatsApp Conversations</span>
            </div>
            <div class="wa-feature-item">
              <i class="pi pi-chart-bar"></i>
              <span>Analytics & Campaigns</span>
            </div>
            <div class="wa-feature-item">
              <i class="pi pi-cog"></i>
              <span>Workflow Automation</span>
            </div>
          </div>
        </div>
      </div>

      <div class="wa-login-right">
        <div class="wa-login-card">
          <h2>Welcome back</h2>
          <p class="wa-login-subtitle">Sign in to your account</p>

          @if (errorMessage()) {
            <p-message severity="error" [text]="errorMessage()!" styleClass="w-full mb-4" />
          }

          <form [formGroup]="loginForm" (ngSubmit)="onLogin()" class="wa-login-form">
            <div class="wa-form-field">
              <label for="email">Email address</label>
              <input pInputText id="email" type="email" formControlName="email" placeholder="you&#64;example.com" />
            </div>

            <div class="wa-form-field">
              <label for="password">Password</label>
              <p-password
                formControlName="password"
                placeholder="Enter password"
                [feedback]="false"
                [toggleMask]="true"
                styleClass="w-full"
                inputStyleClass="w-full"
              />
            </div>

            <button
              pButton
              type="submit"
              label="Sign in"
              icon="pi pi-sign-in"
              iconPos="right"
              [loading]="loading()"
              [disabled]="loginForm.invalid || loading()"
              class="w-full wa-login-btn"
              severity="success"
            ></button>
          </form>

          <p class="wa-signup-link">
            Don't have an account? <a routerLink="/auth/register">Create one</a>
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
      gap: 1.15rem;
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
      margin-top: 1.5rem;
    }

    @media (max-width: 768px) {
      .wa-login-wrapper { flex-direction: column; }
      .wa-login-left { display: none; }
      .wa-login-right { padding: 1.5rem; }
      .wa-login-card { padding: 2rem; }
    }
  `],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly year = new Date().getFullYear();
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  loginForm = this.fb.group({
    email: ['admin@whatsapp-commerce.com', [Validators.required, Validators.email]],
    password: ['admin123456', Validators.required],
  });

  onLogin() {
    if (this.loginForm.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.value;

    this.authService.login({ email: email!, password: password! }).subscribe({
      next: (res) => {
        if (res.type === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          const returnUrl = this.route.snapshot.queryParams['returnUrl'] ?? '/dashboard';
          this.router.navigateByUrl(returnUrl);
        }
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message ?? 'Invalid credentials. Please try again.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
