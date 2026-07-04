import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

export interface SellerProfile {
  legalName: string;
  gstin: string;
  address: string;
  city: string;
  pin: number;
  state: string;
  stateCode: string;
  /** Bank details block printed on invoices (multiline: bank / A/c / IFSC). */
  bankDetails: string;
  /** Terms & conditions block printed on invoices (multiline). */
  terms: string;
}

/**
 * The tenant's seller master, read from the `settings` table (invoice_* keys, the same
 * ones the invoice generator uses). Feeds the e-invoice payload and the GSTR-1 JSON.
 */
@Injectable()
export class SellerProfileService {
  constructor(private readonly cm: TenantConnectionManager) {}

  async get(schema: string): Promise<SellerProfile> {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT key, value FROM "${schema}".settings WHERE key LIKE 'invoice_%'`),
    );
    const raw: Record<string, any> = {};
    for (const r of rows || []) {
      try {
        raw[r.key] = JSON.parse(r.value);
      } catch {
        raw[r.key] = r.value;
      }
    }
    const gstin = String(raw['invoice_gstin'] || '');
    return {
      legalName: raw['invoice_legal_name'] || 'Seller',
      gstin,
      address: raw['invoice_address'] || 'NA',
      city: raw['invoice_city'] || raw['invoice_state'] || 'NA',
      pin: Number(raw['invoice_pin']) || 999999,
      state: raw['invoice_state'] || '',
      stateCode: String(raw['invoice_state_code'] || (gstin ? gstin.slice(0, 2) : '')),
      bankDetails: String(raw['invoice_bank'] || ''),
      terms: String(raw['invoice_terms'] || ''),
    };
  }
}
