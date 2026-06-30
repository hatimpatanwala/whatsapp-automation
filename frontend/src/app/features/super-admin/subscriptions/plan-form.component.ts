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
import { SubscriptionService } from '../../../core/services/subscription.service';

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
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded text-gray-500" routerLink="/admin/subscriptions"></button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ isEdit() ? 'Edit Plan' : 'New Subscription Plan' }}</h1>
          <p class="text-gray-500 text-sm">Define pricing, limits and features</p>
        </div>
      </div>

      @if (loadingPlan()) {
        <div class="flex justify-center py-12">
          <i class="pi pi-spinner pi-spin text-2xl text-gray-500"></i>
        </div>
      } @else {
        <form [formGroup]="planForm" (ngSubmit)="onSubmit()" class="space-y-5">

          <!-- Basic info -->
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Plan Details</h3>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Plan Name *</label>
                  <input pInputText formControlName="name" placeholder="e.g. Growth" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Tier *</label>
                  <p-select formControlName="tier" [options]="tierOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Description</label>
                <textarea pTextarea formControlName="description" rows="2" class="w-full" placeholder="Brief plan description..."></textarea>
              </div>
            </div>
          </div>

          <!-- Pricing -->
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Pricing (USD cents)</h3>

            <!-- Monthly / Yearly -->
            <div class="grid grid-cols-2 gap-4 mb-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Monthly Price (cents) *</label>
                <p-inputnumber formControlName="monthlyPrice" [min]="0" placeholder="e.g. 4900 = $49" styleClass="w-full" inputStyleClass="w-full" />
                <p class="text-xs text-gray-400">
                  @if (planForm.get('monthlyPrice')?.value) {
                    = {{ '$' + ((planForm.get('monthlyPrice')?.value ?? 0) / 100).toFixed(2) }}/mo
                  }
                </p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Yearly Price (cents) *</label>
                <p-inputnumber formControlName="yearlyPrice" [min]="0" placeholder="e.g. 49900 = $499" styleClass="w-full" inputStyleClass="w-full" />
                <p class="text-xs text-gray-400">
                  @if (planForm.get('monthlyPrice')?.value && planForm.get('yearlyPrice')?.value) {
                    = {{ '$' + ((planForm.get('yearlyPrice')?.value ?? 0) / 100).toFixed(2) }}/yr — saves {{ calcYearlySavings() }}%
                  }
                </p>
              </div>
            </div>

            <!-- Per-conversation pricing -->
            <div class="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <p class="text-sm font-semibold text-gray-900">Per-Conversation Overage Pricing</p>
                  <p class="text-xs text-gray-400">Charge per conversation when limit is exceeded</p>
                </div>
                <p-toggleswitch [(ngModel)]="enableOverage" [ngModelOptions]="{standalone: true}" />
              </div>
              @if (enableOverage) {
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Price per extra conversation (USD cents)</label>
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
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <h3 class="text-base font-semibold text-gray-900 mb-1">Usage Limits</h3>
            <p class="text-xs text-gray-400 mb-4">Leave blank for unlimited</p>

            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Conversations / month</label>
                <p-inputnumber formControlName="conversationLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Messages / month</label>
                <p-inputnumber formControlName="messageLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Products</label>
                <p-inputnumber formControlName="productLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Campaigns / month</label>
                <p-inputnumber formControlName="campaignLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Team Members</label>
                <p-inputnumber formControlName="userLimit" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
              </div>
            </div>
          </div>

          <!-- Feature flags -->
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Feature Access</h3>
            <p class="text-xs text-gray-400 mb-4">Toggle which features tenants on this plan can access</p>
            <div class="space-y-3">
              @for (flag of featureFlags; track flag.key) {
                <div class="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                  <div>
                    <p class="text-sm font-medium text-gray-700">{{ flag.label }}</p>
                    <p class="text-xs text-gray-400">{{ flag.desc }}</p>
                  </div>
                  <p-toggleswitch [formControlName]="flag.key" />
                </div>
              }
            </div>
          </div>

          <!-- Sort order + Status -->
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Display Settings</h3>
            <div class="flex gap-4 items-center">
              <div class="flex flex-col gap-1 flex-1">
                <label class="text-sm font-medium text-gray-700">Sort Order</label>
                <p-inputnumber formControlName="sortOrder" [min]="1" styleClass="w-full" inputStyleClass="w-full" />
              </div>
              <div class="flex items-center gap-3 pt-5">
                <p-toggleswitch formControlName="isActive" />
                <span class="text-sm text-gray-700">Plan is active & visible</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-3 pb-8">
            <button pButton type="button" label="Cancel" class="p-button-outlined" routerLink="/admin/subscriptions"></button>
            <button pButton type="submit" [label]="isEdit() ? 'Update Plan' : 'Create Plan'" icon="pi pi-check" severity="success" [loading]="saving()"></button>
          </div>
        </form>
      }
    </div>
  `,
})
export class PlanFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);
  private readonly subscriptionService = inject(SubscriptionService);

  isEdit = signal(false);
  saving = signal(false);
  loadingPlan = signal(false);
  enableOverage = false;

  tierOptions = [
    { label: 'Trial', value: 'trial' },
    { label: 'Starter', value: 'starter' },
    { label: 'Growth', value: 'growth' },
    { label: 'Professional', value: 'professional' },
    { label: 'Enterprise', value: 'enterprise' },
    { label: 'Custom', value: 'custom' },
  ];

  featureFlags = [
    { key: 'deliveries', label: 'Deliveries', desc: 'Delivery tracking and courier management' },
    { key: 'customers', label: 'Customers', desc: 'Customer management, segments and tagging' },
    { key: 'campaigns', label: 'Campaigns', desc: 'Broadcast, drip and triggered campaigns' },
    { key: 'conversations', label: 'Conversations', desc: 'WhatsApp inbox and chat management' },
    { key: 'quotes', label: 'Quotes', desc: 'Create and manage customer quotes' },
    { key: 'whatsappCatalog', label: 'WhatsApp Catalog', desc: 'WhatsApp product catalog sync' },
    { key: 'workflowBuilder', label: 'Workflow Builder', desc: 'Visual automation flow builder' },
    { key: 'aiFeatures', label: 'AI Features', desc: 'Chatbot, smart replies, intent detection' },
    { key: 'advancedAnalytics', label: 'Advanced Analytics', desc: 'In-depth reports and dashboards' },
    { key: 'multiCatalog', label: 'Multi-Catalog', desc: 'Multiple WhatsApp product catalogs' },
    // ── ERP / Business Suite (single switch for the whole suite) ───────────
    { key: 'erp', label: 'ERP — Business Suite', desc: 'Full ERP: invoicing, accounting, CRM, procurement, inventory, POS, GST, HR' },
  ];

  planForm = this.fb.group({
    name: ['', Validators.required],
    tier: ['starter', Validators.required],
    description: [''],
    monthlyPrice: [null as number | null, [Validators.required, Validators.min(0)]],
    yearlyPrice: [null as number | null, [Validators.required, Validators.min(0)]],
    pricePerConversation: [0],
    // Limits
    conversationLimit: [null as number | null],
    messageLimit: [null as number | null],
    productLimit: [null as number | null],
    campaignLimit: [null as number | null],
    userLimit: [null as number | null],
    // Feature flags
    deliveries: [true],
    customers: [true],
    campaigns: [false],
    conversations: [true],
    whatsappCatalog: [false],
    workflowBuilder: [false],
    aiFeatures: [false],
    advancedAnalytics: [false],
    multiCatalog: [false],
    // ERP / Business Suite (single switch)
    erp: [false],
    // Display
    isActive: [true],
    sortOrder: [1],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.loadPlan(id);
    }
  }

  private loadPlan(id: string) {
    this.loadingPlan.set(true);
    this.subscriptionService.getPlanById(id).subscribe({
      next: (plan: any) => {
        this.planForm.patchValue({
          name: plan.name,
          tier: plan.tier,
          description: plan.description,
          monthlyPrice: plan.monthlyPrice,
          yearlyPrice: plan.yearlyPrice,
          pricePerConversation: plan.pricePerConversation,
          // Limits from JSONB
          conversationLimit: plan.limits?.conversationLimit ?? null,
          messageLimit: plan.limits?.messageLimit ?? null,
          productLimit: plan.limits?.productLimit ?? null,
          campaignLimit: plan.limits?.campaignLimit ?? null,
          userLimit: plan.limits?.userLimit ?? null,
          // Feature flags from JSONB
          deliveries: plan.features?.deliveries ?? false,
          customers: plan.features?.customers ?? false,
          campaigns: plan.features?.campaigns ?? false,
          conversations: plan.features?.conversations ?? false,
          whatsappCatalog: plan.features?.whatsappCatalog ?? false,
          workflowBuilder: plan.features?.workflowBuilder ?? false,
          aiFeatures: plan.features?.aiFeatures ?? false,
          advancedAnalytics: plan.features?.advancedAnalytics ?? false,
          multiCatalog: plan.features?.multiCatalog ?? false,
          // ERP / Business Suite (single switch)
          erp: plan.features?.erp ?? false,
          // Display
          isActive: plan.isActive,
          sortOrder: plan.sortOrder,
        });
        this.enableOverage = (plan.pricePerConversation ?? 0) > 0;
        this.loadingPlan.set(false);
      },
      error: () => {
        this.loadingPlan.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load plan',
        });
      },
    });
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

    const v = this.planForm.value;

    const payload: any = {
      name: v.name,
      tier: v.tier,
      description: v.description,
      monthlyPrice: v.monthlyPrice,
      yearlyPrice: v.yearlyPrice,
      pricePerConversation: this.enableOverage ? (v.pricePerConversation ?? 0) : 0,
      limits: {
        conversationLimit: v.conversationLimit ?? null,
        messageLimit: v.messageLimit ?? null,
        productLimit: v.productLimit ?? null,
        campaignLimit: v.campaignLimit ?? null,
        userLimit: v.userLimit ?? null,
      },
      features: {
        deliveries: v.deliveries ?? false,
        customers: v.customers ?? false,
        campaigns: v.campaigns ?? false,
        conversations: v.conversations ?? false,
        whatsappCatalog: v.whatsappCatalog ?? false,
        workflowBuilder: v.workflowBuilder ?? false,
        aiFeatures: v.aiFeatures ?? false,
        advancedAnalytics: v.advancedAnalytics ?? false,
        multiCatalog: v.multiCatalog ?? false,
        erp: v.erp ?? false,
        // Mirror the single ERP switch onto the legacy sub-flags so any code still
        // reading them stays consistent (the suite is all-or-nothing now).
        erpInvoicing: v.erp ?? false,
        erpCrm: v.erp ?? false,
        erpProcurement: v.erp ?? false,
        erpHr: v.erp ?? false,
      },
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    };

    const id = this.route.snapshot.paramMap.get('id');

    const request$ = this.isEdit()
      ? this.subscriptionService.updatePlan(id!, payload)
      : this.subscriptionService.createPlan(payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: this.isEdit() ? 'Plan updated successfully' : 'Plan created successfully',
        });
        setTimeout(() => this.router.navigate(['/admin/subscriptions']), 1200);
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to save plan',
        });
      },
    });
  }
}
