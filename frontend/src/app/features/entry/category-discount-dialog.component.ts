import { Component, EventEmitter, Input, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntryService, CategoryGroup, CategoryProduct } from '../../core/services/entry.service';

/**
 * Category Discount dialog (Alt+D on the entry grids). Pick a category, set a
 * discount %, and it fills that discount across every line of that category in the
 * current voucher — and can ADD the category's products that aren't billed yet.
 *
 * Reusable: the dialog only knows the catalog + which products are already on the
 * grid; the host applies the emitted {products, discountPct} to its own rows.
 */
@Component({
  selector: 'wa-category-discount-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open) {
      <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
           (mousedown)="close()" (keydown)="onKey($event)" tabindex="-1" data-lookup-box>
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
             (mousedown)="$event.stopPropagation()">
          <!-- header -->
          <div class="flex items-center gap-2 px-4 py-3 border-b bg-slate-50">
            <span class="text-lg">🏷️</span>
            <div class="flex-1">
              <h3 class="font-semibold text-slate-800 leading-tight">Category Discount</h3>
              <p class="text-[11px] text-slate-400 leading-tight">Pick a category, set a discount — it fills every line of that category</p>
            </div>
            <button (click)="close()" class="text-slate-400 hover:text-slate-700 text-xl leading-none px-1">×</button>
          </div>

          @if (loading()) {
            <div class="p-10 text-center text-slate-400 text-sm"><i class="pi pi-spin pi-spinner"></i> Loading catalog…</div>
          } @else if (!groups().length) {
            <div class="p-10 text-center text-slate-400 text-sm">No categories with products found.</div>
          } @else {
            <div class="flex flex-1 min-h-0">
              <!-- categories -->
              <div class="w-1/2 border-r overflow-y-auto">
                @for (g of groups(); track g.id) {
                  <button (click)="selectCat(g)"
                    class="w-full text-left px-4 py-2 text-sm border-b border-slate-50 flex items-center justify-between hover:bg-amber-50"
                    [class.bg-amber-100]="sel()?.id === g.id" [class.font-semibold]="sel()?.id === g.id">
                    <span class="truncate">{{ g.name }}</span>
                    <span class="text-[11px] text-slate-400 shrink-0 ml-2">
                      {{ g.products.length }} item{{ g.products.length === 1 ? '' : 's' }}
                      @if (inBillCount(g); as n) { · <b class="text-indigo-600">{{ n }} in bill</b> }
                    </span>
                  </button>
                }
              </div>
              <!-- products of selected category -->
              <div class="w-1/2 overflow-y-auto">
                @if (!sel()) {
                  <p class="p-6 text-center text-slate-400 text-sm">← Pick a category</p>
                } @else {
                  <div class="px-3 py-2 border-b bg-slate-50 flex items-center justify-between text-[12px]">
                    <button (click)="toggleAll()" class="text-indigo-600 hover:underline font-semibold">
                      {{ allChecked() ? 'Unselect all' : 'Select all' }}
                    </button>
                    <span class="text-slate-400">{{ checkedIds().size }} selected</span>
                  </div>
                  @for (p of sel()!.products; track p.id) {
                    <label class="flex items-center gap-2 px-3 py-1.5 text-sm border-b border-slate-50 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" [checked]="checkedIds().has(p.id)" (change)="toggle(p.id)" />
                      <span class="flex-1 truncate">{{ p.name }}</span>
                      @if (isInBill(p.id)) { <span class="text-[10px] text-indigo-600 font-semibold shrink-0">in bill</span> }
                      <span class="text-[11px] text-slate-400 tabular-nums shrink-0">₹{{ fmt(p.salePrice) }}</span>
                    </label>
                  }
                }
              </div>
            </div>

            <!-- footer -->
            <div class="flex items-center gap-3 px-4 py-3 border-t bg-slate-50">
              <label class="text-sm font-medium text-slate-600 flex items-center gap-1">
                Discount
                <input #discInput type="number" min="0" max="100" step="0.5" [(ngModel)]="discountPct"
                       class="w-20 border rounded px-2 py-1 text-right" (keydown.enter)="apply()" />
                %
              </label>
              <span class="text-[11px] text-slate-400 flex-1">Applies D1 discount to the selected products (existing lines updated; new ones added).</span>
              <button (click)="close()" class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100">Cancel</button>
              <button (click)="apply()" [disabled]="!canApply()"
                class="text-sm px-4 py-1.5 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40">
                Apply to {{ checkedIds().size }} item{{ checkedIds().size === 1 ? '' : 's' }}
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class CategoryDiscountDialogComponent {
  private readonly entry = inject(EntryService);

  private _open = false;
  @Input() set open(v: boolean) {
    this._open = v;
    if (v) { this.load(); setTimeout(() => (document.querySelector('[data-lookup-box]') as HTMLElement | null)?.focus()); }
  }
  get open(): boolean { return this._open; }

  /** Product ids already on the grid — pre-checked and badged "in bill". */
  @Input() set existingProductIds(ids: string[]) { this._existing.set(new Set(ids || [])); }

  @Output() applied = new EventEmitter<{ products: CategoryProduct[]; discountPct: number }>();
  @Output() closed = new EventEmitter<void>();

  readonly groups = signal<CategoryGroup[]>([]);
  readonly loading = signal(false);
  readonly sel = signal<CategoryGroup | null>(null);
  readonly checkedIds = signal<Set<string>>(new Set());
  private readonly _existing = signal<Set<string>>(new Set());
  discountPct: number | null = null;

  private loaded = false;
  private load(): void {
    if (this.loaded) return;
    this.loading.set(true);
    this.entry.categoryProducts().subscribe({
      next: (g) => { this.groups.set(g || []); this.loading.set(false); this.loaded = true; },
      error: () => { this.groups.set([]); this.loading.set(false); },
    });
  }

  isInBill(id: string): boolean { return this._existing().has(id); }
  inBillCount(g: CategoryGroup): number { return g.products.filter((p) => this._existing().has(p.id)).length; }

  selectCat(g: CategoryGroup): void {
    this.sel.set(g);
    // Default selection = the category's products already on the bill (the common
    // case: "apply this discount to all UPVC lines"). None in bill → pre-check all.
    const inBill = g.products.filter((p) => this._existing().has(p.id)).map((p) => p.id);
    this.checkedIds.set(new Set(inBill.length ? inBill : g.products.map((p) => p.id)));
  }

  toggle(id: string): void {
    const s = new Set(this.checkedIds());
    s.has(id) ? s.delete(id) : s.add(id);
    this.checkedIds.set(s);
  }
  readonly allChecked = computed(() => {
    const g = this.sel();
    return !!g && g.products.length > 0 && g.products.every((p) => this.checkedIds().has(p.id));
  });
  toggleAll(): void {
    const g = this.sel();
    if (!g) return;
    this.checkedIds.set(this.allChecked() ? new Set() : new Set(g.products.map((p) => p.id)));
  }

  canApply(): boolean { return !!this.sel() && this.checkedIds().size > 0 && Number(this.discountPct) >= 0 && this.discountPct != null; }

  apply(): void {
    if (!this.canApply()) return;
    const g = this.sel()!;
    const products = g.products.filter((p) => this.checkedIds().has(p.id));
    this.applied.emit({ products, discountPct: Number(this.discountPct) });
    this.close();
  }

  close(): void {
    this._open = false;
    this.sel.set(null);
    this.checkedIds.set(new Set());
    this.discountPct = null;
    this.closed.emit();
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
  }

  fmt(n: unknown): string { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
}
