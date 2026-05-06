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
  lastOrderAt: string;
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
          <button pButton label="Export" icon="pi pi-download" class="p-button-outlined p-button-sm"></button>
          <button pButton label="Import" icon="pi pi-upload" class="p-button-sm" severity="secondary"></button>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex gap-3 flex-wrap">
        <p-iconfield class="flex-1 min-w-48">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText [(ngModel)]="searchQuery" placeholder="Search by name, phone, email..." class="w-full" (input)="onSearchInput()" />
        </p-iconfield>
        <p-select [(ngModel)]="statusFilter" [options]="statusOptions" optionLabel="label" optionValue="value"
          placeholder="All statuses" styleClass="min-w-36" (onChange)="onFilterChange()" />
        <button pButton label="Reset" icon="pi pi-filter-slash" class="p-button-outlined p-button-sm" (click)="resetFilters()"></button>
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
              <th pSortableColumn="totalOrders" class="text-xs text-gray-500 font-medium">Orders <p-sortIcon field="totalOrders" /></th>
              <th pSortableColumn="totalSpent" class="text-xs text-gray-500 font-medium">Total Spent <p-sortIcon field="totalSpent" /></th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th class="text-xs text-gray-500 font-medium">Last Order</th>
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
              </td>
              <td class="text-gray-500 text-xs">{{ customer.lastOrderAt || 'Never' }}</td>
              <td>
                <div class="flex gap-1">
                  <button pButton icon="pi pi-eye" class="p-button-text p-button-sm p-button-rounded" pTooltip="View profile" [routerLink]="[customer.id]"></button>
                  <button pButton icon="pi pi-comments" class="p-button-text p-button-sm p-button-rounded" pTooltip="Start conversation"></button>
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
  statusFilter = '';
  currentPage = 1;
  rows = 10;

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Blocked', value: 'blocked' },
    { label: 'Unsubscribed', value: 'unsubscribed' },
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
    this.statusFilter = '';
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
    if (this.statusFilter) params.status = this.statusFilter;

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

  private mapCustomerToRow(customer: Customer): CustomerRow {
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.whatsappName || 'Unknown';

    return {
      id: customer.id,
      name,
      phone: customer.whatsappPhone,
      email: customer.email || '',
      tags: customer.tags || [],
      totalOrders: customer.totalOrders,
      totalSpent: customer.totalSpent,
      status: customer.status,
      lastOrderAt: customer.lastOrderAt
        ? this.datePipe.transform(customer.lastOrderAt, 'MMM d, y') || customer.lastOrderAt
        : '',
      joinedAt: this.datePipe.transform(customer.createdAt, 'MMM y') || customer.createdAt,
    };
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = { active: 'success', blocked: 'danger', unsubscribed: 'secondary' };
    return map[status] ?? 'info';
  }
}
