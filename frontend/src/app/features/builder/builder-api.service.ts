import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * The backend wraps every response in `{ success, data }`. This service uses a
 * bare HttpClient (HttpBackend) that bypasses the app's unwrap interceptor, so
 * we must unwrap `.data` here — otherwise callers get the envelope object
 * instead of the array/payload (e.g. products().slice is not a function).
 */
const unwrap = <T>(r: any): T => (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;

export interface BuilderSessionInfo {
  type: 'order' | 'quote';
  customer: { phone: string | null; name: string | null };
  customerLocked: boolean;
}

export interface BuilderProduct {
  id: string;
  name: string;
  brand?: string | null;
  sku?: string | null;
  price: number;
  basePrice: number;
  currency: string;
  thumbnail: string | null;
  stock: number;
  gstRate?: number;
  uom?: string;
  hsnCode?: string | null;
  offer?: string | null;
}

export interface BuilderOffer {
  schemeId: string;
  name: string;
  description: string;
  combinable: boolean;
  weight: number;
  discount: number;
  label: string;
}

export interface BuilderOffersResult {
  subtotal: number;
  applicable: BuilderOffer[];
  recommendedIds: string[];
  discountTotal: number;
}

export interface BuilderCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface BuilderSubmitPayload {
  items: { productId?: string; name: string; quantity: number; unitPrice: number; gstRate?: number }[];
  customerId?: string;
  customer?: { phone?: string; name?: string };
  title?: string;
  notes?: string;
  discount?: number;
  deliveryFee?: number;
}

/**
 * Token-authenticated API for the Builder webview. Uses a bare HttpClient built
 * from HttpBackend so it bypasses the app's session/tenant interceptors and the
 * auth-redirect-on-401 behaviour — the X-Builder-Token header is the only auth.
 */
@Injectable({ providedIn: 'root' })
export class BuilderApiService {
  private readonly http: HttpClient;
  private readonly base = environment.apiUrl;
  private token = '';

  constructor() {
    this.http = new HttpClient(inject(HttpBackend));
  }

  setToken(token: string): void {
    this.token = token || '';
  }

  private opts() {
    return { headers: { 'X-Builder-Token': this.token } };
  }

  getSession(): Observable<BuilderSessionInfo> {
    return this.http.get<any>(`${this.base}/m/builder/session`, this.opts()).pipe(map(unwrap<BuilderSessionInfo>));
  }

  getProducts(): Observable<BuilderProduct[]> {
    return this.http.get<any>(`${this.base}/m/builder/products`, this.opts()).pipe(map((r) => unwrap<BuilderProduct[]>(r) || []));
  }

  searchCustomers(q: string): Observable<BuilderCustomer[]> {
    return this.http.get<any>(`${this.base}/m/builder/customers`, {
      headers: { 'X-Builder-Token': this.token },
      params: { q: q || '' },
    }).pipe(map((r) => unwrap<BuilderCustomer[]>(r) || []));
  }

  submit(payload: BuilderSubmitPayload): Observable<{ type: string; id: string; number: string }> {
    return this.http.post<any>(
      `${this.base}/m/builder/submit`,
      payload,
      this.opts(),
    ).pipe(map(unwrap<{ type: string; id: string; number: string }>));
  }

  getResult(): Observable<any> {
    return this.http.get<any>(`${this.base}/m/builder/result`, this.opts()).pipe(map(unwrap<any>));
  }

  evaluateOffers(items: { productId?: string; quantity: number; unitPrice: number }[]): Observable<BuilderOffersResult> {
    return this.http.post<any>(`${this.base}/m/builder/offers`, { items }, this.opts()).pipe(map(unwrap<BuilderOffersResult>));
  }
}
