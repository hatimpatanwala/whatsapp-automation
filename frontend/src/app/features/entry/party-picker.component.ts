import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntryService, CustomerContext, CustomerHit } from '../../core/services/entry.service';

/**
 * Reusable party picker — the tally party experience for the web portal. Type a
 * name / phone / GSTIN → live suggestions → on select it fetches the full party
 * context and AUTO-FILLS everything: GSTIN, billing address, outstanding, credit
 * terms, price level, default discount, last order and what they usually buy (at
 * what rate). Emits the CustomerContext so the host form can prefill its fields.
 */
@Component({
  selector: 'wa-party-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (!ctx()) {
      <div class="relative">
        <input [(ngModel)]="query" (ngModelChange)="onQuery($event)" (keydown)="onKey($event)"
               [placeholder]="placeholder"
               class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" autocomplete="off" />
        @if (hits().length) {
          <div class="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            @for (h of hits(); track h.id; let i = $index) {
              <button type="button" (click)="pick(h)" (mouseenter)="idx.set(i)"
                class="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-indigo-50"
                [class.bg-indigo-50]="idx() === i">
                <span class="min-w-0">
                  <span class="font-medium text-gray-800 truncate block">{{ h.name }}</span>
                  <span class="text-[11px] text-gray-400">{{ h.phone }}{{ h.gstin ? ' · ' + h.gstin : '' }}{{ h.company ? ' · ' + h.company : '' }}</span>
                </span>
                @if (h.totalSpent) { <span class="text-[11px] text-gray-400 shrink-0 ml-2 tabular-nums">₹{{ inr(h.totalSpent) }}</span> }
              </button>
            }
          </div>
        }
        @if (loadingCtx()) { <p class="text-[11px] text-gray-400 mt-1"><i class="pi pi-spin pi-spinner"></i> Loading party…</p> }
      </div>
    } @else {
      <!-- Auto-filled party card -->
      <div class="border border-indigo-100 rounded-xl overflow-hidden">
        <div class="flex items-start gap-2 px-3 py-2 bg-indigo-50/60 border-b border-indigo-100">
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-gray-900 leading-tight truncate">{{ ctx()!.name }}
              @if (ctx()!.company) { <span class="text-gray-400 font-normal">· {{ ctx()!.company }}</span> }
            </p>
            <p class="text-[11px] text-gray-500 leading-tight">
              {{ ctx()!.phone }}@if (ctx()!.gstin) { · <span class="font-mono">{{ ctx()!.gstin }}</span> }@if (ctx()!.stateCode) { · State {{ ctx()!.stateCode }} }
            </p>
          </div>
          <button type="button" (click)="clear()" class="text-[11px] text-indigo-600 hover:underline shrink-0">Change</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 text-center">
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Outstanding</p>
            <p class="text-sm font-bold tabular-nums" [class.text-red-600]="ctx()!.outstanding > 0">₹{{ inr(ctx()!.outstanding) }}</p>
            <p class="text-[10px] text-gray-400">{{ ctx()!.openInvoices || 0 }} open bill(s)</p>
          </div>
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Credit</p>
            <p class="text-sm font-bold tabular-nums">{{ ctx()!.creditDays ? ctx()!.creditDays + 'd' : '—' }}</p>
            <p class="text-[10px] text-gray-400">{{ ctx()!.creditLimit ? '₹' + inr(ctx()!.creditLimit) + ' limit' : 'no limit' }}</p>
          </div>
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Discount</p>
            <p class="text-sm font-bold tabular-nums" [class.text-emerald-600]="(ctx()!.defaultDiscountPct || 0) > 0">{{ ctx()!.defaultDiscountPct ? ctx()!.defaultDiscountPct + '%' : '—' }}</p>
            <p class="text-[10px] text-gray-400 truncate">{{ ctx()!.priceLevelName || 'Standard' }}</p>
          </div>
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Last order</p>
            <p class="text-sm font-bold tabular-nums">{{ ctx()!.lastOrderAt ? (ctx()!.lastOrderAt | date:'dd MMM') : '—' }}</p>
            <p class="text-[10px] text-gray-400">₹{{ inr(ctx()!.totalSpent) }} lifetime</p>
          </div>
        </div>
        @if (ctx()!.billingAddress) {
          <p class="px-3 py-1.5 text-[11px] text-gray-500 border-t border-gray-100 truncate">📍 {{ ctx()!.billingAddress }}{{ ctx()!.pincode ? ' - ' + ctx()!.pincode : '' }}</p>
        }
        @if (ctx()!.topItems?.length) {
          <div class="px-3 py-1.5 border-t border-gray-100">
            <p class="text-[10px] text-gray-400 uppercase mb-0.5">Usually buys</p>
            @for (t of ctx()!.topItems.slice(0, 3); track t.productId) {
              <div class="flex items-center gap-2 text-[11px] text-gray-600">
                <span class="flex-1 truncate">{{ t.productName }}</span>
                <span class="text-gray-400">last ₹{{ inr(t.lastPrice) }}</span>
                <span class="text-gray-300">{{ t.lastDate | date:'dd/MM/yy' }}</span>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class PartyPickerComponent {
  private readonly entry = inject(EntryService);

  @Input() placeholder = 'Type name / phone / GSTIN…';
  /** Pre-select a party (edit mode) by id + name. */
  @Input() set party(v: { id: string; name: string } | null) {
    if (v?.id && v.id !== this.ctx()?.id) this.loadContext(v.id);
  }
  @Output() selected = new EventEmitter<CustomerContext>();
  @Output() cleared = new EventEmitter<void>();

  query = '';
  readonly hits = signal<CustomerHit[]>([]);
  readonly idx = signal(0);
  readonly ctx = signal<CustomerContext | null>(null);
  readonly loadingCtx = signal(false);
  private debounce?: ReturnType<typeof setTimeout>;

  onQuery(q: string): void {
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.hits.set([]); return; }
    this.debounce = setTimeout(() => {
      this.entry.customers(q).subscribe((h) => { this.hits.set(h || []); this.idx.set(0); });
    }, 200);
  }

  onKey(e: KeyboardEvent): void {
    const hits = this.hits();
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.idx.set(Math.min(this.idx() + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.idx.set(Math.max(this.idx() - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); this.pick(hits[this.idx()]); }
    else if (e.key === 'Escape') { this.hits.set([]); }
  }

  pick(h: CustomerHit): void {
    this.query = h.name;
    this.hits.set([]);
    this.loadContext(h.id);
  }

  private loadContext(id: string): void {
    this.loadingCtx.set(true);
    this.entry.customerContext(id).subscribe({
      next: (c) => { this.ctx.set(c); this.loadingCtx.set(false); this.selected.emit(c); },
      error: () => this.loadingCtx.set(false),
    });
  }

  clear(): void {
    this.ctx.set(null);
    this.query = '';
    this.hits.set([]);
    this.cleared.emit();
  }

  inr(n: unknown): string { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
}
