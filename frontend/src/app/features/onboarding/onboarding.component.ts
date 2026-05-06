import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { StepperModule } from 'primeng/stepper';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import {
  OnboardingService,
  OnboardingStatus,
  PhoneCheckResult,
  SetupGuide,
  SetupGuideStep,
} from '../../core/services/onboarding.service';

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
    StepperModule,
    MessageModule,
    DividerModule,
    ToastModule,
    TagModule,
    TooltipModule,
    ProgressSpinnerModule,
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

          <!-- ===== STEP 1: Phone Number ===== -->
          @if (activeStep() === 0) {
            <div class="p-8">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <i class="pi pi-phone text-amber-600" style="font-size:1.1rem"></i>
                </div>
                <div>
                  <h2 class="text-xl font-bold text-gray-900">Your WhatsApp Number</h2>
                  <p class="text-sm text-gray-500">Enter the phone number you want to use for your business</p>
                </div>
              </div>

              <div class="space-y-4">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Mobile Number</label>
                  <div class="flex gap-2">
                    <p-select
                      [(ngModel)]="countryCode"
                      [options]="countryCodes"
                      optionLabel="label"
                      optionValue="value"
                      styleClass="w-36"
                      placeholder="Code"
                    />
                    <input
                      pInputText
                      [(ngModel)]="phoneNumber"
                      placeholder="9876543210"
                      class="flex-1"
                      style="font-size:1.1rem;letter-spacing:0.05em"
                    />
                  </div>
                  <p class="text-xs text-gray-400">
                    <i class="pi pi-info-circle mr-1"></i>
                    Enter your number without the country code. We'll check if WhatsApp Business is available.
                  </p>
                </div>

                @if (phoneError()) {
                  <p-message severity="error" [text]="phoneError()!" styleClass="w-full" />
                }

                <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div class="flex gap-3">
                    <i class="pi pi-info-circle text-blue-500 mt-0.5" style="font-size:1rem"></i>
                    <div>
                      <p class="text-sm font-semibold text-blue-900">Important Note</p>
                      <p class="text-xs text-blue-700 mt-1 leading-relaxed">
                        This number will be used to send and receive WhatsApp messages to your customers.
                        If you already have WhatsApp Business API set up on this number, great — you can connect it in the next step.
                        If not, we'll guide you through the setup process.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex justify-between mt-8">
                <button pButton label="Skip for Now" class="p-button-text p-button-secondary" icon="pi pi-forward" (click)="skipOnboarding()"></button>
                <button pButton label="Verify Number" icon="pi pi-arrow-right" iconPos="right" severity="success" [loading]="loading()" [disabled]="!phoneNumber.trim()" (click)="verifyPhone()"></button>
              </div>
            </div>
          }

          <!-- ===== STEP 2: WhatsApp Business Check ===== -->
          @if (activeStep() === 1) {
            <div class="p-8">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <i class="pi pi-whatsapp text-green-600" style="font-size:1.1rem"></i>
                </div>
                <div>
                  <h2 class="text-xl font-bold text-gray-900">Connect WhatsApp Business</h2>
                  <p class="text-sm text-gray-500">Number verified: <strong>{{ fullPhone() }}</strong></p>
                </div>
              </div>

              <!-- Two options -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <!-- Option A: I have credentials -->
                <div
                  class="p-5 border-2 rounded-xl cursor-pointer transition-all hover:shadow-md"
                  [class.border-primary-500]="connectionMode() === 'connect'"
                  [class.bg-primary-50]="connectionMode() === 'connect'"
                  [class.border-gray-200]="connectionMode() !== 'connect'"
                  (click)="connectionMode.set('connect')"
                >
                  <div class="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center mb-3">
                    <i class="pi pi-link text-primary-600" style="font-size:1rem"></i>
                  </div>
                  <h3 class="font-bold text-gray-900">I already have WhatsApp Business API</h3>
                  <p class="text-xs text-gray-500 mt-1">I have my Phone Number ID, WABA ID, and Access Token from Meta</p>
                </div>

                <!-- Option B: I need help -->
                <div
                  class="p-5 border-2 rounded-xl cursor-pointer transition-all hover:shadow-md"
                  [class.border-amber-500]="connectionMode() === 'guide'"
                  [class.bg-amber-50]="connectionMode() === 'guide'"
                  [class.border-gray-200]="connectionMode() !== 'guide'"
                  (click)="connectionMode.set('guide'); loadSetupGuide()"
                >
                  <div class="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-3">
                    <i class="pi pi-book text-amber-600" style="font-size:1rem"></i>
                  </div>
                  <h3 class="font-bold text-gray-900">I need to set it up</h3>
                  <p class="text-xs text-gray-500 mt-1">Show me step-by-step how to create a WhatsApp Business account</p>
                </div>
              </div>

              <!-- Connect Form -->
              @if (connectionMode() === 'connect') {
                <div class="space-y-4 border-t border-gray-100 pt-5">
                  <p class="text-sm text-gray-600">
                    Enter your WhatsApp Business API credentials. You can find these in your
                    <a href="https://developers.facebook.com/apps/" target="_blank" class="text-primary-600 font-medium hover:underline">Meta Developer Dashboard</a>.
                  </p>

                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">Phone Number ID <span class="text-red-400">*</span></label>
                    <input pInputText [(ngModel)]="waPhoneNumberId" placeholder="e.g. 123456789012345" class="w-full font-mono text-sm" />
                    <p class="text-xs text-gray-400">Found in WhatsApp → API Setup → Phone number section</p>
                  </div>

                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">WhatsApp Business Account ID (WABA ID) <span class="text-red-400">*</span></label>
                    <input pInputText [(ngModel)]="wabaId" placeholder="e.g. 987654321012345" class="w-full font-mono text-sm" />
                    <p class="text-xs text-gray-400">Found in WhatsApp → API Setup or Business Settings</p>
                  </div>

                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">Permanent Access Token <span class="text-red-400">*</span></label>
                    <input pInputText [(ngModel)]="waAccessToken" placeholder="EAA..." class="w-full font-mono text-sm" type="password" />
                    <p class="text-xs text-gray-400">Generate from Business Settings → System Users → Generate Token</p>
                  </div>

                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">Webhook Verify Token <span class="text-gray-400 font-normal">(optional)</span></label>
                    <input pInputText [(ngModel)]="waWebhookSecret" placeholder="Your webhook verification token" class="w-full text-sm" />
                    <p class="text-xs text-gray-400">We'll generate one for you if left blank</p>
                  </div>

                  @if (connectError()) {
                    <p-message severity="error" [text]="connectError()!" styleClass="w-full" />
                  }
                  @if (connectSuccess()) {
                    <p-message severity="success" [text]="connectSuccess()!" styleClass="w-full" />
                  }
                </div>
              }

              <!-- Setup Guide -->
              @if (connectionMode() === 'guide') {
                <div class="border-t border-gray-100 pt-5">
                  @if (guideLoading()) {
                    <div class="text-center py-8">
                      <p-progressSpinner styleClass="w-10 h-10" strokeWidth="4" />
                      <p class="text-sm text-gray-500 mt-3">Loading setup guide...</p>
                    </div>
                  } @else if (setupGuide()) {
                    <div class="space-y-3">
                      <!-- Title & estimated time -->
                      <div class="flex items-center justify-between mb-2">
                        <h3 class="text-lg font-bold text-gray-900">{{ setupGuide()!.title }}</h3>
                        <p-tag [value]="'~' + setupGuide()!.estimatedTime" icon="pi pi-clock" severity="info" />
                      </div>

                      <!-- Prerequisites -->
                      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                        <p class="text-sm font-bold text-amber-900 mb-2">
                          <i class="pi pi-exclamation-triangle mr-1"></i> Before you start, you'll need:
                        </p>
                        <ul class="space-y-1">
                          @for (prereq of setupGuide()!.prerequisites; track prereq) {
                            <li class="text-sm text-amber-800 flex items-start gap-2">
                              <i class="pi pi-check-circle text-amber-500 mt-0.5" style="font-size:0.8rem"></i>
                              {{ prereq }}
                            </li>
                          }
                        </ul>
                      </div>

                      <!-- Steps -->
                      @for (step of setupGuide()!.steps; track step.step) {
                        <div
                          class="border rounded-xl overflow-hidden transition-all"
                          [class.border-red-300]="step.important"
                          [class.border-gray-200]="!step.important"
                        >
                          <button
                            class="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                            (click)="toggleGuideStep(step.step)"
                          >
                            <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                              [class.bg-primary-500]="completedGuideSteps().has(step.step)"
                              [class.text-white]="completedGuideSteps().has(step.step)"
                              [class.bg-gray-100]="!completedGuideSteps().has(step.step)"
                              [class.text-gray-600]="!completedGuideSteps().has(step.step)"
                            >
                              @if (completedGuideSteps().has(step.step)) {
                                <i class="pi pi-check" style="font-size:0.7rem"></i>
                              } @else {
                                {{ step.step }}
                              }
                            </div>
                            <div class="flex-1">
                              <p class="text-sm font-bold text-gray-900">{{ step.title }}</p>
                              @if (step.important) {
                                <p-tag value="Important" severity="danger" styleClass="text-xs mt-1" />
                              }
                            </div>
                            <i class="pi text-gray-400"
                              [class.pi-chevron-down]="expandedGuideStep() === step.step"
                              [class.pi-chevron-right]="expandedGuideStep() !== step.step"
                              style="font-size:0.75rem"
                            ></i>
                          </button>

                          @if (expandedGuideStep() === step.step) {
                            <div class="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
                              <p class="text-sm text-gray-700 leading-relaxed">{{ step.description }}</p>

                              @if (step.details?.length) {
                                <div class="space-y-2">
                                  @for (detail of step.details; track detail.label) {
                                    <div class="bg-gray-50 rounded-lg p-3">
                                      <p class="text-xs font-bold text-gray-700">{{ detail.label }}</p>
                                      <p class="text-xs text-gray-500 mt-0.5">{{ detail.where }}</p>
                                      <p class="text-xs font-mono text-primary-600 mt-1 bg-white px-2 py-1 rounded border border-gray-200 inline-block">{{ detail.example }}</p>
                                    </div>
                                  }
                                </div>
                              }

                              @if (step.tips?.length) {
                                <div class="bg-blue-50 rounded-lg p-3">
                                  <p class="text-xs font-bold text-blue-800 mb-1.5">
                                    <i class="pi pi-lightbulb mr-1"></i> Tips
                                  </p>
                                  <ul class="space-y-1">
                                    @for (tip of step.tips; track tip) {
                                      <li class="text-xs text-blue-700 flex items-start gap-1.5">
                                        <span class="text-blue-400 mt-0.5">•</span>
                                        {{ tip }}
                                      </li>
                                    }
                                  </ul>
                                </div>
                              }

                              @if (step.link) {
                                <a
                                  [href]="step.link"
                                  target="_blank"
                                  class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors no-underline"
                                >
                                  <i class="pi pi-external-link" style="font-size:0.75rem"></i>
                                  {{ step.linkLabel || 'Open Link' }}
                                </a>
                              }

                              <div class="flex justify-end">
                                <button pButton
                                  [label]="completedGuideSteps().has(step.step) ? 'Done ✓' : 'Mark as Done'"
                                  [severity]="completedGuideSteps().has(step.step) ? 'success' : 'secondary'"
                                  class="p-button-sm p-button-outlined"
                                  (click)="markGuideStepDone(step.step)"
                                ></button>
                              </div>
                            </div>
                          }
                        </div>
                      }

                      <!-- Troubleshooting -->
                      <p-divider />
                      <div>
                        <button class="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors" (click)="showTroubleshooting.set(!showTroubleshooting())">
                          <i class="pi pi-wrench" style="font-size:0.8rem"></i>
                          Troubleshooting
                          <i class="pi text-gray-400" [class.pi-chevron-down]="showTroubleshooting()" [class.pi-chevron-right]="!showTroubleshooting()" style="font-size:0.6rem"></i>
                        </button>
                        @if (showTroubleshooting()) {
                          <div class="mt-3 space-y-3">
                            @for (item of setupGuide()!.troubleshooting; track item.problem) {
                              <div class="bg-gray-50 rounded-lg p-3">
                                <p class="text-xs font-bold text-gray-700">
                                  <i class="pi pi-question-circle mr-1 text-gray-400"></i>
                                  {{ item.problem }}
                                </p>
                                <p class="text-xs text-gray-600 mt-1">{{ item.solution }}</p>
                              </div>
                            }
                          </div>
                        }
                      </div>

                      <!-- After guide, allow connection -->
                      <p-divider />
                      <div class="bg-green-50 border border-green-200 rounded-xl p-4">
                        <p class="text-sm font-bold text-green-900 mb-1">
                          <i class="pi pi-check-circle mr-1"></i> Got your credentials? Great!
                        </p>
                        <p class="text-xs text-green-700 mb-3">
                          Once you have your Phone Number ID, WABA ID, and Access Token, click the button below to connect.
                        </p>
                        <button pButton label="I have my credentials — Connect Now" icon="pi pi-link" severity="success" class="p-button-sm" (click)="connectionMode.set('connect')"></button>
                      </div>

                      <!-- Support links -->
                      <div class="flex flex-wrap gap-3 mt-3">
                        <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" class="text-xs text-primary-600 hover:underline flex items-center gap-1">
                          <i class="pi pi-book" style="font-size:0.65rem"></i> Meta Official Docs
                        </a>
                        <a href="https://business.facebook.com/direct-support" target="_blank" class="text-xs text-primary-600 hover:underline flex items-center gap-1">
                          <i class="pi pi-headphones" style="font-size:0.65rem"></i> Meta Support
                        </a>
                        <a href="https://developers.facebook.com/community/" target="_blank" class="text-xs text-primary-600 hover:underline flex items-center gap-1">
                          <i class="pi pi-users" style="font-size:0.65rem"></i> Community Forum
                        </a>
                      </div>
                    </div>
                  }
                </div>
              }

              <div class="flex justify-between mt-8">
                <button pButton label="Back" icon="pi pi-arrow-left" class="p-button-text" (click)="activeStep.set(0)"></button>
                @if (connectionMode() === 'connect') {
                  <button pButton label="Connect & Continue" icon="pi pi-arrow-right" iconPos="right" severity="success" [loading]="loading()" [disabled]="!waPhoneNumberId || !wabaId || !waAccessToken" (click)="connectWhatsApp()"></button>
                } @else {
                  <button pButton label="Skip — I'll set up later" icon="pi pi-arrow-right" iconPos="right" class="p-button-outlined" (click)="activeStep.set(2)"></button>
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

          <!-- ===== STEP 4: Complete ===== -->
          @if (activeStep() === 3) {
            <div class="p-8 text-center">
              <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <i class="pi pi-check text-green-600" style="font-size:2.5rem"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-900">You're All Set!</h2>
              <p class="text-gray-500 mt-2 max-w-md mx-auto">
                Your WhatsApp Commerce store is ready to go. Start adding products, setting up workflows, and serving customers.
              </p>

              <div class="grid grid-cols-3 gap-4 mt-8 max-w-lg mx-auto">
                <div class="bg-gray-50 rounded-xl p-4">
                  <i class="pi pi-box text-primary-500 mb-2" style="font-size:1.5rem"></i>
                  <p class="text-xs font-semibold text-gray-700">Add Products</p>
                </div>
                <div class="bg-gray-50 rounded-xl p-4">
                  <i class="pi pi-sitemap text-primary-500 mb-2" style="font-size:1.5rem"></i>
                  <p class="text-xs font-semibold text-gray-700">Build Workflows</p>
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
            <button class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0" (click)="skipOnboarding()">skip and set up later</button>
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

  // Steps
  activeStep = signal(0);
  loading = signal(false);

  stepLabels = [
    { key: 'phone', label: 'Phone Number' },
    { key: 'whatsapp', label: 'WhatsApp Business' },
    { key: 'profile', label: 'Business Profile' },
    { key: 'complete', label: 'Complete' },
  ];

  // Step 1: Phone
  countryCode = '+91';
  phoneNumber = '';
  phoneError = signal<string | null>(null);

  countryCodes = [
    { label: '🇮🇳 +91', value: '+91' },
    { label: '🇺🇸 +1', value: '+1' },
    { label: '🇬🇧 +44', value: '+44' },
    { label: '🇦🇪 +971', value: '+971' },
    { label: '🇸🇦 +966', value: '+966' },
    { label: '🇧🇷 +55', value: '+55' },
    { label: '🇳🇬 +234', value: '+234' },
    { label: '🇿🇦 +27', value: '+27' },
    { label: '🇲🇽 +52', value: '+52' },
    { label: '🇩🇪 +49', value: '+49' },
    { label: '🇫🇷 +33', value: '+33' },
    { label: '🇮🇩 +62', value: '+62' },
    { label: '🇧🇩 +880', value: '+880' },
    { label: '🇵🇰 +92', value: '+92' },
    { label: '🇵🇭 +63', value: '+63' },
  ];

  fullPhone = computed(() => this.countryCode + this.phoneNumber.replace(/^0+/, ''));

  // Step 2: WhatsApp connection
  connectionMode = signal<'connect' | 'guide' | null>(null);
  waPhoneNumberId = '';
  wabaId = '';
  waAccessToken = '';
  waWebhookSecret = '';
  connectError = signal<string | null>(null);
  connectSuccess = signal<string | null>(null);

  // Setup guide
  setupGuide = signal<any>(null);
  guideLoading = signal(false);
  expandedGuideStep = signal<number | null>(1);
  completedGuideSteps = signal<Set<number>>(new Set());
  showTroubleshooting = signal(false);

  // Step 3: Profile
  bizName = '';
  bizCategory = '';
  bizDescription = '';
  bizAddress = '';
  bizLogoUrl = '';
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

  ngOnInit() {
    // Load current onboarding status
    this.onboardingService.getStatus().subscribe({
      next: (status) => {
        // Resume from where user left off
        switch (status.currentStep) {
          case 'phone_verified':
            this.activeStep.set(1);
            break;
          case 'whatsapp_connected':
            this.activeStep.set(2);
            break;
          case 'profile_complete':
            this.activeStep.set(3);
            break;
          case 'completed':
            this.router.navigate(['/dashboard']);
            break;
          default:
            this.activeStep.set(0);
        }
        // Pre-fill existing data
        if (status.phone) {
          // Try to split country code and number
          this.phoneNumber = status.phone.replace(/^\+\d{1,3}/, '');
        }
        if (status.businessName) this.bizName = status.businessName;
        if (status.businessCategory) this.bizCategory = status.businessCategory;
        if (status.businessDescription) this.bizDescription = status.businessDescription;
        if (status.businessAddress) this.bizAddress = status.businessAddress;
        if (status.logoUrl) this.bizLogoUrl = status.logoUrl;
      },
      error: () => {
        // If status fetch fails, start from beginning
        this.activeStep.set(0);
      },
    });
  }

  verifyPhone() {
    this.phoneError.set(null);
    const phone = this.fullPhone();
    if (!phone || phone.length < 10) {
      this.phoneError.set('Please enter a valid phone number');
      return;
    }

    this.loading.set(true);
    this.onboardingService.checkPhone(phone).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.activeStep.set(1);
        this.messageService.add({ severity: 'success', summary: 'Phone Verified', detail: result.message });
      },
      error: (err) => {
        this.loading.set(false);
        this.phoneError.set(err?.error?.message || 'Failed to verify phone number');
      },
    });
  }

  loadSetupGuide() {
    if (this.setupGuide()) return;
    this.guideLoading.set(true);
    this.onboardingService.getSetupGuide().subscribe({
      next: (guide) => {
        this.setupGuide.set(guide);
        this.guideLoading.set(false);
      },
      error: () => {
        this.guideLoading.set(false);
      },
    });
  }

  toggleGuideStep(step: number) {
    this.expandedGuideStep.set(this.expandedGuideStep() === step ? null : step);
  }

  markGuideStepDone(step: number) {
    this.completedGuideSteps.update(set => {
      const next = new Set(set);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  }

  connectWhatsApp() {
    this.connectError.set(null);
    this.connectSuccess.set(null);
    this.loading.set(true);

    this.onboardingService.connectWhatsApp({
      phone: this.fullPhone(),
      phoneNumberId: this.waPhoneNumberId.trim(),
      wabaId: this.wabaId.trim(),
      accessToken: this.waAccessToken.trim(),
      webhookSecret: this.waWebhookSecret.trim() || undefined,
    }).subscribe({
      next: (result) => {
        this.loading.set(false);
        if (result.connected) {
          this.connectSuccess.set(result.message);
          this.messageService.add({ severity: 'success', summary: 'Connected!', detail: result.message });
          // Auto-advance after short delay
          setTimeout(() => this.activeStep.set(2), 1500);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.connectError.set(err?.error?.message || 'Failed to connect WhatsApp Business API');
      },
    });
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
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.activeStep.set(3);
      },
      error: (err) => {
        this.loading.set(false);
        this.profileError.set(err?.error?.message || 'Failed to save profile');
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
    this.onboardingService.skipOnboarding().subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => this.router.navigate(['/dashboard']),
    });
  }
}
