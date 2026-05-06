import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { DividerModule } from 'primeng/divider';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ChipModule } from 'primeng/chip';
import { ToastModule } from 'primeng/toast';
import { AvatarModule } from 'primeng/avatar';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'wa-customer-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ButtonModule,
    TagModule,
    TableModule,
    TabsModule,
    DividerModule,
    DialogModule,
    InputTextModule,
    ChipModule,
    ToastModule,
    AvatarModule,
    FormsModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <p-toast />

      <!-- Back -->
      <div class="flex items-center gap-4 mb-6">
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/customers"></button>
        <h1 class="text-xl font-bold text-gray-900">Customer Profile</h1>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left: profile card -->
        <div class="space-y-5">
          <!-- Profile -->
          <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
            <div class="flex justify-center mb-4">
              <p-avatar
                [label]="getInitials(customer().name)"
                styleClass="bg-primary-500 text-white font-bold"
                size="xlarge"
                shape="circle"
              />
            </div>
            <h2 class="text-xl font-bold text-gray-900">{{ customer().name }}</h2>
            <p class="text-gray-500 text-sm mt-1">{{ customer().phone }}</p>
            @if (customer().email) {
              <p class="text-gray-400 text-xs mt-0.5">{{ customer().email }}</p>
            }
            <div class="flex justify-center mt-3">
              <p-tag [value]="customer().status" [severity]="getStatusSeverity(customer().status)" styleClass="capitalize" />
            </div>
            <div class="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-gray-100">
              <div>
                <p class="text-lg font-bold text-gray-900">{{ customer().totalOrders }}</p>
                <p class="text-xs text-gray-500">Total Orders</p>
              </div>
              <div>
                <p class="text-lg font-bold text-primary-600">₦{{ customer().totalSpent | number }}</p>
                <p class="text-xs text-gray-500">Total Spent</p>
              </div>
            </div>
            <div class="flex gap-2 mt-4">
              <button pButton label="Message" icon="pi pi-whatsapp" class="flex-1 p-button-outlined" severity="success"></button>
              <button pButton label="Block" icon="pi pi-ban" class="p-button-outlined p-button-danger" severity="danger"></button>
            </div>
          </div>

          <!-- Tags -->
          <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-900">Tags</h3>
              <button pButton icon="pi pi-plus" class="p-button-text p-button-sm p-button-rounded" pTooltip="Add tag" (click)="tagDialog = true"></button>
            </div>
            <div class="flex flex-wrap gap-2">
              @for (tag of customer().tags; track tag) {
                <div class="flex items-center gap-1 bg-primary-50 text-primary-700 border border-primary-100 rounded-full px-3 py-1">
                  <span class="text-xs font-medium">{{ tag }}</span>
                  <button class="text-primary-400 hover:text-red-500 leading-none" (click)="removeTag(tag)">
                    <i class="pi pi-times" style="font-size:0.6rem"></i>
                  </button>
                </div>
              }
              @if (!customer().tags.length) {
                <p class="text-xs text-gray-400">No tags assigned</p>
              }
            </div>
          </div>

          <!-- Address -->
          <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 class="text-sm font-semibold text-gray-900 mb-3">Addresses</h3>
            @for (addr of customer().addresses; track addr.label) {
              <div class="mb-3 p-3 bg-gray-50 rounded-lg">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">{{ addr.label }}</p>
                <p class="text-sm text-gray-700 mt-1">{{ addr.full }}</p>
              </div>
            }
          </div>
        </div>

        <!-- Right: tabs -->
        <div class="lg:col-span-2">
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <p-tabs value="0">
              <p-tablist>
                <p-tab value="0">Orders ({{ customer().orders.length }})</p-tab>
                <p-tab value="1">Notes</p-tab>
                <p-tab value="2">Activity</p-tab>
              </p-tablist>
              <p-tabpanels>
                <!-- Orders -->
                <p-tabpanel value="0">
                  <p-table [value]="customer().orders" styleClass="text-sm" [paginator]="true" [rows]="5">
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
                        <td>
                          <a [routerLink]="['/orders', order.id]" class="text-primary-600 font-semibold hover:underline">{{ order.number }}</a>
                        </td>
                        <td class="text-gray-600">{{ order.items }}</td>
                        <td class="font-semibold">₦{{ order.total | number }}</td>
                        <td>
                          <p-tag [value]="order.status" [severity]="getOrderSeverity(order.status)" styleClass="text-xs capitalize" />
                        </td>
                        <td class="text-xs text-gray-500">{{ order.date }}</td>
                      </tr>
                    </ng-template>
                  </p-table>
                </p-tabpanel>

                <!-- Notes -->
                <p-tabpanel value="1">
                  <div class="p-4">
                    <textarea
                      class="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-primary-400"
                      rows="4"
                      [(ngModel)]="notes"
                      placeholder="Add notes about this customer..."
                    ></textarea>
                    <div class="flex justify-end mt-2">
                      <button pButton label="Save Notes" icon="pi pi-check" class="p-button-sm" severity="success"></button>
                    </div>
                    <p-divider />
                    <div class="space-y-3">
                      @for (note of customer().noteHistory; track note.date) {
                        <div class="bg-gray-50 rounded-lg p-3">
                          <p class="text-sm text-gray-700">{{ note.text }}</p>
                          <p class="text-xs text-gray-400 mt-1">{{ note.author }} · {{ note.date }}</p>
                        </div>
                      }
                    </div>
                  </div>
                </p-tabpanel>

                <!-- Activity -->
                <p-tabpanel value="2">
                  <div class="p-4 space-y-3">
                    @for (event of customer().activity; track event.date) {
                      <div class="flex gap-3">
                        <div class="flex flex-col items-center">
                          <div [class]="'w-7 h-7 rounded-full flex items-center justify-center ' + event.iconBg">
                            <i [class]="'pi ' + event.icon + ' text-white'" style="font-size:0.7rem"></i>
                          </div>
                          <div class="w-0.5 flex-1 bg-gray-100 my-1"></div>
                        </div>
                        <div class="flex-1 pb-3">
                          <p class="text-sm text-gray-800 font-medium">{{ event.label }}</p>
                          <p class="text-xs text-gray-400">{{ event.date }}</p>
                        </div>
                      </div>
                    }
                  </div>
                </p-tabpanel>
              </p-tabpanels>
            </p-tabs>
          </div>
        </div>
      </div>

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
    </div>
  `,
})
export class CustomerDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);

  tagDialog = false;
  newTag = '';
  notes = '';

  customer = signal({
    name: 'Amara Okonkwo',
    phone: '+234 812 345 6789',
    email: 'amara@example.com',
    status: 'active' as const,
    totalOrders: 8,
    totalSpent: 284500,
    tags: ['VIP', 'loyal', 'electronics'],
    addresses: [
      { label: 'Home', full: '45 Adeola Odeku Street, Victoria Island, Lagos, Nigeria' },
      { label: 'Office', full: '12 Broad Street, Lagos Island, Lagos, Nigeria' },
    ],
    orders: [
      { id: '1', number: 'ORD-0089', items: 3, total: 47500, status: 'confirmed', date: 'May 4, 2026' },
      { id: '3', number: 'ORD-0087', items: 5, total: 91500, status: 'completed', date: 'Apr 28, 2026' },
      { id: '5', number: 'ORD-0073', items: 2, total: 34000, status: 'completed', date: 'Mar 15, 2026' },
      { id: '7', number: 'ORD-0061', items: 1, total: 22000, status: 'completed', date: 'Feb 10, 2026' },
    ],
    noteHistory: [
      { text: 'Customer prefers delivery between 10am - 2pm. Always call ahead.', author: 'Admin', date: 'Apr 20, 2026' },
      { text: 'VIP customer — expedite all orders. Give 5% loyalty discount.', author: 'Manager', date: 'Jan 15, 2026' },
    ],
    activity: [
      { label: 'Placed order ORD-0089', icon: 'pi-shopping-cart', iconBg: 'bg-blue-500', date: 'May 4, 2026' },
      { label: 'Payment verified for ORD-0087', icon: 'pi-check-circle', iconBg: 'bg-green-500', date: 'Apr 28, 2026' },
      { label: 'Sent message to support', icon: 'pi-comments', iconBg: 'bg-primary-500', date: 'Apr 25, 2026' },
      { label: 'Placed order ORD-0087', icon: 'pi-shopping-cart', iconBg: 'bg-blue-500', date: 'Apr 24, 2026' },
      { label: 'Account created', icon: 'pi-user', iconBg: 'bg-purple-500', date: 'Jan 10, 2025' },
    ],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = { active: 'success', blocked: 'danger', unsubscribed: 'secondary' };
    return map[status] ?? 'info';
  }

  getOrderSeverity(status: string): any {
    const map: Record<string, any> = { pending: 'warn', confirmed: 'info', completed: 'success', canceled: 'danger' };
    return map[status] ?? 'secondary';
  }

  addTag() {
    if (!this.newTag.trim()) return;
    this.customer.update(c => ({ ...c, tags: [...c.tags, this.newTag.trim()] }));
    this.newTag = '';
    this.tagDialog = false;
    this.messageService.add({ severity: 'success', summary: 'Tag Added' });
  }

  removeTag(tag: string) {
    this.customer.update(c => ({ ...c, tags: c.tags.filter(t => t !== tag) }));
  }
}
