import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type LayoutKind = 'classic' | 'modern' | 'tally' | 'compact';
export type FontKind = 'helvetica' | 'times' | 'courier';

export interface DocTemplateConfig {
  layout: LayoutKind;
  accentColor: string;
  textColor: string;
  font: FontKind;
  logo: string | null;
  showLogo: boolean;
  header: { showGstin: boolean; showAddress: boolean; showEmail: boolean; showPhone: boolean; showWebsite: boolean };
  columns: { sno: boolean; hsn: boolean; qty: boolean; rate: boolean; discount: boolean; tax: boolean; amount: boolean };
  totals: { showDiscount: boolean; showTaxBreakup: boolean; showRoundoff: boolean };
  blocks: { terms: string; notes: string; declaration: string; bankDetails: string; footer: string; signatureLabel: string };
}

export interface DocumentTemplate {
  id: string;
  name: string;
  config: DocTemplateConfig;
  applies_to: string[];
  is_default: boolean;
  updated_at: string;
}

/** The document types a template can be assigned to. */
export const DOC_TYPES: { key: string; label: string }[] = [
  { key: 'invoice', label: 'Tax Invoice' },
  { key: 'quote', label: 'Quotation' },
  { key: 'purchase_order', label: 'Purchase Order' },
  { key: 'receipt', label: 'Payment Receipt' },
  { key: 'credit_note', label: 'Credit Note' },
  { key: 'debit_note', label: 'Debit Note' },
  { key: 'offer', label: 'Offer / Estimate' },
];

export const DEFAULT_CONFIG: DocTemplateConfig = {
  layout: 'classic',
  accentColor: '#1f4e79',
  textColor: '#111111',
  font: 'helvetica',
  logo: null,
  showLogo: true,
  header: { showGstin: true, showAddress: true, showEmail: true, showPhone: true, showWebsite: false },
  columns: { sno: true, hsn: true, qty: true, rate: true, discount: false, tax: true, amount: true },
  totals: { showDiscount: true, showTaxBreakup: true, showRoundoff: true },
  blocks: {
    terms: '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. on overdue bills.\n3. Subject to local jurisdiction.',
    notes: '',
    declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
    bankDetails: '',
    footer: 'Thank you for your business!',
    signatureLabel: 'Authorised Signatory',
  },
};

@Injectable({ providedIn: 'root' })
export class DocumentTemplateService {
  private readonly api = inject(ApiService);

  list(): Observable<DocumentTemplate[]> {
    return this.api.get<DocumentTemplate[]>('/erp/document-templates');
  }
  create(body: { name: string; config: DocTemplateConfig; appliesTo?: string[] }): Observable<DocumentTemplate> {
    return this.api.post<DocumentTemplate>('/erp/document-templates', body);
  }
  update(id: string, body: { name?: string; config?: DocTemplateConfig }): Observable<DocumentTemplate> {
    return this.api.patch<DocumentTemplate>(`/erp/document-templates/${id}`, body);
  }
  assign(id: string, docTypes: string[]): Observable<DocumentTemplate> {
    return this.api.put<DocumentTemplate>(`/erp/document-templates/${id}/assign`, { docTypes });
  }
  remove(id: string): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`/erp/document-templates/${id}`);
  }
}
