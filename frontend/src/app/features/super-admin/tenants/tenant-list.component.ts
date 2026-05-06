import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  plan: string;
  status: 'active' | 'suspended' | 'pending' | 'deactivated' | 'trialing';
  conversations: number;
  conversationLimit: number | null;
  mrr: string;
  createdAt: string;
}

@Component({
  selector: 'wa-tenant-list',
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
    ToastModule,
    ConfirmDialogModule,
    FormsModule,
    DialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />
      <p-confirmDialog styleClass="bg-gray-900 text-white" />

      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Tenants</h1>
          <p class="text-gray-400 text-sm">{{ tenants().length }} total tenants on the platform</p>
        </div>
        <button pButton label="Add Tenant" icon="pi pi-plus" severity="success" routerLink="new"></button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-4 gap-4">
        @for (stat of tenantStats; track stat.label) {
          <div class="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
            <p class="text-xl font-bold mt-1" [class]="stat.color">{{ stat.value }}</p>
            <p class="text-xs text-gray-400">{{ stat.label }}</p>
          </div>
        }
      </div>

      <!-- Filters -->
      <div class="bg-gray-900 rounded-xl p-4 border border-gray-800 flex gap-3 flex-wrap">
        <p-iconfield class="flex-1 min-w-48">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText [(ngModel)]="searchQuery" placeholder="Search tenants..." class="w-full" (input)="filter()" />
        </p-iconfield>
        <p-select [(ngModel)]="statusFilter" [options]="statusOptions" optionLabel="label" optionValue="value"
          placeholder="All statuses" styleClass="min-w-36" (onChange)="filter()" />
        <p-select [(ngModel)]="planFilter" [options]="planOptions" optionLabel="label" optionValue="value"
          placeholder="All plans" styleClass="min-w-36" (onChange)="filter()" />
      </div>

      <!-- Table -->
      <div class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <p-table [value]="filteredTenants()" [loading]="loading()" [paginator]="true" [rows]="10" dataKey="id" styleClass="text-sm">
          <ng-template pTemplate="header">
            <tr class="bg-gray-950">
              <th class="text-xs text-gray-500 font-medium">Tenant</th>
              <th class="text-xs text-gray-500 font-medium">Owner</th>
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
              <td>
                <div>
                  <p class="font-semibold text-white">{{ tenant.name }}</p>
                  <p class="text-xs text-gray-400">&#64;{{ tenant.slug }}</p>
                </div>
              </td>
              <td class="text-gray-300 text-xs">{{ tenant.ownerEmail }}</td>
              <td>
                <span class="text-xs bg-primary-900 text-primary-300 px-2.5 py-1 rounded-full font-medium capitalize">{{ tenant.plan }}</span>
              </td>
              <td>
                <p-tag [value]="tenant.status" [severity]="getStatusSeverity(tenant.status)" styleClass="text-xs capitalize" />
              </td>
              <td>
                <div class="text-gray-300">
                  <span class="font-medium">{{ tenant.conversations | number }}</span>
                  @if (tenant.conversationLimit) {
                    <span class="text-gray-500 text-xs"> / {{ tenant.conversationLimit | number }}</span>
                  } @else {
                    <span class="text-gray-500 text-xs"> / ∞</span>
                  }
                </div>
              </td>
              <td class="font-semibold text-green-400">{{ tenant.mrr }}</td>
              <td class="text-gray-400 text-xs">{{ tenant.createdAt }}</td>
              <td>
                <div class="flex gap-1">
                  <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm p-button-rounded text-gray-400" pTooltip="Edit" [routerLink]="[tenant.id, 'edit']"></button>
                  @if (tenant.status === 'active') {
                    <button pButton icon="pi pi-ban" class="p-button-text p-button-sm p-button-rounded text-orange-400" pTooltip="Suspend" (click)="suspendTenant(tenant)"></button>
                  } @else if (tenant.status === 'suspended') {
                    <button pButton icon="pi pi-play" class="p-button-text p-button-sm p-button-rounded text-green-400" pTooltip="Activate" (click)="activateTenant(tenant)"></button>
                  }
                  <button pButton icon="pi pi-external-link" class="p-button-text p-button-sm p-button-rounded text-gray-400" pTooltip="Impersonate"></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="8" class="text-center py-12 text-gray-500">
                <i class="pi pi-building" style="font-size:2.5rem"></i>
                <p class="mt-3">No tenants found</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class TenantListComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  loading = signal(true);
  searchQuery = '';
  statusFilter = '';
  planFilter = '';
  tenants = signal<TenantRow[]>([]);
  filteredTenants = signal<TenantRow[]>([]);

  tenantStats = [
    { label: 'Active', value: '38', color: 'text-green-400' },
    { label: 'Trialing', value: '4', color: 'text-blue-400' },
    { label: 'Suspended', value: '3', color: 'text-orange-400' },
    { label: 'Pending', value: '2', color: 'text-gray-400' },
  ];

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Trialing', value: 'trialing' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Pending', value: 'pending' },
    { label: 'Deactivated', value: 'deactivated' },
  ];

  planOptions = [
    { label: 'All Plans', value: '' },
    { label: 'Starter', value: 'starter' },
    { label: 'Growth', value: 'growth' },
    { label: 'Professional', value: 'professional' },
    { label: 'Enterprise', value: 'enterprise' },
  ];

  private mockTenants: TenantRow[] = [
    { id: '1', name: 'TechGadgets Store', slug: 'techgadgets', ownerEmail: 'tech@gadgets.com', plan: 'growth', status: 'active', conversations: 847, conversationLimit: 2000, mrr: '$190', createdAt: 'May 1, 2026' },
    { id: '2', name: 'FashionHub NG', slug: 'fashionhub', ownerEmail: 'admin@fashionhub.ng', plan: 'professional', status: 'active', conversations: 2134, conversationLimit: 5000, mrr: '$390', createdAt: 'Apr 28, 2026' },
    { id: '3', name: 'QuickMart Abuja', slug: 'quickmart', ownerEmail: 'quickmart@abuja.com', plan: 'starter', status: 'trialing', conversations: 124, conversationLimit: 500, mrr: '$49', createdAt: 'Apr 25, 2026' },
    { id: '4', name: 'Lagos Foods Delivery', slug: 'lagosfoods', ownerEmail: 'info@lagosfoods.com', plan: 'growth', status: 'active', conversations: 1205, conversationLimit: 2000, mrr: '$190', createdAt: 'Apr 20, 2026' },
    { id: '5', name: 'HealthPlus Pharmacy', slug: 'healthplus', ownerEmail: 'info@healthplus.ng', plan: 'enterprise', status: 'active', conversations: 4821, conversationLimit: null, mrr: '$790', createdAt: 'Apr 15, 2026' },
    { id: '6', name: 'BooksNMore', slug: 'booksnmore', ownerEmail: 'books@example.com', plan: 'starter', status: 'suspended', conversations: 231, conversationLimit: 500, mrr: '$49', createdAt: 'Mar 10, 2026' },
    { id: '7', name: 'ElectroWorld', slug: 'electroworld', ownerEmail: 'sales@electroworld.com', plan: 'growth', status: 'active', conversations: 1876, conversationLimit: 2000, mrr: '$190', createdAt: 'Mar 5, 2026' },
    { id: '8', name: 'AgriSupply Hub', slug: 'agrisupply', ownerEmail: 'admin@agrisupply.com', plan: 'starter', status: 'pending', conversations: 0, conversationLimit: 500, mrr: '$0', createdAt: 'May 4, 2026' },
  ];

  ngOnInit() {
    setTimeout(() => {
      this.tenants.set(this.mockTenants);
      this.filteredTenants.set(this.mockTenants);
      this.loading.set(false);
    }, 500);
  }

  filter() {
    let result = [...this.mockTenants];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(t => t.name.toLowerCase().includes(q) || t.slug.includes(q) || t.ownerEmail.includes(q));
    }
    if (this.statusFilter) result = result.filter(t => t.status === this.statusFilter);
    if (this.planFilter) result = result.filter(t => t.plan === this.planFilter);
    this.filteredTenants.set(result);
  }

  suspendTenant(tenant: TenantRow) {
    this.confirmationService.confirm({
      message: `Suspend "${tenant.name}"? They will lose access to the platform.`,
      header: 'Suspend Tenant',
      icon: 'pi pi-ban',
      
      accept: () => {
        this.updateTenantStatus(tenant.id, 'suspended');
        this.messageService.add({ severity: 'warn', summary: 'Tenant Suspended', detail: `${tenant.name} has been suspended` });
      },
    });
  }

  activateTenant(tenant: TenantRow) {
    this.updateTenantStatus(tenant.id, 'active');
    this.messageService.add({ severity: 'success', summary: 'Tenant Activated', detail: `${tenant.name} is now active` });
  }

  private updateTenantStatus(id: string, status: TenantRow['status']) {
    this.mockTenants.forEach(t => { if (t.id === id) t.status = status; });
    this.filter();
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      active: 'success', trialing: 'info', suspended: 'danger',
      pending: 'warn', deactivated: 'secondary',
    };
    return map[status] ?? 'secondary';
  }
}
