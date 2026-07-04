import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

/**
 * Party Master (PARTY_MASTER_README.md): one unified party layer.
 *
 * The spec's core principle — "a party is a ledger account, the account group decides
 * sale vs purchase behaviour" — is realised over the existing role tables:
 *   account_group 'debtor'   → customers  (+ 'Sundry Debtors' ledger)
 *   account_group 'creditor' → suppliers  (+ 'Sundry Creditors' ledger)
 * Both tables now carry the IDENTICAL party field set (migration 073), the API is one,
 * and the ledger layer is where the two roles reconcile. gst_registration_type is the
 * master switch for conditional validation (section 4 of the spec).
 */

export type PartyGroup = 'debtor' | 'creditor';

export const GST_REG_TYPES = ['regular', 'composition', 'unregistered', 'consumer', 'sez', 'overseas'] as const;

export interface PartyInput {
  group: PartyGroup;
  partyName: string;
  alias?: string;
  partyCode?: string;
  gstRegistrationType?: string;
  gstin?: string;
  pan?: string;
  state?: string;
  stateCode?: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  tdsApplicable?: boolean;
  tdsSection?: string;
  billingAddress?: string;
  pincode?: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  openingBalance?: number;
  openingDrCr?: 'DR' | 'CR';
  creditLimit?: number;
  creditDays?: number;
  billByBill?: boolean;
  priceLevelId?: string | null;
  defaultDiscountPct?: number;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
  salesman?: string;
  route?: string;
  area?: string;
  tags?: string[];
  userDefinedFields?: Record<string, unknown>;
  isActive?: boolean;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GSTIN check digit (char 15): base-36 alternating-weight algorithm. */
export function gstinChecksumOk(gstin: string): boolean {
  const val = (c: string) => (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 55);
  const chr = (v: number) => (v < 10 ? String.fromCharCode(48 + v) : String.fromCharCode(55 + v));
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = val(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return chr((36 - (sum % 36)) % 36) === gstin[14];
}

/** Section-4 validation. Returns a field→message map; empty = valid. */
export function validateParty(p: PartyInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const reg = (p.gstRegistrationType || 'consumer').toLowerCase();
  const gstin = (p.gstin || '').trim().toUpperCase();
  const pan = (p.pan || '').trim().toUpperCase();

  if (!p.partyName?.trim()) errors['partyName'] = 'Party name is required';
  if (!['debtor', 'creditor'].includes(p.group)) errors['group'] = 'Account group must be Sundry Debtor or Sundry Creditor';
  if (!(GST_REG_TYPES as readonly string[]).includes(reg)) errors['gstRegistrationType'] = 'Unknown GST registration type';

  // The master switch (spec §3–4).
  if (['regular', 'composition', 'sez'].includes(reg)) {
    if (!gstin) errors['gstin'] = `GSTIN is required for ${reg} parties`;
    if (!p.stateCode?.trim() && !gstin) errors['stateCode'] = 'State is required for GST-registered parties';
  }
  if (['consumer', 'unregistered'].includes(reg) && gstin) {
    errors['gstin'] = `${reg} parties must not have a GSTIN`;
  }

  if (gstin) {
    if (!GSTIN_RE.test(gstin)) errors['gstin'] = 'GSTIN format is invalid (15 chars, e.g. 24AAACW1234F1ZV)';
    else if (!gstinChecksumOk(gstin)) errors['gstin'] = 'GSTIN check digit is wrong — please re-check';
    else if (p.stateCode?.trim() && gstin.slice(0, 2) !== p.stateCode.trim().padStart(2, '0')) {
      errors['stateCode'] = `State code ${p.stateCode} does not match GSTIN state ${gstin.slice(0, 2)}`;
    }
  }

  if (pan) {
    if (!PAN_RE.test(pan)) errors['pan'] = 'PAN format is invalid (e.g. AAACW1234F)';
    else if (gstin && GSTIN_RE.test(gstin) && gstin.slice(2, 12) !== pan) {
      errors['pan'] = `PAN must match GSTIN characters 3–12 (${gstin.slice(2, 12)})`;
    }
  }

  if (p.ifsc && !IFSC_RE.test(p.ifsc.trim().toUpperCase())) errors['ifsc'] = 'IFSC format is invalid (e.g. HDFC0001234)';
  if (p.email && !EMAIL_RE.test(p.email.trim())) errors['email'] = 'Email looks invalid';
  if (p.mobile && !/^\d{10}$/.test(p.mobile.replace(/^\+91/, '').replace(/\D/g, '').slice(-10))) {
    errors['mobile'] = 'Mobile must be a 10-digit number';
  }
  if (p.creditLimit !== undefined && p.creditLimit !== null && Number(p.creditLimit) < 0) {
    errors['creditLimit'] = 'Credit limit cannot be negative';
  }
  if (p.openingBalance && !p.openingDrCr) errors['openingDrCr'] = 'Choose Dr or Cr for the opening balance';
  return errors;
}

@Injectable()
export class PartyService {
  constructor(private readonly cm: TenantConnectionManager) {}

  private table(group: PartyGroup): string {
    return group === 'creditor' ? 'suppliers' : 'customers';
  }
  private nameCol(group: PartyGroup): string {
    return group === 'creditor' ? 'company' : 'name';
  }

  /** Unified list across both role tables — search by name/alias/code/GSTIN/mobile. */
  async list(schema: string, q = '', group?: PartyGroup) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const like = `%${q}%`;
      const one = async (g: PartyGroup) =>
        (await qr.query(
          `SELECT id, ${this.nameCol(g)} AS party_name, alias, party_code, gstin, gst_registration_type,
                  state_code, phone AS mobile, email, credit_limit, credit_days, is_active,
                  '${g}' AS account_group
           FROM "${schema}".${this.table(g)}
           WHERE deleted_at IS NULL
             AND ($1 = '%%' OR ${this.nameCol(g)} ILIKE $1 OR alias ILIKE $1 OR party_code ILIKE $1
                  OR gstin ILIKE $1 OR phone ILIKE $1)
           ORDER BY ${this.nameCol(g)} LIMIT 200`,
          [like],
        )) as any[];
      if (group) return one(group);
      const [d, c] = await Promise.all([one('debtor'), one('creditor')]);
      return [...d, ...c].sort((a, b) => String(a.party_name).localeCompare(String(b.party_name))).slice(0, 250);
    });
  }

  async get(schema: string, group: PartyGroup, id: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `SELECT *, ${this.nameCol(group)} AS party_name, phone AS mobile, '${group}' AS account_group
         FROM "${schema}".${this.table(group)} WHERE id = $1`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException('Party not found');
      const party = rows[0];
      delete party.password_hash;
      if (group === 'debtor') {
        party.shipping_addresses = await qr.query(
          `SELECT id, label, full_address, city, state, pincode, is_default
           FROM "${schema}".addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC`,
          [id],
        );
      }
      return party;
    });
  }

  /** Duplicate-GSTIN check — a WARNING per the spec, never a block. */
  async gstinExists(schema: string, gstin: string, excludeId?: string) {
    if (!gstin?.trim()) return { exists: false };
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const hits = await qr.query(
        `SELECT name AS party_name FROM "${schema}".customers WHERE gstin = $1 AND deleted_at IS NULL AND id::text <> COALESCE($2,'')
         UNION ALL
         SELECT company FROM "${schema}".suppliers WHERE gstin = $1 AND deleted_at IS NULL AND id::text <> COALESCE($2,'')
         LIMIT 3`,
        [gstin.trim().toUpperCase(), excludeId ?? null],
      );
      return { exists: hits.length > 0, parties: hits.map((h: any) => h.party_name) };
    });
  }

  async create(schema: string, input: PartyInput) {
    const errors = validateParty(input);
    if (Object.keys(errors).length) throw new BadRequestException({ message: 'Validation failed', errors });
    const p = this.normalize(input);

    return this.cm.executeInTransaction(schema, async (qr) => {
      const t = this.table(input.group);
      const nameCol = this.nameCol(input.group);
      const phoneVal = p.mobile || (input.group === 'debtor' ? `NA-${Date.now()}` : null);
      const row = (
        await qr.query(
          `INSERT INTO "${schema}".${t}
             (${nameCol}, alias, party_code, gst_registration_type, gstin, pan, state, state_code,
              place_of_supply, reverse_charge, tds_applicable, tds_section, billing_address, pincode,
              contact_person, phone, email, opening_balance, opening_dr_cr, credit_limit, credit_days,
              bill_by_bill, price_level_id, default_discount_pct, bank_name, account_number, ifsc, upi_id,
              salesman, route, area, tags, user_defined_fields, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
                   $25,$26,$27,$28,$29,$30,$31,$32${input.group === 'debtor' ? '::text[]' : '::jsonb'},$33::jsonb,$34)
           RETURNING id`,
          [
            p.partyName, p.alias, p.partyCode, p.reg, p.gstin, p.pan, p.state, p.stateCode,
            p.placeOfSupply, !!input.reverseCharge, !!input.tdsApplicable, p.tdsSection, p.billingAddress, p.pincode,
            p.contactPerson, phoneVal, p.email, input.openingBalance ?? null, input.openingDrCr ?? null,
            input.creditLimit ?? null, input.creditDays ?? null, input.billByBill !== false,
            input.priceLevelId ?? null, input.defaultDiscountPct ?? null,
            p.bankName, p.accountNumber, p.ifsc, p.upiId, p.salesman, p.route, p.area,
            // customers.tags is a legacy text[]; suppliers.tags is jsonb.
            input.group === 'debtor' ? (input.tags || []) : JSON.stringify(input.tags || []),
            JSON.stringify(input.userDefinedFields || {}),
            input.isActive !== false,
          ],
        )
      )[0];

      await this.ensureLedger(qr, schema, input.group, p.partyName, input.openingBalance, input.openingDrCr);
      return { id: row.id, accountGroup: input.group };
    });
  }

  async update(schema: string, group: PartyGroup, id: string, input: PartyInput) {
    const errors = validateParty({ ...input, group });
    if (Object.keys(errors).length) throw new BadRequestException({ message: 'Validation failed', errors });
    const p = this.normalize(input);

    return this.cm.executeInTransaction(schema, async (qr) => {
      const t = this.table(group);
      const rows = await qr.query(
        `UPDATE "${schema}".${t} SET
           ${this.nameCol(group)} = $2, alias = $3, party_code = $4, gst_registration_type = $5,
           gstin = $6, pan = $7, state = $8, state_code = $9, place_of_supply = $10,
           reverse_charge = $11, tds_applicable = $12, tds_section = $13, billing_address = $14,
           pincode = $15, contact_person = $16, phone = COALESCE($17, phone), email = $18,
           opening_balance = $19, opening_dr_cr = $20, credit_limit = $21, credit_days = $22,
           bill_by_bill = $23, price_level_id = $24, default_discount_pct = $25,
           bank_name = $26, account_number = $27, ifsc = $28, upi_id = $29,
           salesman = $30, route = $31, area = $32, tags = $33${group === 'debtor' ? '::text[]' : '::jsonb'},
           user_defined_fields = $34::jsonb, is_active = $35, updated_at = NOW()
         WHERE id = $1 RETURNING id`,
        [
          id, p.partyName, p.alias, p.partyCode, p.reg, p.gstin, p.pan, p.state, p.stateCode,
          p.placeOfSupply, !!input.reverseCharge, !!input.tdsApplicable, p.tdsSection, p.billingAddress,
          p.pincode, p.contactPerson, p.mobile, p.email,
          input.openingBalance ?? null, input.openingDrCr ?? null, input.creditLimit ?? null,
          input.creditDays ?? null, input.billByBill !== false, input.priceLevelId ?? null,
          input.defaultDiscountPct ?? null, p.bankName, p.accountNumber, p.ifsc, p.upiId,
          p.salesman, p.route, p.area,
          group === 'debtor' ? (input.tags || []) : JSON.stringify(input.tags || []),
          JSON.stringify(input.userDefinedFields || {}), input.isActive !== false,
        ],
      );
      if (!rows[0]) throw new NotFoundException('Party not found');
      await this.ensureLedger(qr, schema, group, p.partyName, input.openingBalance, input.openingDrCr);
      return { id, accountGroup: group };
    });
  }

  /** Spec: never hard-delete a party — soft-delete + inactive only. */
  async softDelete(schema: string, group: PartyGroup, id: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `UPDATE "${schema}".${this.table(group)}
         SET deleted_at = NOW(), is_active = false WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException('Party not found or already deleted');
      return { id, deleted: true };
    });
  }

  /**
   * GSTIN auto-fetch: type a GST number → party details fill themselves.
   * Provider-pluggable (official-API-shaped JSON):
   *   - GSTIN_LOOKUP_URL env: a URL template with {gstin} (self-hosted/GSP proxy), or
   *   - GSTIN_LOOKUP_KEY env: the gstincheck.co.in free-tier API.
   * With no provider (or offline) it still derives everything the number itself
   * encodes: state (code→name), PAN, and the entity type from the PAN's 4th char.
   */
  async gstinLookup(gstin: string) {
    const g = (gstin || '').trim().toUpperCase();
    if (!GSTIN_RE.test(g) || !gstinChecksumOk(g)) {
      throw new BadRequestException({ message: 'Validation failed', errors: { gstin: 'Enter a valid GSTIN first' } });
    }

    const offline = this.deriveFromGstin(g);
    const url = process.env.GSTIN_LOOKUP_URL
      ? process.env.GSTIN_LOOKUP_URL.replace('{gstin}', g)
      : process.env.GSTIN_LOOKUP_KEY
        ? `https://sheet.gstincheck.co.in/check/${process.env.GSTIN_LOOKUP_KEY}/${g}`
        : null;
    if (!url) return { ...offline, source: 'offline', note: 'Set GSTIN_LOOKUP_KEY (or GSTIN_LOOKUP_URL) for full portal auto-fill' };

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return { ...offline, source: 'offline', note: `Lookup provider returned ${res.status}` };
      const body: any = await res.json();
      const d = body?.data ?? body?.taxpayerInfo ?? body;
      if (!d || body?.flag === false) return { ...offline, source: 'offline', note: body?.message || 'Provider had no record' };

      const addr = d?.pradr?.addr ?? {};
      const addressParts = [addr.bno, addr.bnm, addr.st, addr.loc, addr.dst].filter(Boolean);
      return {
        ...offline,
        source: 'gst-portal',
        legalName: d.lgnm || offline.legalName,
        tradeName: d.tradeNam || d.tradeName || '',
        address: addressParts.join(', ') || undefined,
        pincode: addr.pncd || undefined,
        registrationType: /composition/i.test(d.dty || '') ? 'composition' : 'regular',
        status: d.sts || undefined,
      };
    } catch {
      return { ...offline, source: 'offline', note: 'Lookup provider unreachable — filled what the GSTIN itself encodes' };
    }
  }

  private deriveFromGstin(g: string) {
    const STATE_NAMES: Record<string, string> = {
      '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
      '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
      '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
      '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
      '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
      '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
      '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
    };
    const ENTITY: Record<string, string> = {
      C: 'Private/Public Limited Company', P: 'Proprietorship / Individual', F: 'Partnership Firm', H: 'HUF',
      A: 'Association of Persons', T: 'Trust', B: 'Body of Individuals', L: 'Local Authority',
      J: 'Artificial Juridical Person', G: 'Government',
    };
    return {
      gstin: g,
      pan: g.slice(2, 12),
      stateCode: g.slice(0, 2),
      state: STATE_NAMES[g.slice(0, 2)] || '',
      entityType: ENTITY[g[5]] || undefined,
      legalName: '',
    };
  }

  /** Shipping addresses (debtors): 1 party → many ship-to rows (spec §2.3). */
  async addAddress(schema: string, customerId: string, a: { label?: string; fullAddress: string; city?: string; state?: string; pincode?: string; isDefault?: boolean }) {
    if (!a?.fullAddress?.trim()) throw new BadRequestException({ message: 'Validation failed', errors: { fullAddress: 'Address is required' } });
    return this.cm.executeInTransaction(schema, async (qr) => {
      if (a.isDefault) await qr.query(`UPDATE "${schema}".addresses SET is_default = false WHERE customer_id = $1`, [customerId]);
      const rows = await qr.query(
        `INSERT INTO "${schema}".addresses (customer_id, label, full_address, city, state, pincode, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [customerId, a.label?.trim() || null, a.fullAddress.trim(), a.city?.trim() || null, a.state?.trim() || null, a.pincode?.trim() || null, !!a.isDefault],
      );
      return { id: rows[0].id };
    });
  }

  async removeAddress(schema: string, customerId: string, addressId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      await qr.query(`DELETE FROM "${schema}".addresses WHERE id = $1 AND customer_id = $2`, [addressId, customerId]);
      return { deleted: true };
    });
  }

  /** Party ledger under the role's group, with the opening balance (Miracle opening). */
  private async ensureLedger(
    qr: any, schema: string, group: PartyGroup, name: string,
    openingBalance?: number, drCr?: 'DR' | 'CR',
  ): Promise<void> {
    const ledgerGroup = group === 'creditor' ? 'Sundry Creditors' : 'Sundry Debtors';
    const opening = Number(openingBalance) || 0;
    // ledger_accounts.opening_type is CHAR(2): 'dr' | 'cr'.
    const openingType = (drCr || (group === 'creditor' ? 'CR' : 'DR')).toLowerCase() === 'cr' ? 'cr' : 'dr';
    await qr.query(
      `INSERT INTO "${schema}".ledger_accounts (name, group_id, opening_balance, opening_type)
       SELECT $1, g.id, $2, $3 FROM "${schema}".ledger_groups g WHERE g.name = $4
       ON CONFLICT (name) DO UPDATE SET opening_balance = EXCLUDED.opening_balance, opening_type = EXCLUDED.opening_type`,
      [name.slice(0, 160), opening, openingType, ledgerGroup],
    );
  }

  private normalize(input: PartyInput) {
    const gstin = input.gstin?.trim().toUpperCase() || null;
    return {
      partyName: input.partyName.trim(),
      alias: input.alias?.trim() || null,
      partyCode: input.partyCode?.trim() || null,
      reg: (input.gstRegistrationType || 'consumer').toLowerCase(),
      gstin,
      // PAN auto-derives from GSTIN chars 3–12 when not supplied (spec §2.2).
      pan: input.pan?.trim().toUpperCase() || (gstin ? gstin.slice(2, 12) : null),
      state: input.state?.trim() || null,
      stateCode: input.stateCode?.trim() || (gstin ? gstin.slice(0, 2) : null),
      placeOfSupply: input.placeOfSupply?.trim() || input.state?.trim() || null,
      tdsSection: input.tdsSection?.trim() || null,
      billingAddress: input.billingAddress?.trim() || null,
      pincode: input.pincode?.trim() || null,
      contactPerson: input.contactPerson?.trim() || null,
      mobile: input.mobile?.trim() || null,
      email: input.email?.trim() || null,
      bankName: input.bankName?.trim() || null,
      accountNumber: input.accountNumber?.trim() || null,
      ifsc: input.ifsc?.trim().toUpperCase() || null,
      upiId: input.upiId?.trim() || null,
      salesman: input.salesman?.trim() || null,
      route: input.route?.trim() || null,
      area: input.area?.trim() || null,
    };
  }
}
