import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { DividerModule } from 'primeng/divider';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { BillingService, WalletInfo, WalletTransaction, PaymentRecord, RazorpayOrderResult } from '../../core/services/billing.service';

declare var Razorpay: any;

@Component({
  selector: 'app-billing-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, TableModule, TagModule, DialogModule,
    InputTextModule, InputNumberModule, ToastModule, DividerModule, ToggleSwitchModule,
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <div class="mb-6">
      <h1 class="text-2xl font-bold text-surface-900">Billing & Wallet</h1>
      <p class="text-surface-500 mt-1">Manage your wallet balance, top-ups, and payment history</p>
    </div>

    <!-- Wallet Card -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <p-card styleClass="border-2 border-primary-200">
        <div class="text-center">
          <div class="text-sm text-surface-500 mb-1">Wallet Balance</div>
          <div class="text-4xl font-bold text-primary">
            ₹{{ wallet()?.balance | number:'1.2-2' }}
          </div>
          <p-button label="Add Money" icon="pi pi-plus" class="mt-4" (onClick)="showTopupDialog = true" />
        </div>
      </p-card>

      <p-card>
        <div class="text-center">
          <div class="text-sm text-surface-500 mb-1">This Month's Spend</div>
          <div class="text-2xl font-bold text-orange-500">
            ₹{{ monthlySpend() | number:'1.2-2' }}
          </div>
          <div class="text-xs text-surface-400 mt-2">Based on conversation charges</div>
        </div>
      </p-card>

      <p-card>
        <div class="text-center">
          <div class="text-sm text-surface-500 mb-1">Auto Recharge</div>
          <div class="mt-2">
            <p-toggleswitch [(ngModel)]="autoRecharge" (onChange)="updateAutoRecharge()" />
          </div>
          @if (autoRecharge) {
            <div class="text-xs text-surface-500 mt-2">
              Top-up ₹{{ wallet()?.autoRechargeAmount }} when below ₹{{ wallet()?.autoRechargeThreshold }}
            </div>
          }
        </div>
      </p-card>
    </div>

    <!-- Quick Top-up Buttons -->
    <p-card header="Quick Top-up" styleClass="mb-6">
      <div class="flex flex-wrap gap-3">
        @for (amt of quickAmounts; track amt) {
          <p-button [label]="'₹' + amt" [outlined]="true" severity="info" (onClick)="initiateTopup(amt)" />
        }
        <p-button label="Custom Amount" icon="pi pi-pencil" severity="secondary" (onClick)="showTopupDialog = true" />
      </div>
    </p-card>

    <!-- Transaction History -->
    <p-card header="Transaction History">
      <p-table [value]="transactions()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="true" [rows]="15">
        <ng-template pTemplate="header">
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Balance After</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-txn>
          <tr>
            <td class="text-xs">{{ txn.createdAt | date:'medium' }}</td>
            <td>
              <p-tag [value]="txn.type" [severity]="txn.type === 'credit' ? 'success' : 'warn'" />
            </td>
            <td class="text-sm">{{ txn.description }}</td>
            <td [class]="txn.type === 'credit' ? 'text-green-600 font-bold' : 'text-red-500 font-bold'">
              {{ txn.type === 'credit' ? '+' : '' }}₹{{ txn.amount | number:'1.2-2' }}
            </td>
            <td class="font-medium">₹{{ txn.balanceAfter | number:'1.2-2' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="5" class="text-center py-8 text-surface-400">No transactions yet. Add money to get started.</td></tr>
        </ng-template>
      </p-table>
    </p-card>

    <!-- Top-up Dialog -->
    <p-dialog header="Add Money to Wallet" [(visible)]="showTopupDialog" [modal]="true" [style]="{ width: '25rem' }">
      <div class="flex flex-col gap-4 pt-4">
        <div>
          <label class="block text-sm font-medium mb-1">Amount (₹)</label>
          <p-inputNumber [(ngModel)]="topupAmount" [min]="1" [max]="100000" mode="currency" currency="INR" locale="en-IN" styleClass="w-full" />
        </div>
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p class="text-xs text-blue-700">
            <i class="pi pi-info-circle mr-1"></i>
            Amount will be charged via Razorpay. Supports UPI, Cards, Net Banking.
          </p>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" (onClick)="showTopupDialog = false" />
        <p-button label="Pay Now" icon="pi pi-credit-card" (onClick)="initiateTopup(topupAmount)" [loading]="paying()" />
      </ng-template>
    </p-dialog>
  `,
})
export class BillingDashboardComponent implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly messageService = inject(MessageService);

  wallet = signal<WalletInfo | null>(null);
  transactions = signal<WalletTransaction[]>([]);
  loading = signal(false);
  paying = signal(false);

  showTopupDialog = false;
  topupAmount = 500;
  autoRecharge = false;

  quickAmounts = [100, 500, 1000, 2000, 5000];

  private razorpayKeyId = '';

  ngOnInit(): void {
    this.loadWallet();
    this.loadTransactions();
    this.billing.getRazorpayConfig().subscribe({
      next: (config) => this.razorpayKeyId = config.keyId,
    });
  }

  monthlySpend(): number {
    const txns = this.transactions();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return txns
      .filter(t => t.type === 'debit' && new Date(t.createdAt) >= monthStart)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }

  loadWallet(): void {
    this.billing.getWallet().subscribe({
      next: (w) => {
        this.wallet.set(w);
        this.autoRecharge = w.autoRecharge;
      },
    });
  }

  loadTransactions(): void {
    this.loading.set(true);
    this.billing.getTransactions(100).subscribe({
      next: (res) => {
        this.transactions.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  initiateTopup(amount: number): void {
    if (amount < 1) return;
    this.paying.set(true);
    this.showTopupDialog = false;

    this.billing.createTopup(amount).subscribe({
      next: (order) => {
        this.paying.set(false);
        this.openRazorpayCheckout(order);
      },
      error: (err) => {
        this.paying.set(false);
        this.messageService.add({ severity: 'error', summary: 'Failed', detail: err.error?.message || 'Failed to create order' });
      },
    });
  }

  openRazorpayCheckout(order: RazorpayOrderResult): void {
    const options = {
      key: order.keyId || this.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      name: 'WA Commerce',
      description: 'Wallet Top-up',
      order_id: order.razorpayOrderId,
      handler: (response: any) => {
        this.billing.verifyPayment({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        }).subscribe({
          next: (result) => {
            if (result.verified) {
              this.messageService.add({ severity: 'success', summary: 'Payment Successful', detail: 'Wallet topped up!' });
              this.loadWallet();
              this.loadTransactions();
            } else {
              this.messageService.add({ severity: 'error', summary: 'Verification Failed', detail: result.message });
            }
          },
        });
      },
      prefill: {},
      theme: { color: '#6366f1' },
    };

    const rzp = new Razorpay(options);
    rzp.open();
  }

  updateAutoRecharge(): void {
    this.billing.updateWalletSettings({ autoRecharge: this.autoRecharge }).subscribe({
      next: () => this.messageService.add({ severity: 'success', summary: 'Updated' }),
    });
  }
}
