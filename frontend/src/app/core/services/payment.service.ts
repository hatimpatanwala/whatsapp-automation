import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import { Payment, PaymentMethod, PaymentVerificationStatus, PaginatedResponse } from '../models';

export interface PaymentListParams extends QueryParams {
  page?: number;
  limit?: number;
  orderId?: string;
  customerId?: string;
  method?: PaymentMethod;
  verificationStatus?: PaymentVerificationStatus;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreatePaymentPayload {
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  externalTransactionId?: string;
}

export interface VerifyPaymentPayload {
  notes?: string;
}

export interface RejectPaymentPayload {
  reason: string;
  notes?: string;
}

export interface PaymentSummary {
  totalPayments: number;
  totalAmount: number;
  pendingCount: number;
  verifiedCount: number;
  rejectedCount: number;
  pendingAmount: number;
  verifiedAmount: number;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly api = inject(ApiService);

  getAll(params?: PaymentListParams): Observable<PaginatedResponse<Payment>> {
    return this.api.get<PaginatedResponse<Payment>>('/payments', params);
  }

  getById(id: string): Observable<Payment> {
    return this.api.get<Payment>(`/payments/${id}`);
  }

  getByOrderId(orderId: string): Observable<Payment[]> {
    return this.api.get<Payment[]>(`/orders/${orderId}/payments`);
  }

  create(payload: CreatePaymentPayload): Observable<Payment> {
    return this.api.post<Payment>('/payments', payload);
  }

  /**
   * Upload a proof-of-payment image (e.g. bank transfer screenshot).
   * Returns the stored URL of the uploaded image.
   */
  uploadProof(paymentId: string, file: FormData): Observable<{ proofImageUrl: string }> {
    return this.api.http.post<{ proofImageUrl: string }>(
      this.api.url(`/payments/${paymentId}/proof`),
      file,
    );
  }

  /**
   * Verify a payment as legitimate after manual review.
   */
  verify(id: string, payload?: VerifyPaymentPayload): Observable<Payment> {
    return this.api.post<Payment>(`/payments/${id}/verify`, payload ?? {});
  }

  /**
   * Reject a payment (e.g. fraudulent or incorrect amount).
   */
  reject(id: string, payload: RejectPaymentPayload): Observable<Payment> {
    return this.api.post<Payment>(`/payments/${id}/reject`, payload);
  }

  /**
   * Mark a payment as disputed.
   */
  dispute(id: string, reason: string): Observable<Payment> {
    return this.api.post<Payment>(`/payments/${id}/dispute`, { reason });
  }

  /**
   * Retrieve aggregate payment statistics.
   */
  getSummary(params?: { dateFrom?: string; dateTo?: string }): Observable<PaymentSummary> {
    return this.api.get<PaymentSummary>('/payments/summary', params);
  }
}
