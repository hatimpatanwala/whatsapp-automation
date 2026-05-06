import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { DividerModule } from 'primeng/divider';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'wa-plan-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    FormsModule,
    InputTextModule,
    TextareaModule,
    InputNumberModule,
    SelectModule,
    ButtonModule,
    ToastModule,
    ToggleSwitchModule,
    DividerModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-3xl mx-auto">
      <p-toast />

      <div class="flex items-center gap-4 mb-6">
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded text-gray-400" routerLink="/admin/subscriptions"></button>
        <div>
          <h1 class="text-2xl font-bold text-white">{{ isEdit() ? 'Edit Plan' : 'New Subscription Plan' }}</h1>
          <p class="text-gray-400 text-sm">Define pricing, limits and features</p>
        </div>
      </div>

      <form [formGroup]="planForm" (ngSubmit)="onSubmit()" class="space-y-5">

        <!-- Basic info -->
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">Plan Details</h3>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-300">Plan Name *</label>
                <input pInputText formControlName="name" placeholder="e.g. Growth" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-300">Tier *</label>
                <p-select formControlName="tier" [options]="tierOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Description</label>
              <textarea pTextarea formControlName="description" rows="2" class="w-full" placeholder="Brief plan description..."></textarea>
            </div>
          </div>
        </div>

        <!-- Pricing -->
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">Pricing</h3>

          <!-- Monthly / Yearly -->
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Monthly Price (USD) *</label>
              <p-inputnumber formControlName="monthlyPrice" mode="currency" currency="USD" locale="en-US" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
              <p class="text-xs text-gray-500">Billed every month</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Yearly Price (USD) *</label>
              <p-inputnumber formControlName="yearlyPrice" mode="currency" currency="USD" locale="en-US" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
              <p class="text-xs text-gray-500">
                @if (planForm.get('monthlyPrice')?.value && planForm.get('yearlyPrice')?.value) {
                  Saves {{ calcYearlySavings() }}% vs monthly
                } @else {
                  Billed annually
                }
              </p>
            </div>
          </div>

          <!-- Per-conversation pricing -->
          <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div class="flex items-center justify-between mb-3">
              <div>
                <p class="text-sm font-semibold text-white">Per-Conversation Overage Pricing</p>
                <p class="text-xs text-gray-400">Charge per conversation when limit is exceeded</p>
              </div>
              <p-toggleswitch [(ngModel)]="enableOverage" [ngModelOptions]="{standalone: true}" />
            </div>
            @if (enableOverage) {
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-300">Price per extra conversation (USD cents)</label>
                <p-inputnumber formControlName="pricePerConversation" placeholder="0" [min]="0" styleClass="w-full max-w-48" inputStyleClass="w-full" />
                <p class="text-xs text-gray-400">
                  @if (planForm.get('pricePerConversation')?.value) {
                    = {{ '$' + ((planForm.get('pricePerConversation')?.value ?? 0) / 100).toFixed(4) }} per conversation
                  }
                </p>
              </div>
            }
          </div>
        </div>

        <!-- Limits -->
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-1">Usage Limits</h3>
          <p class="text-xs text-gray-400 mb-4">Leave blank for unlimited</p>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Conversations / month</label>
              <p-inputnumber formControlName="conversationLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Messages / month</label>
              <p-inputnumber formControlName="messageLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Products</label>
              <p-inputnumber formControlName="productLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Campaigns / month</label>
              <p-inputnumber formControlName="campaignLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Team Members</label>
              <p-inputnumber formControlName="userLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
            </div>
          </div>
        </div>

        <!-- Feature flags -->
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">Feature Flags</h3>
          <div class="space-y-3">
            @for (flag of featureFlags; track flag.key) {
              <div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <p class="text-sm font-medium text-gray-200">{{ flag.label }}</p>
                  <p class="text-xs text-gray-400">{{ flag.desc }}</p>
                </div>
                <p-toggleswitch [formControlName]="flag.key" />
              </div>
            }
          </div>
          <div class="mt-4 flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-300">Additional Features (comma-separated)</label>
            <input pInputText formControlName="featuresText" placeholder="Feature 1, Feature 2, Feature 3..." class="w-full" />
          </div>
        </div>

        <!-- Sort order + Status -->
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">Display Settings</h3>
          <div class="flex gap-4 items-center">
            <div class="flex flex-col gap-1 flex-1">
              <label class="text-sm font-medium text-gray-300">Sort Order</label>
              <p-inputnumber formControlName="sortOrder" [min]="1" styleClass="w-full" inputStyleClass="w-full" />
            </div>
            <div class="flex items-center gap-3 pt-5">
              <p-toggleswitch formControlName="isActive" />
              <span class="text-sm text-gray-300">Plan is active & visible</span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-3 pb-8">
          <button pButton type="button" label="Cancel" class="p-button-outlined text-gray-400" routerLink="/admin/subscriptions"></button>
          <button pButton type="submit" [label]="isEdit() ? 'Update Plan' : 'Create Plan'" icon="pi pi-check" severity="success" [loading]="saving()"></button>
        </div>
      </form>
    </div>
  `,
})
export class PlanFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);

  isEdit = signal(false);
  saving = signal(false);
  enableOverage = false;

  tierOptions = [
    { label: 'Starter', value: 'starter' },
    { label: 'Growth', value: 'growth' },
    { label: 'Professional', value: 'professional' },
    { label: 'Enterprise', value: 'enterprise' },
  ];

  featureFlags = [
    { key: 'aiFeatures', label: 'AI Features', desc: 'Chatbot, smart replies, intent detection' },
    { key: 'workflowBuilder', label: 'Workflow Builder', desc: 'Visual automation flow builder' },
    { key: 'advancedAnalytics', label: 'Advanced Analytics', desc: 'In-depth reports and dashboards' },
    { key: 'multiCatalog', label: 'Multi-Catalog', desc: 'Multiple WhatsApp product catalogs' },
  ];

  planForm = this.fb.group({
    name: ['', Validators.required],
    tier: ['starter', Validators.required],
    description: [''],
    monthlyPrice: [null as number | null, [Validators.required, Validators.min(0)]],
    yearlyPrice: [null as number | null, [Validators.required, Validators.min(0)]],
    pricePerConversation: [0],
    conversationLimit: [null as number | null],
    messageLimit: [null as number | null],
    productLimit: [null as number | null],
    campaignLimit: [null as number | null],
    userLimit: [null as number | null],
    featuresText: [''],
    aiFeatures: [false],
    workflowBuilder: [false],
    advancedAnalytics: [false],
    multiCatalog: [false],
    isActive: [true],
    sortOrder: [1],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      // Populate with mock data for edit mode
      this.planForm.patchValue({
        name: 'Growth',
        tier: 'growth',
        description: 'For growing businesses that need more power',
        monthlyPrice: 190,
        yearlyPrice: 1900,
        pricePerConversation: 3,
        conversationLimit: 2000,
        messageLimit: 10000,
        productLimit: 500,
        campaignLimit: 20,
        userLimit: 10,
        featuresText: 'Priority support, Custom branding, CSV exports',
        aiFeatures: false,
        workflowBuilder: true,
        advancedAnalytics: true,
        multiCatalog: false,
        isActive: true,
        sortOrder: 2,
      });
      this.enableOverage = true;
    }
  }

  calcYearlySavings(): number {
    const monthly = this.planForm.get('monthlyPrice')?.value ?? 0;
    const yearly = this.planForm.get('yearlyPrice')?.value ?? 0;
    if (!monthly || !yearly) return 0;
    return Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
  }

  onSubmit() {
    if (this.planForm.invalid) {
      this.planForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    setTimeout(() => {
      this.saving.set(false);
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: this.isEdit() ? 'Plan updated successfully' : 'Plan created successfully',
      });
      setTimeout(() => this.router.navigate(['/admin/subscriptions']), 1200);
    }, 1000);
  }
}
