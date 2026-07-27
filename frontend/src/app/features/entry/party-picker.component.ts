import { Component, EventEmitter, Input, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { EntryService, CustomerContext, SupplierContext } from '../../core/services/entry.service';
import { QuickCreateComponent, QuickCreated } from './quick-create.component';

/** A party as shown in the picker — normalised across customer & supplier hits. */
interface PartyHit { id: string; name: string; phone?: string; gstin?: string; sub?: string; totalSpent?: number; }

/**
 * Reusable party picker — the tally party experience for the web portal, now with
 * inline "create new". Type a name / phone / GSTIN → live suggestions → on select
 * it fetches the full party context and shows a details card (outstanding, credit,
 * discount, last order, usually buys). If the party is new, "➕ Create …" opens a
 * quick-create and auto-selects it. Works for customers (default) and suppliers
 * (`kind="supplier"`, for purchases). Emits the context so the host form prefills.
 */
@Component({
  selector: 'wa-party-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, QuickCreateComponent],
  template: `
    @if (!ctx()) {
      <div class="relative">
        <input [(ngModel)]="query" (ngModelChange)="onQuery($event)" (keydown)="onKey($event)"
               [placeholder]="placeholder"
               class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" autocomplete="off" />
        @if (hits().length || query.trim().length >= 2) {
          <div class="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            @for (h of hits(); track h.id; let i = $index) {
              <button type="button" (click)="pick(h)" (mouseenter)="idx.set(i)"
                class="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-indigo-50"
                [class.bg-indigo-50]="idx() === i">
                <span class="min-w-0">
                  <span class="font-medium text-gray-800 truncate block">{{ h.name }}</span>
                  <span class="text-[11px] text-gray-400">{{ h.phone }}{{ h.gstin ? ' · ' + h.gstin : '' }}{{ h.sub ? ' · ' + h.sub : '' }}</span>
                </span>
                @if (h.totalSpent) { <span class="text-[11px] text-gray-400 shrink-0 ml-2 tabular-nums">₹{{ inr(h.totalSpent) }}</span> }
              </button>
            }
            <!-- Inline create — always available so a new party never blocks the entry -->
            <button type="button" (click)="openCreate()"
              class="w-full text-left px-3 py-2 text-sm bg-amber-50 hover:bg-amber-100 border-t border-amber-100 text-amber-800 font-medium">
              ➕ Create {{ kindLabel() }} “{{ query.trim() }}”
            </button>
          </div>
        }
        @if (loadingCtx()) { <p class="text-[11px] text-gray-400 mt-1"><i class="pi pi-spin pi-spinner"></i> Loading {{ kindLabel() }}…</p> }
      </div>
    } @else if (kind === 'supplier') {
      <!-- Supplier details card -->
      <div class="border border-indigo-100 rounded-xl overflow-hidden">
        <div class="flex items-start gap-2 px-3 py-2 bg-indigo-50/60 border-b border-indigo-100">
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-gray-900 leading-tight truncate">{{ sup()!.name }}
              @if (sup()!.contactName) { <span class="text-gray-400 font-normal">· {{ sup()!.contactName }}</span> }
            </p>
            <p class="text-[11px] text-gray-500 leading-tight">
              {{ sup()!.phone }}@if (sup()!.gstin) { · <span class="font-mono">{{ sup()!.gstin }}</span> }
            </p>
          </div>
          <button type="button" (click)="clear()" class="text-[11px] text-indigo-600 hover:underline shrink-0">Change</button>
        </div>
        <div class="grid grid-cols-2 gap-px bg-gray-100 text-center">
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Payable</p>
            <p class="text-sm font-bold tabular-nums" [class.text-red-600]="sup()!.outstanding > 0">₹{{ inr(sup()!.outstanding) }}</p>
            <p class="text-[10px] text-gray-400">{{ sup()!.openOrders || 0 }} open order(s)</p>
          </div>
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Recent POs</p>
            <p class="text-sm font-bold tabular-nums">{{ sup()!.recentOrders?.length || 0 }}</p>
          </div>
        </div>
        @if (sup()!.topItems?.length) {
          <div class="px-3 py-1.5 border-t border-gray-100">
            <p class="text-[10px] text-gray-400 uppercase mb-0.5">Usually supplies</p>
            @for (t of sup()!.topItems.slice(0, 3); track t.productId) {
              <div class="flex items-center gap-2 text-[11px] text-gray-600">
                <span class="flex-1 truncate">{{ t.productName }}</span>
                <span class="text-gray-400">last ₹{{ inr(t.lastPrice) }}</span>
              </div>
            }
          </div>
        }
      </div>
    } @else {
      <!-- Customer details card -->
      <div class="border border-indigo-100 rounded-xl overflow-hidden">
        <div class="flex items-start gap-2 px-3 py-2 bg-indigo-50/60 border-b border-indigo-100">
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-gray-900 leading-tight truncate">{{ cust()!.name }}
              @if (cust()!.company) { <span class="text-gray-400 font-normal">· {{ cust()!.company }}</span> }
            </p>
            <p class="text-[11px] text-gray-500 leading-tight">
              {{ cust()!.phone }}@if (cust()!.gstin) { · <span class="font-mono">{{ cust()!.gstin }}</span> }@if (cust()!.stateCode) { · State {{ cust()!.stateCode }} }
            </p>
          </div>
          <button type="button" (click)="clear()" class="text-[11px] text-indigo-600 hover:underline shrink-0">Change</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 text-center">
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Outstanding</p>
            <p class="text-sm font-bold tabular-nums" [class.text-red-600]="cust()!.outstanding > 0">₹{{ inr(cust()!.outstanding) }}</p>
            <p class="text-[10px] text-gray-400">{{ cust()!.openInvoices || 0 }} open bill(s)</p>
          </div>
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Credit</p>
            <p class="text-sm font-bold tabular-nums">{{ cust()!.creditDays ? cust()!.creditDays + 'd' : '—' }}</p>
            <p class="text-[10px] text-gray-400">{{ cust()!.creditLimit ? '₹' + inr(cust()!.creditLimit) + ' limit' : 'no limit' }}</p>
          </div>
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Discount</p>
            <p class="text-sm font-bold tabular-nums" [class.text-emerald-600]="(cust()!.defaultDiscountPct || 0) > 0">{{ cust()!.defaultDiscountPct ? cust()!.defaultDiscountPct + '%' : '—' }}</p>
            <p class="text-[10px] text-gray-400 truncate">{{ cust()!.priceLevelName || 'Standard' }}</p>
          </div>
          <div class="bg-white px-2 py-1.5">
            <p class="text-[10px] text-gray-400 uppercase">Last order</p>
            <p class="text-sm font-bold tabular-nums">{{ cust()!.lastOrderAt ? (cust()!.lastOrderAt | date:'dd MMM') : '—' }}</p>
            <p class="text-[10px] text-gray-400">₹{{ inr(cust()!.totalSpent) }} lifetime</p>
          </div>
        </div>
        @if (cust()!.billingAddress) {
          <p class="px-3 py-1.5 text-[11px] text-gray-500 border-t border-gray-100 truncate">📍 {{ cust()!.billingAddress }}{{ cust()!.pincode ? ' - ' + cust()!.pincode : '' }}</p>
        }
        @if (cust()!.topItems?.length) {
          <div class="px-3 py-1.5 border-t border-gray-100">
            <p class="text-[10px] text-gray-400 uppercase mb-0.5">Usually buys</p>
            @for (t of cust()!.topItems.slice(0, 3); track t.productId) {
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

    @if (qc()) {
      <wa-quick-create [kind]="kind" [prefillName]="query.trim()"
                       (created)="onCreated($event)" (cancel)="qc.set(false)" />
    }
  `,
})
export class PartyPickerComponent {
  private readonly entry = inject(EntryService);

  @Input() placeholder = 'Type name / phone / GSTIN…';
  /** Party kind — customer (default) or supplier (for purchases). */
  @Input() kind: 'customer' | 'supplier' = 'customer';
  /** Pre-select a party (edit mode) by id + name. */
  @Input() set party(v: { id: string; name: string } | null) {
    if (v?.id && v.id !== this.ctx()?.id) this.loadContext(v.id);
  }
  @Output() selected = new EventEmitter<CustomerContext | SupplierContext>();
  @Output() cleared = new EventEmitter<void>();

  query = '';
  readonly hits = signal<PartyHit[]>([]);
  readonly idx = signal(0);
  readonly ctx = signal<CustomerContext | SupplierContext | null>(null);
  readonly loadingCtx = signal(false);
  readonly qc = signal<boolean>(false);
  private debounce?: ReturnType<typeof setTimeout>;

  readonly cust = computed(() => this.kind === 'customer' ? (this.ctx() as CustomerContext | null) : null);
  readonly sup = computed(() => this.kind === 'supplier' ? (this.ctx() as SupplierContext | null) : null);
  kindLabel(): string { return this.kind === 'supplier' ? 'supplier' : 'customer'; }

  onQuery(q: string): void {
    clearTimeout(this.debounce);
    if (!q || q.trim().length < 2) { this.hits.set([]); return; }
    this.debounce = setTimeout(() => {
      if (this.kind === 'supplier') {
        this.entry.suppliers(q).subscribe((h) => {
          this.hits.set((h || []).map((s) => ({ id: s.id, name: s.name, phone: s.phone, gstin: s.gstin, sub: s.contactName })));
          this.idx.set(0);
        });
      } else {
        this.entry.customers(q).subscribe((h) => {
          this.hits.set((h || []).map((c) => ({ id: c.id, name: c.name, phone: c.phone, gstin: c.gstin, sub: c.company, totalSpent: c.totalSpent })));
          this.idx.set(0);
        });
      }
    }, 200);
  }

  onKey(e: KeyboardEvent): void {
    const hits = this.hits();
    if (e.key === 'ArrowDown') { e.preventDefault(); this.idx.set(Math.min(this.idx() + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.idx.set(Math.max(this.idx() - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits.length) this.pick(hits[this.idx()]);
      else if (this.query.trim().length >= 2) this.openCreate();
    }
    else if (e.key === 'Escape') { this.hits.set([]); }
  }

  pick(h: PartyHit): void {
    this.query = h.name;
    this.hits.set([]);
    this.loadContext(h.id);
  }

  openCreate(): void { this.hits.set([]); this.qc.set(true); }

  onCreated(c: QuickCreated): void {
    this.qc.set(false);
    this.query = c.name;
    this.loadContext(c.id);
  }

  private loadContext(id: string): void {
    this.loadingCtx.set(true);
    const ctx$: Observable<CustomerContext | SupplierContext> =
      this.kind === 'supplier' ? this.entry.supplierContext(id) : this.entry.customerContext(id);
    ctx$.subscribe({
      next: (c: CustomerContext | SupplierContext) => { this.ctx.set(c); this.loadingCtx.set(false); this.selected.emit(c); },
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
