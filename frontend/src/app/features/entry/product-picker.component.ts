import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntryService, ProductHit } from '../../core/services/entry.service';
import { QuickCreateComponent, QuickCreated } from './quick-create.component';

/** What the picker hands back so the host can fill a line row. */
export interface PickedProduct {
  id: string;
  name: string;
  rate: number;       // sensible default rate (price level / last / sale or purchase price)
  gstRate: number;
  hsnCode?: string;
  uom?: string;
  stock?: number;
  mrp?: number;
  lastPrice?: number | null;
}

/**
 * Reusable line-item product picker — the ERP item experience for portal forms.
 * Type an item name / SKU → live suggestions with price + live stock → select to
 * fill the row (rate/GST/HSN/UoM), or "➕ Create item" inline via quick-create.
 * `name` is two-way bound so it doubles as the row description and supports free
 * text (off-catalogue lines still work). `customerId` enables party-wise last rate.
 */
@Component({
  selector: 'wa-product-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, QuickCreateComponent],
  template: `
    <div class="relative">
      <input [ngModel]="name" (ngModelChange)="onQuery($event)" (keydown)="onKey($event)"
             [placeholder]="placeholder"
             class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" autocomplete="off" />
      @if (open() && (hits().length || query().trim().length >= 2)) {
        <div class="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          @for (h of hits(); track h.id; let i = $index) {
            <button type="button" (click)="pick(h)" (mouseenter)="idx.set(i)"
              class="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-indigo-50"
              [class.bg-indigo-50]="idx() === i">
              <span class="min-w-0 truncate font-medium text-gray-800">{{ h.name }}</span>
              <span class="text-[11px] text-gray-400 shrink-0 whitespace-nowrap">
                ₹{{ inr(rateOf(h)) }} · stk {{ h.stock ?? 0 }}
              </span>
            </button>
          }
          <button type="button" (click)="openCreate()"
            class="w-full text-left px-3 py-2 text-sm bg-amber-50 hover:bg-amber-100 border-t border-amber-100 text-amber-800 font-medium">
            ➕ Create item “{{ query().trim() }}”
          </button>
        </div>
      }
    </div>

    @if (qc()) {
      <wa-quick-create kind="product" [prefillName]="query().trim()"
                       (created)="onCreated($event)" (cancel)="qc.set(false)" />
    }
  `,
})
export class ProductPickerComponent {
  private readonly entry = inject(EntryService);

  @Input() name = '';
  @Output() nameChange = new EventEmitter<string>();
  @Input() placeholder = 'Type an item name / SKU…';
  /** 'sale' defaults to sale/level/last rate; 'purchase' defaults to purchase rate. */
  @Input() mode: 'sale' | 'purchase' = 'sale';
  /** When set, the sale rate uses the party's price level / last rate to them. */
  @Input() customerId?: string;
  @Output() picked = new EventEmitter<PickedProduct>();

  readonly query = signal('');
  readonly hits = signal<ProductHit[]>([]);
  readonly idx = signal(0);
  readonly open = signal(false);
  readonly qc = signal(false);
  private debounce?: ReturnType<typeof setTimeout>;

  onQuery(q: string): void {
    this.name = q;
    this.query.set(q);
    this.nameChange.emit(q);
    clearTimeout(this.debounce);
    this.open.set(true);
    if (!q || q.trim().length < 2) { this.hits.set([]); return; }
    this.debounce = setTimeout(() => {
      this.entry.products(q).subscribe((h) => { this.hits.set(h || []); this.idx.set(0); });
    }, 200);
  }

  onKey(e: KeyboardEvent): void {
    const hits = this.hits();
    if (e.key === 'ArrowDown') { e.preventDefault(); this.idx.set(Math.min(this.idx() + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.idx.set(Math.max(this.idx() - 1, 0)); }
    else if (e.key === 'Enter') {
      if (this.open() && hits.length) { e.preventDefault(); this.pick(hits[this.idx()]); }
      else if (this.open() && this.query().trim().length >= 2) { e.preventDefault(); this.openCreate(); }
    }
    else if (e.key === 'Escape') { this.open.set(false); }
  }

  /** The rate a hit would default to, respecting sale/purchase mode. */
  rateOf(h: ProductHit): number {
    if (this.mode === 'purchase') return Number(h.purchasePrice ?? h.basePrice) || 0;
    return Number(h.salePrice ?? h.basePrice) || 0;
  }

  pick(h: ProductHit): void {
    this.name = h.name;
    this.query.set(h.name);
    this.nameChange.emit(h.name);
    this.hits.set([]);
    this.open.set(false);
    const emitHit = (rate: number, lastPrice?: number | null) => this.picked.emit({
      id: h.id, name: h.name, rate, gstRate: Number(h.gstRate) || 0,
      hsnCode: h.hsnCode, uom: h.uom, stock: Number(h.stock) || 0,
      mrp: h.mrp != null ? Number(h.mrp) : undefined, lastPrice: lastPrice ?? null,
    });
    // Sale mode: enrich with the party's price level / last rate when we know the party.
    if (this.mode === 'sale' && this.customerId) {
      this.entry.itemContext(h.id, this.customerId).subscribe({
        next: (ctx) => {
          const rate = ctx.levelPrice?.price ?? ctx.lastToCustomer?.price ?? this.rateOf(h);
          emitHit(Number(rate) || this.rateOf(h), ctx.lastToCustomer?.price);
        },
        error: () => emitHit(this.rateOf(h)),
      });
    } else {
      emitHit(this.rateOf(h));
    }
  }

  openCreate(): void { this.hits.set([]); this.open.set(false); this.qc.set(true); }

  onCreated(p: QuickCreated): void {
    this.qc.set(false);
    this.name = p.name;
    this.query.set(p.name);
    this.nameChange.emit(p.name);
    this.picked.emit({
      id: p.id, name: p.name, rate: Number(p.rate) || 0, gstRate: Number(p.gstRate) || 0,
      hsnCode: p.hsnCode, uom: p.uom, stock: 0,
    });
  }

  inr(n: unknown): string { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
}
