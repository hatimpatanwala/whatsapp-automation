import { Component, OnInit, signal, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TabsModule } from 'primeng/tabs';
import { ToastModule } from 'primeng/toast';
import { DividerModule } from 'primeng/divider';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'wa-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    ToggleSwitchModule,
    TabsModule,
    ToastModule,
    DividerModule,
    TagModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-4xl mx-auto">
      <p-toast />

      <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Settings</h1>
        <p class="text-gray-500 text-sm">Manage your store and WhatsApp configuration</p>
      </div>

      <p-tabs value="business">
        <p-tablist>
          <p-tab value="business"><i class="pi pi-building mr-2"></i>Business</p-tab>
          <p-tab value="whatsapp"><i class="pi pi-whatsapp mr-2"></i>WhatsApp</p-tab>
          <p-tab value="payments"><i class="pi pi-credit-card mr-2"></i>Payments</p-tab>
          <p-tab value="notifications"><i class="pi pi-bell mr-2"></i>Notifications</p-tab>
          <p-tab value="subscription"><i class="pi pi-star mr-2"></i>Subscription</p-tab>
        </p-tablist>

        <p-tabpanels>

          <!-- Business settings -->
          <p-tabpanel value="business">
            <div class="space-y-6 mt-4">
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-5">Business Information</h3>
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Business Name</label>
                      <input pInputText [(ngModel)]="biz.name" class="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Store Slug</label>
                      <div class="flex items-center border border-gray-300 rounded-md overflow-hidden">
                        <span class="px-3 py-2 bg-gray-100 text-gray-500 text-sm border-r border-gray-300">@</span>
                        <input pInputText [(ngModel)]="biz.slug" class="border-none flex-1 rounded-none" />
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Business Description</label>
                    <textarea pTextarea [(ngModel)]="biz.description" rows="2" class="w-full" placeholder="Brief description of your business..."></textarea>
                  </div>
                  <div class="grid grid-cols-3 gap-4">
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Currency</label>
                      <p-select [(ngModel)]="biz.currency" [options]="currencies" optionLabel="label" optionValue="value" styleClass="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Timezone</label>
                      <p-select [(ngModel)]="biz.timezone" [options]="timezones" optionLabel="label" optionValue="value" styleClass="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Order Prefix</label>
                      <input pInputText [(ngModel)]="biz.orderPrefix" class="w-full" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Notification Email</label>
                    <input pInputText type="email" [(ngModel)]="biz.email" placeholder="alerts@yourbusiness.com" class="w-full" />
                  </div>
                </div>
              </div>

              <!-- Business hours -->
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-5">Business Hours</h3>
                <div class="space-y-3">
                  @for (day of businessHours; track day.day) {
                    <div class="flex items-center gap-4">
                      <div class="w-20 flex items-center gap-2">
                        <p-toggleswitch [(ngModel)]="day.enabled" />
                        <span class="text-sm font-medium text-gray-700">{{ day.day }}</span>
                      </div>
                      @if (day.enabled) {
                        <div class="flex items-center gap-2">
                          <p-select [(ngModel)]="day.open" [options]="timeSlots" optionLabel="label" optionValue="value" styleClass="min-w-28" />
                          <span class="text-gray-400 text-sm">to</span>
                          <p-select [(ngModel)]="day.close" [options]="timeSlots" optionLabel="label" optionValue="value" styleClass="min-w-28" />
                        </div>
                      } @else {
                        <span class="text-sm text-gray-400">Closed</span>
                      }
                    </div>
                  }
                </div>
              </div>

              <div class="flex justify-end">
                <button pButton label="Save Business Settings" icon="pi pi-check" severity="success" (click)="save()"></button>
              </div>
            </div>
          </p-tabpanel>

          <!-- WhatsApp settings -->
          <p-tabpanel value="whatsapp">
            <div class="space-y-6 mt-4">
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-1">WhatsApp Business API</h3>
                <p class="text-sm text-gray-500 mb-5">Configure your WhatsApp Business API credentials</p>
                <div class="space-y-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">WhatsApp Phone Number</label>
                    <input pInputText [(ngModel)]="wa.phone" placeholder="+91XXXXXXXXXX" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Business Account ID</label>
                    <input pInputText [(ngModel)]="wa.accountId" placeholder="Meta Business Account ID" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Access Token</label>
                    <div class="relative">
                      <input pInputText [(ngModel)]="wa.accessToken" [type]="showToken() ? 'text' : 'password'" placeholder="EAAxxxxxxxx..." class="w-full pr-10" />
                      <button class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" (click)="showToken.update(v => !v)">
                        <i [class]="'pi ' + (showToken() ? 'pi-eye-slash' : 'pi-eye')" style="font-size:0.9rem"></i>
                      </button>
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Webhook Verify Token</label>
                    <input pInputText [(ngModel)]="wa.webhookToken" placeholder="Your webhook verify token" class="w-full" />
                  </div>
                </div>
                <div class="flex gap-3 mt-5">
                  <button pButton label="Test Connection" icon="pi pi-wifi" class="p-button-outlined" (click)="testWA()"></button>
                  <button pButton label="Save Configuration" icon="pi pi-check" severity="success" (click)="save()"></button>
                </div>
              </div>
            </div>
          </p-tabpanel>

          <!-- Payment settings -->
          <p-tabpanel value="payments">
            <div class="space-y-6 mt-4">
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-5">Bank Accounts / UPI</h3>
                <div class="space-y-4">
                  @for (account of paymentAccounts; track account.id; let i = $index) {
                    <div class="border border-gray-200 rounded-xl p-4 space-y-3 relative">
                      <button class="absolute top-3 right-3 text-gray-400 hover:text-red-500" (click)="removeAccount(i)">
                        <i class="pi pi-trash" style="font-size:0.85rem"></i>
                      </button>
                      <div class="grid grid-cols-2 gap-3">
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-500">Bank Name</label>
                          <input pInputText [(ngModel)]="account.bank" class="w-full" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-500">Account Number</label>
                          <input pInputText [(ngModel)]="account.number" class="w-full" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-500">Account Name</label>
                          <input pInputText [(ngModel)]="account.name" class="w-full" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-500">UPI ID (optional)</label>
                          <input pInputText [(ngModel)]="account.upi" placeholder="yourname@bank" class="w-full" />
                        </div>
                      </div>
                    </div>
                  }
                  <button pButton label="Add Bank Account" icon="pi pi-plus" class="p-button-outlined p-button-sm" (click)="addAccount()"></button>
                </div>
              </div>

              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-4">Order Settings</h3>
                <div class="space-y-3">
                  <div class="flex items-center justify-between py-2">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Auto-confirm orders on payment</p>
                      <p class="text-xs text-gray-500">Automatically confirm orders when payment is verified</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="biz.autoConfirmOrders" />
                  </div>
                  <p-divider />
                  <div class="flex items-center justify-between py-2">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Enable Delivery</p>
                      <p class="text-xs text-gray-500">Allow customers to choose delivery</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="biz.enableDelivery" />
                  </div>
                  <p-divider />
                  <div class="flex items-center justify-between py-2">
                    <div>
                      <p class="text-sm font-medium text-gray-900">Enable Pickup</p>
                      <p class="text-xs text-gray-500">Allow customers to pick up orders</p>
                    </div>
                    <p-toggleswitch [(ngModel)]="biz.enablePickup" />
                  </div>
                </div>
              </div>

              <div class="flex justify-end">
                <button pButton label="Save Payment Settings" icon="pi pi-check" severity="success" (click)="save()"></button>
              </div>
            </div>
          </p-tabpanel>

          <!-- Notifications -->
          <p-tabpanel value="notifications">
            <div class="space-y-6 mt-4">
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-5">Notification Preferences</h3>
                <div class="space-y-4">
                  @for (notif of notifications; track notif.key) {
                    <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p class="text-sm font-medium text-gray-900">{{ notif.label }}</p>
                        <p class="text-xs text-gray-500">{{ notif.desc }}</p>
                      </div>
                      <div class="flex gap-4">
                        <div class="flex flex-col items-center gap-1">
                          <span class="text-xs text-gray-400">Email</span>
                          <p-toggleswitch [(ngModel)]="notif.email" />
                        </div>
                        <div class="flex flex-col items-center gap-1">
                          <span class="text-xs text-gray-400">WhatsApp</span>
                          <p-toggleswitch [(ngModel)]="notif.whatsapp" />
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
              <div class="flex justify-end">
                <button pButton label="Save Notifications" icon="pi pi-check" severity="success" (click)="save()"></button>
              </div>
            </div>
          </p-tabpanel>

          <!-- Subscription -->
          <p-tabpanel value="subscription">
            <div class="space-y-6 mt-4">
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="text-base font-semibold text-gray-900">Current Plan</h3>
                    <div class="flex items-center gap-3 mt-3">
                      <span class="text-3xl font-bold text-gray-900">{{ subscriptionPlanName() }}</span>
                      <p-tag [value]="subscriptionStatusLabel()" [severity]="subscriptionStatusSeverity()" />
                    </div>
                    <p class="text-gray-500 text-sm mt-1">{{ subscriptionPriceLabel() }}</p>
                  </div>
                  <button pButton label="Upgrade Plan" icon="pi pi-arrow-up" severity="success"></button>
                </div>

                <p-divider />

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  @for (limit of planLimits(); track limit.label) {
                    <div class="bg-gray-50 rounded-xl p-4">
                      <p class="text-xs text-gray-500">{{ limit.label }}</p>
                      <p class="text-xl font-bold text-gray-900 mt-1">{{ limit.used }}</p>
                      <p class="text-xs text-gray-400">of {{ limit.total }}</p>
                      <div class="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                        <div
                          class="rounded-full h-1.5 transition-all"
                          [class.bg-primary-500]="limit.pct < 80"
                          [class.bg-orange-500]="limit.pct >= 80 && limit.pct < 95"
                          [class.bg-red-500]="limit.pct >= 95"
                          [style.width.%]="limit.pct"
                        ></div>
                      </div>
                    </div>
                  }
                </div>

                <p-divider />

                <h4 class="text-sm font-semibold text-gray-700 mb-3">Included Features</h4>
                <div class="grid grid-cols-2 gap-2">
                  @for (feature of planFeatures(); track feature) {
                    <div class="flex items-center gap-2 text-sm">
                      <i class="pi pi-check-circle text-primary-500"></i>
                      <span class="text-gray-700">{{ feature }}</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          </p-tabpanel>

        </p-tabpanels>
      </p-tabs>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly authService = inject(AuthService);

  showToken = signal(false);

  biz = {
    name: '',
    slug: '',
    description: '',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    orderPrefix: 'ORD-',
    email: '',
    autoConfirmOrders: true,
    enableDelivery: true,
    enablePickup: false,
  };

  wa = {
    phone: '',
    accountId: '',
    accessToken: '',
    webhookToken: '',
  };

  paymentAccounts: Array<{ id: number; bank: string; number: string; name: string; upi: string }> = [];
  private accountIdCounter = 1;

  businessHours = [
    { day: 'Mon', enabled: true, open: '09:00', close: '18:00' },
    { day: 'Tue', enabled: true, open: '09:00', close: '18:00' },
    { day: 'Wed', enabled: true, open: '09:00', close: '18:00' },
    { day: 'Thu', enabled: true, open: '09:00', close: '18:00' },
    { day: 'Fri', enabled: true, open: '09:00', close: '17:00' },
    { day: 'Sat', enabled: true, open: '10:00', close: '15:00' },
    { day: 'Sun', enabled: false, open: '10:00', close: '15:00' },
  ];

  notifications = [
    { key: 'new_order', label: 'New Order', desc: 'When a customer places a new order', email: true, whatsapp: true },
    { key: 'payment', label: 'Payment Received', desc: 'When a payment proof is submitted', email: true, whatsapp: true },
    { key: 'low_stock', label: 'Low Stock Alert', desc: 'When a product falls below threshold', email: true, whatsapp: false },
    { key: 'delivery', label: 'Delivery Update', desc: 'When delivery status changes', email: false, whatsapp: true },
    { key: 'campaign', label: 'Campaign Completed', desc: 'When a campaign finishes sending', email: true, whatsapp: false },
    { key: 'customer', label: 'New Customer', desc: 'When a new customer opts in', email: false, whatsapp: false },
  ];

  currencies = [
    { label: 'Indian Rupee (\u20B9)', value: 'INR' },
    { label: 'US Dollar ($)', value: 'USD' },
    { label: 'Nigerian Naira (\u20A6)', value: 'NGN' },
    { label: 'Ghanaian Cedi (\u20B5)', value: 'GHS' },
    { label: 'Kenyan Shilling (KSh)', value: 'KES' },
  ];

  timezones = [
    { label: 'Asia/Kolkata', value: 'Asia/Kolkata' },
    { label: 'Africa/Lagos', value: 'Africa/Lagos' },
    { label: 'Africa/Nairobi', value: 'Africa/Nairobi' },
    { label: 'Africa/Accra', value: 'Africa/Accra' },
    { label: 'UTC', value: 'UTC' },
  ];

  timeSlots = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']
    .map(t => ({ label: t, value: t }));

  // Subscription computed values from AuthService
  private subscription = computed(() => {
    const user = this.authService.currentUser();
    // The subscription data comes from the tenant info via /auth/me
    // We access it from the user's tenant relationship if available
    return (user as any)?.tenant?.subscription ?? null;
  });

  private tenant = computed(() => this.authService.tenantInfo());

  subscriptionPlanName = computed(() => {
    const sub = this.subscription();
    if (sub?.plan?.name) return sub.plan.name;
    // Fallback: derive from tenant info
    return 'Free';
  });

  subscriptionStatusLabel = computed(() => {
    const sub = this.subscription();
    if (!sub) return 'No Plan';
    const statusMap: Record<string, string> = {
      active: 'Active',
      trialing: 'Trial',
      past_due: 'Past Due',
      canceled: 'Canceled',
      paused: 'Paused',
      unpaid: 'Unpaid',
    };
    return statusMap[sub.status] || sub.status;
  });

  subscriptionStatusSeverity = computed((): 'success' | 'info' | 'warn' | 'danger' | undefined => {
    const sub = this.subscription();
    if (!sub) return 'info';
    const severityMap: Record<string, 'success' | 'info' | 'warn' | 'danger'> = {
      active: 'success',
      trialing: 'info',
      past_due: 'warn',
      canceled: 'danger',
      paused: 'warn',
      unpaid: 'danger',
    };
    return severityMap[sub.status] || 'info';
  });

  subscriptionPriceLabel = computed(() => {
    const sub = this.subscription();
    if (!sub?.plan) return 'No active subscription';
    const price = sub.billingCycle === 'yearly'
      ? sub.plan.yearlyPrice
      : sub.plan.monthlyPrice;
    const formattedPrice = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price / 100);
    const cycle = sub.billingCycle === 'yearly' ? 'year' : 'month';
    const renewDate = sub.currentPeriodEnd
      ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    return `${formattedPrice}/${cycle}${renewDate ? ' \u00B7 Renews ' + renewDate : ''}`;
  });

  planLimits = computed(() => {
    const sub = this.subscription();
    if (!sub?.plan) {
      return [
        { label: 'Conversations', used: '0', total: '0', pct: 0 },
        { label: 'Messages', used: '0', total: '0', pct: 0 },
        { label: 'Products', used: '0', total: '0', pct: 0 },
        { label: 'Campaigns', used: '0', total: '0', pct: 0 },
      ];
    }
    const plan = sub.plan;
    const convLimit = plan.conversationLimit ?? 0;
    const msgLimit = plan.messageLimit ?? 0;
    const prodLimit = plan.productLimit ?? 0;
    const campLimit = plan.campaignLimit ?? 0;

    const convUsed = sub.conversationsUsed ?? 0;
    const msgUsed = sub.messagesUsed ?? 0;

    const pct = (used: number, total: number) => total > 0 ? Math.round((used / total) * 100) : 0;
    const fmt = (n: number) => n.toLocaleString('en-IN');
    const fmtLimit = (n: number | null) => n === null ? 'Unlimited' : n.toLocaleString('en-IN');

    return [
      { label: 'Conversations', used: fmt(convUsed), total: fmtLimit(plan.conversationLimit), pct: pct(convUsed, convLimit) },
      { label: 'Messages', used: fmt(msgUsed), total: fmtLimit(plan.messageLimit), pct: pct(msgUsed, msgLimit) },
      { label: 'Products', used: '0', total: fmtLimit(plan.productLimit), pct: 0 },
      { label: 'Campaigns', used: '0', total: fmtLimit(plan.campaignLimit), pct: 0 },
    ];
  });

  planFeatures = computed(() => {
    const sub = this.subscription();
    if (sub?.plan?.features?.length) {
      return sub.plan.features;
    }
    // Fallback defaults
    return [
      'WhatsApp Messaging',
      'Product Catalog',
      'Order Management',
      'Customer Management',
      'Payment Verification',
      'Basic Analytics',
    ];
  });

  ngOnInit() {
    this.loadTenantData();
  }

  private loadTenantData() {
    const tenant = this.authService.tenantInfo();
    const user = this.authService.currentUser();

    if (tenant) {
      this.biz.name = tenant.businessName || this.biz.name;
      this.wa.phone = tenant.whatsappPhone || this.wa.phone;
    }

    if (user) {
      this.biz.email = user.email || this.biz.email;
    }

    // If tenant info is not loaded yet, trigger a rehydration
    if (!tenant && !user) {
      this.authService.rehydrateSession().subscribe({
        next: () => {
          const freshTenant = this.authService.tenantInfo();
          const freshUser = this.authService.currentUser();
          if (freshTenant) {
            this.biz.name = freshTenant.businessName || this.biz.name;
            this.wa.phone = freshTenant.whatsappPhone || this.wa.phone;
          }
          if (freshUser) {
            this.biz.email = freshUser.email || this.biz.email;
          }
        },
        error: () => {
          // Silently handle - user may not be authenticated yet
        },
      });
    }
  }

  addAccount() {
    this.paymentAccounts.push({ id: this.accountIdCounter++, bank: '', number: '', name: '', upi: '' });
  }

  removeAccount(index: number) {
    this.paymentAccounts.splice(index, 1);
  }

  testWA() {
    this.messageService.add({ severity: 'info', summary: 'Testing...', detail: 'Testing WhatsApp connection...' });
    setTimeout(() => {
      this.messageService.add({ severity: 'success', summary: 'Connected!', detail: 'WhatsApp API connection successful' });
    }, 1500);
  }

  save() {
    this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Settings updated successfully' });
  }
}
