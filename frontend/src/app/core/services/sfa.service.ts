import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

/**
 * Salesman / Field-Sales (SFA) API — session-authed portal + app endpoints.
 *  • Manager calls (`/sfa/...`, `/sfa/reports/...`, `/sfa/salesmen/...`) drive the
 *    Field Sales module (team performance, beats, targets, salesmen management).
 *  • Salesman self calls (`/sfa/app/...`) drive the logged-in salesman's own
 *    workspace (today, beat, visits, take-order, collections, my performance).
 * The token WhatsApp webview uses its own raw-HTTP client (sales-webview).
 */
@Injectable({ providedIn: 'root' })
export class SfaService {
  private readonly api = inject(ApiService);

  // ─── Manager: salesmen management ───────────────────────────────────────────
  listSalesmen(): Observable<any[]> { return this.api.get<any[]>('/sfa/salesmen'); }
  addSalesman(body: {
    name: string; phone: string; route?: string; area?: string; code?: string;
    email?: string; password?: string; createLogin?: boolean;
  }): Observable<any> { return this.api.post<any>('/sfa/salesmen', body); }
  updateSalesman(id: string, body: { isActive?: boolean; rotateToken?: boolean }): Observable<any> {
    return this.api.patch<any>(`/sfa/salesmen/${id}`, body);
  }
  promises(scope: 'due' | 'open' | 'all' = 'all'): Observable<any[]> {
    return this.api.get<any[]>('/sfa/promises', { scope });
  }

  // ─── Manager: reports ───────────────────────────────────────────────────────
  performance(q: { from?: string; to?: string; salesmanId?: string } = {}): Observable<any[]> {
    return this.api.get<any[]>('/sfa/reports/performance', this.clean(q));
  }
  topProducts(q: { from?: string; to?: string; salesmanId?: string } = {}): Observable<any[]> {
    return this.api.get<any[]>('/sfa/reports/top-products', this.clean(q));
  }
  reportVisits(q: { from?: string; to?: string; salesmanId?: string; customerId?: string } = {}): Observable<any[]> {
    return this.api.get<any[]>('/sfa/reports/visits', this.clean(q));
  }
  dayWise(salesmanId: string, q: { from?: string; to?: string } = {}): Observable<any[]> {
    return this.api.get<any[]>(`/sfa/salesmen/${salesmanId}/daywise`, this.clean(q));
  }

  // ─── Manager: beats & targets ───────────────────────────────────────────────
  getBeat(salesmanId: string): Observable<any[]> { return this.api.get<any[]>(`/sfa/salesmen/${salesmanId}/beat`); }
  setBeat(salesmanId: string, customerIds: string[]): Observable<any> {
    return this.api.put<any>(`/sfa/salesmen/${salesmanId}/beat`, { customerIds });
  }
  getTargets(salesmanId: string): Observable<any[]> { return this.api.get<any[]>(`/sfa/salesmen/${salesmanId}/targets`); }
  setTarget(salesmanId: string, body: { periodMonth: string; targetAmount?: number; targetCollection?: number; targetVisits?: number }): Observable<any> {
    return this.api.put<any>(`/sfa/salesmen/${salesmanId}/targets`, body);
  }

  // ─── Salesman self (portal login) ───────────────────────────────────────────
  appMe(): Observable<any> { return this.api.get<any>('/sfa/app/me'); }
  appCustomers(q?: string): Observable<any[]> { return this.api.get<any[]>('/sfa/app/customers', q ? { q } : undefined); }
  appCustomer(id: string): Observable<any> { return this.api.get<any>(`/sfa/app/customers/${id}`); }
  appCreateOutlet(body: { name: string; phone: string; gstin?: string; billingAddress?: string; area?: string; route?: string }): Observable<any> {
    return this.api.post<any>('/sfa/app/customers', body);
  }
  appAttendance(): Observable<any> { return this.api.get<any>('/sfa/app/attendance'); }
  appPunch(body: { type: 'in' | 'out'; latitude?: number; longitude?: number; label?: string }): Observable<any> {
    return this.api.post<any>('/sfa/app/attendance', body);
  }
  appExpenses(): Observable<any[]> { return this.api.get<any[]>('/sfa/app/expenses'); }
  appAddExpense(body: { category: string; amount?: number; distanceKm?: number; note?: string }): Observable<any> {
    return this.api.post<any>('/sfa/app/expenses', body);
  }
  managerExpenses(params?: { status?: string; from?: string; to?: string; salesmanId?: string }): Observable<any[]> {
    return this.api.get<any[]>('/sfa/expenses', params as any);
  }
  reviewExpense(id: string, status: string): Observable<any> { return this.api.patch<any>(`/sfa/expenses/${id}`, { status }); }
  appProducts(q?: string): Observable<any[]> { return this.api.get<any[]>('/sfa/app/products', q ? { q } : undefined); }
  appPending(): Observable<any[]> { return this.api.get<any[]>('/sfa/app/pending'); }
  appEvaluate(customerId: string | undefined, items: any[]): Observable<any> { return this.api.post<any>('/sfa/app/cart', { customerId, items }); }
  appTakeOrder(body: any): Observable<any> { return this.api.post<any>('/sfa/app/orders', body); }
  appCollect(body: any): Observable<any> { return this.api.post<any>('/sfa/app/collect', body); }
  appPromise(body: any): Observable<any> { return this.api.post<any>('/sfa/app/promises', body); }
  appPromises(scope: 'due' | 'open' | 'all' = 'due'): Observable<any[]> { return this.api.get<any[]>('/sfa/app/promises', { scope }); }
  appBeat(): Observable<any[]> { return this.api.get<any[]>('/sfa/app/beat'); }
  appVisits(q: { from?: string; to?: string } = {}): Observable<any[]> { return this.api.get<any[]>('/sfa/app/visits', this.clean(q)); }
  appPlanVisit(body: any): Observable<any> { return this.api.post<any>('/sfa/app/visits', body); }
  appCheckin(body: any): Observable<any> { return this.api.post<any>('/sfa/app/checkin', body); }
  appCheckout(id: string, body: any): Observable<any> { return this.api.post<any>(`/sfa/app/visits/${id}/checkout`, body); }
  appVisitPhotoUrl(fileName: string, contentType: string): Observable<{ uploadUrl: string; fileUrl: string }> {
    return this.api.post<{ uploadUrl: string; fileUrl: string }>('/sfa/app/visits/photo-url', { fileName, contentType });
  }
  appAddVisitPhotos(visitId: string, urls: string[]): Observable<any> {
    return this.api.post<any>(`/sfa/app/visits/${visitId}/photos`, { urls });
  }
  appPerformance(q: { from?: string; to?: string } = {}): Observable<any> { return this.api.get<any>('/sfa/app/performance', this.clean(q)); }

  private clean(q: Record<string, string | undefined>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(q)) if (v) out[k] = v;
    return out;
  }
}
