import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { StepperModule } from 'primeng/stepper';

@Component({
  selector: 'order-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ButtonModule,
    TagModule,
    DividerModule,
    TableModule,
    ToastModule,
    SelectModule,
    DialogModule,
    FormsModule,
    StepperModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <p-toast />

      <!-- Back + header -->
      <div class="flex items-center gap-4 mb-6">
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/orders"></button>
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-gray-900">{{ order().orderNumber }}</h1>
            <p-tag [value]="order().status" [severity]="getStatusSeverity(order().status)" styleClass="capitalize" />
          </div>
          <p class="text-gray-500 text-sm mt-1">Placed on {{ order().date }}</p>
        </div>
        <div class="flex gap-2">
          <button pButton label="Message Customer" icon="pi pi-whatsapp" class="p-button-outlined" severity="success"></button>
          <button pButton label="Update Status" icon="pi pi-refresh" severity="success" (click)="statusDialog = true"></button>
        </div>
      </div>

      <!-- Order progress -->
      <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <h3 class="text-base font-semibold text-gray-900 mb-5">Order Progress</h3>
        <div class="flex items-center gap-0">
          @for (step of orderSteps; track step.label; let i = $index; let last = $last) {
            <div class="flex items-center" [class.flex-1]="!last">
              <div class="flex flex-col items-center gap-1">
                <div
                  class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors"
                  [class.bg-primary-500]="step.completed"
                  [class.text-white]="step.completed"
                  [class.bg-primary-100]="step.active && !step.completed"
                  [class.text-primary-700]="step.active && !step.completed"
                  [class.bg-gray-100]="!step.active && !step.completed"
                  [class.text-gray-400]="!step.active && !step.completed"
                >
                  <i [class]="'pi ' + (step.completed ? 'pi-check' : step.icon)" style="font-size:0.9rem"></i>
                </div>
                <span class="text-xs font-medium text-center max-w-16"
                  [class.text-primary-600]="step.completed || step.active"
                  [class.text-gray-400]="!step.completed && !step.active"
                >{{ step.label }}</span>
              </div>
              @if (!last) {
                <div class="flex-1 h-0.5 mx-2 mb-5"
                  [class.bg-primary-400]="step.completed"
                  [class.bg-gray-200]="!step.completed"
                ></div>
              }
            </div>
          }
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Order items -->
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-100">
              <h3 class="text-base font-semibold text-gray-900">Order Items ({{ order().items.length }})</h3>
            </div>
            <div class="divide-y divide-gray-100">
              @for (item of order().items; track item.id) {
                <div class="flex items-center gap-4 p-4">
                  <img [src]="item.image" [alt]="item.name" class="w-14 h-14 rounded-lg object-cover border border-gray-100" />
                  <div class="flex-1">
                    <p class="font-medium text-gray-900">{{ item.name }}</p>
                    @if (item.variant) {
                      <p class="text-xs text-gray-500">Variant: {{ item.variant }}</p>
                    }
                    <p class="text-xs text-gray-400">SKU: {{ item.sku }}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-medium text-gray-900">₦{{ item.unitPrice | number }} × {{ item.qty }}</p>
                    <p class="font-bold text-gray-900">₦{{ item.total | number }}</p>
                  </div>
                </div>
              }
            </div>
            <!-- Totals -->
            <div class="bg-gray-50 px-6 py-4 space-y-2">
              <div class="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span><span>₦{{ order().subtotal | number }}</span>
              </div>
              <div class="flex justify-between text-sm text-gray-600">
                <span>Shipping</span><span>₦{{ order().shipping | number }}</span>
              </div>
              <div class="flex justify-between text-sm text-gray-600">
                <span>Discount</span><span class="text-green-600">-₦{{ order().discount | number }}</span>
              </div>
              <p-divider styleClass="my-2" />
              <div class="flex justify-between font-bold text-base text-gray-900">
                <span>Total</span><span>₦{{ order().total | number }}</span>
              </div>
            </div>
          </div>

          <!-- Delivery info -->
          <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Delivery Information</h3>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wider font-medium">Shipping Address</p>
                <p class="text-sm text-gray-800 mt-1">{{ order().address }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wider font-medium">Delivery Method</p>
                <p class="text-sm text-gray-800 mt-1">{{ order().deliveryMethod }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-5">

          <!-- Customer -->
          <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 class="text-base font-semibold text-gray-900 mb-3">Customer</h3>
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm">
                {{ order().customer.initials }}
              </div>
              <div>
                <p class="font-medium text-gray-900">{{ order().customer.name }}</p>
                <p class="text-xs text-gray-500">{{ order().customer.phone }}</p>
              </div>
            </div>
            <div class="space-y-1 text-sm text-gray-600">
              <p><span class="text-gray-400">Total orders:</span> {{ order().customer.totalOrders }}</p>
              <p><span class="text-gray-400">Total spent:</span> ₦{{ order().customer.totalSpent | number }}</p>
            </div>
            <button pButton label="View Customer" class="p-button-text p-button-sm w-full mt-3" icon="pi pi-external-link" iconPos="right"></button>
          </div>

          <!-- Payment -->
          <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 class="text-base font-semibold text-gray-900 mb-3">Payment</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">Status</span>
                <p-tag [value]="order().paymentStatus" [severity]="getPaymentSeverity(order().paymentStatus)" styleClass="text-xs capitalize" />
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">Method</span>
                <span class="font-medium">{{ order().paymentMethod }}</span>
              </div>
              @if (order().paymentRef) {
                <div class="flex justify-between">
                  <span class="text-gray-500">Reference</span>
                  <span class="font-mono text-xs">{{ order().paymentRef }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Notes -->
          <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 class="text-base font-semibold text-gray-900 mb-3">Order Notes</h3>
            <p class="text-sm text-gray-600 italic">{{ order().notes || 'No notes for this order.' }}</p>
          </div>
        </div>
      </div>

      <!-- Status update dialog -->
      <p-dialog [(visible)]="statusDialog" header="Update Order Status" [modal]="true" [style]="{width: '400px'}">
        <div class="space-y-4 py-2">
          <p-select
            [(ngModel)]="newStatus"
            [options]="statusOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select new status"
            styleClass="w-full"
          />
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="statusDialog = false"></button>
          <button pButton label="Update" severity="success" (click)="updateStatus()"></button>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class OrderDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);

  statusDialog = false;
  newStatus = '';

  statusOptions = [
    { label: 'Pending', value: 'pending' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Processing', value: 'processing' },
    { label: 'Shipped', value: 'shipped' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Completed', value: 'completed' },
    { label: 'Canceled', value: 'canceled' },
  ];

  orderSteps = [
    { label: 'Pending', icon: 'pi-clock', completed: true, active: false },
    { label: 'Confirmed', icon: 'pi-check-circle', completed: true, active: false },
    { label: 'Processing', icon: 'pi-cog', completed: false, active: true },
    { label: 'Shipped', icon: 'pi-truck', completed: false, active: false },
    { label: 'Delivered', icon: 'pi-home', completed: false, active: false },
  ];

  order = signal({
    orderNumber: 'ORD-0089',
    date: 'May 4, 2026 · 10:23 AM',
    status: 'processing',
    paymentStatus: 'paid',
    paymentMethod: 'Bank Transfer',
    paymentRef: 'TXN-ABC12345',
    subtotal: 45000,
    shipping: 2500,
    discount: 0,
    total: 47500,
    address: '45 Adeola Odeku Street, Victoria Island, Lagos, Nigeria',
    deliveryMethod: 'Standard Delivery (3-5 days)',
    notes: 'Please call before delivery. Gate code is 4521.',
    customer: {
      name: 'Amara Okonkwo',
      initials: 'AO',
      phone: '+234 812 345 6789',
      totalOrders: 8,
      totalSpent: 284500,
    },
    items: [
      { id: '1', name: 'Premium Wireless Earbuds', sku: 'SKU-001', variant: 'Black', qty: 1, unitPrice: 45000, total: 45000, image: 'https://picsum.photos/seed/p1/80/80' },
      { id: '2', name: 'USB-C Cable 2m Braided', sku: 'SKU-118', variant: null, qty: 2, unitPrice: 3500, total: 7000, image: 'https://picsum.photos/seed/p3/80/80' },
    ],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    // In real app: load order by id
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      pending: 'warn', confirmed: 'info', processing: 'info',
      shipped: 'secondary', completed: 'success', canceled: 'danger',
    };
    return map[status] ?? 'secondary';
  }

  getPaymentSeverity(status: string): any {
    const map: Record<string, any> = { paid: 'success', pending: 'warn', failed: 'danger', refunded: 'secondary' };
    return map[status] ?? 'secondary';
  }

  updateStatus() {
    if (!this.newStatus) return;
    this.order.update(o => ({ ...o, status: this.newStatus }));
    this.statusDialog = false;
    this.messageService.add({ severity: 'success', summary: 'Status Updated', detail: `Order status changed to ${this.newStatus}` });
  }
}
