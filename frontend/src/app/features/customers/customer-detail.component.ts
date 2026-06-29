import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { DividerModule } from 'primeng/divider';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ChipModule } from 'primeng/chip';
import { ToastModule } from 'primeng/toast';
import { AvatarModule } from 'primeng/avatar';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../core/services/customer.service';
import { SchemeService } from '../../core/services/scheme.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'wa-customer-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ButtonModule, TagModule, TableModule, TabsModule, DividerModule,
    DialogModule, InputTextModule, InputNumberModule, SelectModule, TextareaModule, ChipModule,
    ToastModule, AvatarModule, FormsModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <p-toast />

      <div class="flex items-center gap-4 mb-6">
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/customers"></button>
        <h1 class="text-xl font-bold text-gray-900">Customer Profile</h1>
      </div>

      @if (loading()) {
        <div class="text-center py-20"><i class="pi pi-spin pi-spinner text-4xl text-gray-300"></i></div>
      } @else {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <!-- Left: profile card -->
          <div class="space-y-5">
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center relative">
              <button pButton icon="pi pi-pencil" class="p-button-text p-button-rounded p-button-sm absolute top-3 right-3" pTooltip="Edit profile" (click)="openEdit()"></button>
              <div class="flex justify-center mb-4">
                <p-avatar [label]="initials()" styleClass="bg-primary-500 text-white font-bold" size="xlarge" shape="circle" />
              </div>
              <h2 class="text-xl font-bold text-gray-900">{{ c().displayName || c().whatsappName || c().whatsappPhone || 'Customer' }}</h2>
              @if (c().displayName && c().whatsappName && c().displayName !== c().whatsappName) {
                <p class="text-gray-400 text-xs">aka {{ c().whatsappName }}</p>
              }
              <p class="text-gray-500 text-sm mt-1">{{ c().whatsappPhone }}</p>
              @if (c().email) { <p class="text-gray-400 text-xs mt-0.5">{{ c().email }}</p> }
              <div class="flex justify-center mt-3">
                <p-tag [value]="c().status" [severity]="statusSeverity(c().status)" styleClass="capitalize" />
              </div>
              <div class="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-gray-100">
                <div>
                  <p class="text-lg font-bold text-gray-900">{{ c().totalOrders }}</p>
                  <p class="text-xs text-gray-500">Total Orders</p>
                </div>
                <div>
                  <p class="text-lg font-bold text-primary-600">{{ cur }}{{ c().totalSpent | number:'1.0-2' }}</p>
                  <p class="text-xs text-gray-500">Total Spent</p>
                </div>
              </div>
              @if (c().lastActivity) {
                <p class="text-[11px] text-gray-400 mt-3">Last active {{ c().lastActivity | date:'medium' }}</p>
              }
              <div class="flex gap-2 mt-4">
                <a pButton label="Message" icon="pi pi-whatsapp" class="flex-1 p-button-outlined" severity="success" [href]="waLink()" target="_blank"></a>
                @if (c().status === 'blocked') {
                  <button pButton label="Unblock" icon="pi pi-check" class="p-button-outlined" severity="success" (click)="setBlocked(false)"></button>
                } @else {
                  <button pButton label="Block" icon="pi pi-ban" class="p-button-outlined p-button-danger" severity="danger" (click)="setBlocked(true)"></button>
                }
              </div>
              <button pButton label="Give reward" icon="pi pi-gift" class="w-full mt-2" severity="help" (click)="openReward()"></button>
            </div>

            <!-- Active cart -->
            @if (cart() && cart().items.length) {
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-amber-200">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-sm font-semibold text-gray-900">🛒 Active Cart</h3>
                  <span class="text-xs font-bold text-amber-600">{{ cur }}{{ cart().total | number:'1.0-2' }}</span>
                </div>
                @for (it of cart().items; track it.name) {
                  <p class="text-xs text-gray-600">• {{ it.name }} × {{ it.quantity }}</p>
                }
                <p class="text-[11px] text-gray-400 mt-2">Updated {{ cart().updatedAt | date:'short' }}</p>
              </div>
            }

            <!-- Tags -->
            <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-900">Tags</h3>
                <button pButton icon="pi pi-plus" class="p-button-text p-button-sm p-button-rounded" pTooltip="Add tag" (click)="tagDialog = true"></button>
              </div>
              <div class="flex flex-wrap gap-2">
                @for (tag of c().tags; track tag) {
                  <div class="flex items-center gap-1 bg-primary-50 text-primary-700 border border-primary-100 rounded-full px-3 py-1">
                    <span class="text-xs font-medium">{{ tag }}</span>
                    <button class="text-primary-400 hover:text-red-500 leading-none" (click)="removeTag(tag)"><i class="pi pi-times" style="font-size:0.6rem"></i></button>
                  </div>
                }
                @if (!c().tags.length) { <p class="text-xs text-gray-400">No tags assigned</p> }
              </div>
            </div>

            <!-- Custom fields -->
            @if (customerFields().length) {
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="text-sm font-semibold text-gray-900 mb-3">Custom Fields</h3>
                <div class="space-y-2.5">
                  @for (cf of customerFields(); track cf.field_key) {
                    <div class="flex items-start justify-between gap-3">
                      <span class="text-xs text-gray-500">{{ cf.label }}</span>
                      <span class="text-xs font-medium text-gray-900 text-right">{{ cfDisplay(cf) || '—' }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Saved addresses -->
            <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 class="text-sm font-semibold text-gray-900 mb-3">Addresses</h3>
              @if (!addresses().length) {
                <p class="text-xs text-gray-400">No saved addresses</p>
              } @else {
                <div class="space-y-2.5">
                  @for (a of addresses(); track a.id) {
                    <div class="rounded-xl border border-gray-100 p-3">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-[11px] font-semibold text-gray-700 capitalize">{{ a.label || 'Address' }}</span>
                        @if (a.is_default ?? a.isDefault) { <span class="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">Default</span> }
                      </div>
                      <p class="text-xs text-gray-600 leading-snug">{{ a.full_address ?? a.fullAddress }}</p>
                      <p class="text-[11px] text-gray-400 mt-0.5">{{ addrLine(a) }}</p>
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Right: tabs -->
          <div class="lg:col-span-2">
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <p-tabs value="0">
                <p-tablist>
                  <p-tab value="0">Orders ({{ orders().length }})</p-tab>
                  <p-tab value="1">Notes</p-tab>
                </p-tablist>
                <p-tabpanels>
                  <p-tabpanel value="0">
                    <p-table [value]="orders()" styleClass="text-sm" [paginator]="orders().length > 8" [rows]="8">
                      <ng-template pTemplate="header">
                        <tr>
                          <th class="text-xs text-gray-500">Order #</th>
                          <th class="text-xs text-gray-500">Items</th>
                          <th class="text-xs text-gray-500">Total</th>
                          <th class="text-xs text-gray-500">Status</th>
                          <th class="text-xs text-gray-500">Date</th>
                        </tr>
                      </ng-template>
                      <ng-template pTemplate="body" let-order>
                        <tr class="hover:bg-gray-50">
                          <td><a [routerLink]="['/orders', order.id]" class="text-primary-600 font-semibold hover:underline">{{ order.number }}</a></td>
                          <td class="text-gray-600">{{ order.items }}</td>
                          <td class="font-semibold">{{ cur }}{{ order.total | number:'1.0-2' }}</td>
                          <td><p-tag [value]="order.status" [severity]="orderSeverity(order.status)" styleClass="text-xs capitalize" /></td>
                          <td class="text-xs text-gray-500">{{ order.date }}</td>
                        </tr>
                      </ng-template>
                      <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="text-center text-gray-400 text-sm py-6">No orders yet.</td></tr></ng-template>
                    </p-table>
                  </p-tabpanel>

                  <p-tabpanel value="1">
                    <div class="p-4">
                      <textarea pTextarea class="w-full" rows="6" [(ngModel)]="notes" placeholder="Add private notes about this customer..."></textarea>
                      <div class="flex justify-end mt-2">
                        <button pButton label="Save Notes" icon="pi pi-check" class="p-button-sm" severity="success" [disabled]="savingNotes()" (click)="saveNotes()"></button>
                      </div>
                    </div>
                  </p-tabpanel>
                </p-tabpanels>
              </p-tabs>
            </div>
          </div>
        </div>
      }

      <!-- Add tag dialog -->
      <p-dialog [(visible)]="tagDialog" header="Add Tag" [modal]="true" [style]="{width:'340px'}">
        <div class="py-2">
          <input pInputText [(ngModel)]="newTag" placeholder="Enter tag name" class="w-full" (keydown.enter)="addTag()" />
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="tagDialog = false"></button>
          <button pButton label="Add Tag" severity="success" (click)="addTag()"></button>
        </ng-template>
      </p-dialog>

      <!-- Edit profile dialog -->
      <p-dialog [(visible)]="editDialog" header="Edit Customer" [modal]="true" [style]="{width:'420px'}">
        <div class="space-y-3 py-1">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Name</label>
            <input pInputText [(ngModel)]="edit.name" class="w-full" placeholder="Full name" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Nickname / Display name</label>
            <input pInputText [(ngModel)]="edit.displayName" class="w-full" placeholder="Shown across the panel" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Email</label>
            <input pInputText [(ngModel)]="edit.email" class="w-full" placeholder="email@example.com" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Phone</label>
            <input pInputText [ngModel]="c().whatsappPhone" class="w-full" disabled />
          </div>
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="editDialog = false"></button>
          <button pButton [label]="savingEdit() ? 'Saving…' : 'Save'" severity="success" [disabled]="savingEdit()" (click)="saveEdit()"></button>
        </ng-template>
      </p-dialog>

      <!-- Give reward dialog -->
      <p-dialog [(visible)]="rewardDialog" header="Give reward" [modal]="true" [style]="{width:'440px'}">
        <div class="space-y-3 py-1">
          <p class="text-xs text-gray-500">Reward <span class="font-semibold">{{ c().displayName || c().whatsappName || c().whatsappPhone }}</span> directly — it applies only to this customer.</p>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Reward as</label>
            <p-select [(ngModel)]="reward.kind" [options]="rewardKinds" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Discount type</label>
              <p-select [(ngModel)]="reward.discountType" [options]="discountTypes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">{{ reward.discountType === 'amount' ? 'Amount ₹ *' : 'Percent % *' }}</label>
              <p-inputNumber [(ngModel)]="reward.discountValue" [min]="0" [max]="reward.discountType === 'percent' ? 100 : 9999999" styleClass="w-full" inputStyleClass="w-full" />
            </div>
          </div>
          @if (reward.kind === 'coupon') {
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Max discount cap ₹</label>
                <p-inputNumber [(ngModel)]="reward.maxDiscount" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="no cap" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Min cart ₹</label>
                <p-inputNumber [(ngModel)]="reward.minCart" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Coupon code</label>
              <input pInputText [(ngModel)]="reward.code" class="w-full font-mono uppercase" />
            </div>
          }
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Valid for (days)</label>
            <p-inputNumber [(ngModel)]="reward.validDays" [min]="1" styleClass="w-full" inputStyleClass="w-full" />
          </div>
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="rewardDialog = false"></button>
          <button pButton [label]="savingReward() ? 'Giving…' : 'Give reward'" severity="success" [disabled]="savingReward() || !(reward.discountValue > 0)" (click)="giveReward()"></button>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class CustomerDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(MessageService);
  private readonly customerService = inject(CustomerService);
  private readonly schemeService = inject(SchemeService);
  private readonly api = inject(ApiService);

  readonly cur = '₹';
  customerFieldDefs = signal<any[]>([]);
  addresses = signal<any[]>([]);
  /** Only fields that have a value on this customer, in definition order. */
  customerFields = computed(() => {
    const vals = this.c()?.customFields ?? this.c()?.custom_fields ?? {};
    return this.customerFieldDefs()
      .map((d: any) => ({ ...d, field_key: d.field_key ?? d.fieldKey, field_type: d.field_type ?? d.fieldType ?? 'text', value: vals[d.field_key ?? d.fieldKey] }))
      .filter((d: any) => d.value !== undefined && d.value !== null && d.value !== '');
  });
  cfDisplay(cf: any): string {
    if (cf.field_type === 'boolean') return cf.value ? 'Yes' : 'No';
    return String(cf.value ?? '');
  }
  addrLine(a: any): string {
    return [a.city, a.state, a.pincode ?? a.pinCode].filter((x: any) => !!x).join(', ');
  }
  tagDialog = false;
  editDialog = false;
  rewardDialog = false;
  newTag = '';
  notes = '';
  savingNotes = signal(false);
  savingEdit = signal(false);
  savingReward = signal(false);

  loading = signal(true);
  c = signal<any>({ tags: [] });
  orders = signal<any[]>([]);
  cart = signal<any>(null);

  edit = { name: '', displayName: '', email: '' };
  rewardKinds = [{ label: '🎁 Personal coupon (code)', value: 'coupon' }, { label: '🏷️ Auto offer (applies in cart)', value: 'offer' }];
  discountTypes = [{ label: 'Percent (%)', value: 'percent' }, { label: 'Flat amount (₹)', value: 'amount' }];
  reward: any = this.blankReward();

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.loading.set(false); return; }
    this.customerService.getById(id).subscribe({
      next: (c: any) => {
        this.c.set({ ...c, tags: c.tags || [] });
        this.notes = c.notes || '';
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
    // Customer custom field definitions + saved addresses (display).
    this.api.get<any>('/custom-fields', { entity: 'customer' } as any).subscribe({
      next: (r) => this.customerFieldDefs.set(Array.isArray(r) ? r : (r?.data ?? r?.items ?? [])),
      error: () => this.customerFieldDefs.set([]),
    });
    this.api.get<any>(`/customers/${id}/addresses`).subscribe({
      next: (r) => this.addresses.set(Array.isArray(r) ? r : (r?.data ?? r?.items ?? [])),
      error: () => this.addresses.set([]),
    });
    this.customerService.getOrders(id).subscribe({
      next: (r: any) => {
        const arr = r?.data ?? r ?? [];
        this.orders.set((Array.isArray(arr) ? arr : []).map((o: any) => ({
          id: o.id,
          number: o.orderNumber || '',
          items: o.itemCount ?? 0,
          total: o.totalAmount ?? 0,
          status: o.status || 'pending',
          date: o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
        })));
      },
    });
    this.customerService.getCart(id).subscribe({ next: (cart) => this.cart.set(cart) });
  }

  initials(): string {
    const n = this.c().displayName || this.c().whatsappName || '';
    if (!n) return '?';
    return n.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
  }
  statusSeverity(s: string): any { return ({ active: 'success', blocked: 'danger' } as any)[s] ?? 'info'; }
  orderSeverity(s: string): any {
    return ({ pending: 'warn', confirmed: 'info', processing: 'info', delivered: 'success', completed: 'success', cancelled: 'danger' } as any)[s] ?? 'secondary';
  }
  waLink(): string { return `https://wa.me/${(this.c().whatsappPhone || '').replace(/[^0-9]/g, '')}`; }

  // ─── Edit profile ──────────────────────────────────────────────────────────
  openEdit() {
    this.edit = { name: this.c().whatsappName || '', displayName: this.c().displayName || '', email: this.c().email || '' };
    this.editDialog = true;
  }
  saveEdit() {
    const id = this.c().id;
    this.savingEdit.set(true);
    this.customerService.update(id, { name: this.edit.name, displayName: this.edit.displayName, email: this.edit.email }).subscribe({
      next: (u: any) => { this.c.set({ ...u, tags: u.tags || [] }); this.savingEdit.set(false); this.editDialog = false; this.toast.add({ severity: 'success', summary: 'Saved' }); },
      error: () => { this.savingEdit.set(false); this.toast.add({ severity: 'error', summary: 'Could not save' }); },
    });
  }

  saveNotes() {
    const id = this.c().id;
    this.savingNotes.set(true);
    this.customerService.update(id, { notes: this.notes }).subscribe({
      next: () => { this.savingNotes.set(false); this.toast.add({ severity: 'success', summary: 'Notes saved' }); },
      error: () => { this.savingNotes.set(false); this.toast.add({ severity: 'error', summary: 'Could not save notes' }); },
    });
  }

  setBlocked(block: boolean) {
    const id = this.c().id;
    const obs = block ? this.customerService.block(id) : this.customerService.unblock(id);
    obs.subscribe({
      next: (u: any) => { this.c.set({ ...u, tags: u.tags || [] }); this.toast.add({ severity: 'success', summary: block ? 'Customer blocked' : 'Customer unblocked' }); },
      error: () => this.toast.add({ severity: 'error', summary: 'Action failed' }),
    });
  }

  // ─── Tags ────────────────────────────────────────────────────────────────────
  addTag() {
    if (!this.newTag.trim()) return;
    const id = this.c().id;
    const tags = [...this.c().tags, this.newTag.trim()];
    this.customerService.updateTags(id, tags).subscribe();
    this.c.update((c: any) => ({ ...c, tags }));
    this.newTag = '';
    this.tagDialog = false;
    this.toast.add({ severity: 'success', summary: 'Tag added' });
  }
  removeTag(tag: string) {
    const id = this.c().id;
    const tags = this.c().tags.filter((t: string) => t !== tag);
    this.customerService.updateTags(id, tags).subscribe();
    this.c.update((c: any) => ({ ...c, tags }));
  }

  // ─── Give reward (personal offer / coupon) ──────────────────────────────────
  private blankReward() {
    return { kind: 'coupon', discountType: 'percent', discountValue: 10, maxDiscount: null, minCart: null, validDays: 30, code: '' };
  }
  openReward() {
    this.reward = this.blankReward();
    const last4 = (this.c().whatsappPhone || '').replace(/[^0-9]/g, '').slice(-4);
    this.reward.code = `VIP${last4}${Math.floor(Math.random() * 90 + 10)}`;
    this.rewardDialog = true;
  }
  giveReward() {
    const id = this.c().id;
    const validUntil = new Date(Date.now() + (Number(this.reward.validDays) || 30) * 86400000).toISOString();
    this.savingReward.set(true);
    if (this.reward.kind === 'coupon') {
      this.schemeService.createCoupon({
        code: (this.reward.code || '').trim().toUpperCase(),
        description: `Personal reward for ${this.c().displayName || this.c().whatsappName || this.c().whatsappPhone}`,
        discountType: this.reward.discountType, discountValue: Number(this.reward.discountValue) || 0,
        minCartValue: Number(this.reward.minCart) || 0,
        maxDiscount: this.reward.maxDiscount ? Number(this.reward.maxDiscount) : null,
        scope: 'all', usageLimit: 1, perCustomerLimit: 1,
        audience: 'specific', customerIds: [id], validUntil, status: 'active',
      } as any).subscribe({
        next: () => { this.savingReward.set(false); this.rewardDialog = false; this.toast.add({ severity: 'success', summary: 'Coupon created', detail: `Code ${this.reward.code}` }); },
        error: (e) => { this.savingReward.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Could not create coupon' }); },
      });
    } else {
      this.schemeService.create({
        name: `Special offer — ${this.c().displayName || this.c().whatsappName || this.c().whatsappPhone}`,
        type: 'instant', action: 'discount', scope: 'all', scopeIds: [],
        conditions: { discountType: this.reward.discountType, discountValue: Number(this.reward.discountValue) || 0 },
        weight: 50, combinable: false, audience: 'specific', customerIds: [id],
        validUntil, status: 'active',
      } as any).subscribe({
        next: () => { this.savingReward.set(false); this.rewardDialog = false; this.toast.add({ severity: 'success', summary: 'Offer created', detail: 'Auto-applies in this customer’s cart' }); },
        error: (e) => { this.savingReward.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Could not create offer' }); },
      });
    }
  }
}
