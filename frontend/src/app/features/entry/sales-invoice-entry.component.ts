import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  EntryService,
  CustomerHit,
  CustomerContext,
  ProductHit,
  InvoiceAddress,
  SavedAddress,
} from '../../core/services/entry.service';
import { EntryLookupComponent } from './entry-lookup.component';
import { QuickCreateComponent, QuickCreated, QuickKind } from './quick-create.component';

/** One grid row — full Miracle line: qty + FREE qty, cascading Disc-1/Disc-2, GST. */
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
  lastToCustomer?: { price: number; at: string } | null;
  lastOverall?: { price: number; at: string } | null;
  levelPrice?: { price: number; levelName: string } | null;
  /** Optional per-line trade details (Alt+B): batch/expiry/godown ride along in JSONB. */
  batchNo?: string;
  expiry?: string;
  godown?: string;
  showBatch?: boolean;
  /** Live lots for batch-tracked items (§3F.1) — FIFO-ordered, first = suggested. */
  batchOptions?: Array<{ batchNo: string; expiryDate?: string; mrp?: number; sellingPrice?: number; qty: number }>;
}

interface Charge {
  label: string;
  amount: number | null;
  gstRate: number | null;
}

const COLS = ['name', 'qty', 'free', 'rate', 'd1', 'd2', 'gstRate'] as const;
type Col = (typeof COLS)[number];

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Sales Invoice (F2) — full Miracle field set:
 * Cash/Debit memo, voucher date, due days, broker+commission, transport (LR/vehicle),
 * line grid with Free qty + cascading Disc-1/Disc-2 + GST, bill-level discount (% or ₹),
 * Add/Less charges (freight/packing/other, each with GST), auto round-off, and
 * "Received now" instant settlement. Cash memo posts Dr Cash and is settled on save.
 */
@Component({
  selector: 'wa-sales-invoice-entry',
  standalone: true,
  imports: [FormsModule, QuickCreateComponent, EntryLookupComponent],
  template: `
    <div class="p-3 md:p-5 max-w-7xl select-none">
      <span class="hidden">{{ tick() }}</span>

      <!-- Title row -->
      <div class="flex items-center gap-3 mb-2 border-b pb-2 flex-wrap">
        <h1 class="text-lg font-semibold">Sales Invoice <span class="text-slate-400 text-sm">(F2)</span></h1>
        <select [(ngModel)]="memoType" class="text-sm border rounded px-2 py-1 font-medium"
                [class.bg-emerald-50]="memoType === 'cash'">
          <option value="credit">Debit Memo (credit)</option>
          <option value="cash">Cash Memo</option>
        </select>
        <input type="date" [(ngModel)]="voucherDate" class="text-sm border rounded px-2 py-1 focus:bg-amber-50 focus:outline-none" title="Voucher date" />
        <label class="text-sm text-slate-600">Series
          <input [(ngModel)]="series" placeholder="—" maxlength="6"
                 class="ml-1 w-14 border rounded px-2 py-1 uppercase focus:bg-amber-50 focus:outline-none" title="Voucher series (e.g. A, B, RET)" autocomplete="off" />
        </label>
        <label class="text-sm text-slate-600">No.
          <input [(ngModel)]="manualNo" placeholder="auto"
                 class="ml-1 w-24 border rounded px-2 py-1 focus:bg-amber-50 focus:outline-none" title="Manual voucher number — leave blank for automatic" autocomplete="off" />
        </label>
        <label class="text-sm text-slate-600">Due days
          <input type="number" [(ngModel)]="dueDays" [disabled]="memoType === 'cash'"
                 class="ml-1 w-16 border rounded px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
        </label>
        <button (click)="more.set(!more())" class="text-sm text-blue-700 hover:underline">
          {{ more() ? 'Less ▴' : 'More ▾' }} (broker/transport)
        </button>
        <label class="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" [(ngModel)]="isInterstate" /> Interstate (IGST)
        </label>
      </div>

      <!-- POST-SAVE TRAY — a clearly separate card: these actions belong to the invoice
           that was JUST SAVED, not to the fresh entry form below it. -->
      @if (savedNumber() && savedId()) {
        <div class="mb-3 border-2 border-emerald-400 bg-emerald-50 rounded-lg px-3 py-2 shadow-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-bold text-emerald-800">✓ {{ savedNumber() }}</span>
            <span class="text-xs text-emerald-700 mr-2">saved &amp; posted — actions for this invoice:</span>
            <button (click)="printSaved()" class="text-sm px-3 py-1 rounded bg-slate-800 text-white hover:bg-slate-700">🖨 Print</button>
            <button (click)="genIrn()" [disabled]="irnBusy()"
                    class="text-sm px-3 py-1 rounded bg-indigo-700 text-white hover:bg-indigo-600 disabled:opacity-50">
              {{ irnBusy() ? '…' : '⚡ e-Invoice (IRN)' }}
            </button>
            <button (click)="ewayOpen.set(!ewayOpen())"
                    class="text-sm px-3 py-1 rounded text-white"
                    [class.bg-amber-700]="!ewayOpen()" [class.bg-amber-900]="ewayOpen()">
              🚚 e-Way Bill {{ ewayOpen() ? '▴' : '▾' }}
            </button>
            @if (irnPayloadReady()) {
              <button (click)="downloadIrnPayload()" class="text-xs px-2 py-1 rounded border bg-white">⇣ payload JSON</button>
            }
            @if (irnMsg()) {
              <span class="text-xs max-w-md" [class.text-emerald-700]="irnOk()"
                    [class.text-amber-700]="!irnOk() && irnPayloadReady()"
                    [class.text-red-600]="!irnOk() && !irnPayloadReady()">{{ irnMsg() }}</span>
            }
            <button (click)="dismissSaved()" title="Dismiss — continue with the next bill"
                    class="ml-auto text-emerald-800 hover:text-emerald-950 text-sm px-2">✕</button>
          </div>

          @if (ewayOpen()) {
            <div class="flex flex-wrap items-end gap-3 text-sm border-t border-emerald-200 mt-2 pt-2">
              <label class="text-xs text-slate-600">Mode
                <select [(ngModel)]="ewayMode" class="block border rounded px-2 py-1 mt-0.5">
                  <option value="road">Road</option><option value="rail">Rail</option>
                  <option value="air">Air</option><option value="ship">Ship</option>
                </select>
              </label>
              <label class="text-xs text-slate-600">Vehicle no.
                <input [(ngModel)]="ewayVehicle" placeholder="GJ01AB1234" class="block border rounded px-2 py-1 mt-0.5 w-28 uppercase" autocomplete="off" />
              </label>
              <label class="text-xs text-slate-600">Transporter
                <input [(ngModel)]="ewayTransporter" class="block border rounded px-2 py-1 mt-0.5 w-32" autocomplete="off" />
              </label>
              <label class="text-xs text-slate-600">From (dispatch)
                <input [(ngModel)]="ewayFrom" placeholder="seller city" class="block border rounded px-2 py-1 mt-0.5 w-28" autocomplete="off" />
              </label>
              <label class="text-xs text-slate-600">To (delivery)
                <input [(ngModel)]="ewayTo" placeholder="consignee city" class="block border rounded px-2 py-1 mt-0.5 w-28" autocomplete="off" />
              </label>
              <label class="text-xs text-slate-600">Distance km
                <input type="number" [(ngModel)]="ewayDistance" class="block border rounded px-2 py-1 mt-0.5 w-20 text-right" />
              </label>
              <button (click)="genEway()" [disabled]="ewayBusy()"
                      class="px-3 py-1.5 rounded bg-amber-700 text-white disabled:opacity-50">{{ ewayBusy() ? '…' : 'Generate EWB' }}</button>
              @if (ewayNo()) {
                <span class="text-emerald-700 font-semibold">EWB {{ ewayNo() }}</span>
                <button (click)="ewayPdf()" class="px-2 py-1 rounded border text-xs bg-white">PDF</button>
              }
              @if (ewayErr()) { <span class="text-red-600 text-xs">{{ ewayErr() }}</span> }
            </div>
          }
        </div>
      }

      <!-- More: broker / transport -->
      @if (more()) {
        <div class="flex flex-wrap gap-3 mb-2 text-sm bg-slate-50 border rounded px-3 py-2">
          <label>Broker <input [(ngModel)]="broker" class="ml-1 border rounded px-2 py-1 w-36" autocomplete="off" /></label>
          <label>Comm % <input type="number" [(ngModel)]="commissionPct" class="ml-1 border rounded px-2 py-1 w-16 text-right" /></label>
          <label>Transport <input [(ngModel)]="transportName" class="ml-1 border rounded px-2 py-1 w-36" autocomplete="off" /></label>
          <label>LR No. <input [(ngModel)]="lrNo" class="ml-1 border rounded px-2 py-1 w-28" autocomplete="off" /></label>
          <label>Vehicle <input [(ngModel)]="vehicleNo" class="ml-1 border rounded px-2 py-1 w-28" autocomplete="off" /></label>
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div class="lg:col-span-3">
          <!-- Party -->
          <div class="flex items-center gap-2 mb-2 relative">
            <label class="text-sm font-medium w-20">Party A/c</label>
            <div class="relative flex-1 max-w-md">
              <input #partyInput data-cell="party" [(ngModel)]="customerQuery" (ngModelChange)="onCustomerQuery($event)"
                     (keydown)="onPartyKey($event)"
                     class="w-full border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none focus:border-amber-400"
                     [placeholder]="memoType === 'cash' ? 'Cash sale — party optional' : 'Type name / phone / GSTIN…'" autocomplete="off" />
              @if (customerQuery.length >= 2 && !customerHits().length && !customer()) {
                <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg">
                  <div (mousedown)="openQuickCreate('customer', customerQuery)"
                       class="px-2 py-1.5 text-sm cursor-pointer bg-amber-50 hover:bg-amber-100">
                    ➕ Create customer “{{ customerQuery }}” <span class="text-slate-400">(Enter)</span>
                  </div>
                </div>
              }
              @if (customerHits().length) {
                <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
                  @for (hit of customerHits(); track hit.id; let i = $index) {
                    <div (mousedown)="pickCustomer(hit)"
                         class="px-2 py-1.5 text-sm cursor-pointer flex justify-between"
                         [class.bg-amber-100]="i === customerHitIdx()">
                      <span>{{ hit.name }}</span><span class="text-slate-400">{{ hit.gstin || hit.phone }}</span>
                    </div>
                  }
                </div>
              }
            </div>
            @if (customer()) {
              <span class="text-sm" [class.text-red-600]="customer()!.outstanding > 0" [class.text-emerald-600]="customer()!.outstanding <= 0">
                Outstanding: ₹{{ fmt(customer()!.outstanding) }} ({{ customer()!.openInvoices }} open)
              </span>
              @if (customer()!.priceLevelName) {
                <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {{ customer()!.priceLevelName }} rates
                </span>
              }
            }
          </div>

          <!-- Bill To / Ship To — always visible; picking a party fills BOTH; Enter walks every field -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2 text-sm bg-slate-50 border rounded px-3 py-2">
            <div>
              <div class="font-medium text-slate-600 mb-1">Bill To</div>
              <input data-cell="bt-name" [(ngModel)]="billTo.name" (keydown)="onAddrKey($event, 'bt-name')" placeholder="Name"
                     class="w-full border rounded px-2 py-1 mb-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
              <input data-cell="bt-addr" [(ngModel)]="billTo.address" (keydown)="onAddrKey($event, 'bt-addr')" placeholder="Address"
                     class="w-full border rounded px-2 py-1 mb-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
              <div class="flex gap-2">
                <input data-cell="bt-city" [(ngModel)]="billTo.city" (keydown)="onAddrKey($event, 'bt-city')" placeholder="City"
                       class="flex-1 border rounded px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                <input data-cell="bt-state" [(ngModel)]="billTo.stateCode" (ngModelChange)="autoInterstate()" (keydown)="onAddrKey($event, 'bt-state')"
                       placeholder="State code" class="w-24 border rounded px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                <input data-cell="bt-pin" [(ngModel)]="billTo.pincode" (keydown)="onAddrKey($event, 'bt-pin')" placeholder="PIN"
                       class="w-24 border rounded px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
              </div>
              <input data-cell="bt-gstin" [(ngModel)]="billTo.gstin" (keydown)="onAddrKey($event, 'bt-gstin')" placeholder="GSTIN (optional)"
                     class="w-full border rounded px-2 py-1 mt-1 font-mono uppercase focus:bg-amber-50 focus:outline-none" autocomplete="off" />
            </div>
            <div>
              <div class="font-medium text-slate-600 mb-1 flex items-center gap-3">
                Ship To
                <span class="text-xs font-normal text-slate-400">prefilled from party — edit if dispatch differs</span>
                @if (savedAddresses().length) {
                  <select (change)="applySavedAddress($any($event.target).value)" class="border rounded px-1 py-0.5 text-xs ml-auto">
                    <option value="">— saved address —</option>
                    @for (a of savedAddresses(); track a.id) {
                      <option [value]="a.id">{{ a.label || 'addr' }} · {{ a.city || a.fullAddress.slice(0, 24) }}</option>
                    }
                  </select>
                }
              </div>
              <input data-cell="st-name" [(ngModel)]="shipTo.name" (keydown)="onAddrKey($event, 'st-name')" placeholder="Consignee name"
                     class="w-full border rounded px-2 py-1 mb-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
              <input data-cell="st-addr" [(ngModel)]="shipTo.address" (keydown)="onAddrKey($event, 'st-addr')" placeholder="Delivery address"
                     class="w-full border rounded px-2 py-1 mb-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
              <div class="flex gap-2">
                <input data-cell="st-city" [(ngModel)]="shipTo.city" (keydown)="onAddrKey($event, 'st-city')" placeholder="City"
                       class="flex-1 border rounded px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                <input data-cell="st-state" [(ngModel)]="shipTo.stateCode" (ngModelChange)="autoInterstate()" (keydown)="onAddrKey($event, 'st-state')"
                       placeholder="State code" class="w-24 border rounded px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                <input data-cell="st-pin" [(ngModel)]="shipTo.pincode" (keydown)="onAddrKey($event, 'st-pin')" placeholder="PIN"
                       class="w-24 border rounded px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
              </div>
              <input data-cell="st-gstin" [(ngModel)]="shipTo.gstin" (keydown)="onAddrKey($event, 'st-gstin')" placeholder="Consignee GSTIN (optional)"
                     class="w-full border rounded px-2 py-1 mt-1 font-mono uppercase focus:bg-amber-50 focus:outline-none" autocomplete="off" />
              <p class="text-xs text-slate-400 mt-1">Enter next field · <b>PgDn</b> jump to items · Ship-To state drives Place of Supply</p>
            </div>
          </div>

          @if (creditExceeded()) {
            <div class="mb-2 px-3 py-2 rounded border border-red-300 bg-red-50 text-red-700 text-sm">
              ⚠ <b>Credit limit exceeded:</b> limit ₹{{ fmt(customer()!.creditLimit) }} — outstanding
              ₹{{ fmt(customer()!.outstanding) }} + this bill ₹{{ fmt(grandTotal()) }}.
            </div>
          } @else if (overdueAmount() > 0) {
            <div class="mb-2 px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-700 text-sm">
              ⚠ ₹{{ fmt(overdueAmount()) }} is overdue beyond {{ customer()!.creditDays }} credit days.
            </div>
          }

          <!-- Item grid: Qty + Free + D1% + D2% (Miracle cascading discounts) -->
          <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-600">
                <th class="border border-slate-300 px-1 w-7">#</th>
                <th class="border border-slate-300 px-2 text-left">Item</th>
                <th class="border border-slate-300 px-2 w-16">HSN</th>
                <th class="border border-slate-300 px-2 w-14 text-right">Stock</th>
                <th class="border border-slate-300 px-2 w-16 text-right">Qty</th>
                <th class="border border-slate-300 px-2 w-14 text-right">Free</th>
                <th class="border border-slate-300 px-2 w-20 text-right">Rate</th>
                <th class="border border-slate-300 px-2 w-14 text-right">D1%</th>
                <th class="border border-slate-300 px-2 w-14 text-right">D2%</th>
                <th class="border border-slate-300 px-2 w-14 text-right">GST%</th>
                <th class="border border-slate-300 px-2 w-24 text-right">Amount</th>
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
                            <span class="text-slate-400 whitespace-nowrap">₹{{ fmt(hit.salePrice ?? hit.basePrice) }} · stk {{ hit.stock ?? 0 }}</span>
                          </div>
                        }
                      </div>
                    }
                  </td>
                  <td class="border border-slate-300 px-2 text-slate-500">{{ row.hsn }}</td>
                  <td class="border border-slate-300 px-2 text-right"
                      [class.text-red-600]="row.stock !== undefined && totalQtyOf(row) > row.stock">
                    {{ row.stock ?? '' }}
                  </td>
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
                      <span class="text-xs text-slate-500 mr-2">Batch / Godown:</span>
                      @if (row.batchOptions?.length) {
                        <select [ngModel]="row.batchNo" (ngModelChange)="applyBatch(row, $event)"
                                class="border rounded px-1 py-0.5 text-xs mr-2 bg-amber-50"
                                title="FIFO — oldest lot first; picking a batch bills at ITS price, capped at its MRP">
                          @for (b of row.batchOptions; track b.batchNo) {
                            <option [value]="b.batchNo">{{ b.batchNo }} · qty {{ b.qty }}{{ b.mrp ? ' · MRP ' + b.mrp : '' }}{{ b.sellingPrice ? ' · ₹' + b.sellingPrice : '' }}</option>
                          }
                        </select>
                      } @else {
                        <input [(ngModel)]="row.batchNo" placeholder="Batch no" class="border rounded px-2 py-0.5 text-xs w-28 mr-2 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                      }
                      <input type="date" [(ngModel)]="row.expiry" class="border rounded px-2 py-0.5 text-xs mr-2 focus:bg-amber-50 focus:outline-none" title="Expiry" />
                      <input [(ngModel)]="row.godown" placeholder="Godown" class="border rounded px-2 py-0.5 text-xs w-28 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                      <span class="text-xs text-slate-400 ml-2">(Alt+B toggles)</span>
                    </td></tr>
                }
                @if (row.productId && (row.levelPrice || row.lastToCustomer || row.lastOverall || row.stock !== undefined)) {
                  <tr>
                    <td></td>
                    <td colspan="10" class="px-2 pb-1 pt-0 text-xs text-slate-500 border-x border-slate-300">
                      Stock: <b>{{ row.stock ?? 0 }} {{ row.uom }}</b>
                      @if (row.free) { · Free: <b class="text-emerald-700">{{ row.free }} {{ row.uom }}</b> }
                      @if (row.levelPrice) { · List ({{ row.levelPrice.levelName }}): <b class="text-emerald-700">₹{{ fmt(row.levelPrice.price) }}</b> }
                      @if (row.lastToCustomer) {
                        · Last to {{ customer()?.name || 'party' }}: <b class="text-indigo-600">₹{{ fmt(row.lastToCustomer.price) }}</b>
                      } @else if (customer()) { · First sale to {{ customer()!.name }} }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>

          <!-- Footer: bill discount, charges, totals -->
          <div class="flex gap-4 mt-3 items-start flex-wrap">
            <div class="flex-1 min-w-72">
              <div class="text-sm bg-slate-50 border rounded px-3 py-2 mb-2">
                <div class="flex items-center gap-3 mb-1">
                  <span class="font-medium text-slate-600" title="Cash Discount — bill-level, on top of line D1/D2">CD (Cash Disc):</span>
                  <label>% <input type="number" [(ngModel)]="billDiscPct" class="w-16 border rounded px-1.5 py-0.5 text-right" /></label>
                  <label>₹ <input type="number" [(ngModel)]="billDiscAmt" class="w-24 border rounded px-1.5 py-0.5 text-right" /></label>
                  <span class="text-slate-400">= ₹{{ fmt(billDiscount()) }}</span>
                </div>
                <div class="font-medium text-slate-600 mb-1 mt-2">Add / Less charges:</div>
                @for (c of chargeRows; track $index; let ci = $index) {
                  <div class="flex items-center gap-2 mb-1">
                    <input [(ngModel)]="c.label" class="w-28 border rounded px-1.5 py-0.5" autocomplete="off" />
                    <label>₹ <input type="number" [(ngModel)]="c.amount" class="w-24 border rounded px-1.5 py-0.5 text-right" /></label>
                    <label>GST% <input type="number" [(ngModel)]="c.gstRate" class="w-14 border rounded px-1.5 py-0.5 text-right" /></label>
                  </div>
                }
              </div>
              <label class="text-sm block relative">Narration
                <span class="text-xs text-slate-400">(Shift+F1 recall · Ctrl+R repeat)</span>
                <input data-cell="note" [(ngModel)]="note" (keydown)="onNoteKey($event)"
                       class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                @if (narrList(); as nl) {
                  <div class="absolute bottom-full left-0 z-50 w-full bg-white border rounded-t shadow-lg max-h-48 overflow-auto">
                    @for (n of nl; track $index; let i = $index) {
                      <div (mousedown)="pickNarration(i)" class="px-2 py-1.5 text-sm cursor-pointer truncate"
                           [class.bg-amber-100]="i === narrIdx()">{{ n }}</div>
                    }
                  </div>
                }
              </label>
            </div>

            <div class="text-sm w-72 space-y-1">
              <div class="flex justify-between"><span class="text-slate-500">Gross</span><span>{{ fmt(gross()) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Line disc (D1+D2)</span><span>− {{ fmt(lineDiscTotal()) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">CD (cash disc)</span><span>− {{ fmt(billDiscount()) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Charges</span><span>+ {{ fmt(chargesAmt()) }}</span></div>
              @if (isInterstate) {
                <div class="flex justify-between"><span class="text-slate-500">IGST</span><span>{{ fmt(totalTax()) }}</span></div>
              } @else {
                <div class="flex justify-between"><span class="text-slate-500">CGST</span><span>{{ fmt(totalTax() / 2) }}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">SGST</span><span>{{ fmt(totalTax() / 2) }}</span></div>
              }
              <div class="flex justify-between items-center"><span class="text-slate-500">TCS %</span>
                <input type="number" [(ngModel)]="tcsPct" class="w-16 border rounded px-2 py-0.5 text-right focus:bg-amber-50 focus:outline-none" title="TCS collected on invoice value (206C)" />
              </div>
              @if (tcsAmt() > 0) {
                <div class="flex justify-between"><span class="text-slate-500">TCS</span><span>+ {{ fmt(tcsAmt()) }}</span></div>
              }
              <div class="flex justify-between"><span class="text-slate-500">Round off</span><span>{{ roundOff() >= 0 ? '+' : '' }}{{ fmt(roundOff()) }}</span></div>
              <div class="flex justify-between font-semibold text-base border-t pt-1"><span>Total</span><span>₹{{ fmt(grandTotal()) }}</span></div>
              <div class="flex justify-between items-center pt-1">
                <span class="text-slate-500">Received now ₹</span>
                <input data-cell="received" type="number" [(ngModel)]="receivedNow" [disabled]="memoType === 'cash'"
                       class="w-28 border rounded px-2 py-0.5 text-right focus:bg-amber-50 focus:outline-none" />
              </div>
              @if (memoType === 'cash') { <p class="text-xs text-emerald-700">Cash memo — settled in full on save (Dr Cash).</p> }
              @if (error()) { <p class="text-red-600 text-xs">{{ error() }}</p> }
              <button (click)="save()" [disabled]="saving() || !canSave()"
                      class="w-full mt-1 px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50">
                {{ saving() ? 'Saving…' : 'Save Invoice (Ctrl+A)' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Party context panel -->
        <div class="border rounded-lg p-3 h-fit text-sm bg-slate-50">
          @if (customer(); as c) {
            <h3 class="font-semibold mb-1">{{ c.name }}</h3>
            <p class="text-slate-500 mb-2">{{ c.phone }} · {{ c.totalOrders }} orders · ₹{{ fmt(c.totalSpent) }} lifetime</p>
            <div class="mb-3 p-2 rounded border" [class.border-red-300]="c.outstanding > 0" [class.bg-red-50]="c.outstanding > 0">
              Outstanding <b>₹{{ fmt(c.outstanding) }}</b> · {{ c.openInvoices }} open bill(s)
            </div>
            <h4 class="font-medium text-slate-600 mb-1">Recent bills</h4>
            @for (inv of c.recentInvoices; track inv.invoiceNumber) {
              <div class="flex justify-between text-xs py-0.5">
                <span class="font-mono">{{ inv.invoiceNumber }}</span>
                <span [class.text-red-600]="inv.paymentStatus !== 'paid'">₹{{ fmt(inv.total) }} {{ inv.paymentStatus }}</span>
              </div>
            } @empty { <p class="text-xs text-slate-400">No bills yet.</p> }
            <h4 class="font-medium text-slate-600 mt-3 mb-1">Usually buys</h4>
            @for (item of c.topItems; track item.productId) {
              <div class="flex justify-between text-xs py-0.5">
                <span class="truncate">{{ item.productName }}</span>
                <span class="text-slate-500 whitespace-nowrap">₹{{ fmt(item.lastPrice) }}</span>
              </div>
            } @empty { <p class="text-xs text-slate-400">—</p> }
          } @else {
            <p class="text-slate-400">Select a party — or switch to <b>Cash Memo</b> for a walk-in sale.</p>
          }
          <div class="mt-4 pt-3 border-t text-xs text-slate-400 leading-5">
            <b class="text-slate-500">Keys:</b> Enter next · <b>PgDn items</b> · Ins +row · Ctrl+Del −row · Esc close · <b>Ctrl+Enter save</b>
          </div>
        </div>
      </div>

      <wa-entry-lookup [kind]="'customer'" [party]="customer()" [rows]="rows" (applyRate)="onApplyRate($event)" />

      @if (qc(); as q) {
        <wa-quick-create [kind]="q.kind" [prefillName]="q.name"
                         (created)="onQuickCreated($event)" (cancel)="qc.set(null)" />
      }
    </div>
  `,
})
export class SalesInvoiceEntryComponent {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Manual voucher number (Miracle manual series) — blank = automatic sequence. */
  manualNo = '';
  /** Seller's state code (from invoice settings / GSTIN) — drives auto CGST/SGST vs IGST. */
  private sellerStateCode = '';

  constructor() {
    this.entry.sellerProfile().subscribe({
      next: (p: any) => {
        this.sellerStateCode = String(p?.invoiceStateCode || p?.invoice_state_code || '').trim()
          || String(p?.invoiceGstin || p?.invoice_gstin || '').slice(0, 2);
        // Dispatch-from city prefills the e-Way "From" field.
        this.ewayFrom = String(p?.city || p?.invoiceCity || p?.invoice_city || '').trim();
      },
      error: () => { /* no seller profile yet — manual IGST toggle still works */ },
    });
    // Quote → Invoice conversion (Miracle "carry forward"): /entry/sales?fromQuote=<id>
    const quoteId = this.route.snapshot.queryParamMap.get('fromQuote');
    if (quoteId) this.loadFromQuote(quoteId);
  }

  /** CGST/SGST vs IGST from Place of Supply vs the seller's state — user can override. */
  autoInterstate(): void {
    const pos = (this.shipTo.stateCode || this.billTo.stateCode) || '';
    if (!this.sellerStateCode || !pos.trim()) return;
    this.isInterstate = pos.trim().padStart(2, '0') !== this.sellerStateCode.padStart(2, '0');
  }

  // ─── Bill/Ship keyboard chain (Enter walks every field, PgDn jumps to items) ─
  private static readonly ADDR_FIELDS = [
    'bt-name', 'bt-addr', 'bt-city', 'bt-state', 'bt-pin', 'bt-gstin',
    'st-name', 'st-addr', 'st-city', 'st-state', 'st-pin', 'st-gstin',
  ] as const;

  onAddrKey(e: KeyboardEvent, field: string): void {
    const fields = SalesInvoiceEntryComponent.ADDR_FIELDS as readonly string[];
    const i = fields.indexOf(field);
    if (e.key === 'PageDown') { e.preventDefault(); this.focusCell(0, 'name'); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (i > 0) this.focusField(fields[i - 1]);
        else this.focusParty();
        return;
      }
      if (i < fields.length - 1) this.focusField(fields[i + 1]);
      else this.focusCell(0, 'name'); // last address field → item grid
    }
  }

  private focusField(cell: string): void {
    const el = this.host.nativeElement.querySelector(`[data-cell="${cell}"]`) as HTMLInputElement | null;
    el?.focus(); el?.select();
  }

  private loadFromQuote(id: string): void {
    this.entry.quoteById(id).subscribe((q: any) => {
      if (!q) return;
      if (q.customerId) this.pickCustomer({ id: q.customerId, name: q.customerName || '', phone: q.customerPhone || '' });
      this.rows = (q.items || []).map((it: any) => ({
        productId: it.productId || undefined,
        name: it.productName || it.description || '',
        hsn: '', uom: 'pcs',
        qty: Number(it.quantity) || null, free: null,
        rate: Number(it.unitPrice) || null,
        d1: Number(it.discount) || null, d2: null, gstRate: null,
      }));
      this.rows.push(this.blankRow());
      this.note = `Ref: ${q.quoteNumber || 'quotation'}`;
      // Enrich converted lines with the item master (HSN/UOM/GST/stock).
      this.rows.forEach((row, r) => {
        if (!row.productId) return;
        this.entry.itemContext(row.productId, q.customerId || undefined).subscribe((ctx: any) => {
          row.gstRate = row.gstRate ?? (Number(ctx.gstRate) || 0);
          row.hsn = ctx.hsnCode || '';
          row.uom = ctx.uom || 'pcs';
          row.stock = Number(ctx.stock) || 0;
          row.lastToCustomer = ctx.lastToCustomer || null;
          this.tick.update((t) => t + 1);
        });
      });
      this.tick.update((t) => t + 1);
    });
  }

  // ─── Post-save e-Way Bill ───────────────────────────────────────────────────
  readonly ewayOpen = signal(false);
  readonly ewayBusy = signal(false);
  readonly ewayNo = signal<string | null>(null);
  readonly ewayErr = signal<string | null>(null);
  private ewayId: string | null = null;
  ewayMode: 'road' | 'rail' | 'air' | 'ship' = 'road';
  ewayVehicle = '';
  ewayTransporter = '';
  ewayFrom = '';
  ewayTo = '';
  ewayDistance: number | null = null;

  /** Dismiss the post-save tray and get back to billing. */
  dismissSaved(): void {
    this.savedNumber.set(null);
    this.savedId.set(null);
    this.ewayOpen.set(false);
    this.irnMsg.set(null);
    setTimeout(() => this.focusParty());
  }

  genEway(): void {
    const id = this.savedId();
    if (!id || this.ewayBusy()) return;
    this.ewayBusy.set(true);
    this.ewayErr.set(null);
    this.entry.createEway({
      invoiceId: id,
      transportMode: this.ewayMode,
      vehicleNumber: this.ewayVehicle.trim().toUpperCase() || undefined,
      transporter: this.ewayTransporter.trim() || undefined,
      fromPlace: this.ewayFrom.trim() || undefined,
      toPlace: this.ewayTo.trim() || undefined,
      distanceKm: this.ewayDistance !== null ? Number(this.ewayDistance) : undefined,
    } as any).subscribe({
      next: (r: any) => {
        const doc = r?.data ?? r;
        this.ewayBusy.set(false);
        this.ewayNo.set(doc?.ewayNumber || doc?.eway_number || null);
        this.ewayId = doc?.id || null;
      },
      error: (err) => {
        this.ewayBusy.set(false);
        this.ewayErr.set(err?.error?.message || 'e-Way generation failed');
      },
    });
  }

  ewayPdf(): void {
    if (this.ewayId && this.ewayNo()) this.entry.downloadEwayPdf(this.ewayId, this.ewayNo()!);
  }

  // ─── Post-save e-Invoice (IRN) ──────────────────────────────────────────────
  readonly irnBusy = signal(false);
  readonly irnMsg = signal<string | null>(null);
  readonly irnOk = signal(false);

  readonly irnPayloadReady = signal(false);

  genIrn(): void {
    const id = this.savedId();
    if (!id || this.irnBusy()) return;
    this.irnBusy.set(true);
    this.irnMsg.set(null);
    this.irnPayloadReady.set(false);
    this.entry.generateIrn(id).subscribe({
      next: (r: any) => {
        this.irnBusy.set(false);
        const doc = r?.data ?? r;
        const irn = doc?.irn || doc?.Irn;
        if (irn) {
          this.irnOk.set(true);
          this.irnMsg.set(`IRN: ${String(irn).slice(0, 22)}…`);
          return;
        }
        if (doc?.status === 'unconfigured') {
          // No GSP creds — that's a setup state, not a failure: hand over the payload.
          this.irnOk.set(false);
          this.irnPayloadReady.set(true);
          this.irnMsg.set('IRP not connected — download the payload JSON and upload it on the e-invoice portal (or set EINVOICE_API_URL + EINVOICE_AUTH_TOKEN from your GSP).');
          return;
        }
        this.irnOk.set(false);
        this.irnMsg.set(doc?.message || 'e-Invoice failed');
      },
      error: (err) => {
        this.irnBusy.set(false);
        this.irnOk.set(false);
        this.irnMsg.set(err?.error?.message || 'e-Invoice failed');
      },
    });
  }

  downloadIrnPayload(): void {
    const id = this.savedId();
    if (id) this.entry.downloadEinvoicePayload(id, this.savedNumber() || 'invoice');
  }

  readonly tick = signal(0);
  readonly more = signal(false);
  readonly savedAddresses = signal<SavedAddress[]>([]);
  billTo: InvoiceAddress = {};
  shipTo: InvoiceAddress = {};

  // header
  memoType: 'credit' | 'cash' = 'credit';
  voucherDate = new Date().toISOString().slice(0, 10);
  dueDays: number | null = null;
  broker = '';
  commissionPct: number | null = null;
  transportName = '';
  lrNo = '';
  vehicleNo = '';
  isInterstate = false;

  // party
  customerQuery = '';
  readonly customerHits = signal<CustomerHit[]>([]);
  readonly customerHitIdx = signal(0);
  readonly customer = signal<CustomerContext | null>(null);

  // grid
  rows: Row[] = [this.blankRow(), this.blankRow()];
  readonly productHits = signal<ProductHit[]>([]);
  readonly productHitIdx = signal(0);
  readonly searchRow = signal<number | null>(null);
  readonly qc = signal<{ kind: QuickKind; name: string; row?: number } | null>(null);

  // footer
  billDiscPct: number | null = null;
  billDiscAmt: number | null = null;
  chargeRows: Charge[] = [
    { label: 'Freight', amount: null, gstRate: null },
    { label: 'Packing', amount: null, gstRate: null },
    { label: 'Other', amount: null, gstRate: null },
  ];
  receivedNow: number | null = null;
  tcsPct: number | null = null;
  note = '';

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedNumber = signal<string | null>(null);
  readonly savedId = signal<string | null>(null);
  series = '';

  private debounce?: ReturnType<typeof setTimeout>;

  private blankRow(): Row {
    return { name: '', hsn: '', uom: 'pcs', qty: null, free: null, rate: null, d1: null, d2: null, gstRate: null };
  }

  // ─── Party typeahead ────────────────────────────────────────────────────────
  onCustomerQuery(q: string): void {
    this.customer.set(null);
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.customerHits.set([]); return; }
    this.debounce = setTimeout(() => {
      this.entry.customers(q).subscribe((hits) => { this.customerHits.set(hits || []); this.customerHitIdx.set(0); });
    }, 200);
  }

  onPartyKey(e: KeyboardEvent): void {
    const hits = this.customerHits();
    if (hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.customerHitIdx.set(Math.min(this.customerHitIdx() + 1, hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.customerHitIdx.set(Math.max(this.customerHitIdx() - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickCustomer(hits[this.customerHitIdx()]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); this.customerHits.set([]); return; }
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (!this.customer() && this.customerQuery.length >= 2) { this.openQuickCreate('customer', this.customerQuery); return; }
      this.focusCell(0, 'name');
    }
  }

  pickCustomer(hit: CustomerHit): void {
    this.customerQuery = hit.name;
    this.customerHits.set([]);
    this.entry.customerContext(hit.id).subscribe((ctx) => {
      this.customer.set(ctx);
      // Miracle prefills the party's agreed credit period.
      if (ctx.creditDays && this.dueDays === null) this.dueDays = Number(ctx.creditDays);
      // Party master prefills BOTH Bill To and Ship To (edit Ship To if dispatch differs).
      const partyAddr: InvoiceAddress = {
        name: ctx.name, phone: ctx.phone, gstin: ctx.gstin || undefined,
        stateCode: ctx.stateCode || undefined, state: ctx.state || undefined,
        address: ctx.billingAddress || undefined, pincode: ctx.pincode || undefined,
      };
      this.billTo = { ...partyAddr };
      this.shipTo = { ...partyAddr };
      this.autoInterstate();
      this.entry.customerAddresses(hit.id).subscribe((addrs) => {
        this.savedAddresses.set(addrs || []);
        const def = (addrs || [])[0];
        if (def) {
          const detail = { address: def.fullAddress, city: def.city, state: def.state, pincode: def.pincode };
          this.billTo = { ...this.billTo, ...detail };
          this.shipTo = { ...this.shipTo, ...detail };
        }
        this.autoInterstate();
        this.tick.update((t) => t + 1);
      });
      for (let r = 0; r < this.rows.length; r++) if (this.rows[r].productId) this.loadItemContext(r);
    });
    // Party picked → cursor lands on Bill To (Enter walks the addresses, PgDn skips to items).
    setTimeout(() => this.focusField('bt-name'));
  }

  // ─── Item typeahead ─────────────────────────────────────────────────────────
  onProductQuery(r: number, q: string): void {
    const row = this.rows[r];
    row.productId = undefined; row.hsn = ''; row.stock = undefined;
    row.lastToCustomer = null; row.lastOverall = null; row.levelPrice = null;
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
    row.rate = Number(hit.salePrice ?? hit.basePrice) || null;
    // Vyapar "price includes tax": the master rate is MRP-style inclusive — bill at
    // the derived tax-exclusive rate so the invoice math stays exclusive throughout.
    if ((hit as any).priceIncludesTax && row.rate && row.gstRate) {
      row.rate = money(row.rate / (1 + row.gstRate / 100));
    }
    row.stock = Number(hit.stock) || 0;
    // Default D1: the party's agreed discount wins, else the item's default sale discount.
    const partyDisc = Number(this.customer()?.defaultDiscountPct) || 0;
    const itemDisc = Number((hit as any).saleDiscountPct) || 0;
    if (row.d1 === null && (partyDisc > 0 || itemDisc > 0)) row.d1 = partyDisc > 0 ? partyDisc : itemDisc;
    this.productHits.set([]); this.searchRow.set(null);
    this.loadItemContext(r, true);
    setTimeout(() => this.focusCell(r, 'qty'));
  }

  private loadItemContext(r: number, prefillRate = false): void {
    const row = this.rows[r];
    if (!row.productId) return;
    const stdRate = row.rate;
    this.entry.itemContext(row.productId, this.customer()?.id).subscribe((ctx) => {
      row.stock = Number(ctx.stock) || 0;
      row.lastToCustomer = ctx.lastToCustomer || null;
      row.lastOverall = ctx.lastOverall || null;
      row.levelPrice = ctx.levelPrice || null;
      if (prefillRate && row.rate === stdRate) {
        if (ctx.levelPrice) row.rate = money(ctx.levelPrice.price);
        else if (ctx.lastToCustomer) row.rate = money(ctx.lastToCustomer.price);
      }
      // §3F.1: batch-tracked item → FIFO-suggest the OLDEST live lot; the strip opens
      // with a batch picker and the lot's own selling price fills the rate.
      const batches = (ctx as any).batches as Row['batchOptions'];
      if (batches?.length) {
        row.batchOptions = batches;
        if (!row.batchNo) this.applyBatch(row, batches[0].batchNo);
        row.showBatch = true;
      }
      this.tick.update((t) => t + 1);
    });
  }

  /** Selecting a batch bills at that lot's price, capped at ITS printed MRP. */
  applyBatch(row: Row, batchNo: string): void {
    row.batchNo = batchNo;
    const b = row.batchOptions?.find((x) => x.batchNo === batchNo);
    if (!b) return;
    row.expiry = b.expiryDate ? String(b.expiryDate).slice(0, 10) : row.expiry;
    const price = Number(b.sellingPrice) || Number(row.rate) || 0;
    const mrpCap = Number(b.mrp) || 0;
    row.rate = money(mrpCap > 0 ? Math.min(price, mrpCap) : price);
    this.tick.update((t) => t + 1);
  }

  // ─── Quick create ───────────────────────────────────────────────────────────
  openQuickCreate(kind: QuickKind, name: string, row?: number): void {
    this.customerHits.set([]);
    this.productHits.set([]);
    this.searchRow.set(null);
    this.qc.set({ kind, name, row });
  }

  onQuickCreated(created: QuickCreated): void {
    const ctx = this.qc();
    this.qc.set(null);
    if (created.kind === 'customer') {
      this.pickCustomer({ id: created.id, name: created.name, phone: created.phone || '' });
    } else if (created.kind === 'product' && ctx?.row !== undefined) {
      this.pickProduct(ctx.row, {
        id: created.id, name: created.name, uom: created.uom,
        hsnCode: created.hsnCode, gstRate: created.gstRate,
        salePrice: created.rate, basePrice: created.rate, stock: 0,
      });
    }
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
        if (col === 'name' && !this.rows[r].name) { this.focusNote(); return; }
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
    const list = this.narrList();
    if (list) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.narrIdx.set(Math.min(this.narrIdx() + 1, list.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.narrIdx.set(Math.max(this.narrIdx() - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); this.pickNarration(this.narrIdx()); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.narrList.set(null); return; }
    }
    // Miracle: Shift+F1 recalls frequently-used narrations, Ctrl+R repeats the last one.
    if (e.key === 'F1' && e.shiftKey) {
      e.preventDefault();
      const all = this.savedNarrations();
      if (all.length) { this.narrList.set(all); this.narrIdx.set(0); }
      return;
    }
    if ((e.key === 'r' || e.key === 'R') && e.ctrlKey) {
      e.preventDefault();
      const last = this.savedNarrations()[0];
      if (last) { this.note = last; this.tick.update((t) => t + 1); }
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); this.save(); }
  }

  // ─── Narration recall (Miracle Shift+F1 / Ctrl+R) ──────────────────────────
  readonly narrList = signal<string[] | null>(null);
  readonly narrIdx = signal(0);

  pickNarration(i: number): void {
    const list = this.narrList();
    if (list?.[i] !== undefined) { this.note = list[i]; this.tick.update((t) => t + 1); }
    this.narrList.set(null);
    this.focusNote();
  }

  private savedNarrations(): string[] {
    try { return JSON.parse(localStorage.getItem('wa-narrations') || '[]'); } catch { return []; }
  }

  private rememberNarration(text: string): void {
    const t = (text || '').trim();
    if (!t) return;
    try {
      const list = [t, ...this.savedNarrations().filter((n) => n !== t)].slice(0, 10);
      localStorage.setItem('wa-narrations', JSON.stringify(list));
    } catch { /* storage full/blocked — recall is a convenience */ }
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
    else this.focusParty();
  }
  private focusCell(r: number, col: string): void {
    const el = this.host.nativeElement.querySelector(`[data-cell="${r}:${col}"]`) as HTMLInputElement | null;
    el?.focus(); el?.select();
  }
  private focusParty(): void {
    (this.host.nativeElement.querySelector('[data-cell="party"]') as HTMLInputElement | null)?.focus();
  }
  private focusNote(): void {
    (this.host.nativeElement.querySelector('[data-cell="note"]') as HTMLInputElement | null)?.focus();
  }

  /** Miracle: Ctrl+Enter accepts/saves the voucher from anywhere (alias of Ctrl+A). */

  @HostListener('document:keydown.control.enter', ['$event'])

  onCtrlEnterSave(e: Event): void { this.onSaveKey(e as any); }

  /**
   * PgDn from ANYWHERE on the sales screen jumps to the item grid (Miracle: the
   * operator never has to walk fields they don't need — party and addresses are
   * optional stops, items are the destination).
   */
  @HostListener('document:keydown.pagedown', ['$event'])
  onGlobalPgDn(e: Event): void {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest?.('[data-lookup-box],[data-detail-box]')) return; // popups own their keys
    const cell = active?.getAttribute?.('data-cell') || '';
    if (/^\d+:/.test(cell)) return; // already in the grid
    e.preventDefault();
    // Land on the first EMPTY row so billing continues, not overwrites.
    const r = Math.max(0, this.rows.findIndex((row) => !row.name));
    this.focusCell(r === -1 ? this.rows.length - 1 : r, 'name');
  }

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

  printSaved(): void {
    const id = this.savedId();
    if (id) void this.router.navigate(['/print/invoice', id]);
  }

  // ─── Miracle billing math ────────────────────────────────────────────────────
  totalQtyOf(row: Row): number { return (Number(row.qty) || 0) + (Number(row.free) || 0); }
  /** Cascading discounts: gross → −D1% → −D2%. Free qty adds nothing to the amount. */
  lineAmount(row: Row): number {
    const grossAmt = (Number(row.qty) || 0) * (Number(row.rate) || 0);
    return money(grossAmt * (1 - (Number(row.d1) || 0) / 100) * (1 - (Number(row.d2) || 0) / 100));
  }
  private liveRows(): Row[] { return this.rows.filter((r) => r.name && (Number(r.qty) || 0) > 0); }
  gross(): number { return money(this.liveRows().reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0)); }
  lineNet(): number { return money(this.liveRows().reduce((s, r) => s + this.lineAmount(r), 0)); }
  lineDiscTotal(): number { return money(this.gross() - this.lineNet()); }
  billDiscount(): number {
    const pct = money(this.lineNet() * ((Number(this.billDiscPct) || 0) / 100));
    return money(pct + (Number(this.billDiscAmt) || 0));
  }
  taxableLines(): number { return money(Math.max(0, this.lineNet() - this.billDiscount())); }
  liveCharges(): Array<{ label: string; amount: number; gstRate: number }> {
    return this.chargeRows
      .map((c) => ({ label: c.label || 'Charge', amount: money(Number(c.amount) || 0), gstRate: Number(c.gstRate) || 0 }))
      .filter((c) => c.amount !== 0);
  }
  chargesAmt(): number { return money(this.liveCharges().reduce((s, c) => s + c.amount, 0)); }
  totalTax(): number {
    const net = this.lineNet();
    const factor = net > 0 ? this.taxableLines() / net : 0;
    const lineTax = this.liveRows().reduce((s, r) => s + this.lineAmount(r) * factor * ((Number(r.gstRate) || 0) / 100), 0);
    const chargeTax = this.liveCharges().reduce((s, c) => s + (c.amount * c.gstRate) / 100, 0);
    return money(lineTax + chargeTax);
  }
  /** TCS (206C-style) on the tax-inclusive value — mirrors the backend computation. */
  tcsAmt(): number {
    return money((this.taxableLines() + this.chargesAmt() + this.totalTax()) * ((Number(this.tcsPct) || 0) / 100));
  }
  rawTotal(): number { return money(this.taxableLines() + this.chargesAmt() + this.totalTax() + this.tcsAmt()); }
  grandTotal(): number { return Math.round(this.rawTotal()); }
  roundOff(): number { return money(this.grandTotal() - this.rawTotal()); }

  canSave(): boolean {
    if (this.liveRows().length === 0 || this.grandTotal() <= 0) return false;
    if (this.memoType === 'credit' && !this.customer()) return false; // credit needs a party
    return true;
  }

  /** Alt+L rate pick: write the chosen historical rate back into the grid line. */
  onApplyRate(e: { row: number; rate: number }): void {
    const row = this.rows[e.row];
    if (!row) return;
    row.rate = e.rate;
    this.tick.update((t) => t + 1);
  }

  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }

  creditExceeded(): boolean {
    const c = this.customer();
    if (this.memoType === 'cash' || !c || !c.creditLimit || Number(c.creditLimit) <= 0) return false;
    return Number(c.outstanding) + this.grandTotal() > Number(c.creditLimit);
  }
  overdueAmount(): number {
    const c = this.customer();
    return c && c.creditDays ? Number(c.overdue) || 0 : 0;
  }

  applySavedAddress(id: string): void {
    const a = this.savedAddresses().find((x) => x.id === id);
    if (!a) return;
    this.shipTo = { ...this.shipTo, address: a.fullAddress, city: a.city, state: a.state, pincode: a.pincode };
    this.tick.update((t) => t + 1);
  }

  private effShipTo(): InvoiceAddress | undefined {
    // Ship To stands on its own (prefilled from the party); empty → dispatch = billing.
    return Object.values(this.shipTo).some((v) => v) ? this.shipTo : this.effBillTo();
  }
  private effBillTo(): InvoiceAddress | undefined {
    return Object.values(this.billTo).some((v) => v) ? this.billTo : undefined;
  }

  // ─── Save ──────────────────────────────────────────────────────────────────
  async save(): Promise<void> {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    // D1/D2 folded into unitPrice so the backend reproduces the grid exactly; the raw
    // rate + discounts + free qty ride along in the line JSONB for the record/print.
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
    })) as any;
    try {
      this.rememberNarration(this.note);
      const inv = await firstValueFrom(this.entry.createInvoice({
        customerId: this.customer()?.id,
        items,
        taxRate: 0,
        discount: this.billDiscount(),
        note: this.note || undefined,
        invoiceNumber: this.manualNo.trim() || undefined,
        tcsPct: this.tcsPct !== null ? Number(this.tcsPct) : undefined,
        isInterstate: this.isInterstate,
        issueDate: this.voucherDate || undefined,
        isCash: this.memoType === 'cash',
        charges: this.liveCharges(),
        autoRound: true,
        broker: this.broker || undefined,
        commissionPct: this.commissionPct !== null ? Number(this.commissionPct) : undefined,
        transport: this.transportName || this.lrNo || this.vehicleNo
          ? { name: this.transportName || undefined, lrNo: this.lrNo || undefined, vehicleNo: this.vehicleNo || undefined }
          : undefined,
        dueDays: this.memoType === 'cash' ? undefined : (this.dueDays !== null ? Number(this.dueDays) : undefined),
        billTo: this.effBillTo(),
        shipTo: this.effShipTo(),
        series: this.series || undefined,
      }));

      // Instant part-settlement on a credit bill (Miracle "received now").
      const received = money(Number(this.receivedNow) || 0);
      if (this.memoType === 'credit' && received > 0 && inv?.id) {
        await firstValueFrom(this.entry.recordPayment(inv.id, Math.min(received, this.grandTotal()), 'Received with invoice'));
      }

      this.savedNumber.set(inv?.invoiceNumber || 'invoice');
      this.savedId.set(inv?.id || null);
      this.irnMsg.set(null);
      this.ewayOpen.set(false); this.ewayNo.set(null); this.ewayErr.set(null); this.ewayId = null;
      // e-Way "To" prefills from the just-billed dispatch destination (before the form resets).
      this.ewayTo = this.effShipTo()?.city || this.effBillTo()?.city || '';
      this.ewayVehicle = this.vehicleNo || this.ewayVehicle;
      this.ewayTransporter = this.transportName || this.ewayTransporter;
      this.rows = [this.blankRow(), this.blankRow()];
      this.note = ''; this.manualNo = ''; this.customerQuery = ''; this.customer.set(null);
      this.billDiscPct = null; this.billDiscAmt = null; this.receivedNow = null; this.dueDays = null; this.tcsPct = null;
      this.billTo = {}; this.shipTo = {}; this.savedAddresses.set([]);
      this.broker = ''; this.commissionPct = null; this.transportName = ''; this.lrNo = ''; this.vehicleNo = '';
      this.chargeRows = [
        { label: 'Freight', amount: null, gstRate: null },
        { label: 'Packing', amount: null, gstRate: null },
        { label: 'Other', amount: null, gstRate: null },
      ];
      this.tick.update((t) => t + 1);
      setTimeout(() => this.focusParty());
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to save invoice');
    } finally {
      this.saving.set(false);
    }
  }
}
