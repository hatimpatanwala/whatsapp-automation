import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DividerModule } from 'primeng/divider';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { SubscriptionService } from '../../../core/services/subscription.service';

interface Plan {
  id: string;
  name: string;
  tier: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  pricePerConversation: number;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
  isActive: boolean;
  tenantCount: number;
  sortOrder: number;
}

@Component({
  selector: 'wa-plan-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    DividerModule,
    TooltipModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />
      <p-confirmDialog />

      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Subscription Plans</h1>
          <p class="text-gray-500 text-sm">Manage pricing tiers and features</p>
        </div>
        <button pButton label="New Plan" icon="pi pi-plus" severity="success" routerLink="new"></button>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-12">
          <i class="pi pi-spinner pi-spin text-2xl text-gray-500"></i>
        </div>
      } @else if (!plans().length) {
        <!-- Empty state -->
        <div class="text-center py-20">
          <div class="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i class="pi pi-star text-gray-500" style="font-size:2.5rem"></i>
          </div>
          <h3 class="text-lg font-semibold text-gray-900">No Subscription Plans</h3>
          <p class="text-gray-500 text-sm mt-1 mb-4">Create your first plan to manage tenant subscriptions</p>
          <button pButton label="Create First Plan" icon="pi pi-plus" severity="success" routerLink="new"></button>
        </div>
      } @else {
        <!-- Plans grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          @for (plan of plans(); track plan.id) {
            <div
              class="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden flex flex-col"
              [class.border-primary-500]="plan.tier === 'growth'"
              [class.ring-1]="plan.tier === 'growth'"
              [class.ring-primary-500/30]="plan.tier === 'growth'"
            >
              @if (plan.tier === 'growth') {
                <div class="bg-primary-500 text-center py-1 text-xs font-bold text-white tracking-wider uppercase">Most Popular</div>
              }
              <div class="p-5 flex-1">
                <div class="flex items-start justify-between mb-4">
                  <div>
                    <h3 class="text-lg font-bold text-gray-900 capitalize">{{ plan.name }}</h3>
                    <p class="text-[13px] text-gray-500 mt-1 leading-snug">{{ plan.description }}</p>
                  </div>
                  <p-tag [value]="plan.isActive ? 'Active' : 'Inactive'" [severity]="plan.isActive ? 'success' : 'secondary'" styleClass="text-xs" />
                </div>

                <!-- Pricing -->
                <div class="mb-4">
                  <div class="flex items-baseline gap-1">
                    <span class="text-3xl font-bold text-gray-900">{{ formatPrice(plan.monthlyPrice) }}</span>
                    <span class="text-gray-500 text-sm">/mo</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5">{{ formatPrice(plan.yearlyPrice) }}/year (save {{ getYearlySavings(plan) }}%)</p>
                  @if (plan.pricePerConversation > 0) {
                    <div class="mt-2 bg-gray-100 rounded-lg p-2 text-xs">
                      <span class="text-gray-600">+ {{ formatPriceCents(plan.pricePerConversation) }}</span>
                      <span class="text-gray-500"> per extra conversation</span>
                    </div>
                  }
                </div>

                <p-divider styleClass="border-gray-200" />

                <!-- Limits -->
                <div class="space-y-2 mb-4">
                  <div class="flex justify-between text-xs">
                    <span class="text-gray-500">Conversations/mo</span>
                    <span class="text-gray-900 font-medium">{{ formatLimit(plan.limits?.['conversationLimit']) }}</span>
                  </div>
                  <div class="flex justify-between text-xs">
                    <span class="text-gray-500">Products</span>
                    <span class="text-gray-900 font-medium">{{ formatLimit(plan.limits?.['productLimit']) }}</span>
                  </div>
                  <div class="flex justify-between text-xs">
                    <span class="text-gray-500">Campaigns/mo</span>
                    <span class="text-gray-900 font-medium">{{ formatLimit(plan.limits?.['campaignLimit']) }}</span>
                  </div>
                  <div class="flex justify-between text-xs">
                    <span class="text-gray-500">Team Members</span>
                    <span class="text-gray-900 font-medium">{{ formatLimit(plan.limits?.['userLimit']) }}</span>
                  </div>
                </div>

                <!-- Feature tags -->
                <div class="flex flex-wrap gap-1.5 mb-4">
                  @if (plan.features?.['workflowBuilder']) {
                    <span class="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">Workflow Builder</span>
                  }
                  @if (plan.features?.['aiFeatures']) {
                    <span class="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">AI Features</span>
                  }
                  @if (plan.features?.['advancedAnalytics']) {
                    <span class="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">Advanced Analytics</span>
                  }
                  @if (plan.features?.['campaigns']) {
                    <span class="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Campaigns</span>
                  }
                  @if (plan.features?.['multiCatalog']) {
                    <span class="text-xs bg-pink-50 text-pink-700 border border-pink-200 px-2 py-0.5 rounded-full">Multi-Catalog</span>
                  }
                </div>

                <!-- Tenant count -->
                <div class="text-xs text-gray-500 flex items-center gap-1.5">
                  <i class="pi pi-building"></i>
                  <span>{{ plan.tenantCount }} {{ plan.tenantCount === 1 ? 'tenant' : 'tenants' }}</span>
                </div>
              </div>

              <!-- Actions -->
              <div class="border-t border-gray-200 p-4 flex gap-2">
                <button pButton label="Edit" icon="pi pi-pencil" class="p-button-outlined p-button-sm flex-1" [routerLink]="[plan.id, 'edit']"></button>
                <button
                  pButton
                  [icon]="plan.isActive ? 'pi pi-eye-slash' : 'pi pi-eye'"
                  class="p-button-text p-button-sm p-button-rounded"
                  [pTooltip]="plan.isActive ? 'Deactivate' : 'Activate'"
                  [loading]="togglingId() === plan.id"
                  (click)="togglePlan(plan)"
                ></button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PlanListComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly subscriptionService = inject(SubscriptionService);

  plans = signal<Plan[]>([]);
  loading = signal(true);
  togglingId = signal<string | null>(null);

  ngOnInit() {
    this.loadPlans();
  }

  private loadPlans() {
    this.loading.set(true);
    this.subscriptionService.getPlans().subscribe({
      next: (plans: any[]) => {
        this.plans.set(plans);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load plans',
        });
      },
    });
  }

  formatPrice(cents: number): string {
    return '$' + (cents / 100).toFixed(0);
  }

  formatPriceCents(cents: number): string {
    return '$' + (cents / 100).toFixed(3);
  }

  formatLimit(val: number | null | undefined): string {
    if (val === null || val === undefined) return '∞ Unlimited';
    return val.toLocaleString();
  }

  getYearlySavings(plan: Plan): number {
    const monthly12 = plan.monthlyPrice * 12;
    if (!monthly12) return 0;
    return Math.round(((monthly12 - plan.yearlyPrice) / monthly12) * 100);
  }

  togglePlan(plan: Plan) {
    this.togglingId.set(plan.id);
    this.subscriptionService.togglePlanActive(plan.id, !plan.isActive).subscribe({
      next: () => {
        plan.isActive = !plan.isActive;
        this.plans.update(plans => [...plans]);
        this.togglingId.set(null);
        this.messageService.add({
          severity: 'info',
          summary: 'Plan Updated',
          detail: `${plan.name} is now ${plan.isActive ? 'active' : 'inactive'}`,
        });
      },
      error: () => {
        this.togglingId.set(null);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to update plan',
        });
      },
    });
  }
}
