import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  EntryService,
  PriceLevel,
  ProductHit,
  CustomerHit,
  CustomerContext,
} from '../../core/services/entry.service';

interface RateRow {
  productId?: string;
  name: string;
  stdPrice?: number;
  rate: number | null;
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Party & Price Masters — Tally price levels / Miracle rate structures + credit control.
 *
 * Left: price levels (create/select). Middle: the selected level's per-product rates,
 * entered Excel-style. Right: per-party settings — assigned price level, credit limit,
 * credit days. Levels win as the billing rate on the sales/quote grids; limits raise a
 * red warning at billing time.
 */
@Component({
  selector: 'wa-pricing-masters',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-3 md:p-5 max-w-7xl select-none">
      <span class="hidden">{{ tick() }}</span>
      <div class="flex items-center gap-4 mb-3 border-b pb-2">
        <h1 class="text-lg font-semibold">Party & Price Masters</h1>
        @if (saved()) {
          <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">✓ {{ saved() }}</span>
        }
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Price levels -->
        <div class="border rounded-lg p-3">
          <h2 class="font-semibold mb-2 text-sm">Price Levels</h2>
          @for (l of levels(); track l.id) {
            <button (click)="selectLevel(l)"
                    class="w-full text-left px-2 py-1.5 rounded text-sm mb-1 flex justify-between"
                    [class.bg-slate-800]="level()?.id === l.id" [class.text-white]="level()?.id === l.id"
                    [class.bg-slate-100]="level()?.id !== l.id">
              <span>{{ l.name }}</span><span class="opacity-60">{{ l.rateCount || 0 }} rates</span>
            </button>
          } @empty { <p class="text-xs text-slate-400 mb-2">No levels yet — e.g. Retail, Wholesale, Distributor.</p> }
          <div class="flex gap-1 mt-2">
            <input [(ngModel)]="newLevelName" placeholder="New level name"
                   (keydown.enter)="createLevel()"
                   class="flex-1 border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none" />
            <button (click)="createLevel()" [disabled]="!newLevelName.trim()"
                    class="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">Add</button>
          </div>
        </div>

        <!-- Rates for the selected level -->
        <div class="border rounded-lg p-3">
          <h2 class="font-semibold mb-2 text-sm">
            Rates {{ level() ? '— ' + level()!.name : '' }}
          </h2>
          @if (!level()) {
            <p class="text-xs text-slate-400">Select or create a level to set its product rates.</p>
          } @else {
            <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
              <thead>
                <tr class="bg-slate-100 text-slate-600">
                  <th class="border border-slate-300 px-2 text-left">Item</th>
                  <th class="border border-slate-300 px-2 w-20 text-right">Std</th>
                  <th class="border border-slate-300 px-2 w-24 text-right">{{ level()!.name }} rate</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rateRows; track $index; let r = $index) {
                  <tr>
                    <td class="border border-slate-300 relative p-0">
                      <input [attr.data-cell]="r + ':name'" [(ngModel)]="row.name" (ngModelChange)="onProductQuery(r, $event)"
                             (keydown)="onRateKey($event, r, 'name')"
                             class="w-full px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                      @if (searchRow() === r && productHits().length) {
                        <div class="absolute top-full left-0 z-50 w-72 bg-white border rounded-b shadow-lg max-h-56 overflow-auto">
                          @for (hit of productHits(); track hit.id; let i = $index) {
                            <div (mousedown)="pickProduct(r, hit)"
                                 class="px-2 py-1.5 cursor-pointer flex justify-between gap-2"
                                 [class.bg-amber-100]="i === productHitIdx()">
                              <span class="truncate">{{ hit.name }}</span>
                              <span class="text-slate-400">₹{{ fmt(hit.salePrice ?? hit.basePrice) }}</span>
                            </div>
                          }
                        </div>
                      }
                    </td>
                    <td class="border border-slate-300 px-2 text-right text-slate-500">{{ row.stdPrice !== undefined ? fmt(row.stdPrice) : '' }}</td>
                    <td class="border border-slate-300 p-0">
                      <input [attr.data-cell]="r + ':rate'" type="number" [(ngModel)]="row.rate" (keydown)="onRateKey($event, r, 'rate')"
                             class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <button (click)="saveRates()" [disabled]="savingRates()"
                    class="w-full mt-2 px-3 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">
              {{ savingRates() ? 'Saving…' : 'Save Rates (Ctrl+A)' }}
            </button>
            <p class="text-xs text-slate-400 mt-1">Tip: a rate of 0 removes the item from this level.</p>
          }
        </div>

        <!-- Party credit / level assignment -->
        <div class="border rounded-lg p-3">
          <h2 class="font-semibold mb-2 text-sm">Party Settings</h2>
          <div class="relative mb-2">
            <input [(ngModel)]="customerQuery" (ngModelChange)="onCustomerQuery($event)"
                   (keydown)="onCustomerKey($event)"
                   class="w-full border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none"
                   placeholder="Type customer name / phone…" autocomplete="off" />
            @if (customerHits().length) {
              <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg max-h-56 overflow-auto">
                @for (hit of customerHits(); track hit.id; let i = $index) {
                  <div (mousedown)="pickCustomer(hit)"
                       class="px-2 py-1.5 text-sm cursor-pointer flex justify-between"
                       [class.bg-amber-100]="i === customerHitIdx()">
                    <span>{{ hit.name }}</span><span class="text-slate-400">{{ hit.phone }}</span>
                  </div>
                }
              </div>
            }
          </div>
          @if (customer(); as c) {
            <p class="text-sm font-medium mb-2">{{ c.name }} <span class="text-slate-400">· outstanding ₹{{ fmt(c.outstanding) }}</span></p>
            <label class="text-sm block mb-2">Price level
              <select [(ngModel)]="custLevelId" class="mt-1 w-full border rounded px-2 py-1.5">
                <option value="">— none (standard rates) —</option>
                @for (l of levels(); track l.id) { <option [value]="l.id">{{ l.name }}</option> }
              </select>
            </label>
            <div class="grid grid-cols-2 gap-2 mb-3">
              <label class="text-sm">Credit limit ₹
                <input type="number" [(ngModel)]="custCreditLimit" class="mt-1 w-full border rounded px-2 py-1.5 text-right" />
              </label>
              <label class="text-sm">Credit days
                <input type="number" [(ngModel)]="custCreditDays" class="mt-1 w-full border rounded px-2 py-1.5 text-right" />
              </label>
            </div>
            <button (click)="saveCustomerSettings()" [disabled]="savingCust()"
                    class="w-full px-3 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">
              {{ savingCust() ? 'Saving…' : 'Save Party Settings' }}
            </button>
          } @else {
            <p class="text-xs text-slate-400">Pick a party to assign a price level and credit limit/days.
              The sales screen warns in red when a bill would push them past the limit.</p>
          }
          @if (error()) { <p class="text-red-600 text-xs mt-2">{{ error() }}</p> }
        </div>
      </div>
    </div>
  `,
})
export class PricingMastersComponent {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly tick = signal(0);
  readonly levels = signal<PriceLevel[]>([]);
  readonly level = signal<PriceLevel | null>(null);
  newLevelName = '';
  rateRows: RateRow[] = [];

  readonly productHits = signal<ProductHit[]>([]);
  readonly productHitIdx = signal(0);
  readonly searchRow = signal<number | null>(null);

  customerQuery = '';
  readonly customerHits = signal<CustomerHit[]>([]);
  readonly customerHitIdx = signal(0);
  readonly customer = signal<CustomerContext | null>(null);
  custLevelId = '';
  custCreditLimit: number | null = null;
  custCreditDays: number | null = null;

  readonly savingRates = signal(false);
  readonly savingCust = signal(false);
  readonly saved = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  private debounce?: ReturnType<typeof setTimeout>;

  constructor() {
    this.reloadLevels();
  }

  private reloadLevels(): void {
    this.entry.priceLevels().subscribe((l) => this.levels.set(l || []));
  }

  createLevel(): void {
    const name = this.newLevelName.trim();
    if (!name) return;
    this.entry.createPriceLevel(name).subscribe({
      next: (lvl) => {
        this.newLevelName = '';
        this.reloadLevels();
        this.selectLevel(lvl);
      },
      error: (err) => this.error.set(err?.error?.message || 'Failed to create level'),
    });
  }

  selectLevel(l: PriceLevel): void {
    this.level.set(l);
    this.rateRows = [];
    this.entry.levelRates(l.id).subscribe((rates) => {
      this.rateRows = (rates || []).map((r) => ({
        productId: r.productId,
        name: r.productName,
        stdPrice: Number(r.salePrice ?? r.basePrice) || undefined,
        rate: Number(r.rate) || null,
      }));
      this.rateRows.push({ name: '', rate: null });
      this.tick.update((t) => t + 1);
    });
  }

  onProductQuery(r: number, q: string): void {
    const row = this.rateRows[r];
    row.productId = undefined;
    row.stdPrice = undefined;
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.productHits.set([]); this.searchRow.set(null); return; }
    this.debounce = setTimeout(() => {
      this.entry.products(q).subscribe((hits) => {
        this.productHits.set(hits || []); this.productHitIdx.set(0); this.searchRow.set(r);
      });
    }, 200);
  }

  pickProduct(r: number, hit: ProductHit): void {
    const row = this.rateRows[r];
    row.productId = hit.id;
    row.name = hit.name;
    row.stdPrice = Number(hit.salePrice ?? hit.basePrice) || undefined;
    this.productHits.set([]); this.searchRow.set(null);
    setTimeout(() => this.focusCell(r, 'rate'));
  }

  onRateKey(e: KeyboardEvent, r: number, col: 'name' | 'rate'): void {
    const hits = this.productHits();
    if (col === 'name' && this.searchRow() === r && hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.productHitIdx.set(Math.min(this.productHitIdx() + 1, hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.productHitIdx.set(Math.max(this.productHitIdx() - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickProduct(r, hits[this.productHitIdx()]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); this.productHits.set([]); this.searchRow.set(null); return; }
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (col === 'name') { this.focusCell(r, 'rate'); return; }
      if (r + 1 >= this.rateRows.length) this.rateRows.push({ name: '', rate: null });
      setTimeout(() => this.focusCell(r + 1, 'name'));
    }
  }

  private focusCell(r: number, col: string): void {
    const el = this.host.nativeElement.querySelector(`[data-cell="${r}:${col}"]`) as HTMLInputElement | null;
    el?.focus(); el?.select();
  }

  /** Miracle: Ctrl+Enter accepts/saves the voucher from anywhere (alias of Ctrl+A). */

  @HostListener('document:keydown.control.enter', ['$event'])

  onCtrlEnterSave(e: Event): void { this.onSaveKey(e as any); }


  @HostListener('document:keydown.control.a', ['$event'])
  onSaveKey(e: Event): void {
    e.preventDefault();
    if (this.level()) this.saveRates();
  }

  saveRates(): void {
    const lvl = this.level();
    if (!lvl || this.savingRates()) return;
    const items = this.rateRows
      .filter((r) => r.productId)
      .map((r) => ({ productId: r.productId!, rate: money(Number(r.rate) || 0) }));
    if (!items.length) return;
    this.savingRates.set(true);
    this.error.set(null);
    this.entry.saveLevelRates(lvl.id, items).subscribe({
      next: () => {
        this.savingRates.set(false);
        this.saved.set(`${items.length} rate(s) saved for ${lvl.name}`);
        this.reloadLevels();
        this.selectLevel(lvl);
      },
      error: (err) => {
        this.savingRates.set(false);
        this.error.set(err?.error?.message || 'Failed to save rates');
      },
    });
  }

  // ─── Party settings ─────────────────────────────────────────────────────────
  onCustomerQuery(q: string): void {
    this.customer.set(null);
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.customerHits.set([]); return; }
    this.debounce = setTimeout(() => {
      this.entry.customers(q).subscribe((hits) => { this.customerHits.set(hits || []); this.customerHitIdx.set(0); });
    }, 200);
  }

  onCustomerKey(e: KeyboardEvent): void {
    const hits = this.customerHits();
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.customerHitIdx.set(Math.min(this.customerHitIdx() + 1, hits.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.customerHitIdx.set(Math.max(this.customerHitIdx() - 1, 0)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickCustomer(hits[this.customerHitIdx()]); return; }
    if (e.key === 'Escape') { e.stopPropagation(); this.customerHits.set([]); }
  }

  pickCustomer(hit: CustomerHit): void {
    this.customerQuery = hit.name;
    this.customerHits.set([]);
    this.entry.customerContext(hit.id).subscribe((ctx) => {
      this.customer.set(ctx);
      this.custLevelId = ctx.priceLevelId || '';
      this.custCreditLimit = ctx.creditLimit != null ? Number(ctx.creditLimit) : null;
      this.custCreditDays = ctx.creditDays != null ? Number(ctx.creditDays) : null;
    });
  }

  saveCustomerSettings(): void {
    const c = this.customer();
    if (!c || this.savingCust()) return;
    this.savingCust.set(true);
    this.error.set(null);
    this.entry
      .updateCustomerSettings(c.id, {
        priceLevelId: this.custLevelId || null,
        creditLimit: this.custCreditLimit != null && this.custCreditLimit !== ('' as any) ? Number(this.custCreditLimit) : null,
        creditDays: this.custCreditDays != null && this.custCreditDays !== ('' as any) ? Number(this.custCreditDays) : null,
      })
      .subscribe({
        next: () => {
          this.savingCust.set(false);
          this.saved.set(`Settings saved for ${c.name}`);
        },
        error: (err) => {
          this.savingCust.set(false);
          this.error.set(err?.error?.message || 'Failed to save settings');
        },
      });
  }

  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }
}
