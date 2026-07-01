import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BuilderApiService } from './builder-api.service';

/**
 * Read-only, token-secured view of an order/quote — the page a customer opens
 * from the "Check the order/quote" button. Responsive (phone webview + desktop).
 */
@Component({
  selector: 'wa-order-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900">
      <header class="bg-green-600 text-white shadow">
        <div class="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <i class="pi pi-whatsapp" style="font-size:1.1rem"></i>
          <h1 class="text-base font-semibold">{{ data() ? (data()!.type === 'quote' ? 'Your Quote' : 'Your Order') : 'Loading…' }}</h1>
        </div>
      </header>

      @if (loading()) {
        <div class="p-10 text-center text-gray-500 text-sm"><i class="pi pi-spin pi-spinner mr-2"></i>Loading…</div>
      }

      @if (error()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ error() }}</p>
          </div>
        </div>
      }

      @if (data(); as d) {
        <main class="max-w-3xl mx-auto p-4 space-y-4">
          <section class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-lg font-bold">{{ d.number }}</p>
                @if (d.title) { <p class="text-sm text-gray-500">{{ d.title }}</p> }
              </div>
              <span class="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600 uppercase">{{ d.status }}</span>
            </div>
            @if (d.customer?.name || d.customer?.phone) {
              <p class="text-xs text-gray-500 mt-2">{{ d.customer.name }} · {{ d.customer.phone }}</p>
            }
          </section>

          <section class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th class="text-left px-4 py-2">Item</th>
                  <th class="text-center px-2 py-2">Qty</th>
                  <th class="text-right px-2 py-2">Price</th>
                  <th class="text-right px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (it of d.items; track it.name) {
                  <tr [class.bg-amber-50]="it.free">
                    <td class="px-4 py-2">{{ it.name }}@if (it.free) { <span class="ml-1 text-[10px] font-bold text-amber-600">FREE</span> }</td>
                    <td class="text-center px-2 py-2">{{ it.quantity }}</td>
                    <td class="text-right px-2 py-2">{{ it.free ? 'Free' : sym(d.currency) + (it.unitPrice | number:'1.0-2') }}</td>
                    <td class="text-right px-4 py-2 font-medium">{{ it.free ? '—' : sym(d.currency) + (it.total | number:'1.0-2') }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>

          <section class="bg-white rounded-xl border border-gray-200 p-4 space-y-1.5 text-sm">
            <div class="flex justify-between text-gray-600"><span>Subtotal</span><span>{{ sym(d.currency) }}{{ d.subtotal | number:'1.0-2' }}</span></div>
            @if (d.discount > 0) { <div class="flex justify-between text-green-700"><span>Discount</span><span>-{{ sym(d.currency) }}{{ d.discount | number:'1.0-2' }}</span></div> }
            @if (d.taxAmount > 0) { <div class="flex justify-between text-gray-600"><span>Tax</span><span>{{ sym(d.currency) }}{{ d.taxAmount | number:'1.0-2' }}</span></div> }
            @if (d.deliveryFee > 0) { <div class="flex justify-between text-gray-600"><span>Delivery</span><span>{{ sym(d.currency) }}{{ d.deliveryFee | number:'1.0-2' }}</span></div> }
            <div class="flex items-center justify-between text-lg font-bold pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>{{ sym(d.currency) }}{{ d.total | number:'1.0-2' }}</span>
            </div>
            @if (d.validUntil) { <p class="text-xs text-gray-400 pt-1">Valid until {{ d.validUntil | date:'mediumDate' }}</p> }
            @if (d.notes) { <p class="text-xs text-gray-500 pt-1 italic">{{ d.notes }}</p> }
            <p class="text-xs text-gray-400 pt-1">Reply in WhatsApp if you have any questions or to confirm.</p>
          </section>

          <!-- Customer accept/reject — only for a quote that's been sent and is still open. -->
          @if (d.type === 'quote' && canRespond(d.status)) {
            <section class="bg-white rounded-xl border border-gray-200 p-4">
              @if (respondError()) { <p class="text-xs text-red-600 mb-2"><i class="pi pi-exclamation-circle mr-1"></i>{{ respondError() }}</p> }
              <p class="text-sm text-gray-600 mb-3">Happy with this quote? Accept to place your order, or let us know if it's not right.</p>
              <div class="flex gap-2">
                <button class="flex-1 bg-green-600 text-white font-bold rounded-xl py-3 text-sm shadow-sm disabled:opacity-40 flex items-center justify-center gap-2"
                  [disabled]="responding()" (click)="respond('accept')">
                  @if (responding() === 'accept') { <i class="pi pi-spin pi-spinner"></i> } @else { <i class="pi pi-check-circle"></i> } Accept & order
                </button>
                <button class="flex-1 border border-gray-300 text-gray-600 font-semibold rounded-xl py-3 text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                  [disabled]="responding()" (click)="respond('reject')">
                  @if (responding() === 'reject') { <i class="pi pi-spin pi-spinner"></i> } @else { <i class="pi pi-times"></i> } Decline
                </button>
              </div>
            </section>
          }
          <!-- Draft quote: the business is still preparing it — no accept yet. -->
          @if (d.type === 'quote' && d.status === 'draft' && !responded()) {
            <section class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <i class="pi pi-clock text-amber-500" style="font-size:1.5rem"></i>
              <p class="text-sm font-semibold text-amber-800 mt-2">Your quote is being prepared</p>
              <p class="text-xs text-amber-600 mt-1">We'll send you a message the moment it's ready to review & accept.</p>
            </section>
          }
          @if (responded()) {
            <section class="rounded-xl border p-4 text-center"
              [class.bg-green-50]="responded() === 'accepted' || responded() === 'converted'" [class.border-green-200]="responded() === 'accepted' || responded() === 'converted'"
              [class.bg-gray-50]="responded() === 'rejected'" [class.border-gray-200]="responded() === 'rejected'">
              @if (responded() === 'rejected') {
                <p class="text-sm font-semibold text-gray-700">Thanks for letting us know — we'll be in touch.</p>
              } @else {
                <p class="text-sm font-semibold text-green-800"><i class="pi pi-check-circle mr-1"></i>Quote accepted! Your order is being created. Head back to WhatsApp to continue.</p>
              }
            </section>
          }
        </main>
      }
    </div>
  `,
})
export class OrderViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(BuilderApiService);

  loading = signal(true);
  error = signal<string | null>(null);
  data = signal<any | null>(null);
  responding = signal<'accept' | 'reject' | null>(null);
  responded = signal<string | null>(null);
  respondError = signal<string | null>(null);

  /** A sent/draft quote that hasn't yet been accepted/rejected can still be acted on. */
  canRespond(status: string): boolean {
    // Only a quote the business has SENT can be accepted — a draft is still being
    // prepared/priced by the admin, so the customer must wait for it.
    return status === 'sent' && !this.responded();
  }

  respond(action: 'accept' | 'reject'): void {
    if (this.responding()) return;
    this.responding.set(action);
    this.respondError.set(null);
    this.api.respondToQuote(action).subscribe({
      next: (r) => {
        this.responding.set(null);
        this.responded.set(r?.status || (action === 'accept' ? 'accepted' : 'rejected'));
      },
      error: (e) => {
        this.responding.set(null);
        this.respondError.set(e?.error?.message || 'Could not submit your response. Please try again.');
      },
    });
  }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!token) {
      this.loading.set(false);
      this.error.set('Missing or invalid link.');
      return;
    }
    this.api.setToken(token);
    this.api.getResult().subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e?.error?.message || 'This link is invalid or has expired.');
      },
    });
  }

  sym(c: string): string {
    return c === 'INR' ? '₹' : c === 'USD' ? '$' : c === 'EUR' ? '€' : (c || '') + ' ';
  }
}
