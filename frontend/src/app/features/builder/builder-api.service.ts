import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BuilderSessionInfo {
  type: 'order' | 'quote';
  customer: { phone: string | null; name: string | null };
  customerLocked: boolean;
}

export interface BuilderProduct {
  id: string;
  name: string;
  price: number;
  basePrice: number;
  currency: string;
  thumbnail: string | null;
  stock: number;
}

export interface BuilderCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface BuilderSubmitPayload {
  items: { productId?: string; name: string; quantity: number; unitPrice: number }[];
  customerId?: string;
  customer?: { phone?: string; name?: string };
  title?: string;
  notes?: string;
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
    return this.http.get<BuilderSessionInfo>(`${this.base}/m/builder/session`, this.opts());
  }

  getProducts(): Observable<BuilderProduct[]> {
    return this.http.get<BuilderProduct[]>(`${this.base}/m/builder/products`, this.opts());
  }

  searchCustomers(q: string): Observable<BuilderCustomer[]> {
    return this.http.get<BuilderCustomer[]>(`${this.base}/m/builder/customers`, {
      headers: { 'X-Builder-Token': this.token },
      params: { q: q || '' },
    });
  }

  submit(payload: BuilderSubmitPayload): Observable<{ type: string; id: string; number: string }> {
    return this.http.post<{ type: string; id: string; number: string }>(
      `${this.base}/m/builder/submit`,
      payload,
      this.opts(),
    );
  }

  getResult(): Observable<any> {
    return this.http.get<any>(`${this.base}/m/builder/result`, this.opts());
  }
}
