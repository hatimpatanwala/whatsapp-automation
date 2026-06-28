import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { OrderService } from '../../core/services/order.service';
import { exportToCsv } from '../../core/utils/csv-export';
import { ApiService } from '../../core/services/api.service';
import { Order, OrderStats } from '../../core/models';

interface OrderRow {
  id: string;
  orderNumber: string;
  customer: string;
  phone: string;
  items: number;
  total: number;
  status: string;
  paymentStatus: string;
  date: string;
}

@Component({
  selector: 'order-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TableModule,
    ButtonModule,
    TagModule,
    SelectModule,
    DatePickerModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ToastModule,
    FormsModule,
  ],
  providers: [MessageService, DatePipe],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Orders</h1>
          <p class="text-gray-500 text-sm">Track and manage customer orders</p>
        </div>
        <div class="flex gap-2">
          <button pButton label="Create on WhatsApp" icon="pi pi-whatsapp" class="p-button-outlined p-button-sm" [loading]="openingBuilder()" (click)="openBuilder()"></button>
          <button pButton label="New Order" icon="pi pi-plus" class="p-button-sm" routerLink="/orders/new"></button>
          <button pButton label="Export" icon="pi pi-download" class="p-button-outlined p-button-sm" [disabled]="!orders().length" (click)="exportCsv()"></button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        @for (stat of orderStats; track stat.label) {
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5 hover:shadow-md transition-shadow">
            <div [class]="'flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ' + stat.iconBg">
              <i [class]="'pi ' + stat.icon" style="font-size:1.1rem"></i>
            </div>
            <div class="min-w-0">
              <p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ stat.value }}</p>
              <p class="text-xs text-gray-500 mt-1 truncate">{{ stat.label }}</p>
            </div>
          </div>
        }
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3">
        <p-iconfield class="flex-1 min-w-48">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText [(ngModel)]="searchQuery" placeholder="Search orders or customers..." class="w-full" (input)="onSearchInput()" />
        </p-iconfield>
        <p-select [(ngModel)]="statusFilter" [options]="statusOptions" optionLabel="label" optionValue="value"
          placeholder="All statuses" styleClass="min-w-40" (onChange)="onFilterChange()" />
        <p-select [(ngModel)]="paymentFilter" [options]="paymentOptions" optionLabel="label" optionValue="value"
          placeholder="Payment status" styleClass="min-w-40" (onChange)="onFilterChange()" />
        <button pButton label="Reset" icon="pi pi-filter-slash" class="p-button-outlined p-button-sm" (click)="resetFilters()"></button>
      </div>

      <!-- Orders table -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <p-table
          [value]="orders()"
          [scrollable]="true"
          scrollHeight="58vh"
          [paginator]="true"
          [rows]="rows"
          [totalRecords]="totalRecords()"
          [lazy]="true"
          (onLazyLoad)="onLazyLoad($event)"
          [loading]="loading()"
          dataKey="id"
          styleClass="text-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th class="text-xs text-gray-500 font-medium">Order</th>
              <th class="text-xs text-gray-500 font-medium">Customer</th>
              <th class="text-xs text-gray-500 font-medium">Items</th>
              <th class="text-xs text-gray-500 font-medium">Total</th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th class="text-xs text-gray-500 font-medium">Payment</th>
              <th class="text-xs text-gray-500 font-medium">Date</th>
              <th class="text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-order>
            <tr class="hover:bg-gray-50">
              <td>
                <a [routerLink]="[order.id]" class="font-semibold text-primary-600 hover:underline">{{ order.orderNumber }}</a>
              </td>
              <td>
                <div>
                  <p class="font-medium text-gray-900">{{ order.customer }}</p>
                  <p class="text-xs text-gray-400">{{ order.phone }}</p>
                </div>
              </td>
              <td class="text-gray-600">{{ order.items }} item{{ order.items !== 1 ? 's' : '' }}</td>
              <td class="font-semibold text-gray-900">₹{{ order.total | number }}</td>
              <td>
                <p-tag [value]="order.status" [severity]="getStatusSeverity(order.status)" styleClass="text-xs capitalize" />
              </td>
              <td>
                <p-tag [value]="order.paymentStatus" [severity]="getPaymentSeverity(order.paymentStatus)" styleClass="text-xs capitalize" />
              </td>
              <td class="text-gray-500 text-xs">{{ order.date }}</td>
              <td>
                <div class="flex gap-1">
                  <button pButton icon="pi pi-eye" class="p-button-text p-button-sm p-button-rounded" pTooltip="View details" [routerLink]="[order.id]"></button>
                  <button pButton icon="pi pi-comments" class="p-button-text p-button-sm p-button-rounded" pTooltip="Open conversation"></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="8" class="text-center py-12 text-gray-400">
                <i class="pi pi-shopping-cart" style="font-size:2.5rem"></i>
                <p class="mt-3 text-base font-medium">No orders found</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class OrderListComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly orderService = inject(OrderService);
  private readonly datePipe = inject(DatePipe);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);

  openingBuilder = signal(false);

  /** Mint a token-secured Builder session and open the order builder (WhatsApp webview). */
  openBuilder() {
    if (this.openingBuilder()) return;
    this.openingBuilder.set(true);
    this.api.post<{ token: string }>('/builder/sessions', { type: 'order' }).subscribe({
      next: (r) => { this.openingBuilder.set(false); this.router.navigate(['/m/builder'], { queryParams: { token: r.token } }); },
      error: () => { this.openingBuilder.set(false); this.messageService.add({ severity: 'error', summary: 'Could not open builder' }); },
    });
  }

  exportCsv() {
    const ok = exportToCsv(
      'orders',
      this.orders(),
      [
        { key: 'orderNumber', header: 'Order #' },
        { key: 'customer', header: 'Customer' },
        { key: 'phone', header: 'Phone' },
        { key: 'items', header: 'Items' },
        { key: 'total', header: 'Total' },
        { key: 'status', header: 'Status' },
        { key: 'paymentStatus', header: 'Payment' },
        { key: 'date', header: 'Date' },
      ],
    );
    this.messageService.add(
      ok
        ? { severity: 'success', summary: 'Exported', detail: `${this.orders().length} orders exported to CSV.` }
        : { severity: 'info', summary: 'Nothing to export', detail: 'No orders match the current filters.' },
    );
  }

  private readonly searchSubject = new Subject<string>();

  loading = signal(true);
  orders = signal<OrderRow[]>([]);
  totalRecords = signal(0);

  searchQuery = '';
  statusFilter = '';
  paymentFilter = '';
  currentPage = 1;
  rows = 10;

  orderStats = [
    { label: 'Pending', value: '0', icon: 'pi-clock', iconBg: 'bg-amber-50 text-amber-600' },
    { label: 'Processing', value: '0', icon: 'pi-sync', iconBg: 'bg-blue-50 text-blue-600' },
    { label: 'Completed Today', value: '0', icon: 'pi-check-circle', iconBg: 'bg-green-50 text-green-600' },
    { label: 'Canceled', value: '0', icon: 'pi-times-circle', iconBg: 'bg-red-50 text-red-600' },
  ];

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Processing', value: 'processing' },
    { label: 'Shipped', value: 'shipped' },
    { label: 'Completed', value: 'completed' },
    { label: 'Canceled', value: 'canceled' },
  ];

  paymentOptions = [
    { label: 'All Payments', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Paid', value: 'paid' },
    { label: 'Failed', value: 'failed' },
    { label: 'Refunded', value: 'refunded' },
  ];

  ngOnInit() {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.currentPage = 1;
      this.loadOrders();
    });

    this.loadOrders();
    this.loadStats();
  }

  onSearchInput() {
    this.searchSubject.next(this.searchQuery);
  }

  onFilterChange() {
    this.currentPage = 1;
    this.loadOrders();
  }

  onLazyLoad(event: any) {
    const page = Math.floor((event.first || 0) / this.rows) + 1;
    if (page !== this.currentPage) {
      this.currentPage = page;
      this.loadOrders();
    }
  }

  resetFilters() {
    this.searchQuery = '';
    this.statusFilter = '';
    this.paymentFilter = '';
    this.currentPage = 1;
    this.loadOrders();
  }

  private loadOrders() {
    this.loading.set(true);

    const params: any = {
      page: this.currentPage,
      limit: this.rows,
    };
    if (this.searchQuery) params.search = this.searchQuery;
    if (this.statusFilter) params.status = this.statusFilter;
    if (this.paymentFilter) params.paymentStatus = this.paymentFilter;

    this.orderService.getAll(params).subscribe({
      next: (res) => {
        const rows = res.data.map((order: Order) => this.mapOrderToRow(order));
        this.orders.set(rows);
        this.totalRecords.set(res.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load orders. Please try again.',
        });
        this.loading.set(false);
      },
    });
  }

  private loadStats() {
    this.orderService.getStats().subscribe({
      next: (stats: OrderStats) => {
        this.orderStats = [
          { label: 'Pending', value: String(stats.pendingOrders), icon: 'pi-clock', iconBg: 'bg-amber-50 text-amber-600' },
          { label: 'Processing', value: String(stats.processingOrders), icon: 'pi-sync', iconBg: 'bg-blue-50 text-blue-600' },
          { label: 'Completed Today', value: String(stats.completedOrders), icon: 'pi-check-circle', iconBg: 'bg-green-50 text-green-600' },
          { label: 'Canceled', value: String(stats.canceledOrders), icon: 'pi-times-circle', iconBg: 'bg-red-50 text-red-600' },
        ];
      },
      error: () => {
        // Stats are non-critical; keep defaults
      },
    });
  }

  private mapOrderToRow(order: Order): OrderRow {
    const customerName = order.customer
      ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || order.customer.whatsappName || 'Unknown'
      : 'Unknown';
    const customerPhone = order.customer?.whatsappPhone || '';

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customer: customerName,
      phone: customerPhone,
      items: (order as any).itemCount ?? order.items?.length ?? 0,
      total: order.totalAmount,
      status: order.status,
      paymentStatus: order.paymentStatus,
      date: this.datePipe.transform(order.createdAt, 'MMM d, y') || order.createdAt,
    };
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      pending: 'warn', confirmed: 'info', processing: 'info',
      shipped: 'secondary', completed: 'success', delivered: 'success',
      canceled: 'danger', refunded: 'secondary',
    };
    return map[status] ?? 'secondary';
  }

  getPaymentSeverity(status: string): any {
    const map: Record<string, any> = {
      paid: 'success', pending: 'warn', failed: 'danger', refunded: 'secondary',
    };
    return map[status] ?? 'secondary';
  }
}
