import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EntryService, ItemMasterRow } from '../../core/services/entry.service';
import { PermissionService } from '../../core/services/permission.service';

const FIELDS = ['name', 'unit', 'altUnit', 'factor', 'uqc', 'hsn', 'barcode', 'gst', 'pRate', 'sRate', 'mrp', 'saleDisc', 'oRate', 'minStock', 'stockQty'] as const;
type Field = (typeof FIELDS)[number];
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** GST Unit Quantity Codes (returns need unit → UQC mapping). */
const UQC_LIST = ['PCS', 'NOS', 'KGS', 'GMS', 'LTR', 'MLT', 'MTR', 'CMS', 'SQM', 'SQF', 'BOX', 'BAG', 'SET', 'PAC', 'DOZ', 'ROL', 'TON', 'QTL', 'BDL', 'CAN', 'CTN', 'DRM', 'GRS', 'PRS', 'TUB', 'UNT'];

/**
 * Item Master — full Vyapar × Miracle field parity (ITEM_MASTER_FIELDS_README.md):
 * identification (type/SKU/barcode/HSN/category/classification), dual units + UQC,
 * pricing tiers (sale w/ tax-incl toggle, purchase, wholesale, MRP, min/max, default
 * sale discount), GST (rate/cess/exempt), stock (opening qty+rate+date, min/max,
 * rack), batch/serial tracking mode with the MRP-wise batch registry (§3F.1), and a
 * location-wise stock view. Low-priority fields live behind "Advanced ▾" so the
 * default form stays clean. Enter walks the core fields, Ctrl+A/Ctrl+Enter saves.
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
        <div class="lg:col-span-2 border rounded-lg overflow-hidden self-start">
          <div class="flex gap-2 p-2 bg-slate-50 border-b items-center">
            <input data-cell="search" data-autofocus [(ngModel)]="query" (ngModelChange)="reload()" (keydown)="onListKey($event)"
                   class="flex-1 border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none"
                   placeholder="Search items / barcode…" autocomplete="off" />
            <label class="flex items-center gap-1 text-xs whitespace-nowrap" title="Only items at or below min stock">
              <input type="checkbox" [(ngModel)]="lowOnly" /> low stock
            </label>
            @if (writable()) { <button (click)="startNew()" class="px-3 py-1.5 rounded bg-slate-800 text-white text-sm whitespace-nowrap">＋ New (Ins)</button> }
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
              @for (it of visibleItems(); track it.id; let i = $index) {
                <tr (click)="pick(it)" class="cursor-pointer border-t border-slate-100"
                    [class.bg-amber-100]="i === idx()" [class.bg-white]="i !== idx()">
                  <td class="px-2 py-1">{{ it.name }}
                    @if (it.itemType === 'service') { <span class="text-xs text-indigo-500">(service)</span> }
                    @if (it.trackingMode === 'batch') { <span class="text-xs text-amber-600">[batch]</span> }
                    @if (it.altUom) { <span class="text-xs text-slate-400">({{ it.altUom }} = {{ it.uomFactor }} {{ it.uom }})</span> }
                  </td>
                  <td class="px-2 py-1 text-right"
                      [class.text-red-600]="it.itemType !== 'service' && (it.stock ?? 0) <= (it.minStock ?? 0)">
                    {{ it.itemType === 'service' ? '—' : (it.stock ?? 0) }}
                  </td>
                  <td class="px-2 py-1 text-right">{{ fmt(it.salePrice ?? it.basePrice) }}</td>
                  <td class="px-2 py-1 text-right text-slate-500">{{ it.gstRate ?? 0 }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="px-2 py-4 text-center text-slate-400 text-sm">No items — press Ins to add your first item.</td></tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Master form — disabled entirely for roles without products:write -->
        <fieldset [disabled]="!writable()" class="lg:col-span-3 border rounded-lg p-4 min-w-0">
          <h2 class="font-semibold text-sm mb-3 flex items-center gap-3 flex-wrap">
            {{ editId() ? 'Edit Item' : 'Add Item' }}
            <select [(ngModel)]="itemType" class="border rounded px-2 py-1 text-xs"
                    [class.bg-indigo-50]="itemType === 'service'" title="Service items carry no stock">
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
            @if (editId() && itemType !== 'service') {
              <span class="text-slate-400 font-normal">— current stock <b class="text-slate-700">{{ curStock() }}</b> {{ unit || 'pcs' }}</span>
            }
          </h2>

          <!-- Identification + units -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <label class="text-sm col-span-2">Item name *
              <input data-cell="name" [(ngModel)]="name" (keydown)="onFieldKey($event, 'name')"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
            <label class="text-sm">Category
              <select [(ngModel)]="categoryId" class="mt-1 w-full border rounded px-2 py-1.5">
                <option value="">—</option>
                @for (c of cats(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
            </label>
            <label class="text-sm">Unit
              <input data-cell="unit" [(ngModel)]="unit" (keydown)="onFieldKey($event, 'unit')" placeholder="pcs / kg / box"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
            <label class="text-sm">Alt unit <span class="text-slate-400">(dual)</span>
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
            <label class="text-sm">UQC <span class="text-slate-400">(GST unit code)</span>
              <select data-cell="uqc" [(ngModel)]="uqc" (keydown)="onFieldKey($event, 'uqc')" class="mt-1 w-full border rounded px-2 py-1.5">
                <option value="">—</option>
                @for (u of uqcList; track u) { <option [value]="u">{{ u }}</option> }
              </select>
            </label>
            <label class="text-sm">HSN / SAC
              <input data-cell="hsn" [(ngModel)]="hsn" (keydown)="onFieldKey($event, 'hsn')" maxlength="8"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
              @if (hsn && ![4,6,8].includes(hsn.trim().length)) { <p class="text-xs text-amber-600">HSN is normally 4, 6 or 8 digits</p> }
            </label>
            <label class="text-sm">Barcode / alias <span class="text-slate-400">(searchable)</span>
              <input data-cell="barcode" [(ngModel)]="barcode" (keydown)="onFieldKey($event, 'barcode')"
                     class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </label>
          </div>

          <!-- Tax + pricing -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
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
              <label class="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                <input type="checkbox" [(ngModel)]="priceIncludesTax" /> incl. tax
              </label>
            </label>
            <label class="text-sm">MRP ₹
              <input data-cell="mrp" type="number" [(ngModel)]="mrp" (keydown)="onFieldKey($event, 'mrp')"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
            </label>
            <label class="text-sm">Sale discount %
              <input data-cell="saleDisc" type="number" [(ngModel)]="saleDisc" (keydown)="onFieldKey($event, 'saleDisc')"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" title="Default D1 on the sales grid" />
            </label>
            <label class="text-sm">Wholesale ₹
              <input type="number" [(ngModel)]="wholesalePrice"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
            </label>
            <label class="text-sm">Wholesale min qty
              <input type="number" [(ngModel)]="wholesaleMinQty"
                     class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
            </label>
            @if (itemType !== 'service') {
              <label class="text-sm">Min stock <span class="text-slate-400">(reorder)</span>
                <input data-cell="minStock" type="number" [(ngModel)]="minStock" (keydown)="onFieldKey($event, 'minStock')"
                       class="mt-1 w-full border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none" />
              </label>
            }
          </div>

          <!-- Stock box (products only — services skip stock) -->
          @if (itemType !== 'service') {
            <div class="mt-4 border rounded p-3 bg-slate-50">
              <div class="flex items-center gap-3 flex-wrap">
                <span class="text-sm font-medium">{{ editId() ? 'Add Stock' : 'Opening Stock' }}</span>
                <input data-cell="stockQty" type="number" [(ngModel)]="stockQty" (keydown)="onFieldKey($event, 'stockQty')"
                       class="w-24 border rounded px-2 py-1.5 text-right focus:bg-amber-50 focus:outline-none"
                       [placeholder]="editId() ? '± qty' : 'qty'" />
                <span class="text-xs text-slate-500">{{ unit || 'pcs' }}</span>
                <label class="text-xs text-slate-500">&#64; rate ₹
                  <input data-cell="oRate" type="number" [(ngModel)]="oRate" (keydown)="onFieldKey($event, 'oRate')"
                         class="w-20 border rounded px-2 py-1 text-right focus:bg-amber-50 focus:outline-none ml-1" />
                </label>
                <label class="text-xs text-slate-500">as of
                  <input type="date" [(ngModel)]="openingDate" class="border rounded px-2 py-1 ml-1" />
                </label>
                @if (editId() && stockQty) {
                  <span class="text-sm text-slate-600">→ new stock <b>{{ curStock() + (+stockQty! || 0) }}</b></span>
                }
                @if (altUnit && factor && stockQty) {
                  <span class="text-xs text-slate-400">= {{ fmt((+stockQty! || 0) / (+factor! || 1)) }} {{ altUnit }}</span>
                }
              </div>
              @if (locations().length) {
                <div class="mt-2 text-xs text-slate-600">
                  <b>Stock by location:</b>
                  @for (l of locations(); track l.location) {
                    <span class="inline-block border rounded px-2 py-0.5 bg-white ml-1">{{ l.location }}: <b>{{ l.quantity }}</b></span>
                  }
                </div>
              }
            </div>

            <!-- Tracking mode + batch registry (§3F.1) -->
            <div class="mt-3 border rounded p-3">
              <div class="flex items-center gap-4 text-sm flex-wrap">
                <span class="font-medium">Tracking:</span>
                <label class="flex items-center gap-1"><input type="radio" name="trk" value="none" [(ngModel)]="trackingMode" /> None</label>
                <label class="flex items-center gap-1"><input type="radio" name="trk" value="batch" [(ngModel)]="trackingMode" /> Batch (MRP-wise lots)</label>
                <label class="flex items-center gap-1"><input type="radio" name="trk" value="serial" [(ngModel)]="trackingMode" /> Serial / IMEI</label>
                <span class="text-xs text-slate-400">one mode per item</span>
              </div>
              @if (trackingMode === 'batch' && editId()) {
                <div class="mt-2">
                  <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Batches — one item, many lots (old &amp; new MRP coexist)</div>
                  <table class="w-full text-xs border border-slate-200" style="border-collapse: collapse">
                    <thead><tr class="bg-slate-50 text-slate-500">
                      <th class="border border-slate-200 px-2 py-0.5 text-left">Batch</th>
                      <th class="border border-slate-200 px-2 py-0.5">Expiry</th>
                      <th class="border border-slate-200 px-2 py-0.5 text-right">MRP</th>
                      <th class="border border-slate-200 px-2 py-0.5 text-right">Sale ₹</th>
                      <th class="border border-slate-200 px-2 py-0.5 text-right">Cost</th>
                      <th class="border border-slate-200 px-2 py-0.5 text-right">Qty</th>
                    </tr></thead>
                    <tbody>
                      @for (b of batches(); track b.id) {
                        <tr [class.opacity-40]="!(+b.qty > 0)">
                          <td class="border border-slate-200 px-2 py-0.5 font-mono">{{ b.batchNo }}</td>
                          <td class="border border-slate-200 px-2 py-0.5 text-center">{{ b.expiryDate || '—' }}</td>
                          <td class="border border-slate-200 px-2 py-0.5 text-right">{{ b.mrp ? fmt(b.mrp) : '—' }}</td>
                          <td class="border border-slate-200 px-2 py-0.5 text-right">{{ b.sellingPrice ? fmt(b.sellingPrice) : '—' }}</td>
                          <td class="border border-slate-200 px-2 py-0.5 text-right">{{ b.purchaseCost ? fmt(b.purchaseCost) : '—' }}</td>
                          <td class="border border-slate-200 px-2 py-0.5 text-right font-semibold">{{ b.qty }}</td>
                        </tr>
                      } @empty {
                        <tr><td colspan="6" class="px-2 py-2 text-center text-slate-400">No batches yet — record a Purchase (F8) and press Alt+B on the line to enter Batch no, MRP &amp; sale price.</td></tr>
                      }
                    </tbody>
                    @if (batches().length) {
                      <tfoot><tr class="bg-slate-50 font-semibold">
                        <td colspan="5" class="border border-slate-200 px-2 py-0.5 text-right">Total (all batches)</td>
                        <td class="border border-slate-200 px-2 py-0.5 text-right">{{ batchTotal() }}</td>
                      </tr></tfoot>
                    }
                  </table>
                </div>
              }
              @if (trackingMode === 'serial') {
                <p class="text-xs text-slate-400 mt-1">Serial numbers are entered per line at billing/purchase time (Alt+B strip).</p>
              }
            </div>
          }

          <!-- Advanced (Low-priority fields stay behind this — spec §2.4) -->
          <button (click)="advanced.set(!advanced())" class="mt-3 text-sm text-blue-700 hover:underline">
            {{ advanced() ? 'Advanced ▴' : 'Advanced ▾' }} (description, classification, limits, cess…)
          </button>
          @if (advanced()) {
            <div class="mt-2 border rounded p-3 bg-slate-50 grid grid-cols-2 md:grid-cols-4 gap-3">
              <label class="text-sm col-span-2">Description <span class="text-slate-400">(prints on invoice)</span>
                <textarea [(ngModel)]="description" rows="2" class="mt-1 w-full border rounded px-2 py-1.5"></textarea>
              </label>
              <label class="text-sm col-span-2">Image URL
                <input [(ngModel)]="thumbnail" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
              </label>
              <label class="text-sm">Brand
                <input [(ngModel)]="cfBrand" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
              </label>
              <label class="text-sm">Colour
                <input [(ngModel)]="cfColour" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
              </label>
              <label class="text-sm">Size
                <input [(ngModel)]="cfSize" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
              </label>
              <label class="text-sm">Material
                <input [(ngModel)]="cfMaterial" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
              </label>
              <label class="text-sm">Min sale price ₹
                <input type="number" [(ngModel)]="minSalePrice" class="mt-1 w-full border rounded px-2 py-1.5 text-right" />
              </label>
              <label class="text-sm">Max sale price ₹
                <input type="number" [(ngModel)]="maxSalePrice" class="mt-1 w-full border rounded px-2 py-1.5 text-right" />
              </label>
              <label class="text-sm">Cess %
                <input type="number" [(ngModel)]="cessPct" class="mt-1 w-full border rounded px-2 py-1.5 text-right" />
              </label>
              <label class="text-sm flex items-end gap-2 pb-1">
                <input type="checkbox" [(ngModel)]="taxExempt" /> Tax exempt / nil-rated
              </label>
              @if (itemType !== 'service') {
                <label class="text-sm">Max stock level
                  <input type="number" [(ngModel)]="maxStock" class="mt-1 w-full border rounded px-2 py-1.5 text-right" />
                </label>
                <label class="text-sm">Rack / shelf / bin
                  <input [(ngModel)]="rackLocation" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
                </label>
              }
              <label class="text-sm col-span-2">Internal notes <span class="text-slate-400">(not printed)</span>
                <input [(ngModel)]="cfNotes" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
              </label>
            </div>
          }

          <div class="flex items-center gap-3 mt-4">
            @if (writable()) {
            <button (click)="save()" [disabled]="saving() || !canSave()"
                    class="px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">
              {{ saving() ? 'Saving…' : (editId() ? 'Save Changes (Ctrl+A)' : 'Save Item (Ctrl+A)') }}
            </button>
            } @else { <span class="text-xs text-amber-600">Read-only — you can view items but not add or edit.</span> }
            @if (editId()) {
              <button (click)="startNew()" class="px-3 py-2 rounded border text-sm">New Item (Ins)</button>
            }
            @if (error()) { <span class="text-red-600 text-xs">{{ error() }}</span> }
          </div>
        </fieldset>
      </div>
    </div>
  `,
})
export class ItemMasterComponent {
  private readonly entry = inject(EntryService);
  readonly perms = inject(PermissionService);
  writable(): boolean { return this.perms.canWrite('products'); }
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly tick = signal(0);
  readonly list = signal<ItemMasterRow[]>([]);
  readonly idx = signal(0);
  readonly editId = signal<string | null>(null);
  readonly curStock = signal(0);
  readonly advanced = signal(false);
  readonly cats = signal<any[]>([]);
  readonly batches = signal<any[]>([]);
  readonly locations = signal<Array<{ location: string; quantity: number }>>([]);

  readonly uqcList = UQC_LIST;
  query = '';
  lowOnly = false;

  // core fields
  name = '';
  itemType: 'product' | 'service' = 'product';
  categoryId = '';
  unit = '';
  altUnit = '';
  factor: number | null = null;
  uqc = '';
  hsn = '';
  barcode = '';
  gst: number | null = null;
  pRate: number | null = null;
  sRate: number | null = null;
  priceIncludesTax = false;
  mrp: number | null = null;
  saleDisc: number | null = null;
  wholesalePrice: number | null = null;
  wholesaleMinQty: number | null = null;
  oRate: number | null = null;
  openingDate = '';
  minStock: number | null = null;
  stockQty: number | null = null;
  trackingMode: 'none' | 'batch' | 'serial' = 'none';
  // advanced
  description = '';
  thumbnail = '';
  cfBrand = '';
  cfColour = '';
  cfSize = '';
  cfMaterial = '';
  cfNotes = '';
  minSalePrice: number | null = null;
  maxSalePrice: number | null = null;
  cessPct: number | null = null;
  taxExempt = false;
  maxStock: number | null = null;
  rackLocation = '';

  readonly saving = signal(false);
  readonly saved = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  private debounce?: ReturnType<typeof setTimeout>;

  constructor() {
    this.reload(true);
    this.entry.categories().subscribe({
      next: (c: any) => this.cats.set(c?.data ?? c ?? []),
      error: () => { /* categories are optional */ },
    });
  }

  visibleItems(): ItemMasterRow[] {
    const items = this.list();
    return this.lowOnly
      ? items.filter((it) => it.itemType !== 'service' && (Number(it.stock) || 0) <= (Number(it.minStock) || 0))
      : items;
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
    const items = this.visibleItems();
    if (e.key === 'ArrowDown') { e.preventDefault(); this.idx.set(Math.min(this.idx() + 1, items.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.idx.set(Math.max(this.idx() - 1, 0)); return; }
    if (e.key === 'Enter' && items.length) { e.preventDefault(); this.pick(items[this.idx()]); return; }
  }

  pick(it: ItemMasterRow): void {
    this.editId.set(it.id);
    this.name = it.name;
    this.itemType = it.itemType === 'service' ? 'service' : 'product';
    this.categoryId = it.categoryId || '';
    this.unit = it.uom || '';
    this.altUnit = it.altUom || '';
    this.factor = it.uomFactor != null ? Number(it.uomFactor) : null;
    this.uqc = it.uqc || '';
    this.hsn = it.hsnCode || '';
    this.barcode = it.barcode || '';
    this.gst = it.gstRate != null ? Number(it.gstRate) : null;
    this.pRate = it.purchasePrice != null ? Number(it.purchasePrice) : null;
    this.sRate = Number(it.basePrice ?? it.salePrice) || null;
    this.priceIncludesTax = !!it.priceIncludesTax;
    this.mrp = it.mrp != null ? Number(it.mrp) : null;
    this.saleDisc = it.saleDiscountPct != null ? Number(it.saleDiscountPct) : null;
    this.wholesalePrice = it.wholesalePrice != null ? Number(it.wholesalePrice) : null;
    this.wholesaleMinQty = it.wholesaleMinQty != null ? Number(it.wholesaleMinQty) : null;
    this.oRate = it.openingRate != null ? Number(it.openingRate) : null;
    this.openingDate = it.openingStockDate ? String(it.openingStockDate).slice(0, 10) : '';
    this.minStock = it.minStock != null ? Number(it.minStock) : null;
    this.trackingMode = it.trackingMode === 'batch' || it.trackingMode === 'serial' ? (it.trackingMode as any) : 'none';
    this.description = it.description || '';
    this.thumbnail = it.thumbnail || '';
    const cf = it.customFields || {};
    this.cfBrand = cf['brand'] || '';
    this.cfColour = cf['colour'] || '';
    this.cfSize = cf['size'] || '';
    this.cfMaterial = cf['material'] || '';
    this.cfNotes = cf['notes'] || '';
    this.minSalePrice = it.minSalePrice != null ? Number(it.minSalePrice) : null;
    this.maxSalePrice = it.maxSalePrice != null ? Number(it.maxSalePrice) : null;
    this.cessPct = it.cessPct != null ? Number(it.cessPct) : null;
    this.taxExempt = !!it.taxExempt;
    this.maxStock = it.maxStock != null ? Number(it.maxStock) : null;
    this.rackLocation = it.rackLocation || '';
    this.curStock.set(Number(it.stock) || 0);
    this.stockQty = null;
    this.saved.set(null);
    this.error.set(null);
    this.batches.set([]);
    this.locations.set([]);
    this.entry.itemBatches(it.id).subscribe((b) => this.batches.set(b || []));
    this.entry.itemLocations(it.id).subscribe((l) => this.locations.set(l || []));
    setTimeout(() => this.focus('name'));
  }

  startNew(): void {
    this.editId.set(null);
    this.name = ''; this.itemType = 'product'; this.categoryId = '';
    this.unit = ''; this.altUnit = ''; this.factor = null; this.uqc = '';
    this.hsn = ''; this.barcode = ''; this.gst = null; this.pRate = null; this.sRate = null;
    this.priceIncludesTax = false; this.mrp = null; this.saleDisc = null;
    this.wholesalePrice = null; this.wholesaleMinQty = null;
    this.oRate = null; this.openingDate = ''; this.minStock = null; this.stockQty = null;
    this.trackingMode = 'none';
    this.description = ''; this.thumbnail = '';
    this.cfBrand = ''; this.cfColour = ''; this.cfSize = ''; this.cfMaterial = ''; this.cfNotes = '';
    this.minSalePrice = null; this.maxSalePrice = null; this.cessPct = null; this.taxExempt = false;
    this.maxStock = null; this.rackLocation = '';
    this.curStock.set(0);
    this.batches.set([]);
    this.locations.set([]);
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
  batchTotal(): number { return money(this.batches().reduce((s, b) => s + (Number(b.qty) || 0), 0)); }
  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }

  save(): void {
    if (!this.writable() || !this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const customFields: Record<string, any> = {};
    if (this.cfBrand.trim()) customFields['brand'] = this.cfBrand.trim();
    if (this.cfColour.trim()) customFields['colour'] = this.cfColour.trim();
    if (this.cfSize.trim()) customFields['size'] = this.cfSize.trim();
    if (this.cfMaterial.trim()) customFields['material'] = this.cfMaterial.trim();
    if (this.cfNotes.trim()) customFields['notes'] = this.cfNotes.trim();

    const body = {
      name: this.name.trim(),
      itemType: this.itemType,
      categoryId: this.categoryId || undefined,
      basePrice: money(Number(this.sRate) || 0),
      priceIncludesTax: this.priceIncludesTax,
      gstRate: this.gst != null ? Number(this.gst) : undefined,
      hsnCode: this.hsn.trim() || undefined,
      barcode: this.barcode.trim() || undefined,
      uom: this.unit.trim() || undefined,
      altUom: this.altUnit.trim() || undefined,
      uomFactor: this.factor != null ? Number(this.factor) : undefined,
      uqc: this.uqc || undefined,
      purchasePrice: this.pRate != null ? Number(this.pRate) : undefined,
      mrp: this.mrp != null ? Number(this.mrp) : undefined,
      saleDiscountPct: this.saleDisc != null ? Number(this.saleDisc) : undefined,
      wholesalePrice: this.wholesalePrice != null ? Number(this.wholesalePrice) : undefined,
      wholesaleMinQty: this.wholesaleMinQty != null ? Number(this.wholesaleMinQty) : undefined,
      openingRate: this.oRate != null ? Number(this.oRate) : undefined,
      openingStockDate: this.openingDate || undefined,
      lowStockThreshold: this.minStock != null ? Number(this.minStock) : undefined,
      trackingMode: this.trackingMode,
      description: this.description.trim() || undefined,
      thumbnail: this.thumbnail.trim() || undefined,
      customFields: Object.keys(customFields).length ? customFields : undefined,
      minSalePrice: this.minSalePrice != null ? Number(this.minSalePrice) : undefined,
      maxSalePrice: this.maxSalePrice != null ? Number(this.maxSalePrice) : undefined,
      cessPct: this.cessPct != null ? Number(this.cessPct) : undefined,
      taxExempt: this.taxExempt,
      maxStock: this.maxStock != null ? Number(this.maxStock) : undefined,
      rackLocation: this.rackLocation.trim() || undefined,
    };
    const id = this.editId();
    if (!id) {
      const opening = this.itemType === 'service' ? 0 : Number(this.stockQty) || 0;
      this.entry.createProduct({ ...body, initialStock: opening }).subscribe({
        next: (p: any) => this.afterSave(`Item "${body.name}" created`, p?.id, opening),
        error: (err) => this.fail(err),
      });
    } else {
      this.entry.updateProduct(id, body).subscribe({
        next: () => {
          const qty = this.itemType === 'service' ? 0 : Number(this.stockQty) || 0;
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
