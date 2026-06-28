import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { SchemeService, Scheme, Coupon } from '../../core/services/scheme.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-schemes',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule, SelectModule, MultiSelectModule,
    InputTextModule, InputNumberModule, ToggleSwitchModule, TagModule, ToastModule, TextareaModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-6xl mx-auto">
      <p-toast />

      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Schemes & Offers</h1>
          <p class="text-gray-500 text-sm mt-1">Offers auto-apply in the cart; coupons are codes customers enter.</p>
        </div>
        @if (tab() === 'schemes') {
          <button pButton label="New Scheme" icon="pi pi-plus" severity="success" (click)="openNew()"></button>
        } @else {
          <button pButton label="New Coupon" icon="pi pi-plus" severity="success" (click)="openNewCoupon()"></button>
        }
      </div>

      <div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        <button class="text-sm font-semibold rounded-lg py-1.5 px-4 border-0 cursor-pointer transition-all"
          [class.bg-white]="tab()==='schemes'" [class.shadow-sm]="tab()==='schemes'" [class.text-primary-600]="tab()==='schemes'" [class.bg-transparent]="tab()!=='schemes'" [class.text-gray-500]="tab()!=='schemes'"
          (click)="tab.set('schemes')">🏷️ Offers</button>
        <button class="text-sm font-semibold rounded-lg py-1.5 px-4 border-0 cursor-pointer transition-all"
          [class.bg-white]="tab()==='coupons'" [class.shadow-sm]="tab()==='coupons'" [class.text-primary-600]="tab()==='coupons'" [class.bg-transparent]="tab()!=='coupons'" [class.text-gray-500]="tab()!=='coupons'"
          (click)="tab.set('coupons'); loadCoupons()">🎟️ Coupons</button>
      </div>

      @if (tab() === 'coupons') {
        @if (!coupons().length) {
          <div class="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <i class="pi pi-ticket text-gray-200" style="font-size:2.5rem"></i>
            <h3 class="text-lg font-semibold text-gray-700 mt-3">No coupons yet</h3>
            <p class="text-gray-400 text-sm mt-1">Create a code like SAVE10 that customers can enter at checkout.</p>
            <button pButton label="New Coupon" icon="pi pi-plus" class="mt-4" severity="success" (click)="openNewCoupon()"></button>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @for (c of coupons(); track c.id) {
              <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="font-bold text-gray-900 font-mono tracking-wide">{{ c.code }}</h3>
                      <p-tag [value]="c.status" [severity]="c.status === 'active' ? 'success' : 'secondary'" styleClass="text-xs capitalize" />
                    </div>
                    <p class="text-sm text-gray-500 mt-1">{{ couponDesc(c) }}</p>
                    <p class="text-xs text-gray-400 mt-2">Used {{ c.usedCount ?? c.used_count ?? 0 }}{{ (c.usageLimit ?? c.usage_limit) ? ' / ' + (c.usageLimit ?? c.usage_limit) : '' }} · {{ (c.perCustomerLimit ?? c.per_customer_limit) || 1 }}/customer</p>
                  </div>
                  <span class="text-lg font-extrabold text-green-700 whitespace-nowrap">{{ couponBadge(c) }}</span>
                </div>
                <div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
                  <button pButton [label]="c.status === 'active' ? 'Pause' : 'Activate'" [icon]="c.status === 'active' ? 'pi pi-pause' : 'pi pi-play'" class="p-button-text p-button-sm" (click)="toggleCoupon(c)"></button>
                  <button pButton label="Edit" icon="pi pi-pencil" class="p-button-text p-button-sm" (click)="openEditCoupon(c)"></button>
                  <button pButton label="Delete" icon="pi pi-trash" class="p-button-text p-button-sm" severity="danger" (click)="removeCoupon(c)"></button>
                </div>
              </div>
            }
          </div>
        }
      } @else if (loading()) {
        <div class="text-center py-20"><i class="pi pi-spin pi-spinner text-4xl text-gray-300"></i></div>
      } @else if (!schemes().length) {
        <div class="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <i class="pi pi-percentage text-gray-200" style="font-size:2.5rem"></i>
          <h3 class="text-lg font-semibold text-gray-700 mt-3">No schemes yet</h3>
          <p class="text-gray-400 text-sm mt-1">Create your first offer — e.g. 10% off a category — and it auto-applies in the cart.</p>
          <button pButton label="New Scheme" icon="pi pi-plus" class="mt-4" severity="success" (click)="openNew()"></button>
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          @for (s of schemes(); track s.id) {
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-semibold text-gray-900 truncate">{{ s.name }}</h3>
                    <p-tag [value]="s.status" [severity]="s.status === 'active' ? 'success' : 'secondary'" styleClass="text-xs capitalize" />
                    @if (s.type === 'cumulative') { <span class="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-semibold">⭐ Loyalty</span> }
                    @if (s.type !== 'cumulative' && s.combinable) { <span class="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">combinable</span> }
                  </div>
                  <p class="text-sm text-gray-500 mt-1">{{ describe(s) }}</p>
                  <p class="text-xs text-gray-400 mt-2">Priority weight: {{ s.weight }}{{ s.audience === 'specific' ? ' · targeted' : '' }}</p>
                </div>
                <span class="text-lg font-extrabold text-green-700 whitespace-nowrap">{{ badge(s) }}</span>
              </div>
              <div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
                <button pButton [label]="s.status === 'active' ? 'Pause' : 'Activate'" [icon]="s.status === 'active' ? 'pi pi-pause' : 'pi pi-play'" class="p-button-text p-button-sm" (click)="toggle(s)"></button>
                <button pButton label="Edit" icon="pi pi-pencil" class="p-button-text p-button-sm" (click)="openEdit(s)"></button>
                <button pButton label="Delete" icon="pi pi-trash" class="p-button-text p-button-sm" severity="danger" (click)="remove(s)"></button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Create / edit dialog -->
      <p-dialog [(visible)]="dialogOpen" [header]="form.id ? 'Edit Scheme' : 'New Scheme'" [modal]="true" [style]="{width: '540px'}" [dismissableMask]="true">
        <div class="space-y-4 py-1">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
            <input pInputText [(ngModel)]="form.name" class="w-full" placeholder="e.g. Diwali 10% off Electronics" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Description</label>
            <textarea pTextarea [(ngModel)]="form.description" rows="2" class="w-full" placeholder="Shown to customers (optional)"></textarea>
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Offer kind *</label>
            <p-select [(ngModel)]="form.kind" [options]="kinds" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
          </div>

          @if (!isLoyalty()) {
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Offer type *</label>
            <p-select [(ngModel)]="form.action" [options]="actionTypes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
          </div>
          }

          <!-- ── Loyalty / cumulative fields ── -->
          @if (isLoyalty()) {
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <p class="text-xs text-amber-800">⭐ Customers accrue toward a target as they order. When reached, they automatically receive a personal coupon over WhatsApp.</p>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Track</label>
                  <p-select [(ngModel)]="form.metric" [options]="metrics" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">{{ form.metric === 'orders' ? '# Orders target *' : 'Spend target ₹ *' }}</label>
                  <p-inputNumber [(ngModel)]="form.target" [min]="1" styleClass="w-full" inputStyleClass="w-full" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Window</label>
                  <p-select [(ngModel)]="form.period" [options]="periods" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Min order to count ₹ <span class="text-gray-300">(opt)</span></label>
                  <p-inputNumber [(ngModel)]="form.minOrderValue" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
                </div>
              </div>
              <p class="text-xs font-semibold text-amber-800 pt-1">🎁 Reward coupon</p>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                  <p-select [(ngModel)]="form.rDiscountType" [options]="discountTypes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">{{ form.rDiscountType === 'amount' ? 'Amount ₹ *' : 'Percent % *' }}</label>
                  <p-inputNumber [(ngModel)]="form.rDiscountValue" [min]="0" [max]="form.rDiscountType === 'percent' ? 100 : 9999999" styleClass="w-full" inputStyleClass="w-full" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Max discount cap ₹ <span class="text-gray-300">(opt)</span></label>
                  <p-inputNumber [(ngModel)]="form.rMaxDiscount" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="no cap" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1">Coupon valid (days)</label>
                  <p-inputNumber [(ngModel)]="form.rValidDays" [min]="1" styleClass="w-full" inputStyleClass="w-full" />
                </div>
              </div>
            </div>
          }

          @if (!isLoyalty() && isDiscount()) {
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Discount type</label>
                <p-select [(ngModel)]="form.discountType" [options]="discountTypes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">{{ form.discountType === 'amount' ? 'Amount (₹) *' : 'Percent (%) *' }}</label>
                <p-inputNumber [(ngModel)]="form.discountValue" [min]="0" [max]="form.discountType === 'percent' ? 100 : 9999999" styleClass="w-full" inputStyleClass="w-full" />
              </div>
            </div>
          }
          @if (!isLoyalty() && isFree()) {
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Buy qty *</label>
                <p-inputNumber [(ngModel)]="form.buyQty" [min]="1" styleClass="w-full" inputStyleClass="w-full" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Free qty *</label>
                <p-inputNumber [(ngModel)]="form.getQty" [min]="1" styleClass="w-full" inputStyleClass="w-full" />
              </div>
            </div>
          }
          @if (!isLoyalty() && form.action === 'buy_x_get_y_free') {
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Free product (gift) *</label>
              <p-select [(ngModel)]="form.getProductId" [options]="products()" optionLabel="name" optionValue="id" placeholder="Choose the free product" styleClass="w-full" appendTo="body" [filter]="true" />
            </div>
          }

          @if (!isLoyalty()) {
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">{{ isFree() ? 'Buy from' : 'Applies to' }}</label>
            <p-select [(ngModel)]="form.scope" [options]="scopes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" (onChange)="form.scopeIds = []" />
          </div>
          @if (form.scope === 'category') {
            <p-multiSelect [(ngModel)]="form.scopeIds" [options]="categories()" optionLabel="name" optionValue="id" placeholder="Select categories" styleClass="w-full" appendTo="body" [filter]="true" />
          } @else if (form.scope === 'brand') {
            <p-multiSelect [(ngModel)]="form.scopeIds" [options]="brands()" optionLabel="name" optionValue="id" placeholder="Select brands" styleClass="w-full" appendTo="body" [filter]="true" />
          } @else if (form.scope === 'product') {
            <p-multiSelect [(ngModel)]="form.scopeIds" [options]="products()" optionLabel="name" optionValue="id" placeholder="Select products" styleClass="w-full" appendTo="body" [filter]="true" />
          }

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Min qty <span class="text-gray-300">(optional)</span></label>
              <p-inputNumber [(ngModel)]="form.minQty" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Min cart ₹ <span class="text-gray-300">(optional)</span></label>
              <p-inputNumber [(ngModel)]="form.minCartValue" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
            </div>
          </div>
          }

          <div class="grid grid-cols-2 gap-3 items-end">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Priority weight</label>
              <p-inputNumber [(ngModel)]="form.weight" [min]="0" styleClass="w-full" inputStyleClass="w-full" />
              <p class="text-[10px] text-gray-400 mt-1">Higher wins when offers don't combine.</p>
            </div>
            @if (!isLoyalty()) {
            <div class="flex items-center gap-2 pb-2">
              <p-toggleSwitch [(ngModel)]="form.combinable" />
              <span class="text-sm text-gray-600">Combine with other offers</span>
            </div>
            }
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Who gets this</label>
              <p-select [(ngModel)]="form.audience" [options]="audiences" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
            </div>
            @if (form.audience === 'segment') {
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Segment</label>
                <p-select [(ngModel)]="form.audienceSegment" [options]="segmentOptions" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
              </div>
            }
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Valid from <span class="text-gray-300">(optional)</span></label>
              <input type="date" [(ngModel)]="form.validFrom" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Valid until <span class="text-gray-300">(optional)</span></label>
              <input type="date" [(ngModel)]="form.validUntil" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="dialogOpen = false"></button>
          <button pButton [label]="saving() ? 'Saving…' : 'Save Scheme'" severity="success" [disabled]="saving() || !valid()" (click)="save()"></button>
        </ng-template>
      </p-dialog>

      <!-- Coupon create / edit dialog -->
      <p-dialog [(visible)]="couponDialog" [header]="cForm.id ? 'Edit Coupon' : 'New Coupon'" [modal]="true" [style]="{width: '520px'}" [dismissableMask]="true">
        <div class="space-y-4 py-1">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Code *</label>
              <input pInputText [(ngModel)]="cForm.code" class="w-full font-mono uppercase" placeholder="SAVE10" [disabled]="!!cForm.id" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Status</label>
              <p-select [(ngModel)]="cForm.status" [options]="statusOptions" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Description</label>
            <input pInputText [(ngModel)]="cForm.description" class="w-full" placeholder="Shown to customers (optional)" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Discount type</label>
              <p-select [(ngModel)]="cForm.discountType" [options]="discountTypes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">{{ cForm.discountType === 'amount' ? 'Amount (₹) *' : 'Percent (%) *' }}</label>
              <p-inputNumber [(ngModel)]="cForm.discountValue" [min]="0" [max]="cForm.discountType === 'percent' ? 100 : 9999999" styleClass="w-full" inputStyleClass="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Min cart ₹ <span class="text-gray-300">(optional)</span></label>
              <p-inputNumber [(ngModel)]="cForm.minCartValue" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Max discount ₹ <span class="text-gray-300">(optional)</span></label>
              <p-inputNumber [(ngModel)]="cForm.maxDiscount" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="no cap" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Applies to</label>
            <p-select [(ngModel)]="cForm.scope" [options]="scopes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" (onChange)="cForm.scopeIds = []" />
          </div>
          @if (cForm.scope === 'category') {
            <p-multiSelect [(ngModel)]="cForm.scopeIds" [options]="categories()" optionLabel="name" optionValue="id" placeholder="Select categories" styleClass="w-full" appendTo="body" [filter]="true" />
          } @else if (cForm.scope === 'brand') {
            <p-multiSelect [(ngModel)]="cForm.scopeIds" [options]="brands()" optionLabel="name" optionValue="id" placeholder="Select brands" styleClass="w-full" appendTo="body" [filter]="true" />
          } @else if (cForm.scope === 'product') {
            <p-multiSelect [(ngModel)]="cForm.scopeIds" [options]="products()" optionLabel="name" optionValue="id" placeholder="Select products" styleClass="w-full" appendTo="body" [filter]="true" />
          }
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Total uses <span class="text-gray-300">(optional)</span></label>
              <p-inputNumber [(ngModel)]="cForm.usageLimit" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="unlimited" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Per customer</label>
              <p-inputNumber [(ngModel)]="cForm.perCustomerLimit" [min]="1" styleClass="w-full" inputStyleClass="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Who can use this</label>
              <p-select [(ngModel)]="cForm.audience" [options]="audiences" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
            </div>
            @if (cForm.audience === 'segment') {
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Segment</label>
                <p-select [(ngModel)]="cForm.audienceSegment" [options]="segmentOptions" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
              </div>
            }
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Valid from <span class="text-gray-300">(optional)</span></label>
              <input type="date" [(ngModel)]="cForm.validFrom" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Valid until <span class="text-gray-300">(optional)</span></label>
              <input type="date" [(ngModel)]="cForm.validUntil" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="couponDialog = false"></button>
          <button pButton [label]="savingCoupon() ? 'Saving…' : 'Save Coupon'" severity="success" [disabled]="savingCoupon() || !couponValid()" (click)="saveCoupon()"></button>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class SchemesComponent implements OnInit {
  private readonly svc = inject(SchemeService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  loading = signal(true);
  saving = signal(false);
  schemes = signal<Scheme[]>([]);
  categories = signal<any[]>([]);
  brands = signal<any[]>([]);
  products = signal<any[]>([]);

  tab = signal<'schemes' | 'coupons'>('schemes');
  coupons = signal<Coupon[]>([]);
  couponsLoaded = false;
  couponDialog = false;
  savingCoupon = signal(false);
  statusOptions = [{ label: 'Active', value: 'active' }, { label: 'Paused', value: 'paused' }];
  cForm: any = this.blankCoupon();

  dialogOpen = false;
  discountTypes = [{ label: 'Percent (%)', value: 'percent' }, { label: 'Flat amount (₹)', value: 'amount' }];
  actionTypes = [
    { label: 'Discount (% or ₹ off)', value: 'discount' },
    { label: 'Buy X get same free (BOGO)', value: 'buy_x_get_x_free' },
    { label: 'Buy X get another product free', value: 'buy_x_get_y_free' },
    { label: 'Buy N+ qty → discount', value: 'qty_discount' },
  ];
  kinds = [
    { label: 'Instant — applied at checkout', value: 'instant' },
    { label: '⭐ Loyalty — earn a reward over time', value: 'cumulative' },
  ];
  metrics = [
    { label: 'Total spend (₹)', value: 'spend' },
    { label: 'Number of orders', value: 'orders' },
  ];
  periods = [
    { label: 'Lifetime', value: 'lifetime' },
    { label: 'Every month', value: 'monthly' },
  ];
  audiences = [
    { label: 'Everyone', value: 'all' },
    { label: 'Customer segment', value: 'segment' },
  ];
  segmentOptions = [
    { label: 'High-order customers (3+)', value: 'high_orders' },
    { label: 'Low-order customers (1–2)', value: 'low_orders' },
    { label: 'Repeat customers', value: 'repeat' },
    { label: 'New customers (30 days)', value: 'new' },
    { label: 'Inactive customers (60+ days)', value: 'inactive' },
    { label: 'Pending-cart customers', value: 'pending_cart' },
  ];
  segmentLabel(key: string): string { return this.segmentOptions.find((s) => s.value === key)?.label || key; }
  isLoyalty(): boolean { return this.form.kind === 'cumulative'; }
  isDiscount(): boolean { return ['discount', 'qty_discount'].includes(this.form.action); }
  isFree(): boolean { return ['buy_x_get_x_free', 'buy_x_get_y_free'].includes(this.form.action); }
  scopes = [
    { label: 'All products', value: 'all' },
    { label: 'Specific categories', value: 'category' },
    { label: 'Specific brands', value: 'brand' },
    { label: 'Specific products', value: 'product' },
  ];

  form: any = this.blankForm();

  ngOnInit() {
    this.load();
    this.api.get<any>('/categories').subscribe({ next: (r) => this.categories.set(this.arr(r)) });
    this.api.get<any>('/brands').subscribe({ next: (r) => this.brands.set(this.arr(r)) });
    this.api.get<any>('/products', { limit: 500 } as any).subscribe({ next: (r) => this.products.set(this.arr(r).map((p: any) => ({ id: p.id, name: p.name }))) });
  }

  private arr(r: any): any[] { return Array.isArray(r) ? r : (r?.data ?? r?.items ?? []); }

  load() {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: (s) => { this.schemes.set((s || []).map(this.normalize)); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  private normalize = (s: any): Scheme => ({
    ...s,
    scopeIds: s.scopeIds ?? s.scope_ids ?? [],
    conditions: typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {}),
    reward: typeof s.reward === 'string' ? JSON.parse(s.reward) : (s.reward || {}),
    validFrom: s.validFrom ?? s.valid_from ?? null,
    validUntil: s.validUntil ?? s.valid_until ?? null,
  });

  blankForm() {
    return {
      id: '', name: '', description: '', kind: 'instant', action: 'discount',
      discountType: 'percent', discountValue: 10,
      scope: 'all', scopeIds: [] as string[], minQty: null, minCartValue: null,
      buyQty: 2, getQty: 1, getProductId: '',
      weight: 0, combinable: false, validFrom: '', validUntil: '',
      audience: 'all', audienceSegment: 'repeat',
      metric: 'spend', target: 10000, period: 'lifetime', minOrderValue: null,
      rDiscountType: 'percent', rDiscountValue: 10, rMaxDiscount: null, rValidDays: 30,
    };
  }

  valid(): boolean {
    if (!this.form.name?.trim()) return false;
    if (this.isLoyalty()) return Number(this.form.target) > 0 && Number(this.form.rDiscountValue) > 0;
    if (this.form.scope !== 'all' && !(this.form.scopeIds && this.form.scopeIds.length > 0)) return false;
    if (this.isDiscount()) return Number(this.form.discountValue) > 0;
    if (this.form.action === 'buy_x_get_x_free') return Number(this.form.buyQty) > 0 && Number(this.form.getQty) > 0;
    if (this.form.action === 'buy_x_get_y_free') return Number(this.form.buyQty) > 0 && Number(this.form.getQty) > 0 && !!this.form.getProductId;
    return false;
  }

  openNew() { this.form = this.blankForm(); this.dialogOpen = true; }

  openEdit(s: Scheme) {
    const c = s.conditions || {};
    const r = (s as any).reward || {};
    this.form = {
      id: s.id, name: s.name, description: s.description || '',
      kind: s.type === 'cumulative' ? 'cumulative' : 'instant', action: s.action || 'discount',
      discountType: c.discountType || 'percent', discountValue: c.discountValue ?? 0,
      scope: s.scope, scopeIds: [...(s.scopeIds || [])],
      minQty: c.minQty ?? null, minCartValue: c.minCartValue ?? null,
      buyQty: c.buyQty ?? 2, getQty: c.getQty ?? 1, getProductId: c.getProductId || '',
      weight: s.weight ?? 0, combinable: !!s.combinable,
      validFrom: (s.validFrom || '').slice(0, 10), validUntil: (s.validUntil || '').slice(0, 10),
      audience: (s as any).audience || 'all', audienceSegment: (s as any).audienceSegment ?? (s as any).audience_segment ?? 'repeat',
      metric: c.metric || 'spend', target: c.target ?? 10000, period: c.period || 'lifetime', minOrderValue: c.minOrderValue ?? null,
      rDiscountType: r.discountType || 'percent', rDiscountValue: r.discountValue ?? 10,
      rMaxDiscount: r.maxDiscount ?? null, rValidDays: r.validDays ?? 30,
    };
    this.dialogOpen = true;
  }

  save() {
    if (this.isLoyalty()) return this.saveLoyalty();
    const conditions: any = {};
    if (this.isDiscount()) {
      conditions.discountType = this.form.discountType;
      conditions.discountValue = Number(this.form.discountValue) || 0;
      if (this.form.action === 'qty_discount' && this.form.minQty) conditions.minQty = Number(this.form.minQty);
      else if (this.form.minQty) conditions.minQty = Number(this.form.minQty);
    } else if (this.form.action === 'buy_x_get_x_free') {
      conditions.buyQty = Number(this.form.buyQty) || 1; conditions.getQty = Number(this.form.getQty) || 1;
    } else if (this.form.action === 'buy_x_get_y_free') {
      conditions.buyQty = Number(this.form.buyQty) || 1; conditions.getQty = Number(this.form.getQty) || 1;
      conditions.getProductId = this.form.getProductId;
    }
    if (this.form.minCartValue) conditions.minCartValue = Number(this.form.minCartValue);

    const payload: Partial<Scheme> = {
      name: this.form.name.trim(), description: this.form.description?.trim() || undefined,
      type: 'instant', action: this.form.action, scope: this.form.scope,
      scopeIds: this.form.scope === 'all' ? [] : this.form.scopeIds,
      conditions,
      weight: Number(this.form.weight) || 0, combinable: !!this.form.combinable,
      audience: this.form.audience, audienceSegment: this.form.audience === 'segment' ? this.form.audienceSegment : null,
      validFrom: this.form.validFrom || null, validUntil: this.form.validUntil || null,
      status: 'active',
    };
    this.saving.set(true);
    const obs = this.form.id ? this.svc.update(this.form.id, payload) : this.svc.create(payload);
    obs.subscribe({
      next: () => { this.saving.set(false); this.dialogOpen = false; this.load(); this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Scheme saved.' }); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Could not save scheme.' }); },
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
    const payload: Partial<Scheme> = {
      name: this.form.name.trim(), description: this.form.description?.trim() || undefined,
      type: 'cumulative', action: 'loyalty', scope: 'all', scopeIds: [],
      conditions, reward, weight: Number(this.form.weight) || 0, combinable: false,
      audience: this.form.audience, audienceSegment: this.form.audience === 'segment' ? this.form.audienceSegment : null,
      validFrom: this.form.validFrom || null, validUntil: this.form.validUntil || null, status: 'active',
    };
    this.saving.set(true);
    const obs = this.form.id ? this.svc.update(this.form.id, payload) : this.svc.create(payload);
    obs.subscribe({
      next: () => { this.saving.set(false); this.dialogOpen = false; this.load(); this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Loyalty scheme saved.' }); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Could not save scheme.' }); },
    });
  }

  toggle(s: Scheme) {
    this.svc.setStatus(s.id, s.status === 'active' ? 'paused' : 'active').subscribe({ next: () => this.load() });
  }

  remove(s: Scheme) {
    this.svc.delete(s.id).subscribe({ next: () => { this.load(); this.toast.add({ severity: 'success', summary: 'Deleted', detail: 'Scheme removed.' }); } });
  }

  badge(s: Scheme): string {
    const c = s.conditions || {};
    if (s.type === 'cumulative') {
      const r = (s as any).reward || {};
      return r.discountType === 'amount' ? `₹${r.discountValue} reward` : `${r.discountValue || 0}% reward`;
    }
    if (s.action === 'buy_x_get_x_free') return `Buy ${c.buyQty || 1} Get ${c.getQty || 1}`;
    if (s.action === 'buy_x_get_y_free') return `🎁 Free`;
    return c.discountType === 'amount' ? `₹${c.discountValue} OFF` : `${c.discountValue || 0}% OFF`;
  }

  describe(s: Scheme): string {
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

  // ─── Coupons ───────────────────────────────────────────────────────────────
  blankCoupon() {
    return {
      id: '', code: '', description: '', discountType: 'percent', discountValue: 10,
      minCartValue: null, maxDiscount: null, scope: 'all', scopeIds: [] as string[],
      usageLimit: null, perCustomerLimit: 1, audience: 'all', audienceSegment: 'repeat',
      validFrom: '', validUntil: '', status: 'active',
    };
  }

  loadCoupons() {
    if (this.couponsLoaded) return;
    this.couponsLoaded = true;
    this.svc.listCoupons().subscribe({
      next: (cs) => this.coupons.set((cs || []).map((c) => ({ ...c, scopeIds: (c as any).scopeIds ?? (c as any).scope_ids ?? [] }))),
    });
  }

  couponValid(): boolean {
    return !!this.cForm.code?.trim() && Number(this.cForm.discountValue) > 0 &&
      (this.cForm.scope === 'all' || (this.cForm.scopeIds && this.cForm.scopeIds.length > 0));
  }

  openNewCoupon() { this.cForm = this.blankCoupon(); this.couponDialog = true; }

  openEditCoupon(c: Coupon) {
    this.cForm = {
      id: c.id, code: c.code, description: c.description || '',
      discountType: c.discountType ?? c.discount_type ?? 'percent',
      discountValue: c.discountValue ?? c.discount_value ?? 0,
      minCartValue: (c.minCartValue ?? c.min_cart_value) || null,
      maxDiscount: (c.maxDiscount ?? c.max_discount) ?? null,
      scope: c.scope || 'all', scopeIds: [...((c.scopeIds ?? c.scope_ids) || [])],
      usageLimit: (c.usageLimit ?? c.usage_limit) ?? null,
      perCustomerLimit: (c.perCustomerLimit ?? c.per_customer_limit) || 1,
      audience: (c as any).audience || 'all', audienceSegment: (c as any).audienceSegment ?? (c as any).audience_segment ?? 'repeat',
      validFrom: ((c.validFrom ?? c.valid_from) || '').slice(0, 10),
      validUntil: ((c.validUntil ?? c.valid_until) || '').slice(0, 10),
      status: c.status || 'active',
    };
    this.couponDialog = true;
  }

  saveCoupon() {
    const payload: Partial<Coupon> = {
      code: this.cForm.code.trim().toUpperCase(), description: this.cForm.description?.trim() || undefined,
      discountType: this.cForm.discountType, discountValue: Number(this.cForm.discountValue) || 0,
      minCartValue: Number(this.cForm.minCartValue) || 0,
      maxDiscount: this.cForm.maxDiscount ? Number(this.cForm.maxDiscount) : null,
      scope: this.cForm.scope, scopeIds: this.cForm.scope === 'all' ? [] : this.cForm.scopeIds,
      usageLimit: this.cForm.usageLimit ? Number(this.cForm.usageLimit) : null,
      perCustomerLimit: Number(this.cForm.perCustomerLimit) || 1,
      audience: this.cForm.audience, audienceSegment: this.cForm.audience === 'segment' ? this.cForm.audienceSegment : null,
      validFrom: this.cForm.validFrom || null, validUntil: this.cForm.validUntil || null, status: this.cForm.status,
    } as any;
    this.savingCoupon.set(true);
    const obs = this.cForm.id ? this.svc.updateCoupon(this.cForm.id, payload) : this.svc.createCoupon(payload);
    obs.subscribe({
      next: () => { this.savingCoupon.set(false); this.couponDialog = false; this.couponsLoaded = false; this.loadCoupons(); this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Coupon saved.' }); },
      error: (e) => { this.savingCoupon.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Could not save coupon.' }); },
    });
  }

  toggleCoupon(c: Coupon) { this.svc.setCouponStatus(c.id, c.status === 'active' ? 'paused' : 'active').subscribe({ next: () => { this.couponsLoaded = false; this.loadCoupons(); } }); }
  removeCoupon(c: Coupon) { this.svc.deleteCoupon(c.id).subscribe({ next: () => { this.couponsLoaded = false; this.loadCoupons(); this.toast.add({ severity: 'success', summary: 'Deleted', detail: 'Coupon removed.' }); } }); }

  couponBadge(c: Coupon): string {
    const t = c.discountType ?? c.discount_type; const v = c.discountValue ?? c.discount_value;
    return t === 'amount' ? `₹${v} OFF` : `${v || 0}% OFF`;
  }
  couponDesc(c: Coupon): string {
    const scope = c.scope === 'all' ? 'all products' : `${((c.scopeIds ?? c.scope_ids) || []).length} ${c.scope}(s)`;
    const min = (c.minCartValue ?? c.min_cart_value) || 0;
    return `On ${scope}${min > 0 ? ` · min ₹${min} cart` : ''}${c.description ? ' · ' + c.description : ''}`;
  }
}
