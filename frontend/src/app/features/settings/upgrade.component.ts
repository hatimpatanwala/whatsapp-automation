import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SubscriptionService } from '../../core/services/subscription.service';
import { FeatureService, FEATURE_KEYS } from '../../core/services/feature.service';
import { SubscriptionPlan } from '../../core/models';

const FEATURE_LABELS: Record<string, string> = {
  deliveries: 'Deliveries',
  customers: 'Customers',
  campaigns: 'Campaigns',
  conversations: 'Conversations',
  whatsappCatalog: 'WhatsApp Catalog',
  workflowBuilder: 'Workflow Builder',
  aiFeatures: 'AI Features',
  advancedAnalytics: 'Advanced Analytics',
  multiCatalog: 'Multi-Catalog',
};

@Component({
  selector: 'wa-upgrade',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ButtonModule,
    TagModule,
    DividerModule,
    ToastModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <p-toast />

      <!-- Header -->
      <div class="text-center mb-8">
        @if (requestedFeature()) {
          <div class="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-4 py-2 mb-4 text-sm">
            <i class="pi pi-lock"></i>
            <span><strong>{{ requestedFeatureLabel() }}</strong> is not included in your current plan</span>
          </div>
        }
        <h1 class="text-2xl font-bold text-gray-900 mb-2">Upgrade Your Plan</h1>
        <p class="text-gray-500">Choose the plan that best fits your business needs</p>
        <p class="text-sm text-gray-400 mt-1">
          Current plan: <span class="font-semibold text-primary-600">{{ featureService.currentPlanName() }}</span>
        </p>
      </div>

      <!-- Plans grid -->
      @if (loading()) {
        <div class="flex justify-center py-12">
          <i class="pi pi-spinner pi-spin text-2xl text-gray-400"></i>
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          @for (plan of plans(); track plan.id) {
            <div
              class="bg-white rounded-xl border-2 overflow-hidden flex flex-col transition-all"
              [class.border-primary-500]="plan.tier === 'growth'"
              [class.shadow-lg]="plan.tier === 'growth'"
              [class.border-gray-200]="plan.tier !== 'growth'"
            >
              @if (plan.tier === 'growth') {
                <div class="bg-primary-500 text-center py-1.5 text-xs font-bold text-white tracking-wider uppercase">Most Popular</div>
              }

              <div class="p-5 flex-1">
                <h3 class="text-lg font-bold text-gray-900 capitalize">{{ plan.name }}</h3>
                <p class="text-xs text-gray-500 mt-0.5 mb-4">{{ plan.description }}</p>

                <!-- Price -->
                <div class="mb-4">
                  <div class="flex items-baseline gap-1">
                    <span class="text-3xl font-bold text-gray-900">{{ formatPrice(plan.monthlyPrice) }}</span>
                    <span class="text-gray-400 text-sm">/mo</span>
                  </div>
                  <p class="text-xs text-gray-400 mt-0.5">{{ formatPrice(plan.yearlyPrice) }}/year</p>
                </div>

                <p-divider />

                <!-- Features included -->
                <div class="space-y-2 mb-4">
                  <p class="text-xs font-semibold text-gray-500 uppercase">Features</p>
                  @for (feat of getFeatureList(plan); track feat.key) {
                    <div class="flex items-center gap-2 text-sm">
                      @if (feat.enabled) {
                        <i class="pi pi-check-circle text-green-500" style="font-size:0.85rem"></i>
                        <span class="text-gray-700" [class.font-semibold]="feat.key === requestedFeature()">{{ feat.label }}</span>
                      } @else {
                        <i class="pi pi-times-circle text-gray-300" style="font-size:0.85rem"></i>
                        <span class="text-gray-400">{{ feat.label }}</span>
                      }
                    </div>
                  }
                </div>

                <!-- Limits -->
                <div class="space-y-1 text-xs text-gray-500">
                  <div class="flex justify-between">
                    <span>Conversations/mo</span>
                    <span class="font-medium text-gray-700">{{ formatLimit(plan, 'conversationLimit') }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Products</span>
                    <span class="font-medium text-gray-700">{{ formatLimit(plan, 'productLimit') }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Team Members</span>
                    <span class="font-medium text-gray-700">{{ formatLimit(plan, 'userLimit') }}</span>
                  </div>
                </div>
              </div>

              <!-- CTA -->
              <div class="p-4 border-t border-gray-100">
                @if (isCurrentPlan(plan)) {
                  <button pButton label="Current Plan" class="w-full" severity="secondary" [disabled]="true"></button>
                } @else if (planHasFeature(plan)) {
                  <button pButton label="Upgrade" icon="pi pi-arrow-up" class="w-full" severity="success" (click)="onUpgrade(plan)"></button>
                } @else {
                  <button pButton label="Select Plan" class="w-full p-button-outlined" (click)="onUpgrade(plan)"></button>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- Back link -->
      <div class="text-center mt-8">
        <a routerLink="/dashboard" class="text-sm text-gray-400 hover:text-primary-500 transition-colors no-underline">
          <i class="pi pi-arrow-left mr-1"></i>Back to Dashboard
        </a>
      </div>
    </div>
  `,
})
export class UpgradeComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly messageService = inject(MessageService);
  readonly featureService = inject(FeatureService);

  plans = signal<SubscriptionPlan[]>([]);
  loading = signal(true);
  requestedFeature = signal<string | null>(null);

  requestedFeatureLabel = computed(() => {
    const feat = this.requestedFeature();
    return feat ? (FEATURE_LABELS[feat] ?? feat) : '';
  });

  ngOnInit() {
    this.requestedFeature.set(
      this.route.snapshot.queryParamMap.get('feature'),
    );
    this.loadPlans();
  }

  private loadPlans() {
    this.subscriptionService.getPublicPlans().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loading.set(false);
      },
      error: () => {
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

  formatLimit(plan: SubscriptionPlan, key: string): string {
    const limits = (plan as any).limits;
    const val = limits?.[key];
    if (val === null || val === undefined) return 'Unlimited';
    return val.toLocaleString();
  }

  getFeatureList(plan: SubscriptionPlan): { key: string; label: string; enabled: boolean }[] {
    const features = (plan as any).features ?? {};
    return Object.keys(FEATURE_LABELS).map((key) => ({
      key,
      label: FEATURE_LABELS[key],
      enabled: features[key] === true,
    }));
  }

  isCurrentPlan(plan: SubscriptionPlan): boolean {
    const currentPlan = this.featureService.currentPlanName();
    return currentPlan.toLowerCase() === plan.name.toLowerCase();
  }

  planHasFeature(plan: SubscriptionPlan): boolean {
    const feat = this.requestedFeature();
    if (!feat) return false;
    const features = (plan as any).features ?? {};
    return features[feat] === true;
  }

  onUpgrade(plan: SubscriptionPlan) {
    this.messageService.add({
      severity: 'info',
      summary: 'Contact Sales',
      detail: `To upgrade to ${plan.name}, please contact our sales team.`,
      life: 5000,
    });
  }
}
