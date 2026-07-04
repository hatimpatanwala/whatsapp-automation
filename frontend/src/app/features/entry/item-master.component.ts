import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EntryService, ItemMasterRow } from '../../core/services/entry.service';

const FIELDS = ['name', 'unit', 'altUnit', 'factor', 'hsn', 'barcode', 'gst', 'pRate', 'sRate', 'mrp', 'oRate', 'minStock', 'stockQty'] as const;
type Field = (typeof FIELDS)[number];
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Item Master — Miracle "Add Item" + "Add Stock" in one screen.
 *
 * Left: live item browser (type to filter, ↑↓ move, Enter edit, Ins new item).
 * Right: the master form — Unit / Alt Unit + conversion factor (dual units),
 * HSN, GST%, Purchase Rate / Sale Rate / MRP, Min Stock — plus the stock box:
 * opening stock on a new item, ± Add Stock on an existing one (delta lands on
 * the same inventory row billing deducts from). Enter walks the fields,
 * Ctrl+A saves, Esc returns to the list.
 */
@Component({
  selector: 'wa-item-master',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-3 md:p-5 select-none">
      <span class="hidden">{{ tick() }}</span>
      <div class="flex items-center gap-4 mb-3 border-b pb-2">
        <h1 class="text-lg font-semibold">Item Master</h1>
        <span class="text-xs text-slate-500">↑↓ pick · Enter edit · Ins new item · Ctrl+A save · Esc list</span>
        @if (saved()) {
          <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">✓ {{ saved() }}</span>
        }
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <!-- Item browser -->
        <div class="lg:col-span-2 border rounded-lg overflow-hidden">
          <div class="flex gap-2 p-2 bg-slate-50 border-b">
            <input data-cell="search" data-autofocus [(ngModel)]="query" (ngModelChange)="reload()" (keydown)="onListKey($event)"
                   class="flex-1 border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none"
                   placeholder="Search items…" autocomplete="off" />
            <button (click)="startNew()" class="px-3 py-1.5 rounded bg-slate-800 text-white text-sm whitespace-nowrap">＋ New (Ins)</button>
          </div>
          <table class="w-full text-sm" style="border-collapse: collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-600 text-xs">
                <th class="px-2 py-1 text-left">Item</th>
                <th class="px-2 py-1 text-right w-16">Stock</th>
                <th class="px-2 py-1 text-right w-20">Rate</th>
                <th class="px-2 py-1 text-right w-14">GST%</th>
              </tr>
            </thead>
            <tbody>
              @for (it of list(); track it.id; let i = $index) {
                <tr (click)="pick(it)" class="cursor-pointer border-t border-slate-100"
                    [class.bg-amber-100]="i === idx()" [class.bg-white]="i !== idx()">
                  <td class="px-2 py-1">{{ it.name }}
                    @if (it.altUom) { <span class="text-xs text-slate-400">({{ it.altUom }} = {{ it.uomFactor }} {{ it.uom }})</span> }
                  </td>
                  <td class="px-2 py-1 text-right"
                      [class.text-red-600]="(it.stock ?? 0) <= (it.minStock ?? 0)">{{ it.stock ?? 0 }}</td>
                  <td class="px-2 py-1 text-right">{{ fmt(it.salePrice ?? it.basePrice) }}</td>
                  <td class="px-2 py-1 text-right text-slate-500">{{ it.gstRate ?? 0 }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="px-2 py-4 text-center text-slate-400 text-sm">No items — press Ins to add your first item.</td></tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Master form -->
        <div class="lg:col-span-3 border rounded-lg p-4">
          <h2 class="font-semibold text-sm mb-3">
            {{ editId() ? 'Edit Item' : 'Add Item' }}
            @if (editId()) { <span class="text-slate-400 font-normal">— current stock <b class="text-slate-700">{{ curStock() }}</b> {{ unit || 'pcs' }}</span> }
          </h2>

          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <label class="text-sm col-span-2 md:col-span-3">Item name *
              <input data-cell="name" [(ngModel)]="name" (keydown)="onFieldKey($event, 'name')"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
            <label class="text-sm">Unit
              <input data-cell="unit" [(ngModel)]="unit" (keydown)="onFieldKey($event, 'unit')" placeholder="pcs / kg / box"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
            <label class="text-sm">Alt unit <span class="text-slate-400">(dual unit)</span>
              <input data-cell="altUnit" [(ngModel)]="altUnit" (keydown)="onFieldKey($event, 'altUnit')" placeholder="bag / ctn"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
            <label class="text-sm">1 {{ altUnit || 'alt' }} =
              <div class="flex items-center gap-1 mt-1">
                <input data-cell="factor" type="number" [(ngModel)]="factor" (keydown)="onFieldKey($event, 'factor')"
                       class="w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
                <span class="text-xs text-slate-500">{{ unit || 'pcs' }}</span>
              </div>
            </label>
            <label class="text-sm">HSN / SAC
              <input data-cell="hsn" [(ngModel)]="hsn" (keydown)="onFieldKey($event, 'hsn')"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
            <label class="text-sm">Barcode / alias <span class="text-slate-400">(searchable)</span>
              <input data-cell="barcode" [(ngModel)]="barcode" (keydown)="onFieldKey($event, 'barcode')"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
            <label class="text-sm">GST %
              <input data-cell="gst" type="number" [(ngModel)]="gst" (keydown)="onFieldKey($event, 'gst')"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
            </label>
            <label class="text-sm">Purchase rate ₹
              <input data-cell="pRate" type="number" [(ngModel)]="pRate" (keydown)="onFieldKey($event, 'pRate')"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
            </label>
            <label class="text-sm">Sale rate ₹ *
              <input data-cell="sRate" type="number" [(ngModel)]="sRate" (keydown)="onFieldKey($event, 'sRate')"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
            </label>
            <label class="text-sm">MRP ₹
              <input data-cell="mrp" type="number" [(ngModel)]="mrp" (keydown)="onFieldKey($event, 'mrp')"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
            </label>
            <label class="text-sm">Opening rate ₹ <span class="text-slate-400">(stock valuation)</span>
              <input data-cell="oRate" type="number" [(ngModel)]="oRate" (keydown)="onFieldKey($event, 'oRate')"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
            </label>
            <label class="text-sm">Min stock <span class="text-slate-400">(reorder alert)</span>
              <input data-cell="minStock" type="number" [(ngModel)]="minStock" (keydown)="onFieldKey($event, 'minStock')"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
            </label>
          </div>

          <!-- Stock box -->
          <div class="mt-4 border rounded p-3 bg-slate-50">
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-sm font-medium">{{ editId() ? 'Add Stock' : 'Opening Stock' }}</span>
              <input data-cell="stockQty" type="number" [(ngModel)]="stockQty" (keydown)="onFieldKey($event, 'stockQty')"
                     class="w-28 border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none"
                     [placeholder]="editId() ? '± qty' : 'qty'" />
              <span class="text-xs text-slate-500">{{ unit || 'pcs' }}</span>
              @if (editId() && stockQty) {
                <span class="text-sm text-slate-600">→ new stock <b>{{ curStock() + (+stockQty! || 0) }}</b></span>
              }
              @if (altUnit && factor && stockQty) {
                <span class="text-xs text-slate-400">= {{ fmt((+stockQty! || 0) / (+factor! || 1)) }} {{ altUnit }}</span>
              }
            </div>
          </div>

          <div class="flex items-center gap-3 mt-4">
            <button (click)="save()" [disabled]="saving() || !canSave()"
                    class="px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">
              {{ saving() ? 'Saving…' : (editId() ? 'Save Changes (Ctrl+A)' : 'Save Item (Ctrl+A)') }}
            </button>
            @if (editId()) {
              <button (click)="startNew()" class="px-3 py-2 rounded border text-sm">New Item (Ins)</button>
            }
            @if (error()) { <span class="text-red-600 text-xs">{{ error() }}</span> }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ItemMasterComponent {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly tick = signal(0);
  readonly list = signal<ItemMasterRow[]>([]);
  readonly idx = signal(0);
  readonly editId = signal<string | null>(null);
  readonly curStock = signal(0);

  query = '';
  name = '';
  unit = '';
  altUnit = '';
  factor: number | null = null;
  hsn = '';
  barcode = '';
  gst: number | null = null;
  pRate: number | null = null;
  sRate: number | null = null;
  mrp: number | null = null;
  oRate: number | null = null;
  minStock: number | null = null;
  stockQty: number | null = null;

  readonly saving = signal(false);
  readonly saved = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  private debounce?: ReturnType<typeof setTimeout>;

  constructor() {
    this.reload(true);
  }

  reload(now = false): void {
    clearTimeout(this.debounce);
    const run = () => this.entry.items(this.query.trim()).subscribe((rows) => {
      this.list.set(rows || []);
      this.idx.set(0);
    });
    if (now) run(); else this.debounce = setTimeout(run, 200);
  }

  onListKey(e: KeyboardEvent): void {
    const items = this.list();
    if (e.key === 'ArrowDown') { e.preventDefault(); this.idx.set(Math.min(this.idx() + 1, items.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.idx.set(Math.max(this.idx() - 1, 0)); return; }
    if (e.key === 'Enter' && items.length) { e.preventDefault(); this.pick(items[this.idx()]); return; }
  }

  pick(it: ItemMasterRow): void {
    this.editId.set(it.id);
    this.name = it.name;
    this.unit = it.uom || '';
    this.altUnit = it.altUom || '';
    this.factor = it.uomFactor != null ? Number(it.uomFactor) : null;
    this.hsn = it.hsnCode || '';
    this.barcode = it.barcode || '';
    this.gst = it.gstRate != null ? Number(it.gstRate) : null;
    this.pRate = it.purchasePrice != null ? Number(it.purchasePrice) : null;
    this.sRate = Number(it.basePrice ?? it.salePrice) || null;
    this.mrp = it.mrp != null ? Number(it.mrp) : null;
    this.oRate = it.openingRate != null ? Number(it.openingRate) : null;
    this.minStock = it.minStock != null ? Number(it.minStock) : null;
    this.curStock.set(Number(it.stock) || 0);
    this.stockQty = null;
    this.saved.set(null);
    this.error.set(null);
    setTimeout(() => this.focus('name'));
  }

  startNew(): void {
    this.editId.set(null);
    this.name = ''; this.unit = ''; this.altUnit = ''; this.factor = null;
    this.hsn = ''; this.barcode = ''; this.gst = null; this.pRate = null; this.sRate = null;
    this.mrp = null; this.oRate = null; this.minStock = null; this.stockQty = null;
    this.curStock.set(0);
    this.saved.set(null);
    this.error.set(null);
    setTimeout(() => this.focus('name'));
  }

  onFieldKey(e: KeyboardEvent, f: Field): void {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const i = FIELDS.indexOf(f);
      if (e.shiftKey) { if (i > 0) this.focus(FIELDS[i - 1]); return; }
      if (i < FIELDS.length - 1) this.focus(FIELDS[i + 1]);
      else this.save();
      return;
    }
    if (e.key === 'Escape') { e.stopPropagation(); this.focus('search'); }
  }

  /** Miracle: Ctrl+Enter accepts/saves the voucher from anywhere (alias of Ctrl+A). */

  @HostListener('document:keydown.control.enter', ['$event'])

  onCtrlEnterSave(e: Event): void { this.onSaveKey(e as any); }


  @HostListener('document:keydown.control.a', ['$event'])
  onSaveKey(e: Event): void { e.preventDefault(); this.save(); }

  @HostListener('document:keydown.insert', ['$event'])
  onInsKey(e: Event): void { e.preventDefault(); this.startNew(); }

  canSave(): boolean { return !!this.name.trim() && Number(this.sRate) > 0; }
  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }

  save(): void {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const body = {
      name: this.name.trim(),
      basePrice: money(Number(this.sRate) || 0),
      gstRate: this.gst != null ? Number(this.gst) : undefined,
      hsnCode: this.hsn.trim() || undefined,
      barcode: this.barcode.trim() || undefined,
      uom: this.unit.trim() || undefined,
      altUom: this.altUnit.trim() || undefined,
      uomFactor: this.factor != null ? Number(this.factor) : undefined,
      purchasePrice: this.pRate != null ? Number(this.pRate) : undefined,
      mrp: this.mrp != null ? Number(this.mrp) : undefined,
      openingRate: this.oRate != null ? Number(this.oRate) : undefined,
      lowStockThreshold: this.minStock != null ? Number(this.minStock) : undefined,
    };
    const id = this.editId();
    if (!id) {
      // New item: opening stock goes in with the create.
      const opening = Number(this.stockQty) || 0;
      this.entry.createProduct({ ...body, initialStock: opening }).subscribe({
        next: (p: any) => this.afterSave(`Item "${body.name}" created`, p?.id, opening),
        error: (err) => this.fail(err),
      });
    } else {
      this.entry.updateProduct(id, body).subscribe({
        next: () => {
          const qty = Number(this.stockQty) || 0;
          if (qty) {
            this.entry.addStock(id, qty).subscribe({
              next: (r) => this.afterSave(`"${body.name}" saved — stock now ${r?.stock ?? '?'}`, undefined, r?.stock),
              error: (err) => this.fail(err),
            });
          } else {
            this.afterSave(`"${body.name}" saved`);
          }
        },
        error: (err) => this.fail(err),
      });
    }
  }

  private afterSave(msg: string, newId?: string, stock?: number): void {
    this.saving.set(false);
    this.saved.set(msg);
    this.reload(true);
    if (newId) this.editId.set(newId);
    if (stock != null) this.curStock.set(Number(stock) || 0);
    this.stockQty = null;
    this.tick.update((t) => t + 1);
    setTimeout(() => this.focus('search'));
  }

  private fail(err: any): void {
    this.saving.set(false);
    this.error.set(err?.error?.message || 'Failed to save item');
  }

  private focus(cell: string): void {
    const el = this.host.nativeElement.querySelector(`[data-cell="${cell}"]`) as HTMLInputElement | null;
    el?.focus(); el?.select();
  }
}
