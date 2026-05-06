import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import { Delivery, DeliveryStatus, Address, PaginatedResponse } from '../models';

export interface DeliveryListParams extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: DeliveryStatus;
  orderId?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateDeliveryPayload {
  orderId: string;
  deliveryAddress: Address;
  courierName?: string;
  courierPhone?: string;
  estimatedDeliveryAt?: string;
  deliveryNotes?: string;
}

export interface UpdateDeliveryPayload {
  courierName?: string;
  courierPhone?: string;
  trackingNumber?: string;
  estimatedDeliveryAt?: string;
  deliveryNotes?: string;
}

export interface AssignCourierPayload {
  courierName: string;
  courierPhone?: string;
  estimatedDeliveryAt?: string;
}

export interface DeliveryStats {
  total: number;
  pending: number;
  assigned: number;
  inTransit: number;
  delivered: number;
  failed: number;
  deliveryRate: number;   // percentage of successful deliveries
  averageDeliveryHours: number;
}

@Injectable({ providedIn: 'root' })
export class DeliveryService {
  private readonly api = inject(ApiService);

  getAll(params?: DeliveryListParams): Observable<PaginatedResponse<Delivery>> {
    return this.api.get<PaginatedResponse<Delivery>>('/deliveries', params);
  }

  getById(id: string): Observable<Delivery> {
    return this.api.get<Delivery>(`/deliveries/${id}`);
  }

  getByOrderId(orderId: string): Observable<Delivery> {
    return this.api.get<Delivery>(`/orders/${orderId}/delivery`);
  }

  create(payload: CreateDeliveryPayload): Observable<Delivery> {
    return this.api.post<Delivery>('/deliveries', payload);
  }

  update(id: string, payload: UpdateDeliveryPayload): Observable<Delivery> {
    return this.api.patch<Delivery>(`/deliveries/${id}`, payload);
  }

  /**
   * Assign (or re-assign) a courier to a delivery.
   */
  assignCourier(id: string, payload: AssignCourierPayload): Observable<Delivery> {
    return this.api.post<Delivery>(`/deliveries/${id}/assign`, payload);
  }

  /**
   * Mark the delivery as picked up by the courier.
   */
  markPickedUp(id: string): Observable<Delivery> {
    return this.api.post<Delivery>(`/deliveries/${id}/pickup`, {});
  }

  /**
   * Mark the delivery as successfully delivered.
   * Optionally upload proof-of-delivery.
   */
  markDelivered(id: string, proofImageUrl?: string): Observable<Delivery> {
    return this.api.post<Delivery>(`/deliveries/${id}/delivered`, { proofImageUrl });
  }

  /**
   * Mark a delivery attempt as failed and provide a reason.
   */
  markFailed(id: string, reason: string): Observable<Delivery> {
    return this.api.post<Delivery>(`/deliveries/${id}/failed`, { reason });
  }

  /**
   * Upload a proof-of-delivery image.
   */
  uploadProof(deliveryId: string, file: FormData): Observable<{ proofImageUrl: string }> {
    return this.api.http.post<{ proofImageUrl: string }>(
      this.api.url(`/deliveries/${deliveryId}/proof`),
      file,
    );
  }

  /**
   * Get aggregate delivery statistics.
   */
  getStats(params?: { dateFrom?: string; dateTo?: string }): Observable<DeliveryStats> {
    return this.api.get<DeliveryStats>('/deliveries/stats', params);
  }
}
