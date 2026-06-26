import { Component, OnInit, signal, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TabsModule } from 'primeng/tabs';
import { ToastModule } from 'primeng/toast';
import { DividerModule } from 'primeng/divider';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageModule } from 'primeng/message';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { OnboardingService, RegisterNumberResult } from '../../core/services/onboarding.service';
import { EmbeddedSignupButtonComponent } from '../../shared/embedded-signup-button.component';
import { DirectNumberRegistrationComponent } from '../../shared/direct-number-registration.component';

@Component({
  selector: 'wa-settings',
  standalone: true,
  imports: [
    InputNumberModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    ToggleSwitchModule,
    TabsModule,
    ToastModule,
    DividerModule,
    TagModule,
    TooltipModule,
    MessageModule,
    DialogModule,
    EmbeddedSignupButtonComponent,
    DirectNumberRegistrationComponent,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-4xl mx-auto">
      <p-toast />

      <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Settings</h1>
        <p class="text-gray-500 text-sm">Manage your store and WhatsApp configuration</p>
      </div>

      <p-tabs value="business">
        <p-tablist>
          <p-tab value="business"><i class="pi pi-building mr-2"></i>Business</p-tab>
          <p-tab value="whatsapp"><i class="pi pi-whatsapp mr-2"></i>WhatsApp</p-tab>
          <p-tab value="payments"><i class="pi pi-credit-card mr-2"></i>Payments</p-tab>
          <p-tab value="notifications"><i class="pi pi-bell mr-2"></i>Notifications</p-tab>
          <p-tab value="commerce"><i class="pi pi-shop mr-2"></i>Commerce</p-tab>
          <p-tab value="subscription"><i class="pi pi-star mr-2"></i>Subscription</p-tab>
        </p-tablist>

        <p-tabpanels>

          <!-- Business settings -->
          <p-tabpanel value="business">
            <div class="space-y-6 mt-4">
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-5">Business Information</h3>
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Business Name</label>
                      <input pInputText [(ngModel)]="biz.name" class="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Store Slug</label>
                      <div class="flex items-center border border-gray-300 rounded-md overflow-hidden">
                        <span class="px-3 py-2 bg-gray-100 text-gray-500 text-sm border-r border-gray-300">@</span>
                        <input pInputText [(ngModel)]="biz.slug" class="border-none flex-1 rounded-none" />
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Business Description</label>
                    <textarea pTextarea [(ngModel)]="biz.description" rows="2" class="w-full" placeholder="Brief description of your business..."></textarea>
                  </div>
                  <div class="grid grid-cols-3 gap-4">
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Currency</label>
                      <p-select [(ngModel)]="biz.currency" [options]="currencies" optionLabel="label" optionValue="value" styleClass="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Timezone</label>
                      <p-select [(ngModel)]="biz.timezone" [options]="timezones" optionLabel="label" optionValue="value" styleClass="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Order Prefix</label>
                      <input pInputText [(ngModel)]="biz.orderPrefix" class="w-full" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Notification Email</label>
                    <input pInputText type="email" [(ngModel)]="biz.email" placeholder="alerts@yourbusiness.com" class="w-full" />
                  </div>
                </div>
              </div>

              <!-- Business hours -->
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-5">Business Hours</h3>
                <div class="space-y-3">
                  @for (day of businessHours; track day.day) {
                    <div class="flex items-center gap-4">
                      <div class="w-20 flex items-center gap-2">
                        <p-toggleswitch [(ngModel)]="day.enabled" />
                        <span class="text-sm font-medium text-gray-700">{{ day.day }}</span>
                      </div>
                      @if (day.enabled) {
                        <div class="flex items-center gap-2">
                          <p-select [(ngModel)]="day.open" [options]="timeSlots" optionLabel="label" optionValue="value" styleClass="min-w-28" />
                          <span class="text-gray-400 text-sm">to</span>
                          <p-select [(ngModel)]="day.close" [options]="timeSlots" optionLabel="label" optionValue="value" styleClass="min-w-28" />
                        </div>
                      } @else {
                        <span class="text-sm text-gray-400">Closed</span>
                      }
                    </div>
                  }
                </div>
              </div>

              <div class="flex justify-end">
                <button pButton label="Save Business Settings" icon="pi pi-check" severity="success" (click)="save()"></button>
              </div>
            </div>
          </p-tabpanel>

          <!-- WhatsApp settings -->
          <p-tabpanel value="whatsapp">
            <div class="space-y-6 mt-4">

              <!-- Connection Status -->
              @if (waConnected()) {
                <div class="bg-white rounded-xl p-6 shadow-sm border border-green-200">
                  <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                      <i class="pi pi-check-circle text-green-600" style="font-size:1.2rem"></i>
                    </div>
                    <div>
                      <h3 class="text-base font-semibold text-gray-900">WhatsApp Connected</h3>
                      <p class="text-sm text-green-600">Your WhatsApp Business Account is active</p>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="bg-gray-50 rounded-lg p-3">
                      <p class="text-xs text-gray-500">Phone Number</p>
                      <p class="text-sm font-semibold text-gray-900">{{ wa.phone || 'Not set' }}</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-3">
                      <p class="text-xs text-gray-500">Business Account ID</p>
                      <p class="text-sm font-semibold text-gray-900 font-mono">{{ wa.accountId || 'Connected via Facebook' }}</p>
                    </div>
                  </div>
                </div>
              } @else {
                <!-- Not connected — prompt to register a phone number -->
                <div class="bg-white rounded-xl p-6 shadow-sm border border-amber-200">
                  <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                      <i class="pi pi-exclamation-triangle text-amber-600" style="font-size:1.1rem"></i>
                    </div>
                    <div>
                      <h3 class="text-base font-semibold text-gray-900">WhatsApp Not Connected</h3>
                      <p class="text-sm text-gray-500">Register a phone number to start messaging customers</p>
                    </div>
                  </div>

                  @if (optionsLoaded() && embeddedSignupEnabled()) {
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                      <div class="flex gap-3">
                        <i class="pi pi-whatsapp text-green-600 mt-0.5" style="font-size:1rem"></i>
                        <div>
                          <p class="text-sm font-semibold text-blue-900">Connect with Meta</p>
                          <p class="text-xs text-blue-700 mt-1 leading-relaxed">
                            Authorize through Meta's secure popup, then pick or create your WhatsApp
                            Business Account and number. Coexistence keeps your WhatsApp Business App working.
                          </p>
                        </div>
                      </div>
                    </div>

                    <wa-embedded-signup-button (connected)="onWhatsappConnected()" />
                  }

                  @if (directRegistrationEnabled()) {
                    @if (embeddedSignupEnabled()) {
                      <div class="flex items-center gap-3 my-3">
                        <div class="flex-1 h-px bg-gray-200"></div>
                        <span class="text-xs text-gray-400 font-medium">OR</span>
                        <div class="flex-1 h-px bg-gray-200"></div>
                      </div>
                    }
                    <p class="text-sm font-semibold text-gray-900 mb-2">Register without a Facebook account</p>
                    <wa-direct-number-registration (connected)="onWhatsappConnected()" />
                  }

                  @if (!embeddedSignupEnabled() && !directRegistrationEnabled()) {
                    <p-message severity="warn" styleClass="w-full">
                      <span class="text-sm">No WhatsApp connection method is currently enabled. Please contact your administrator.</span>
                    </p-message>
                  }
                </div>
              }

              <!-- Phone Number Management -->
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h3 class="text-base font-semibold text-gray-900">Phone Numbers</h3>
                    <p class="text-sm text-gray-500">Manage your WhatsApp phone numbers</p>
                  </div>
                  <!--
                    TODO(multi-number): Only ONE WhatsApp number is supported for now, so adding
                    additional numbers is disabled. The first number is connected via the
                    "Not connected" card above. Re-enable this "Add Number" button when
                    multiple WhatsApp numbers per tenant are supported.
                  <button pButton label="Add Number" icon="pi pi-plus" class="p-button-sm p-button-outlined"
                    (click)="showAddPhone.set(true)"
                    [disabled]="showAddPhone() || tenantPhones().length > 0"
                    [pTooltip]="tenantPhones().length > 0 ? 'Only one WhatsApp number is supported for now' : ''"></button>
                  -->
                  <span></span>
                </div>

                <!-- Add Phone Number Form -->
                @if (showAddPhone()) {
                  <div class="border border-blue-200 bg-blue-50/50 rounded-xl p-4 mb-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <h4 class="text-sm font-semibold text-gray-900">Add a Phone Number</h4>
                      <button pButton icon="pi pi-times" class="p-button-sm p-button-text p-button-secondary" (click)="closeAddPhone()"></button>
                    </div>

                    <!-- Connect via Embedded Signup (Coexistence) -->
                    @if (addPhonePhase() === 'input') {
                      @if (optionsLoaded() && embeddedSignupEnabled()) {
                        <p class="text-xs text-gray-500">Connect through Meta's secure popup. Pick or create your WhatsApp Business Account and number — coexistence keeps your WhatsApp Business App working.</p>
                        <wa-embedded-signup-button label="Connect WhatsApp Number" (connected)="onWhatsappConnected()" />
                      }

                      @if (directRegistrationEnabled()) {
                        @if (embeddedSignupEnabled()) {
                          <div class="flex items-center gap-3 my-3">
                            <div class="flex-1 h-px bg-gray-200"></div>
                            <span class="text-xs text-gray-400 font-medium">OR</span>
                            <div class="flex-1 h-px bg-gray-200"></div>
                          </div>
                        }
                        <p class="text-xs font-semibold text-gray-700 mb-1">Register without a Facebook account</p>
                        <wa-direct-number-registration (connected)="onWhatsappConnected()" />
                      }

                      @if (!embeddedSignupEnabled() && !directRegistrationEnabled()) {
                        <p class="text-xs text-amber-700">No WhatsApp connection method is currently enabled. Please contact your administrator.</p>
                      }
                    }

                    <!-- Status results -->
                    @if (addPhoneResult()) {
                      <!-- needs_verification: Number registered on Meta, needs OTP -->
                      @if (addPhoneResult()!.status === 'needs_verification') {
                        <p-message severity="info" styleClass="w-full">
                          <div>
                            <p class="font-semibold text-sm">Verification Required</p>
                            <p class="text-xs mt-1">{{ addPhoneResult()!.message }}</p>
                          </div>
                        </p-message>
                      }

                      <!-- registered: Number added and active (no OTP needed) -->
                      @if (addPhoneResult()!.status === 'registered') {
                        <p-message severity="success" styleClass="w-full">
                          <div>
                            <p class="font-semibold text-sm">Number Registered!</p>
                            <p class="text-xs mt-1">{{ addPhoneResult()!.message }}</p>
                          </div>
                        </p-message>
                      }

                      <!-- already_business: Number on WA Business app or another BSP -->
                      @if (addPhoneResult()!.status === 'already_business') {
                        <p-message severity="warn" styleClass="w-full">
                          <div>
                            <p class="font-semibold text-sm">WhatsApp Business Already Active</p>
                            <p class="text-xs mt-1">{{ addPhoneResult()!.message }}</p>
                          </div>
                        </p-message>
                        @if (addPhoneResult()!.instructions?.length) {
                          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p class="text-xs font-semibold text-amber-900 mb-2"><i class="pi pi-info-circle mr-1"></i> How to fix this:</p>
                            <ol class="text-xs text-amber-800 space-y-1 list-decimal pl-4">
                              @for (inst of addPhoneResult()!.instructions!; track inst) {
                                <li>{{ inst }}</li>
                              }
                            </ol>
                          </div>
                        }
                        <button pButton label="I've Removed It — Try Again" icon="pi pi-refresh" severity="warn" class="p-button-sm" [loading]="phoneChecking()" (click)="addPhoneNumber()"></button>
                      }

                      <!-- already_occupied: Number in use by another tenant on our platform -->
                      @if (addPhoneResult()!.status === 'already_occupied') {
                        <p-message severity="error" styleClass="w-full">
                          <div>
                            <p class="font-semibold text-sm">Number Unavailable</p>
                            <p class="text-xs mt-1">{{ addPhoneResult()!.message }}</p>
                          </div>
                        </p-message>
                      }
                    }

                    <!-- Phase: Verify OTP -->
                    @if (addPhonePhase() === 'verify') {
                      <div class="border-t border-blue-200 pt-3 mt-2">
                        <div class="flex items-center gap-2 mb-3">
                          <div class="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
                            <i class="pi pi-key text-amber-600" style="font-size:0.8rem"></i>
                          </div>
                          <div>
                            <p class="text-sm font-semibold text-gray-900">Enter Verification Code</p>
                            <p class="text-xs text-gray-500">A 6-digit code was sent to {{ newPhoneNumber }}</p>
                          </div>
                        </div>

                        <div class="flex gap-2 mb-2">
                          <input
                            pInputText
                            [(ngModel)]="addPhoneVerifyCode"
                            placeholder="123456"
                            class="flex-1"
                            maxlength="6"
                            style="font-size:1.1rem;letter-spacing:0.25em;text-align:center"
                          />
                          <button
                            pButton
                            label="Verify"
                            icon="pi pi-check"
                            severity="success"
                            class="p-button-sm"
                            [loading]="phoneChecking()"
                            [disabled]="addPhoneVerifyCode.length < 6"
                            (click)="verifyAddPhoneCode()"
                          ></button>
                        </div>

                        <div class="flex items-center gap-3 text-xs">
                          <span class="text-gray-400">Didn't receive it?</span>
                          <button
                            class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0 text-xs"
                            [disabled]="phoneChecking()"
                            (click)="resendAddPhoneCode('sms')"
                          >Resend SMS</button>
                          <span class="text-gray-300">|</span>
                          <button
                            class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0 text-xs"
                            [disabled]="phoneChecking()"
                            (click)="resendAddPhoneCode('voice')"
                          >Voice Call</button>
                        </div>
                      </div>
                    }

                    <!-- Phase: Done -->
                    @if (addPhonePhase() === 'done') {
                      <div class="flex justify-end">
                        <button pButton label="Done" icon="pi pi-check" class="p-button-sm" severity="success" (click)="closeAddPhone()"></button>
                      </div>
                    }
                  </div>
                }

                <!-- Existing phone numbers list -->
                @if (tenantPhones().length > 0) {
                  <div class="space-y-2">
                    @for (phone of tenantPhones(); track phone.id) {
                      <div class="flex items-center justify-between border border-gray-200 rounded-xl p-4">
                        <div class="flex items-center gap-3">
                          <div [class]="'w-8 h-8 rounded-full flex items-center justify-center ' + phoneState(phone).bg">
                            <i [class]="phoneState(phone).icon" style="font-size:0.8rem"></i>
                          </div>
                          <div>
                            <p class="text-sm font-semibold text-gray-900">{{ phone.phoneNumber }}</p>
                            <p class="text-xs"
                              [class.text-gray-500]="phone.status === 'active' || phone.status === 'inactive'"
                              [class.text-amber-600]="phone.status === 'pending_verification'"
                              [class.text-blue-600]="phone.status === 'pending_registration'"
                            >{{ phone.status === 'active' ? (phone.displayName || 'WhatsApp Business') : phoneState(phone).hint }}</p>
                          </div>
                        </div>
                        <div class="flex items-center gap-2">
                          <p-tag [value]="phoneState(phone).label" [severity]="phoneState(phone).severity" [pTooltip]="phoneState(phone).hint" />

                          @if (phone.status === 'pending_verification') {
                            <button pButton label="Enter Code" icon="pi pi-key" severity="warn" class="p-button-sm p-button-outlined"
                              (click)="resumeVerification(phone)"></button>
                          }
                          @if (phone.status === 'pending_registration') {
                            <button pButton label="Retry" icon="pi pi-refresh" class="p-button-sm p-button-text"
                              [loading]="retryingId() === phone.id"
                              pTooltip="Retry activation now"
                              (click)="retryActivation(phone)"></button>
                          }
                          @if (phone.status === 'active' || phone.status === 'inactive') {
                            <p-toggleswitch
                              [ngModel]="phone.status === 'active'"
                              (onChange)="togglePhoneStatus(phone)"
                              pTooltip="Toggle active/inactive"
                            />
                          }
                          <button pButton icon="pi pi-trash" class="p-button-sm p-button-text p-button-danger"
                            pTooltip="Remove this number"
                            (click)="askRemovePhone(phone)"></button>
                        </div>
                      </div>
                    }
                  </div>
                } @else if (!showAddPhone()) {
                  <div class="text-center py-6 text-gray-400">
                    <i class="pi pi-phone mb-2" style="font-size:2rem"></i>
                    <p class="text-sm">No phone numbers assigned yet.</p>
                    <p class="text-xs mt-1">Click "Add Number" to connect with Meta via Embedded Signup.</p>
                  </div>
                }
              </div>

              <!-- Admin WhatsApp Number -->
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div class="flex items-center gap-3 mb-4">
                  <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <i class="pi pi-user text-indigo-600" style="font-size:1.1rem"></i>
                  </div>
                  <div>
                    <h3 class="text-base font-semibold text-gray-900">Admin WhatsApp Number</h3>
                    <p class="text-sm text-gray-500">Your personal WhatsApp number to control orders, inventory & payments via chat</p>
                  </div>
                </div>

                @if (adminWaVerified() && adminWaPhone()) {
                  <!-- Verified state -->
                  <div class="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl p-4">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <i class="pi pi-check-circle text-green-600" style="font-size:0.9rem"></i>
                      </div>
                      <div>
                        <p class="text-sm font-semibold text-gray-900">{{ adminWaPhone() }}</p>
                        <p class="text-xs text-green-600">Verified — Admin control active</p>
                      </div>
                    </div>
                    <div class="flex gap-2">
                      <button pButton label="Change" icon="pi pi-pencil" class="p-button-sm p-button-outlined" (click)="startChangeAdminWa()"></button>
                      <button pButton icon="pi pi-trash" class="p-button-sm p-button-text p-button-danger" pTooltip="Remove admin number" (click)="removeAdminWa()"></button>
                    </div>
                  </div>
                } @else {
                  <!-- Not verified — show setup form -->
                  <div class="space-y-3">
                    <p class="text-xs text-gray-500">
                      Register your personal WhatsApp number to receive admin notifications and control your store via WhatsApp messages.
                    </p>

                    @if (!adminWaOtpSent()) {
                      <div class="flex gap-2">
                        <input pInputText [(ngModel)]="adminWaPhoneInput" placeholder="+919876543210" class="flex-1" />
                        <button
                          pButton
                          label="Send OTP"
                          icon="pi pi-whatsapp"
                          severity="success"
                          class="p-button-sm"
                          [loading]="adminWaLoading()"
                          [disabled]="!adminWaPhoneInput.trim()"
                          (click)="sendAdminWaOtp()"
                        ></button>
                      </div>
                    }

                    @if (adminWaOtpSent()) {
                      <p-message severity="info" styleClass="w-full">
                        <div>
                          <p class="font-semibold text-sm">Verification code sent!</p>
                          <p class="text-xs mt-1">Check your WhatsApp messages on {{ adminWaPhoneInput }}</p>
                        </div>
                      </p-message>

                      <div class="flex gap-2">
                        <input
                          pInputText
                          [(ngModel)]="adminWaOtpCode"
                          placeholder="123456"
                          class="flex-1"
                          maxlength="6"
                          style="font-size:1.1rem;letter-spacing:0.25em;text-align:center"
                        />
                        <button
                          pButton
                          label="Verify"
                          icon="pi pi-check"
                          severity="success"
                          class="p-button-sm"
                          [loading]="adminWaLoading()"
                          [disabled]="adminWaOtpCode.length < 6"
                          (click)="verifyAdminWaOtp()"
                        ></button>
                      </div>

                      <div class="flex items-center gap-3 text-xs">
                        <span class="text-gray-400">Didn't receive it?</span>
                        <button
                          class="text-primary-500 hover:underline border-0 bg-transparent cursor-pointer p-0 text-xs"
                          [disabled]="adminWaLoading()"
                          (click)="sendAdminWaOtp()"
                        >Resend Code</button>
                      </div>
                    }

                    @if (adminWaError()) {
                      <p-message severity="error" [text]="adminWaError()!" styleClass="w-full" />
                    }
                  </div>
                }
              </div>

              <!-- Manual config (hidden read-only reference) -->
              <!-- TODO: Re-enable manual WhatsApp config later
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-1">WhatsApp Business API</h3>
                <p class="text-sm text-gray-500 mb-5">Configure your WhatsApp Business API credentials</p>
                <div class="space-y-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">WhatsApp Phone Number</label>
                    <input pInputText [(ngModel)]="wa.phone" placeholder="+91XXXXXXXXXX" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Business Account ID</label>
                    <input pInputText [(ngModel)]="wa.accountId" placeholder="Meta Business Account ID" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Access Token</label>
                    <div class="relative">
                      <input pInputText [(ngModel)]="wa.accessToken" [type]="showToken() ? 'text' : 'password'" placeholder="EAAxxxxxxxx..." class="w-full pr-10" />
                      <button class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" (click)="showToken.update(v => !v)">
                        <i [class]="'pi ' + (showToken() ? 'pi-eye-slash' : 'pi-eye')" style="font-size:0.9rem"></i>
                      </button>
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Webhook Verify Token</label>
                    <input pInputText [(ngModel)]="wa.webhookToken" placeholder="Your webhook verify token" class="w-full" />
                  </div>
                </div>
                <div class="flex gap-3 mt-5">
                  <button pButton label="Test Connection" icon="pi pi-wifi" class="p-button-outlined" (click)="testWA()"></button>
                  <button pButton label="Save Configuration" icon="pi pi-check" severity="success" (click)="save()"></button>
                </div>
              </div>
              -->
            </div>
          </p-tabpanel>

          <!-- Payment settings -->
          <p-tabpanel value="payments">
            <div class="space-y-6 mt-4">
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-5">Bank Accounts / UPI</h3>
                <div class="space-y-4">
                  @for (account of paymentAccounts; track account.id; let i = $index) {
                    <div class="border border-gray-200 rounded-xl p-4 space-y-3 relative">
                      <button class="absolute top-3 right-3 text-gray-400 hover:text-red-500" (click)="removeAccount(i)">
                        <i class="pi pi-trash" style="font-size:0.85rem"></i>
                      </button>
                      <div class="grid grid-cols-2 gap-3">
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-500">Bank Name</label>
                          <input pInputText [(ngModel)]="account.bank" class="w-full" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-500">Account Number</label>
                          <input pInputText [(ngModel)]="account.number" class="w-full" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-500">Account Name</label>
                          <input pInputText [(ngModel)]="account.name" class="w-full" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-500">UPI ID (optional)</label>
                          <input pInputText [(ngModel)]="account.upi" placeholder="yourname@bank" class="w-full" />
                        </div>
                      </div>
                    </div>
                  }
                  <button pButton label="Add Bank Account" icon="pi pi-plus" class="p-button-outlined p-button-sm" (click)="addAccount()"></button>
                </div>
              </div>

              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-4">Order Settings</h3>
                <div class="space-y-3">
                  <div class="flex items-center justify-between py-2">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Auto-confirm orders on payment</p>
                      <p class="text-xs text-gray-500">Automatically confirm orders when payment is verified</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="biz.autoConfirmOrders" />
                  </div>
                  <p-divider />
                  <div class="flex items-center justify-between py-2">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Enable Delivery</p>
                      <p class="text-xs text-gray-500">Allow customers to choose delivery</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="biz.enableDelivery" />
                  </div>
                  <p-divider />
                  <div class="flex items-center justify-between py-2">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Enable Pickup</p>
                      <p class="text-xs text-gray-500">Allow customers to pick up orders</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="biz.enablePickup" />
                  </div>
                </div>
              </div>

              <div class="flex justify-end">
                <button pButton label="Save Payment Settings" icon="pi pi-check" severity="success" (click)="save()"></button>
              </div>
            </div>
          </p-tabpanel>

          <!-- Notifications -->
          <p-tabpanel value="notifications">
            <div class="space-y-6 mt-4">
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-5">Notification Preferences</h3>
                <div class="space-y-4">
                  @for (notif of notifications; track notif.key) {
                    <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p class="text-sm font-medium text-gray-900">{{ notif.label }}</p>
                        <p class="text-xs text-gray-500">{{ notif.desc }}</p>
                      </div>
                      <div class="flex gap-4">
                        <div class="flex flex-col items-center gap-1">
                          <span class="text-xs text-gray-400">Email</span>
                          <p-toggleswitch [(ngModel)]="notif.email" />
                        </div>
                        <div class="flex flex-col items-center gap-1">
                          <span class="text-xs text-gray-400">WhatsApp</span>
                          <p-toggleswitch [(ngModel)]="notif.whatsapp" />
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
              <div class="flex justify-end">
                <button pButton label="Save Notifications" icon="pi pi-check" severity="success" (click)="save()"></button>
              </div>
            </div>
          </p-tabpanel>

          <!-- Commerce -->
          <p-tabpanel value="commerce">
            <div class="space-y-6 mt-4">

              <!-- WhatsApp Commerce Overview -->
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div class="flex items-center gap-3 mb-4">
                  <div class="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <i class="pi pi-shop text-emerald-600" style="font-size:1.2rem"></i>
                  </div>
                  <div>
                    <h3 class="text-base font-semibold text-gray-900">WhatsApp Commerce</h3>
                    <p class="text-sm text-gray-500">Let customers browse, add to cart, and order — all inside WhatsApp</p>
                  </div>
                </div>

                <p-message severity="success" styleClass="w-full mb-4">
                  <div class="text-xs leading-relaxed">
                    Products you add to your catalog on this platform are automatically available to customers on WhatsApp.
                    No Meta account or Commerce Manager needed — everything runs through your store.
                  </div>
                </p-message>
              </div>

              <!-- Feature Toggles -->
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-5">Commerce Features</h3>
                <div class="space-y-1">

                  <div class="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Show Catalog on WhatsApp</p>
                      <p class="text-xs text-gray-500">Customers can browse your product categories and items directly in the chat. Products are pulled from your catalog on this platform.</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="commerce.catalogEnabled" />
                  </div>

                  <div class="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Enable Cart</p>
                      <p class="text-xs text-gray-500">Customers can add products to a cart, view items, update quantities, and clear their cart — all within WhatsApp.</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="commerce.cartEnabled" />
                  </div>

                  <div class="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Enable Ordering</p>
                      <p class="text-xs text-gray-500">Customers can checkout their cart, select a delivery address, and place orders directly from WhatsApp. Orders appear in your Orders dashboard.</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="commerce.orderEnabled" />
                  </div>

                  <div class="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Auto-Confirm Orders</p>
                      <p class="text-xs text-gray-500">Automatically confirm orders without manual review. Turn off if you want to review each order before confirming.</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="commerce.autoCheckout" />
                  </div>

                  <div class="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Order Notifications</p>
                      <p class="text-xs text-gray-500">Automatically send WhatsApp messages to customers when their order status changes (confirmed, shipped, delivered).</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="commerce.orderNotification" />
                  </div>

                  <div class="flex items-center justify-between py-3 border-b border-gray-100">
                    <div class="pr-4">
                      <p class="text-sm font-medium text-gray-900">Abandoned Cart Reminder</p>
                      <p class="text-xs text-gray-500">Remind customers about items left in their cart after this many hours of inactivity. Sent free-form inside an open chat window (never a paid template). Set 0 to disable.</p>
                    </div>
                    <p-inputnumber [(ngModel)]="commerce.abandonedCartHours" [min]="0" [max]="72" [showButtons]="true" suffix=" h" inputStyleClass="w-20" />
                  </div>

                  <div class="flex items-center justify-between py-3 border-b border-gray-100">
                    <div class="pr-4">
                      <p class="text-sm font-medium text-gray-900">Notification Batch Window</p>
                      <p class="text-xs text-gray-500">When a customer is outside the 24h chat window, multiple notifications are grouped and sent as one teaser after this many minutes.</p>
                    </div>
                    <p-inputnumber [(ngModel)]="commerce.batchMinutes" [min]="1" [max]="1440" [showButtons]="true" suffix=" min" inputStyleClass="w-24" />
                  </div>

                  <div class="flex items-center justify-between py-3 border-b border-gray-100">
                    <div class="pr-4">
                      <p class="text-sm font-medium text-gray-900">Force Full Marketing Templates</p>
                      <p class="text-xs text-gray-500">
                        <b>Off (recommended):</b> for offline customers we send one low-cost <i>utility</i> "you have updates" message; the offer is delivered free once they tap — minimum cost.
                        <b>On:</b> always send the full marketing template directly (full reach, but charged at the marketing rate). Either way, customers already chatting get the offer free.
                      </p>
                    </div>
                    <p-toggleswitch [(ngModel)]="commerce.forceMarketingTemplate" />
                  </div>

                  <!-- Invoicing & GST -->
                  <div class="pt-4 mt-2">
                    <p class="text-sm font-semibold text-gray-800 mb-1">🧾 Invoicing & GST</p>
                    <p class="text-xs text-gray-500 mb-3">Used on Tax Invoices, Bills of Supply and Delivery Memos. When an admin confirms an order on WhatsApp, they can issue any of these documents and it's sent to the customer.</p>
                    <div class="bg-gray-50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div class="flex flex-col gap-1 sm:col-span-2">
                        <label class="text-xs font-medium text-gray-600">Legal / Business Name</label>
                        <input pInputText [(ngModel)]="invoice.legalName" placeholder="As registered (e.g. Acme Traders)" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-xs font-medium text-gray-600">GSTIN</label>
                        <input pInputText [(ngModel)]="invoice.gstin" placeholder="e.g. 27ABCDE1234F1Z5" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-xs font-medium text-gray-600">State Code</label>
                        <input pInputText [(ngModel)]="invoice.stateCode" placeholder="e.g. 27" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1 sm:col-span-2">
                        <label class="text-xs font-medium text-gray-600">Business Address</label>
                        <input pInputText [(ngModel)]="invoice.address" placeholder="Registered place of business" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-xs font-medium text-gray-600">State (Place of Supply)</label>
                        <input pInputText [(ngModel)]="invoice.state" placeholder="e.g. Maharashtra" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-xs font-medium text-gray-600">Invoice Prefix</label>
                        <input pInputText [(ngModel)]="invoice.prefix" placeholder="INV" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-xs font-medium text-gray-600">Next Invoice Number</label>
                        <p-inputnumber [(ngModel)]="invoice.nextNumber" [min]="1" [useGrouping]="false" placeholder="Auto" inputStyleClass="w-full" styleClass="w-full" />
                        <small class="text-[11px] text-gray-400">Set this to continue your ERP series. Leave empty to auto-number.</small>
                      </div>
                      <div class="flex flex-col gap-1 sm:col-span-2">
                        <label class="text-xs font-medium text-gray-600">Number Format</label>
                        <input pInputText [(ngModel)]="invoice.numberFormat" placeholder="{{ '{prefix}' }}/{{ '{code}' }}/{{ '{year}' }}/{{ '{seq}' }}" class="w-full" />
                        <small class="text-[11px] text-gray-400">Placeholders: {{ '{prefix}' }} {{ '{code}' }} (INV/BOS/DC) {{ '{year}' }} {{ '{fy}' }} (e.g. 2025-26) {{ '{seq}' }}</small>
                      </div>
                    </div>
                    <p class="text-[11px] text-gray-400 mt-2">GSTIN is required to issue a GST (Tax) Invoice. Bills of Supply and Delivery Memos don't need it. You can also set a custom invoice number per order from the order page to match your ERP exactly.</p>
                  </div>

                  <!-- Advanced: Meta Catalog (collapsible) -->
                  <div class="pt-3">
                    <button class="text-xs text-primary-500 hover:underline bg-transparent border-0 cursor-pointer p-0 flex items-center gap-1"
                      (click)="showAdvancedCommerce = !showAdvancedCommerce">
                      <i [class]="'pi ' + (showAdvancedCommerce ? 'pi-chevron-down' : 'pi-chevron-right')" style="font-size:0.65rem"></i>
                      Advanced: Meta Native Catalog (optional)
                    </button>
                    @if (showAdvancedCommerce) {
                      <div class="mt-3 bg-gray-50 rounded-lg p-4 space-y-3">
                        <p class="text-xs text-gray-500">
                          If you have a Meta Commerce Manager catalog linked to your WhatsApp Business Account, enter the Catalog ID below.
                          This enables WhatsApp's native product browsing UI (richer product cards). Most users don't need this — the platform catalog works great on its own.
                        </p>
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-600">Meta Catalog ID (optional)</label>
                          <input pInputText [(ngModel)]="commerce.catalogId" placeholder="e.g. 123456789012345" class="w-full" />
                        </div>
                      </div>
                    }
                  </div>

                </div>
              </div>

              <!-- How it works -->
              <div class="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <h4 class="text-sm font-semibold text-gray-700 mb-3">How It Works</h4>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <span class="text-emerald-700 font-bold text-sm">1</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-900">Add Products</p>
                      <p class="text-xs text-gray-500">Add your products and categories in the Products section of this platform</p>
                    </div>
                  </div>
                  <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <span class="text-emerald-700 font-bold text-sm">2</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-900">Enable Features</p>
                      <p class="text-xs text-gray-500">Toggle on Catalog, Cart, and Ordering above to activate them on WhatsApp</p>
                    </div>
                  </div>
                  <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <span class="text-emerald-700 font-bold text-sm">3</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-900">Customers Shop</p>
                      <p class="text-xs text-gray-500">Customers type "hi" on WhatsApp, browse products, add to cart, and checkout</p>
                    </div>
                  </div>
                  <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <span class="text-emerald-700 font-bold text-sm">4</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-900">You Fulfill</p>
                      <p class="text-xs text-gray-500">Orders appear in your Orders dashboard. Manage, confirm, and deliver from here.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex justify-end">
                <button pButton label="Save Commerce Settings" icon="pi pi-check" severity="success" (click)="save()"></button>
              </div>
            </div>
          </p-tabpanel>

          <!-- Subscription -->
          <p-tabpanel value="subscription">
            <div class="space-y-6 mt-4">
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="text-base font-semibold text-gray-900">Current Plan</h3>
                    <div class="flex items-center gap-3 mt-3">
                      <span class="text-3xl font-bold text-gray-900">{{ subscriptionPlanName() }}</span>
                      <p-tag [value]="subscriptionStatusLabel()" [severity]="subscriptionStatusSeverity()" />
                    </div>
                    <p class="text-gray-500 text-sm mt-1">{{ subscriptionPriceLabel() }}</p>
                  </div>
                  <button pButton label="Upgrade Plan" icon="pi pi-arrow-up" severity="success" (click)="upgradePlan()"></button>
                </div>

                <p-divider />

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  @for (limit of planLimits(); track limit.label) {
                    <div class="bg-gray-50 rounded-xl p-4">
                      <p class="text-xs text-gray-500">{{ limit.label }}</p>
                      <p class="text-xl font-bold text-gray-900 mt-1">{{ limit.used }}</p>
                      <p class="text-xs text-gray-400">of {{ limit.total }}</p>
                      <div class="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                        <div
                          class="rounded-full h-1.5 transition-all"
                          [class.bg-primary-500]="limit.pct < 80"
                          [class.bg-orange-500]="limit.pct >= 80 && limit.pct < 95"
                          [class.bg-red-500]="limit.pct >= 95"
                          [style.width.%]="limit.pct"
                        ></div>
                      </div>
                    </div>
                  }
                </div>

                <p-divider />

                <h4 class="text-sm font-semibold text-gray-700 mb-3">Included Features</h4>
                <div class="grid grid-cols-2 gap-2">
                  @for (feature of planFeatures(); track feature) {
                    <div class="flex items-center gap-2 text-sm">
                      <i class="pi pi-check-circle text-primary-500"></i>
                      <span class="text-gray-700">{{ feature }}</span>
                    </div>
                  }
                </div>

                <p-divider />

                <div class="bg-gray-50 rounded-xl p-5">
                  <div class="flex items-center justify-between">
                    <div>
                      <h4 class="text-sm font-semibold text-gray-900">Allow Exceed Conversation Limit</h4>
                      <p class="text-xs text-gray-500 mt-1">
                        When enabled, conversations will continue beyond your plan limit.
                        When disabled, new conversations are blocked once the limit is reached.
                      </p>
                    </div>
                    <p-toggleswitch [(ngModel)]="allowExceed" (onChange)="toggleAllowExceed()" />
                  </div>
                </div>
              </div>
            </div>
          </p-tabpanel>

        </p-tabpanels>
      </p-tabs>
    </div>

    <!-- ═══ Remove Number Warning Dialog ═══ -->
    <p-dialog header="Remove this number?" [(visible)]="showRemovePhoneDialog" [modal]="true" [style]="{ width: '32rem' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="bg-red-50 border border-red-200 rounded-lg p-3">
          <p class="text-sm text-red-700">
            <i class="pi pi-exclamation-triangle mr-1"></i>
            This permanently removes <span class="font-semibold">{{ phoneToDelete()?.phoneNumber }}</span> from your account and
            deletes it from our system. This cannot be undone.
          </p>
        </div>
        <ul class="text-xs text-gray-600 space-y-1 list-disc pl-5">
          <li>If it was connected, it will be deregistered from WhatsApp hosting.</li>
          <li>It will be deleted from our database and unassigned from your account.</li>
          <li>To use it here again you'll have to re-register and re-verify with a new OTP.</li>
        </ul>
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p class="text-xs text-amber-800">
            <i class="pi pi-info-circle mr-1"></i>
            <span class="font-semibold">Note:</span> WhatsApp does not allow removing a number from the Business Account via API.
            The number stays listed in WhatsApp Manager until you remove it there (or, if unverified, until Meta auto-expires it) —
            and it can't be used on another account until then.
          </p>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="showRemovePhoneDialog = false" [disabled]="deletingPhone()"></button>
        <button pButton label="Remove & Release" icon="pi pi-trash" severity="danger" (click)="removePhoneNumber()" [loading]="deletingPhone()"></button>
      </ng-template>
    </p-dialog>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);
  private readonly onboardingService = inject(OnboardingService);

  showToken = signal(false);
  allowExceed = false;
  showAdvancedCommerce = false;

  // WhatsApp connection state
  waConnected = computed(() => {
    const tenant = this.authService.tenantInfo();
    return tenant?.hasWhatsAppConfig ?? false;
  });
  waConnecting = signal(false);
  waConnectError = signal<string | null>(null);

  waConnectSuccess = signal<string | null>(null);
  settingsRegisterPhone = '';

  // Admin WhatsApp state
  adminWaPhone = signal<string | null>(null);
  adminWaVerified = signal(false);
  adminWaOtpSent = signal(false);
  adminWaPhoneInput = '';
  adminWaOtpCode = '';
  adminWaLoading = signal(false);
  adminWaError = signal<string | null>(null);

  // Phone number management
  directRegistrationEnabled = signal(false);
  embeddedSignupEnabled = signal(true);
  // Gate rendering until config loads — avoids a flash of Embedded Signup.
  optionsLoaded = signal(false);
  showAddPhone = signal(false);
  newPhoneNumber = '';
  phoneChecking = signal(false);
  addPhoneResult = signal<RegisterNumberResult | null>(null);
  addPhonePhase = signal<'input' | 'verify' | 'done'>('input');
  addPhoneVerifyCode = '';
  addPhoneId = signal<string | null>(null);
  tenantPhones = signal<Array<{ id: string; phoneNumber: string; displayName: string; status: string; registrationStatus?: string; codeVerificationStatus?: string; webhookSubscribed?: boolean }>>([]);
  retryingId = signal<string | null>(null);
  showRemovePhoneDialog = false;
  phoneToDelete = signal<{ id: string; phoneNumber: string } | null>(null);
  deletingPhone = signal(false);

  biz = {
    name: '',
    slug: '',
    description: '',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    orderPrefix: 'ORD-',
    email: '',
    autoConfirmOrders: true,
    enableDelivery: true,
    enablePickup: false,
  };

  commerce = {
    catalogEnabled: false,
    cartEnabled: false,
    orderEnabled: false,
    catalogId: '',
    autoCheckout: false,
    orderNotification: true,
    abandonedCartHours: 3,
    batchMinutes: 60,
    forceMarketingTemplate: false,
  };

  invoice = {
    legalName: '',
    gstin: '',
    stateCode: '',
    address: '',
    state: '',
    prefix: 'INV',
    nextNumber: null as number | null,
    numberFormat: '{prefix}/{code}/{year}/{seq}',
  };

  wa = {
    phone: '',
    accountId: '',
    accessToken: '',
    webhookToken: '',
  };

  paymentAccounts: Array<{ id: number; bank: string; number: string; name: string; upi: string }> = [];
  private accountIdCounter = 1;

  businessHours = [
    { day: 'Mon', enabled: true, open: '09:00', close: '18:00' },
    { day: 'Tue', enabled: true, open: '09:00', close: '18:00' },
    { day: 'Wed', enabled: true, open: '09:00', close: '18:00' },
    { day: 'Thu', enabled: true, open: '09:00', close: '18:00' },
    { day: 'Fri', enabled: true, open: '09:00', close: '17:00' },
    { day: 'Sat', enabled: true, open: '10:00', close: '15:00' },
    { day: 'Sun', enabled: false, open: '10:00', close: '15:00' },
  ];

  notifications = [
    { key: 'new_order', label: 'New Order', desc: 'When a customer places a new order', email: true, whatsapp: true },
    { key: 'payment', label: 'Payment Received', desc: 'When a payment proof is submitted', email: true, whatsapp: true },
    { key: 'low_stock', label: 'Low Stock Alert', desc: 'When a product falls below threshold', email: true, whatsapp: false },
    { key: 'delivery', label: 'Delivery Update', desc: 'When delivery status changes', email: false, whatsapp: true },
    { key: 'campaign', label: 'Campaign Completed', desc: 'When a campaign finishes sending', email: true, whatsapp: false },
    { key: 'customer', label: 'New Customer', desc: 'When a new customer opts in', email: false, whatsapp: false },
  ];

  currencies = [
    { label: 'Indian Rupee (\u20B9)', value: 'INR' },
    { label: 'US Dollar ($)', value: 'USD' },
    { label: 'Nigerian Naira (\u20A6)', value: 'NGN' },
    { label: 'Ghanaian Cedi (\u20B5)', value: 'GHS' },
    { label: 'Kenyan Shilling (KSh)', value: 'KES' },
  ];

  timezones = [
    { label: 'Asia/Kolkata', value: 'Asia/Kolkata' },
    { label: 'Africa/Lagos', value: 'Africa/Lagos' },
    { label: 'Africa/Nairobi', value: 'Africa/Nairobi' },
    { label: 'Africa/Accra', value: 'Africa/Accra' },
    { label: 'UTC', value: 'UTC' },
  ];

  timeSlots = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']
    .map(t => ({ label: t, value: t }));

  // Subscription data from AuthService (populated by /auth/me)
  private subscription = computed(() => this.authService.subscriptionInfo());

  subscriptionPlanName = computed(() => {
    const sub = this.subscription();
    if (!sub) return 'Free';
    // Capitalize plan name
    return sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1);
  });

  subscriptionStatusLabel = computed(() => {
    const sub = this.subscription();
    if (!sub) return 'No Plan';
    const statusMap: Record<string, string> = {
      active: 'Active',
      trialing: 'Trial',
      past_due: 'Past Due',
      canceled: 'Canceled',
      paused: 'Paused',
      unpaid: 'Unpaid',
    };
    return statusMap[sub.status] || sub.status;
  });

  subscriptionStatusSeverity = computed((): 'success' | 'info' | 'warn' | 'danger' | undefined => {
    const sub = this.subscription();
    if (!sub) return 'info';
    const severityMap: Record<string, 'success' | 'info' | 'warn' | 'danger'> = {
      active: 'success',
      trialing: 'info',
      past_due: 'warn',
      canceled: 'danger',
      paused: 'warn',
      unpaid: 'danger',
    };
    return severityMap[sub.status] || 'info';
  });

  subscriptionPriceLabel = computed(() => {
    const sub = this.subscription();
    if (!sub) return 'No active subscription';
    if (sub.validUntil) {
      const renewDate = new Date(sub.validUntil).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
      return `Valid until ${renewDate}`;
    }
    return `${sub.plan} plan`;
  });

  planLimits = computed(() => {
    const sub = this.subscription();
    const pct = (used: number, total: number) => total > 0 ? Math.round((used / total) * 100) : 0;
    const fmt = (n: number) => n.toLocaleString('en-IN');

    if (!sub) {
      return [
        { label: 'Conversations', used: '0', total: '0', pct: 0 },
        { label: 'Products', used: '0', total: '0', pct: 0 },
        { label: 'Campaigns/mo', used: '0', total: '0', pct: 0 },
      ];
    }

    return [
      { label: 'Conversations', used: fmt(sub.conversationsUsed), total: fmt(sub.maxConversations), pct: pct(sub.conversationsUsed, sub.maxConversations) },
      { label: 'Products', used: '-', total: fmt(sub.maxProducts), pct: 0 },
      { label: 'Campaigns/mo', used: '-', total: fmt(sub.maxCampaignsPerMonth), pct: 0 },
    ];
  });

  planFeatures = computed(() => {
    const sub = this.subscription();
    const base = [
      'WhatsApp Messaging',
      'Product Catalog',
      'Order Management',
      'Customer Management',
      'Payment Verification',
    ];
    if (sub && sub.maxConversations > 1000) {
      base.push('Advanced Analytics', 'Workflow Automation');
    }
    if (sub && sub.maxProducts > 100) {
      base.push('Unlimited Products');
    }
    return base;
  });

  ngOnInit() {
    this.loadTenantData();

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

    // Initialize allowExceed from subscription
    const sub = this.authService.subscriptionInfo();
    if (sub) {
      this.allowExceed = sub.allowExceed ?? false;
    }

    // Load phone numbers for this tenant
    this.loadPhoneNumbers();

    // Load admin WhatsApp status
    this.loadAdminWhatsappStatus();

    // Load persisted settings from backend
    // Note: keys arrive as camelCase due to global TransformResponseInterceptor
    this.apiService.get<any>('/settings').subscribe({
      next: (settings) => {
        // Business info
        if (settings.businessName) this.biz.name = settings.businessName;
        if (settings.slug) this.biz.slug = settings.slug;
        if (settings.description) this.biz.description = settings.description;
        if (settings.currency) this.biz.currency = settings.currency;
        if (settings.timezone) this.biz.timezone = settings.timezone;
        if (settings.orderPrefix) this.biz.orderPrefix = settings.orderPrefix;
        if (settings.email) this.biz.email = settings.email;
        if (settings.autoConfirmOrders !== undefined) this.biz.autoConfirmOrders = this.parseBool(settings.autoConfirmOrders);
        if (settings.enableDelivery !== undefined) this.biz.enableDelivery = this.parseBool(settings.enableDelivery);
        if (settings.enablePickup !== undefined) this.biz.enablePickup = this.parseBool(settings.enablePickup);

        // Business hours
        if (settings.businessHours) {
          try {
            const hours = typeof settings.businessHours === 'string'
              ? JSON.parse(settings.businessHours)
              : settings.businessHours;
            if (Array.isArray(hours)) {
              hours.forEach((h: any) => {
                const day = this.businessHours.find(d => d.day === h.day);
                if (day) {
                  day.enabled = h.enabled ?? day.enabled;
                  day.open = h.open ?? day.open;
                  day.close = h.close ?? day.close;
                }
              });
            }
          } catch {}
        }

        // Commerce settings
        if (settings.commerceCatalogEnabled !== undefined) this.commerce.catalogEnabled = this.parseBool(settings.commerceCatalogEnabled);
        if (settings.commerceCartEnabled !== undefined) this.commerce.cartEnabled = this.parseBool(settings.commerceCartEnabled);
        if (settings.commerceOrderEnabled !== undefined) this.commerce.orderEnabled = this.parseBool(settings.commerceOrderEnabled);
        if (settings.commerceCatalogId) this.commerce.catalogId = settings.commerceCatalogId;
        if (settings.commerceAutoCheckout !== undefined) this.commerce.autoCheckout = this.parseBool(settings.commerceAutoCheckout);
        if (settings.commerceOrderNotification !== undefined) this.commerce.orderNotification = this.parseBool(settings.commerceOrderNotification);
        if (settings.commerceAbandonedCartHours !== undefined && settings.commerceAbandonedCartHours !== null) this.commerce.abandonedCartHours = Number(settings.commerceAbandonedCartHours);
        if (settings.notificationBatchMinutes !== undefined && settings.notificationBatchMinutes !== null) this.commerce.batchMinutes = Number(settings.notificationBatchMinutes);
        if (settings.marketingTemplateMode) this.commerce.forceMarketingTemplate = settings.marketingTemplateMode === 'template';
        if (settings.invoiceLegalName !== undefined) this.invoice.legalName = settings.invoiceLegalName || '';
        if (settings.invoiceGstin !== undefined) this.invoice.gstin = settings.invoiceGstin || '';
        if (settings.invoiceStateCode !== undefined) this.invoice.stateCode = String(settings.invoiceStateCode || '');
        if (settings.invoiceAddress !== undefined) this.invoice.address = settings.invoiceAddress || '';
        if (settings.invoiceState !== undefined) this.invoice.state = settings.invoiceState || '';
        if (settings.invoicePrefix) this.invoice.prefix = settings.invoicePrefix;
        if (settings.invoiceNextNumber !== undefined && settings.invoiceNextNumber !== null) this.invoice.nextNumber = Number(settings.invoiceNextNumber);
        if (settings.invoiceNumberFormat) this.invoice.numberFormat = settings.invoiceNumberFormat;

        // WhatsApp config
        if (settings.waPhone) this.wa.phone = settings.waPhone;
        if (settings.waAccountId) this.wa.accountId = settings.waAccountId;
        if (settings.waAccessToken) this.wa.accessToken = settings.waAccessToken;
        if (settings.waWebhookToken) this.wa.webhookToken = settings.waWebhookToken;

        // Payment accounts
        if (settings.paymentAccounts) {
          try {
            const accounts = typeof settings.paymentAccounts === 'string'
              ? JSON.parse(settings.paymentAccounts)
              : settings.paymentAccounts;
            if (Array.isArray(accounts)) {
              this.paymentAccounts = accounts.map((a: any, i: number) => ({
                id: i + 1,
                bank: a.bank || '',
                number: a.number || '',
                name: a.name || '',
                upi: a.upi || '',
              }));
              this.accountIdCounter = this.paymentAccounts.length + 1;
            }
          } catch {}
        }

        // Notifications
        if (settings.notifications) {
          try {
            const notifs = typeof settings.notifications === 'string'
              ? JSON.parse(settings.notifications)
              : settings.notifications;
            if (typeof notifs === 'object' && notifs !== null) {
              this.notifications.forEach(n => {
                if (notifs[n.key]) {
                  n.email = notifs[n.key].email ?? n.email;
                  n.whatsapp = notifs[n.key].whatsapp ?? n.whatsapp;
                }
              });
            }
          } catch {}
        }
      },
      error: () => {
        // Settings endpoint may not exist yet - use defaults
      },
    });
  }

  private applyTenantData() {
    const tenant = this.authService.tenantInfo();
    const user = this.authService.currentUser();

    if (tenant) {
      this.biz.name = tenant.businessName || this.biz.name;
      this.biz.slug = tenant.slug || this.biz.slug;
      this.biz.description = tenant.businessDescription || this.biz.description;
      this.wa.phone = tenant.whatsappPhone || this.wa.phone;
    }

    if (user) {
      this.biz.email = user.email || this.biz.email;
    }
  }

  private loadTenantData() {
    const tenant = this.authService.tenantInfo();
    const user = this.authService.currentUser();

    if (tenant || user) {
      this.applyTenantData();
    } else {
      // Tenant info not loaded yet — rehydrate session
      this.authService.rehydrateSession().subscribe({
        next: () => this.applyTenantData(),
        error: () => {},
      });
    }
  }

  addAccount() {
    this.paymentAccounts.push({ id: this.accountIdCounter++, bank: '', number: '', name: '', upi: '' });
  }

  removeAccount(index: number) {
    this.paymentAccounts.splice(index, 1);
  }

  testWA() {
    this.messageService.add({ severity: 'info', summary: 'Testing...', detail: 'Testing WhatsApp connection...' });
    setTimeout(() => {
      this.messageService.add({ severity: 'success', summary: 'Connected!', detail: 'WhatsApp API connection successful' });
    }, 1500);
  }

  private parseBool(val: any): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val === 'true';
    return !!val;
  }

  save() {
    // Build notifications map
    const notifsMap: Record<string, { email: boolean; whatsapp: boolean }> = {};
    this.notifications.forEach(n => {
      notifsMap[n.key] = { email: n.email, whatsapp: n.whatsapp };
    });

    const settingsToSave: Record<string, any> = {
      // Business info
      business_name: this.biz.name,
      slug: this.biz.slug,
      description: this.biz.description,
      currency: this.biz.currency,
      timezone: this.biz.timezone,
      order_prefix: this.biz.orderPrefix,
      email: this.biz.email,
      auto_confirm_orders: this.biz.autoConfirmOrders,
      enable_delivery: this.biz.enableDelivery,
      enable_pickup: this.biz.enablePickup,
      // Business hours
      business_hours: this.businessHours,
      // Commerce settings
      commerce_catalog_enabled: this.commerce.catalogEnabled,
      commerce_cart_enabled: this.commerce.cartEnabled,
      commerce_order_enabled: this.commerce.orderEnabled,
      commerce_catalog_id: this.commerce.catalogId,
      commerce_auto_checkout: this.commerce.autoCheckout,
      commerce_order_notification: this.commerce.orderNotification,
      commerce_abandoned_cart_hours: Number(this.commerce.abandonedCartHours),
      notification_batch_minutes: Number(this.commerce.batchMinutes),
      marketing_template_mode: this.commerce.forceMarketingTemplate ? 'template' : 'efficient',
      invoice_legal_name: this.invoice.legalName,
      invoice_gstin: this.invoice.gstin,
      invoice_state_code: this.invoice.stateCode,
      invoice_address: this.invoice.address,
      invoice_state: this.invoice.state,
      invoice_prefix: this.invoice.prefix || 'INV',
      invoice_number_format: this.invoice.numberFormat || '{prefix}/{code}/{year}/{seq}',
      ...(this.invoice.nextNumber ? { invoice_next_number: Number(this.invoice.nextNumber) } : {}),
      // WhatsApp config
      wa_phone: this.wa.phone,
      wa_account_id: this.wa.accountId,
      wa_access_token: this.wa.accessToken,
      wa_webhook_token: this.wa.webhookToken,
      // Payment accounts
      payment_accounts: this.paymentAccounts.map(a => ({
        bank: a.bank,
        number: a.number,
        name: a.name,
        upi: a.upi,
      })),
      // Notifications
      notifications: notifsMap,
    };
    this.apiService.put('/settings', settingsToSave).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Settings updated successfully' });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save settings' });
      },
    });
  }

  upgradePlan() {
    this.messageService.add({
      severity: 'info',
      summary: 'Upgrade Plan',
      detail: 'Please contact support to upgrade your subscription plan.',
      life: 5000,
    });
  }

  toggleAllowExceed() {
    this.apiService.put('/settings/allow-exceed', { allowExceed: this.allowExceed }).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Updated',
          detail: this.allowExceed
            ? 'Conversations will continue beyond your plan limit.'
            : 'New conversations will be blocked when limit is reached.',
        });
      },
      error: () => {
        this.allowExceed = !this.allowExceed; // revert on failure
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update setting' });
      },
    });
  }

  /** Register a phone number under the platform's shared WABA (from Settings page) */
  registerNumberFromSettings() {
    this.waConnectError.set(null);
    this.waConnectSuccess.set(null);
    this.waConnecting.set(true);

    this.onboardingService.registerNumber(this.settingsRegisterPhone.trim()).subscribe({
      next: (result) => {
        this.waConnecting.set(false);
        if (result.status === 'registered' || result.status === 'needs_verification') {
          this.waConnectSuccess.set(result.message);
          this.messageService.add({ severity: 'success', summary: result.status === 'needs_verification' ? 'Verification Needed' : 'Registered!', detail: result.message });
          this.settingsRegisterPhone = '';
          this.authService.rehydrateSession().subscribe(() => this.loadPhoneNumbers());
        } else if (result.status === 'already_business') {
          this.waConnectError.set(result.message + (result.instructions?.length ? '\n' + result.instructions.join('\n') : ''));
        } else if (result.status === 'already_occupied') {
          this.waConnectError.set(result.message);
        }
      },
      error: (err) => {
        this.waConnecting.set(false);
        this.waConnectError.set(err?.error?.message || 'Failed to register phone number');
      },
    });
  }

  // COMMENTED OUT: Facebook Embedded Signup (replaced by register-number flow)
  // connectFacebook() { ... }
  // loadFacebookSDK(appId: string): Promise<void> { ... }

  /** Load phone numbers assigned to this tenant */
  private loadPhoneNumbers() {
    this.apiService.get<any[]>('/settings/phones').subscribe({
      next: (phones) => this.tenantPhones.set(phones || []),
      error: () => {},
    });
  }

  /** Called when Embedded Signup connects a number — refresh status + phone list. */
  onWhatsappConnected() {
    this.showAddPhone.set(false);
    this.authService.rehydrateSession().subscribe({
      next: () => this.loadPhoneNumbers(),
      error: () => this.loadPhoneNumbers(),
    });
  }

  /** Map a phone's backend status to an explicit, user-facing activation state. */
  phoneState(phone: { status: string; codeVerificationStatus?: string; webhookSubscribed?: boolean }): {
    label: string; severity: 'success' | 'info' | 'warn' | 'danger' | 'secondary'; icon: string; bg: string; hint: string;
  } {
    switch (phone.status) {
      case 'active':
        return {
          label: 'Active', severity: 'success', icon: 'pi pi-check-circle text-green-600', bg: 'bg-green-100',
          hint: phone.webhookSubscribed === false
            ? 'Active — can send & receive. Finishing webhook setup in the background.'
            : 'Active — can send and receive WhatsApp messages.',
        };
      case 'pending_verification':
        return {
          label: 'Verify Code', severity: 'warn', icon: 'pi pi-key text-amber-600', bg: 'bg-amber-100',
          hint: 'A 6-digit code was sent to this number — enter it to activate.',
        };
      case 'pending_registration':
        return {
          label: 'Activating…', severity: 'info', icon: 'pi pi-spin pi-spinner text-blue-600', bg: 'bg-blue-100',
          hint: 'Setting up on WhatsApp — this retries automatically every few minutes.',
        };
      case 'inactive':
        return {
          label: 'Inactive', severity: 'secondary', icon: 'pi pi-pause-circle text-gray-400', bg: 'bg-gray-100',
          hint: 'Turned off. Toggle to reactivate.',
        };
      default:
        return {
          label: (phone.status || 'unknown').replace(/_/g, ' '), severity: 'secondary',
          icon: 'pi pi-info-circle text-gray-400', bg: 'bg-gray-100', hint: 'Current status.',
        };
    }
  }

  /** Re-open the OTP entry panel for a number stuck at pending verification. */
  resumeVerification(phone: { id: string; phoneNumber: string }) {
    this.showAddPhone.set(true);
    this.newPhoneNumber = phone.phoneNumber;
    this.addPhoneId.set(phone.id);
    this.addPhoneVerifyCode = '';
    this.addPhoneResult.set({ status: 'needs_verification', phone: phone.phoneNumber, message: 'Enter the 6-digit code sent to this number.' });
    this.addPhonePhase.set('verify');
  }

  /** Manually re-run the activation pipeline for a number stuck pending registration. */
  retryActivation(phone: { id: string; phoneNumber: string }) {
    this.retryingId.set(phone.id);
    this.apiService.post<RegisterNumberResult>('/settings/phones', { phone: phone.phoneNumber }).subscribe({
      next: (result) => {
        this.retryingId.set(null);
        if (result.status === 'registered') {
          this.messageService.add({ severity: 'success', summary: 'Activated', detail: result.message });
        } else if (result.status === 'needs_verification') {
          this.messageService.add({ severity: 'info', summary: 'Verification needed', detail: result.message });
          this.showAddPhone.set(true);
          this.newPhoneNumber = phone.phoneNumber;
          this.addPhoneId.set(result.phoneId || phone.id);
          this.addPhoneResult.set(result);
          this.addPhonePhase.set('verify');
        } else {
          this.messageService.add({ severity: 'warn', summary: 'Status', detail: result.message });
        }
        this.loadPhoneNumbers();
        this.authService.rehydrateSession().subscribe();
      },
      error: (err) => {
        this.retryingId.set(null);
        this.messageService.add({ severity: 'error', summary: 'Retry failed', detail: err?.error?.message || 'Could not retry activation' });
      },
    });
  }

  /** Register a phone number — backend registers on Meta and returns detailed status */
  addPhoneNumber() {
    this.phoneChecking.set(true);
    this.addPhoneResult.set(null);

    this.apiService.post<RegisterNumberResult>('/settings/phones', { phone: this.newPhoneNumber.trim() }).subscribe({
      next: (result) => {
        this.phoneChecking.set(false);
        this.addPhoneResult.set(result);

        if (result.status === 'needs_verification') {
          this.addPhoneId.set(result.phoneId || null);
          this.addPhonePhase.set('verify');
        } else if (result.status === 'registered') {
          this.addPhonePhase.set('done');
          this.messageService.add({ severity: 'success', summary: 'Registered!', detail: result.message });
          this.loadPhoneNumbers();
          this.authService.rehydrateSession().subscribe();
        }
        // 'already_business' and 'already_occupied' stay in 'input' phase with message shown
      },
      error: (err) => {
        this.phoneChecking.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to register phone number' });
      },
    });
  }

  /** Verify the OTP code for a newly added phone number */
  verifyAddPhoneCode() {
    const phoneId = this.addPhoneId();
    if (!phoneId || this.addPhoneVerifyCode.length < 6) return;

    this.phoneChecking.set(true);
    this.onboardingService.verifyNumber(phoneId, this.addPhoneVerifyCode).subscribe({
      next: (result) => {
        this.phoneChecking.set(false);
        if (result.verified) {
          this.addPhonePhase.set('done');
          this.addPhoneResult.set({ status: 'registered', phone: this.newPhoneNumber, message: 'Phone number verified and activated!' });
          this.messageService.add({ severity: 'success', summary: 'Verified!', detail: 'Phone number is now active.' });
          this.loadPhoneNumbers();
          this.authService.rehydrateSession().subscribe();
        }
      },
      error: (err) => {
        this.phoneChecking.set(false);
        this.messageService.add({ severity: 'error', summary: 'Verification Failed', detail: err?.error?.message || 'Invalid code. Please try again.' });
      },
    });
  }

  /** Resend verification code via SMS or voice */
  resendAddPhoneCode(method: 'sms' | 'voice') {
    const phoneId = this.addPhoneId();
    if (!phoneId) return;

    this.phoneChecking.set(true);
    this.onboardingService.requestVerificationCode(phoneId, method).subscribe({
      next: (result) => {
        this.phoneChecking.set(false);
        this.messageService.add({ severity: 'success', summary: 'Code Sent', detail: result.message });
      },
      error: (err) => {
        this.phoneChecking.set(false);
        this.messageService.add({ severity: 'error', summary: 'Failed', detail: err?.error?.message || 'Failed to resend code' });
      },
    });
  }

  /** Close/reset the Add Phone panel */
  closeAddPhone() {
    this.showAddPhone.set(false);
    this.newPhoneNumber = '';
    this.addPhoneResult.set(null);
    this.addPhonePhase.set('input');
    this.addPhoneVerifyCode = '';
    this.addPhoneId.set(null);
  }

  /** Toggle a phone number active/inactive */
  togglePhoneStatus(phone: { id: string; status: string }) {
    const newStatus = phone.status === 'active' ? 'inactive' : 'active';
    this.apiService.patch(`/settings/phones/${phone.id}/status`, { status: newStatus }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: newStatus === 'active' ? 'Activated' : 'Deactivated', detail: `Phone number ${newStatus}` });
        this.loadPhoneNumbers();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update phone status' });
      },
    });
  }

  /** Open the warning dialog before removing a number. */
  askRemovePhone(phone: { id: string; phoneNumber: string }) {
    this.phoneToDelete.set({ id: phone.id, phoneNumber: phone.phoneNumber });
    this.showRemovePhoneDialog = true;
  }

  /** Confirm removal: releases the number from Meta/our WABA and deletes it. */
  removePhoneNumber() {
    const target = this.phoneToDelete();
    if (!target) return;
    this.deletingPhone.set(true);
    this.apiService.delete<{ message: string; freed: boolean }>(`/settings/phones/${target.id}`).subscribe({
      next: (res) => {
        this.deletingPhone.set(false);
        this.showRemovePhoneDialog = false;
        this.phoneToDelete.set(null);
        this.messageService.add({
          severity: res?.freed === false ? 'warn' : 'success',
          summary: 'Number removed',
          detail: res?.message || 'Phone number removed and released.',
          life: 6000,
        });
        this.loadPhoneNumbers();
        this.authService.rehydrateSession().subscribe();
      },
      error: (err) => {
        this.deletingPhone.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to remove phone number' });
      },
    });
  }

  // ─── Admin WhatsApp Number ──────────────────────────────────────────────────

  private loadAdminWhatsappStatus() {
    this.apiService.get<{ phone: string | null; verified: boolean }>('/settings/admin-whatsapp').subscribe({
      next: (status) => {
        this.adminWaPhone.set(status.phone);
        this.adminWaVerified.set(status.verified);
        if (status.phone) {
          this.adminWaPhoneInput = status.phone;
        }
      },
      error: () => {},
    });
  }

  sendAdminWaOtp() {
    this.adminWaError.set(null);
    if (!this.adminWaPhoneInput.trim()) return;

    this.adminWaLoading.set(true);
    this.apiService.post<{ sent: boolean; message: string }>('/settings/admin-whatsapp/send-otp', { phone: this.adminWaPhoneInput.trim() }).subscribe({
      next: () => {
        this.adminWaLoading.set(false);
        this.adminWaOtpSent.set(true);
        this.messageService.add({ severity: 'success', summary: 'OTP Sent', detail: 'Check your WhatsApp for the verification code.' });
      },
      error: (err) => {
        this.adminWaLoading.set(false);
        this.adminWaError.set(err?.error?.message || 'Failed to send OTP');
      },
    });
  }

  verifyAdminWaOtp() {
    this.adminWaError.set(null);
    if (this.adminWaOtpCode.length < 6) return;

    this.adminWaLoading.set(true);
    this.apiService.post<{ verified: boolean; message: string }>('/settings/admin-whatsapp/verify-otp', {
      phone: this.adminWaPhoneInput.trim(),
      code: this.adminWaOtpCode,
    }).subscribe({
      next: (result) => {
        this.adminWaLoading.set(false);
        if (result.verified) {
          this.adminWaPhone.set(this.adminWaPhoneInput.trim());
          this.adminWaVerified.set(true);
          this.adminWaOtpSent.set(false);
          this.adminWaOtpCode = '';
          this.messageService.add({ severity: 'success', summary: 'Verified!', detail: 'Admin WhatsApp number verified.' });
        }
      },
      error: (err) => {
        this.adminWaLoading.set(false);
        this.adminWaError.set(err?.error?.message || 'Invalid code. Please try again.');
      },
    });
  }

  startChangeAdminWa() {
    this.adminWaVerified.set(false);
    this.adminWaOtpSent.set(false);
    this.adminWaOtpCode = '';
    this.adminWaPhoneInput = '';
    this.adminWaError.set(null);
  }

  removeAdminWa() {
    this.adminWaLoading.set(true);
    this.apiService.delete('/settings/admin-whatsapp').subscribe({
      next: () => {
        this.adminWaLoading.set(false);
        this.adminWaPhone.set(null);
        this.adminWaVerified.set(false);
        this.adminWaOtpSent.set(false);
        this.adminWaPhoneInput = '';
        this.messageService.add({ severity: 'success', summary: 'Removed', detail: 'Admin WhatsApp number removed.' });
      },
      error: () => {
        this.adminWaLoading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove admin WhatsApp number.' });
      },
    });
  }
}
