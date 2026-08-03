import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ErpCurrencyService } from '../../../core/services/erp-currency.service';

/**
 * Returns register — a single place to see all returns: sales returns (credit
 * notes) and purchase returns (debit notes), with party names + period totals.
 */
@Component({
  selector: 'wa-erp-returns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-4 max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Returns Register</h1>
          <p class="text-sm text-gray-500">Sales returns (credit notes) &amp; purchase returns (debit notes)</p>
        </div>
        <div class="flex items-end gap-2">
          <div><label class="block text-[11px] font-semibold text-gray-400 uppercase">From</label>
            <input type="date" [(ngModel)]="from" class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></div>
          <div><label class="block text-[11px] font-semibold text-gray-400 uppercase">To</label>
            <input type="date" [(ngModel)]="to" class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></div>
          <button (click)="load()" [disabled]="loading()" class="rounded-lg bg-indigo-600 text-white text-sm font-semibold px-4 py-1.5 disabled:opacity-50">Go</button>
        </div>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div class="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
          <p class="text-[11px] font-semibold text-rose-400 uppercase">Sales returns</p>
          <p class="text-xl font-bold tabular-nums text-rose-600">{{ cur.symbol() }}{{ fmt(data()?.totals?.salesValue) }}</p>
          <p class="text-[11px] text-gray-400">{{ data()?.totals?.salesCount || 0 }} credit note(s)</p>
        </div>
        <div class="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
          <p class="text-[11px] font-semibold text-amber-500 uppercase">Purchase returns</p>
          <p class="text-xl font-bold tabular-nums text-amber-600">{{ cur.symbol() }}{{ fmt(data()?.totals?.purchaseValue) }}</p>
          <p class="text-[11px] text-gray-400">{{ data()?.totals?.purchaseCount || 0 }} debit note(s)</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 mb-3">
        <button (click)="tab.set('sales')" class="px-4 py-2 rounded-lg text-sm font-semibold"
          [class.bg-indigo-600]="tab()==='sales'" [class.text-white]="tab()==='sales'"
          [class.bg-gray-100]="tab()!=='sales'" [class.text-gray-600]="tab()!=='sales'">
          <i class="pi pi-reply text-xs mr-1"></i> Sales Returns
        </button>
        <button (click)="tab.set('purchase')" class="px-4 py-2 rounded-lg text-sm font-semibold"
          [class.bg-indigo-600]="tab()==='purchase'" [class.text-white]="tab()==='purchase'"
          [class.bg-gray-100]="tab()!=='purchase'" [class.text-gray-600]="tab()!=='purchase'">
          <i class="pi pi-undo text-xs mr-1"></i> Purchase Returns
        </button>
      </div>

      @if (loading()) { <p class="text-sm text-gray-400 py-10 text-center">Loading returns…</p> }
      @else {
        <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-[11px] uppercase text-gray-400">
              <tr>
                <th class="px-4 py-2.5 text-left font-semibold">Note #</th>
                <th class="px-4 py-2.5 text-left font-semibold">Date</th>
                <th class="px-4 py-2.5 text-left font-semibold">{{ tab()==='sales' ? 'Customer' : 'Supplier' }}</th>
                <th class="px-4 py-2.5 text-right font-semibold">Tax</th>
                <th class="px-4 py-2.5 text-right font-semibold">Total</th>
                <th class="px-4 py-2.5 text-left font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (r of rows(); track r.id) {
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-2.5 font-mono text-xs">{{ r.noteNumber }}</td>
                  <td class="px-4 py-2.5 text-gray-500 whitespace-nowrap">{{ r.createdAt | date:'d MMM yy' }}</td>
                  <td class="px-4 py-2.5 font-medium text-gray-800">{{ r.party }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ cur.symbol() }}{{ fmt(r.tax) }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums font-semibold">{{ cur.symbol() }}{{ fmt(r.total) }}</td>
                  <td class="px-4 py-2.5 text-[12px] text-gray-500 max-w-[16rem] truncate">{{ r.reason || '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="px-4 py-10 text-center text-gray-400">No {{ tab()==='sales' ? 'sales' : 'purchase' }} returns in this range.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ErpReturnsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly cur = inject(ErpCurrencyService);
  readonly data = signal<any>(null);
  readonly loading = signal(true);
  readonly tab = signal<'sales' | 'purchase'>('sales');
  from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  to = new Date().toISOString().slice(0, 10);

  readonly rows = computed(() => this.tab() === 'sales' ? (this.data()?.salesReturns || []) : (this.data()?.purchaseReturns || []));

  ngOnInit() { this.cur.load(); this.load(); }
  load() {
    this.loading.set(true);
    this.api.get<any>('/erp/returns', { from: this.from, to: this.to }).subscribe({
      next: (r) => { this.data.set(r); this.loading.set(false); },
      error: () => { this.data.set(null); this.loading.set(false); },
    });
  }
  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
}
