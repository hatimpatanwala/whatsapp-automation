import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { MessageModule } from 'primeng/message';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { StepperModule } from 'primeng/stepper';
import { DividerModule } from 'primeng/divider';
import { MessageService } from 'primeng/api';
import {
  OnboardingService,
  StartOnboardingResult,
  MigrationGuide,
  OnboardingState,
  CategoryInfo,
  FeatureInfo,
  PersonalizeResult,
} from '../../core/services/onboarding.service';
import { EmbeddedSignupResult } from '../../core/services/embedded-signup.service';
import { EmbeddedSignupButtonComponent } from '../../shared/embedded-signup-button.component';
import { DirectNumberRegistrationComponent } from '../../shared/direct-number-registration.component';

@Component({
  selector: 'wa-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    MessageModule,
    ToastModule,
    TagModule,
    ProgressSpinnerModule,
    StepperModule,
    DividerModule,
    EmbeddedSignupButtonComponent,
    DirectNumberRegistrationComponent,
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <div class="min-h-screen bg-gradient-to-br wa-from-gray-50 wa-to-gray-100 flex items-start justify-center p-4 pt-8">
      <div class="w-full max-w-3xl">

        <!-- Header -->
        <div class="text-center mb-8">
          <div class="flex items-center justify-center w-16 h-16 bg-primary-500 rounded-2xl mx-auto mb-4 shadow-lg">
            <i class="pi pi-whatsapp text-white" style="font-size:2rem"></i>
          </div>
          <h1 class="text-3xl font-bold text-gray-900">Welcome to WA Commerce</h1>
          <p class="text-gray-500 mt-2">Let's get your WhatsApp store set up in a few simple steps</p>
        </div>

        <!-- Progress indicators -->
        <div class="flex items-center justify-center gap-2 mb-8">
          @for (s of stepLabels; track s.key; let idx = $index) {
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                [class.bg-primary-500]="idx <= activeStep()"
                [class.text-white]="idx <= activeStep()"
                [class.bg-gray-200]="idx > activeStep()"
                [class.text-gray-500]="idx > activeStep()"
              >
                @if (idx < activeStep()) {
                  <i class="pi pi-check" style="font-size:0.7rem"></i>
                } @else {
                  {{ idx + 1 }}
                }
              </div>
              <span class="text-xs font-medium hidden sm:inline"
                [class.text-primary-600]="idx <= activeStep()"
                [class.text-gray-400]="idx > activeStep()"
              >{{ s.label }}</span>
              @if (idx < stepLabels.length - 1) {
                <div class="w-8 h-px mx-1"
                  [class.bg-primary-400]="idx < activeStep()"
                  [class.bg-gray-200]="idx >= activeStep()"
                ></div>
              }
            </div>
          }
        </div>

        <!-- Card -->
        <div class="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          <!-- ===== STEP 1: WhatsApp Number Registration (Session-based) ===== -->
          @if (activeStep() === 0) {
            <div class="p-8">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <i class="pi pi-whatsapp text-green-600" style="font-size:1.1rem"></i>
                </div>
                <div>
                  <h2 class="text-xl font-bold text-gray-900">Connect Your WhatsApp Number</h2>
                  <p class="text-sm text-gray-500">Enter the phone number you want to use for your business</p>
                </div>
              </div>

              <div class="space-y-4">
                <!-- WhatsApp connection via Meta Embedded Signup + Coexistence (only path) -->
                @if (!embeddedSignupResult()?.success) {
                 @if (!optionsLoaded()) {
                   <div class="text-sm text-gray-400 py-4"><i class="pi pi-spin pi-spinner mr-2"></i>Loading connection options…</div>
                 } @else {
                  @if (embeddedSignupEnabled()) {
                    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
                      <div class="flex items-start gap-3 mb-4">
                        <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                          <i class="pi pi-whatsapp text-white" style="font-size:1rem"></i>
                        </div>
                        <div>
                          <p class="text-sm font-bold text-blue-900">Connect WhatsApp with Meta</p>
                          <p class="text-xs text-blue-700 mt-1">
                            Authorize through Meta's secure popup, then pick or create your WhatsApp
                            Business Account and number. Works for new and existing numbers.
                          </p>
                        </div>
                      </div>

                      <wa-embedded-signup-button (connected)="onEmbeddedConnected($event)" />
                    </div>
                  }

                  @if (directRegistrationEnabled()) {
                    @if (embeddedSignupEnabled()) {
                      <div class="flex items-center gap-3 my-3">
                        <div class="flex-1 h-px bg-gray-200"></div>
                        <span class="text-xs text-gray-400 font-medium">OR</span>
                        <div class="flex-1 h-px bg-gray-200"></div>
                      </div>
                    }
                    <div class="bg-white border border-gray-200 rounded-xl p-5">
                      <p class="text-sm font-bold text-gray-900 mb-1">Register without a Facebook account</p>
                      <p class="text-xs text-gray-500 mb-3">
                        We'll register your number on our platform and verify it by SMS. Note: this doesn't
                        support coexistence — the number runs on the Cloud API only.
                      </p>
                      <wa-direct-number-registration (connected)="onDirectConnected()" />
                    </div>
                  }

                  @if (!embeddedSignupEnabled() && !directRegistrationEnabled()) {
                    <p-message severity="warn" styleClass="w-full">
                      <span class="text-sm">No WhatsApp connection method is currently enabled. Please contact your administrator.</span>
                    </p-message>
                  }
                 }
                }

                @if (embeddedSignupResult()?.success) {
                  <p-message severity="success" styleClass="w-full mt-3">
                    <div>
                      <p class="font-semibold">{{ embeddedSignupResult()!.message }}</p>
                      @if (embeddedSignupResult()!.phoneNumber) {
                        <p class="text-sm mt-1">Phone: {{ embeddedSignupResult()!.phoneNumber }}</p>
                      }
                      @if (embeddedSignupResult()!.isCoexistence) {
                        <p class="text-xs mt-1 text-green-700">
                          <i class="pi pi-info-circle mr-1"></i>
                          Coexistence mode active: your WhatsApp Business App keeps working alongside our platform.
                        </p>
                      }
                    </div>
                  </p-message>
                }

                <!-- Session state: Detecting -->
                @if (sessionState() === 'detecting' || sessionState() === 'retry_detecting') {
                  <div class="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                    <p-progressSpinner styleClass="!w-6 !h-6" strokeWidth="4" />
                    <div>
                      <p class="text-sm font-semibold text-blue-900">Checking number status...</p>
                      <p class="text-xs text-blue-700">We're verifying this number with WhatsApp. This takes a few seconds.</p>
                    </div>
                  </div>
                }

                <!-- Session state: Needs migration (BSP / Business WA / Regular WA) -->
                @if (sessionState() === 'needs_bsp_migration' || sessionState() === 'needs_business_removal' || sessionState() === 'needs_wa_removal') {
                  <p-message severity="warn" styleClass="w-full">
                    <div>
                      <p class="font-semibold">{{ migrationGuide()?.title || 'Action Required' }}</p>
                      <p class="text-sm mt-1">{{ sessionResult()?.message }}</p>
                    </div>
                  </p-message>

                  @if (migrationGuide()) {
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div class="flex items-center gap-2 mb-3">
                        <i class="pi pi-list text-amber-600" style="font-size:0.9rem"></i>
                        <p class="text-sm font-semibold text-amber-900">
                          Steps to complete (est. {{ migrationGuide()!.estimatedTime }})
                        </p>
                      </div>
                      <ol class="text-sm text-amber-800 space-y-2 list-decimal pl-5">
                        @for (step of migrationGuide()!.steps; track step) {
                          <li>{{ step }}</li>
                        }
                      </ol>

                      @if (migrationGuide()!.warnings?.length) {
                        <div class="mt-3 pt-3 border-t border-amber-200">
                          <p class="text-xs font-semibold text-red-700 mb-1"><i class="pi pi-exclamation-triangle mr-1"></i> Important:</p>
                          <ul class="text-xs text-red-600 space-y-1 list-disc pl-4">
                            @for (w of migrationGuide()!.warnings; track w) {
                              <li>{{ w }}</li>
                            }
                          </ul>
                        </div>
                      }

                      @if (migrationGuide()!.helpUrl) {
                        <div class="mt-3">
                          <a [href]="migrationGuide()!.helpUrl" target="_blank" class="text-xs text-blue-600 hover:underline">
                            <i class="pi pi-external-link mr-1"></i> View detailed guide
                          </a>
                        </div>
                      }
                    </div>

                    <div class="flex items-center gap-3">
                      <button
                        pButton
                        label="I've completed these steps - Retry"
                        icon="pi pi-refresh"
                        severity="success"
                        [loading]="loading()"
                        (click)="retryDetection()"
                      ></button>
                      <span class="text-xs text-gray-400">Retry {{ retryCount() }}/10</span>
                    </div>
                  }
                }

                <!-- Session state: OTP verification -->
                @if (sessionState() === 'otp_sent') {
                  <p-message severity="info" styleClass="w-full">
                    <div>
                      <p class="font-semibold">Verification Required</p>
                      <p class="text-sm mt-1">{{ sessionResult()?.message || 'A verification code has been sent to your number.' }}</p>
                    </div>
                  </p-message>

                  <div class="border-t border-gray-100 pt-4">
                    <div class="flex items-center gap-3 mb-4">
                      <div class="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                        <i class="pi pi-key text-amber-600" style="font-size:0.9rem"></i>
                      </div>
                      <div>
                        <p class="font-semibold text-gray-900">Verify Your Number</p>
                        <p class="text-xs text-gray-500">Enter the 6-digit code sent to your phone</p>
                      </div>
                    </div>

                    <div class="flex gap-2 mb-3">
                      <input
                        pInputText
                        [(ngModel)]="verificationCode"
                        placeholder="123456"
                        class="flex-1"
                        maxlength="6"
                        style="font-size:1.2rem;letter-spacing:0.3em;text-align:center"
                      />
                      <button
                        pButton
                        label="Verify"
                        icon="pi pi-check"
                        severity="success"
                        [loading]="loading()"
                        [disabled]="verificationCode.length < 6"
                        (click)="submitVerificationCode()"
                      ></button>
                    </div>

                    <div class="flex items-center gap-4 text-xs">
                      <button
                        class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0"
                        [disabled]="loading()"
                        (click)="resendCode('sms')"
                      >Resend via SMS</button>
                      <span class="text-gray-300">|</span>
                      <button
                        class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0"
                        [disabled]="loading()"
                        (click)="resendCode('voice')"
                      >Resend via Voice Call</button>
                    </div>
                  </div>
                }

                <!-- Session state: Active (success!) -->
                @if (sessionState() === 'active') {
                  <p-message severity="success" styleClass="w-full">
                    <div>
                      <p class="font-semibold">Number Activated!</p>
                      <p class="text-sm mt-1">Your WhatsApp number is now connected and ready to use.</p>
                    </div>
                  </p-message>
                }

                <!-- Session state: Failed -->
                @if (sessionState() === 'failed') {
                  <p-message severity="error" styleClass="w-full">
                    <div>
                      <p class="font-semibold">Registration Failed</p>
                      <p class="text-sm mt-1">{{ sessionResult()?.message || 'Something went wrong. Please try again.' }}</p>
                    </div>
                  </p-message>
                }

                @if (phoneError()) {
                  <p-message severity="error" [text]="phoneError()!" styleClass="w-full" />
                }

                <!-- What to expect -->
                <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div class="flex gap-3">
                    <i class="pi pi-info-circle text-blue-500 mt-0.5" style="font-size:1rem"></i>
                    <div>
                      <p class="text-sm font-semibold text-blue-900">How it works</p>
                      <ul class="text-xs text-blue-700 mt-1 leading-relaxed list-disc ml-4 space-y-1">
                        <li>You grant permission once through Meta's secure popup</li>
                        <li>Pick an existing WhatsApp number or add a new one</li>
                        <li>Coexistence keeps your WhatsApp Business App working on the same number</li>
                        <li>Billing runs through our platform — no separate Meta billing setup for you</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex justify-between mt-8">
                <button pButton label="Skip for Now" class="p-button-text p-button-secondary" icon="pi pi-forward" (click)="skipToPersonalize()"></button>
                @if (embeddedSignupResult()?.success) {
                  <button
                    pButton
                    label="Continue"
                    icon="pi pi-arrow-right"
                    iconPos="right"
                    severity="success"
                    (click)="activeStep.set(1)"
                  ></button>
                }
                @if (sessionState() === 'active') {
                  <button
                    pButton
                    label="Continue"
                    icon="pi pi-arrow-right"
                    iconPos="right"
                    severity="success"
                    (click)="activeStep.set(1)"
                  ></button>
                }
              </div>
            </div>
          }

          <!-- ===== STEP 2: Admin WhatsApp Number ===== -->
          @if (activeStep() === 1) {
            <div class="p-8">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <i class="pi pi-user text-indigo-600" style="font-size:1.1rem"></i>
                </div>
                <div>
                  <h2 class="text-xl font-bold text-gray-900">Admin WhatsApp Number</h2>
                  <p class="text-sm text-gray-500">Your personal WhatsApp number to control the admin panel</p>
                </div>
              </div>

              <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-5">
                <div class="flex gap-3">
                  <i class="pi pi-info-circle text-indigo-500 mt-0.5" style="font-size:1rem"></i>
                  <div>
                    <p class="text-sm font-semibold text-indigo-900">Why is this needed?</p>
                    <ul class="text-xs text-indigo-700 mt-1 leading-relaxed list-disc ml-4 space-y-1">
                      <li>Manage orders, confirm payments, and update inventory directly via WhatsApp</li>
                      <li>Receive real-time order and payment notifications on your personal number</li>
                      <li>Control your store admin features without opening the dashboard</li>
                      <li>This is NOT your business WhatsApp number — it's your personal number for admin control</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div class="space-y-4">
                @if (!adminOtpSent() && !adminVerified() && !adminSaved()) {
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">Your Personal WhatsApp Number</label>
                    <div class="flex gap-2">
                      <p-select
                        [(ngModel)]="adminCountryCode"
                        [options]="countryCodes"
                        optionLabel="label"
                        optionValue="value"
                        styleClass="w-36"
                        placeholder="Code"
                      />
                      <input
                        pInputText
                        [(ngModel)]="adminPhone"
                        placeholder="9876543210"
                        class="flex-1"
                        style="font-size:1.1rem;letter-spacing:0.05em"
                      />
                    </div>
                    <p class="text-xs text-gray-400">
                      <i class="pi pi-info-circle mr-1"></i>
                      We'll verify this number with an OTP. You can change or remove it anytime from Settings.
                    </p>
                  </div>
                }

                @if (adminOtpSent() && !adminVerified()) {
                  <p-message severity="info" styleClass="w-full">
                    <div>
                      <p class="font-semibold">Verification Code Sent!</p>
                      <p class="text-sm mt-1">Enter the 6-digit OTP to verify {{ adminCountryCode }}{{ adminPhone }}.</p>
                    </div>
                  </p-message>

                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">Enter Verification Code</label>
                    <div class="flex gap-2">
                      <input
                        pInputText
                        [(ngModel)]="adminOtpCode"
                        placeholder="123456"
                        class="flex-1"
                        maxlength="6"
                        style="font-size:1.2rem;letter-spacing:0.3em;text-align:center"
                      />
                      <button
                        pButton
                        label="Verify"
                        icon="pi pi-check"
                        severity="success"
                        [loading]="adminLoading()"
                        [disabled]="adminOtpCode.length < 6"
                        (click)="verifyAdminOtp()"
                      ></button>
                    </div>
                  </div>

                  <div class="flex items-center gap-3 text-xs">
                    <span class="text-gray-400">Didn't receive it?</span>
                    <button
                      class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0 text-xs"
                      [disabled]="adminLoading()"
                      (click)="sendAdminOtp()"
                    >Resend Code</button>
                  </div>
                }

                @if (adminVerified() || adminSaved()) {
                  <p-message severity="success" styleClass="w-full">
                    <div>
                      <p class="font-semibold">Admin WhatsApp Number {{ adminVerified() ? 'Verified' : 'Saved' }}!</p>
                      <p class="text-sm mt-1">{{ adminCountryCode }}{{ adminPhone }} is now set as your admin control number.</p>
                    </div>
                  </p-message>

                  <div class="flex items-center gap-2 text-xs">
                    <button
                      class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0 text-xs font-medium"
                      (click)="changeAdminPhone()"
                    >Change Number</button>
                    <span class="text-gray-300">|</span>
                    <button
                      class="text-red-500 hover:underline border-0 bg-transparent cursor-pointer p-0 text-xs"
                      [disabled]="adminLoading()"
                      (click)="removeAdminPhone()"
                    >Remove</button>
                  </div>
                }

                @if (adminError()) {
                  <p-message severity="error" [text]="adminError()!" styleClass="w-full" />
                }
              </div>

              <div class="flex justify-between mt-8">
                <div class="flex gap-2">
                  <button pButton label="Back" icon="pi pi-arrow-left" class="p-button-text" (click)="activeStep.set(0)"></button>
                  <button pButton label="Skip for Now" class="p-button-text p-button-secondary" icon="pi pi-forward" (click)="activeStep.set(2)"></button>
                </div>
                @if (!adminOtpSent() && !adminVerified() && !adminSaved()) {
                  <button
                    pButton
                    label="Send OTP"
                    icon="pi pi-key"
                    iconPos="right"
                    severity="success"
                    [loading]="adminLoading()"
                    [disabled]="!adminPhone.trim()"
                    (click)="sendAdminOtp()"
                  ></button>
                }
                @if (adminVerified() || adminSaved()) {
                  <button
                    pButton
                    label="Continue"
                    icon="pi pi-arrow-right"
                    iconPos="right"
                    severity="success"
                    (click)="activeStep.set(2)"
                  ></button>
                }
              </div>
            </div>
          }

          <!-- ===== STEP 3: Business Profile ===== -->
          @if (activeStep() === 2) {
            <div class="p-8">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <i class="pi pi-building text-purple-600" style="font-size:1.1rem"></i>
                </div>
                <div>
                  <h2 class="text-xl font-bold text-gray-900">Business Profile</h2>
                  <p class="text-sm text-gray-500">Tell us about your business so customers know who they're buying from</p>
                </div>
              </div>

              <div class="space-y-4">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Business Name <span class="text-red-400">*</span></label>
                  <input pInputText [(ngModel)]="bizName" placeholder="e.g. Fresh Mart, Style Hub" class="w-full" />
                  <p class="text-xs text-gray-400">
                    <i class="pi pi-whatsapp text-green-500"></i>
                    This is the name WhatsApp displays on your number at the top of every chat.
                  </p>
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Business Category <span class="text-red-400">*</span></label>
                  <p-select
                    [(ngModel)]="bizCategory"
                    [options]="businessCategories"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select your business type"
                    styleClass="w-full"
                  />
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Business Description</label>
                  <textarea pTextarea [(ngModel)]="bizDescription" placeholder="Briefly describe what your business does..." rows="3" class="w-full text-sm" [autoResize]="true"></textarea>
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Business Address</label>
                  <textarea pTextarea [(ngModel)]="bizAddress" placeholder="Your store or office address" rows="2" class="w-full text-sm" [autoResize]="true"></textarea>
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Logo URL</label>
                  <input pInputText [(ngModel)]="bizLogoUrl" placeholder="https://yourdomain.com/logo.png" class="w-full text-sm" />
                  <p class="text-xs text-gray-400">Direct link to your business logo image</p>
                </div>

                <!-- ===== Invoicing & GST (optional) ===== -->
                <div class="border border-gray-200 rounded-xl overflow-hidden">
                  <button type="button"
                    class="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
                    (click)="showInvoiceFields = !showInvoiceFields">
                    <span class="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <i class="pi pi-receipt text-indigo-500"></i>
                      Invoicing &amp; GST <span class="text-xs font-normal text-gray-400">(optional — set up automated invoices)</span>
                    </span>
                    <i class="pi" [class.pi-chevron-down]="!showInvoiceFields" [class.pi-chevron-up]="showInvoiceFields"></i>
                  </button>

                  @if (showInvoiceFields) {
                    <div class="p-4 space-y-4">
                      <p class="text-xs text-gray-500">
                        Add these so invoices are generated automatically when you confirm an order. You can change them later in Settings → Commerce.
                      </p>

                      <div class="flex flex-col gap-1.5">
                        <label class="text-sm font-semibold text-gray-700">Legal / Registered Name</label>
                        <input pInputText [(ngModel)]="bizLegalName" placeholder="Name as registered for GST (if different from brand name)" class="w-full text-sm" />
                        <p class="text-xs text-gray-400">Printed on the invoice. Leave blank to use your business name.</p>
                      </div>

                      <div class="flex flex-col gap-1.5">
                        <label class="text-sm font-semibold text-gray-700">GSTIN</label>
                        <input pInputText [(ngModel)]="bizGstin" placeholder="e.g. 27ABCDE1234F1Z5" class="w-full text-sm" maxlength="15" />
                        <p class="text-xs text-gray-400">Adding a GSTIN enables GST tax invoices automatically.</p>
                      </div>

                      <div class="grid grid-cols-2 gap-3">
                        <div class="flex flex-col gap-1.5">
                          <label class="text-sm font-semibold text-gray-700">State (Place of Supply)</label>
                          <input pInputText [(ngModel)]="bizState" placeholder="e.g. Maharashtra" class="w-full text-sm" />
                        </div>
                        <div class="flex flex-col gap-1.5">
                          <label class="text-sm font-semibold text-gray-700">State Code</label>
                          <input pInputText [(ngModel)]="bizStateCode" placeholder="e.g. 27" class="w-full text-sm" maxlength="2" />
                        </div>
                      </div>

                      <div class="flex flex-col gap-1.5">
                        <label class="text-sm font-semibold text-gray-700">Invoice Number Prefix</label>
                        <input pInputText [(ngModel)]="bizInvoicePrefix" placeholder="INV" class="w-full text-sm" />
                        <p class="text-xs text-gray-400">Your invoice series prefix, e.g. INV/2026/0001.</p>
                      </div>

                      <div class="grid grid-cols-2 gap-3">
                        <div class="flex flex-col gap-1.5">
                          <label class="text-sm font-semibold text-gray-700">Business Email</label>
                          <input pInputText [(ngModel)]="bizEmail" placeholder="hello@yourbiz.com" class="w-full text-sm" />
                        </div>
                        <div class="flex flex-col gap-1.5">
                          <label class="text-sm font-semibold text-gray-700">Website</label>
                          <input pInputText [(ngModel)]="bizWebsite" placeholder="https://yourbiz.com" class="w-full text-sm" />
                        </div>
                      </div>
                      <p class="text-xs text-gray-400">
                        <i class="pi pi-whatsapp text-green-500"></i>
                        Email &amp; website also show on your WhatsApp business profile card.
                      </p>
                    </div>
                  }
                </div>

                @if (profileError()) {
                  <p-message severity="error" [text]="profileError()!" styleClass="w-full" />
                }
              </div>

              <div class="flex justify-between mt-8">
                <button pButton label="Back" icon="pi pi-arrow-left" class="p-button-text" (click)="activeStep.set(1)"></button>
                <button pButton label="Save & Continue" icon="pi pi-arrow-right" iconPos="right" severity="success" [loading]="loading()" [disabled]="!bizName.trim() || !bizCategory" (click)="saveProfile()"></button>
              </div>
            </div>
          }

          <!-- ===== STEP 4: Personalization ===== -->
          @if (activeStep() === 3) {
            <div class="p-8">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <i class="pi pi-sparkles text-amber-600" style="font-size:1.1rem"></i>
                </div>
                <div>
                  <h2 class="text-xl font-bold text-gray-900">Personalize Your Store</h2>
                  <p class="text-sm text-gray-500">Select your niche and automations — we'll create workflows for you</p>
                </div>
              </div>

              <div class="space-y-5">
                <!-- Category selection (shown if user skipped business profile) -->
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Business Category</label>
                  <p-select
                    [(ngModel)]="bizCategory"
                    [options]="categoryDropdown()"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select your business type"
                    styleClass="w-full"
                    (ngModelChange)="onCategoryChange()"
                  />
                </div>

                <!-- Subcategory selection -->
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Business Niche</label>
                  <p-select
                    [(ngModel)]="bizSubcategory"
                    [options]="subcategoryOptions()"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select your specific niche"
                    styleClass="w-full"
                  />
                  <p class="text-xs text-gray-400">This helps us tailor your automation workflows</p>
                </div>

                <!-- Feature selection -->
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-semibold text-gray-700">Select Automations</label>

                  <!-- Workflows / Notifications tabs -->
                  <div class="flex gap-1 bg-gray-100 rounded-xl p-1 mt-1">
                    @for (tab of personalizeTabs; track tab.value) {
                      <button
                        class="flex-1 text-xs font-semibold rounded-lg py-2 px-2 border-0 cursor-pointer transition-all"
                        [class.bg-white]="personalizeTab() === tab.value"
                        [class.shadow-sm]="personalizeTab() === tab.value"
                        [class.text-primary-600]="personalizeTab() === tab.value"
                        [class.bg-transparent]="personalizeTab() !== tab.value"
                        [class.text-gray-500]="personalizeTab() !== tab.value"
                        (click)="personalizeTab.set(tab.value)"
                      >
                        {{ tab.label }}
                        <span class="ml-1 opacity-70">({{ selectedCountForKind(tab.value) }}/{{ totalCountForKind(tab.value) }})</span>
                      </button>
                    }
                  </div>

                  <div class="flex items-center justify-between mt-1">
                    <span class="text-xs text-gray-400">
                      {{ personalizeTab() === 'workflow' ? 'Customer-initiated chat journeys' : 'Auto-sent updates & reminders' }}
                    </span>
                    <div class="flex items-center gap-2">
                      <button class="text-xs text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0 font-medium" (click)="selectRecommended()">Recommended</button>
                      <span class="text-gray-300">|</span>
                      <button class="text-xs text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0 font-medium" (click)="selectAllInTab()">Select All</button>
                      <span class="text-gray-300">|</span>
                      <button class="text-xs text-gray-400 hover:underline border-0 bg-transparent cursor-pointer p-0" (click)="clearTab()">Clear</button>
                    </div>
                  </div>

                  <!-- Grouped features (filtered by active tab) -->
                  @for (group of featureGroups(); track group.name) {
                    <div class="mt-3">
                      <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{{ group.name }}</p>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        @for (feature of group.features; track feature.key) {
                          <div
                            class="border rounded-xl p-3 cursor-pointer transition-all hover:shadow-md"
                            [class.border-primary-500]="isFeatureSelected(feature.key)"
                            [class.bg-primary-50]="isFeatureSelected(feature.key)"
                            [class.border-gray-200]="!isFeatureSelected(feature.key)"
                            [class.bg-white]="!isFeatureSelected(feature.key)"
                            (click)="toggleFeature(feature.key)"
                          >
                            <div class="flex items-start gap-3">
                              <div class="flex-shrink-0 mt-0.5">
                                <div
                                  class="w-7 h-7 rounded-lg flex items-center justify-center"
                                  [class.bg-primary-500]="isFeatureSelected(feature.key)"
                                  [class.bg-gray-100]="!isFeatureSelected(feature.key)"
                                >
                                  @if (isFeatureSelected(feature.key)) {
                                    <i class="pi pi-check text-white" style="font-size:0.7rem"></i>
                                  } @else {
                                    <i class="pi {{ feature.icon }} text-gray-500" style="font-size:0.7rem"></i>
                                  }
                                </div>
                              </div>
                              <div class="flex-1 min-w-0">
                                <p class="text-sm font-semibold" [class.text-primary-700]="isFeatureSelected(feature.key)" [class.text-gray-800]="!isFeatureSelected(feature.key)">{{ feature.label }}</p>
                                <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">{{ feature.description }}</p>
                              </div>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  } @empty {
                    <div class="text-center text-xs text-gray-400 py-6 border border-dashed border-gray-200 rounded-xl mt-2">
                      No {{ personalizeTab() === 'workflow' ? 'workflows' : 'notifications' }} available for this category.
                    </div>
                  }
                </div>

                @if (personalizeError()) {
                  <p-message severity="error" [text]="personalizeError()!" styleClass="w-full" />
                }
              </div>

              <div class="flex justify-between mt-8">
                <button pButton label="Back" icon="pi pi-arrow-left" class="p-button-text" (click)="activeStep.set(2)"></button>
                <div class="flex gap-2">
                  @if (selectedFeatures().size === 0) {
                    <button
                      pButton
                      label="Continue Without Workflows"
                      icon="pi pi-arrow-right"
                      iconPos="right"
                      severity="secondary"
                      (click)="finishOnboarding()"
                    ></button>
                  } @else {
                    <button
                      pButton
                      [label]="personalizeLoading() ? 'Creating Workflows...' : 'Create & Continue'"
                      icon="pi pi-sparkles"
                      iconPos="right"
                      severity="success"
                      [loading]="personalizeLoading()"
                      [disabled]="!bizSubcategory"
                      (click)="submitPersonalization()"
                    ></button>
                  }
                </div>
              </div>
            </div>
          }

          <!-- ===== STEP 5: Complete ===== -->
          @if (activeStep() === 4) {
            <div class="p-8 text-center">
              <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <i class="pi pi-check text-green-600" style="font-size:2.5rem"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-900">You're All Set!</h2>
              <p class="text-gray-500 mt-2 max-w-md mx-auto">
                Your WhatsApp Commerce store is ready to go. Start adding products and serving customers.
              </p>

              <!-- Show created workflows -->
              @if (personalizeResult()?.created?.length) {
                <div class="mt-6 bg-green-50 border border-green-200 rounded-xl p-5 text-left max-w-md mx-auto">
                  <div class="flex items-center gap-2 mb-3">
                    <i class="pi pi-bolt text-green-600" style="font-size:0.9rem"></i>
                    <p class="text-sm font-bold text-green-900">{{ personalizeResult()!.created.length }} Workflows Created & Activated</p>
                  </div>
                  <ul class="space-y-2">
                    @for (wf of personalizeResult()!.created; track wf.id) {
                      <li class="flex items-center gap-2 text-sm text-green-800">
                        <i class="pi pi-check-circle text-green-500" style="font-size:0.75rem"></i>
                        {{ wf.name }}
                      </li>
                    }
                  </ul>
                </div>
              }

              <div class="grid grid-cols-3 gap-4 mt-8 max-w-lg mx-auto">
                <div class="bg-gray-50 rounded-xl p-4">
                  <i class="pi pi-box text-primary-500 mb-2" style="font-size:1.5rem"></i>
                  <p class="text-xs font-semibold text-gray-700">Add Products</p>
                </div>
                <div class="bg-gray-50 rounded-xl p-4">
                  <i class="pi pi-sitemap text-primary-500 mb-2" style="font-size:1.5rem"></i>
                  <p class="text-xs font-semibold text-gray-700">View Workflows</p>
                </div>
                <div class="bg-gray-50 rounded-xl p-4">
                  <i class="pi pi-comments text-primary-500 mb-2" style="font-size:1.5rem"></i>
                  <p class="text-xs font-semibold text-gray-700">Start Selling</p>
                </div>
              </div>

              <button pButton label="Go to Dashboard" icon="pi pi-arrow-right" iconPos="right" severity="success" class="mt-8" (click)="finishOnboarding()"></button>
            </div>
          }

        </div>

        <!-- Skip link at bottom -->
        @if (activeStep() < 3) {
          <p class="text-center text-xs text-gray-400 mt-4">
            Need help?
            <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" class="text-primary-500 hover:underline">WhatsApp API Docs</a>
            · You can also
            <button class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0" (click)="skipToPersonalize()">skip to personalization</button>
          </p>
        }
      </div>
    </div>
  `,
})
export class OnboardingComponent implements OnInit {
  private readonly onboardingService = inject(OnboardingService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  // Steps: 0 = Phone Registration, 1 = Business Profile, 2 = Complete
  activeStep = signal(0);
  loading = signal(false);

  stepLabels = [
    { key: 'phone', label: 'WhatsApp Number' },
    { key: 'admin', label: 'Admin WhatsApp' },
    { key: 'profile', label: 'Business Profile' },
    { key: 'personalize', label: 'Personalize' },
    { key: 'complete', label: 'Complete' },
  ];

  // Embedded Signup result (the connect UI lives in the shared component)
  embeddedSignupResult = signal<EmbeddedSignupResult | null>(null);
  // Super-admin toggle: also offer direct (no-Facebook) registration.
  directRegistrationEnabled = signal(false);
  embeddedSignupEnabled = signal(true);
  // Don't render connection options until we know the real config — prevents a
  // flash of Embedded Signup before registration-options resolves.
  optionsLoaded = signal(false);

  // Step 1: Phone registration (session-based)
  countryCode = '+91';
  phoneNumber = '';
  phoneError = signal<string | null>(null);
  verificationCode = '';

  // Session state
  sessionId = signal<string | null>(null);
  sessionState = signal<OnboardingState | null>(null);
  sessionResult = signal<StartOnboardingResult | null>(null);
  migrationGuide = signal<MigrationGuide | null>(null);
  retryCount = signal(0);

  countryCodes = [
    { label: '+91 India', value: '+91' },
    { label: '+1 US/CA', value: '+1' },
    { label: '+44 UK', value: '+44' },
    { label: '+971 UAE', value: '+971' },
    { label: '+966 Saudi', value: '+966' },
    { label: '+55 Brazil', value: '+55' },
    { label: '+234 Nigeria', value: '+234' },
    { label: '+27 S. Africa', value: '+27' },
    { label: '+52 Mexico', value: '+52' },
    { label: '+49 Germany', value: '+49' },
    { label: '+33 France', value: '+33' },
    { label: '+62 Indonesia', value: '+62' },
    { label: '+880 Bangladesh', value: '+880' },
    { label: '+92 Pakistan', value: '+92' },
    { label: '+63 Philippines', value: '+63' },
  ];

  fullPhone = computed(() => this.countryCode + this.phoneNumber.replace(/^0+/, ''));

  // Step 1: Admin WhatsApp (personal number)
  adminCountryCode = '+91';
  adminPhone = '';
  adminOtpSent = signal(false);
  adminOtpCode = '';
  adminVerified = signal(false);
  adminSaved = signal(false);
  adminError = signal<string | null>(null);
  adminLoading = signal(false);

  // Step 2: Profile
  bizName = '';
  bizCategory = '';
  bizDescription = '';
  bizAddress = '';
  bizLogoUrl = '';
  // Invoicing / GST (optional)
  showInvoiceFields = false;
  bizLegalName = '';
  bizGstin = '';
  bizState = '';
  bizStateCode = '';
  bizInvoicePrefix = 'INV';
  bizEmail = '';
  bizWebsite = '';
  profileError = signal<string | null>(null);

  businessCategories = [
    { label: 'Retail / E-Commerce', value: 'retail' },
    { label: 'Food & Beverages', value: 'food_beverage' },
    { label: 'Fashion & Apparel', value: 'fashion' },
    { label: 'Electronics', value: 'electronics' },
    { label: 'Health & Beauty', value: 'health_beauty' },
    { label: 'Home & Garden', value: 'home_garden' },
    { label: 'Grocery', value: 'grocery' },
    { label: 'Pharmacy', value: 'pharmacy' },
    { label: 'Automotive', value: 'automotive' },
    { label: 'Education', value: 'education' },
    { label: 'Professional Services', value: 'services' },
    { label: 'Travel & Hospitality', value: 'travel' },
    { label: 'Sports & Fitness', value: 'sports' },
    { label: 'Arts & Crafts', value: 'arts' },
    { label: 'Other', value: 'other' },
  ];

  // Step 3: Personalization
  allCategories = signal<CategoryInfo[]>([]);
  allFeatures = signal<FeatureInfo[]>([]);
  bizSubcategory = '';
  subcategoryOptions = signal<{ label: string; value: string }[]>([]);
  selectedFeatures = signal<Set<string>>(new Set());
  personalizeLoading = signal(false);
  personalizeError = signal<string | null>(null);
  personalizeResult = signal<PersonalizeResult | null>(null);

  ngOnInit() {
    this.onboardingService.getRegistrationOptions().subscribe({
      next: (o) => {
        this.directRegistrationEnabled.set(!!o?.directRegistration);
        this.embeddedSignupEnabled.set(o?.embeddedSignup !== false);
        this.optionsLoaded.set(true);
      },
      error: () => {
        this.directRegistrationEnabled.set(false);
        this.embeddedSignupEnabled.set(true);
        this.optionsLoaded.set(true);
      },
    });
    this.onboardingService.getStatus().subscribe({
      next: (status) => {
        switch (status.currentStep) {
          case 'whatsapp_connected':
            // If admin WhatsApp already verified, skip to profile step
            if (status.adminWhatsappVerified) {
              this.adminVerified.set(true);
              this.activeStep.set(2);
            } else {
              this.activeStep.set(1);
            }
            break;
          case 'profile_complete':
            this.loadCategoriesAndGoToPersonalize();
            break;
          case 'completed':
            this.router.navigate(['/dashboard']);
            break;
          default:
            this.activeStep.set(0);
        }
        if (status.phone) {
          this.phoneNumber = status.phone.replace(/^\+\d{1,3}/, '');
        }
        if (status.adminWhatsappNumber) {
          this.adminPhone = status.adminWhatsappNumber.replace(/^\+\d{1,3}/, '');
          this.adminVerified.set(status.adminWhatsappVerified);
          this.adminSaved.set(!!status.adminWhatsappNumber);
        }
        if (status.businessName) this.bizName = status.businessName;
        if (status.businessCategory) this.bizCategory = status.businessCategory;
        if (status.businessDescription) this.bizDescription = status.businessDescription;
        if (status.businessAddress) this.bizAddress = status.businessAddress;
        if (status.logoUrl) this.bizLogoUrl = status.logoUrl;
      },
      error: () => {
        this.activeStep.set(0);
      },
    });
  }

  /** Start onboarding session — detects phone state and routes accordingly */
  startOnboarding() {
    this.phoneError.set(null);
    this.sessionResult.set(null);
    const phone = this.fullPhone();
    if (!phone || phone.length < 10) {
      this.phoneError.set('Please enter a valid phone number');
      return;
    }

    this.loading.set(true);
    this.sessionState.set('detecting');

    this.onboardingService.startSession(phone).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.handleSessionResult(result);
      },
      error: (err) => {
        this.loading.set(false);
        this.sessionState.set(null);
        this.phoneError.set(err?.error?.message || 'Failed to start onboarding. Please try again.');
      },
    });
  }

  /** Retry detection after user claims to have completed migration */
  retryDetection() {
    const sid = this.sessionId();
    if (!sid) return;

    this.loading.set(true);
    this.sessionState.set('retry_detecting');

    this.onboardingService.retrySession(sid).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.handleSessionResult(result);
      },
      error: (err) => {
        this.loading.set(false);
        this.sessionState.set('failed');
        this.messageService.add({
          severity: 'error',
          summary: 'Retry Failed',
          detail: err?.error?.message || 'The number is still unavailable. Please complete the migration steps and try again.',
        });
      },
    });
  }

  /** Submit OTP verification code */
  submitVerificationCode() {
    const sid = this.sessionId();
    if (!sid || this.verificationCode.length < 6) return;

    this.loading.set(true);
    this.onboardingService.sessionVerifyOtp(sid, this.verificationCode).subscribe({
      next: (result) => {
        this.loading.set(false);
        if (result.verified) {
          this.sessionState.set('active');
          this.messageService.add({ severity: 'success', summary: 'Verified!', detail: result.message });
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Verification Failed',
          detail: err?.error?.message || 'Invalid code. Please try again.',
        });
      },
    });
  }

  /** Resend OTP code */
  resendCode(method: 'sms' | 'voice') {
    const sid = this.sessionId();
    if (!sid) return;

    this.loading.set(true);
    this.onboardingService.sessionRequestOtp(sid, method).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.messageService.add({ severity: 'success', summary: 'Code Sent', detail: result.message });
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Failed', detail: err?.error?.message || 'Failed to resend code' });
      },
    });
  }

  // ─── Admin WhatsApp OTP ──────────────────────────────────────────────────

  sendAdminOtp() {
    this.adminError.set(null);
    const phone = this.adminCountryCode + this.adminPhone.replace(/^0+/, '');
    if (!phone || phone.length < 10) {
      this.adminError.set('Please enter a valid phone number');
      return;
    }

    this.adminLoading.set(true);
    this.onboardingService.sendAdminWhatsappOtp(phone).subscribe({
      next: () => {
        this.adminLoading.set(false);
        this.adminOtpSent.set(true);
        this.messageService.add({ severity: 'success', summary: 'OTP Sent', detail: 'Check your WhatsApp for the verification code.' });
      },
      error: (err) => {
        this.adminLoading.set(false);
        this.adminError.set(err?.error?.message || 'Failed to send OTP. Please try again.');
      },
    });
  }

  verifyAdminOtp() {
    this.adminError.set(null);
    const phone = this.adminCountryCode + this.adminPhone.replace(/^0+/, '');
    if (this.adminOtpCode.length < 6) return;

    this.adminLoading.set(true);
    this.onboardingService.verifyAdminWhatsappOtp(phone, this.adminOtpCode).subscribe({
      next: (result) => {
        this.adminLoading.set(false);
        if (result.verified) {
          this.adminVerified.set(true);
          this.adminSaved.set(true);
          this.messageService.add({ severity: 'success', summary: 'Verified!', detail: 'Your admin WhatsApp number is now connected.' });
        }
      },
      error: (err) => {
        this.adminLoading.set(false);
        this.adminError.set(err?.error?.message || 'Invalid code. Please try again.');
      },
    });
  }

  changeAdminPhone() {
    this.adminSaved.set(false);
    this.adminVerified.set(false);
    this.adminOtpSent.set(false);
    this.adminOtpCode = '';
    this.adminPhone = '';
    this.adminError.set(null);
  }

  removeAdminPhone() {
    this.adminLoading.set(true);
    this.adminError.set(null);
    this.onboardingService.removeAdminWhatsapp().subscribe({
      next: () => {
        this.adminLoading.set(false);
        this.adminSaved.set(false);
        this.adminVerified.set(false);
        this.adminOtpSent.set(false);
        this.adminOtpCode = '';
        this.adminPhone = '';
        this.messageService.add({ severity: 'info', summary: 'Removed', detail: 'Admin WhatsApp number removed.' });
      },
      error: (err) => {
        this.adminLoading.set(false);
        this.adminError.set(err?.error?.message || 'Failed to remove number.');
      },
    });
  }

  // ─── Skip to personalization ───────────────────────────────────────────

  skipToPersonalize() {
    this.loadCategoriesAndGoToPersonalize();
  }

  saveProfile() {
    this.profileError.set(null);
    if (!this.bizName.trim()) {
      this.profileError.set('Business name is required');
      return;
    }
    if (!this.bizCategory) {
      this.profileError.set('Please select a business category');
      return;
    }

    this.loading.set(true);
    this.onboardingService.saveBusinessProfile({
      businessName: this.bizName.trim(),
      businessCategory: this.bizCategory,
      businessDescription: this.bizDescription.trim() || undefined,
      businessAddress: this.bizAddress.trim() || undefined,
      logoUrl: this.bizLogoUrl.trim() || undefined,
      legalName: this.bizLegalName.trim() || undefined,
      gstin: this.bizGstin.trim() || undefined,
      gstState: this.bizState.trim() || undefined,
      gstStateCode: this.bizStateCode.trim() || undefined,
      invoicePrefix: this.bizInvoicePrefix.trim() || undefined,
      invoiceEmail: this.bizEmail.trim() || undefined,
      invoiceWebsite: this.bizWebsite.trim() || undefined,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.loadCategoriesAndGoToPersonalize();
      },
      error: (err) => {
        this.loading.set(false);
        this.profileError.set(err?.error?.message || 'Failed to save profile');
      },
    });
  }

  loadCategoriesAndGoToPersonalize() {
    this.onboardingService.getCategories().subscribe({
      next: (data) => {
        this.allCategories.set(data.categories);
        this.allFeatures.set(data.features);

        // If no category selected yet, default to first one
        if (!this.bizCategory && data.categories.length > 0) {
          this.bizCategory = data.categories[0].value;
        }

        // Set subcategories based on selected category
        this.updateSubcategories();

        // Pre-select recommended features for the selected category
        const cat = data.categories.find(c => c.value === this.bizCategory);
        if (cat) {
          this.selectedFeatures.set(new Set(cat.recommendedFeatures));
        }

        this.activeStep.set(3);
      },
      error: () => {
        // If categories fail to load, go to complete
        this.finishOnboarding();
      },
    });
  }

  updateSubcategories() {
    const cat = this.allCategories().find(c => c.value === this.bizCategory);
    if (cat) {
      this.subcategoryOptions.set(cat.subcategories.map(s => ({ label: s.label, value: s.value })));
      if (!this.bizSubcategory && cat.subcategories.length > 0) {
        this.bizSubcategory = cat.subcategories[0].value;
      }
    }
  }

  categoryDropdown = computed(() => {
    return this.allCategories().map(c => ({ label: c.label, value: c.value }));
  });

  onCategoryChange() {
    this.bizSubcategory = '';
    this.updateSubcategories();
    const cat = this.allCategories().find(c => c.value === this.bizCategory);
    if (cat) {
      this.selectedFeatures.set(new Set(cat.recommendedFeatures));
    }
  }

  // Personalization is split into two tabs: customer-initiated Workflows and
  // auto-sent Notifications. A feature's `kind` (from the API) decides its tab.
  personalizeTab = signal<'workflow' | 'notification'>('workflow');
  personalizeTabs: { value: 'workflow' | 'notification'; label: string }[] = [
    { value: 'workflow', label: '🤖 Workflows' },
    { value: 'notification', label: '🔔 Notifications' },
  ];

  private kindOf(f: FeatureInfo): 'workflow' | 'notification' {
    return f.kind === 'notification' ? 'notification' : 'workflow';
  }

  featureGroups = computed(() => {
    const tab = this.personalizeTab();
    const features = this.allFeatures().filter(f => this.kindOf(f) === tab);
    const groups: { name: string; features: FeatureInfo[] }[] = [];
    const groupMap = new Map<string, FeatureInfo[]>();
    for (const f of features) {
      const g = f.group || 'Other';
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(f);
    }
    for (const [name, feats] of groupMap) {
      groups.push({ name, features: feats });
    }
    return groups;
  });

  /** Features in a given tab. */
  private featuresForKind(kind: 'workflow' | 'notification'): FeatureInfo[] {
    return this.allFeatures().filter(f => this.kindOf(f) === kind);
  }

  totalCountForKind(kind: 'workflow' | 'notification'): number {
    return this.featuresForKind(kind).length;
  }

  selectedCountForKind(kind: 'workflow' | 'notification'): number {
    const sel = this.selectedFeatures();
    return this.featuresForKind(kind).filter(f => sel.has(f.key)).length;
  }

  /** Select all features in the active tab (preserving the other tab's choices). */
  selectAllInTab() {
    const next = new Set(this.selectedFeatures());
    for (const f of this.featuresForKind(this.personalizeTab())) next.add(f.key);
    this.selectedFeatures.set(next);
  }

  /** Clear only the active tab's selections. */
  clearTab() {
    const tabKeys = new Set(this.featuresForKind(this.personalizeTab()).map(f => f.key));
    const next = new Set(Array.from(this.selectedFeatures()).filter(k => !tabKeys.has(k)));
    this.selectedFeatures.set(next);
  }

  selectRecommended() {
    const cat = this.allCategories().find(c => c.value === this.bizCategory);
    if (cat) {
      this.selectedFeatures.set(new Set(cat.recommendedFeatures));
    }
  }

  toggleFeature(featureKey: string) {
    const current = new Set(this.selectedFeatures());
    if (current.has(featureKey)) {
      current.delete(featureKey);
    } else {
      current.add(featureKey);
    }
    this.selectedFeatures.set(current);
  }

  isFeatureSelected(featureKey: string): boolean {
    return this.selectedFeatures().has(featureKey);
  }

  submitPersonalization() {
    this.personalizeError.set(null);
    if (!this.bizSubcategory) {
      this.personalizeError.set('Please select a subcategory');
      return;
    }
    if (this.selectedFeatures().size === 0) {
      this.personalizeError.set('Please select at least one feature');
      return;
    }

    this.personalizeLoading.set(true);
    this.onboardingService.personalize({
      category: this.bizCategory,
      subcategory: this.bizSubcategory,
      selectedFeatures: Array.from(this.selectedFeatures()),
    }).subscribe({
      next: (result) => {
        this.personalizeLoading.set(false);
        this.personalizeResult.set(result);
        this.activeStep.set(4);
      },
      error: (err) => {
        this.personalizeLoading.set(false);
        this.personalizeError.set(err?.error?.message || 'Failed to create workflows');
      },
    });
  }

  finishOnboarding() {
    this.onboardingService.completeOnboarding().subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => this.router.navigate(['/dashboard']),
    });
  }

  skipOnboarding() {
    this.skipToPersonalize();
  }

  // ─── Embedded Signup ──────────────────────────────────────────────

  /** The shared <wa-embedded-signup-button> emits this once a number connects. */
  onEmbeddedConnected(result: EmbeddedSignupResult) {
    this.embeddedSignupResult.set(result);
  }

  /** Direct (no-Facebook) registration finished — show the same success + Continue. */
  onDirectConnected() {
    this.embeddedSignupResult.set({ success: true, message: 'Number registered and verified.' } as EmbeddedSignupResult);
  }

  private handleSessionResult(result: StartOnboardingResult) {
    this.sessionId.set(result.sessionId);
    this.sessionState.set(result.state);
    this.sessionResult.set(result);
    this.migrationGuide.set(result.migrationGuide || null);

    switch (result.state) {
      case 'otp_sent':
        this.messageService.add({ severity: 'info', summary: 'Verification Needed', detail: result.message });
        break;
      case 'active':
        this.messageService.add({ severity: 'success', summary: 'Number Activated!', detail: result.message });
        break;
      case 'needs_bsp_migration':
      case 'needs_business_removal':
      case 'needs_wa_removal':
        this.messageService.add({ severity: 'warn', summary: 'Action Required', detail: result.message });
        break;
      case 'failed':
        this.messageService.add({ severity: 'error', summary: 'Failed', detail: result.message });
        break;
    }
  }
}
