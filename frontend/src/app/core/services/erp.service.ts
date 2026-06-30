import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface ErpStatus {
  enabled: boolean;
  features: Record<string, boolean>;
  provisioned: boolean;
}

export interface PaymentMode {
  id: string;
  name: string;
  description?: string;
  ref?: string;
  isDefault?: boolean;
  enabled?: boolean;
}

export interface InvoiceLine {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
}

export interface InvoicePayment {
  id: string;
  amount: string | number;
  paymentModeId?: string | null;
  ref?: string | null;
  description?: string | null;
  status: string;
  createdAt: string;
}

export interface ErpInvoice {
  id: string;
  invoiceNumber: string;
  year: number;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  subtotal: string | number;
  discount: string | number;
  taxableValue: string | number;
  totalTax: string | number;
  total: string | number;
  amountPaid: string | number;
  balanceDue: string | number;
  currency?: string;
  exchangeRate?: string | number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  status: string;
  dueDate?: string | null;
  note?: string | null;
  items?: InvoiceLine[];
  payments?: InvoicePayment[];
  issuedAt?: string;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateInvoicePayload {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: { productId?: string; description: string; quantity: number; unitPrice: number }[];
  taxRate?: number;
  discount?: number;
  dueDate?: string;
  note?: string;
  status?: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string;
}

@Injectable({ providedIn: 'root' })
export class ErpService {
  private readonly api = inject(ApiService);

  // ─── meta ──────────────────────────────────────────────────────────────────
  status(): Observable<ErpStatus> {
    return this.api.get<ErpStatus>('/erp/status');
  }
  dashboard(): Observable<any> {
    return this.api.get<any>('/erp/dashboard');
  }
  listCurrencies(): Observable<{ data: any[]; total: number }> {
    return this.api.get('/erp/currencies');
  }
  provision(): Observable<{ provisioned: boolean; alreadyProvisioned: boolean }> {
    return this.api.post('/erp/provision', {});
  }

  // ─── payment modes ───────────────────────────────────────────────────────────
  listPaymentModes(): Observable<Paginated<PaymentMode>> {
    return this.api.get<Paginated<PaymentMode>>('/erp/payment-modes', { enabled: true });
  }
  createPaymentMode(payload: Partial<PaymentMode>): Observable<PaymentMode> {
    return this.api.post('/erp/payment-modes', payload);
  }

  // ─── invoices ────────────────────────────────────────────────────────────────
  listInvoices(params?: { status?: string; paymentStatus?: string; customerId?: string; page?: number; limit?: number }): Observable<Paginated<ErpInvoice>> {
    return this.api.get<Paginated<ErpInvoice>>('/erp/invoices', params as any);
  }
  getInvoice(id: string): Observable<ErpInvoice> {
    return this.api.get<ErpInvoice>(`/erp/invoices/${id}`);
  }
  createInvoice(payload: CreateInvoicePayload): Observable<ErpInvoice> {
    return this.api.post('/erp/invoices', payload);
  }
  recordPayment(id: string, payload: { amount: number; paymentModeId?: string; ref?: string; description?: string }): Observable<{ invoice: ErpInvoice; payment: InvoicePayment }> {
    return this.api.post(`/erp/invoices/${id}/payments`, payload);
  }

  /** Absolute URL to the invoice PDF stream (same-origin → session cookie is sent). */
  invoicePdfUrl(id: string): string {
    return this.api.url(`/erp/invoices/${id}/pdf`);
  }

  /** Send a WhatsApp payment reminder for one invoice. */
  remindInvoice(id: string): Observable<{ sent: number; reason?: string; invoiceNumber?: string }> {
    return this.api.post(`/erp/reminders/invoice/${id}`, {});
  }
}
