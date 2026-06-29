import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/services/api.service';
import { PromoCartService } from '../shared/promo-cart.service';
import { PromoSectionComponent } from '../shared/promo-section.component';

interface OrderItem {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

/**
 * In-portal "New order" page — mirrors the Create Invoice / Create Quote card
 * layout (customer + line items on the left, details + summary on the right)
 * and reflows to a single column on phones. Creates the order via POST /orders.
 */
@Component({
  selector: 'wa-order-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    ButtonModule, InputTextModule, TextareaModule, InputNumberModule, SelectModule, ToastModule,
    PromoSectionComponent,
  ],
  providers: [MessageService, PromoCartService],
  template: `
    <div class="p-4 max-w-5xl mx-auto">
      <p-toast />

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/orders"></button>
          <div>
            <h2 class="text-2xl font-bold text-gray-900">New order</h2>
            <p class="text-sm text-gray-500 mt-0.5">Create an order for a customer</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Main -->
        <div class="lg:col-span-2 space-y-5">

          <!-- Customer -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 class="text-base font-semibold text-gray-900">Order for</h3>
            <p-select
              [options]="customers()"
              [(ngModel)]="customerId"
              optionLabel="label"
              optionValue="value"
              placeholder="Select a customer"
              [filter]="true"
              filterPlaceholder="Search customers..."
              styleClass="w-full"
              appendTo="body"
              (onChange)="refreshPromo()"
            />
          </div>

          <!-- Line items -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-base font-semibold text-gray-900">Line items</h3>
              <button pButton label="Add item" icon="pi pi-plus" class="p-button-text p-button-sm" (click)="addItem()"></button>
            </div>

            @if (items.length === 0) {
              <div class="text-center py-8 text-gray-400">
                <i class="pi pi-list text-3xl mb-2 block"></i>
                <p class="text-sm">No items yet — add your first line item.</p>
              </div>
            }

            <div class="space-y-2.5">
              @for (item of items; track $index; let i = $index) {
                <div class="flex flex-wrap items-start gap-2 p-2.5 bg-gray-50 rounded-xl">
                  <div class="flex-1 min-w-[10rem]">
                    <p-select
                      [options]="products()"
                      [(ngModel)]="item.productId"
                      optionLabel="label"
                      optionValue="value"
                      placeholder="Pick a product (optional)"
                      [showClear]="true"
                      [filter]="true"
                      styleClass="w-full"
                      appendTo="body"
                      (onChange)="onProductSelect(i)"
                    />
                    <input pInputText [(ngModel)]="item.description" class="w-full mt-1.5 text-sm" placeholder="Description" />
                  </div>
                  <div class="w-16">
                    <label class="text-[10px] text-gray-400 font-medium">Qty</label>
                    <p-inputNumber [(ngModel)]="item.quantity" [min]="1" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full text-center" />
                  </div>
                  <div class="w-28">
                    <label class="text-[10px] text-gray-400 font-medium">Unit price</label>
                    <p-inputNumber [(ngModel)]="item.unitPrice" [min]="0" mode="currency" currency="INR" locale="en-IN" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full" />
                  </div>
                  <div class="flex flex-col items-end pt-4">
                    <span class="text-sm font-semibold tabular-nums">₹{{ (item.quantity * item.unitPrice) | number:'1.0-2' }}</span>
                    <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded p-button-danger -mr-1" (click)="removeItem(i)"></button>
                  </div>
                </div>
              }
            </div>

            <div class="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label class="text-xs font-medium text-gray-500">Discount (₹)</label>
                <p-inputNumber [(ngModel)]="discount" [min]="0" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
              </div>
              <div>
                <label class="text-xs font-medium text-gray-500">Delivery fee (₹)</label>
                <p-inputNumber [(ngModel)]="deliveryFee" [min]="0" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
              </div>
            </div>
            <textarea pTextarea [(ngModel)]="notes" rows="2" class="w-full mt-3" placeholder="Notes for this order (optional)"></textarea>
          </div>
        </div>

        <!-- Right: order options + summary -->
        <div class="space-y-5">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 class="text-base font-semibold text-gray-900">Order details</h3>
            <div>
              <label class="text-xs font-medium text-gray-500">Status</label>
              <p-select [options]="statuses" [(ngModel)]="status" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-1.5 text-sm">
            <h3 class="text-base font-semibold text-gray-900 mb-2">Summary</h3>
            <div class="flex justify-between text-gray-600"><span>Subtotal</span><span class="tabular-nums">₹{{ subtotal() | number:'1.2-2' }}</span></div>
            @if (discount > 0) { <div class="flex justify-between text-green-700"><span>Discount</span><span class="tabular-nums">-₹{{ discount | number:'1.2-2' }}</span></div> }
            @if (deliveryFee > 0) { <div class="flex justify-between text-gray-600"><span>Delivery</span><span class="tabular-nums">₹{{ deliveryFee | number:'1.2-2' }}</span></div> }

            <wa-promo-section [promo]="promo" (apply)="applyCoupon($event)" />
            @if (promo.couponDiscount() > 0) {
              <div class="flex justify-between text-green-700"><span>Coupon</span><span class="tabular-nums">-₹{{ promo.couponDiscount() | number:'1.2-2' }}</span></div>
            }

            <div class="flex justify-between font-bold text-base pt-1.5 border-t border-gray-100"><span>Total</span><span class="tabular-nums">₹{{ total() | number:'1.2-2' }}</span></div>
            <button pButton class="w-full mt-3" [label]="saving() ? 'Creating…' : 'Create order'"
              icon="pi pi-check" severity="success" [disabled]="!canSave() || saving()" (click)="save()"></button>
            <button pButton class="w-full" label="Cancel" icon="pi pi-times" severity="secondary" [outlined]="true" routerLink="/orders"></button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OrderFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  readonly promo = inject(PromoCartService);

  saving = signal(false);

  customerId = '';
  status = 'pending';
  discount = 0;
  deliveryFee = 0;
  notes = '';
  items: OrderItem[] = [];

  customers = signal<{ label: string; value: string }[]>([]);
  products = signal<{ label: string; value: string; price?: number; name?: string }[]>([]);
  subtotal = signal(0);

  private arr(r: any): any[] { return Array.isArray(r) ? r : (r?.data ?? r?.items ?? []); }

  statuses = [
    { label: 'Pending', value: 'pending' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Processing', value: 'processing' },
    { label: 'Out for delivery', value: 'out_for_delivery' },
    { label: 'Delivered', value: 'delivered' },
  ];

  total = computed(() => Math.max(0, this.subtotal() - (Number(this.discount) || 0) - this.promo.totalDiscount() + (Number(this.deliveryFee) || 0)));

  /** Lines fed to the promotions engine. */
  private promoLines() { return this.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })); }
  refreshPromo() { this.promo.refresh(this.promoLines(), this.customerId || undefined); }
  applyCoupon(code: string) { this.promo.applyCoupon(code, this.promoLines(), this.customerId || undefined); }

  ngOnInit() {
    this.loadCustomers();
    this.loadProducts();
    this.addItem();
  }

  loadCustomers() {
    this.api.get<any>('/customers', { limit: 500 }).subscribe({
      next: (r) => this.customers.set(this.arr(r).map((c: any) => ({
        label: `${c.displayName || c.whatsappName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.whatsappPhone || 'Customer'}${c.whatsappPhone ? ' · ' + c.whatsappPhone : ''}`,
        value: c.id,
      }))),
    });
  }

  loadProducts() {
    this.api.get<any>('/products', { limit: 500 }).subscribe({
      next: (r) => this.products.set(this.arr(r).map((p: any) => ({ label: `${p.name} — ₹${Number(p.price) || 0}`, value: p.id, price: Number(p.price) || 0, name: p.name }))),
    });
  }

  addItem() { this.items.push({ productId: null, description: '', quantity: 1, unitPrice: 0 }); }
  removeItem(index: number) { this.items.splice(index, 1); this.recalc(); }

  onProductSelect(index: number) {
    const item = this.items[index];
    if (item.productId) {
      const product = this.products().find(p => p.value === item.productId);
      if (product) {
        if (!item.description) item.description = product.name || '';
        if (!item.unitPrice && product.price) item.unitPrice = product.price;
        this.recalc();
      }
    }
  }

  recalc() {
    this.subtotal.set(this.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0));
    this.refreshPromo();
  }

  canSave(): boolean {
    return !!this.customerId && this.items.length > 0 && this.items.every(i => i.description && i.quantity > 0);
  }

  save() {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    const lineItems = this.items.map(i => ({
      productId: i.productId || undefined,
      productName: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    }));
    const freeItems = this.promo.freeItems().map(f => ({
      productId: f.productId, productName: '🎁 FREE: ' + f.name, quantity: f.quantity, unitPrice: 0,
    }));
    const payload = {
      customerId: this.customerId,
      status: this.status,
      // Fold the offer/scheme discount in; the coupon goes as a code so the
      // backend validates it and records the redemption against the order.
      discount: (Number(this.discount) || 0) + this.promo.schemeDiscount(),
      couponCode: this.promo.appliedCoupon()?.code || undefined,
      deliveryFee: Number(this.deliveryFee) || 0,
      notes: this.notes || undefined,
      items: [...lineItems, ...freeItems],
    };
    this.api.post<any>('/orders', payload).subscribe({
      next: (r) => {
        this.messageService.add({ severity: 'success', summary: 'Created', detail: `Order ${r?.order_number || r?.orderNumber || ''} created` });
        this.saving.set(false);
        this.router.navigate(['/orders']);
      },
      error: (e) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Failed to create order' });
        this.saving.set(false);
      },
    });
  }
}
