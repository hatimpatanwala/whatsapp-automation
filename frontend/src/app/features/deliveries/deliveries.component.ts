import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { DeliveryService } from '../../core/services/delivery.service';

interface DeliveryRow {
  id: string;
  orderNumber: string;
  customer: string;
  address: string;
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
  courier: string;
  courierPhone: string;
  trackingNumber: string;
  estimatedDelivery: string;
  createdAt: string;
}

@Component({
  selector: 'wa-deliveries',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    TagModule,
    DialogModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    SelectModule,
    ToastModule,
    TextareaModule,
    FormsModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Deliveries</h1>
          <p class="text-gray-500 text-sm">Track and manage all deliveries</p>
        </div>
        <button pButton label="Export" icon="pi pi-download" class="p-button-outlined p-button-sm"></button>
      </div>

      <!-- Status summary -->
      <div class="grid grid-cols-3 md:grid-cols-6 gap-3">
        @for (stat of deliveryStats(); track stat.label) {
          <div class="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
            <p class="text-lg font-bold" [class]="stat.color">{{ stat.value }}</p>
            <p class="text-xs text-gray-500 mt-0.5">{{ stat.label }}</p>
          </div>
        }
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex gap-3 flex-wrap">
        <p-iconfield class="flex-1 min-w-48">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText [(ngModel)]="searchQuery" placeholder="Search by order or customer..." class="w-full" (input)="filter()" />
        </p-iconfield>
        <p-select [(ngModel)]="statusFilter" [options]="statusOptions" optionLabel="label" optionValue="value"
          placeholder="All statuses" styleClass="min-w-40" (onChange)="filter()" />
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <p-table [value]="filteredDeliveries()" [loading]="loading()" dataKey="id" styleClass="text-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="text-xs text-gray-500 font-medium">Order</th>
              <th class="text-xs text-gray-500 font-medium">Customer & Address</th>
              <th class="text-xs text-gray-500 font-medium">Courier</th>
              <th class="text-xs text-gray-500 font-medium">Tracking #</th>
              <th class="text-xs text-gray-500 font-medium">Est. Delivery</th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th class="text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-delivery>
            <tr class="hover:bg-gray-50">
              <td class="font-semibold text-primary-600">{{ delivery.orderNumber }}</td>
              <td>
                <p class="font-medium text-gray-900">{{ delivery.customer }}</p>
                <p class="text-xs text-gray-400 max-w-48 truncate">{{ delivery.address }}</p>
              </td>
              <td>
                @if (delivery.courier) {
                  <p class="font-medium text-gray-800">{{ delivery.courier }}</p>
                  <p class="text-xs text-gray-400">{{ delivery.courierPhone }}</p>
                } @else {
                  <span class="text-xs text-gray-400">Not assigned</span>
                }
              </td>
              <td>
                @if (delivery.trackingNumber) {
                  <span class="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{{ delivery.trackingNumber }}</span>
                } @else {
                  <span class="text-xs text-gray-400">\u2014</span>
                }
              </td>
              <td class="text-gray-600 text-xs">{{ delivery.estimatedDelivery || '\u2014' }}</td>
              <td>
                <p-tag [value]="delivery.status.replace('_', ' ')" [severity]="getStatusSeverity(delivery.status)" styleClass="text-xs capitalize" />
              </td>
              <td>
                <div class="flex gap-1">
                  @if (delivery.status === 'pending') {
                    <button pButton icon="pi pi-user-plus" class="p-button-text p-button-sm p-button-rounded" pTooltip="Assign courier" (click)="openAssignDialog(delivery)"></button>
                  }
                  <button pButton icon="pi pi-refresh" class="p-button-text p-button-sm p-button-rounded" pTooltip="Update status" (click)="openStatusDialog(delivery)"></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="7" class="text-center py-12 text-gray-400">
                <i class="pi pi-truck" style="font-size:2.5rem"></i>
                <p class="mt-3">No deliveries found</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <!-- Assign courier dialog -->
      <p-dialog [(visible)]="assignDialog" header="Assign Delivery Person" [modal]="true" [style]="{width:'420px'}">
        @if (selectedDelivery()) {
          <div class="space-y-4 py-2">
            <div class="bg-gray-50 rounded-lg p-3 text-sm">
              <p class="font-medium text-gray-900">{{ selectedDelivery()!.orderNumber }}</p>
              <p class="text-gray-500 mt-1">{{ selectedDelivery()!.address }}</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Select Courier</label>
              <p-select [(ngModel)]="selectedCourier" [options]="courierOptions()" optionLabel="name" optionValue="name"
                placeholder="Choose a delivery person" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Tracking Number</label>
              <input pInputText [(ngModel)]="trackingInput" placeholder="e.g. TRK-001234" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Estimated Delivery</label>
              <input pInputText [(ngModel)]="estDelivery" placeholder="e.g. May 6, 2026" class="w-full" />
            </div>
          </div>
        }
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="assignDialog = false"></button>
          <button pButton label="Assign & Dispatch" severity="success" icon="pi pi-truck" (click)="assignCourier()"></button>
        </ng-template>
      </p-dialog>

      <!-- Status update dialog -->
      <p-dialog [(visible)]="statusDialog" header="Update Delivery Status" [modal]="true" [style]="{width:'380px'}">
        <div class="space-y-4 py-2">
          <p-select [(ngModel)]="newStatus" [options]="statusOptions.slice(1)" optionLabel="label" optionValue="value"
            placeholder="Select new status" styleClass="w-full" />
          <textarea pTextarea [(ngModel)]="statusNote" rows="2" class="w-full" placeholder="Add a note (optional)..."></textarea>
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="statusDialog = false"></button>
          <button pButton label="Update Status" severity="success" (click)="updateStatus()"></button>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class DeliveriesComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly deliveryService = inject(DeliveryService);

  loading = signal(true);
  assignDialog = false;
  statusDialog = false;
  selectedDelivery = signal<DeliveryRow | null>(null);
  searchQuery = '';
  statusFilter = '';
  selectedCourier = '';
  trackingInput = '';
  estDelivery = '';
  newStatus = '';
  statusNote = '';

  filteredDeliveries = signal<DeliveryRow[]>([]);
  private allDeliveries = signal<DeliveryRow[]>([]);

  deliveryStats = signal([
    { label: 'Pending', value: 0, color: 'text-gray-500' },
    { label: 'Assigned', value: 0, color: 'text-blue-500' },
    { label: 'Picked Up', value: 0, color: 'text-purple-500' },
    { label: 'In Transit', value: 0, color: 'text-orange-500' },
    { label: 'Delivered', value: 0, color: 'text-green-600' },
    { label: 'Failed', value: 0, color: 'text-red-500' },
  ]);

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Assigned', value: 'assigned' },
    { label: 'Picked Up', value: 'picked_up' },
    { label: 'In Transit', value: 'in_transit' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Failed', value: 'failed' },
  ];

  courierOptions = signal<{ name: string; phone: string }[]>([]);

  ngOnInit() {
    this.loadDeliveries();
  }

  private loadDeliveries() {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.statusFilter) {
      params['status'] = this.statusFilter;
    }
    this.deliveryService.getAll(params as any).subscribe({
      next: (res) => {
        const rows: DeliveryRow[] = (res.data ?? res as any).map((d: any) => this.mapToRow(d));
        this.allDeliveries.set(rows);
        this.computeStats(rows);
        this.filter();
        // Derive unique couriers from loaded deliveries
        const couriers = rows
          .filter(r => r.courier)
          .reduce((acc, r) => {
            if (!acc.find((c: any) => c.name === r.courier)) {
              acc.push({ name: r.courier, phone: r.courierPhone || '' });
            }
            return acc;
          }, [] as { name: string; phone: string }[]);
        this.courierOptions.set(couriers);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load deliveries' });
      },
    });
  }

  private mapToRow(d: any): DeliveryRow {
    const addr = d.deliveryAddress ?? d.delivery_address;
    let addressStr = '';
    if (addr) {
      addressStr = typeof addr === 'string' ? addr : [addr.street, addr.city, addr.state].filter(Boolean).join(', ');
    }
    return {
      id: d.id,
      orderNumber: d.order_number ?? d.orderNumber ?? d.order?.orderNumber ?? '',
      customer: d.customer_name ?? d.customerName ?? '',
      address: addressStr,
      status: d.status ?? 'pending',
      courier: d.assigned_to ?? d.assignedTo ?? d.courierName ?? d.courier_name ?? '',
      courierPhone: d.customer_phone ?? d.customerPhone ?? d.courierPhone ?? d.courier_phone ?? '',
      trackingNumber: d.trackingNumber ?? d.tracking_number ?? '',
      estimatedDelivery: d.estimated_delivery ?? d.estimatedDelivery ?? d.estimatedDeliveryAt ?? d.estimated_delivery_at ?? '',
      createdAt: d.created_at ?? d.createdAt ?? '',
    };
  }

  private computeStats(rows: DeliveryRow[]) {
    const countByStatus = (status: string) => rows.filter(r => r.status === status).length;
    this.deliveryStats.set([
      { label: 'Pending', value: countByStatus('pending'), color: 'text-gray-500' },
      { label: 'Assigned', value: countByStatus('assigned'), color: 'text-blue-500' },
      { label: 'Picked Up', value: countByStatus('picked_up'), color: 'text-purple-500' },
      { label: 'In Transit', value: countByStatus('in_transit'), color: 'text-orange-500' },
      { label: 'Delivered', value: countByStatus('delivered'), color: 'text-green-600' },
      { label: 'Failed', value: countByStatus('failed'), color: 'text-red-500' },
    ]);
  }

  filter() {
    let result = [...this.allDeliveries()];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(d => d.orderNumber.toLowerCase().includes(q) || d.customer.toLowerCase().includes(q));
    }
    if (this.statusFilter) result = result.filter(d => d.status === this.statusFilter);
    this.filteredDeliveries.set(result);
  }

  openAssignDialog(delivery: DeliveryRow) {
    this.selectedDelivery.set(delivery);
    this.selectedCourier = '';
    this.trackingInput = '';
    this.estDelivery = '';
    this.assignDialog = true;
  }

  assignCourier() {
    const delivery = this.selectedDelivery();
    if (!delivery || !this.selectedCourier) return;
    this.deliveryService.assignCourier(delivery.id, {
      courierName: this.selectedCourier,
      courierPhone: this.courierOptions().find(c => c.name === this.selectedCourier)?.phone,
      estimatedDeliveryAt: this.estDelivery,
    }).subscribe({
      next: () => {
        this.assignDialog = false;
        this.messageService.add({ severity: 'success', summary: 'Courier Assigned', detail: `${this.selectedCourier} assigned to ${delivery.orderNumber}` });
        this.loadDeliveries();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to assign courier' });
      },
    });
  }

  openStatusDialog(delivery: DeliveryRow) {
    this.selectedDelivery.set(delivery);
    this.newStatus = delivery.status;
    this.statusNote = '';
    this.statusDialog = true;
  }

  updateStatus() {
    const delivery = this.selectedDelivery();
    if (!delivery) return;

    // Use specific service methods based on the target status
    let request$;
    switch (this.newStatus) {
      case 'picked_up':
        request$ = this.deliveryService.markPickedUp(delivery.id);
        break;
      case 'delivered':
        request$ = this.deliveryService.markDelivered(delivery.id);
        break;
      case 'failed':
        request$ = this.deliveryService.markFailed(delivery.id, this.statusNote || 'Delivery failed');
        break;
      default:
        // For other statuses, use the generic update method
        request$ = this.deliveryService.update(delivery.id, { deliveryNotes: this.statusNote });
        break;
    }

    request$.subscribe({
      next: () => {
        this.statusDialog = false;
        this.messageService.add({ severity: 'success', summary: 'Status Updated', detail: `Delivery status updated to ${this.newStatus}` });
        this.loadDeliveries();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update delivery status' });
      },
    });
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      pending: 'secondary', assigned: 'info', picked_up: 'info',
      in_transit: 'warn', delivered: 'success', failed: 'danger',
    };
    return map[status] ?? 'secondary';
  }
}
