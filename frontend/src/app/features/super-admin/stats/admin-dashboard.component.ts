import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';

interface PlatformStat {
  label: string;
  value: string;
  sub: string;
  icon: string;
  iconBg: string;
  change: string;
  changeUp: boolean;
}

interface TenantRow {
  name: string;
  plan: string;
  status: string;
  conversations: number;
  revenue: string;
  joinedAt: string;
}

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
  ],
  template: `
    <div class="p-6 space-y-6">

      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold text-white">Platform Dashboard</h1>
        <p class="text-gray-400 text-sm mt-1">Overview of all tenants and platform performance</p>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-4">
        @for (stat of stats; track stat.label) {
          <div class="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-xs text-gray-400 font-medium">{{ stat.label }}</p>
                <p class="text-2xl font-bold text-white mt-1">{{ stat.value }}</p>
                <p class="text-xs text-gray-500 mt-0.5">{{ stat.sub }}</p>
                <div class="flex items-center gap-1 mt-2">
                  <i [class]="'pi ' + (stat.changeUp ? 'pi-arrow-up text-green-400' : 'pi-arrow-down text-red-400')" style="font-size:0.7rem"></i>
                  <span class="text-xs" [class.text-green-400]="stat.changeUp" [class.text-red-400]="!stat.changeUp">{{ stat.change }}</span>
                </div>
              </div>
              <div [class]="'w-10 h-10 rounded-lg flex items-center justify-center ' + stat.iconBg">
                <i [class]="'pi ' + stat.icon + ' text-white'" style="font-size:1.1rem"></i>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div class="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">Revenue (Last 30 days)</h3>
          <p-chart type="bar" [data]="revenueChartData" [options]="revenueChartOptions" height="220px" />
        </div>
        <div class="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">Tenants by Plan</h3>
          <p-chart type="doughnut" [data]="planChartData" [options]="planChartOptions" height="220px" />
        </div>
      </div>

      <!-- Recent tenants -->
      <div class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 class="text-base font-semibold text-white">Recent Tenants</h3>
          <button pButton label="View All" class="p-button-text p-button-sm text-gray-400" routerLink="/admin/tenants"></button>
        </div>
        <p-table [value]="recentTenants" styleClass="text-sm">
          <ng-template pTemplate="header">
            <tr class="bg-gray-950">
              <th class="text-xs text-gray-500 font-medium">Store</th>
              <th class="text-xs text-gray-500 font-medium">Plan</th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th class="text-xs text-gray-500 font-medium">Conversations</th>
              <th class="text-xs text-gray-500 font-medium">MRR</th>
              <th class="text-xs text-gray-500 font-medium">Joined</th>
              <th class="text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-tenant>
            <tr class="border-t border-gray-800 hover:bg-gray-800/50">
              <td class="font-medium text-white">{{ tenant.name }}</td>
              <td>
                <span class="text-xs bg-primary-900 text-primary-300 px-2 py-0.5 rounded-full font-medium">{{ tenant.plan }}</span>
              </td>
              <td>
                <p-tag [value]="tenant.status" [severity]="getTenantStatusSeverity(tenant.status)" styleClass="text-xs capitalize" />
              </td>
              <td class="text-gray-300">{{ tenant.conversations | number }}</td>
              <td class="font-semibold text-green-400">{{ tenant.revenue }}</td>
              <td class="text-gray-400 text-xs">{{ tenant.joinedAt }}</td>
              <td>
                <div class="flex gap-1">
                  <button pButton icon="pi pi-eye" class="p-button-text p-button-sm p-button-rounded text-gray-400" pTooltip="View"></button>
                  <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm p-button-rounded text-gray-400" pTooltip="Edit"></button>
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class AdminDashboardComponent implements OnInit {
  stats: PlatformStat[] = [
    { label: 'Total Tenants', value: '47', sub: '5 new this month', icon: 'pi-building', iconBg: 'bg-primary-600', change: '+12%', changeUp: true },
    { label: 'Active Subscriptions', value: '42', sub: '3 on trial', icon: 'pi-star', iconBg: 'bg-purple-600', change: '+8%', changeUp: true },
    { label: 'Platform MRR', value: '$8,940', sub: 'Monthly recurring', icon: 'pi-dollar', iconBg: 'bg-green-600', change: '+15%', changeUp: true },
    { label: 'Total Conversations', value: '124,820', sub: 'This month', icon: 'pi-comments', iconBg: 'bg-blue-600', change: '+22%', changeUp: true },
  ];

  recentTenants: TenantRow[] = [
    { name: 'TechGadgets Store', plan: 'Growth', status: 'active', conversations: 847, revenue: '$190', joinedAt: 'May 1, 2026' },
    { name: 'FashionHub NG', plan: 'Professional', status: 'active', conversations: 2134, revenue: '$390', joinedAt: 'Apr 28, 2026' },
    { name: 'QuickMart Abuja', plan: 'Starter', status: 'trialing', conversations: 124, revenue: '$49', joinedAt: 'Apr 25, 2026' },
    { name: 'Lagos Foods Delivery', plan: 'Growth', status: 'active', conversations: 1205, revenue: '$190', joinedAt: 'Apr 20, 2026' },
    { name: 'HealthPlus Pharmacy', plan: 'Enterprise', status: 'active', conversations: 4821, revenue: '$790', joinedAt: 'Apr 15, 2026' },
  ];

  revenueChartData: any = {};
  revenueChartOptions: any = {};
  planChartData: any = {};
  planChartOptions: any = {};

  ngOnInit() {
    this.initCharts();
  }

  private initCharts() {
    const days = Array.from({ length: 30 }, (_, i) => `Apr ${i + 5}`).slice(0, 30);
    const revenue = days.map(() => Math.floor(Math.random() * 1500 + 500));

    this.revenueChartData = {
      labels: days.filter((_, i) => i % 3 === 0),
      datasets: [{
        label: 'Revenue ($)',
        data: revenue.filter((_, i) => i % 3 === 0),
        backgroundColor: 'rgba(37,211,102,0.7)',
        borderRadius: 6,
      }],
    };

    this.revenueChartOptions = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 }, callback: (v: number) => '$' + v } },
      },
    };

    this.planChartData = {
      labels: ['Starter', 'Growth', 'Professional', 'Enterprise'],
      datasets: [{
        data: [8, 22, 12, 5],
        backgroundColor: ['#64748b', '#25D366', '#8b5cf6', '#f59e0b'],
        borderWidth: 0,
      }],
    };

    this.planChartOptions = {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#9ca3af', font: { size: 11 }, padding: 16 } },
      },
      cutout: '65%',
    };
  }

  getTenantStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      active: 'success', suspended: 'danger', pending: 'warn',
      trialing: 'info', deactivated: 'secondary',
    };
    return map[status] ?? 'secondary';
  }
}
