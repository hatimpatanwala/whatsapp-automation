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
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { OrderService } from '../../core/services/order.service';
import { ProductService } from '../../core/services/product.service';
import { OrderStatus } from '../../core/models';

interface EditItem {
  productId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  image?: string;
}

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
    InputNumberModule,
    InputTextModule,
    TextareaModule,
    AutoCompleteModule,
    FormsModule,
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
          <p class="text-gray-500 text-sm mt-1">{{ order().date ? 'Placed on ' + order().date : '' }}</p>
        </div>
        <div class="flex gap-2">
          @if (!editing()) {
            <button pButton label="Message Customer" icon="pi pi-whatsapp" class="p-button-outlined" severity="success"></button>
            <button pButton label="Edit Order" icon="pi pi-pencil" class="p-button-outlined" (click)="startEdit()"></button>
            <button pButton label="Update Status" icon="pi pi-refresh" severity="success" (click)="statusDialog = true"></button>
          } @else {
            <button pButton label="Cancel" icon="pi pi-times" class="p-button-outlined" severity="secondary" (click)="cancelEdit()"></button>
            <button pButton [label]="saving() ? 'Saving...' : 'Save Changes'" icon="pi pi-check" severity="success" [disabled]="saving() || editItems().length === 0" (click)="saveEdit()"></button>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="text-center py-20"><i class="pi pi-spin pi-spinner text-4xl text-gray-300"></i></div>
      } @else {
        <!-- Order progress (hidden while editing) -->
        @if (!editing()) {
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
        }

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <!-- Order items -->
          <div class="lg:col-span-2 space-y-6">
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 class="text-base font-semibold text-gray-900">
                  Order Items ({{ editing() ? editItems().length : order().items.length }})
                </h3>
                @if (editing()) {
                  <span class="text-xs text-gray-400">Edit quantities & prices, add or remove items</span>
                }
              </div>

              @if (!editing()) {
                <!-- READ MODE -->
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
                        <p class="text-sm font-medium text-gray-900">{{ cur }}{{ item.unitPrice | number }} × {{ item.qty }}</p>
                        <p class="font-bold text-gray-900">{{ cur }}{{ item.total | number }}</p>
                      </div>
                    </div>
                  }
                </div>
                <!-- Totals -->
                <div class="bg-gray-50 px-6 py-4 space-y-2">
                  <div class="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span><span>{{ cur }}{{ order().subtotal | number }}</span>
                  </div>
                  @if (order().tax > 0) {
                    <div class="flex justify-between text-sm text-gray-600">
                      <span>Tax (GST)</span><span>{{ cur }}{{ order().tax | number }}</span>
                    </div>
                  }
                  <div class="flex justify-between text-sm text-gray-600">
                    <span>Shipping</span><span>{{ cur }}{{ order().shipping | number }}</span>
                  </div>
                  <div class="flex justify-between text-sm text-gray-600">
                    <span>Discount</span><span class="text-green-600">-{{ cur }}{{ order().discount | number }}</span>
                  </div>
                  <p-divider styleClass="my-2" />
                  <div class="flex justify-between font-bold text-base text-gray-900">
                    <span>Total</span><span>{{ cur }}{{ order().total | number }}</span>
                  </div>
                </div>
              } @else {
                <!-- EDIT MODE -->
                <div class="divide-y divide-gray-100">
                  @for (item of editItems(); track $index) {
                    <div class="p-4">
                      <div class="flex items-center gap-2 mb-3">
                        <input pInputText [(ngModel)]="item.name" placeholder="Item name" class="flex-1 text-sm" />
                        <button pButton icon="pi pi-trash" class="p-button-text p-button-rounded p-button-sm" severity="danger" (click)="removeItem($index)"></button>
                      </div>
                      <div class="flex flex-wrap items-end gap-4">
                        <div>
                          <label class="block text-xs text-gray-500 mb-1">Quantity</label>
                          <div class="w-32">
                            <p-inputNumber [(ngModel)]="item.qty" [min]="1" [showButtons]="true" buttonLayout="horizontal"
                              incrementButtonIcon="pi pi-plus" decrementButtonIcon="pi pi-minus" styleClass="w-full" inputStyleClass="w-full text-center" />
                          </div>
                        </div>
                        <div>
                          <label class="block text-xs text-gray-500 mb-1">Unit Price</label>
                          <div class="w-40">
                            <p-inputNumber [(ngModel)]="item.unitPrice" [min]="0" mode="currency" [currency]="order().currency || 'INR'"
                              [maxFractionDigits]="2" styleClass="w-full" inputStyleClass="w-full" />
                          </div>
                        </div>
                        <div class="ml-auto text-right">
                          <label class="block text-xs text-gray-500 mb-1">Line Total</label>
                          <span class="font-semibold text-gray-800">{{ cur }}{{ (item.qty * item.unitPrice) | number }}</span>
                        </div>
                      </div>
                    </div>
                  }
                </div>

                <!-- Add product -->
                <div class="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
                  <p-autoComplete
                    [(ngModel)]="productQuery"
                    [suggestions]="productSuggestions()"
                    (completeMethod)="searchProducts($event)"
                    (onSelect)="addProduct($event.value)"
                    optionLabel="name"
                    placeholder="Search a product to add..."
                    styleClass="flex-1"
                    appendTo="body"
                    [forceSelection]="false"
                    [delay]="250"
                  >
                    <ng-template let-p pTemplate="item">
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-sm">{{ p.name }}</span>
                        <span class="text-xs text-gray-500">{{ cur }}{{ p._price | number }}</span>
                      </div>
                    </ng-template>
                  </p-autoComplete>
                  <button pButton label="Custom item" icon="pi pi-plus" class="p-button-outlined p-button-sm whitespace-nowrap" (click)="addCustomItem()"></button>
                </div>

                <!-- Editable totals -->
                <div class="bg-gray-50 px-6 py-4 space-y-2 border-t border-gray-100">
                  <div class="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span><span>{{ cur }}{{ editSubtotal() | number }}</span>
                  </div>
                  <div class="flex justify-between items-center text-sm text-gray-600">
                    <span>Delivery fee</span>
                    <p-inputNumber [(ngModel)]="editDeliveryFee" [min]="0" mode="currency" [currency]="order().currency || 'INR'" [maxFractionDigits]="2" inputStyleClass="w-28 text-right" styleClass="w-32" />
                  </div>
                  <div class="flex justify-between items-center text-sm text-gray-600">
                    <span>Discount</span>
                    <p-inputNumber [(ngModel)]="editDiscount" [min]="0" mode="currency" [currency]="order().currency || 'INR'" [maxFractionDigits]="2" inputStyleClass="w-28 text-right" styleClass="w-32" />
                  </div>
                  <p-divider styleClass="my-2" />
                  <div class="flex justify-between font-bold text-base text-gray-900">
                    <span>Total</span><span>{{ cur }}{{ editTotal() | number }}</span>
                  </div>
                </div>
              }
            </div>

            <!-- Delivery info -->
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 class="text-base font-semibold text-gray-900 mb-4">Delivery Information</h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-xs text-gray-400 uppercase tracking-wider font-medium">Shipping Address</p>
                  <p class="text-sm text-gray-800 mt-1">{{ order().address || 'Not provided' }}</p>
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
                <p><span class="text-gray-400">Total spent:</span> {{ cur }}{{ order().customer.totalSpent | number }}</p>
              </div>
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
                  <span class="font-medium">{{ order().paymentMethod || '—' }}</span>
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
              @if (editing()) {
                <textarea pTextarea [(ngModel)]="editNotes" rows="3" class="w-full text-sm" placeholder="Add a note for this order..."></textarea>
              } @else {
                <p class="text-sm text-gray-600 italic">{{ order().notes || 'No notes for this order.' }}</p>
              }
            </div>
          </div>
        </div>
      }

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
            appendTo="body"
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
  private readonly orderService = inject(OrderService);
  private readonly productService = inject(ProductService);

  statusDialog = false;
  newStatus = '';

  // Edit state
  editing = signal(false);
  saving = signal(false);
  editItems = signal<EditItem[]>([]);
  editDiscount = 0;
  editDeliveryFee = 0;
  editNotes = '';
  productQuery: any = '';
  productSuggestions = signal<any[]>([]);

  // Plain methods (not computed signals): item qty/price are mutated in place by
  // [(ngModel)], which doesn't notify the editItems signal — a method re-runs each
  // change-detection cycle so the live Subtotal/Total stay in sync as you edit.
  editSubtotal(): number {
    return this.editItems().reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  }
  editTotal(): number {
    return Math.max(0, this.editSubtotal() - (Number(this.editDiscount) || 0) + (Number(this.editDeliveryFee) || 0));
  }

  // Currency symbol for the store/order (defaults to INR ₹).
  private static readonly CURRENCY_SYMBOLS: Record<string, string> = {
    INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', NGN: '₦',
  };
  get cur(): string {
    const code = (this.order()?.currency || 'INR').toUpperCase();
    return OrderDetailComponent.CURRENCY_SYMBOLS[code] || '₹';
  }

  // Status vocabulary aligned with the order events + notification workflows
  // (created/confirmed/processing/out_for_delivery/delivered/cancelled).
  statusOptions = [
    { label: 'Pending', value: 'pending' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Processing', value: 'processing' },
    { label: 'Out for Delivery', value: 'out_for_delivery' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  loading = signal(true);

  orderSteps = [
    { label: 'Pending', icon: 'pi-clock', completed: false, active: true },
    { label: 'Confirmed', icon: 'pi-check-circle', completed: false, active: false },
    { label: 'Processing', icon: 'pi-cog', completed: false, active: false },
    { label: 'Out for Delivery', icon: 'pi-truck', completed: false, active: false },
    { label: 'Delivered', icon: 'pi-home', completed: false, active: false },
  ];

  order = signal<any>({
    orderNumber: '', date: '', status: 'pending', currency: 'INR',
    paymentStatus: 'pending', paymentMethod: '', paymentRef: '',
    subtotal: 0, shipping: 0, tax: 0, discount: 0, total: 0,
    address: '', deliveryMethod: '', notes: '',
    customer: { name: '', initials: '', phone: '', totalOrders: 0, totalSpent: 0 },
    items: [],
  });

  ngOnInit() {
    this.loadOrder();
  }

  private loadOrder() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.loading.set(true);
    this.orderService.getById(id).subscribe({
      next: (o: any) => {
        // NOTE: the API response interceptor camelCases all keys (totalAmount,
        // whatsappName, imageUrls, …); snake_case kept only as a fallback.
        const c = o.customer || {};
        const custName = c.whatsappName || c.whatsapp_name || c.name || c.whatsappPhone || c.whatsapp_phone || c.phone || 'Customer';
        const initials = custName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
        const addr = o.shippingAddress || o.shipping_address || o.address;
        const addressStr = typeof addr === 'string'
          ? addr
          : addr ? [addr.street, addr.city, addr.postalCode || addr.postal_code].filter(Boolean).join(', ') : '';
        const placed = o.placedAt || o.placed_at || o.createdAt || o.created_at;
        const pay = o.payment || {};
        this.order.set({
          orderNumber: o.orderNumber || o.order_number || '',
          date: placed ? new Date(placed).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
          status: o.status || 'pending',
          currency: o.currency || 'INR',
          paymentStatus: pay.status || o.paymentStatus || o.payment_status || 'pending',
          paymentMethod: pay.method || o.paymentMethod || '',
          paymentRef: pay.transactionRef || pay.transaction_ref || o.paymentRef || '',
          subtotal: Number(o.subtotal) || 0,
          shipping: Number(o.deliveryFee ?? o.delivery_fee ?? o.shipping) || 0,
          tax: Number(o.taxAmount ?? o.tax_amount) || 0,
          discount: Number(o.discount) || 0,
          total: Number(o.totalAmount ?? o.total_amount ?? o.total) || 0,
          address: addressStr,
          deliveryMethod: o.delivery?.providerName || o.delivery?.provider_name || 'Standard Delivery',
          notes: o.notes || '',
          customer: {
            name: custName,
            initials,
            phone: c.whatsappPhone || c.whatsapp_phone || c.phone || '',
            totalOrders: c.totalOrders ?? c.total_orders ?? 0,
            totalSpent: Number(c.totalSpent ?? c.total_spent ?? 0),
          },
          items: (o.items || o.orderItems || o.order_items || []).map((item: any) => ({
            id: item.id,
            productId: item.productId || item.product_id || null,
            name: item.productName || item.product_name || item.name || 'Item',
            sku: item.sku || '',
            variant: item.variantName || item.variant_name || null,
            qty: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice ?? item.unit_price) || 0,
            total: Number(item.totalPrice ?? item.total_price) || (Number(item.unitPrice ?? item.unit_price) || 0) * (Number(item.quantity) || 1),
            image: (Array.isArray(item.imageUrls) && item.imageUrls[0]) || (Array.isArray(item.image_urls) && item.image_urls[0]) || item.image || 'https://placehold.co/80x80/f3f4f6/9ca3af?text=No+Image',
          })),
        });
        this.updateOrderSteps(o.status);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
  }

  private updateOrderSteps(status: string) {
    const steps = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered'];
    const currentIdx = steps.indexOf(status);
    this.orderSteps = [
      { label: 'Pending', icon: 'pi-clock', completed: currentIdx > 0, active: currentIdx === 0 },
      { label: 'Confirmed', icon: 'pi-check-circle', completed: currentIdx > 1, active: currentIdx === 1 },
      { label: 'Processing', icon: 'pi-cog', completed: currentIdx > 2, active: currentIdx === 2 },
      { label: 'Out for Delivery', icon: 'pi-truck', completed: currentIdx > 3, active: currentIdx === 3 },
      { label: 'Delivered', icon: 'pi-home', completed: currentIdx >= 4, active: currentIdx === 4 },
    ];
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      pending: 'warn', confirmed: 'info', processing: 'info',
      out_for_delivery: 'secondary', shipped: 'secondary',
      delivered: 'success', completed: 'success',
      cancelled: 'danger', canceled: 'danger',
    };
    return map[status] ?? 'secondary';
  }

  getPaymentSeverity(status: string): any {
    const map: Record<string, any> = { paid: 'success', pending: 'warn', failed: 'danger', refunded: 'secondary' };
    return map[status] ?? 'secondary';
  }

  // ─── Edit mode ────────────────────────────────────────────────────────────
  startEdit() {
    const o = this.order();
    this.editItems.set(o.items.map((it: any) => ({ productId: it.productId, name: it.name, qty: it.qty, unitPrice: it.unitPrice, image: it.image })));
    this.editDiscount = o.discount || 0;
    this.editDeliveryFee = o.shipping || 0;
    this.editNotes = o.notes || '';
    this.editing.set(true);
  }

  cancelEdit() {
    this.editing.set(false);
    this.productQuery = '';
    this.productSuggestions.set([]);
  }

  removeItem(index: number) {
    this.editItems.update(items => items.filter((_, i) => i !== index));
  }

  addCustomItem() {
    this.editItems.update(items => [...items, { name: '', qty: 1, unitPrice: 0 }]);
  }

  searchProducts(event: { query: string }) {
    const q = (event.query || '').trim();
    this.productService.getAll({ search: q, limit: 8 } as any).subscribe({
      next: (res: any) => {
        const list = res?.data || res?.items || res || [];
        this.productSuggestions.set(list.map((p: any) => ({
          ...p,
          _price: Number(p.salePrice ?? p.sale_price ?? p.basePrice ?? p.base_price ?? p.price ?? 0),
        })));
      },
      error: () => this.productSuggestions.set([]),
    });
  }

  addProduct(p: any) {
    if (!p || typeof p !== 'object') return;
    const price = Number(p._price ?? p.salePrice ?? p.sale_price ?? p.basePrice ?? p.base_price ?? p.price ?? 0);
    this.editItems.update(items => [...items, { productId: p.id, name: p.name, qty: 1, unitPrice: price, image: p.thumbnail || (p.images && p.images[0]) }]);
    this.productQuery = '';
    this.productSuggestions.set([]);
  }

  saveEdit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    const items = this.editItems()
      .filter(it => (it.name || '').trim() && Number(it.qty) > 0)
      .map(it => ({ productId: it.productId, productName: it.name, quantity: Number(it.qty), unitPrice: Number(it.unitPrice) }));
    if (items.length === 0) {
      this.messageService.add({ severity: 'warn', summary: 'No items', detail: 'An order must have at least one item.' });
      return;
    }
    this.saving.set(true);
    this.orderService.updateOrder(id, {
      items,
      discount: Number(this.editDiscount) || 0,
      deliveryFee: Number(this.editDeliveryFee) || 0,
      notes: this.editNotes,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.loadOrder();
        this.messageService.add({ severity: 'success', summary: 'Order Updated', detail: 'The order has been saved.' });
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save the order.' });
      },
    });
  }

  updateStatus() {
    if (!this.newStatus) return;
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.orderService.updateStatus(id, { status: this.newStatus as OrderStatus }).subscribe({
      next: () => {
        this.order.update(o => ({ ...o, status: this.newStatus }));
        this.updateOrderSteps(this.newStatus);
        this.statusDialog = false;
        this.messageService.add({ severity: 'success', summary: 'Status Updated', detail: `Order status changed to ${this.newStatus}` });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update status' });
      },
    });
  }
}
