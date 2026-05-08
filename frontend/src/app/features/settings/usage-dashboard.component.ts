import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ProgressBarModule } from 'primeng/progressbar';
import { TagModule } from 'primeng/tag';
import { ChartModule } from 'primeng/chart';
import { DividerModule } from 'primeng/divider';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

interface QuotaStatus {
  used: number;
  limit: number;
  pct: number;
  softLimitReached: boolean;
  hardLimitReached: boolean;
}

interface MonthlyUsage {
  totalConversations: number;
  serviceConversations: number;
  utilityConversations: number;
  marketingConversations: number;
  authenticationConversations: number;
  metaCostTotal: number;
  platformRevenue: number;
  tenantChargeTotal: number;
  overageCount: number;
  overageCharge: number;
  currency: string;
  billingPeriod: string;
}

interface UsageData {
  subscription: {
    plan: string;
    status: string;
    conversationsUsed: number;
    maxConversations: number;
    validUntil: string | null;
  };
  quota?: QuotaStatus;
  monthlyUsage?: MonthlyUsage;
  usage?: {
    total: number;
    byCategory: {
      marketing: number;
      utility: number;
      authentication: number;
      service: number;
    };
    totalCostInr: number;
  };
}

@Component({
  selector: 'app-usage-dashboard',
  standalone: true,
  imports: [CommonModule, CardModule, ProgressBarModule, TagModule, ChartModule, DividerModule],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-surface-900">Usage & Billing</h1>
      <p class="text-surface-500 mt-1">Monitor your conversation usage and costs</p>
    </div>

    @if (data(); as d) {
      <!-- Subscription Overview -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <p-card>
          <div class="text-center">
            <div class="text-sm text-surface-500 mb-2">Plan</div>
            <div class="text-2xl font-bold text-primary capitalize">{{ d.subscription.plan }}</div>
            <p-tag [value]="d.subscription.status" class="mt-2"
                   [severity]="d.subscription.status === 'active' ? 'success' : 'warn'" />
          </div>
        </p-card>

        <p-card>
          <div class="text-center">
            <div class="text-sm text-surface-500 mb-2">Conversations Used</div>
            <div class="text-2xl font-bold">
              {{ d.subscription.conversationsUsed | number }} / {{ d.subscription.maxConversations | number }}
            </div>
            <p-progressBar
              [value]="usagePercentage()"
              [showValue]="true"
              styleClass="mt-3"
            />
          </div>
        </p-card>

        <p-card>
          <div class="text-center">
            <div class="text-sm text-surface-500 mb-2">Estimated Cost (This Month)</div>
            <div class="text-2xl font-bold text-green-600">
              ₹{{ (d.usage?.totalCostInr || 0) | number:'1.2-2' }}
            </div>
            @if (d.subscription.validUntil) {
              <div class="text-xs text-surface-400 mt-2">
                Valid until {{ d.subscription.validUntil | date:'mediumDate' }}
              </div>
            }
          </div>
        </p-card>
      </div>

      <!-- Category Breakdown -->
      @if (d.usage) {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <p-card header="Conversations by Category">
            <div class="flex flex-col gap-4">
              <div class="flex items-center justify-between">
                <span class="text-surface-700">Service</span>
                <span class="font-bold">{{ d.usage.byCategory.service | number }}</span>
              </div>
              <p-progressBar [value]="categoryPct(d.usage.byCategory.service, d.usage.total)" [showValue]="false" />

              <div class="flex items-center justify-between">
                <span class="text-surface-700">Utility</span>
                <span class="font-bold">{{ d.usage.byCategory.utility | number }}</span>
              </div>
              <p-progressBar [value]="categoryPct(d.usage.byCategory.utility, d.usage.total)" [showValue]="false" severity="info" />

              <div class="flex items-center justify-between">
                <span class="text-surface-700">Marketing</span>
                <span class="font-bold">{{ d.usage.byCategory.marketing | number }}</span>
              </div>
              <p-progressBar [value]="categoryPct(d.usage.byCategory.marketing, d.usage.total)" [showValue]="false" severity="warning" />

              <div class="flex items-center justify-between">
                <span class="text-surface-700">Authentication</span>
                <span class="font-bold">{{ d.usage.byCategory.authentication | number }}</span>
              </div>
              <p-progressBar [value]="categoryPct(d.usage.byCategory.authentication, d.usage.total)" [showValue]="false" severity="danger" />
            </div>
          </p-card>

          <p-card header="Cost Breakdown">
            <p-chart type="doughnut" [data]="chartData()" [options]="chartOptions" height="250px" />
          </p-card>
        </div>
      }

      <!-- Enhanced Monthly Usage (from accounting service) -->
      @if (d.monthlyUsage; as mu) {
        <p-divider />
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <p-card>
            <div class="text-center">
              <div class="text-xs text-surface-500">Meta Cost</div>
              <div class="text-lg font-bold text-surface-700">{{ mu.currency }} {{ mu.metaCostTotal | number:'1.2-2' }}</div>
            </div>
          </p-card>
          <p-card>
            <div class="text-center">
              <div class="text-xs text-surface-500">Your Cost</div>
              <div class="text-lg font-bold text-green-600">{{ mu.currency }} {{ mu.tenantChargeTotal | number:'1.2-2' }}</div>
            </div>
          </p-card>
          <p-card>
            <div class="text-center">
              <div class="text-xs text-surface-500">Overage</div>
              <div class="text-lg font-bold" [class.text-red-500]="mu.overageCount > 0" [class.text-surface-400]="!mu.overageCount">
                {{ mu.overageCount | number }} convos
              </div>
            </div>
          </p-card>
          <p-card>
            <div class="text-center">
              <div class="text-xs text-surface-500">Overage Charge</div>
              <div class="text-lg font-bold" [class.text-red-500]="mu.overageCharge > 0" [class.text-surface-400]="!mu.overageCharge">
                {{ mu.currency }} {{ mu.overageCharge | number:'1.2-2' }}
              </div>
            </div>
          </p-card>
        </div>
      }

      <!-- Quota Warnings -->
      @if (data()?.quota?.hardLimitReached) {
        <p-card styleClass="border-red-300 bg-red-50 mb-4">
          <div class="flex items-center gap-3">
            <i class="pi pi-ban text-red-500 text-2xl"></i>
            <div>
              <div class="font-bold text-red-700">Quota Exceeded</div>
              <div class="text-sm text-red-600">
                You've reached your conversation limit ({{ data()?.quota?.used | number }} / {{ data()?.quota?.limit | number }}).
                New conversations may be blocked. Upgrade your plan or contact support.
              </div>
            </div>
          </div>
        </p-card>
      } @else if (data()?.quota?.softLimitReached || usagePercentage() >= 80) {
        <p-card styleClass="border-orange-300 bg-orange-50 mb-4">
          <div class="flex items-center gap-3">
            <i class="pi pi-exclamation-triangle text-orange-500 text-2xl"></i>
            <div>
              <div class="font-bold text-orange-700">Approaching Limit</div>
              <div class="text-sm text-orange-600">
                You've used {{ usagePercentage() }}% of your conversation quota. Consider upgrading your plan.
              </div>
            </div>
          </div>
        </p-card>
      }
    } @else {
      <div class="text-center py-12 text-surface-400">
        <i class="pi pi-spin pi-spinner text-4xl mb-4"></i>
        <p>Loading usage data...</p>
      </div>
    }
  `,
})
export class UsageDashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);

  data = signal<UsageData | null>(null);

  chartOptions = {
    plugins: {
      legend: { position: 'bottom' as const },
    },
    responsive: true,
    maintainAspectRatio: false,
  };

  ngOnInit(): void {
    this.loadUsageData();
  }

  usagePercentage(): number {
    const d = this.data();
    if (!d || !d.subscription.maxConversations) return 0;
    return Math.min(Math.round((d.subscription.conversationsUsed / d.subscription.maxConversations) * 100), 100);
  }

  categoryPct(value: number, total: number): number {
    if (!total) return 0;
    return Math.round((value / total) * 100);
  }

  chartData() {
    const d = this.data();
    if (!d?.usage) return { labels: [], datasets: [] };
    const cat = d.usage.byCategory;
    return {
      labels: ['Service', 'Utility', 'Marketing', 'Authentication'],
      datasets: [{
        data: [cat.service, cat.utility, cat.marketing, cat.authentication],
        backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'],
      }],
    };
  }

  private loadUsageData(): void {
    // Load subscription info from auth/me endpoint
    this.authService.rehydrateSession().subscribe({
      next: (me: any) => {
        const sub = me.tenant?.subscription ?? me.user?.tenant?.subscription;
        const usageData: UsageData = {
          subscription: {
            plan: sub?.plan?.name || sub?.plan || 'trial',
            status: sub?.status || 'active',
            conversationsUsed: sub?.conversationsUsed || 0,
            maxConversations: sub?.plan?.conversationLimit || sub?.maxConversations || 100,
            validUntil: sub?.currentPeriodEnd || sub?.validUntil || null,
          },
        };
        this.data.set(usageData);

        // Load detailed usage and quota from accounting service
        this.api.get<{ usage: MonthlyUsage | null; quota: QuotaStatus }>('/settings/usage').subscribe({
          next: (result) => {
            const current = this.data();
            if (current) {
              const updated = { ...current, quota: result.quota };
              if (result.usage) {
                updated.monthlyUsage = result.usage;
                updated.usage = {
                  total: result.usage.totalConversations,
                  byCategory: {
                    marketing: result.usage.marketingConversations,
                    utility: result.usage.utilityConversations,
                    authentication: result.usage.authenticationConversations,
                    service: result.usage.serviceConversations,
                  },
                  totalCostInr: Number(result.usage.tenantChargeTotal),
                };
              }
              this.data.set(updated);
            }
          },
          error: () => {
            // Accounting service may not be available — silently ignore
          },
        });
      },
    });
  }
}
