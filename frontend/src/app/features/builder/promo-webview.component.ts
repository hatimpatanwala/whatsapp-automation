import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

interface Taxon { id: string; name: string; }
interface Cust { id: string; name: string; phone: string; }

/**
 * Token-secured schemes & coupons editor, opened from WhatsApp (admin bot →
 * Schemes & Offers → Create / Manage). Create discounts, BOGO, free gifts &
 * coupon codes, target specific customers, pause/edit. Authenticated purely by
 * the ?token= query param; talks to the /m/promotions token endpoints.
 */
@Component({
  selector: 'wa-promo-webview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-24">
      <header class="sticky top-0 z-20 bg-green-600 text-white shadow">
        <div class="max-w-xl mx-auto px-4 py-3 flex items-center gap-2">
          <i class="pi pi-megaphone" style="font-size:1.05rem"></i>
          <h1 class="text-base font-semibold">Schemes & Offers</h1>
        </div>
        @if (token()) {
          <div class="max-w-xl mx-auto px-4 flex">
            <button class="flex-1 py-2.5 text-sm font-semibold border-b-2"
              [class.border-white]="tab() === 'schemes'" [class.border-transparent]="tab() !== 'schemes'"
              [class.opacity-70]="tab() !== 'schemes'" (click)="tab.set('schemes')">🎯 Offers</button>
            <button class="flex-1 py-2.5 text-sm font-semibold border-b-2"
              [class.border-white]="tab() === 'coupons'" [class.border-transparent]="tab() !== 'coupons'"
              [class.opacity-70]="tab() !== 'coupons'" (click)="tab.set('coupons')">🎟️ Coupons</button>
          </div>
        }
      </header>

      @if (!token()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">Missing or invalid link.</p>
          </div>
        </div>
      } @else if (loadError()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-exclamation-triangle text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ loadError() }}</p>
          </div>
        </div>
      } @else {
        <main class="max-w-xl mx-auto p-4 space-y-3">
          @if (loading()) {
            <p class="text-center text-sm text-gray-400 py-8"><i class="pi pi-spin pi-spinner mr-1"></i>Loading…</p>
          }

          <!-- ─── OFFERS TAB ─────────────────────────────────────────────── -->
          @if (tab() === 'schemes' && !loading()) {
            @if (!schemes().length) {
              <div class="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center">
                <p class="text-3xl mb-1">🎯</p>
                <p class="text-sm font-semibold text-gray-700">No offers yet</p>
                <p class="text-xs text-gray-400 mt-0.5">Create a discount, BOGO or free-gift offer.</p>
              </div>
            }
            @for (s of schemes(); track s.id) {
              <div class="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-semibold text-sm text-gray-900 truncate">{{ s.name }}</span>
                      <span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                        [class]="s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">{{ s.status }}</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-0.5">{{ describe(s) }}</p>
                    <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                      @if (s.type === 'cumulative') { <span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">⭐ Loyalty</span> }
                      @if (s.targetedCount > 0) {
                        <span class="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">👤 {{ s.targetedCount }} customer(s)</span>
                      }
                      @if (s.audience === 'segment') {
                        <span class="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">👥 {{ segmentLabel(s.audienceSegment) }}</span>
                      }
                      @if (s.type !== 'cumulative' && !s.combinable) { <span class="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">exclusive</span> }
                      @if (s.weight) { <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">priority {{ s.weight }}</span> }
                    </div>
                  </div>
                  <span class="shrink-0 text-green-700 font-bold text-sm whitespace-nowrap">{{ badge(s) }}</span>
                </div>
                <div class="flex items-center gap-4 mt-3 pt-2.5 border-t border-gray-100 text-xs">
                  <button class="text-gray-600 font-medium" (click)="toggle(s)">{{ s.status === 'active' ? '⏸ Pause' : '▶ Activate' }}</button>
                  <button class="text-green-700 font-medium" (click)="openEdit(s)">✏️ Edit</button>
                  <button class="text-red-500 font-medium ml-auto" (click)="remove(s)">🗑 Delete</button>
                </div>
              </div>
            }
          }

          <!-- ─── COUPONS TAB ────────────────────────────────────────────── -->
          @if (tab() === 'coupons' && !loading()) {
            @if (!coupons().length) {
              <div class="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center">
                <p class="text-3xl mb-1">🎟️</p>
                <p class="text-sm font-semibold text-gray-700">No coupons yet</p>
                <p class="text-xs text-gray-400 mt-0.5">Create a code customers can type at checkout.</p>
              </div>
            }
            @for (c of coupons(); track c.id) {
              <div class="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-mono font-bold text-sm text-gray-900">{{ c.code }}</span>
                      <span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                        [class]="c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">{{ c.status }}</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-0.5">{{ couponDesc(c) }}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">Used {{ c.usedCount || 0 }}{{ c.usageLimit ? ' / ' + c.usageLimit : '' }} · {{ c.perCustomerLimit || 1 }}/customer</p>
                  </div>
                  <span class="shrink-0 text-green-700 font-bold text-sm whitespace-nowrap">{{ couponBadge(c) }}</span>
                </div>
                <div class="flex items-center gap-4 mt-3 pt-2.5 border-t border-gray-100 text-xs">
                  <button class="text-gray-600 font-medium" (click)="toggleCoupon(c)">{{ c.status === 'active' ? '⏸ Pause' : '▶ Activate' }}</button>
                  <button class="text-green-700 font-medium" (click)="openEditCoupon(c)">✏️ Edit</button>
                  <button class="text-red-500 font-medium ml-auto" (click)="removeCoupon(c)">🗑 Delete</button>
                </div>
              </div>
            }
          }
        </main>

        <!-- Floating "new" button -->
        @if (!loading() && !loadError()) {
          <button class="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 bg-green-600 text-white font-semibold rounded-full shadow-lg px-6 py-3 text-sm"
            (click)="tab() === 'schemes' ? openNew() : openNewCoupon()">
            <i class="pi pi-plus mr-1"></i>{{ tab() === 'schemes' ? 'New Offer' : 'New Coupon' }}
          </button>
        }
      }

      <!-- ─── SCHEME DIALOG ──────────────────────────────────────────────── -->
      @if (dialogOpen) {
        <div class="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center" (click)="dialogOpen = false">
          <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <div class="sticky top-0 bg-white px-4 py-3 border-b flex items-center justify-between">
              <h2 class="font-semibold text-sm">{{ form.id ? 'Edit Offer' : 'New Offer' }}</h2>
              <button class="text-gray-400 text-xl leading-none" (click)="dialogOpen = false">&times;</button>
            </div>
            <div class="p-4 space-y-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Offer name *</label>
                <input [(ngModel)]="form.name" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Diwali 10% off" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Offer kind *</label>
                <select [(ngModel)]="form.kind" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="instant">Instant — applied at checkout</option>
                  <option value="cumulative">⭐ Loyalty — earn a reward over time</option>
                </select>
              </div>

              @if (!isLoyalty()) {
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Offer type *</label>
                <select [(ngModel)]="form.action" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  @for (a of actionTypes; track a.value) { <option [value]="a.value">{{ a.label }}</option> }
                </select>
              </div>
              }

              <!-- ── Loyalty / cumulative fields ── -->
              @if (isLoyalty()) {
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3">
                  <p class="text-xs text-amber-800">⭐ Customers accrue toward a target as they order. When they reach it, they automatically get a personal coupon over WhatsApp.</p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-gray-500 mb-1">Track</label>
                      <select [(ngModel)]="form.metric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="spend">Total spend (₹)</option>
                        <option value="orders">Number of orders</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-gray-500 mb-1">{{ form.metric === 'orders' ? 'Orders target *' : 'Spend target (₹) *' }}</label>
                      <input type="number" [(ngModel)]="form.target" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-gray-500 mb-1">Window</label>
                      <select [(ngModel)]="form.period" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="lifetime">Lifetime</option>
                        <option value="monthly">Every month</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-gray-500 mb-1">Min order to count <span class="text-gray-300">(opt)</span></label>
                      <input type="number" [(ngModel)]="form.minOrderValue" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="₹" />
                    </div>
                  </div>
                  <p class="text-xs font-semibold text-amber-800 pt-1">🎁 Reward coupon</p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                      <select [(ngModel)]="form.rDiscountType" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="percent">Percent (%)</option>
                        <option value="amount">Flat amount (₹)</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-gray-500 mb-1">Value *</label>
                      <input type="number" [(ngModel)]="form.rDiscountValue" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-gray-500 mb-1">Max discount cap <span class="text-gray-300">(opt)</span></label>
                      <input type="number" [(ngModel)]="form.rMaxDiscount" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="₹" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-gray-500 mb-1">Coupon valid for (days)</label>
                      <input type="number" [(ngModel)]="form.rValidDays" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                </div>
              }

              @if (!isLoyalty() && isDiscount()) {
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Discount type</label>
                    <select [(ngModel)]="form.discountType" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="percent">Percent (%)</option>
                      <option value="amount">Flat amount (₹)</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Value *</label>
                    <input type="number" [(ngModel)]="form.discountValue" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                @if (form.action === 'qty_discount') {
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Minimum quantity to qualify</label>
                    <input type="number" [(ngModel)]="form.minQty" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 3" />
                  </div>
                }
              }

              @if (!isLoyalty() && isFree()) {
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Buy quantity *</label>
                    <input type="number" [(ngModel)]="form.buyQty" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Get free quantity *</label>
                    <input type="number" [(ngModel)]="form.getQty" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                @if (form.action === 'buy_x_get_y_free') {
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Free product *</label>
                    <select [(ngModel)]="form.getProductId" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="">Choose the free product…</option>
                      @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                    </select>
                  </div>
                }
              }

              @if (!isLoyalty()) {
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Applies to</label>
                <select [(ngModel)]="form.scope" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="all">All products</option>
                  <option value="category">Specific categories</option>
                  <option value="brand">Specific brands</option>
                  <option value="product">Specific products</option>
                </select>
              </div>
              @if (form.scope !== 'all') {
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Choose {{ form.scope }}(s) *</label>
                  <div class="border border-gray-300 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
                    @for (o of scopeOptions(); track o.id) {
                      <label class="flex items-center gap-2 px-3 py-2 text-sm">
                        <input type="checkbox" [checked]="form.scopeIds.includes(o.id)" (change)="toggleId(form.scopeIds, o.id)" />
                        <span class="truncate">{{ o.name }}</span>
                      </label>
                    }
                  </div>
                </div>
              }

              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Minimum cart value <span class="text-gray-300">(optional)</span></label>
                <input type="number" [(ngModel)]="form.minCartValue" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 1000" />
              </div>
              }

              <!-- Audience targeting -->
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Who gets this offer</label>
                <select [(ngModel)]="form.audience" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="all">Everyone</option>
                  <option value="specific">Specific customers</option>
                  <option value="segment">Customer segment</option>
                </select>
              </div>
              @if (form.audience === 'segment') {
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Segment *</label>
                  <select [(ngModel)]="form.audienceSegment" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                    @for (s of segmentOptions; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
                  </select>
                </div>
              }
              @if (form.audience === 'specific') {
                <div>
                  <input [(ngModel)]="custFilter" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-1.5" placeholder="Search customers…" />
                  <div class="border border-gray-300 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
                    @for (c of filteredCustomers(); track c.id) {
                      <label class="flex items-center gap-2 px-3 py-2 text-sm">
                        <input type="checkbox" [checked]="form.customerIds.includes(c.id)" (change)="toggleId(form.customerIds, c.id)" />
                        <span class="truncate">{{ c.name }} <span class="text-gray-400">{{ c.phone }}</span></span>
                      </label>
                    }
                    @if (!filteredCustomers().length) { <p class="px-3 py-2 text-xs text-gray-400">No matches.</p> }
                  </div>
                  <p class="text-[10px] text-gray-400 mt-1">{{ form.customerIds.length }} selected</p>
                </div>
              }

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Valid from</label>
                  <input type="date" [(ngModel)]="form.validFrom" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Valid until</label>
                  <input type="date" [(ngModel)]="form.validUntil" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Priority <span class="text-gray-300">(higher wins)</span></label>
                  <input type="number" [(ngModel)]="form.weight" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                @if (!isLoyalty()) {
                  <label class="flex items-center gap-2 text-sm pb-2">
                    <input type="checkbox" [(ngModel)]="form.combinable" />
                    <span>Can stack with other offers</span>
                  </label>
                }
              </div>
            </div>
            <div class="sticky bottom-0 bg-white px-4 py-3 border-t flex gap-2">
              <button class="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium" (click)="dialogOpen = false">Cancel</button>
              <button class="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
                [disabled]="!valid() || saving()" (click)="save()">{{ saving() ? 'Saving…' : 'Save Offer' }}</button>
            </div>
          </div>
        </div>
      }

      <!-- ─── COUPON DIALOG ──────────────────────────────────────────────── -->
      @if (couponDialog) {
        <div class="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center" (click)="couponDialog = false">
          <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <div class="sticky top-0 bg-white px-4 py-3 border-b flex items-center justify-between">
              <h2 class="font-semibold text-sm">{{ cForm.id ? 'Edit Coupon' : 'New Coupon' }}</h2>
              <button class="text-gray-400 text-xl leading-none" (click)="couponDialog = false">&times;</button>
            </div>
            <div class="p-4 space-y-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Coupon code *</label>
                <input [(ngModel)]="cForm.code" (input)="upperCode()" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" placeholder="e.g. SAVE20" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Discount type</label>
                  <select [(ngModel)]="cForm.discountType" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="percent">Percent (%)</option>
                    <option value="amount">Flat amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Value *</label>
                  <input type="number" [(ngModel)]="cForm.discountValue" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Min cart value</label>
                  <input type="number" [(ngModel)]="cForm.minCartValue" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="optional" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Max discount cap</label>
                  <input type="number" [(ngModel)]="cForm.maxDiscount" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="optional" />
                </div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Applies to</label>
                <select [(ngModel)]="cForm.scope" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="all">All products</option>
                  <option value="category">Specific categories</option>
                  <option value="brand">Specific brands</option>
                  <option value="product">Specific products</option>
                </select>
              </div>
              @if (cForm.scope !== 'all') {
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Choose {{ cForm.scope }}(s) *</label>
                  <div class="border border-gray-300 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
                    @for (o of couponScopeOptions(); track o.id) {
                      <label class="flex items-center gap-2 px-3 py-2 text-sm">
                        <input type="checkbox" [checked]="cForm.scopeIds.includes(o.id)" (change)="toggleId(cForm.scopeIds, o.id)" />
                        <span class="truncate">{{ o.name }}</span>
                      </label>
                    }
                  </div>
                </div>
              }
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Total usage limit</label>
                  <input type="number" [(ngModel)]="cForm.usageLimit" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="unlimited" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Per customer</label>
                  <input type="number" [(ngModel)]="cForm.perCustomerLimit" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Valid from</label>
                  <input type="date" [(ngModel)]="cForm.validFrom" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Valid until</label>
                  <input type="date" [(ngModel)]="cForm.validUntil" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <div class="sticky bottom-0 bg-white px-4 py-3 border-t flex gap-2">
              <button class="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium" (click)="couponDialog = false">Cancel</button>
              <button class="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
                [disabled]="!couponValid() || savingCoupon()" (click)="saveCoupon()">{{ savingCoupon() ? 'Saving…' : 'Save Coupon' }}</button>
            </div>
          </div>
        </div>
      }

      @if (toastMsg()) {
        <div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white text-xs rounded-full px-4 py-2 shadow-lg">{{ toastMsg() }}</div>
      }
    </div>
  `,
})
export class PromoWebviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = environment.apiUrl;

  token = signal('');
  loading = signal(true);
  loadError = signal<string | null>(null);
  tab = signal<'schemes' | 'coupons'>('schemes');

  schemes = signal<any[]>([]);
  coupons = signal<any[]>([]);
  categories = signal<Taxon[]>([]);
  brands = signal<Taxon[]>([]);
  products = signal<Taxon[]>([]);
  customers = signal<Cust[]>([]);

  saving = signal(false);
  savingCoupon = signal(false);
  dialogOpen = false;
  couponDialog = false;
  custFilter = '';
  private _toast = signal('');
  toastMsg = computed(() => this._toast());

  actionTypes = [
    { label: 'Discount (% or ₹ off)', value: 'discount' },
    { label: 'Buy X get same free (BOGO)', value: 'buy_x_get_x_free' },
    { label: 'Buy X get another product free', value: 'buy_x_get_y_free' },
    { label: 'Buy N+ qty → discount', value: 'qty_discount' },
  ];

  form: any = this.blankForm();
  cForm: any = this.blankCoupon();

  constructor() {
    this.http = new HttpClient(inject(HttpBackend));
  }

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token') || '';
    this.token.set(t);
    if (!t) { this.loading.set(false); return; }
    this.bootstrap();
  }

  // backend always wraps in { success, data }; HttpBackend bypasses the unwrap interceptor.
  private unwrap<T>(r: any): T { return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T; }
  private opts() { return { headers: { 'X-Builder-Token': this.token() } }; }

  isDiscount(): boolean { return ['discount', 'qty_discount'].includes(this.form.action); }
  isFree(): boolean { return ['buy_x_get_x_free', 'buy_x_get_y_free'].includes(this.form.action); }

  scopeOptions(): Taxon[] {
    return this.form.scope === 'category' ? this.categories()
      : this.form.scope === 'brand' ? this.brands()
      : this.form.scope === 'product' ? this.products() : [];
  }
  couponScopeOptions(): Taxon[] {
    return this.cForm.scope === 'category' ? this.categories()
      : this.cForm.scope === 'brand' ? this.brands()
      : this.cForm.scope === 'product' ? this.products() : [];
  }
  filteredCustomers(): Cust[] {
    const q = this.custFilter.trim().toLowerCase();
    if (!q) return this.customers();
    return this.customers().filter((c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q));
  }

  toggleId(arr: string[], id: string): void {
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
  }

  private toast(msg: string): void {
    this._toast.set(msg);
    setTimeout(() => this._toast.set(''), 2200);
  }

  private bootstrap(): void {
    this.loading.set(true);
    this.http.get<any>(`${this.base}/m/promotions/bootstrap`, this.opts()).subscribe({
      next: (r) => {
        const d = this.unwrap<any>(r) || {};
        this.schemes.set((d.schemes || []).map(this.normalizeScheme));
        this.coupons.set((d.coupons || []).map(this.normalizeCoupon));
        const tax = d.taxonomy || {};
        this.categories.set(tax.categories || []);
        this.brands.set(tax.brands || []);
        this.products.set(tax.products || []);
        this.customers.set(tax.customers || []);
        this.loading.set(false);
      },
      error: (e) => { this.loading.set(false); this.loadError.set(e?.error?.message || 'This link is invalid or has expired.'); },
    });
  }

  private reloadSchemes(): void {
    this.http.get<any>(`${this.base}/m/promotions/schemes`, this.opts()).subscribe({
      next: (r) => this.schemes.set((this.unwrap<any[]>(r) || []).map(this.normalizeScheme)),
    });
  }
  private reloadCoupons(): void {
    this.http.get<any>(`${this.base}/m/promotions/coupons`, this.opts()).subscribe({
      next: (r) => this.coupons.set((this.unwrap<any[]>(r) || []).map(this.normalizeCoupon)),
    });
  }

  private normalizeScheme = (s: any): any => ({
    ...s,
    scopeIds: s.scopeIds ?? s.scope_ids ?? [],
    customerIds: s.customerIds ?? s.customer_ids ?? [],
    targetedCount: s.targetedCount ?? s.targeted_count ?? 0,
    conditions: typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {}),
    reward: typeof s.reward === 'string' ? JSON.parse(s.reward) : (s.reward || {}),
    validFrom: s.validFrom ?? s.valid_from ?? null,
    validUntil: s.validUntil ?? s.valid_until ?? null,
  });
  private normalizeCoupon = (c: any): any => ({
    ...c,
    scopeIds: c.scopeIds ?? c.scope_ids ?? [],
    discountType: c.discountType ?? c.discount_type ?? 'percent',
    discountValue: c.discountValue ?? c.discount_value ?? 0,
    minCartValue: c.minCartValue ?? c.min_cart_value ?? 0,
    maxDiscount: c.maxDiscount ?? c.max_discount ?? null,
    usageLimit: c.usageLimit ?? c.usage_limit ?? null,
    perCustomerLimit: c.perCustomerLimit ?? c.per_customer_limit ?? 1,
    usedCount: c.usedCount ?? c.used_count ?? 0,
    validFrom: c.validFrom ?? c.valid_from ?? null,
    validUntil: c.validUntil ?? c.valid_until ?? null,
  });

  // ─── Scheme form ───────────────────────────────────────────────────────────
  segmentOptions = [
    { value: 'high_orders', label: 'High-order customers (3+)' },
    { value: 'low_orders', label: 'Low-order customers (1–2)' },
    { value: 'repeat', label: 'Repeat customers' },
    { value: 'new', label: 'New customers (30 days)' },
    { value: 'inactive', label: 'Inactive customers (60+ days)' },
    { value: 'pending_cart', label: 'Pending-cart customers' },
  ];

  blankForm() {
    return {
      id: '', name: '', kind: 'instant', action: 'discount',
      discountType: 'percent', discountValue: 10,
      scope: 'all', scopeIds: [] as string[], minQty: null, minCartValue: null,
      buyQty: 2, getQty: 1, getProductId: '',
      audience: 'all', audienceSegment: 'repeat', customerIds: [] as string[],
      weight: 0, combinable: false, validFrom: '', validUntil: '',
      // Loyalty (cumulative) fields
      metric: 'spend', target: 10000, period: 'lifetime', minOrderValue: null,
      rDiscountType: 'percent', rDiscountValue: 10, rMaxDiscount: null, rValidDays: 30,
    };
  }

  isLoyalty(): boolean { return this.form.kind === 'cumulative'; }
  segmentLabel(key: string): string { return this.segmentOptions.find((s) => s.value === key)?.label || key; }

  valid(): boolean {
    if (!this.form.name?.trim()) return false;
    if (this.form.audience === 'specific' && !this.form.customerIds.length) return false;
    if (this.form.audience === 'segment' && !this.form.audienceSegment) return false;
    if (this.isLoyalty()) {
      return Number(this.form.target) > 0 && Number(this.form.rDiscountValue) > 0;
    }
    if (this.form.scope !== 'all' && !this.form.scopeIds.length) return false;
    if (this.isDiscount()) return Number(this.form.discountValue) > 0;
    if (this.form.action === 'buy_x_get_x_free') return Number(this.form.buyQty) > 0 && Number(this.form.getQty) > 0;
    if (this.form.action === 'buy_x_get_y_free') return Number(this.form.buyQty) > 0 && Number(this.form.getQty) > 0 && !!this.form.getProductId;
    return false;
  }

  openNew() { this.form = this.blankForm(); this.custFilter = ''; this.dialogOpen = true; }

  openEdit(s: any) {
    const c = s.conditions || {};
    const r = s.reward || {};
    this.form = {
      id: s.id, name: s.name, kind: s.type === 'cumulative' ? 'cumulative' : 'instant',
      action: s.action || 'discount',
      discountType: c.discountType || 'percent', discountValue: c.discountValue ?? 0,
      scope: s.scope, scopeIds: [...(s.scopeIds || [])],
      minQty: c.minQty ?? null, minCartValue: c.minCartValue ?? null,
      buyQty: c.buyQty ?? 2, getQty: c.getQty ?? 1, getProductId: c.getProductId || '',
      audience: s.audience || 'all', audienceSegment: s.audienceSegment ?? s.audience_segment ?? 'repeat', customerIds: [...(s.customerIds || [])],
      weight: s.weight ?? 0, combinable: !!s.combinable,
      validFrom: (s.validFrom || '').slice(0, 10), validUntil: (s.validUntil || '').slice(0, 10),
      metric: c.metric || 'spend', target: c.target ?? 10000, period: c.period || 'lifetime', minOrderValue: c.minOrderValue ?? null,
      rDiscountType: r.discountType || 'percent', rDiscountValue: r.discountValue ?? 10,
      rMaxDiscount: r.maxDiscount ?? null, rValidDays: r.validDays ?? 30,
    };
    this.custFilter = '';
    this.dialogOpen = true;
  }

  save() {
    if (this.isLoyalty()) return this.saveLoyalty();
    const conditions: any = {};
    if (this.isDiscount()) {
      conditions.discountType = this.form.discountType;
      conditions.discountValue = Number(this.form.discountValue) || 0;
      if (this.form.minQty) conditions.minQty = Number(this.form.minQty);
    } else if (this.form.action === 'buy_x_get_x_free') {
      conditions.buyQty = Number(this.form.buyQty) || 1; conditions.getQty = Number(this.form.getQty) || 1;
    } else if (this.form.action === 'buy_x_get_y_free') {
      conditions.buyQty = Number(this.form.buyQty) || 1; conditions.getQty = Number(this.form.getQty) || 1;
      conditions.getProductId = this.form.getProductId;
    }
    if (this.form.minCartValue) conditions.minCartValue = Number(this.form.minCartValue);

    const payload: any = {
      name: this.form.name.trim(), type: 'instant', action: this.form.action, scope: this.form.scope,
      scopeIds: this.form.scope === 'all' ? [] : this.form.scopeIds, conditions,
      weight: Number(this.form.weight) || 0, combinable: !!this.form.combinable,
      audience: this.form.audience, audienceSegment: this.form.audience === 'segment' ? this.form.audienceSegment : null, customerIds: this.form.audience === 'specific' ? this.form.customerIds : [],
      validFrom: this.form.validFrom || null, validUntil: this.form.validUntil || null, status: 'active',
    };
    this.saving.set(true);
    const url = `${this.base}/m/promotions/schemes${this.form.id ? '/' + this.form.id : ''}`;
    const req = this.form.id ? this.http.put<any>(url, payload, this.opts()) : this.http.post<any>(url, payload, this.opts());
    req.subscribe({
      next: () => { this.saving.set(false); this.dialogOpen = false; this.reloadSchemes(); this.toast('Offer saved ✓'); },
      error: (e) => { this.saving.set(false); this.toast(e?.error?.message || 'Could not save offer.'); },
    });
  }

  private saveLoyalty() {
    const conditions: any = {
      metric: this.form.metric, target: Number(this.form.target) || 0, period: this.form.period,
    };
    if (this.form.minOrderValue) conditions.minOrderValue = Number(this.form.minOrderValue);
    const reward: any = {
      type: 'coupon', discountType: this.form.rDiscountType, discountValue: Number(this.form.rDiscountValue) || 0,
      validDays: Number(this.form.rValidDays) || 30,
    };
    if (this.form.rMaxDiscount) reward.maxDiscount = Number(this.form.rMaxDiscount);
    const payload: any = {
      name: this.form.name.trim(), type: 'cumulative', action: 'loyalty', scope: 'all', scopeIds: [],
      conditions, reward, weight: Number(this.form.weight) || 0, combinable: false,
      audience: this.form.audience, audienceSegment: this.form.audience === 'segment' ? this.form.audienceSegment : null, customerIds: this.form.audience === 'specific' ? this.form.customerIds : [],
      validFrom: this.form.validFrom || null, validUntil: this.form.validUntil || null, status: 'active',
    };
    this.saving.set(true);
    const url = `${this.base}/m/promotions/schemes${this.form.id ? '/' + this.form.id : ''}`;
    const req = this.form.id ? this.http.put<any>(url, payload, this.opts()) : this.http.post<any>(url, payload, this.opts());
    req.subscribe({
      next: () => { this.saving.set(false); this.dialogOpen = false; this.reloadSchemes(); this.toast('Loyalty offer saved ✓'); },
      error: (e) => { this.saving.set(false); this.toast(e?.error?.message || 'Could not save offer.'); },
    });
  }

  toggle(s: any) {
    this.http.patch<any>(`${this.base}/m/promotions/schemes/${s.id}/status`, { status: s.status === 'active' ? 'paused' : 'active' }, this.opts())
      .subscribe({ next: () => this.reloadSchemes() });
  }
  remove(s: any) {
    if (!confirm(`Delete offer "${s.name}"?`)) return;
    this.http.delete<any>(`${this.base}/m/promotions/schemes/${s.id}`, this.opts())
      .subscribe({ next: () => { this.reloadSchemes(); this.toast('Offer deleted'); } });
  }

  badge(s: any): string {
    const c = s.conditions || {};
    if (s.type === 'cumulative') {
      const r = s.reward || {};
      return r.discountType === 'amount' ? `₹${r.discountValue} reward` : `${r.discountValue || 0}% reward`;
    }
    if (s.action === 'buy_x_get_x_free') return `Buy ${c.buyQty || 1} Get ${c.getQty || 1}`;
    if (s.action === 'buy_x_get_y_free') return `🎁 Free`;
    return c.discountType === 'amount' ? `₹${c.discountValue} OFF` : `${c.discountValue || 0}% OFF`;
  }
  describe(s: any): string {
    const c = s.conditions || {};
    if (s.type === 'cumulative') {
      const tgt = c.metric === 'orders' ? `${c.target} orders` : `₹${c.target} spent`;
      const win = c.period === 'monthly' ? '/month' : ' (lifetime)';
      return `⭐ Loyalty · reach ${tgt}${win} → earn a coupon`;
    }
    const scopeText = s.scope === 'all' ? 'all products'
      : s.scope === 'category' ? `${(s.scopeIds || []).length} category(ies)`
      : s.scope === 'brand' ? `${(s.scopeIds || []).length} brand(s)`
      : `${(s.scopeIds || []).length} product(s)`;
    let action = '';
    if (s.action === 'buy_x_get_x_free') action = `Buy ${c.buyQty || 1} get ${c.getQty || 1} free · `;
    else if (s.action === 'buy_x_get_y_free') action = `Buy ${c.buyQty || 1} → free gift · `;
    const cond = [];
    if (c.minQty) cond.push(`min ${c.minQty} qty`);
    if (c.minCartValue) cond.push(`min ₹${c.minCartValue} cart`);
    return `${action}On ${scopeText}${cond.length ? ' · ' + cond.join(', ') : ''}`;
  }

  // ─── Coupon form ───────────────────────────────────────────────────────────
  blankCoupon() {
    return {
      id: '', code: '', discountType: 'percent', discountValue: 10,
      minCartValue: null, maxDiscount: null, scope: 'all', scopeIds: [] as string[],
      usageLimit: null, perCustomerLimit: 1, validFrom: '', validUntil: '', status: 'active',
    };
  }
  upperCode() { this.cForm.code = (this.cForm.code || '').toUpperCase(); }
  couponValid(): boolean {
    return !!this.cForm.code?.trim() && Number(this.cForm.discountValue) > 0 &&
      (this.cForm.scope === 'all' || this.cForm.scopeIds.length > 0);
  }
  openNewCoupon() { this.cForm = this.blankCoupon(); this.couponDialog = true; }
  openEditCoupon(c: any) {
    this.cForm = {
      id: c.id, code: c.code, discountType: c.discountType, discountValue: c.discountValue,
      minCartValue: c.minCartValue || null, maxDiscount: c.maxDiscount ?? null,
      scope: c.scope || 'all', scopeIds: [...(c.scopeIds || [])],
      usageLimit: c.usageLimit ?? null, perCustomerLimit: c.perCustomerLimit || 1,
      validFrom: (c.validFrom || '').slice(0, 10), validUntil: (c.validUntil || '').slice(0, 10),
      status: c.status || 'active',
    };
    this.couponDialog = true;
  }
  saveCoupon() {
    const payload: any = {
      code: this.cForm.code.trim().toUpperCase(),
      discountType: this.cForm.discountType, discountValue: Number(this.cForm.discountValue) || 0,
      minCartValue: Number(this.cForm.minCartValue) || 0,
      maxDiscount: this.cForm.maxDiscount ? Number(this.cForm.maxDiscount) : null,
      scope: this.cForm.scope, scopeIds: this.cForm.scope === 'all' ? [] : this.cForm.scopeIds,
      usageLimit: this.cForm.usageLimit ? Number(this.cForm.usageLimit) : null,
      perCustomerLimit: Number(this.cForm.perCustomerLimit) || 1, audience: 'all',
      validFrom: this.cForm.validFrom || null, validUntil: this.cForm.validUntil || null, status: this.cForm.status,
    };
    this.savingCoupon.set(true);
    const url = `${this.base}/m/promotions/coupons${this.cForm.id ? '/' + this.cForm.id : ''}`;
    const req = this.cForm.id ? this.http.put<any>(url, payload, this.opts()) : this.http.post<any>(url, payload, this.opts());
    req.subscribe({
      next: () => { this.savingCoupon.set(false); this.couponDialog = false; this.reloadCoupons(); this.toast('Coupon saved ✓'); },
      error: (e) => { this.savingCoupon.set(false); this.toast(e?.error?.message || 'Could not save coupon.'); },
    });
  }
  toggleCoupon(c: any) {
    this.http.patch<any>(`${this.base}/m/promotions/coupons/${c.id}/status`, { status: c.status === 'active' ? 'paused' : 'active' }, this.opts())
      .subscribe({ next: () => this.reloadCoupons() });
  }
  removeCoupon(c: any) {
    if (!confirm(`Delete coupon "${c.code}"?`)) return;
    this.http.delete<any>(`${this.base}/m/promotions/coupons/${c.id}`, this.opts())
      .subscribe({ next: () => { this.reloadCoupons(); this.toast('Coupon deleted'); } });
  }
  couponBadge(c: any): string {
    return c.discountType === 'amount' ? `₹${c.discountValue} OFF` : `${c.discountValue || 0}% OFF`;
  }
  couponDesc(c: any): string {
    const scope = c.scope === 'all' ? 'all products' : `${(c.scopeIds || []).length} ${c.scope}(s)`;
    const min = c.minCartValue || 0;
    return `On ${scope}${min > 0 ? ` · min ₹${min} cart` : ''}${c.maxDiscount ? ` · cap ₹${c.maxDiscount}` : ''}`;
  }
}
