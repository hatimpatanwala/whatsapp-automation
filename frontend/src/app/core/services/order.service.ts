import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import { Order, OrderStats, OrderStatus, PaginatedResponse } from '../models';

export interface OrderListParams extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateOrderPayload {
  customerId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
  }>;
  shippingAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  notes?: string;
  conversationId?: string;
  discountAmount?: number;
  shippingAmount?: number;
  taxAmount?: number;
}

export interface UpdateOrderStatusPayload {
  status: OrderStatus;
  notes?: string;
  cancelReason?: string;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly api = inject(ApiService);

  getAll(params?: OrderListParams): Observable<PaginatedResponse<Order>> {
    return this.api.get<PaginatedResponse<Order>>('/orders', params);
  }

  getById(id: string): Observable<Order> {
    return this.api.get<Order>(`/orders/${id}`);
  }

  getByOrderNumber(orderNumber: string): Observable<Order> {
    return this.api.get<Order>(`/orders/number/${orderNumber}`);
  }

  create(payload: CreateOrderPayload): Observable<Order> {
    return this.api.post<Order>('/orders', payload);
  }

  update(id: string, payload: Partial<CreateOrderPayload>): Observable<Order> {
    return this.api.patch<Order>(`/orders/${id}`, payload);
  }

  updateStatus(id: string, payload: UpdateOrderStatusPayload): Observable<Order> {
    // Backend route is PUT /orders/:id/status (a PATCH here 404s).
    return this.api.put<Order>(`/orders/${id}/status`, payload);
  }

  /** Full order edit: replace items / adjust discount, delivery fee, notes, status. */
  updateOrder(id: string, payload: {
    items?: Array<{ productId?: string; productName?: string; quantity: number; unitPrice: number }>;
    discount?: number;
    deliveryFee?: number;
    notes?: string;
    status?: string;
  }): Observable<Order> {
    return this.api.put<Order>(`/orders/${id}`, payload);
  }

  confirm(id: string): Observable<Order> {
    return this.updateStatus(id, { status: 'confirmed' });
  }

  cancel(id: string, reason: string): Observable<Order> {
    return this.updateStatus(id, { status: 'canceled', cancelReason: reason });
  }

  markShipped(id: string, trackingInfo?: { trackingNumber?: string; courierName?: string }): Observable<Order> {
    return this.api.patch<Order>(`/orders/${id}/ship`, trackingInfo ?? {});
  }

  markDelivered(id: string): Observable<Order> {
    return this.updateStatus(id, { status: 'delivered' });
  }

  /**
   * Retrieve aggregate order statistics for the tenant dashboard.
   */
  getStats(params?: { dateFrom?: string; dateTo?: string }): Observable<OrderStats> {
    return this.api.get<OrderStats>('/orders/stats', params);
  }

  /**
   * Export orders to CSV. Returns a Blob.
   */
  exportCsv(params?: OrderListParams): Observable<Blob> {
    const httpParams = this.api.buildParams(params);
    return this.api.http.get(this.api.url('/orders/export'), {
      params: httpParams,
      responseType: 'blob',
    });
  }

  /**
   * Get orders for a specific customer.
   */
  getByCustomer(customerId: string, params?: QueryParams): Observable<PaginatedResponse<Order>> {
    return this.api.get<PaginatedResponse<Order>>(`/customers/${customerId}/orders`, params);
  }
}
