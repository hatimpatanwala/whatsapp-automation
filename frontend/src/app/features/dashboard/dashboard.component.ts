import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SkeletonModule } from 'primeng/skeleton';
import { BadgeModule } from 'primeng/badge';
import { forkJoin } from 'rxjs';

import { OrderService } from '../../core/services/order.service';
import { exportToCsv } from '../../core/utils/csv-export';
import { ApiService } from '../../core/services/api.service';
import { Order, OrderStats, InventoryItem } from '../../core/models';

interface StatCard {
  label: string;
  value: string;
  change: string;
  changeType: 'up' | 'down' | 'neutral';
  icon: string;
  iconBg: string;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  customer: string;
  amount: string;
  status: 'pending' | 'confirmed' | 'completed' | 'canceled';
  date: string;
}

interface LowStockItem {
  name: string;
  sku: string;
  stock: number;
  threshold: number;
}

@Component({
  selector: 'wa-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ChartModule,
    TableModule,
    TagModule,
    ButtonModule,
    CardModule,
    SkeletonModule,
    BadgeModule,
  ],
  template: `
    <div class="p-6 space-y-6">

      <!-- Page header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p class="text-gray-500 text-sm mt-1">Welcome back! Here's what's happening today.</p>
        </div>
        <div class="flex gap-2">
          <button pButton label="Export" icon="pi pi-download" class="p-button-outlined p-button-sm" [disabled]="!recentOrders.length" (click)="exportCsv()"></button>
          <button pButton label="New Order" icon="pi pi-plus" class="p-button-sm" severity="success" routerLink="/orders"></button>
        </div>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        @if (loading()) {
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p-skeleton width="60%" height="1rem" styleClass="mb-2" />
              <p-skeleton width="40%" height="2rem" styleClass="mb-2" />
              <p-skeleton width="50%" height="0.75rem" />
            </div>
          }
        } @else {
          @for (stat of stats; track stat.label) {
            <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div class="flex items-center justify-between">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">{{ stat.label }}</p>
                <div [class]="'flex items-center justify-center w-10 h-10 rounded-xl shadow-sm ' + stat.iconBg">
                  <i [class]="'pi ' + stat.icon + ' text-white'" style="font-size:1.05rem"></i>
                </div>
              </div>
              <p class="text-[1.75rem] leading-none font-bold text-gray-900 mt-4 tabular-nums">{{ stat.value }}</p>
              <div class="flex items-center gap-1.5 mt-3">
                <span
                  class="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md"
                  [class.bg-green-50]="stat.changeType === 'up'" [class.text-green-700]="stat.changeType === 'up'"
                  [class.bg-red-50]="stat.changeType === 'down'" [class.text-red-600]="stat.changeType === 'down'"
                  [class.bg-gray-100]="stat.changeType === 'neutral'" [class.text-gray-500]="stat.changeType === 'neutral'"
                >
                  <i [class]="'pi ' + (stat.changeType === 'up' ? 'pi-arrow-up-right' : stat.changeType === 'down' ? 'pi-arrow-down-right' : 'pi-minus')" style="font-size:0.6rem"></i>
                  {{ stat.change }}
                </span>
                <span class="text-xs text-gray-400">vs yesterday</span>
              </div>
            </div>
          }
        }
      </div>

      <!-- Charts + Low Stock -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <!-- Revenue chart -->
        <div class="xl:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-base font-semibold text-gray-900">Revenue Overview</h3>
              <p class="text-sm text-gray-500">Last {{ chartDays }} days</p>
            </div>
            <div class="flex gap-1">
              <button pButton label="7D" class="p-button-sm text-xs" [outlined]="chartDays === 7" [text]="chartDays !== 7" [severity]="chartDays === 7 ? 'success' : 'secondary'" (click)="setChartPeriod(7)"></button>
              <button pButton label="30D" class="p-button-sm text-xs" [outlined]="chartDays === 30" [text]="chartDays !== 30" [severity]="chartDays === 30 ? 'success' : 'secondary'" (click)="setChartPeriod(30)"></button>
            </div>
          </div>
          <p-chart type="line" [data]="revenueChartData" [options]="revenueChartOptions" height="260px" />
        </div>

        <!-- Low stock alerts -->
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-semibold text-gray-900">Low Stock Alerts</h3>
            <span class="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">{{ lowStockItems.length }}</span>
          </div>
          <div class="space-y-3">
            @if (lowStockLoading()) {
              @for (i of [1, 2, 3]; track i) {
                <div class="p-3 bg-gray-50 rounded-lg">
                  <p-skeleton width="70%" height="1rem" styleClass="mb-1" />
                  <p-skeleton width="40%" height="0.75rem" />
                </div>
              }
            } @else if (lowStockItems.length === 0) {
              <div class="text-center py-6">
                <i class="pi pi-check-circle text-green-400 text-2xl mb-2"></i>
                <p class="text-sm text-gray-500">All items are well stocked</p>
              </div>
            } @else {
              @for (item of lowStockItems; track item.sku) {
                <div class="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">{{ item.name }}</p>
                    <p class="text-xs text-gray-500">SKU: {{ item.sku }}</p>
                  </div>
                  <div class="text-right ml-3">
                    <span class="text-sm font-bold text-red-600">{{ item.stock }}</span>
                    <p class="text-xs text-gray-400">/ {{ item.threshold }} min</p>
                  </div>
                </div>
              }
            }
            <button pButton label="View Inventory" class="p-button-text p-button-sm w-full mt-2" icon="pi pi-arrow-right" iconPos="right" routerLink="/inventory"></button>
          </div>
        </div>
      </div>

      <!-- Recent orders table -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 class="text-base font-semibold text-gray-900">Recent Orders</h3>
          <button pButton label="View all" class="p-button-text p-button-sm" icon="pi pi-arrow-right" iconPos="right" routerLink="/orders"></button>
        </div>
        @if (ordersLoading()) {
          <div class="p-6 space-y-3">
            @for (i of [1, 2, 3, 4, 5]; track i) {
              <p-skeleton width="100%" height="2.5rem" />
            }
          </div>
        } @else if (recentOrders.length === 0) {
          <div class="text-center py-12">
            <i class="pi pi-inbox text-gray-300 text-4xl mb-3"></i>
            <p class="text-sm text-gray-500">No orders yet</p>
            <p class="text-xs text-gray-400 mt-1">Orders will appear here once created</p>
          </div>
        } @else {
          <p-table [value]="recentOrders" [rows]="5" styleClass="text-sm">
            <ng-template pTemplate="header">
              <tr>
                <th class="text-xs text-gray-500 font-medium">Order</th>
                <th class="text-xs text-gray-500 font-medium">Customer</th>
                <th class="text-xs text-gray-500 font-medium">Amount</th>
                <th class="text-xs text-gray-500 font-medium">Status</th>
                <th class="text-xs text-gray-500 font-medium">Date</th>
                <th></th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-order>
              <tr class="hover:bg-gray-50">
                <td class="font-medium text-primary-600">{{ order.orderNumber }}</td>
                <td class="text-gray-700">{{ order.customer }}</td>
                <td class="font-semibold text-gray-900">{{ order.amount }}</td>
                <td>
                  <p-tag
                    [value]="order.status"
                    [severity]="getOrderSeverity(order.status)"
                    styleClass="text-xs capitalize"
                  />
                </td>
                <td class="text-gray-500 text-xs">{{ order.date }}</td>
                <td>
                  <button pButton icon="pi pi-eye" class="p-button-text p-button-sm p-button-rounded" [routerLink]="['/orders', order.id]"></button>
                </td>
              </tr>
            </ng-template>
          </p-table>
        }
      </div>

    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly apiService = inject(ApiService);

  loading = signal(true);
  ordersLoading = signal(true);
  lowStockLoading = signal(true);

  stats: StatCard[] = [];
  lowStockItems: LowStockItem[] = [];
  recentOrders: RecentOrder[] = [];
  revenueChartData: any = {};
  revenueChartOptions: any = {};
  chartDays = 7;

  ngOnInit() {
    this.initChart();
    this.loadStats();
    this.loadRecentOrders();
    this.loadLowStock();
  }

  exportCsv() {
    exportToCsv('dashboard-recent-orders', this.recentOrders, [
      { key: 'orderNumber', header: 'Order #' },
      { key: 'customer', header: 'Customer' },
      { key: 'amount', header: 'Amount' },
      { key: 'status', header: 'Status' },
      { key: 'date', header: 'Date' },
    ]);
  }

  private loadStats(): void {
    this.loading.set(true);
    this.orderService.getStats().subscribe({
      next: (stats: OrderStats) => {
        this.stats = [
          {
            label: 'Total Revenue',
            value: '\u20B9' + this.formatNumber(stats.totalRevenue),
            change: '\u20B9' + this.formatNumber(stats.revenueToday) + ' today',
            changeType: stats.revenueToday > 0 ? 'up' : 'neutral',
            icon: 'pi-dollar',
            iconBg: 'bg-primary-500',
          },
          {
            label: 'Total Orders',
            value: this.formatNumber(stats.totalOrders),
            change: stats.ordersToday + ' today',
            changeType: stats.ordersToday > 0 ? 'up' : 'neutral',
            icon: 'pi-shopping-cart',
            iconBg: 'bg-blue-500',
          },
          {
            label: 'Pending Orders',
            value: this.formatNumber(stats.pendingOrders),
            change: stats.pendingOrders > 0 ? stats.pendingOrders + ' awaiting' : 'None',
            changeType: stats.pendingOrders > 0 ? 'down' : 'neutral',
            icon: 'pi-credit-card',
            iconBg: 'bg-orange-500',
          },
          {
            label: 'Avg Order Value',
            value: '\u20B9' + this.formatNumber(stats.averageOrderValue),
            change: stats.completedOrders + ' completed',
            changeType: stats.completedOrders > 0 ? 'up' : 'neutral',
            icon: 'pi-users',
            iconBg: 'bg-purple-500',
          },
        ];
        this.loading.set(false);
      },
      error: () => {
        this.stats = [
          { label: 'Total Revenue', value: '\u20B90', change: 'No data', changeType: 'neutral', icon: 'pi-dollar', iconBg: 'bg-primary-500' },
          { label: 'Total Orders', value: '0', change: 'No data', changeType: 'neutral', icon: 'pi-shopping-cart', iconBg: 'bg-blue-500' },
          { label: 'Pending Orders', value: '0', change: 'No data', changeType: 'neutral', icon: 'pi-credit-card', iconBg: 'bg-orange-500' },
          { label: 'Avg Order Value', value: '\u20B90', change: 'No data', changeType: 'neutral', icon: 'pi-users', iconBg: 'bg-purple-500' },
        ];
        this.loading.set(false);
      },
    });
  }

  private loadRecentOrders(): void {
    this.ordersLoading.set(true);
    this.orderService.getAll({ limit: 5, sortBy: 'created_at', sortOrder: 'desc' }).subscribe({
      next: (response) => {
        this.recentOrders = (response.data || []).map((order: Order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customer: this.getCustomerName(order),
          amount: '\u20B9' + this.formatNumber(order.totalAmount),
          status: order.status as RecentOrder['status'],
          date: this.formatRelativeDate(order.createdAt),
        }));
        this.ordersLoading.set(false);
      },
      error: () => {
        this.recentOrders = [];
        this.ordersLoading.set(false);
      },
    });
  }

  private loadLowStock(): void {
    this.lowStockLoading.set(true);
    this.apiService.get<InventoryItem[]>('/inventory/low-stock').subscribe({
      next: (items: InventoryItem[]) => {
        this.lowStockItems = (items || []).map((item) => ({
          name: item.product?.name ?? item.variantName ?? 'Unknown Product',
          sku: item.product?.sku ?? item.productId,
          stock: item.currentStock,
          threshold: item.lowStockThreshold,
        }));
        this.lowStockLoading.set(false);
      },
      error: () => {
        this.lowStockItems = [];
        this.lowStockLoading.set(false);
      },
    });
  }

  private getCustomerName(order: Order): string {
    if (order.customer) {
      const first = order.customer.firstName ?? '';
      const last = order.customer.lastName ?? '';
      const full = (first + ' ' + last).trim();
      if (full) return full;
      if (order.customer.whatsappName) return order.customer.whatsappName;
    }
    return 'Customer';
  }

  private formatRelativeDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + ' min' + (diffMins === 1 ? '' : 's') + ' ago';
    if (diffHours < 24) return diffHours + ' hour' + (diffHours === 1 ? '' : 's') + ' ago';
    if (diffDays < 7) return diffDays + ' day' + (diffDays === 1 ? '' : 's') + ' ago';
    return date.toLocaleDateString();
  }

  private formatNumber(value: number): string {
    if (value == null) return '0';
    return value.toLocaleString('en-IN');
  }

  setChartPeriod(days: number) {
    if (this.chartDays === days) return;
    this.chartDays = days;
    this.initChart();
  }

  private initChart() {
    this.revenueChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 16, font: { size: 11, weight: '600' }, color: '#64748b' },
        },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: '#0f172a', padding: 12, cornerRadius: 10,
          titleColor: '#fff', titleFont: { size: 12, weight: '600' },
          bodyColor: '#cbd5e1', bodyFont: { size: 12 },
          boxPadding: 6, usePointStyle: true, displayColors: true,
        },
      },
      scales: {
        y: {
          type: 'linear', position: 'left', border: { display: false },
          ticks: { callback: (v: number) => '\u20B9' + (v / 1000).toFixed(0) + 'k', font: { size: 11 }, color: '#94a3b8', padding: 8 },
          grid: { color: 'rgba(148,163,184,0.14)', drawTicks: false },
        },
        y1: {
          type: 'linear', position: 'right', border: { display: false },
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 11 }, color: '#94a3b8', padding: 8 },
        },
        x: { border: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8', padding: 6 }, grid: { display: false } },
      },
    };

    const greenGradient = (context: any) => {
      const { ctx, chartArea } = context.chart;
      if (!chartArea) return 'rgba(37,211,102,0.14)';
      const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, 'rgba(37,211,102,0.28)');
      g.addColorStop(1, 'rgba(37,211,102,0.00)');
      return g;
    };

    this.apiService.get<any>('/orders/dashboard/chart', { days: this.chartDays }).subscribe({
      next: (data) => {
        const labels = (data.labels || []).map((d: string) => {
          const date = new Date(d);
          return this.chartDays <= 7
            ? date.toLocaleDateString('en-IN', { weekday: 'short' })
            : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        });
        this.revenueChartData = {
          labels: labels.length ? labels : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [
            {
              label: 'Revenue (\u20B9)',
              data: data.revenue || [],
              borderColor: '#16a34a', backgroundColor: greenGradient, borderWidth: 2.5,
              fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5,
              pointBackgroundColor: '#16a34a', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2, yAxisID: 'y',
            },
            {
              label: 'Orders',
              data: data.orders || [],
              borderColor: '#3b82f6', backgroundColor: 'transparent', borderWidth: 2,
              tension: 0.4, borderDash: [5, 5], pointRadius: 0, pointHoverRadius: 5,
              pointBackgroundColor: '#3b82f6', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2, yAxisID: 'y1',
            },
          ],
        };
      },
      error: () => {
        // Fallback: empty chart
        this.revenueChartData = {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [
            { label: 'Revenue (\u20B9)', data: [0, 0, 0, 0, 0, 0, 0], borderColor: '#16a34a', backgroundColor: greenGradient, borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 0, yAxisID: 'y' },
            { label: 'Orders', data: [0, 0, 0, 0, 0, 0, 0], borderColor: '#3b82f6', backgroundColor: 'transparent', borderWidth: 2, tension: 0.4, borderDash: [5, 5], pointRadius: 0, yAxisID: 'y1' },
          ],
        };
      },
    });
  }

  getOrderSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const map: Record<string, any> = {
      completed: 'success',
      delivered: 'success',
      confirmed: 'info',
      processing: 'info',
      pending: 'warn',
      canceled: 'danger',
    };
    return map[status] ?? 'secondary';
  }
}
