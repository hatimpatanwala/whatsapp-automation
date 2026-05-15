import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../../core/services/api.service';
import { TenantService } from '../../../core/services/tenant.service';

@Component({
  selector: 'wa-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ChartModule,
    TableModule,
    TagModule,
    ButtonModule,
    TooltipModule,
  ],
  template: `
    <div class="p-6 space-y-6">

      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Platform Dashboard</h1>
        <p class="text-sm mt-1 text-gray-500">Overview of all tenants and platform performance</p>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        @for (stat of stats(); track stat.label) {
          <div class="rounded-xl p-5 bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">{{ stat.label }}</p>
                <p class="text-3xl font-bold text-gray-900 mt-2">{{ stat.value }}</p>
                <p class="text-xs mt-1 text-gray-400">{{ stat.sub }}</p>
              </div>
              <div [class]="'w-11 h-11 rounded-xl flex items-center justify-center ' + stat.iconBg">
                <i [class]="'pi ' + stat.icon + ' text-white'" style="font-size:1.15rem"></i>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div class="rounded-xl p-6 bg-white border border-gray-200 shadow-sm">
          <h3 class="text-sm font-semibold uppercase tracking-wider mb-4 text-gray-500">Tenants by Status</h3>
          @if (allTenants().length) {
            <div style="min-height:250px">
              <p-chart type="doughnut" [data]="statusChartData()" [options]="chartOptions" height="250px" />
            </div>
          } @else {
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
              <i class="pi pi-chart-pie" style="font-size:2.5rem"></i>
              <p class="mt-3 text-sm">No tenant data available</p>
            </div>
          }
        </div>
        <div class="rounded-xl p-6 bg-white border border-gray-200 shadow-sm">
          <h3 class="text-sm font-semibold uppercase tracking-wider mb-4 text-gray-500">Onboarding Progress</h3>
          @if (allTenants().length) {
            <div style="min-height:250px">
              <p-chart type="doughnut" [data]="onboardingChartData()" [options]="chartOptions" height="250px" />
            </div>
          } @else {
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
              <i class="pi pi-chart-pie" style="font-size:2.5rem"></i>
              <p class="mt-3 text-sm">No tenant data available</p>
            </div>
          }
        </div>
      </div>

      <!-- Recent tenants -->
      <div class="rounded-xl overflow-hidden bg-white border border-gray-200 shadow-sm">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">Recent Tenants</h3>
          <button pButton label="View All" class="p-button-text p-button-sm text-gray-500" routerLink="/admin/tenants"></button>
        </div>
        <p-table [value]="recentTenants()" [loading]="loading()" styleClass="text-sm">
          <ng-template pTemplate="header">
            <tr class="bg-gray-50">
              <th class="text-xs text-gray-500 font-medium">Store</th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th class="text-xs text-gray-500 font-medium">Onboarding</th>
              <th class="text-xs text-gray-500 font-medium">WhatsApp</th>
              <th class="text-xs text-gray-500 font-medium">Joined</th>
              <th class="text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-tenant>
            <tr class="border-t border-gray-100 hover:bg-gray-50">
              <td>
                <div>
                  <p class="font-medium text-gray-900">{{ tenant.name || tenant.businessName || 'Unnamed' }}</p>
                  <p class="text-xs text-gray-500">&#64;{{ tenant.slug }}</p>
                </div>
              </td>
              <td>
                <p-tag [value]="tenant.status" [severity]="getTenantStatusSeverity(tenant.status)" styleClass="text-xs capitalize" />
              </td>
              <td>
                <p-tag [value]="tenant.onboardingStatus || 'pending'" [severity]="tenant.onboardingStatus === 'completed' ? 'success' : 'warn'" styleClass="text-xs capitalize" />
              </td>
              <td class="text-gray-600 text-xs">{{ tenant.whatsappPhone || '—' }}</td>
              <td class="text-gray-500 text-xs">{{ tenant.createdAt | date:'mediumDate' }}</td>
              <td>
                <div class="flex gap-1">
                  <button pButton icon="pi pi-eye" class="p-button-text p-button-sm p-button-rounded text-gray-500" pTooltip="View" [routerLink]="['/admin/tenants', tenant.id, 'view']"></button>
                  <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm p-button-rounded text-gray-500" pTooltip="Edit" [routerLink]="['/admin/tenants', tenant.id, 'edit']"></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="6" class="text-center py-8 text-gray-500">
                <i class="pi pi-building" style="font-size:2rem"></i>
                <p class="mt-2">No tenants yet</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class AdminDashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tenantService = inject(TenantService);

  loading = signal(true);
  allTenants = signal<any[]>([]);

  stats = signal([
    { label: 'Total Tenants', value: '0', sub: '', icon: 'pi-building', iconBg: 'bg-primary-600' },
    { label: 'Active', value: '0', sub: '', icon: 'pi-check-circle', iconBg: 'bg-green-600' },
    { label: 'Suspended', value: '0', sub: '', icon: 'pi-ban', iconBg: 'bg-red-600' },
    { label: 'Pending Onboarding', value: '0', sub: '', icon: 'pi-clock', iconBg: 'bg-blue-600' },
  ]);

  recentTenants = signal<any[]>([]);

  statusChartData = signal<any>({ labels: [], datasets: [] });
  onboardingChartData = signal<any>({ labels: [], datasets: [] });

  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#6b7280', font: { size: 11 }, padding: 16 } },
    },
    cutout: '65%',
  };

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    this.loading.set(true);

    this.tenantService.getAll().subscribe({
      next: (res) => {
        const list: any[] = Array.isArray(res) ? res : (res as any).data || [];
        this.allTenants.set(list);

        const active = list.filter(t => t.status === 'active').length;
        const suspended = list.filter(t => t.status === 'suspended').length;
        const pending = list.filter(t => t.status === 'pending').length;
        const onboardingPending = list.filter(t => t.onboardingStatus !== 'completed').length;
        // Trial is determined by subscription plan, not tenant status
        const trialing = list.filter(t => t.subscriptions?.[0]?.plan === 'trial').length;

        this.stats.set([
          { label: 'Total Tenants', value: list.length.toString(), sub: `${trialing} on trial`, icon: 'pi-building', iconBg: 'bg-primary-600' },
          { label: 'Active', value: active.toString(), sub: 'Currently active', icon: 'pi-check-circle', iconBg: 'bg-green-600' },
          { label: 'Suspended', value: suspended.toString(), sub: 'Access restricted', icon: 'pi-ban', iconBg: 'bg-red-600' },
          { label: 'Pending Onboarding', value: onboardingPending.toString(), sub: 'Needs setup', icon: 'pi-clock', iconBg: 'bg-blue-600' },
        ]);

        this.recentTenants.set(
          [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
        );

        this.statusChartData.set({
          labels: ['Active', 'Suspended', 'Trial', 'Pending'],
          datasets: [{
            data: [active - trialing, suspended, trialing, pending],
            backgroundColor: ['#25D366', '#ef4444', '#3b82f6', '#64748b'],
            borderWidth: 0,
          }],
        });

        const completed = list.filter(t => t.onboardingStatus === 'completed').length;
        const inProgress = list.filter(t => t.onboardingStatus === 'in_progress').length;
        const notStarted = list.filter(t => !t.onboardingStatus || t.onboardingStatus === 'pending').length;

        this.onboardingChartData.set({
          labels: ['Completed', 'In Progress', 'Pending'],
          datasets: [{
            data: [completed, inProgress, notStarted],
            backgroundColor: ['#25D366', '#f59e0b', '#64748b'],
            borderWidth: 0,
          }],
        });

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  getTenantStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      active: 'success', suspended: 'danger', pending: 'warn',
      trialing: 'info', deactivated: 'secondary',
    };
    return map[status] ?? 'secondary';
  }
}
