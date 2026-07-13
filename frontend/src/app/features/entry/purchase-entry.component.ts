import { Component, ElementRef, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { EntryDraftService } from '../../core/services/entry-draft.service';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import {
  EntryService,
  SupplierHit,
  SupplierContext,
  ProductHit,
  CategoryProduct,
} from '../../core/services/entry.service';
import { EntryLookupComponent } from './entry-lookup.component';
import { CategoryDiscountDialogComponent } from './category-discount-dialog.component';
import { QuickCreateComponent, QuickCreated, QuickKind } from './quick-create.component';

interface Row {
  productId?: string;
  name: string;
  hsn: string;
  uom: string;
  qty: number | null;
  free: number | null;
  rate: number | null;
  d1: number | null;
  d2: number | null;
  gstRate: number | null;
  stock?: number;
  salePrice?: number;
  lastFromSupplier?: { price: number; at: string } | null;
  lastOverall?: { price: number; at: string } | null;
  /** Optional per-line trade details (Alt+B): batch/expiry/godown ride along in JSONB. */
  batchNo?: string;
  expiry?: string;
  godown?: string;
  showBatch?: boolean;
  /** §3F.1 restock: this lot's own MRP + selling price (old & new MRP coexist). */
  batchMrp?: number | null;
  batchSale?: number | null;
}

const COLS = ['name', 'qty', 'free', 'rate', 'd1', 'd2', 'gstRate'] as const;
type Col = (typeof COLS)[number];

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Purchase — Tally/Miracle-style keyboard entry (F9).
 *
 * Same Excel-grid keymap as the sales screen. Supplier selection shows payables +
 * purchase history; item selection shows stock, the last cost FROM THIS SUPPLIER
 * (purchase-rate memory, prefilled), and the live margin vs the sale price.
 * Captures the supplier's bill no./date (Tally purchase-voucher fields — also used by
 * GSTR-2B matching). Saving creates a supplier order which auto-posts a Purchase
 * voucher (Dr Purchase + Input Tax, Cr Supplier).
 */
@Component({
  selector: 'wa-purchase-entry',
  standalone: true,
  imports: [FormsModule, DatePipe, QuickCreateComponent, EntryLookupComponent, CategoryDiscountDialogComponent],
  template: `
    <div class="p-3 md:p-5 max-w-7xl select-none">
      <span class="hidden">{{ tick() }}</span>

      <div class="flex items-center gap-4 mb-3 border-b pb-2">
        <h1 class="text-lg font-semibold">Purchase <span class="text-slate-400 text-sm">(F8)</span></h1>
        <span class="text-sm text-slate-500">{{ today | date: 'dd-MM-yyyy' }}</span>
        <label class="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" [(ngModel)]="isInterstate" /> Interstate (IGST)
        </label>
        @if (savedNumber()) {
          <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ Saved {{ savedNumber() }} & posted to books
          </span>
        }
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div class="lg:col-span-3">
          <!-- Supplier + bill fields -->
          <div class="flex flex-wrap items-center gap-3 mb-3">
            <label class="text-sm font-medium w-24">Party A/c</label>
            <div class="relative flex-1 min-w-64 max-w-md">
              <input data-cell="party" [(ngModel)]="supplierQuery" (ngModelChange)="onSupplierQuery($event)"
                     (keydown)="onPartyKey($event)"
                     class="w-full border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none focus:border-amber-400"
                     placeholder="Type supplier name / GSTIN…" autocomplete="off" />
              @if (supplierQuery.length >= 2 && !supplierHits().length && !supplier()) {
                <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg">
                  <div (mousedown)="openQuickCreate('supplier', supplierQuery)"
                       class="px-2 py-1.5 text-sm cursor-pointer bg-amber-50 hover:bg-amber-100">
                    ➕ Create supplier “{{ supplierQuery }}” <span class="text-slate-400">(Enter)</span>
                  </div>
                </div>
              }
              @if (supplierHits().length) {
                <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
                  @for (hit of supplierHits(); track hit.id; let i = $index) {
                    <div (mousedown)="pickSupplier(hit)"
                         class="px-2 py-1.5 text-sm cursor-pointer flex justify-between"
                         [class.bg-amber-100]="i === supplierHitIdx()">
                      <span>{{ hit.name }}</span><span class="text-slate-400">{{ hit.gstin || hit.phone }}</span>
                    </div>
                  }
                </div>
              }
            </div>
            <label class="text-sm">Bill No.
              <input data-cell="billno" [(ngModel)]="supplierInvoiceNo" (keydown)="onBillNoKey($event)"
                     class="ml-1 border rounded px-2 py-1.5 w-32 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
            <label class="text-sm">Bill Date
              <input type="date" [(ngModel)]="supplierInvoiceDate" class="ml-1 border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" />
            </label>
          </div>

          <!-- Item grid -->
          <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-600">
                <th class="border border-slate-300 px-1 w-8">#</th>
                <th class="border border-slate-300 px-2 text-left">Item</th>
                <th class="border border-slate-300 px-2 w-20">HSN</th>
                <th class="border border-slate-300 px-2 w-16 text-right">Stock</th>
                <th class="border border-slate-300 px-2 w-16 text-right">Qty</th>
                <th class="border border-slate-300 px-2 w-14 text-right">Free</th>
                <th class="border border-slate-300 px-2 w-20 text-right">Rate</th>
                <th class="border border-slate-300 px-2 w-14 text-right">D1%</th>
                <th class="border border-slate-300 px-2 w-14 text-right">D2%</th>
                <th class="border border-slate-300 px-2 w-14 text-right">GST%</th>
                <th class="border border-slate-300 px-2 w-28 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track $index; let r = $index) {
                <tr>
                  <td class="border border-slate-300 text-center text-slate-400">{{ r + 1 }}</td>
                  <td class="border border-slate-300 relative p-0">
                    <input [attr.data-cell]="r + ':name'" [(ngModel)]="row.name" (ngModelChange)="onProductQuery(r, $event)"
                           (keydown)="onCellKey($event, r, 'name')"
                           class="w-full px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                    @if (searchRow() === r && !productHits().length && row.name.length >= 2 && !row.productId) {
                      <div class="absolute top-full left-0 z-50 w-96 bg-white border rounded-b shadow-lg">
                        <div (mousedown)="openQuickCreate('product', row.name, r)"
                             class="px-2 py-1.5 cursor-pointer bg-amber-50 hover:bg-amber-100">
                          ➕ Create item “{{ row.name }}” <span class="text-slate-400">(Enter)</span>
                        </div>
                      </div>
                    }
                    @if (searchRow() === r && productHits().length) {
                      <div class="absolute top-full left-0 z-50 w-96 bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
                        @for (hit of productHits(); track hit.id; let i = $index) {
                          <div (mousedown)="pickProduct(r, hit)"
                               class="px-2 py-1.5 cursor-pointer flex justify-between gap-2"
                               [class.bg-amber-100]="i === productHitIdx()">
                            <span class="truncate">{{ hit.name }}</span>
                            <span class="text-slate-400 whitespace-nowrap">stk {{ hit.stock ?? 0 }}</span>
                          </div>
                        }
                      </div>
                    }
                  </td>
                  <td class="border border-slate-300 px-2 text-slate-500">{{ row.hsn }}</td>
                  <td class="border border-slate-300 px-2 text-right">{{ row.stock ?? '' }}</td>
                  <td class="border border-slate-300 p-0">
                    <input [attr.data-cell]="r + ':qty'" type="number" [(ngModel)]="row.qty" (keydown)="onCellKey($event, r, 'qty')"
                           class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
                  </td>
                  <td class="border border-slate-300 p-0">
                    <input [attr.data-cell]="r + ':free'" type="number" [(ngModel)]="row.free" (keydown)="onCellKey($event, r, 'free')"
                           class="w-full px-2 py-1 text-right text-emerald-700 focus:bg-amber-50 focus:outline-none" title="Free / scheme qty" />
                  </td>
                  <td class="border border-slate-300 p-0">
                    <input [attr.data-cell]="r + ':rate'" type="number" [(ngModel)]="row.rate" (keydown)="onCellKey($event, r, 'rate')"
                           class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
                  </td>
                  <td class="border border-slate-300 p-0">
                    <input [attr.data-cell]="r + ':d1'" type="number" [(ngModel)]="row.d1" (keydown)="onCellKey($event, r, 'd1')"
                           class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
                  </td>
                  <td class="border border-slate-300 p-0">
                    <input [attr.data-cell]="r + ':d2'" type="number" [(ngModel)]="row.d2" (keydown)="onCellKey($event, r, 'd2')"
                           class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
                  </td>
                  <td class="border border-slate-300 p-0">
                    <input [attr.data-cell]="r + ':gstRate'" type="number" [(ngModel)]="row.gstRate" (keydown)="onCellKey($event, r, 'gstRate')"
                           class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
                  </td>
                  <td class="border border-slate-300 px-2 text-right font-medium">{{ fmt(lineAmount(row)) }}</td>
                </tr>
                @if (row.showBatch) {
                  <tr><td class="border-x border-slate-300"></td>
                    <td colspan="10" class="px-2 py-1 border-x border-slate-300 bg-slate-50">
                      <span class="text-xs text-slate-500 mr-2">Batch:</span>
                      <input [(ngModel)]="row.batchNo" placeholder="Batch no" class="border rounded px-2 py-0.5 text-xs w-28 mr-2 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                      <input type="date" [(ngModel)]="row.expiry" class="border rounded px-2 py-0.5 text-xs mr-2 focus:bg-amber-50 focus:outline-none" title="Expiry" />
                      <label class="text-xs text-slate-500 mr-2">MRP ₹
                        <input type="number" [(ngModel)]="row.batchMrp" class="border rounded px-1 py-0.5 text-xs w-20 text-right ml-1 focus:bg-amber-50 focus:outline-none" title="THIS lot's printed MRP" />
                      </label>
                      <label class="text-xs text-slate-500 mr-2">Sale ₹
                        <input type="number" [(ngModel)]="row.batchSale" class="border rounded px-1 py-0.5 text-xs w-20 text-right ml-1 focus:bg-amber-50 focus:outline-none" title="THIS lot's selling price" />
                      </label>
                      <input [(ngModel)]="row.godown" placeholder="Godown" class="border rounded px-2 py-0.5 text-xs w-24 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                      <span class="text-xs text-slate-400 ml-2">new MRP → new lot; old stock stays (Alt+B)</span>
                    </td></tr>
                }
                @if (row.productId) {
                  <tr>
                    <td></td>
                    <td colspan="10" class="px-2 pb-1 pt-0 text-xs text-slate-500 border-x border-slate-300">
                      Stock: <b>{{ row.stock ?? 0 }} {{ row.uom }}</b>
                      @if (row.lastFromSupplier) {
                        · Last from {{ supplier()?.name || 'party' }}:
                        <b class="text-indigo-600">₹{{ fmt(row.lastFromSupplier.price) }}</b>
                        on {{ row.lastFromSupplier.at | date: 'dd-MM-yy' }}
                      } @else if (supplier()) { · First purchase from {{ supplier()!.name }} }
                      @if (row.lastOverall) { · Last overall: ₹{{ fmt(row.lastOverall.price) }} }
                      @if (row.salePrice && row.rate) {
                        · Sells at ₹{{ fmt(row.salePrice) }}
                        <b [class.text-emerald-600]="margin(row) > 0" [class.text-red-600]="margin(row) <= 0">
                          ({{ margin(row) > 0 ? '+' : '' }}{{ margin(row).toFixed(1) }}% margin)
                        </b>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>

          <!-- Footer -->
          <div class="flex gap-4 mt-3 items-start">
            <div class="flex-1">
              <div class="text-sm bg-slate-50 border rounded px-3 py-2 mb-2">
                <div class="font-medium text-slate-600 mb-1">Add / Less charges:</div>
                @for (c of chargeRows; track $index) {
                  <div class="flex items-center gap-2 mb-1">
                    <input [(ngModel)]="c.label" class="w-28 border rounded px-1.5 py-0.5" autocomplete="off" />
                    <label>₹ <input type="number" [(ngModel)]="c.amount" class="w-24 border rounded px-1.5 py-0.5 text-right" /></label>
                    <label>GST% <input type="number" [(ngModel)]="c.gstRate" class="w-14 border rounded px-1.5 py-0.5 text-right" /></label>
                  </div>
                }
              </div>
            <label class="text-sm block">Narration
              <input data-cell="note" [(ngModel)]="note" (keydown)="onNoteKey($event)"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
            </div>
            <div class="text-sm w-64 space-y-1">
              <div class="flex justify-between"><span class="text-slate-500">Taxable</span><span>{{ fmt(taxable()) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Charges</span><span>+ {{ fmt(chargesAmt()) }}</span></div>
              @if (isInterstate) {
                <div class="flex justify-between"><span class="text-slate-500">IGST (input)</span><span>{{ fmt(totalTax()) }}</span></div>
              } @else {
                <div class="flex justify-between"><span class="text-slate-500">CGST (input)</span><span>{{ fmt(totalTax() / 2) }}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">SGST (input)</span><span>{{ fmt(totalTax() / 2) }}</span></div>
              }
              <div class="flex justify-between font-semibold text-base border-t pt-1"><span>Total</span><span>₹{{ fmt(grandTotal()) }}</span></div>
              @if (error()) { <p class="text-red-600 text-xs">{{ error() }}</p> }
              <button (click)="save()" [disabled]="saving() || !canSave()"
                      class="w-full mt-1 px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50">
                {{ saving() ? 'Saving…' : 'Save Purchase (Ctrl+A)' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Supplier context panel -->
        <div class="border rounded-lg p-3 h-fit text-sm bg-slate-50">
          @if (supplier(); as s) {
            <h3 class="font-semibold mb-1">{{ s.name }}</h3>
            <p class="text-slate-500 mb-2">{{ s.gstin || '' }} {{ s.phone ? '· ' + s.phone : '' }}</p>
            <div class="mb-3 p-2 rounded border" [class.border-red-300]="s.outstanding > 0" [class.bg-red-50]="s.outstanding > 0">
              Payable <b>₹{{ fmt(s.outstanding) }}</b> · {{ s.openOrders }} open order(s)
            </div>
            <h4 class="font-medium text-slate-600 mb-1">Recent purchases</h4>
            @for (o of s.recentOrders; track o.orderNumber) {
              <div class="flex justify-between text-xs py-0.5">
                <span class="font-mono">{{ o.supplierInvoiceNo || o.orderNumber }}</span>
                <span [class.text-red-600]="o.paymentStatus !== 'paid'">₹{{ fmt(o.total) }} {{ o.paymentStatus }}</span>
              </div>
            } @empty { <p class="text-xs text-slate-400">No purchases yet.</p> }
            <h4 class="font-medium text-slate-600 mt-3 mb-1">Usually supplies</h4>
            @for (item of s.topItems; track item.productId) {
              <div class="flex justify-between text-xs py-0.5">
                <span class="truncate">{{ item.productName }}</span>
                <span class="text-slate-500 whitespace-nowrap">₹{{ fmt(item.lastPrice) }} · {{ item.lastDate | date: 'dd-MM-yy' }}</span>
              </div>
            } @empty { <p class="text-xs text-slate-400">—</p> }
          } @else {
            <p class="text-slate-400">Select a supplier to see payables, recent purchases and their usual items & costs.</p>
          }
          <div class="mt-4 pt-3 border-t text-xs text-slate-400 leading-5">
            <b class="text-slate-500">Keys:</b> Enter/Tab next · Shift+Tab back · ↑↓ rows/popup · <b>Alt+D category disc</b> · Esc close · <b>Ctrl+A save</b>
          </div>
        </div>
      </div>

      <wa-entry-lookup [kind]="'supplier'" [party]="supplier()" [rows]="rows" (applyRate)="onApplyRate($event)" />

      <wa-category-discount-dialog [open]="showCatDisc()" [existingProductIds]="existingProductIds()"
                                   (applied)="applyCategoryDiscount($event)" (closed)="showCatDisc.set(false)" />

      @if (qc(); as q) {
        <wa-quick-create [kind]="q.kind" [prefillName]="q.name"
                         (created)="onQuickCreated($event)" (cancel)="qc.set(null)" />
      }
    </div>
  `,
})
export class PurchaseEntryComponent implements OnInit, OnDestroy {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly drafts = inject(EntryDraftService);

  // ─── Draft retention: navigating away mid-entry keeps everything typed ──────
  ngOnInit(): void {
    const d = this.drafts.load<any>('purchase');
    if (!d) return;
    this.supplierQuery = d.supplierQuery ?? ''; this.supplier.set(d.supplier ?? null);
    if (Array.isArray(d.rows) && d.rows.length) this.rows = d.rows;
    this.supplierInvoiceNo = d.supplierInvoiceNo ?? ''; this.supplierInvoiceDate = d.supplierInvoiceDate ?? this.supplierInvoiceDate;
    this.isInterstate = !!d.isInterstate; this.note = d.note ?? '';
    if (Array.isArray(d.chargeRows) && d.chargeRows.length) this.chargeRows = d.chargeRows;
    this.tick.update((t) => t + 1);
    this.drafts.note('✎ Draft restored — Alt+X to start fresh');
  }

  ngOnDestroy(): void {
    clearTimeout(this.draftTimer);
    if (!this.entryDirty()) { this.drafts.clear('purchase'); return; }
    this.drafts.save('purchase', this.captureDraft());
    this.drafts.note('✎ Draft kept — it will be waiting when you return');
  }

  private captureDraft() {
    return {
      supplierQuery: this.supplierQuery, supplier: this.supplier(), rows: this.rows,
      supplierInvoiceNo: this.supplierInvoiceNo, supplierInvoiceDate: this.supplierInvoiceDate,
      isInterstate: this.isInterstate, note: this.note, chargeRows: this.chargeRows,
    };
  }

  /** Debounced autosave — survives hard reloads/app close too. */
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  @HostListener('input')
  onDraftAutosave(): void {
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      if (this.entryDirty()) this.drafts.save('purchase', this.captureDraft());
    }, 700);
  }

  private entryDirty(): boolean {
    return !!(this.supplierQuery.trim() || this.supplier() || this.note || this.rows.some((r) => r.name || r.qty || r.rate));
  }

  /** Alt+X — wipe the entry and its draft (start fresh). */
  @HostListener('document:wa-clear-entry')
  clearEntry(): void {
    this.drafts.clear('purchase');
    this.supplierQuery = ''; this.supplier.set(null); this.supplierHits.set([]);
    this.rows = [this.blankRow(), this.blankRow()];
    this.supplierInvoiceNo = ''; this.isInterstate = false; this.note = '';
    this.chargeRows = [
      { label: 'Freight', amount: null, gstRate: null },
      { label: 'Other', amount: null, gstRate: null },
    ];
    this.error.set(null);
    this.tick.update((t) => t + 1);
    this.drafts.note('✕ Entry cleared');
    setTimeout(() => (this.host.nativeElement.querySelector('[data-cell="party"], input') as HTMLInputElement | null)?.focus());
  }


  readonly today = new Date();
  readonly tick = signal(0);

  supplierQuery = '';
  readonly supplierHits = signal<SupplierHit[]>([]);
  readonly supplierHitIdx = signal(0);
  readonly supplier = signal<SupplierContext | null>(null);

  rows: Row[] = [this.blankRow(), this.blankRow()];
  readonly productHits = signal<ProductHit[]>([]);
  readonly productHitIdx = signal(0);
  readonly searchRow = signal<number | null>(null);

  supplierInvoiceNo = '';
  supplierInvoiceDate = new Date().toISOString().slice(0, 10);
  isInterstate = false;
  note = '';
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedNumber = signal<string | null>(null);
  chargeRows = [
    { label: 'Freight', amount: null, gstRate: null },
    { label: 'Other', amount: null, gstRate: null },
  ] as Array<{ label: string; amount: number | null; gstRate: number | null }>;
  readonly qc = signal<{ kind: QuickKind; name: string; row?: number } | null>(null);

  private debounce?: ReturnType<typeof setTimeout>;

  private blankRow(): Row {
    return { name: '', hsn: '', uom: 'pcs', qty: null, free: null, rate: null, d1: null, d2: null, gstRate: null };
  }

  // ─── Supplier typeahead ─────────────────────────────────────────────────────
  onSupplierQuery(q: string): void {
    this.supplier.set(null);
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.supplierHits.set([]); return; }
    this.debounce = setTimeout(() => {
      this.entry.suppliers(q).subscribe((hits) => { this.supplierHits.set(hits || []); this.supplierHitIdx.set(0); });
    }, 200);
  }

  onPartyKey(e: KeyboardEvent): void {
    const hits = this.supplierHits();
    if (hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.supplierHitIdx.set(Math.min(this.supplierHitIdx() + 1, hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.supplierHitIdx.set(Math.max(this.supplierHitIdx() - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickSupplier(hits[this.supplierHitIdx()]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); this.supplierHits.set([]); return; }
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (!this.supplier() && this.supplierQuery.length >= 2) { this.openQuickCreate('supplier', this.supplierQuery); return; }
      this.focus('billno');
    }
  }

  onBillNoKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.focusCell(0, 'name'); }
  }

  pickSupplier(hit: SupplierHit): void {
    this.supplierQuery = hit.name;
    this.supplierHits.set([]);
    this.entry.supplierContext(hit.id).subscribe((ctx) => {
      this.supplier.set(ctx);
      for (let r = 0; r < this.rows.length; r++) if (this.rows[r].productId) this.loadItemContext(r);
    });
    setTimeout(() => this.focus('billno'));
  }

  // ─── Item typeahead ─────────────────────────────────────────────────────────
  onProductQuery(r: number, q: string): void {
    const row = this.rows[r];
    row.productId = undefined; row.hsn = ''; row.stock = undefined;
    row.lastFromSupplier = null; row.lastOverall = null;
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.productHits.set([]); this.searchRow.set(null); return; }
    this.debounce = setTimeout(() => {
      this.entry.products(q).subscribe((hits) => {
        this.productHits.set(hits || []); this.productHitIdx.set(0); this.searchRow.set(r);
      });
    }, 200);
  }

  pickProduct(r: number, hit: ProductHit): void {
    const row = this.rows[r];
    row.productId = hit.id;
    row.name = hit.name;
    row.hsn = hit.hsnCode || '';
    row.uom = hit.uom || 'pcs';
    row.gstRate = Number(hit.gstRate) || 0;
    row.stock = Number(hit.stock) || 0;
    row.salePrice = Number(hit.salePrice ?? hit.basePrice) || undefined;
    // Item-master purchase rate as the base default; rate memory (last from supplier) overrides.
    row.rate = Number((hit as any).purchasePrice) || null;
    this.productHits.set([]); this.searchRow.set(null);
    this.loadItemContext(r, true);
    setTimeout(() => this.focusCell(r, 'qty'));
  }

  private loadItemContext(r: number, prefillRate = false): void {
    const row = this.rows[r];
    if (!row.productId) return;
    this.entry.itemPurchaseContext(row.productId, this.supplier()?.id).subscribe((ctx) => {
      row.stock = Number(ctx.stock) || 0;
      row.lastFromSupplier = ctx.lastFromSupplier || null;
      row.lastOverall = ctx.lastOverall || null;
      const memory = ctx.lastFromSupplier || ctx.lastOverall;
      // Rate memory wins over the item-master purchase rate (only right after pick).
      if (prefillRate && memory) row.rate = money(memory.price);
      this.tick.update((t) => t + 1);
    });
  }

  // ─── Grid keyboard navigation ───────────────────────────────────────────────
  onCellKey(e: KeyboardEvent, r: number, col: Col): void {
    const hits = this.productHits();
    if (col === 'name' && this.searchRow() === r && hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.productHitIdx.set(Math.min(this.productHitIdx() + 1, hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.productHitIdx.set(Math.max(this.productHitIdx() - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickProduct(r, hits[this.productHitIdx()]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); this.productHits.set([]); this.searchRow.set(null); return; }
    }
    switch (e.key) {
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) { this.focusPrev(r, col); return; }
        if (col === 'name' && !this.rows[r].name) { this.focus('note'); return; }
        if (col === 'name' && !this.rows[r].productId && this.rows[r].name.length >= 2 && !hits.length) {
          this.openQuickCreate('product', this.rows[r].name, r);
          return;
        }
        this.focusNext(r, col);
        return;
      case 'Insert':
        e.preventDefault();
        this.rows.splice(r + 1, 0, this.blankRow());
        setTimeout(() => this.focusCell(r + 1, 'name'));
        return;
      case 'Delete':
        if (!e.ctrlKey) return;
        e.preventDefault();
        if (this.rows.length > 1) { this.rows.splice(r, 1); setTimeout(() => this.focusCell(Math.min(r, this.rows.length - 1), 'name')); }
        return;
      case 'ArrowDown':
        e.preventDefault();
        if (r + 1 >= this.rows.length) this.rows.push(this.blankRow());
        setTimeout(() => this.focusCell(r + 1, col));
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (r > 0) this.focusCell(r - 1, col);
        return;
    }
  }

  onNoteKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.preventDefault(); this.save(); }
  }

  private focusNext(r: number, col: Col): void {
    const i = COLS.indexOf(col);
    if (i < COLS.length - 1) { this.focusCell(r, COLS[i + 1]); return; }
    if (r + 1 >= this.rows.length) this.rows.push(this.blankRow());
    setTimeout(() => this.focusCell(r + 1, 'name'));
  }
  private focusPrev(r: number, col: Col): void {
    const i = COLS.indexOf(col);
    if (i > 0) this.focusCell(r, COLS[i - 1]);
    else if (r > 0) this.focusCell(r - 1, COLS[COLS.length - 1]);
    else this.focus('party');
  }
  private focusCell(r: number, col: string): void {
    const el = this.host.nativeElement.querySelector(`[data-cell="${r}:${col}"]`) as HTMLInputElement | null;
    el?.focus(); el?.select();
  }
  private focus(cell: string): void {
    (this.host.nativeElement.querySelector(`[data-cell="${cell}"]`) as HTMLInputElement | null)?.focus();
  }

  openQuickCreate(kind: QuickKind, name: string, row?: number): void {
    this.supplierHits.set([]);
    this.productHits.set([]);
    this.searchRow.set(null);
    this.qc.set({ kind, name, row });
  }

  onQuickCreated(created: QuickCreated): void {
    const ctx = this.qc();
    this.qc.set(null);
    if (created.kind === 'supplier') {
      this.pickSupplier({ id: created.id, name: created.name, gstin: created.gstin });
    } else if (created.kind === 'product' && ctx?.row !== undefined) {
      this.pickProduct(ctx.row, {
        id: created.id, name: created.name, uom: created.uom,
        hsnCode: created.hsnCode, gstRate: created.gstRate,
        salePrice: created.rate, basePrice: created.rate, stock: 0,
      });
    }
  }

  /** Miracle: Ctrl+Enter accepts/saves the voucher from anywhere (alias of Ctrl+A). */

  @HostListener('document:keydown.control.enter', ['$event'])

  onCtrlEnterSave(e: Event): void { this.onSaveKey(e as any); }

  /** Alt+B — toggle the batch/expiry/godown strip for the line under the cursor. */
  @HostListener('document:keydown.alt.b', ['$event'])
  onBatchKey(e: Event): void {
    e.preventDefault();
    const dc = (document.activeElement as HTMLElement | null)?.getAttribute?.('data-cell') || '';
    const m = /^(\d+):/.exec(dc);
    const r = m ? +m[1] : this.rows.findIndex((row) => row.productId);
    if (r < 0 || !this.rows[r]) return;
    this.rows[r].showBatch = !this.rows[r].showBatch;
    this.tick.update((t) => t + 1);
  }

  @HostListener('document:keydown.control.a', ['$event'])
  onSaveKey(e: Event): void { e.preventDefault(); this.save(); }

  // ─── Totals ────────────────────────────────────────────────────────────────
  lineAmount(row: Row): number {
    const grossAmt = (Number(row.qty) || 0) * (Number(row.rate) || 0);
    return money(grossAmt * (1 - (Number(row.d1) || 0) / 100) * (1 - (Number(row.d2) || 0) / 100));
  }
  private liveRows(): Row[] { return this.rows.filter((r) => r.name && (Number(r.qty) || 0) > 0); }
  taxable(): number { return money(this.liveRows().reduce((s, r) => s + this.lineAmount(r), 0)); }
  liveCharges(): Array<{ label: string; amount: number; gstRate: number }> {
    return this.chargeRows
      .map((c) => ({ label: c.label || 'Charge', amount: money(Number(c.amount) || 0), gstRate: Number(c.gstRate) || 0 }))
      .filter((c) => c.amount !== 0);
  }
  chargesAmt(): number { return money(this.liveCharges().reduce((s, c) => s + c.amount, 0)); }
  totalTax(): number { return money(this.liveRows().reduce((s, r) => s + this.lineAmount(r) * ((Number(r.gstRate) || 0) / 100), 0)); }
  grandTotal(): number { return money(this.taxable() + this.chargesAmt() + this.totalTax()); }
  margin(row: Row): number {
    const rate = Number(row.rate) || 0;
    const sale = Number(row.salePrice) || 0;
    return rate > 0 && sale > 0 ? ((sale - rate) / rate) * 100 : 0;
  }
  canSave(): boolean { return this.liveRows().length > 0 && this.grandTotal() > 0; }

  /** Alt+L rate pick: write the chosen historical rate back into the grid line. */
  onApplyRate(e: { row: number; rate: number }): void {
    const row = this.rows[e.row];
    if (!row) return;
    row.rate = e.rate;
    this.tick.update((t) => t + 1);
  }

  // ─── Category discount (Alt+D) ──────────────────────────────────────────────
  readonly showCatDisc = signal(false);
  /** Product ids already on the grid — the dialog pre-checks + badges these. */
  existingProductIds(): string[] { return this.rows.filter((r) => r.productId).map((r) => r.productId!); }

  @HostListener('document:keydown.alt.d', ['$event'])
  onAltD(e: Event): void {
    e.preventDefault();
    this.showCatDisc.set(true);
  }

  /**
   * Fill the chosen discount % (D1) across the picked category's products: existing
   * lines get their D1 set; products not yet on the bill are added as fresh lines.
   */
  applyCategoryDiscount(ev: { products: CategoryProduct[]; discountPct: number }): void {
    const disc = Number(ev.discountPct) || 0;
    for (const cp of ev.products) {
      const existing = this.rows.filter((r) => r.productId === cp.id);
      if (existing.length) {
        for (const r of existing) r.d1 = disc;
      } else {
        this.rows.push(this.rowFromProduct(cp, disc));
        this.loadItemContext(this.rows.length - 1);
      }
    }
    // Ensure a trailing blank row remains for further entry.
    if (this.rows.length === 0 || this.rows[this.rows.length - 1].productId) this.rows.push(this.blankRow());
    this.tick.update((t) => t + 1);
  }

  private rowFromProduct(cp: CategoryProduct, d1: number): Row {
    const gstRate = Number(cp.gstRate) || 0;
    let rate = Number(cp.salePrice ?? cp.basePrice) || null;
    if (cp.priceIncludesTax && rate && gstRate) rate = money(rate / (1 + gstRate / 100));
    return {
      ...this.blankRow(),
      productId: cp.id, name: cp.name, hsn: cp.hsnCode || '', uom: cp.uom || 'pcs',
      gstRate, rate: rate != null ? money(rate) : null, qty: 1, d1,
    };
  }

  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }

  // ─── Save ──────────────────────────────────────────────────────────────────
  save(): void {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const items = this.liveRows().map((r) => ({
      productId: r.productId,
      description: r.name,
      quantity: Number(r.qty),
      unitPrice: money((Number(r.rate) || 0) * (1 - (Number(r.d1) || 0) / 100) * (1 - (Number(r.d2) || 0) / 100)),
      gstRate: Number(r.gstRate) || 0,
      hsn: r.hsn || undefined,
      freeQty: Number(r.free) || 0,
      d1: Number(r.d1) || 0,
      d2: Number(r.d2) || 0,
      mrpRate: Number(r.rate) || 0,
      batchNo: r.batchNo?.trim() || undefined,
      expiry: r.expiry || undefined,
      godown: r.godown?.trim() || undefined,
      batchMrp: r.batchMrp != null ? Number(r.batchMrp) : undefined,
      batchSale: r.batchSale != null ? Number(r.batchSale) : undefined,
    })) as any;
    this.entry
      .createPurchase({
        supplierId: this.supplier()?.id,
        items,
        taxRate: 0,
        discount: 0,
        note: this.note || undefined,
        supplierInvoiceNo: this.supplierInvoiceNo || undefined,
        supplierInvoiceDate: this.supplierInvoiceDate || undefined,
        isInterstate: this.isInterstate,
        charges: this.liveCharges(),
      })
      .subscribe({
        next: (so) => {
          this.saving.set(false);
          this.savedNumber.set(so?.orderNumber || 'purchase');
          this.drafts.clear('purchase');
          this.rows = [this.blankRow(), this.blankRow()];
          this.note = '';
          this.supplierInvoiceNo = '';
          this.supplierQuery = '';
          this.supplier.set(null);
          this.chargeRows = [
            { label: 'Freight', amount: null, gstRate: null },
            { label: 'Other', amount: null, gstRate: null },
          ];
          this.tick.update((t) => t + 1);
          setTimeout(() => this.focus('party'));
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || (err?.status === 403 ? 'ERP procurement is not enabled on this plan' : 'Failed to save purchase'));
        },
      });
  }
}
