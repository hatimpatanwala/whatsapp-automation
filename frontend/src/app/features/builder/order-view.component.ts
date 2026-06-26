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
                  <tr>
                    <td class="px-4 py-2">{{ it.name }}</td>
                    <td class="text-center px-2 py-2">{{ it.quantity }}</td>
                    <td class="text-right px-2 py-2">{{ sym(d.currency) }}{{ it.unitPrice | number:'1.0-2' }}</td>
                    <td class="text-right px-4 py-2 font-medium">{{ sym(d.currency) }}{{ it.total | number:'1.0-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>

          <section class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span>{{ sym(d.currency) }}{{ d.total | number:'1.0-2' }}</span>
            </div>
            <p class="text-xs text-gray-400 mt-2">Reply in WhatsApp if you have any questions or to confirm.</p>
          </section>
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
