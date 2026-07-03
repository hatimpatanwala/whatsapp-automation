import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

/** Client for the GST compliance API (Phase 5). */
@Injectable({ providedIn: 'root' })
export class GstService {
  private readonly api = inject(ApiService);

  gstr1(month?: string): Observable<any> { return this.api.get<any>('/gst/gstr-1', month ? { month } : undefined); }
  gstr3b(month?: string): Observable<any> { return this.api.get<any>('/gst/gstr-3b', month ? { month } : undefined); }
  hsnSummary(month?: string): Observable<any> { return this.api.get<any>('/gst/hsn-summary', month ? { month } : undefined); }
  gstr1Json(month?: string, gstin?: string): Observable<any> { return this.api.get<any>('/gst/gstr-1/json', { month, gstin }); }
  generateIrn(invoiceId: string): Observable<any> { return this.api.post<any>(`/gst/einvoice/${invoiceId}`, {}); }

  import2b(month: string, json: any): Observable<any> { return this.api.post<any>('/gst/gstr-2b/import', { month, json }); }
  reconcile2b(month?: string): Observable<any> { return this.api.get<any>('/gst/gstr-2b/reconcile', month ? { month } : undefined); }
}
