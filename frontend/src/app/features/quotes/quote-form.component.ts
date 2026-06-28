import { Component, OnInit, inject, signal } from '@angular/core';
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
import { ApiService } from '../../core/services/api.service';

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
  ],
  providers: [MessageService],
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

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main form -->
        <div class="lg:col-span-2 space-y-6">

          <!-- Quote details -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Quote details</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input pInputText [(ngModel)]="title" class="w-full" placeholder="e.g. Website Redesign Package" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                <p-select
                  [options]="customers()"
                  [(ngModel)]="customerId"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Select customer"
                  [filter]="true"
                  filterPlaceholder="Search customers..."
                  styleClass="w-full"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
                <p-datepicker [(ngModel)]="validUntil" [showIcon]="true" dateFormat="yy-mm-dd" styleClass="w-full" [minDate]="today" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea pTextarea [(ngModel)]="notes" [rows]="3" class="w-full" placeholder="Additional notes for the customer..."></textarea>
              </div>
            </div>
          </div>

          <!-- Line items -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
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
          </div>
        </div>

        <!-- Summary sidebar -->
        <div class="space-y-6">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sticky top-4">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Summary</h3>

            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between text-gray-600">
                <span>Items</span>
                <span class="font-medium tabular-nums">{{ items.length }}</span>
              </div>
              <div class="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span class="font-medium tabular-nums">\u20B9{{ subtotal() | number:'1.2-2' }}</span>
              </div>
              <div class="flex justify-between font-bold text-base pt-2 border-t border-gray-100">
                <span>Total</span>
                <span class="tabular-nums">\u20B9{{ subtotal() | number:'1.2-2' }}</span>
              </div>
            </div>

            <div class="mt-6 space-y-2">
              <p-button
                label="{{ isEdit() ? 'Update quote' : 'Create quote' }}"
                icon="pi pi-check"
                severity="success"
                styleClass="w-full"
                [loading]="saving()"
                (onClick)="save()"
                [disabled]="!canSave()"
              />
              <p-button
                label="Cancel"
                icon="pi pi-times"
                styleClass="w-full"
                severity="secondary"
                [outlined]="true"
                routerLink="/quotes"
              />
            </div>
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
  products = signal<{ label: string; value: string; price?: number }[]>([]);

  subtotal = signal(0);

  ngOnInit() {
    this.loadCustomers();
    this.loadProducts();

    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit.set(true);
      this.quoteId = id;
      this.loadQuote(id);
    } else {
      this.addItem();
    }
  }

  loadCustomers() {
    this.api.get<any>('/customers', { limit: 500 }).subscribe({
      next: (res) => {
        const list = (res.data || res || []).map((c: any) => ({
          label: `${c.name || 'Unknown'} (${c.phone})`,
          value: c.id,
        }));
        this.customers.set(list);
      },
    });
  }

  loadProducts() {
    this.api.get<any>('/products', { limit: 500 }).subscribe({
      next: (res) => {
        const list = (res.data || res || []).map((p: any) => ({
          label: `${p.name} - \u20B9${p.price}`,
          value: p.id,
          price: parseFloat(p.price),
        }));
        this.products.set(list);
      },
    });
  }

  loadQuote(id: string) {
    this.loading.set(true);
    this.api.get<any>(`/quotes/${id}`).subscribe({
      next: (q) => {
        this.title = q.title;
        this.customerId = q.customer_id;
        this.notes = q.notes || '';
        this.validUntil = q.valid_until ? new Date(q.valid_until) : null;
        this.items = (q.items || []).map((item: any) => ({
          productId: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unit_price),
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
        if (!item.description) item.description = product.label.split(' - ')[0];
        if (!item.unitPrice && product.price) item.unitPrice = product.price;
        this.recalculate();
      }
    }
  }

  recalculate() {
    const total = this.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
    this.subtotal.set(total);
  }

  canSave(): boolean {
    return !!this.customerId && this.items.length > 0 && this.items.every(i => i.description && i.quantity > 0);
  }

  save() {
    if (!this.canSave()) return;
    this.saving.set(true);

    const payload = {
      customerId: this.customerId,
      title: this.title,
      notes: this.notes,
      validUntil: this.validUntil ? this.validUntil.toISOString() : undefined,
      items: this.items.map(i => ({
        productId: i.productId || undefined,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
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
