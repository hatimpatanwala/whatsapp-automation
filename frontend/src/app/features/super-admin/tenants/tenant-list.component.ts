import { Component, OnInit, signal, inject, computed } from '@angular/core';
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
import { TooltipModule } from 'primeng/tooltip';
import { TenantService } from '../../../core/services/tenant.service';

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
    TooltipModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />
      <p-confirmDialog styleClass="bg-white text-gray-900" />

      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Tenants</h1>
          <p class="text-gray-500 text-sm">{{ tenants().length }} total tenants on the platform</p>
        </div>
        <button pButton label="Add Tenant" icon="pi pi-plus" severity="success" routerLink="new"></button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-4 gap-4">
        @for (stat of tenantStats(); track stat.label) {
          <div class="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <p class="text-xl font-bold mt-1" [class]="stat.color">{{ stat.value }}</p>
            <p class="text-xs font-medium text-gray-600 mt-1">{{ stat.label }}</p>
          </div>
        }
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl p-4 border border-gray-200 flex gap-3 flex-wrap">
        <p-iconfield class="flex-1 min-w-48">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText [(ngModel)]="searchQuery" placeholder="Search tenants..." class="w-full" (input)="filter()" />
        </p-iconfield>
        <p-select [(ngModel)]="statusFilter" [options]="statusOptions" optionLabel="label" optionValue="value"
          placeholder="All statuses" styleClass="min-w-36" (onChange)="filter()" />
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="filteredTenants()" [loading]="loading()" [paginator]="true" [rows]="10" dataKey="id" styleClass="text-sm">
          <ng-template pTemplate="header">
            <tr class="bg-gray-50">
              <th class="text-xs text-gray-500 font-medium">Tenant</th>
              <th class="text-xs text-gray-500 font-medium">Plan</th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th class="text-xs text-gray-500 font-medium">Onboarding</th>
              <th class="text-xs text-gray-500 font-medium">WhatsApp</th>
              <th class="text-xs text-gray-500 font-medium">Joined</th>
              <th class="text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-tenant>
            <tr class="border-t border-gray-200 hover:bg-gray-50">
              <td>
                <div>
                  <p class="font-semibold text-gray-900">{{ tenant.name || tenant.businessName || 'Unnamed' }}</p>
                  <p class="text-xs text-gray-500">&#64;{{ tenant.slug }}</p>
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
              <td>
                <p-tag [value]="tenant.onboardingStatus || 'pending'" [severity]="tenant.onboardingStatus === 'completed' ? 'success' : 'warn'" styleClass="text-xs capitalize" />
              </td>
              <td class="text-gray-600 text-xs">{{ tenant.whatsappPhone || '—' }}</td>
              <td class="text-gray-500 text-xs">{{ tenant.createdAt | date:'mediumDate' }}</td>
              <td>
                <div class="flex gap-1">
                  <button pButton icon="pi pi-eye" class="p-button-text p-button-sm p-button-rounded text-gray-500" pTooltip="View Details" [routerLink]="[tenant.id, 'view']"></button>
                  <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm p-button-rounded text-gray-500" pTooltip="Edit" [routerLink]="[tenant.id, 'edit']"></button>
                  @if (tenant.status === 'active') {
                    <button pButton icon="pi pi-ban" class="p-button-text p-button-sm p-button-rounded text-orange-400" pTooltip="Suspend" (click)="suspendTenant(tenant)"></button>
                  } @else if (tenant.status === 'suspended') {
                    <button pButton icon="pi pi-play" class="p-button-text p-button-sm p-button-rounded text-green-400" pTooltip="Activate" (click)="activateTenant(tenant)"></button>
                  }
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="7" class="text-center py-12 text-gray-500">
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
  private readonly tenantService = inject(TenantService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  loading = signal(true);
  searchQuery = '';
  statusFilter = '';
  tenants = signal<any[]>([]);
  filteredTenants = signal<any[]>([]);

  tenantStats = computed(() => {
    const list = this.tenants();
    const trial = list.filter(t => t.subscriptions?.[0]?.plan === 'trial').length;
    return [
      { label: 'Active', value: list.filter(t => t.status === 'active').length.toString(), color: 'text-green-400' },
      { label: 'On Trial', value: trial.toString(), color: 'text-blue-400' },
      { label: 'Suspended', value: list.filter(t => t.status === 'suspended').length.toString(), color: 'text-orange-400' },
      { label: 'Pending', value: list.filter(t => t.status === 'pending').length.toString(), color: 'text-gray-500' },
    ];
  });

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Trialing', value: 'trialing' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Pending', value: 'pending' },
    { label: 'Deactivated', value: 'deactivated' },
  ];

  ngOnInit() {
    this.loadTenants();
  }

  loadTenants() {
    this.loading.set(true);
    this.tenantService.getAll().subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res as any).data || [];
        this.tenants.set(list);
        this.filteredTenants.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Failed to load tenants', detail: err.error?.message || err.message });
      },
    });
  }

  filter() {
    let result = [...this.tenants()];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.slug || '').toLowerCase().includes(q) ||
        (t.businessName || '').toLowerCase().includes(q)
      );
    }
    if (this.statusFilter) result = result.filter(t => t.status === this.statusFilter);
    this.filteredTenants.set(result);
  }

  suspendTenant(tenant: any) {
    this.confirmationService.confirm({
      message: `Suspend "${tenant.name || tenant.slug}"? They will lose access to the platform.`,
      header: 'Suspend Tenant',
      icon: 'pi pi-ban',
      accept: () => {
        this.tenantService.suspend(tenant.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'warn', summary: 'Tenant Suspended', detail: `${tenant.name || tenant.slug} has been suspended` });
            this.loadTenants();
          },
          error: (err) => {
            this.messageService.add({ severity: 'error', summary: 'Failed', detail: err.error?.message || 'Could not suspend tenant' });
          },
        });
      },
    });
  }

  activateTenant(tenant: any) {
    this.tenantService.activate(tenant.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Tenant Activated', detail: `${tenant.name || tenant.slug} is now active` });
        this.loadTenants();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Failed', detail: err.error?.message || 'Could not activate tenant' });
      },
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
