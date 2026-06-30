import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { PromoCartService } from '../shared/promo-cart.service';
import { PromoSectionComponent } from '../shared/promo-section.component';

interface QuoteItem {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

@Component({
  selector: 'wa-quote-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    ButtonModule, InputTextModule, TextareaModule, InputNumberModule,
    SelectModule, DatePickerModule, DividerModule, ToastModule, CardModule,
    PromoSectionComponent,
  ],
  providers: [MessageService, PromoCartService],
  template: `
    <div class="p-4 max-w-5xl mx-auto">
      <p-toast />

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/quotes"></button>
          <div>
            <h2 class="text-2xl font-bold text-gray-900">{{ isEdit() ? 'Edit quote' : 'New quote' }}</h2>
            <p class="text-sm text-gray-500 mt-0.5">{{ isEdit() ? 'Update quote details' : 'Create a new quote for a customer' }}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Main form -->
        <div class="lg:col-span-2 space-y-5">

          <!-- Customer -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 class="text-base font-semibold text-gray-900">Quote for</h3>
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
                <p class="text-sm">No items yet \u2014 add your first line item.</p>
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
                    <p-inputNumber [(ngModel)]="item.quantity" [min]="1" (onInput)="recalculate()" styleClass="w-full" inputStyleClass="w-full text-center" />
                  </div>
                  <div class="w-28">
                    <label class="text-[10px] text-gray-400 font-medium">Unit price</label>
                    <p-inputNumber [(ngModel)]="item.unitPrice" [min]="0" mode="currency" currency="INR" locale="en-IN" (onInput)="recalculate()" styleClass="w-full" inputStyleClass="w-full" />
                  </div>
                  <div class="flex flex-col items-end pt-4">
                    <span class="text-sm font-semibold tabular-nums">\u20B9{{ (item.quantity * item.unitPrice) | number:'1.0-2' }}</span>
                    <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded p-button-danger -mr-1" (click)="removeItem(i)"></button>
                  </div>
                </div>
              }
            </div>

            <textarea pTextarea [(ngModel)]="notes" rows="2" class="w-full mt-4" placeholder="Notes for this quote (optional)"></textarea>
          </div>
        </div>

        <!-- Right: quote options + summary -->
        <div class="space-y-5">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 class="text-base font-semibold text-gray-900">Quote details</h3>
            <div>
              <label class="text-xs font-medium text-gray-500">Title <span class="text-gray-300">(optional)</span></label>
              <input pInputText [(ngModel)]="title" class="w-full" placeholder="e.g. Website Redesign Package" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Valid until</label>
              <p-datepicker [(ngModel)]="validUntil" [showIcon]="true" dateFormat="yy-mm-dd" styleClass="w-full" [minDate]="today" appendTo="body" />
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-1.5 text-sm">
            <h3 class="text-base font-semibold text-gray-900 mb-2">Summary</h3>
            <div class="flex justify-between text-gray-600"><span>Items</span><span class="tabular-nums">{{ items.length }}</span></div>
            <div class="flex justify-between text-gray-600"><span>Subtotal</span><span class="tabular-nums">\u20B9{{ subtotal() | number:'1.2-2' }}</span></div>

            <wa-promo-section [promo]="promo" (apply)="applyCoupon($event)" />
            @if (promo.couponDiscount() > 0) {
              <div class="flex justify-between text-green-700"><span>Coupon</span><span class="tabular-nums">-\u20B9{{ promo.couponDiscount() | number:'1.2-2' }}</span></div>
            }

            <div class="flex justify-between font-bold text-base pt-1.5 border-t border-gray-100"><span>Total</span><span class="tabular-nums">\u20B9{{ total() | number:'1.2-2' }}</span></div>
            <button pButton class="w-full mt-3" [label]="saving() ? 'Saving\u2026' : (isEdit() ? 'Update quote' : 'Create quote')"
              icon="pi pi-check" severity="success" [disabled]="!canSave() || saving()" (click)="save()"></button>
            <button pButton class="w-full" label="Cancel" icon="pi pi-times" severity="secondary" [outlined]="true" routerLink="/quotes"></button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class QuoteFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);
  readonly promo = inject(PromoCartService);

  isEdit = signal(false);
  quoteId = '';
  saving = signal(false);
  loading = signal(false);

  title = '';
  customerId = '';
  validUntil: Date | null = null;
  notes = '';
  items: QuoteItem[] = [];
  today = new Date();

  customers = signal<{ label: string; value: string }[]>([]);
  products = signal<{ label: string; value: string; price?: number; name?: string }[]>([]);

  subtotal = signal(0);
  total = computed(() => Math.max(0, this.subtotal() - this.promo.totalDiscount()));

  private promoLines() { return this.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })); }
  refreshPromo() { this.promo.refresh(this.promoLines(), this.customerId || undefined); }
  applyCoupon(code: string) { this.promo.applyCoupon(code, this.promoLines(), this.customerId || undefined); }

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit.set(true);
      this.quoteId = id;
      this.loading.set(true);
      // Load the customer + product options BEFORE the quote so the dropdowns
      // can pre-select. p-select with optionValue won't render a selection if the
      // model is set while the options array is still empty (load-order race).
      forkJoin({
        customers: this.api.get<any>('/customers', { limit: 500 }),
        products: this.api.get<any>('/products', { limit: 500 }),
      }).subscribe({
        next: ({ customers, products }) => {
          this.setCustomers(customers);
          this.setProducts(products);
          this.loadQuote(id);
        },
        error: () => { this.loadCustomers(); this.loadProducts(); this.loadQuote(id); },
      });
    } else {
      this.loadCustomers();
      this.loadProducts();
      this.addItem();
    }
  }

  private arr(r: any): any[] { return Array.isArray(r) ? r : (r?.data ?? r?.items ?? []); }

  private setCustomers(r: any) {
    this.customers.set(this.arr(r).map((c: any) => ({
      label: `${c.displayName || c.whatsappName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.whatsappPhone || c.phone || 'Customer'}${(c.whatsappPhone || c.phone) ? ' \u00B7 ' + (c.whatsappPhone || c.phone) : ''}`,
      value: c.id,
    })));
  }

  private setProducts(r: any) {
    this.products.set(this.arr(r).map((p: any) => ({
      label: `${p.name} \u2014 \u20B9${Number(p.price) || 0}`,
      value: p.id,
      price: Number(p.price) || 0,
      name: p.name,
    })));
  }

  loadCustomers() {
    this.api.get<any>('/customers', { limit: 500 }).subscribe({ next: (r) => this.setCustomers(r) });
  }

  loadProducts() {
    this.api.get<any>('/products', { limit: 500 }).subscribe({ next: (r) => this.setProducts(r) });
  }

  loadQuote(id: string) {
    this.loading.set(true);
    this.api.get<any>(`/quotes/${id}`).subscribe({
      next: (q) => {
        // Only drafts are editable — once sent/accepted the quote is locked.
        // Guard the direct /edit URL too, not just the hidden button.
        const status = q.status;
        if (this.isEdit() && status && status !== 'draft') {
          this.loading.set(false);
          this.messageService.add({ severity: 'warn', summary: 'Locked', detail: `This quote is ${status} and can no longer be edited.` });
          this.router.navigate(['/quotes', this.quoteId]);
          return;
        }
        // The API interceptor returns camelCase; keep snake_case as a fallback.
        this.title = q.title ?? '';
        this.customerId = q.customerId ?? q.customer_id ?? '';
        this.notes = q.notes || '';
        const validUntil = q.validUntil ?? q.valid_until;
        this.validUntil = validUntil ? new Date(validUntil) : null;
        this.items = (q.items || []).map((item: any) => ({
          productId: item.productId ?? item.product_id ?? null,
          description: item.description,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice ?? item.unit_price) || 0,
        }));
        this.recalculate();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  addItem() {
    this.items.push({ description: '', quantity: 1, unitPrice: 0 });
  }

  removeItem(index: number) {
    this.items.splice(index, 1);
    this.recalculate();
  }

  onProductSelect(index: number) {
    const item = this.items[index];
    if (item.productId) {
      const product = this.products().find(p => p.value === item.productId);
      if (product) {
        if (!item.description) item.description = product.name || '';
        if (!item.unitPrice && product.price) item.unitPrice = product.price;
        this.recalculate();
      }
    }
  }

  recalculate() {
    const total = this.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
    this.subtotal.set(total);
    this.refreshPromo();
  }

  canSave(): boolean {
    return !!this.customerId && this.items.length > 0 && this.items.every(i => i.description && i.quantity > 0);
  }

  save() {
    if (!this.canSave()) return;
    this.saving.set(true);

    const freeItems = this.promo.freeItems().map(f => ({
      productId: f.productId, description: '🎁 FREE: ' + f.name, quantity: f.quantity, unitPrice: 0,
    }));
    const payload = {
      customerId: this.customerId,
      title: this.title,
      notes: this.notes,
      validUntil: this.validUntil ? this.validUntil.toISOString() : undefined,
      // fold offer + coupon savings into the quote discount
      discount: this.promo.totalDiscount(),
      items: [
        ...this.items.map(i => ({
          productId: i.productId || undefined,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        ...freeItems,
      ],
    };

    const req = this.isEdit()
      ? this.api.put(`/quotes/${this.quoteId}`, payload)
      : this.api.post('/quotes', payload);

    req.subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEdit() ? 'Updated' : 'Created',
          detail: `Quote ${this.isEdit() ? 'updated' : 'created'} successfully`,
        });
        this.saving.set(false);
        this.router.navigate(['/quotes']);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save quote' });
        this.saving.set(false);
      },
    });
  }
}
