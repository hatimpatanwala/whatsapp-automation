import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { returnToWhatsApp } from './webview-return';

interface Pick { id: string; name: string; phone?: string; price?: number; }
interface Line { productId: string; description: string; quantity: number; unitPrice: number; }

/**
 * Token-authenticated WhatsApp webview (/m/invoice-builder) — an admin bills a
 * customer from inside WhatsApp: pick customer, add items, choose document type
 * + order status, and issue/send the invoice. Auth is purely the ?token= 'invoice'
 * session; uses a bare HttpClient so no app interceptors/session are involved.
 */
@Component({
  selector: 'wa-invoice-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-32">
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-green-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <i class="pi pi-receipt" style="font-size:1.05rem"></i>
          </div>
          <div class="min-w-0">
            <h1 class="text-[15px] font-bold text-gray-900 truncate leading-tight">New invoice</h1>
            <p class="text-[11px] text-gray-400 leading-tight truncate">{{ store()?.name || 'Store' }}</p>
          </div>
        </div>
      </header>

      @if (!token() || loadError()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ loadError() || 'Missing or invalid link.' }}</p>
          </div>
        </div>
      } @else if (loading()) {
        <p class="text-center text-sm text-gray-400 py-16"><i class="pi pi-spin pi-spinner mr-1"></i>Loading…</p>
      } @else if (result(); as r) {
        <!-- ── SUCCESS ── -->
        <div class="max-w-md mx-auto p-6">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <p class="text-5xl mb-2">🧾</p>
            <p class="text-lg font-bold text-gray-900">Invoice {{ r.sent ? 'sent' : 'created' }}</p>
            @if (r.invoiceNumber) { <p class="text-sm text-gray-500 mt-1">{{ r.invoiceNumber }} · order {{ r.orderNumber }}</p> }
            @else { <p class="text-sm text-gray-500 mt-1">Order {{ r.orderNumber }} created.</p> }
            @if (r.sent) { <p class="text-xs text-green-700 mt-2">Delivered to the customer on WhatsApp.</p> }
            <button class="mt-5 w-full bg-green-600 text-white font-semibold rounded-xl py-3 text-sm" (click)="back()">
              <i class="pi pi-whatsapp mr-1"></i>Back to chat
            </button>
            <button class="mt-3 text-sm text-gray-500 font-medium" (click)="another()">Create another</button>
          </div>
        </div>
      } @else {
        <div class="max-w-2xl mx-auto p-3 space-y-3">

          <!-- Customer -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <label class="text-xs font-semibold text-gray-500">Bill to</label>
            <select [ngModel]="customerId()" (ngModelChange)="customerId.set($event)"
              class="w-full mt-1.5 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/25 focus:border-green-400">
              <option value="">Select a customer…</option>
              @for (c of customers(); track c.id) {
                <option [value]="c.id">{{ c.name }}{{ c.phone ? ' · ' + c.phone : '' }}</option>
              }
            </select>
          </div>

          <!-- Line items -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-semibold text-gray-500">Items</label>
              <button class="text-xs font-semibold text-green-700" (click)="addLine()">+ Add item</button>
            </div>
            <div class="space-y-2.5">
              @for (l of lines(); track $index; let i = $index) {
                <div class="bg-gray-50 rounded-xl p-2.5">
                  <select [ngModel]="l.productId" (ngModelChange)="onProduct(i, $event)"
                    class="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white">
                    <option value="">Custom item…</option>
                    @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                  </select>
                  <input [(ngModel)]="l.description" class="w-full mt-1.5 border border-gray-200 rounded-lg px-2.5 py-2 text-sm" placeholder="Description" />
                  <div class="flex items-center gap-2 mt-1.5">
                    <div class="flex items-center bg-white border border-gray-200 rounded-lg h-9">
                      <button class="w-8 h-9 text-gray-500 font-bold" (click)="bump(i, -1)">−</button>
                      <span class="w-7 text-center text-sm font-bold tabular-nums">{{ l.quantity }}</span>
                      <button class="w-8 h-9 text-green-700 font-bold" (click)="bump(i, 1)">+</button>
                    </div>
                    <div class="flex items-center flex-1 border border-gray-200 rounded-lg h-9 px-2 bg-white">
                      <span class="text-gray-400 text-sm">₹</span>
                      <input type="number" [(ngModel)]="l.unitPrice" min="0" class="w-full text-sm outline-none px-1" placeholder="0" />
                    </div>
                    @if (lines().length > 1) {
                      <button class="w-9 h-9 text-red-400" (click)="removeLine(i)"><i class="pi pi-trash"></i></button>
                    }
                  </div>
                  <p class="text-right text-xs text-gray-500 mt-1">Line: ₹{{ (l.quantity * l.unitPrice) | number:'1.0-2' }}</p>
                </div>
              }
            </div>
            <div class="mt-3">
              <label class="text-xs font-semibold text-gray-500">Discount (₹)</label>
              <input type="number" [(ngModel)]="discount" min="0" class="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" placeholder="0" />
            </div>
          </div>

          <!-- Document -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div>
              <label class="text-xs font-semibold text-gray-500">Document type</label>
              <select [ngModel]="docType()" (ngModelChange)="docType.set($event)" class="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                @for (d of docTypes; track d.value) { <option [value]="d.value">{{ d.label }}</option> }
              </select>
              @if (docType() === 'tax_invoice' && store() && !store()!.hasGstin) {
                <p class="text-[11px] text-amber-600 mt-1"><i class="pi pi-exclamation-triangle mr-1"></i>No GSTIN set — a tax invoice can't be issued.</p>
              }
            </div>
            <div>
              <label class="text-xs font-semibold text-gray-500">Order status</label>
              <select [ngModel]="status()" (ngModelChange)="status.set($event)" class="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                @for (s of statuses; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
              </select>
            </div>
            <label class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-900">Send to customer</span>
              <input type="checkbox" [ngModel]="send()" (ngModelChange)="send.set($event)" class="w-5 h-5 accent-green-600" />
            </label>
          </div>
        </div>
      }

      <!-- Sticky submit -->
      @if (!loading() && !result() && token() && !loadError()) {
        <div class="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div class="max-w-2xl mx-auto flex items-center gap-3">
            <div class="shrink-0">
              <p class="text-gray-400 text-[11px] leading-none">Total</p>
              <p class="text-lg font-extrabold text-gray-900 leading-tight">₹{{ total() | number:'1.2-2' }}</p>
            </div>
            <button class="flex-1 bg-green-600 text-white font-bold rounded-xl py-3.5 text-sm shadow-sm disabled:opacity-40 flex items-center justify-center gap-2"
              [disabled]="!canSubmit() || submitting()" (click)="submit()">
              @if (submitting()) { <i class="pi pi-spin pi-spinner"></i> Working… }
              @else { <i class="pi pi-check-circle"></i> {{ send() ? 'Create & send invoice' : 'Create invoice' }} }
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class InvoiceBuilderComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly apiBase = environment.apiUrl;

  token = signal('');
  loading = signal(true);
  loadError = signal<string | null>(null);
  submitting = signal(false);

  store = signal<{ name: string; legalName?: string; hasGstin?: boolean; defaultDocType?: string } | null>(null);
  customers = signal<Pick[]>([]);
  products = signal<Pick[]>([]);
  result = signal<{ orderNumber: string; invoiceNumber: string | null; sent: boolean } | null>(null);

  customerId = signal('');
  lines = signal<Line[]>([{ productId: '', description: '', quantity: 1, unitPrice: 0 }]);
  discount = 0;
  docType = signal('tax_invoice');
  status = signal('confirmed');
  send = signal(true);
  private waPhone = '';

  docTypes = [
    { label: 'Tax Invoice', value: 'tax_invoice' },
    { label: 'Bill of Supply', value: 'bill_of_supply' },
    { label: 'Delivery Challan', value: 'delivery_challan' },
  ];
  statuses = [
    { label: 'Pending', value: 'pending' }, { label: 'Confirmed', value: 'confirmed' },
    { label: 'Processing', value: 'processing' }, { label: 'Out for delivery', value: 'out_for_delivery' },
    { label: 'Delivered', value: 'delivered' },
  ];

  subtotal = computed(() => this.lines().reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0));
  total = computed(() => Math.max(0, this.subtotal() - (Number(this.discount) || 0)));

  constructor() { this.http = new HttpClient(inject(HttpBackend)); }
  private unwrap<T>(r: any): T { return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T; }
  private opts() { return { headers: { 'X-Builder-Token': this.token() } }; }

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token') || '';
    this.token.set(t);
    if (!t) { this.loading.set(false); return; }
    this.http.get<any>(`${this.apiBase}/m/invoice/bootstrap`, this.opts()).subscribe({
      next: (r) => {
        const d = this.unwrap<any>(r) || {};
        this.store.set(d.store || { name: 'Store' });
        this.customers.set(d.customers || []);
        this.products.set(d.products || []);
        if (d.store?.defaultDocType) this.docType.set(d.store.defaultDocType);
        if (d.customer?.id) this.customerId.set(d.customer.id);
        if (d.customer?.phone) this.waPhone = d.customer.phone;
        this.loading.set(false);
      },
      error: (e) => { this.loading.set(false); this.loadError.set(e?.error?.message || 'This link is invalid or has expired.'); },
    });
  }

  addLine() { this.lines.update(l => [...l, { productId: '', description: '', quantity: 1, unitPrice: 0 }]); }
  removeLine(i: number) { this.lines.update(l => l.filter((_, idx) => idx !== i)); }
  bump(i: number, d: number) { this.lines.update(l => l.map((x, idx) => idx === i ? { ...x, quantity: Math.max(1, x.quantity + d) } : x)); }
  onProduct(i: number, productId: string) {
    this.lines.update(lines => lines.map((l, idx) => {
      if (idx !== i) return l;
      const p = this.products().find(x => x.id === productId);
      return { ...l, productId, description: p?.name || l.description, unitPrice: p ? (p.price || 0) : l.unitPrice };
    }));
  }

  canSubmit(): boolean { return !!this.customerId() && this.lines().some(l => l.description?.trim() && l.quantity > 0); }

  submit() {
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true);
    const body = {
      customerId: this.customerId(),
      items: this.lines().filter(l => l.description?.trim()).map(l => ({ productId: l.productId || undefined, productName: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
      discount: Number(this.discount) || 0,
      status: this.status(), docType: this.docType(), send: this.send(),
    };
    this.http.post<any>(`${this.apiBase}/m/invoice/create`, body, this.opts()).subscribe({
      next: (r) => {
        const d = this.unwrap<any>(r) || {};
        this.submitting.set(false);
        this.result.set({ orderNumber: d.orderNumber, invoiceNumber: d.invoiceNumber, sent: !!d.sent });
      },
      error: (e) => { this.submitting.set(false); alert(e?.error?.message || 'Could not create the invoice.'); },
    });
  }

  another() {
    this.result.set(null);
    this.lines.set([{ productId: '', description: '', quantity: 1, unitPrice: 0 }]);
    this.discount = 0;
  }
  back() { returnToWhatsApp(this.waPhone); }
}
