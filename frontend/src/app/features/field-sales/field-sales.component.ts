import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SfaService } from '../../core/services/sfa.service';

type Tab = 'performance' | 'salesmen' | 'beats' | 'targets' | 'visits' | 'followups' | 'expenses';

/**
 * Field Sales (SFA) manager console — the paid, session-authed cockpit a manager
 * uses to run their field team. Five tabs:
 *   • Performance — team KPI table (visits/orders/sales/collections vs target with
 *     achievement bars) over a date range, plus the top products sold.
 *   • Salesmen — roster CRUD: add a salesman, optionally provision a portal login,
 *     copy the WhatsApp webview link, rotate the link, activate/deactivate.
 *   • Beats — assign the customers a salesman is expected to service (their beat).
 *   • Targets — set monthly sales / collection / visit targets per salesman.
 *   • Visits — audit trail of every field visit (check-in/out, outcome, ₹).
 * All data flows through {@link SfaService}; responses are already unwrapped.
 */
@Component({
  selector: 'wa-field-sales',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900">
      <!-- ── HEADER ─────────────────────────────────────────────── -->
      <header class="bg-white border-b border-gray-100">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm text-lg font-bold">FS</div>
          <div class="min-w-0">
            <h1 class="text-lg font-bold leading-tight">Field Sales</h1>
            <p class="text-[12px] text-gray-400 leading-tight">Team performance, beats, targets &amp; visits</p>
          </div>
        </div>
        <div class="max-w-6xl mx-auto px-2 sm:px-4 flex gap-1 overflow-x-auto no-scrollbar">
          @for (t of tabs; track t.id) {
            <button (click)="go(t.id)"
              class="px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors"
              [class.border-indigo-600]="tab() === t.id"
              [class.text-indigo-700]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-gray-400]="tab() !== t.id">{{ t.label }}</button>
          }
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        <!-- ══ PERFORMANCE ══════════════════════════════════════════ -->
        @if (tab() === 'performance') {
          <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex flex-wrap items-end gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">From</label>
              <input type="date" [(ngModel)]="fromInput" class="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">To</label>
              <input type="date" [(ngModel)]="toInput" class="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Salesman</label>
              <select [(ngModel)]="perfSalesman" class="rounded-xl border border-gray-200 px-3 py-2 text-sm min-w-[10rem]">
                <option value="">All salesmen</option>
                @for (s of salesmen(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
            </div>
            <button (click)="applyPerformance()" class="rounded-xl bg-indigo-600 text-white text-sm font-semibold px-5 py-2 hover:bg-indigo-700">Apply</button>
          </div>

          @if (perfError()) { <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{{ perfError() }}</div> }

          <!-- Leaderboard podium (top 3 by sales) -->
          @if (performance().length) {
            <div class="grid grid-cols-3 gap-3 mb-4">
              @for (r of performance().slice(0, 3); track r.id; let i = $index) {
                <div class="bg-white rounded-2xl border p-4 text-center shadow-sm"
                     [class.border-amber-300]="i===0" [class.border-slate-200]="i===1" [class.border-orange-200]="i===2">
                  <div class="text-2xl leading-none">{{ i===0 ? '🥇' : i===1 ? '🥈' : '🥉' }}</div>
                  <p class="font-bold text-[13px] truncate mt-1.5">{{ r.name }}</p>
                  <p class="text-lg font-bold tabular-nums text-indigo-700">₹{{ inr(r.orderValue) }}</p>
                  <p class="text-[11px] text-gray-400">{{ r.orders || 0 }} orders · ₹{{ inr(r.collected) }} collected</p>
                  @if (achievement(r); as pct) { <p class="text-[11px] font-semibold mt-0.5" [class.text-emerald-600]="pct>=100" [class.text-indigo-500]="pct<100">{{ pct }}% of target</p> }
                </div>
              }
            </div>
          }

          <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
            <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 class="text-sm font-bold text-gray-700">Team performance</h2>
              @if (perfLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
            </div>
            @if (!perfLoading() && !performance().length) {
              <p class="text-sm text-gray-400 px-4 py-10 text-center">No data for this range.</p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                      <th class="px-4 py-2.5">Salesman</th>
                      <th class="px-4 py-2.5">Route / Area</th>
                      <th class="px-4 py-2.5 text-right">Visits</th>
                      <th class="px-4 py-2.5 text-right">Orders</th>
                      <th class="px-4 py-2.5 text-right">Sales</th>
                      <th class="px-4 py-2.5 text-right">Collected</th>
                      <th class="px-4 py-2.5 text-right">Target</th>
                      <th class="px-4 py-2.5 w-40">Achievement</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of performance(); track r.id; let i = $index) {
                      <tr class="border-b border-gray-50 hover:bg-gray-50/60">
                        <td class="px-4 py-2.5">
                          <div class="font-semibold flex items-center gap-1.5">
                            <span class="text-[11px] text-gray-400 tabular-nums w-4">{{ i < 3 ? (i===0?'🥇':i===1?'🥈':'🥉') : '#' + (i+1) }}</span>
                            {{ r.name }}
                          </div>
                          <div class="text-[11px] text-gray-400">{{ r.phone }}
                            @if (!r.isActive) { <span class="ml-1 text-red-500 font-semibold">· inactive</span> }
                          </div>
                        </td>
                        <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ r.route || '—' }}{{ r.area ? ' · ' + r.area : '' }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums">{{ r.visits || 0 }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums">{{ r.orders || 0 }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums font-semibold">₹{{ inr(r.orderValue) }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums text-emerald-700">₹{{ inr(r.collected) }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ r.targetAmount ? '₹' + inr(r.targetAmount) : '—' }}</td>
                        <td class="px-4 py-2.5">
                          @if (achievement(r); as pct) {
                            <div class="flex items-center gap-2">
                              <div class="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div class="h-full rounded-full"
                                  [class.bg-emerald-500]="pct >= 100" [class.bg-indigo-500]="pct < 100"
                                  [style.width.%]="pct > 100 ? 100 : pct"></div>
                              </div>
                              <span class="text-[12px] font-semibold tabular-nums w-11 text-right">{{ pct }}%</span>
                            </div>
                          } @else {
                            <span class="text-[12px] text-gray-300">—</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-100">
              <h2 class="text-sm font-bold text-gray-700">Top products sold</h2>
            </div>
            @if (!topProducts().length) {
              <p class="text-sm text-gray-400 px-4 py-8 text-center">No products sold in this range.</p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                      <th class="px-4 py-2.5">Product</th>
                      <th class="px-4 py-2.5 text-right">Qty</th>
                      <th class="px-4 py-2.5 text-right">Value</th>
                      <th class="px-4 py-2.5 text-right">Orders</th>
                      <th class="px-4 py-2.5 text-right">Customers</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of topProducts().slice(0, 10); track p.productId) {
                      <tr class="border-b border-gray-50">
                        <td class="px-4 py-2.5 font-medium">{{ p.productName }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums">{{ inrQty(p.qty) }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums font-semibold">₹{{ inr(p.value) }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums">{{ p.orders || 0 }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums">{{ p.customers || 0 }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        <!-- ══ SALESMEN ═════════════════════════════════════════════ -->
        @if (tab() === 'salesmen') {
          @if (salesmenError()) { <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{{ salesmenError() }}</div> }

          <!-- Add form -->
          <div class="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <h2 class="text-sm font-bold text-gray-700 mb-4">Add salesman</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Name *</label>
                <input [(ngModel)]="addForm.name" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Full name" />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Phone *</label>
                <input [(ngModel)]="addForm.phone" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="10-digit mobile" />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Code</label>
                <input [(ngModel)]="addForm.code" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="e.g. SM01" />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Route</label>
                <input [(ngModel)]="addForm.route" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Area</label>
                <input [(ngModel)]="addForm.area" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <label class="flex items-center gap-2 mt-4 text-sm text-gray-600 select-none cursor-pointer">
              <input type="checkbox" [(ngModel)]="addForm.createLogin" class="w-4 h-4 accent-indigo-600" />
              Create portal login
            </label>
            @if (addForm.createLogin) {
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Login email</label>
                  <input [(ngModel)]="addForm.email" type="email" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="name@company.com" />
                </div>
                <div>
                  <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Password</label>
                  <input [(ngModel)]="addForm.password" type="text" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Set a password" />
                </div>
              </div>
            }
            <div class="flex items-center gap-3 mt-4">
              <button (click)="submitSalesman()" [disabled]="addBusy()"
                class="rounded-xl bg-indigo-600 text-white text-sm font-semibold px-5 py-2 hover:bg-indigo-700 disabled:opacity-50">
                {{ addBusy() ? 'Saving…' : 'Add salesman' }}
              </button>
              @if (addFormError()) { <span class="text-sm text-red-600">{{ addFormError() }}</span> }
            </div>

            @if (newLink()) {
              <div class="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <p class="text-[12px] font-semibold text-emerald-800 mb-1">Salesman added. Share this WhatsApp link:</p>
                <div class="flex items-center gap-2">
                  <input readonly [value]="newLink()" class="flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[12px] text-gray-700" />
                  <button (click)="copy(newLink())" class="rounded-lg bg-emerald-600 text-white text-[12px] font-semibold px-3 py-1.5">{{ copied() ? 'Copied!' : 'Copy' }}</button>
                </div>
              </div>
            }
          </div>

          <!-- Roster -->
          <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 class="text-sm font-bold text-gray-700">Salesmen</h2>
              @if (salesmenLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
            </div>
            @if (!salesmenLoading() && !salesmen().length) {
              <p class="text-sm text-gray-400 px-4 py-10 text-center">No salesmen yet — add your first above.</p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                      <th class="px-4 py-2.5">Name</th>
                      <th class="px-4 py-2.5">Code</th>
                      <th class="px-4 py-2.5">Phone</th>
                      <th class="px-4 py-2.5">Route / Area</th>
                      <th class="px-4 py-2.5">Login</th>
                      <th class="px-4 py-2.5">Active</th>
                      <th class="px-4 py-2.5 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of salesmen(); track s.id) {
                      <tr class="border-b border-gray-50 hover:bg-gray-50/60">
                        <td class="px-4 py-2.5 font-semibold">{{ s.name }}</td>
                        <td class="px-4 py-2.5 text-gray-500">{{ s.code || '—' }}</td>
                        <td class="px-4 py-2.5 tabular-nums text-gray-500">{{ s.phone }}</td>
                        <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ s.route || '—' }}{{ s.area ? ' · ' + s.area : '' }}</td>
                        <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ s.email || '—' }}</td>
                        <td class="px-4 py-2.5">
                          <button (click)="toggleActive(s)"
                            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                            [class.bg-emerald-500]="s.isActive" [class.bg-gray-200]="!s.isActive">
                            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                              [class.translate-x-6]="s.isActive" [class.translate-x-1]="!s.isActive"></span>
                          </button>
                        </td>
                        <td class="px-4 py-2.5 text-right whitespace-nowrap">
                          <button (click)="copy(linkFor(s))" class="text-[12px] font-semibold text-indigo-600 hover:underline mr-3">Copy link</button>
                          <button (click)="rotate(s)" class="text-[12px] font-semibold text-amber-600 hover:underline">Rotate</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        <!-- ══ BEATS ════════════════════════════════════════════════ -->
        @if (tab() === 'beats') {
          <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex flex-wrap items-end gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Salesman</label>
              <select [(ngModel)]="beatSalesman" (ngModelChange)="loadBeat()" class="rounded-xl border border-gray-200 px-3 py-2 text-sm min-w-[12rem]">
                <option value="">Select a salesman…</option>
                @for (s of salesmen(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
            </div>
            @if (beatSalesman && !beatEditing()) {
              <button (click)="startEditBeat()" class="rounded-xl bg-indigo-600 text-white text-sm font-semibold px-5 py-2 hover:bg-indigo-700">Edit beat</button>
            }
          </div>

          @if (beatError()) { <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{{ beatError() }}</div> }

          @if (!beatSalesman) {
            <p class="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 px-4 py-10 text-center">Pick a salesman to view or edit their beat.</p>
          } @else if (beatEditing()) {
            <!-- Edit mode -->
            <div class="bg-white rounded-2xl border border-gray-100 p-5">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-sm font-bold text-gray-700">Edit beat — {{ beatSelected().size }} customer(s) selected</h2>
                <div class="flex gap-2">
                  <button (click)="beatEditing.set(false)" class="rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold px-4 py-1.5">Cancel</button>
                  <button (click)="saveBeat()" [disabled]="beatBusy()" class="rounded-xl bg-indigo-600 text-white text-sm font-semibold px-4 py-1.5 disabled:opacity-50">{{ beatBusy() ? 'Saving…' : 'Save beat' }}</button>
                </div>
              </div>
              <input [(ngModel)]="beatQ" (ngModelChange)="searchBeatCustomers()" placeholder="Search customers by name / phone / area…"
                class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
              <div class="max-h-[26rem] overflow-y-auto divide-y divide-gray-50">
                @for (c of beatCandidates(); track c.id) {
                  <label class="flex items-center gap-3 py-2.5 cursor-pointer select-none">
                    <input type="checkbox" [checked]="beatSelected().has(c.id)" (change)="toggleBeatCustomer(c.id)" class="w-4 h-4 accent-indigo-600" />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{{ c.name }}</p>
                      <p class="text-[11px] text-gray-400">{{ c.phone }}{{ c.area ? ' · ' + c.area : '' }}</p>
                    </div>
                    @if (+c.outstanding > 0) { <span class="text-[12px] font-semibold tabular-nums text-red-600 shrink-0">₹{{ inr(c.outstanding) }}</span> }
                  </label>
                } @empty { <p class="text-sm text-gray-400 py-6 text-center">No customers found.</p> }
              </div>
            </div>
          } @else {
            <!-- View mode -->
            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 class="text-sm font-bold text-gray-700">Current beat</h2>
                @if (beatLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
              </div>
              @if (!beatLoading() && !beat().length) {
                <p class="text-sm text-gray-400 px-4 py-10 text-center">No customers on this beat yet — click "Edit beat" to add some.</p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                        <th class="px-4 py-2.5">Customer</th>
                        <th class="px-4 py-2.5">Area / Route</th>
                        <th class="px-4 py-2.5 text-right">Outstanding</th>
                        <th class="px-4 py-2.5 text-right">Open bills</th>
                        <th class="px-4 py-2.5">Last visit</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (c of beat(); track c.customerId) {
                        <tr class="border-b border-gray-50">
                          <td class="px-4 py-2.5">
                            <div class="font-medium">{{ c.name }}</div>
                            <div class="text-[11px] text-gray-400">{{ c.phone }}</div>
                          </td>
                          <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ c.area || '—' }}{{ c.route ? ' · ' + c.route : '' }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums" [class.text-red-600]="+c.outstanding > 0">₹{{ inr(c.outstanding) }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums">{{ c.openBills || 0 }}</td>
                          <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ c.lastVisitAt ? fmtDate(c.lastVisitAt) : 'Never' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          }
        }

        <!-- ══ TARGETS ══════════════════════════════════════════════ -->
        @if (tab() === 'targets') {
          <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex flex-wrap items-end gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Salesman</label>
              <select [(ngModel)]="targetSalesman" (ngModelChange)="loadTargets()" class="rounded-xl border border-gray-200 px-3 py-2 text-sm min-w-[12rem]">
                <option value="">Select a salesman…</option>
                @for (s of salesmen(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
            </div>
          </div>

          @if (targetError()) { <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{{ targetError() }}</div> }

          @if (!targetSalesman) {
            <p class="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 px-4 py-10 text-center">Pick a salesman to manage their targets.</p>
          } @else {
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <!-- Set form -->
              <div class="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-1">
                <h2 class="text-sm font-bold text-gray-700 mb-4">Set / update target</h2>
                <div class="space-y-3">
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Month</label>
                    <input type="month" [(ngModel)]="targetForm.month" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Sales target (₹)</label>
                    <input type="number" [(ngModel)]="targetForm.amount" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Collection target (₹)</label>
                    <input type="number" [(ngModel)]="targetForm.collection" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Visit target</label>
                    <input type="number" [(ngModel)]="targetForm.visits" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                  <button (click)="saveTarget()" [disabled]="targetBusy()"
                    class="w-full rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 disabled:opacity-50">
                    {{ targetBusy() ? 'Saving…' : 'Save target' }}
                  </button>
                  @if (targetFormError()) { <p class="text-sm text-red-600">{{ targetFormError() }}</p> }
                </div>
              </div>

              <!-- Existing targets -->
              <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden lg:col-span-2">
                <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 class="text-sm font-bold text-gray-700">Targets</h2>
                  @if (targetsLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
                </div>
                @if (!targetsLoading() && !targets().length) {
                  <p class="text-sm text-gray-400 px-4 py-10 text-center">No targets set yet.</p>
                } @else {
                  <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                      <thead>
                        <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                          <th class="px-4 py-2.5">Month</th>
                          <th class="px-4 py-2.5 text-right">Sales</th>
                          <th class="px-4 py-2.5 text-right">Collection</th>
                          <th class="px-4 py-2.5 text-right">Visits</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (t of targets(); track t.id) {
                          <tr class="border-b border-gray-50">
                            <td class="px-4 py-2.5 font-medium">{{ fmtMonth(t.periodMonth) }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums">{{ t.targetAmount ? '₹' + inr(t.targetAmount) : '—' }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums">{{ t.targetCollection ? '₹' + inr(t.targetCollection) : '—' }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums">{{ t.targetVisits || '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </div>
            </div>
          }
        }

        <!-- ══ VISITS ═══════════════════════════════════════════════ -->
        @if (tab() === 'visits') {
          <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex flex-wrap items-end gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">From</label>
              <input type="date" [(ngModel)]="fromInput" class="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">To</label>
              <input type="date" [(ngModel)]="toInput" class="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Salesman</label>
              <select [(ngModel)]="visitSalesman" class="rounded-xl border border-gray-200 px-3 py-2 text-sm min-w-[10rem]">
                <option value="">All salesmen</option>
                @for (s of salesmen(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
            </div>
            <button (click)="applyVisits()" class="rounded-xl bg-indigo-600 text-white text-sm font-semibold px-5 py-2 hover:bg-indigo-700">Apply</button>
          </div>

          @if (visitError()) { <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{{ visitError() }}</div> }

          <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 class="text-sm font-bold text-gray-700">Visits</h2>
              @if (visitLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
            </div>
            @if (!visitLoading() && !visits().length) {
              <p class="text-sm text-gray-400 px-4 py-10 text-center">No data for this range.</p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                      <th class="px-4 py-2.5">Salesman</th>
                      <th class="px-4 py-2.5">Customer</th>
                      <th class="px-4 py-2.5">Area</th>
                      <th class="px-4 py-2.5">Purpose</th>
                      <th class="px-4 py-2.5">Status</th>
                      <th class="px-4 py-2.5">Check-in</th>
                      <th class="px-4 py-2.5">Check-out</th>
                      <th class="px-4 py-2.5">Outcome</th>
                      <th class="px-4 py-2.5 text-right">Order</th>
                      <th class="px-4 py-2.5 text-right">Collected</th>
                      <th class="px-4 py-2.5">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (v of visits(); track v.id) {
                      <tr class="border-b border-gray-50 hover:bg-gray-50/60 align-top">
                        <td class="px-4 py-2.5 font-medium whitespace-nowrap">{{ v.salesmanName }}</td>
                        <td class="px-4 py-2.5 whitespace-nowrap">
                          <div>{{ v.customerName }}</div>
                          <div class="text-[11px] text-gray-400">{{ v.customerPhone }}</div>
                        </td>
                        <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ v.area || '—' }}</td>
                        <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ human(v.purpose) }}</td>
                        <td class="px-4 py-2.5">
                          <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            [class.bg-emerald-100]="v.status === 'completed'" [class.text-emerald-700]="v.status === 'completed'"
                            [class.bg-indigo-100]="v.status === 'checked_in'" [class.text-indigo-700]="v.status === 'checked_in'"
                            [class.bg-gray-100]="v.status !== 'completed' && v.status !== 'checked_in'"
                            [class.text-gray-600]="v.status !== 'completed' && v.status !== 'checked_in'">{{ human(v.status) }}</span>
                        </td>
                        <td class="px-4 py-2.5 text-[12px] text-gray-500 whitespace-nowrap">{{ v.checkinAt ? fmtDateTime(v.checkinAt) : '—' }}</td>
                        <td class="px-4 py-2.5 text-[12px] text-gray-500 whitespace-nowrap">{{ v.checkoutAt ? fmtDateTime(v.checkoutAt) : '—' }}</td>
                        <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ human(v.outcome) }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums">{{ +v.orderAmount > 0 ? '₹' + inr(v.orderAmount) : '—' }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums text-emerald-700">{{ +v.collectedAmount > 0 ? '₹' + inr(v.collectedAmount) : '—' }}</td>
                        <td class="px-4 py-2.5 text-[12px] text-gray-500 max-w-[16rem]">{{ v.note || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        <!-- ══ EXPENSES / TA-DA approvals ═══════════════════════════════ -->
        @if (tab() === 'expenses') {
          <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex flex-wrap items-center gap-2">
            <label class="text-[11px] font-semibold text-gray-400 uppercase mr-1">Status</label>
            @for (s of ['pending','approved','rejected','']; track s) {
              <button (click)="expenseStatus = $any(s); loadExpenses()"
                class="px-3 py-1.5 rounded-lg text-[13px] font-semibold capitalize"
                [class.bg-indigo-600]="expenseStatus === s" [class.text-white]="expenseStatus === s"
                [class.bg-gray-100]="expenseStatus !== s" [class.text-gray-600]="expenseStatus !== s">{{ s === '' ? 'All' : s }}</button>
            }
            <div class="flex-1"></div>
            @if (pendingExpenseTotal() > 0) {
              <div class="text-right">
                <p class="text-[11px] text-gray-400 uppercase font-semibold">Pending payout</p>
                <p class="text-lg font-bold tabular-nums text-amber-600">₹{{ inr(pendingExpenseTotal()) }}</p>
              </div>
            }
          </div>
          @if (expensesError()) { <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4">{{ expensesError() }}</div> }
          @if (expensesLoading()) { <p class="text-sm text-gray-400 py-8 text-center">Loading expenses…</p> }
          @else if (!expenses().length) {
            <div class="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">No expense claims for this filter.</div>
          } @else {
            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 text-[11px] uppercase text-gray-400">
                  <tr>
                    <th class="px-4 py-2.5 text-left font-semibold">Salesman</th>
                    <th class="px-4 py-2.5 text-left font-semibold">Category</th>
                    <th class="px-4 py-2.5 text-left font-semibold">Date</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Amount</th>
                    <th class="px-4 py-2.5 text-left font-semibold">Note</th>
                    <th class="px-4 py-2.5 text-left font-semibold">Status</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  @for (e of expenses(); track e.id) {
                    <tr class="hover:bg-gray-50">
                      <td class="px-4 py-2.5 font-semibold text-gray-800">{{ e.salesmanName || '—' }}</td>
                      <td class="px-4 py-2.5 capitalize text-gray-600">{{ e.category }}{{ e.distanceKm ? ' · ' + e.distanceKm + ' km' : '' }}</td>
                      <td class="px-4 py-2.5 text-[12px] text-gray-500 whitespace-nowrap">{{ fmtDate(e.day) }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums font-semibold">₹{{ inr(e.amount) }}</td>
                      <td class="px-4 py-2.5 text-[12px] text-gray-500 max-w-[14rem]">{{ e.note || '—' }}</td>
                      <td class="px-4 py-2.5">
                        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                          [class.bg-emerald-100]="e.status === 'approved'" [class.text-emerald-700]="e.status === 'approved'"
                          [class.bg-red-100]="e.status === 'rejected'" [class.text-red-700]="e.status === 'rejected'"
                          [class.bg-amber-100]="e.status === 'pending'" [class.text-amber-700]="e.status === 'pending'">{{ e.status }}</span>
                      </td>
                      <td class="px-4 py-2.5 text-right whitespace-nowrap">
                        @if (e.status === 'pending') {
                          <button (click)="reviewExpense(e.id, 'approved')" [disabled]="reviewingExpense() === e.id"
                            class="text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-40 mr-3">Approve</button>
                          <button (click)="reviewExpense(e.id, 'rejected')" [disabled]="reviewingExpense() === e.id"
                            class="text-[12px] font-semibold text-red-500 hover:text-red-600 disabled:opacity-40">Reject</button>
                        } @else {
                          <span class="text-[12px] text-gray-300">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <!-- ══ FOLLOW-UPS (promise-to-pay) ══════════════════════════════ -->
        @if (tab() === 'followups') {
          <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex flex-wrap items-center gap-2">
            <label class="text-[11px] font-semibold text-gray-400 uppercase mr-1">Show</label>
            @for (s of ['due','open','all']; track s) {
              <button (click)="followScope = $any(s); loadFollowups()"
                class="px-3 py-1.5 rounded-lg text-[13px] font-semibold capitalize"
                [class.bg-indigo-600]="followScope === s" [class.text-white]="followScope === s"
                [class.bg-gray-100]="followScope !== s" [class.text-gray-600]="followScope !== s">{{ s === 'due' ? 'Due today' : s }}</button>
            }
          </div>
          @if (followError()) { <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4">{{ followError() }}</div> }
          @if (followLoading()) { <p class="text-sm text-gray-400 py-8 text-center">Loading follow-ups…</p> }
          @else if (!followups().length) {
            <div class="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">No promise-to-pay follow-ups for this filter.</div>
          } @else {
            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 text-[11px] uppercase text-gray-400">
                  <tr>
                    <th class="px-4 py-2.5 text-left font-semibold">Customer</th>
                    <th class="px-4 py-2.5 text-left font-semibold">Invoice</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Amount</th>
                    <th class="px-4 py-2.5 text-left font-semibold">Promised</th>
                    <th class="px-4 py-2.5 text-left font-semibold">Status</th>
                    <th class="px-4 py-2.5 text-left font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  @for (p of followups(); track p.id) {
                    <tr class="hover:bg-gray-50">
                      <td class="px-4 py-2.5">
                        <p class="font-semibold text-gray-800">{{ p.customerName || '—' }}</p>
                        <p class="text-[11px] text-gray-400">{{ p.customerPhone || '' }}</p>
                      </td>
                      <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ p.invoiceNumber || '—' }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums font-semibold">₹{{ inr(p.amount) }}</td>
                      <td class="px-4 py-2.5 text-[12px] whitespace-nowrap"
                        [class.text-red-600]="p.status === 'open' && isPast(p.promiseDate)"
                        [class.text-gray-500]="!(p.status === 'open' && isPast(p.promiseDate))">{{ fmtDate(p.promiseDate) }}</td>
                      <td class="px-4 py-2.5">
                        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          [class.bg-emerald-100]="p.status === 'kept'" [class.text-emerald-700]="p.status === 'kept'"
                          [class.bg-red-100]="p.status === 'broken'" [class.text-red-700]="p.status === 'broken'"
                          [class.bg-amber-100]="p.status === 'open'" [class.text-amber-700]="p.status === 'open'">{{ p.status }}</span>
                      </td>
                      <td class="px-4 py-2.5 text-[12px] text-gray-500 max-w-[16rem]">{{ p.note || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </main>
    </div>
  `,
})
export class FieldSalesComponent implements OnInit {
  private readonly sfa = inject(SfaService);

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'performance', label: 'Performance' },
    { id: 'salesmen', label: 'Salesmen' },
    { id: 'beats', label: 'Beats' },
    { id: 'targets', label: 'Targets' },
    { id: 'visits', label: 'Visits' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'followups', label: 'Follow-ups' },
  ];

  readonly tab = signal<Tab>('performance');

  // ── Shared date range (Performance + Visits) ────────────────────────────────
  readonly from = signal('');
  readonly to = signal('');
  fromInput = '';
  toInput = '';

  // ── Salesmen roster (shared across tabs) ────────────────────────────────────
  readonly salesmen = signal<any[]>([]);
  readonly salesmenLoading = signal(false);
  readonly salesmenError = signal('');

  // ── Performance tab ─────────────────────────────────────────────────────────
  readonly performance = signal<any[]>([]);
  readonly topProducts = signal<any[]>([]);
  readonly perfLoading = signal(false);
  readonly perfError = signal('');
  perfSalesman = '';

  // ── Salesmen tab ────────────────────────────────────────────────────────────
  addForm: { name: string; phone: string; route: string; area: string; code: string; email: string; password: string; createLogin: boolean } =
    { name: '', phone: '', route: '', area: '', code: '', email: '', password: '', createLogin: false };
  readonly addBusy = signal(false);
  readonly addFormError = signal('');
  readonly newLink = signal('');
  readonly copied = signal(false);

  // ── Beats tab ───────────────────────────────────────────────────────────────
  beatSalesman = '';
  readonly beat = signal<any[]>([]);
  readonly beatLoading = signal(false);
  readonly beatError = signal('');
  readonly beatEditing = signal(false);
  readonly beatBusy = signal(false);
  readonly beatCandidates = signal<any[]>([]);
  readonly beatSelected = signal<Set<string>>(new Set());
  beatQ = '';

  // ── Targets tab ─────────────────────────────────────────────────────────────
  targetSalesman = '';
  readonly targets = signal<any[]>([]);
  readonly targetsLoading = signal(false);
  readonly targetError = signal('');
  readonly targetBusy = signal(false);
  readonly targetFormError = signal('');
  targetForm: { month: string; amount: number | null; collection: number | null; visits: number | null } =
    { month: '', amount: null, collection: null, visits: null };

  // ── Visits tab ──────────────────────────────────────────────────────────────
  visitSalesman = '';
  readonly visits = signal<any[]>([]);
  readonly visitLoading = signal(false);
  readonly visitError = signal('');

  // ── Follow-ups tab (promise-to-pay across the team) ─────────────────────────
  followScope: 'all' | 'due' | 'open' = 'due';
  readonly followups = signal<any[]>([]);
  readonly followLoading = signal(false);
  readonly followError = signal('');

  ngOnInit() {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - 30);
    this.fromInput = this.ymd(past);
    this.toInput = this.ymd(today);
    this.from.set(this.fromInput);
    this.to.set(this.toInput);

    this.loadSalesmen();
    this.loadPerformance();
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  go(t: Tab) {
    this.tab.set(t);
    if (t === 'performance' && !this.performance().length) this.loadPerformance();
    if (t === 'visits' && !this.visits().length) this.loadVisits();
    if (t === 'expenses' && !this.expenses().length) this.loadExpenses();
    if (t === 'followups' && !this.followups().length) this.loadFollowups();
    if (!this.salesmen().length) this.loadSalesmen();
  }

  // ── Expenses / TA-DA approvals ──────────────────────────────────────────────
  readonly expenses = signal<any[]>([]);
  readonly expensesLoading = signal(false);
  readonly expensesError = signal('');
  expenseStatus: '' | 'pending' | 'approved' | 'rejected' = 'pending';
  readonly reviewingExpense = signal<string | null>(null);
  readonly pendingExpenseTotal = computed(() =>
    this.expenses().filter((e) => e.status === 'pending').reduce((s, e) => s + Number(e.amount || 0), 0));
  loadExpenses() {
    this.expensesLoading.set(true);
    this.expensesError.set('');
    this.sfa.managerExpenses({ status: this.expenseStatus || undefined, salesmanId: this.perfSalesman || undefined }).subscribe({
      next: (r) => { this.expenses.set(r || []); this.expensesLoading.set(false); },
      error: (e) => { this.expensesError.set(this.msg(e, 'Could not load expenses.')); this.expensesLoading.set(false); },
    });
  }
  reviewExpense(id: string, status: 'approved' | 'rejected') {
    if (this.reviewingExpense()) return;
    this.reviewingExpense.set(id);
    this.sfa.reviewExpense(id, status).subscribe({
      next: () => { this.reviewingExpense.set(null); this.loadExpenses(); },
      error: () => { this.reviewingExpense.set(null); },
    });
  }

  // ── Follow-ups ──────────────────────────────────────────────────────────────
  loadFollowups() {
    this.followLoading.set(true);
    this.followError.set('');
    this.sfa.promises(this.followScope).subscribe({
      next: (r) => { this.followups.set(r || []); this.followLoading.set(false); },
      error: (e) => { this.followError.set(this.msg(e, 'Could not load follow-ups.')); this.followLoading.set(false); },
    });
  }

  // ── Salesmen roster ─────────────────────────────────────────────────────────
  loadSalesmen() {
    this.salesmenLoading.set(true);
    this.sfa.listSalesmen().subscribe({
      next: (r) => { this.salesmen.set(r || []); this.salesmenLoading.set(false); },
      error: (e) => { this.salesmenError.set(this.msg(e, 'Could not load salesmen.')); this.salesmenLoading.set(false); },
    });
  }

  // ── Performance ─────────────────────────────────────────────────────────────
  applyPerformance() {
    this.from.set(this.fromInput);
    this.to.set(this.toInput);
    this.loadPerformance();
  }
  loadPerformance() {
    const q = { from: this.from(), to: this.to(), salesmanId: this.perfSalesman || undefined };
    this.perfLoading.set(true);
    this.perfError.set('');
    this.sfa.performance(q).subscribe({
      next: (r) => { this.performance.set(r || []); this.perfLoading.set(false); },
      error: (e) => { this.perfError.set(this.msg(e, 'Could not load performance.')); this.perfLoading.set(false); },
    });
    this.sfa.topProducts(q).subscribe({
      next: (r) => this.topProducts.set(r || []),
      error: () => this.topProducts.set([]),
    });
  }
  achievement(r: any): number | null {
    const target = Number(r?.targetAmount) || 0;
    if (target <= 0) return null;
    return Math.round((Number(r?.orderValue) || 0) / target * 100);
  }

  // ── Salesmen management ─────────────────────────────────────────────────────
  submitSalesman() {
    this.addFormError.set('');
    if (!this.addForm.name.trim() || !this.addForm.phone.trim()) {
      this.addFormError.set('Name and phone are required.');
      return;
    }
    this.addBusy.set(true);
    this.newLink.set('');
    this.sfa.addSalesman({
      name: this.addForm.name.trim(),
      phone: this.addForm.phone.trim(),
      route: this.addForm.route.trim() || undefined,
      area: this.addForm.area.trim() || undefined,
      code: this.addForm.code.trim() || undefined,
      email: this.addForm.createLogin ? (this.addForm.email.trim() || undefined) : undefined,
      password: this.addForm.createLogin ? (this.addForm.password || undefined) : undefined,
      createLogin: this.addForm.createLogin,
    }).subscribe({
      next: (r) => {
        this.addBusy.set(false);
        if (r?.webviewPath) this.newLink.set(this.origin() + r.webviewPath);
        this.addForm = { name: '', phone: '', route: '', area: '', code: '', email: '', password: '', createLogin: false };
        this.loadSalesmen();
      },
      error: (e) => { this.addBusy.set(false); this.addFormError.set(this.msg(e, 'Could not add salesman.')); },
    });
  }
  toggleActive(s: any) {
    const next = !s.isActive;
    this.sfa.updateSalesman(s.id, { isActive: next }).subscribe({
      next: () => { s.isActive = next; },
      error: (e) => this.salesmenError.set(this.msg(e, 'Could not update salesman.')),
    });
  }
  rotate(s: any) {
    this.sfa.updateSalesman(s.id, { rotateToken: true }).subscribe({
      next: (r) => {
        if (r?.accessToken) s.accessToken = r.accessToken;
        if (r?.webviewPath) { this.newLink.set(this.origin() + r.webviewPath); this.copy(this.newLink()); }
        this.loadSalesmen();
      },
      error: (e) => this.salesmenError.set(this.msg(e, 'Could not rotate link.')),
    });
  }
  linkFor(s: any): string {
    return this.origin() + (s.webviewPath || `/m/sales?t=${s.id}&token=${s.accessToken || ''}`);
  }

  // ── Beats ───────────────────────────────────────────────────────────────────
  loadBeat() {
    this.beatEditing.set(false);
    this.beat.set([]);
    this.beatError.set('');
    if (!this.beatSalesman) return;
    this.beatLoading.set(true);
    this.sfa.getBeat(this.beatSalesman).subscribe({
      next: (r) => { this.beat.set(r || []); this.beatLoading.set(false); },
      error: (e) => { this.beatError.set(this.msg(e, 'Could not load beat.')); this.beatLoading.set(false); },
    });
  }
  startEditBeat() {
    // Seed selection from the current beat.
    const seed = new Set<string>((this.beat() || []).map((c: any) => String(c.customerId)));
    this.beatSelected.set(seed);
    this.beatQ = '';
    this.beatEditing.set(true);
    this.searchBeatCustomers();
  }
  searchBeatCustomers() {
    this.sfa.appCustomers(this.beatQ || undefined).subscribe({
      next: (r) => this.beatCandidates.set(r || []),
      error: () => this.beatCandidates.set([]),
    });
  }
  toggleBeatCustomer(id: string) {
    const next = new Set(this.beatSelected());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.beatSelected.set(next);
  }
  saveBeat() {
    if (!this.beatSalesman) return;
    this.beatBusy.set(true);
    this.sfa.setBeat(this.beatSalesman, Array.from(this.beatSelected())).subscribe({
      next: () => { this.beatBusy.set(false); this.beatEditing.set(false); this.loadBeat(); },
      error: (e) => { this.beatBusy.set(false); this.beatError.set(this.msg(e, 'Could not save beat.')); },
    });
  }

  // ── Targets ─────────────────────────────────────────────────────────────────
  loadTargets() {
    this.targets.set([]);
    this.targetError.set('');
    if (!this.targetSalesman) return;
    this.targetsLoading.set(true);
    this.sfa.getTargets(this.targetSalesman).subscribe({
      next: (r) => { this.targets.set(r || []); this.targetsLoading.set(false); },
      error: (e) => { this.targetError.set(this.msg(e, 'Could not load targets.')); this.targetsLoading.set(false); },
    });
  }
  saveTarget() {
    this.targetFormError.set('');
    if (!this.targetSalesman) { this.targetFormError.set('Pick a salesman first.'); return; }
    if (!this.targetForm.month) { this.targetFormError.set('Choose a month.'); return; }
    // month input gives 'YYYY-MM' → first-of-month 'YYYY-MM-01'.
    const periodMonth = `${this.targetForm.month}-01`;
    this.targetBusy.set(true);
    this.sfa.setTarget(this.targetSalesman, {
      periodMonth,
      targetAmount: this.targetForm.amount != null ? Number(this.targetForm.amount) : undefined,
      targetCollection: this.targetForm.collection != null ? Number(this.targetForm.collection) : undefined,
      targetVisits: this.targetForm.visits != null ? Number(this.targetForm.visits) : undefined,
    }).subscribe({
      next: () => {
        this.targetBusy.set(false);
        this.targetForm = { month: '', amount: null, collection: null, visits: null };
        this.loadTargets();
      },
      error: (e) => { this.targetBusy.set(false); this.targetFormError.set(this.msg(e, 'Could not save target.')); },
    });
  }

  // ── Visits ──────────────────────────────────────────────────────────────────
  applyVisits() {
    this.from.set(this.fromInput);
    this.to.set(this.toInput);
    this.loadVisits();
  }
  loadVisits() {
    this.visitLoading.set(true);
    this.visitError.set('');
    this.sfa.reportVisits({ from: this.from(), to: this.to(), salesmanId: this.visitSalesman || undefined }).subscribe({
      next: (r) => { this.visits.set(r || []); this.visitLoading.set(false); },
      error: (e) => { this.visitError.set(this.msg(e, 'Could not load visits.')); this.visitLoading.set(false); },
    });
  }

  // ── Clipboard ───────────────────────────────────────────────────────────────
  copy(text: string) {
    if (!text) return;
    try {
      navigator.clipboard?.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch { /* clipboard may be unavailable */ }
  }

  // ── Formatting helpers ──────────────────────────────────────────────────────
  private origin(): string {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
  private ymd(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  inr(n: any): string {
    return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  inrQty(n: any): string {
    return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  fmtDate(v: any): string {
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  }
  isPast(v: any): boolean {
    const d = new Date(v);
    return !isNaN(d.getTime()) && d.setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  }
  /** Turn machine values like "order_taken" / "checked_in" into "Order taken". */
  human(v: any): string {
    const s = String(v ?? '').trim();
    if (!s) return '—';
    return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }
  fmtDateTime(v: any): string {
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  fmtMonth(v: any): string {
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v ?? '—') : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  private msg(e: any, fallback: string): string {
    return e?.error?.message || e?.message || fallback;
  }
}
