import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { AvatarModule } from 'primeng/avatar';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { ChipModule } from 'primeng/chip';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CustomerService } from '../../core/services/customer.service';
import { exportToCsv } from '../../core/utils/csv-export';
import { Customer } from '../../core/models';

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  totalOrders: number;
  totalSpent: number;
  status: 'active' | 'blocked' | 'unsubscribed';
  lastActive: string;
  cartItems: number;
  joinedAt: string;
}

@Component({
  selector: 'wa-customer-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TableModule,
    ButtonModule,
    TagModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    SelectModule,
    AvatarModule,
    ToastModule,
    FormsModule,
    ChipModule,
  ],
  providers: [MessageService, DatePipe],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />

      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Customers</h1>
          <p class="text-gray-500 text-sm">{{ totalRecords() }} total customers</p>
        </div>
        <div class="flex gap-2">
          <button pButton label="Export" icon="pi pi-download" class="p-button-outlined p-button-sm" [disabled]="!customers().length" (click)="exportCsv()"></button>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div class="flex gap-3 flex-wrap">
          <p-iconfield class="flex-1 min-w-48">
            <p-inputicon styleClass="pi pi-search" />
            <input pInputText [(ngModel)]="searchQuery" placeholder="Search by name, phone, email..." class="w-full" (input)="onSearchInput()" />
          </p-iconfield>
          <button pButton label="Reset" icon="pi pi-filter-slash" class="p-button-outlined p-button-sm" (click)="resetFilters()"></button>
        </div>
        <!-- Quick segments -->
        <div class="flex gap-2 overflow-x-auto pb-1">
          @for (s of segments; track s.key) {
            <button class="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
              [class]="segment() === s.key ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'"
              (click)="selectSegment(s.key)">
              {{ s.label }}
              @if (counts()[s.countKey] !== undefined) { <span class="ml-1 opacity-70">{{ counts()[s.countKey] }}</span> }
            </button>
          }
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <p-table
          [value]="customers()"
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
              <th class="text-xs text-gray-500 font-medium">Customer</th>
              <th class="text-xs text-gray-500 font-medium">Contact</th>
              <th class="text-xs text-gray-500 font-medium">Tags</th>
              <th class="text-xs text-gray-500 font-medium">Orders</th>
              <th class="text-xs text-gray-500 font-medium">Total Spent</th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th class="text-xs text-gray-500 font-medium">Last Active</th>
              <th class="text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-customer>
            <tr class="hover:bg-gray-50">
              <td>
                <div class="flex items-center gap-3">
                  <p-avatar
                    [label]="getInitials(customer.name)"
                    styleClass="bg-primary-100 text-primary-700 font-semibold flex-shrink-0"
                    shape="circle"
                  />
                  <div>
                    <a [routerLink]="[customer.id]" class="font-medium text-gray-900 hover:text-primary-600 hover:underline">{{ customer.name }}</a>
                    <p class="text-xs text-gray-400">Joined {{ customer.joinedAt }}</p>
                  </div>
                </div>
              </td>
              <td>
                <p class="text-sm text-gray-700">{{ customer.phone }}</p>
                <p class="text-xs text-gray-400">{{ customer.email }}</p>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  @for (tag of customer.tags.slice(0, 2); track tag) {
                    <span class="bg-primary-50 text-primary-700 text-xs px-2 py-0.5 rounded-full border border-primary-100">{{ tag }}</span>
                  }
                  @if (customer.tags.length > 2) {
                    <span class="text-xs text-gray-400">+{{ customer.tags.length - 2 }}</span>
                  }
                </div>
              </td>
              <td class="font-medium text-gray-900">{{ customer.totalOrders }}</td>
              <td class="font-semibold text-gray-900">₹{{ customer.totalSpent | number }}</td>
              <td>
                <p-tag [value]="customer.status" [severity]="getStatusSeverity(customer.status)" styleClass="text-xs capitalize" />
                @if (customer.cartItems > 0) { <span class="ml-1 text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">🛒 {{ customer.cartItems }}</span> }
              </td>
              <td class="text-gray-500 text-xs">{{ customer.lastActive || 'Never' }}</td>
              <td>
                <div class="flex gap-1">
                  <button pButton icon="pi pi-eye" class="p-button-text p-button-sm p-button-rounded" pTooltip="View profile" [routerLink]="[customer.id]"></button>
                  <a pButton icon="pi pi-whatsapp" class="p-button-text p-button-sm p-button-rounded" pTooltip="Message on WhatsApp" [href]="'https://wa.me/' + customer.phone.replace(/[^0-9]/g,'')" target="_blank"></a>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="8" class="text-center py-12 text-gray-400">
                <i class="pi pi-users" style="font-size:2.5rem"></i>
                <p class="mt-3">No customers found</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class CustomerListComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly customerService = inject(CustomerService);
  private readonly datePipe = inject(DatePipe);

  private readonly searchSubject = new Subject<string>();

  loading = signal(true);
  customers = signal<CustomerRow[]>([]);
  totalRecords = signal(0);

  searchQuery = '';
  segment = signal('');
  counts = signal<Record<string, number>>({});
  currentPage = 1;
  rows = 10;

  segments = [
    { key: '', label: 'All', countKey: 'all' },
    { key: 'top', label: '⭐ Top Spenders', countKey: 'top' },
    { key: 'high_orders', label: '🔥 High Orders', countKey: 'highOrders' },
    { key: 'low_orders', label: '🌱 Low Orders', countKey: 'lowOrders' },
    { key: 'pending_cart', label: '🛒 Pending Cart', countKey: 'pendingCart' },
    { key: 'repeat', label: '🔁 Repeat', countKey: 'repeat' },
    { key: 'new', label: '✨ New', countKey: 'new' },
    { key: 'inactive', label: '💤 Inactive', countKey: 'inactive' },
    { key: 'blocked', label: '🚫 Blocked', countKey: 'blocked' },
  ];

  ngOnInit() {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.currentPage = 1;
      this.loadCustomers();
    });

    this.loadCustomers();
    this.customerService.segmentSummary().subscribe({ next: (r) => this.counts.set(r || {}) });
  }

  selectSegment(key: string) {
    this.segment.set(key);
    this.currentPage = 1;
    this.loadCustomers();
  }

  onSearchInput() {
    this.searchSubject.next(this.searchQuery);
  }

  onFilterChange() {
    this.currentPage = 1;
    this.loadCustomers();
  }

  onLazyLoad(event: any) {
    const page = Math.floor((event.first || 0) / this.rows) + 1;
    if (page !== this.currentPage) {
      this.currentPage = page;
      this.loadCustomers();
    }
  }

  resetFilters() {
    this.searchQuery = '';
    this.segment.set('');
    this.currentPage = 1;
    this.loadCustomers();
  }

  private loadCustomers() {
    this.loading.set(true);

    const params: any = {
      page: this.currentPage,
      limit: this.rows,
    };
    if (this.searchQuery) params.search = this.searchQuery;
    if (this.segment()) params.segment = this.segment();

    this.customerService.getAll(params).subscribe({
      next: (res) => {
        const rows = res.data.map((customer: Customer) => this.mapCustomerToRow(customer));
        this.customers.set(rows);
        this.totalRecords.set(res.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load customers. Please try again.',
        });
        this.loading.set(false);
      },
    });
  }

  private mapCustomerToRow(customer: any): CustomerRow {
    const name = customer.displayName || customer.whatsappName
      || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.whatsappPhone || 'Customer';
    const lastActive = customer.lastActivity || customer.lastOrderAt;

    return {
      id: customer.id,
      name,
      phone: customer.whatsappPhone,
      email: customer.email || '',
      tags: customer.tags || [],
      totalOrders: customer.totalOrders,
      totalSpent: customer.totalSpent,
      status: customer.status,
      cartItems: Number(customer.activeCartItems) || 0,
      lastActive: lastActive ? this.datePipe.transform(lastActive, 'MMM d, y') || '' : '',
      joinedAt: this.datePipe.transform(customer.createdAt, 'MMM y') || customer.createdAt,
    };
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  exportCsv() {
    const rows = this.customers().map((c) => ({
      name: c.name,
      phone: c.phone,
      email: c.email,
      tags: (c.tags || []).join('; '),
      totalOrders: c.totalOrders,
      totalSpent: c.totalSpent,
      status: c.status,
      lastActive: c.lastActive || 'Never',
      joinedAt: c.joinedAt,
    }));
    const ok = exportToCsv('customers', rows, [
      { key: 'name', header: 'Name' },
      { key: 'phone', header: 'Phone' },
      { key: 'email', header: 'Email' },
      { key: 'tags', header: 'Tags' },
      { key: 'totalOrders', header: 'Total Orders' },
      { key: 'totalSpent', header: 'Total Spent' },
      { key: 'status', header: 'Status' },
      { key: 'lastActive', header: 'Last Active' },
      { key: 'joinedAt', header: 'Joined' },
    ]);
    this.messageService.add(
      ok
        ? { severity: 'success', summary: 'Exported', detail: `${rows.length} customers exported to CSV.` }
        : { severity: 'info', summary: 'Nothing to export', detail: 'No customers match the current filters.' },
    );
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = { active: 'success', blocked: 'danger', unsubscribed: 'secondary' };
    return map[status] ?? 'info';
  }
}
