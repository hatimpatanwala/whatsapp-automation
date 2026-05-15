import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { TenantService } from '../../../core/services/tenant.service';

@Component({
  selector: 'wa-admin-billing',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    CardModule,
    ButtonModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 space-y-6">
      <p-toast />

      <div>
        <h1 class="text-2xl font-bold text-gray-900">Billing Overview</h1>
        <p class="text-gray-500 text-sm mt-1">Platform-wide subscription and revenue overview</p>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white shadow-sm rounded-xl p-5 border border-gray-200">
          <p class="text-xs text-gray-500 font-medium">Active Subscriptions</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ stats().activeSubscriptions }}</p>
        </div>
        <div class="bg-white shadow-sm rounded-xl p-5 border border-gray-200">
          <p class="text-xs text-gray-500 font-medium">Trial Subscriptions</p>
          <p class="text-2xl font-bold text-blue-600 mt-1">{{ stats().trialSubscriptions }}</p>
        </div>
        <div class="bg-white shadow-sm rounded-xl p-5 border border-gray-200">
          <p class="text-xs text-gray-500 font-medium">Expired</p>
          <p class="text-2xl font-bold text-orange-600 mt-1">{{ stats().expiredSubscriptions }}</p>
        </div>
        <div class="bg-white shadow-sm rounded-xl p-5 border border-gray-200">
          <p class="text-xs text-gray-500 font-medium">Total Tenants</p>
          <p class="text-2xl font-bold text-green-600 mt-1">{{ stats().totalTenants }}</p>
        </div>
      </div>

      <!-- Tenants with usage -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">Tenant Subscription Status</h3>
        </div>
        <p-table [value]="tenants()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="text-sm">
          <ng-template pTemplate="header">
            <tr class="bg-gray-50">
              <th class="text-xs text-gray-500 font-medium">Tenant</th>
              <th class="text-xs text-gray-500 font-medium">Plan</th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th class="text-xs text-gray-500 font-medium">Conversations Used</th>
              <th class="text-xs text-gray-500 font-medium">Onboarding</th>
              <th class="text-xs text-gray-500 font-medium">Joined</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-tenant>
            <tr class="border-t border-gray-200 hover:bg-gray-50">
              <td>
                <div>
                  <p class="font-semibold text-gray-900">{{ tenant.name || tenant.businessName || 'Unnamed' }}</p>
                  <p class="text-xs text-gray-500">{{ tenant.slug }}</p>
                </div>
              </td>
              <td>
                <span class="text-xs bg-primary-900 text-primary-300 px-2.5 py-1 rounded-full font-medium capitalize">
                  {{ tenant.subscriptions?.[0]?.plan || 'No plan' }}
                </span>
              </td>
              <td>
                <p-tag [value]="tenant.status" [severity]="getStatusSeverity(tenant.status)" styleClass="text-xs capitalize" />
              </td>
              <td class="text-gray-600">
                {{ tenant.subscriptions?.[0]?.conversationsUsed || 0 }}
                @if (tenant.subscriptions?.[0]?.maxConversations) {
                  <span class="text-gray-500 text-xs"> / {{ tenant.subscriptions[0].maxConversations }}</span>
                }
              </td>
              <td>
                <p-tag [value]="tenant.onboardingStatus" [severity]="tenant.onboardingStatus === 'completed' ? 'success' : 'warn'" styleClass="text-xs capitalize" />
              </td>
              <td class="text-gray-500 text-xs">{{ tenant.createdAt | date:'mediumDate' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="6" class="text-center py-12 text-gray-500">
                <i class="pi pi-credit-card" style="font-size:2.5rem"></i>
                <p class="mt-3">No tenants found</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class AdminBillingComponent implements OnInit {
  private readonly tenantService = inject(TenantService);

  loading = signal(true);
  tenants = signal<any[]>([]);
  stats = signal({
    activeSubscriptions: 0,
    trialSubscriptions: 0,
    expiredSubscriptions: 0,
    totalTenants: 0,
  });

  ngOnInit() {
    this.loadTenants();
  }

  loadTenants() {
    this.loading.set(true);
    this.tenantService.getAll().subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res as any).data || [];
        this.tenants.set(list);
        this.stats.set({
          totalTenants: list.length,
          activeSubscriptions: list.filter((t: any) => t.status === 'active').length,
          trialSubscriptions: list.filter((t: any) => t.subscriptions?.[0]?.plan === 'trial').length,
          expiredSubscriptions: list.filter((t: any) => t.status === 'deactivated' || t.status === 'suspended').length,
        });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      active: 'success', trialing: 'info', suspended: 'danger',
      pending: 'warn', deactivated: 'secondary',
    };
    return map[status] ?? 'secondary';
  }
}
