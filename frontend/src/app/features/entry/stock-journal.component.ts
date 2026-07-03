import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { EntryService, ProductHit } from '../../core/services/entry.service';

interface Row {
  productId?: string;
  name: string;
  delta: number | null; // + inward, − outward
  stock?: number;
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Stock Journal — Tally-style inventory adjustment (inward +, outward −) against a
 * godown/warehouse. Each row applies a delta adjustment; every change is written to the
 * erp_stock_movements audit trail by the backend.
 */
@Component({
  selector: 'wa-stock-journal',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="p-3 md:p-5 max-w-4xl select-none">
      <span class="hidden">{{ tick() }}</span>

      <div class="flex items-center gap-4 mb-3 border-b pb-2 flex-wrap">
        <h1 class="text-lg font-semibold">Stock Journal</h1>
        <div class="flex rounded overflow-hidden border">
          <button (click)="mode.set('adjust')" class="px-3 py-1 text-sm"
                  [class.bg-slate-800]="mode() === 'adjust'" [class.text-white]="mode() === 'adjust'">Adjust</button>
          <button (click)="mode.set('transfer')" class="px-3 py-1 text-sm"
                  [class.bg-slate-800]="mode() === 'transfer'" [class.text-white]="mode() === 'transfer'">Transfer</button>
        </div>
        <span class="text-sm text-slate-500">{{ today | date: 'dd-MM-yyyy' }}</span>
        @if (mode() === 'adjust') {
          <label class="ml-auto text-sm">Godown
            <select [(ngModel)]="warehouseId" class="ml-1 border rounded px-2 py-1.5">
              @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
            </select>
          </label>
        } @else {
          <label class="ml-auto text-sm">From
            <select [(ngModel)]="warehouseId" class="ml-1 border rounded px-2 py-1.5">
              @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
            </select>
          </label>
          <label class="text-sm">To
            <select [(ngModel)]="toWarehouseId" class="ml-1 border rounded px-2 py-1.5">
              @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
            </select>
          </label>
        }
        @if (savedCount()) {
          <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ {{ savedCount() }} {{ mode() === 'adjust' ? 'adjustment(s) applied' : 'transfer(s) done' }}
          </span>
        }
      </div>
      @if (mode() === 'transfer' && warehouseId && warehouseId === toWarehouseId) {
        <p class="text-sm text-amber-600 mb-2">From and To godowns must differ.</p>
      }

      @if (!warehouses().length) {
        <p class="text-sm text-amber-600 mb-3">No godowns yet — create a warehouse under ERP → Warehouses first.</p>
      }

      <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
        <thead>
          <tr class="bg-slate-100 text-slate-600">
            <th class="border border-slate-300 px-1 w-8">#</th>
            <th class="border border-slate-300 px-2 text-left">Item</th>
            <th class="border border-slate-300 px-2 w-24 text-right">Current</th>
            <th class="border border-slate-300 px-2 w-32 text-right">{{ mode() === 'adjust' ? 'Qty (+in / −out)' : 'Transfer qty' }}</th>
            <th class="border border-slate-300 px-2 w-24 text-right">{{ mode() === 'adjust' ? 'New' : '' }}</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows; track $index; let r = $index) {
            <tr>
              <td class="border border-slate-300 text-center text-slate-400">{{ r + 1 }}</td>
              <td class="border border-slate-300 relative p-0">
                <input [attr.data-cell]="r + ':name'" [attr.data-autofocus]="r === 0 ? '' : null"
                       [(ngModel)]="row.name" (ngModelChange)="onProductQuery(r, $event)"
                       (keydown)="onCellKey($event, r, 'name')"
                       class="w-full px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                @if (searchRow() === r && productHits().length) {
                  <div class="absolute top-full left-0 z-50 w-80 bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
                    @for (hit of productHits(); track hit.id; let i = $index) {
                      <div (mousedown)="pickProduct(r, hit)"
                           class="px-2 py-1.5 cursor-pointer flex justify-between gap-2"
                           [class.bg-amber-100]="i === productHitIdx()">
                        <span class="truncate">{{ hit.name }}</span>
                        <span class="text-slate-400">stk {{ hit.stock ?? 0 }}</span>
                      </div>
                    }
                  </div>
                }
              </td>
              <td class="border border-slate-300 px-2 text-right text-slate-500">{{ row.stock ?? '' }}</td>
              <td class="border border-slate-300 p-0">
                <input [attr.data-cell]="r + ':delta'" type="number" [(ngModel)]="row.delta" (keydown)="onCellKey($event, r, 'delta')"
                       class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
              </td>
              <td class="border border-slate-300 px-2 text-right font-medium"
                  [class.text-red-600]="newQty(row) !== null && newQty(row)! < 0">
                {{ newQty(row) ?? '' }}
              </td>
            </tr>
          }
        </tbody>
      </table>

      <div class="flex gap-4 mt-3 items-start">
        <label class="text-sm flex-1">Narration
          <input data-cell="note" [(ngModel)]="note" (keydown)="onNoteKey($event)"
                 class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
        </label>
        <div class="w-64">
          @if (error()) { <p class="text-red-600 text-xs mb-1">{{ error() }}</p> }
          <button (click)="save()" [disabled]="saving() || !canSave()"
                  class="w-full px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50">
            {{ saving() ? 'Saving…' : 'Apply Adjustments (Ctrl+A)' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class StockJournalComponent {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly today = new Date();
  readonly tick = signal(0);
  readonly mode = signal<'adjust' | 'transfer'>('adjust');
  readonly warehouses = signal<Array<{ id: string; name: string }>>([]);
  warehouseId = '';
  toWarehouseId = '';

  rows: Row[] = [this.blankRow(), this.blankRow()];
  readonly productHits = signal<ProductHit[]>([]);
  readonly productHitIdx = signal(0);
  readonly searchRow = signal<number | null>(null);

  note = '';
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedCount = signal(0);

  private debounce?: ReturnType<typeof setTimeout>;

  constructor() {
    this.entry.warehouses().subscribe((res: any) => {
      const list = (res?.data ?? res ?? []) as Array<{ id: string; name: string }>;
      this.warehouses.set(list);
      if (list.length && !this.warehouseId) this.warehouseId = list[0].id;
      if (list.length > 1 && !this.toWarehouseId) this.toWarehouseId = list[1].id;
    });
  }

  private blankRow(): Row {
    return { name: '', delta: null };
  }

  onProductQuery(r: number, q: string): void {
    const row = this.rows[r];
    row.productId = undefined; row.stock = undefined;
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
    row.stock = Number(hit.stock) || 0;
    this.productHits.set([]); this.searchRow.set(null);
    setTimeout(() => this.focusCell(r, 'delta'));
  }

  onCellKey(e: KeyboardEvent, r: number, col: 'name' | 'delta'): void {
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
        if (e.shiftKey) {
          if (col === 'delta') this.focusCell(r, 'name');
          else if (r > 0) this.focusCell(r - 1, 'delta');
          return;
        }
        if (col === 'name') {
          if (!this.rows[r].name) { this.focus('note'); return; }
          this.focusCell(r, 'delta');
          return;
        }
        if (r + 1 >= this.rows.length) this.rows.push(this.blankRow());
        setTimeout(() => this.focusCell(r + 1, 'name'));
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

  private focusCell(r: number, col: string): void {
    const el = this.host.nativeElement.querySelector(`[data-cell="${r}:${col}"]`) as HTMLInputElement | null;
    el?.focus(); el?.select();
  }
  private focus(cell: string): void {
    (this.host.nativeElement.querySelector(`[data-cell="${cell}"]`) as HTMLInputElement | null)?.focus();
  }

  /** Miracle: Ctrl+Enter accepts/saves the voucher from anywhere (alias of Ctrl+A). */

  @HostListener('document:keydown.control.enter', ['$event'])

  onCtrlEnterSave(e: Event): void { this.onSaveKey(e as any); }


  @HostListener('document:keydown.control.a', ['$event'])
  onSaveKey(e: Event): void { e.preventDefault(); this.save(); }

  newQty(row: Row): number | null {
    if (row.stock === undefined || row.delta === null) return null;
    return money(Number(row.stock) + Number(row.delta));
  }
  private liveRows(): Row[] { return this.rows.filter((r) => r.productId && Number(r.delta)); }
  canSave(): boolean {
    if (!this.warehouseId || this.liveRows().length === 0) return false;
    if (this.mode() === 'transfer') {
      return !!this.toWarehouseId && this.toWarehouseId !== this.warehouseId
        && this.liveRows().every((r) => Number(r.delta) > 0);
    }
    return true;
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    let done = 0;
    try {
      for (const r of this.liveRows()) {
        if (this.mode() === 'transfer') {
          await firstValueFrom(this.entry.stockTransfer({
            fromWarehouseId: this.warehouseId,
            toWarehouseId: this.toWarehouseId,
            productId: r.productId!,
            quantity: Math.abs(Number(r.delta)),
            note: this.note || undefined,
          }));
        } else {
          await firstValueFrom(this.entry.stockAdjust({
            warehouseId: this.warehouseId,
            productId: r.productId!,
            quantity: Number(r.delta),
            mode: 'delta',
            note: this.note || undefined,
          }));
        }
        done++;
      }
      this.savedCount.set(done);
      this.rows = [this.blankRow(), this.blankRow()];
      this.note = '';
      this.tick.update((t) => t + 1);
      setTimeout(() => this.focusCell(0, 'name'));
    } catch (err: any) {
      this.error.set(err?.error?.message || `Failed after ${done} adjustment(s)`);
    } finally {
      this.saving.set(false);
    }
  }
}
