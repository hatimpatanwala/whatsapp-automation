import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface WalletInfo {
  balance: number;
  currency: string;
  autoRecharge: boolean;
  autoRechargeAmount: number;
  autoRechargeThreshold: number;
  lowBalanceAlertThreshold: number;
}

export interface WalletTransaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  referenceType: string | null;
  razorpayPaymentId: string | null;
  createdAt: string;
}

export interface RazorpayOrderResult {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface PaymentRecord {
  id: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  status: string;
  purpose: string;
  razorpayPaymentId: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly api = inject(ApiService);

  getWallet(): Observable<WalletInfo> {
    return this.api.get<WalletInfo>('/billing/wallet');
  }

  getTransactions(limit = 50, offset = 0): Observable<{ data: WalletTransaction[]; total: number }> {
    return this.api.get('/billing/wallet/transactions', { limit: limit.toString(), offset: offset.toString() });
  }

  updateWalletSettings(settings: Partial<WalletInfo>): Observable<any> {
    return this.api.post('/billing/wallet/settings', settings);
  }

  createTopup(amount: number): Observable<RazorpayOrderResult> {
    return this.api.post<RazorpayOrderResult>('/billing/topup', { amount });
  }

  createSubscriptionOrder(planId: string, amount: number): Observable<RazorpayOrderResult> {
    return this.api.post<RazorpayOrderResult>('/billing/subscribe', { planId, amount });
  }

  verifyPayment(data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Observable<{ verified: boolean; message: string }> {
    return this.api.post('/billing/verify', data);
  }

  getPayments(): Observable<PaymentRecord[]> {
    return this.api.get<PaymentRecord[]>('/billing/payments');
  }

  getRazorpayConfig(): Observable<{ keyId: string }> {
    return this.api.get('/billing/config');
  }
}
