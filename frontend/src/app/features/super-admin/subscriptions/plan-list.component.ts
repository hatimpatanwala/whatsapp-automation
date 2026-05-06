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

interface Plan {
  id: string;
  name: string;
  tier: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  pricePerConversation: number;
  conversationLimit: number | null;
  messageLimit: number | null;
  productLimit: number | null;
  campaignLimit: number | null;
  userLimit: number | null;
  features: string[];
  aiFeatures: boolean;
  workflowBuilder: boolean;
  advancedAnalytics: boolean;
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
          <h1 class="text-2xl font-bold text-white">Subscription Plans</h1>
          <p class="text-gray-400 text-sm">Manage pricing tiers and features</p>
        </div>
        <button pButton label="New Plan" icon="pi pi-plus" severity="success" routerLink="new"></button>
      </div>

      <!-- Plans grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        @for (plan of plans(); track plan.id) {
          <div
            class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden flex flex-col"
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
                  <h3 class="text-lg font-bold text-white capitalize">{{ plan.name }}</h3>
                  <p class="text-xs text-gray-400 mt-0.5">{{ plan.description }}</p>
                </div>
                <p-tag [value]="plan.isActive ? 'Active' : 'Inactive'" [severity]="plan.isActive ? 'success' : 'secondary'" styleClass="text-xs" />
              </div>

              <!-- Pricing -->
              <div class="mb-4">
                <div class="flex items-baseline gap-1">
                  <span class="text-3xl font-bold text-white">{{ '$' + plan.monthlyPrice }}</span>
                  <span class="text-gray-400 text-sm">/mo</span>
                </div>
                <p class="text-xs text-gray-500 mt-0.5">{{ '$' + plan.yearlyPrice }}/year (save {{ getYearlySavings(plan) }}%)</p>
                @if (plan.pricePerConversation > 0) {
                  <div class="mt-2 bg-gray-800 rounded-lg p-2 text-xs">
                    <span class="text-gray-400">+ {{ '$' + (plan.pricePerConversation / 100).toFixed(3) }}</span>
                    <span class="text-gray-500"> per extra conversation</span>
                  </div>
                }
              </div>

              <p-divider styleClass="border-gray-800" />

              <!-- Limits -->
              <div class="space-y-2 mb-4">
                <div class="flex justify-between text-xs">
                  <span class="text-gray-400">Conversations/mo</span>
                  <span class="text-white font-medium">{{ plan.conversationLimit ? (plan.conversationLimit | number) : '∞ Unlimited' }}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-gray-400">Products</span>
                  <span class="text-white font-medium">{{ plan.productLimit ? (plan.productLimit | number) : '∞ Unlimited' }}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-gray-400">Campaigns/mo</span>
                  <span class="text-white font-medium">{{ plan.campaignLimit ?? '∞' }}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-gray-400">Team Members</span>
                  <span class="text-white font-medium">{{ plan.userLimit ?? '∞' }}</span>
                </div>
              </div>

              <!-- Feature tags -->
              <div class="flex flex-wrap gap-1.5 mb-4">
                @if (plan.workflowBuilder) {
                  <span class="text-xs bg-purple-900/50 text-purple-300 border border-purple-800 px-2 py-0.5 rounded-full">Workflow Builder</span>
                }
                @if (plan.aiFeatures) {
                  <span class="text-xs bg-blue-900/50 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full">AI Features</span>
                }
                @if (plan.advancedAnalytics) {
                  <span class="text-xs bg-orange-900/50 text-orange-300 border border-orange-800 px-2 py-0.5 rounded-full">Advanced Analytics</span>
                }
              </div>

              <!-- Tenant count -->
              <div class="text-xs text-gray-500 flex items-center gap-1.5">
                <i class="pi pi-building"></i>
                <span>{{ plan.tenantCount }} {{ plan.tenantCount === 1 ? 'tenant' : 'tenants' }}</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="border-t border-gray-800 p-4 flex gap-2">
              <button pButton label="Edit" icon="pi pi-pencil" class="p-button-outlined p-button-sm flex-1 text-gray-300" [routerLink]="[plan.id, 'edit']"></button>
              <button
                pButton
                [icon]="plan.isActive ? 'pi pi-eye-slash' : 'pi pi-eye'"
                class="p-button-text p-button-sm p-button-rounded text-gray-400"
                [pTooltip]="plan.isActive ? 'Deactivate' : 'Activate'"
                (click)="togglePlan(plan)"
              ></button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class PlanListComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  plans = signal<Plan[]>([]);

  private mockPlans: Plan[] = [
    {
      id: '1', name: 'Starter', tier: 'starter', description: 'Perfect for small businesses',
      monthlyPrice: 49, yearlyPrice: 499, pricePerConversation: 5,
      conversationLimit: 500, messageLimit: 2000, productLimit: 100, campaignLimit: 5, userLimit: 3,
      features: ['WhatsApp Inbox', 'Basic Orders', 'Payment Verification', 'Inventory', 'Email Support'],
      aiFeatures: false, workflowBuilder: false, advancedAnalytics: false, isActive: true, tenantCount: 8, sortOrder: 1,
    },
    {
      id: '2', name: 'Growth', tier: 'growth', description: 'For growing businesses',
      monthlyPrice: 190, yearlyPrice: 1900, pricePerConversation: 3,
      conversationLimit: 2000, messageLimit: 10000, productLimit: 500, campaignLimit: 20, userLimit: 10,
      features: ['All Starter features', 'Campaigns', 'Segments', 'Workflow Builder', 'Priority Support'],
      aiFeatures: false, workflowBuilder: true, advancedAnalytics: true, isActive: true, tenantCount: 22, sortOrder: 2,
    },
    {
      id: '3', name: 'Professional', tier: 'professional', description: 'Advanced features for scaling',
      monthlyPrice: 390, yearlyPrice: 3900, pricePerConversation: 2,
      conversationLimit: 5000, messageLimit: 30000, productLimit: 2000, campaignLimit: null, userLimit: 25,
      features: ['All Growth features', 'AI Features', 'Multi-catalog', 'Custom Reports', 'API Access', '24/7 Support'],
      aiFeatures: true, workflowBuilder: true, advancedAnalytics: true, isActive: true, tenantCount: 12, sortOrder: 3,
    },
    {
      id: '4', name: 'Enterprise', tier: 'enterprise', description: 'Unlimited for large operations',
      monthlyPrice: 790, yearlyPrice: 7900, pricePerConversation: 1,
      conversationLimit: null, messageLimit: null, productLimit: null, campaignLimit: null, userLimit: null,
      features: ['All Professional features', 'Unlimited everything', 'Custom integrations', 'Dedicated support', 'SLA guarantee'],
      aiFeatures: true, workflowBuilder: true, advancedAnalytics: true, isActive: true, tenantCount: 5, sortOrder: 4,
    },
  ];

  ngOnInit() {
    this.plans.set(this.mockPlans);
  }

  getYearlySavings(plan: Plan): number {
    const monthly12 = plan.monthlyPrice * 12;
    return Math.round(((monthly12 - plan.yearlyPrice) / monthly12) * 100);
  }

  togglePlan(plan: Plan) {
    plan.isActive = !plan.isActive;
    this.plans.update(plans => [...plans]);
    this.messageService.add({ severity: 'info', summary: 'Plan Updated', detail: `${plan.name} is now ${plan.isActive ? 'active' : 'inactive'}` });
  }
}
