import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface SchemeConditions {
  discountType?: 'percent' | 'amount';
  discountValue?: number;
  minQty?: number;
  minCartValue?: number;
  buyQty?: number;
  getQty?: number;
  getProductId?: string;
  // Loyalty / cumulative
  metric?: 'spend' | 'orders';
  target?: number;
  period?: 'lifetime' | 'monthly';
  minOrderValue?: number;
}

export interface Scheme {
  id: string;
  name: string;
  description?: string;
  type: 'instant' | 'cumulative';
  action: string;
  scope: 'all' | 'category' | 'brand' | 'product';
  scopeIds?: string[];
  scope_ids?: string[];
  conditions: SchemeConditions;
  reward?: Record<string, any>;
  weight: number;
  combinable: boolean;
  audience: 'all' | 'specific' | 'segment';
  audienceSegment?: string | null;
  customerIds?: string[];
  validFrom?: string | null;
  validUntil?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  status: string;
  createdAt?: string;
}

export interface ApplicableScheme {
  schemeId: string;
  name: string;
  description: string;
  action: string;
  scope: string;
  combinable: boolean;
  weight: number;
  discount: number;
  label: string;
}

export interface EvaluateResult {
  subtotal: number;
  applicable: ApplicableScheme[];
  recommendedIds: string[];
  discountTotal: number;
}

export interface SchemeBadges {
  all?: string;
  categories: Record<string, string>;
  brands: Record<string, string>;
  products: Record<string, string>;
}

export interface Coupon {
  id: string;
  code: string;
  description?: string;
  discount_type?: 'percent' | 'amount';
  discountType?: 'percent' | 'amount';
  discount_value?: number;
  discountValue?: number;
  min_cart_value?: number;
  minCartValue?: number;
  max_discount?: number | null;
  maxDiscount?: number | null;
  scope?: string;
  scopeIds?: string[];
  scope_ids?: string[];
  usage_limit?: number | null;
  usageLimit?: number | null;
  per_customer_limit?: number;
  perCustomerLimit?: number;
  used_count?: number;
  usedCount?: number;
  audience?: string;
  audienceSegment?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class SchemeService {
  private readonly api = inject(ApiService);

  list(params?: { status?: string; type?: string }): Observable<Scheme[]> {
    return this.api.get<Scheme[]>('/schemes', params as any);
  }

  getById(id: string): Observable<Scheme> {
    return this.api.get<Scheme>(`/schemes/${id}`);
  }

  create(payload: Partial<Scheme>): Observable<Scheme> {
    return this.api.post<Scheme>('/schemes', payload);
  }

  update(id: string, payload: Partial<Scheme>): Observable<Scheme> {
    return this.api.put<Scheme>(`/schemes/${id}`, payload);
  }

  setStatus(id: string, status: string): Observable<Scheme> {
    return this.api.patch<Scheme>(`/schemes/${id}/status`, { status });
  }

  delete(id: string): Observable<{ deleted: boolean }> {
    return this.api.delete<{ deleted: boolean }>(`/schemes/${id}`);
  }

  evaluate(items: { productId?: string; quantity: number; unitPrice: number }[], customerId?: string): Observable<EvaluateResult> {
    return this.api.post<EvaluateResult>('/schemes/evaluate', { items, customerId });
  }

  badges(): Observable<SchemeBadges> {
    return this.api.get<SchemeBadges>('/schemes/badges');
  }

  // ─── Coupons ───────────────────────────────────────────────────────────────
  listCoupons(): Observable<Coupon[]> { return this.api.get<Coupon[]>('/coupons'); }
  createCoupon(payload: Partial<Coupon>): Observable<Coupon> { return this.api.post<Coupon>('/coupons', payload); }
  updateCoupon(id: string, payload: Partial<Coupon>): Observable<Coupon> { return this.api.put<Coupon>(`/coupons/${id}`, payload); }
  setCouponStatus(id: string, status: string): Observable<Coupon> { return this.api.patch<Coupon>(`/coupons/${id}/status`, { status }); }
  deleteCoupon(id: string): Observable<{ deleted: boolean }> { return this.api.delete<{ deleted: boolean }>(`/coupons/${id}`); }
}
