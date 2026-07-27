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
import { PermissionService } from '../../core/services/permission.service';
import { PromoCartService } from '../shared/promo-cart.service';
import { PromoSectionComponent } from '../shared/promo-section.component';
import { PartyPickerComponent } from '../entry/party-picker.component';
import { ProductPickerComponent, PickedProduct } from '../entry/product-picker.component';
import { CustomerContext, SupplierContext } from '../../core/services/entry.service';

interface QuoteItem {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

@Component({
  selector: 'wa-quote-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    ButtonModule, InputTextModule, TextareaModule, InputNumberModule,
    SelectModule, DatePickerModule, DividerModule, ToastModule, CardModule,
    PromoSectionComponent, PartyPickerComponent, ProductPickerComponent,
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
            <wa-party-picker [party]="editParty()" (selected)="onParty($event)" (cleared)="onPartyCleared()"
                             placeholder="Type customer name / phone / GSTIN…" />
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
                <div class="p-3 bg-gray-50 rounded-xl space-y-2">
                  <div class="flex items-start gap-2">
                    <div class="flex-1 min-w-0">
                      <wa-product-picker [name]="item.description" (nameChange)="item.description = $event"
                                         [customerId]="customerId" mode="sale"
                                         (picked)="onProductPicked(i, $event)" />
                    </div>
                    <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded p-button-danger shrink-0" (click)="removeItem(i)"></button>
                  </div>
                  <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 items-end">
                    <div>
                      <label class="text-[10px] text-gray-400 font-medium">Qty</label>
                      <p-inputNumber [(ngModel)]="item.quantity" [min]="1" (onInput)="recalculate()" styleClass="w-full" inputStyleClass="w-full text-center" />
                    </div>
                    <div>
                      <label class="text-[10px] text-gray-400 font-medium">Unit price</label>
                      <p-inputNumber [(ngModel)]="item.unitPrice" [min]="0" mode="currency" currency="INR" locale="en-IN" (onInput)="recalculate()" styleClass="w-full" inputStyleClass="w-full" />
                    </div>
                    <div>
                      <label class="text-[10px] text-gray-400 font-medium">Discount %</label>
                      <p-inputNumber [(ngModel)]="item.discount" [min]="0" [max]="100" suffix="%" (onInput)="recalculate()" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
                    </div>
                    <div class="text-right col-span-3 sm:col-span-1 border-t sm:border-t-0 border-gray-200 pt-2 sm:pt-0">
                      <label class="text-[10px] text-gray-400 font-medium">Line total</label>
                      <p class="text-sm font-semibold tabular-nums">\u20B9{{ lineTotal(item) | number:'1.0-2' }}</p>
                    </div>
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
            @if (lineDiscountTotal() > 0) {
              <div class="flex justify-between text-green-700"><span>Line discounts</span><span class="tabular-nums">-\u20B9{{ lineDiscountTotal() | number:'1.2-2' }}</span></div>
            }

            <wa-promo-section [promo]="promo" (apply)="applyCoupon($event)" />
            @if (promo.couponDiscount() > 0) {
              <div class="flex justify-between text-green-700"><span>Coupon</span><span class="tabular-nums">-\u20B9{{ promo.couponDiscount() | number:'1.2-2' }}</span></div>
            }

            <div class="flex justify-between font-bold text-base pt-1.5 border-t border-gray-100"><span>Total</span><span class="tabular-nums">\u20B9{{ total() | number:'1.2-2' }}</span></div>
            @if (perms.canWrite('quotes')) {
              <button pButton class="w-full mt-3" [label]="saving() ? 'Saving\u2026' : (isEdit() ? 'Update & send quote' : 'Create quote')"
                icon="pi pi-check" severity="success" [disabled]="!canSave() || saving()" (click)="save()"></button>
            }
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
  readonly perms = inject(PermissionService);
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

  subtotal = signal(0);
  lineDiscountTotal = signal(0);
  total = computed(() => Math.max(0, this.subtotal() - this.lineDiscountTotal() - this.promo.totalDiscount()));

  /** Net total for one line: qty × price − discount% (never negative). */
  lineTotal(item: QuoteItem): number {
    const gross = (item.quantity || 0) * (item.unitPrice || 0);
    const pct = Math.min(100, Math.max(0, Number(item.discount) || 0));
    return Math.max(0, gross - (gross * pct) / 100);
  }

  readonly editParty = signal<{ id: string; name: string } | null>(null);
  /** The party's agreed discount — applied to fresh line items automatically. */
  partyDiscount = 0;

  onParty(ctx: CustomerContext | SupplierContext) {
    this.customerId = ctx.id;
    this.partyDiscount = Number((ctx as CustomerContext).defaultDiscountPct) || 0;
    // Fill the party's default discount on any line that hasn't set one yet.
    if (this.partyDiscount > 0) {
      for (const it of this.items) if (!it.discount) it.discount = this.partyDiscount;
      this.recalculate();
    }
    this.refreshPromo();
  }
  onPartyCleared() { this.customerId = ''; this.partyDiscount = 0; this.refreshPromo(); }

  private promoLines() { return this.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })); }
  refreshPromo() { this.promo.refresh(this.promoLines(), this.customerId || undefined); }
  applyCoupon(code: string) { this.promo.applyCoupon(code, this.promoLines(), this.customerId || undefined); }

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit.set(true);
      this.quoteId = id;
      this.loadQuote(id);
    } else {
      this.addItem();
    }
  }

  loadQuote(id: string) {
    this.loading.set(true);
    this.api.get<any>(`/quotes/${id}`).subscribe({
      next: (q) => {
        // Editable while draft or sent; locked once accepted/converted/rejected.
        // Guard the direct /edit URL too, not just the hidden button.
        const status = q.status;
        if (this.isEdit() && status && !['draft', 'sent'].includes(status)) {
          this.loading.set(false);
          this.messageService.add({ severity: 'warn', summary: 'Locked', detail: `This quote is ${status} and can no longer be edited.` });
          this.router.navigate(['/quotes', this.quoteId]);
          return;
        }
        // The API interceptor returns camelCase; keep snake_case as a fallback.
        this.title = q.title ?? '';
        this.customerId = q.customerId ?? q.customer_id ?? '';
        if (this.customerId) this.editParty.set({ id: this.customerId, name: q.customerName ?? q.customer_name ?? '' });
        this.notes = q.notes || '';
        const validUntil = q.validUntil ?? q.valid_until;
        this.validUntil = validUntil ? new Date(validUntil) : null;
        this.items = (q.items || []).map((item: any) => ({
          productId: item.productId ?? item.product_id ?? null,
          description: item.description,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice ?? item.unit_price) || 0,
          discount: Number(item.discount) || 0,
        }));
        this.recalculate();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  addItem() {
    this.items.push({ description: '', quantity: 1, unitPrice: 0, discount: this.partyDiscount || 0 });
  }

  removeItem(index: number) {
    this.items.splice(index, 1);
    this.recalculate();
  }

  /** Product chosen from the picker → fill the row's id, description & rate. */
  onProductPicked(index: number, p: PickedProduct) {
    const item = this.items[index];
    item.productId = p.id;
    item.description = p.name;
    item.unitPrice = p.rate || item.unitPrice;
    this.recalculate();
  }

  recalculate() {
    let gross = 0, disc = 0;
    for (const item of this.items) {
      const g = (item.quantity || 0) * (item.unitPrice || 0);
      const pct = Math.min(100, Math.max(0, Number(item.discount) || 0));
      gross += g;
      disc += (g * pct) / 100;
    }
    this.subtotal.set(gross);
    this.lineDiscountTotal.set(disc);
    this.refreshPromo();
  }

  canSave(): boolean {
    return !!this.customerId && this.items.length > 0 && this.items.every(i => i.description && i.quantity > 0);
  }

  save() {
    if (!this.perms.canWrite('quotes')) return;
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
          discount: Number(i.discount) || 0,
        })),
        ...freeItems,
      ],
    };

    const req = this.isEdit()
      ? this.api.put(`/quotes/${this.quoteId}`, payload)
      : this.api.post('/quotes', payload);

    req.subscribe({
      next: () => {
        // On edit, also (re)send the quote to the customer so they get the revised version.
        if (this.isEdit()) {
          this.api.patch(`/quotes/${this.quoteId}/status`, { status: 'sent' }).subscribe({
            next: () => {
              this.messageService.add({ severity: 'success', summary: 'Updated & sent', detail: 'The customer has been sent the revised quote.' });
              this.saving.set(false);
              this.router.navigate(['/quotes']);
            },
            error: () => {
              this.messageService.add({ severity: 'warn', summary: 'Updated', detail: 'Quote saved, but could not send it to the customer.' });
              this.saving.set(false);
              this.router.navigate(['/quotes']);
            },
          });
          return;
        }
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Quote created successfully' });
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
