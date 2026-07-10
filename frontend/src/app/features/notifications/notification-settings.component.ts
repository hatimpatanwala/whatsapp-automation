import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

interface NotifType { key: string; label: string; desc: string; icon: string; }

const TYPES: NotifType[] = [
  { key: 'order', label: 'New orders', desc: 'A customer or salesman places an order', icon: 'pi-shopping-cart' },
  { key: 'payment', label: 'Payments received', desc: 'A payment is collected/verified', icon: 'pi-wallet' },
  { key: 'invoice', label: 'Invoices & challans', desc: 'An invoice, bill of supply or delivery challan is created', icon: 'pi-receipt' },
  { key: 'quote', label: 'New quotes', desc: 'A quotation is created', icon: 'pi-file-edit' },
  { key: 'customer', label: 'New customers', desc: 'A customer is added', icon: 'pi-user-plus' },
  { key: 'low_stock', label: 'Low stock alerts', desc: 'An item drops below its reorder level', icon: 'pi-exclamation-triangle' },
  { key: 'purchase', label: 'Purchases', desc: 'A purchase / supplier bill is recorded', icon: 'pi-shopping-bag' },
];

/**
 * Notification preferences — which business events push to the app (and the
 * portal bell). Applies per tenant. Push delivery reaches every device signed
 * into the mobile app.
 */
@Component({
  selector: 'wa-notification-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-2xl mx-auto p-6">
      <div class="flex items-center gap-3 mb-1">
        <i class="pi pi-bell text-primary-600" style="font-size:1.3rem"></i>
        <h1 class="text-xl font-bold text-gray-900">Notifications</h1>
      </div>
      <p class="text-sm text-gray-500 mb-5">Choose which business events send a push notification to your app (and show in the bell). Turn off anything you don't need.</p>

      <div class="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50 shadow-sm">
        @for (t of types; track t.key) {
          <div class="flex items-center gap-3 p-4">
            <i [class]="'pi ' + t.icon + ' text-gray-400'" style="font-size:1.05rem"></i>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-gray-800">{{ t.label }}</p>
              <p class="text-xs text-gray-400">{{ t.desc }}</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" class="sr-only peer" [ngModel]="prefs()[t.key] !== false" (ngModelChange)="toggle(t.key, $event)" />
              <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-primary-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
            </label>
          </div>
        }
      </div>

      @if (saved()) { <p class="text-sm text-emerald-600 mt-3">✓ Saved</p> }
      <p class="text-xs text-gray-400 mt-4">On the mobile app you'll get a native notification even when the app is closed. Push delivery requires the app's Firebase (FCM) setup — see MOBILE.md.</p>
    </div>
  `,
})
export class NotificationSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly types = TYPES;
  readonly prefs = signal<Record<string, boolean>>({});
  readonly saved = signal(false);

  ngOnInit() {
    this.api.get<Record<string, boolean>>('/notifications/prefs').subscribe({
      next: (p) => this.prefs.set(p || {}),
      error: () => this.prefs.set({}),
    });
  }

  toggle(key: string, value: boolean) {
    const next = { ...this.prefs(), [key]: value };
    this.prefs.set(next);
    this.api.patch('/notifications/prefs', next).subscribe({
      next: () => { this.saved.set(true); setTimeout(() => this.saved.set(false), 2000); },
      error: () => {},
    });
  }
}
