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
          <button pButton label="Export" icon="pi pi-download" class="p-button-outlined p-button-sm"></button>
          <button pButton label="New Order" icon="pi pi-plus" class="p-button-sm" severity="success" routerLink="/orders"></button>
        </div>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        @if (loading()) {
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p-skeleton width="60%" height="1rem" styleClass="mb-2" />
              <p-skeleton width="40%" height="2rem" styleClass="mb-2" />
              <p-skeleton width="50%" height="0.75rem" />
            </div>
          }
        } @else {
          @for (stat of stats; track stat.label) {
            <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div class="flex items-start justify-between">
                <div>
                  <p class="text-sm text-gray-500 font-medium">{{ stat.label }}</p>
                  <p class="text-2xl font-bold text-gray-900 mt-1">{{ stat.value }}</p>
                  <div class="flex items-center gap-1 mt-2">
                    <i
                      [class]="'pi ' + (stat.changeType === 'up' ? 'pi-arrow-up text-green-500' : stat.changeType === 'down' ? 'pi-arrow-down text-red-500' : 'pi-minus text-gray-400')"
                      style="font-size:0.75rem"
                    ></i>
                    <span
                      class="text-xs font-medium"
                      [class.text-green-600]="stat.changeType === 'up'"
                      [class.text-red-600]="stat.changeType === 'down'"
                      [class.text-gray-500]="stat.changeType === 'neutral'"
                    >{{ stat.change }} vs yesterday</span>
                  </div>
                </div>
                <div [class]="'flex items-center justify-center w-12 h-12 rounded-xl ' + stat.iconBg">
                  <i [class]="'pi ' + stat.icon + ' text-white'" style="font-size:1.25rem"></i>
                </div>
              </div>
            </div>
          }
        }
      </div>

      <!-- Charts + Low Stock -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <!-- Revenue chart -->
        <div class="xl:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-base font-semibold text-gray-900">Revenue Overview</h3>
              <p class="text-sm text-gray-500">Last 7 days</p>
            </div>
            <div class="flex gap-1">
              <button pButton label="7D" class="p-button-sm p-button-outlined text-xs" severity="success"></button>
              <button pButton label="30D" class="p-button-sm p-button-text text-xs"></button>
            </div>
          </div>
          <p-chart type="line" [data]="revenueChartData" [options]="revenueChartOptions" height="260px" />
        </div>

        <!-- Low stock alerts -->
        <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
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
      <div class="bg-white rounded-xl shadow-sm border border-gray-100">
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

  ngOnInit() {
    this.initChart();
    this.loadStats();
    this.loadRecentOrders();
    this.loadLowStock();
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

  private initChart() {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const revenue = [385000, 420000, 310000, 480000, 395000, 520000, 447500];
    const orders = [32, 38, 28, 45, 35, 48, 42];

    this.revenueChartData = {
      labels,
      datasets: [
        {
          label: 'Revenue (\u20B9)',
          data: revenue,
          borderColor: '#25D366',
          backgroundColor: 'rgba(37,211,102,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#25D366',
          pointRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Orders',
          data: orders,
          borderColor: '#34B7F1',
          backgroundColor: 'transparent',
          tension: 0.4,
          borderDash: [5, 5],
          pointBackgroundColor: '#34B7F1',
          pointRadius: 4,
          yAxisID: 'y1',
        },
      ],
    };

    this.revenueChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 } } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          ticks: { callback: (v: number) => '\u20B9' + (v / 1000).toFixed(0) + 'k', font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        y1: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 10 } },
        },
        x: {
          ticks: { font: { size: 11 } },
          grid: { display: false },
        },
      },
    };
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
