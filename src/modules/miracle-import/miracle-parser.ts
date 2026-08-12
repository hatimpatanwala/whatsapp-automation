/**
 * Miracle (RKIT) company-folder parser.
 *
 * Turns a raw Miracle CMP export folder (FoxPro DBFs) into clean, typed
 * business objects our ERP understands: company profile, account groups,
 * parties (customers/suppliers), other ledgers, items (with rates + stock),
 * tax rates, brands/categories, and per-financial-year vouchers
 * (cash/credit sales, purchases, returns, receipts, payments) with line items
 * and GST.
 *
 * Table semantics were reverse-engineered from a real export (see
 * MIRACLE_IMPORT.md). All field names are Miracle's raw column names.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { readDbf, readDbfSafe, s, num, DbfRecord } from './dbf.reader';

export interface MiracleCompany {
  name: string;
  gstin: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  phone: string;
}
export interface MiracleGroup {
  code: string;
  name: string;
  parent: string;
  nature: 'asset' | 'liability' | 'income' | 'expense';
}
export interface MiracleParty {
  code: string;
  name: string;
  group: 'customer' | 'supplier';
  gstin: string;
  pan: string;
  address: string;
  city: string;
  area: string;
  state: string;
  stateCode: string;
  pincode: string;
  contactPerson: string;
  phone: string;
  openingBalance: number;
  openingDrCr: 'DR' | 'CR';
}
export interface MiracleLedger {
  code: string;
  name: string;
  groupName: string;
  nature: 'asset' | 'liability' | 'income' | 'expense';
  gstin: string;
  openingBalance: number;
  openingDrCr: 'dr' | 'cr';
}
export interface MiracleItem {
  code: string;
  name: string;
  hsn: string;
  category: string;
  brand: string;
  unit: string;
  saleRate: number;
  purchaseRate: number;
  openingStock: number;
  openingRate: number;
  gstRate: number;
}
export interface MiracleTaxRate {
  code: string;
  name: string;
  rate: number;
  cgst: number;
  sgst: number;
}
export interface MiracleLine {
  itemCode: string;
  qty: number;
  rate: number;
  amount: number;
  hsn: string;
  gstRate: number;
}
/** A journal/contra voucher's balanced ledger legs (Miracle RKACCT01). */
export interface MiracleJournalLeg {
  accountCode: string;
  drCr: 'dr' | 'cr';
  amount: number;
  mode: string;
}
export interface MiracleJournal {
  miracleId: string;
  kind: 'journal' | 'contra';
  rawType: string; // N7 / BC
  date: string | null;
  narration: string;
  legs: MiracleJournalLeg[];
}
/** Opening balance carried from the earliest books year (RKACAMB1). */
export interface MiracleOpening { accountCode: string; balance: number; drCr: 'dr' | 'cr'; asOn: string | null; }
/** Defensive masters — present only in exports that use these Miracle modules. */
export interface MiracleSalesman { code: string; name: string; area: string; }
export interface MiracleGodown { code: string; name: string; }
export interface MiracleBatch { itemCode: string; batchNo: string; mrp: number; mfgDate: string | null; expDate: string | null; qty: number; }
export interface MiraclePriceLevel { code: string; name: string; rates: Array<{ itemCode: string; rate: number }>; }

export type VoucherKind = 'sale' | 'purchase' | 'sales_return' | 'receipt' | 'payment';
export interface MiracleVoucher {
  miracleId: string;
  kind: VoucherKind;
  rawType: string; // QS/SS/PP/SR/BR/CR/BP/CP
  date: string | null;
  billNo: string;
  partyCode: string;
  isCash: boolean;
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  lines: MiracleLine[];
}

/** GST state code for the seller (used to decide intra vs inter-state). */
const numDate = (r: DbfRecord, f: string) => (s(r[f]) ? s(r[f]) : null);

export class MiracleParser {
  constructor(private readonly root: string) {}

  private p(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  /** Financial-year sub-folders present (YR25 … YR32), sorted oldest→newest. */
  years(): string[] {
    return readdirSync(this.root)
      .filter((d) => /^YR\d+$/i.test(d) && existsSync(join(this.root, d, 'RKACCT41.DBF')))
      .sort();
  }

  /** The newest year folder — holds the current masters. */
  latestYear(): string {
    const ys = this.years();
    return ys[ys.length - 1] || 'YR32';
  }

  // ─── Masters ────────────────────────────────────────────────────────────
  /**
   * Company profile — the authoritative row is RKACCM17 (name, GSTIN, address,
   * pincode). RKACCM00.FIELD02 is only an internal folder alias, so we do NOT use
   * it as the legal name. Falls back to a GSTIN scan only if RKACCM17 is absent.
   */
  company(): MiracleCompany {
    const m17 = readDbfSafe(this.p('RKACCM17.DBF')).records[0];
    if (m17 && s(m17.M17F02)) {
      const gstin = s(m17.M17F02).toUpperCase().replace(/\s/g, '');
      const valid = /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]{3}$/.test(gstin);
      return {
        name: s(m17.M17F05) || s(m17.M17F06) || 'Company',
        gstin: valid ? gstin : '',
        pan: valid ? gstin.slice(2, 12) : '',
        address: (s(m17.M17F22) || s(m17.M17F17)).replace(/\s+/g, ' ').trim(),
        city: s(m17.M17F06) || s(m17.M17F20),
        state: '',
        stateCode: valid ? gstin.slice(0, 2) : '',
        pincode: s(m17.M17F24),
        phone: cleanPhone(s(m17.M17F23)),
      };
    }
    // Fallback: no company profile row — scan GST XML/config for the home GSTIN.
    const parties = this.parties();
    const stateCounts = new Map<string, number>();
    for (const p of parties) if (p.stateCode) stateCounts.set(p.stateCode, (stateCounts.get(p.stateCode) || 0) + 1);
    const homeState = [...stateCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '27';
    const gstin = this.findCompanyGstin(homeState, parties);
    return {
      name: 'Company', gstin, pan: gstin ? gstin.slice(2, 12) : '',
      address: '', city: '', state: '', stateCode: gstin ? gstin.slice(0, 2) : homeState, pincode: '', phone: '',
    };
  }

  /** Scan GST XML/config files for the company's own GSTIN (home-state, non-party). */
  private findCompanyGstin(homeState: string, parties: MiracleParty[]): string {
    const re = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]{3}\b/g;
    const partyGstins = new Set(parties.map((p) => p.gstin).filter(Boolean));
    const files: string[] = [];
    for (const d of ['', this.latestYear()]) {
      const base = d ? this.p(d) : this.root;
      try {
        for (const f of readdirSync(base)) if (/\.(xml|mem)$/i.test(f)) files.push(join(base, f));
      } catch {
        /* ignore */
      }
    }
    const counts = new Map<string, number>();
    for (const f of files) {
      let txt = '';
      try {
        txt = readFileSync(f, 'latin1');
      } catch {
        continue;
      }
      for (const m of txt.match(re) || []) {
        if (partyGstins.has(m) || m.slice(0, 2) !== homeState) continue;
        counts.set(m, (counts.get(m) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  groups(): Map<string, MiracleGroup> {
    const rows = readDbfSafe(this.p(this.latestYear(), 'RKACCM11.DBF')).records;
    const map = new Map<string, MiracleGroup>();
    for (const r of rows) {
      const name = s(r.FIELD02);
      map.set(s(r.FIELD01), { code: s(r.FIELD01), name, parent: s(r.FIELD05), nature: natureOf(name, s(r.FIELD09)) });
    }
    return map;
  }

  private partyDetails(y: string): Map<string, DbfRecord> {
    const m = new Map<string, DbfRecord>();
    for (const r of readDbfSafe(this.p(y, 'RKACCM02.DBF')).records) m.set(s(r.FIELD01), r);
    return m;
  }

  /** Customers + suppliers (ledgers under Sundry Debtors / Sundry Creditors). */
  parties(): MiracleParty[] {
    const y = this.latestYear();
    const groups = this.groups();
    const details = this.partyDetails(y);
    const openings = this.openingBalances();
    const out: MiracleParty[] = [];
    for (const r of readDbfSafe(this.p(y, 'RKACCM01.DBF')).records) {
      const g = groups.get(s(r.FIELD05));
      const gname = (g?.name || '').toLowerCase();
      let group: 'customer' | 'supplier' | null = null;
      if (gname.includes('debtor')) group = 'customer';
      else if (gname.includes('creditor')) group = 'supplier';
      if (!group) continue;
      const d = details.get(s(r.FIELD01)) || {};
      // Opening balance: prefer the authoritative RKACAMB1 figure, else M01.FIELD10.
      const op = openings.get(s(r.FIELD01));
      const ob = op ? (op.drCr === 'cr' ? -op.balance : op.balance) : num(r.FIELD10);
      out.push({
        code: s(r.FIELD01),
        name: s(r.FIELD02) || s(d.FIELD61) || s(r.FIELD01),
        group,
        gstin: s(r.M01F05).length === 15 ? s(r.M01F05) : '',
        pan: s(r.M01F05).length === 15 ? s(r.M01F05).slice(2, 12) : '',
        address: s(d.FIELD02).replace(/,+$/, ''),
        city: s(d.FIELD05),
        area: s(d.FIELD06),
        state: s(d.FIELD53),
        stateCode: s(d.M02F74),
        pincode: s(d.FIELD07),
        contactPerson: s(d.FIELD50),
        phone: cleanPhone(s(d.FIELD35) || s(d.FIELD21)),
        openingBalance: Math.abs(ob),
        openingDrCr: group === 'customer' ? 'DR' : 'CR',
      });
    }
    return out;
  }

  /** Non-party ledgers (cash, bank, sales, purchase, tax, expense, income…). */
  ledgers(): MiracleLedger[] {
    const y = this.latestYear();
    const groups = this.groups();
    const openings = this.openingBalances();
    const out: MiracleLedger[] = [];
    for (const r of readDbfSafe(this.p(y, 'RKACCM01.DBF')).records) {
      const g = groups.get(s(r.FIELD05));
      const gname = (g?.name || '').toLowerCase();
      if (gname.includes('debtor') || gname.includes('creditor')) continue; // parties handled separately
      const op = openings.get(s(r.FIELD01));
      const ob = op ? (op.drCr === 'cr' ? -op.balance : op.balance) : num(r.FIELD10);
      out.push({
        code: s(r.FIELD01),
        name: s(r.FIELD02),
        groupName: g?.name || 'Suspense Account',
        nature: g?.nature || 'asset',
        gstin: s(r.M01F05).length === 15 ? s(r.M01F05) : '',
        openingBalance: Math.abs(ob),
        openingDrCr: ob < 0 ? 'cr' : 'dr',
      });
    }
    return out;
  }

  taxRates(): MiracleTaxRate[] {
    const rows = readDbfSafe(this.p(this.latestYear(), 'RKACCM13.DBF')).records;
    return rows.map((r) => ({
      code: s(r.M13F01),
      name: s(r.M13F02),
      rate: num(r.M13F06),
      cgst: num(r.M13F04),
      sgst: num(r.M13F05),
    }));
  }

  private nameMap(file: string, codeF: string, nameF: string): Map<string, string> {
    const m = new Map<string, string>();
    for (const r of readDbfSafe(this.p(this.latestYear(), file)).records) m.set(s(r[codeF]), s(r[nameF]));
    return m;
  }

  items(): MiracleItem[] {
    const y = this.latestYear();
    const brands = this.nameMap('RKACCM26.DBF', 'M26F01', 'M26F02');
    const cats = this.nameMap('RKACCM27.DBF', 'M27F01', 'M27F02');
    // Rates + stock keyed by item code (RKACCM29).
    const rates = new Map<string, DbfRecord>();
    for (const r of readDbfSafe(this.p(y, 'RKACCM29.DBF')).records) rates.set(s(r.M29F01), r);
    // Per-item GST rate + last selling rate: the item master often has no rate
    // (it's set at billing time), so derive both from how the item actually sold
    // in the latest years' transactions.
    const itemGst = this.deriveItemGst(y);
    const lastRate = this.deriveItemRate();
    const out: MiracleItem[] = [];
    for (const r of readDbfSafe(this.p(y, 'RKACCM21.DBF')).records) {
      const code = s(r.FIELD01);
      const rt = rates.get(code) || {};
      // Real Miracle unit lives in M21F28 as "CODE-NAME" (e.g. "NOS-NUMBERS").
      const unit = s(r.M21F28).split('-')[0].trim() || s(r.M21F27) || 'NOS';
      const masterSale = num(rt.M29F02);
      out.push({
        code,
        name: s(r.FIELD02) || code,
        hsn: s(r.FIELD40),
        category: cats.get(s(r.FIELD12)) || brands.get(s(r.FIELD11)) || '',
        brand: brands.get(s(r.FIELD11)) || '',
        unit,
        // fall back to the last real selling rate, then the purchase rate.
        saleRate: masterSale || lastRate.get(code) || num(rt.M29F03),
        purchaseRate: num(rt.M29F03),
        openingStock: num(rt.M29F10),
        openingRate: num(rt.M29F03),
        gstRate: itemGst.get(code) ?? 0,
      });
    }
    return out;
  }

  /**
   * itemCode → name across ALL years' item masters (RKACCM21). The current-year master
   * (items()) only has active items, but historical invoices reference discontinued
   * items from earlier years — this recovers their names so line items never fall back
   * to the raw code.
   */
  itemNamesAllYears(): Map<string, string> {
    const map = new Map<string, string>();
    for (const y of this.years()) {
      const f = this.p(y, 'RKACCM21.DBF');
      if (!existsSync(f)) continue;
      for (const r of readDbfSafe(f).records) {
        const code = s(r.FIELD01);
        const name = s(r.FIELD02);
        if (code && name) map.set(code, name);
      }
    }
    return map;
  }

  /** itemCode → modal GST rate, from the latest year's line items + T52 tax rows. */
  private deriveItemGst(y: string): Map<string, number> {
    const dir = this.p(y);
    // voucher → its (single) GST rate from the T52 tax lines
    const rateByV = new Map<string, number>();
    for (const r of readDbfSafe(join(dir, 'RKACCT52.DBF')).records) {
      if (s(r.T52F04) !== 'T') continue;
      const rate = num(r.T52F18);
      if (rate > 0 && !rateByV.has(s(r.T52F01))) rateByV.set(s(r.T52F01), rate);
    }
    // for each item, tally the rates of vouchers it appears in
    const tally = new Map<string, Map<number, number>>();
    for (const r of readDbfSafe(join(dir, 'RKACCT02.DBF')).records) {
      const rate = rateByV.get(s(r.FIELD01));
      if (rate == null) continue;
      const code = s(r.FIELD03);
      const m = tally.get(code) || new Map<number, number>();
      m.set(rate, (m.get(rate) || 0) + 1);
      tally.set(code, m);
    }
    const out = new Map<string, number>();
    for (const [code, m] of tally) out.set(code, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    return out;
  }

  /** itemCode → most recent non-zero selling rate, scanned newest year backwards. */
  private deriveItemRate(): Map<string, number> {
    const out = new Map<string, number>();
    const years = [...this.years()].reverse(); // newest first
    for (const y of years) {
      for (const r of readDbfSafe(this.p(y, 'RKACCT02.DBF')).records) {
        const code = s(r.FIELD03);
        if (out.has(code)) continue;
        const rate = num(r.FIELD07);
        if (rate > 0) out.set(code, rate);
      }
      if (out.size > 5000) break; // plenty
    }
    return out;
  }

  /**
   * Authoritative closing stock per item, from Miracle's own stock-summary table
   * RKACPMB2 (latest year): MB2F96 = closing qty (verified: opening MB2F80 + inward
   * MB2F94 − outward MB2F98 = closing MB2F96). This is far more reliable than deriving
   * stock from vouchers, because Miracle item codes are year-scoped and don't bridge
   * across financial years — so a voucher-only Σpurchases−Σsales badly undercounts.
   */
  closingStock(): Map<string, number> {
    const out = new Map<string, number>();
    const path = this.p(this.latestYear(), 'RKACPMB2.DBF');
    if (!existsSync(path)) return out;
    for (const r of readDbfSafe(path).records) {
      const code = s(r.MB2F01);
      if (!code) continue;
      out.set(code, num(r.MB2F96));
    }
    return out;
  }

  // ─── Vouchers (per year) ─────────────────────────────────────────────────
  vouchers(year: string, sellerStateCode: string): MiracleVoucher[] {
    const dir = this.p(year);
    if (!existsSync(join(dir, 'RKACCT41.DBF'))) return [];
    const headers = readDbf(join(dir, 'RKACCT41.DBF')).records;
    // Lines grouped by voucher id.
    const linesByV = new Map<string, MiracleLine[]>();
    for (const r of readDbfSafe(join(dir, 'RKACCT02.DBF')).records) {
      const vid = s(r.FIELD01);
      const arr = linesByV.get(vid) || [];
      arr.push({
        itemCode: s(r.FIELD03),
        qty: num(r.FIELD06),
        rate: num(r.FIELD07),
        amount: num(r.FIELD08),
        hsn: '',
        gstRate: 0,
      });
      linesByV.set(vid, arr);
    }
    // GST per voucher: aggregate the "T" (taxable) rows; capture per-HSN rate.
    const gstByV = new Map<string, { cgst: number; sgst: number; taxable: number; tax: number; hsn: string; rate: number }>();
    for (const r of readDbfSafe(join(dir, 'RKACCT52.DBF')).records) {
      if (s(r.T52F04) !== 'T') continue; // only true tax lines
      const vid = s(r.T52F01);
      const g = gstByV.get(vid) || { cgst: 0, sgst: 0, taxable: 0, tax: 0, hsn: '', rate: 0 };
      g.cgst += num(r.T52F15);
      g.sgst += num(r.T52F17);
      g.taxable += num(r.T52F13);
      g.tax += num(r.T52F25);
      if (!g.hsn && s(r.T52F08)) g.hsn = s(r.T52F08);
      if (!g.rate && num(r.T52F18)) g.rate = num(r.T52F18);
      gstByV.set(vid, g);
    }

    const KIND: Record<string, { kind: VoucherKind; cash: boolean } | undefined> = {
      QS: { kind: 'sale', cash: true },
      SS: { kind: 'sale', cash: false },
      PP: { kind: 'purchase', cash: false },
      SR: { kind: 'sales_return', cash: false },
      BR: { kind: 'receipt', cash: false },
      CR: { kind: 'receipt', cash: true },
      BP: { kind: 'payment', cash: false },
      CP: { kind: 'payment', cash: true },
    };

    const out: MiracleVoucher[] = [];
    for (const h of headers) {
      const type = s(h.FIELD98);
      const meta = KIND[type];
      if (!meta) continue; // skip contra / journal (BC/N7/A4)
      const vid = s(h.FIELD01);
      const total = num(h.FIELD06); // authoritative billed amount
      const g = gstByV.get(vid);
      const isTxn = meta.kind === 'sale' || meta.kind === 'purchase' || meta.kind === 'sales_return';
      let taxable = 0;
      let tax = 0;
      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      let roundOff = 0;
      if (isTxn) {
        taxable = g ? g.taxable : total;
        cgst = g ? g.cgst : 0;
        sgst = g ? g.sgst : 0;
        tax = cgst + sgst;
        // Inter-state invoices book the whole tax as IGST (no CGST/SGST split).
        if (!!sellerStateCode && tax === 0 && g && g.tax > 0) {
          igst = g.tax;
          tax = igst;
        }
        // Any residual (freight, discount, round-off) is the plug so it always
        // reconciles: taxable + tax + roundOff = total. round_off is DECIMAL(6,2)
        // in the schema, so anything beyond a rupee or two of rounding is folded
        // back into the taxable value instead of overflowing the column.
        roundOff = round2(total - taxable - tax);
        if (Math.abs(roundOff) > 5) {
          taxable = round2(total - tax);
          roundOff = 0;
        }
      }
      const lines = (linesByV.get(vid) || []).map((l) => ({
        ...l,
        hsn: g?.hsn || '',
        gstRate: g?.rate || 0,
      }));
      const partyCode = s(h.FIELD04);
      out.push({
        miracleId: vid,
        kind: meta.kind,
        rawType: type,
        date: numDate(h, 'FIELD02'),
        billNo: s(h.T41FVNO).replace(/\s+/g, ' ').trim() || s(h.FIELD12),
        partyCode,
        isCash: meta.cash || partyCode.toUpperCase().includes('CASH'),
        taxable: round2(taxable),
        tax: round2(tax),
        cgst: round2(cgst),
        sgst: round2(sgst),
        igst: round2(igst),
        roundOff,
        total: round2(total),
        lines,
      });
    }
    return out;
  }

  /**
   * Journal (N7) and Contra (BC) vouchers, from the double-entry GL ledger table
   * RKACCT01 — the legs the invoice/receipt path can't reconstruct. Each row is one
   * Dr/Cr posting; grouped by voucher id they balance (ΣDr = ΣCr). These complete the
   * trial balance, ledger statements and day book (previously skipped entirely).
   */
  journals(year: string): MiracleJournal[] {
    const dir = this.p(year);
    if (!existsSync(join(dir, 'RKACCT01.DBF'))) return [];
    const byV = new Map<string, MiracleJournal>();
    const KIND: Record<string, 'journal' | 'contra'> = { N7: 'journal', BC: 'contra' };
    for (const r of readDbfSafe(join(dir, 'RKACCT01.DBF')).records) {
      const kind = KIND[s(r.FIELD98)];
      if (!kind) continue;
      const vid = s(r.FIELD01);
      const amount = num(r.FIELD05);
      if (!vid || amount === 0) continue;
      const v = byV.get(vid) || {
        miracleId: vid, kind, rawType: s(r.FIELD98), date: numDate(r, 'FIELD02'),
        narration: s(r.FIELD12) || s(r.T41FVNO), legs: [],
      };
      v.legs.push({
        accountCode: s(r.FIELD03),
        drCr: s(r.FIELD06) === 'D' ? 'dr' : 'cr',
        amount: round2(Math.abs(amount)),
        mode: s(r.FIELD15),
      });
      byV.set(vid, v);
    }
    // Keep only vouchers whose legs balance (guards against partial/edited rows).
    return [...byV.values()].filter((v) => {
      const dr = v.legs.filter((l) => l.drCr === 'dr').reduce((s2, l) => s2 + l.amount, 0);
      const cr = v.legs.filter((l) => l.drCr === 'cr').reduce((s2, l) => s2 + l.amount, 0);
      return v.legs.length >= 2 && Math.abs(dr - cr) < 1;
    });
  }

  /**
   * Opening balances per account from the earliest books year (RKACAMB1.MB1F90,
   * signed — negative = credit). Authoritative source; the party/ledger master's
   * own opening field (M01.FIELD10) is frequently 0.
   */
  private _openings?: Map<string, MiracleOpening>;
  openingBalances(): Map<string, MiracleOpening> {
    if (this._openings) return this._openings;
    const first = this.years()[0] || this.latestYear();
    const out = new Map<string, MiracleOpening>();
    for (const r of readDbfSafe(this.p(first, 'RKACAMB1.DBF')).records) {
      const code = s(r.MB1F01);
      const bal = num(r.MB1F90);
      if (!code || bal === 0) continue;
      out.set(code, { accountCode: code, balance: round2(Math.abs(bal)), drCr: bal < 0 ? 'cr' : 'dr', asOn: numDate(r, 'MB1F02') });
    }
    this._openings = out;
    return out;
  }

  // ─── Defensive masters (empty unless the export uses these modules) ─────────
  /** Salesmen/agents — only if a dedicated master with names exists. */
  salesmen(): MiracleSalesman[] {
    const out: MiracleSalesman[] = [];
    for (const file of ['RKACCM12.DBF', 'RKACCM46.DBF', 'RKACCM48.DBF']) {
      const path = this.p(this.latestYear(), file);
      if (!existsSync(path)) continue;
      for (const r of readDbfSafe(path).records) {
        const code = s(r.FIELD01) || s(r[Object.keys(r)[0]]);
        const name = s(r.FIELD02) || s(r[Object.keys(r)[1]]);
        if (code && name && name.length > 1 && !/^\d+$/.test(name)) out.push({ code, name, area: s(r.FIELD03) });
      }
      if (out.length) break;
    }
    return out;
  }
  /** Godowns/warehouses — only if a dedicated master with names exists. */
  godowns(): MiracleGodown[] {
    const out: MiracleGodown[] = [];
    for (const file of ['RKACCM33.DBF', 'RKACCM14.DBF']) {
      const path = this.p(this.latestYear(), file);
      if (!existsSync(path)) continue;
      const rows = readDbfSafe(path).records;
      // Heuristic: a godown master is a small list of code+name where names look
      // like locations (not HSN codes or business types). Skip if it looks wrong.
      const cand = rows.map((r) => ({ code: s(r.FIELD01) || s(r.M33F01), name: s(r.FIELD02) || s(r.M33F02) }))
        .filter((x) => x.code && x.name && /warehouse|godown|store|branch|main|shop/i.test(x.name));
      if (cand.length) { out.push(...cand); break; }
    }
    return out;
  }
  /** Item batches (MRP/mfg/expiry) — only if the batch module is used. */
  batches(): MiracleBatch[] {
    const path = this.p(this.latestYear(), 'RKACPMB2.DBF');
    if (!existsSync(path)) return [];
    const t = readDbfSafe(path);
    const hasBatchFields = t.fields.some((f) => /batch|mrp|exp|mfg/i.test(f.name));
    if (!hasBatchFields) return []; // this export stores only stock valuation, not batches
    const out: MiracleBatch[] = [];
    for (const r of t.records) {
      const batchNo = s((r as any).BATCHNO) || s((r as any).MB2F03);
      if (!batchNo) continue;
      out.push({ itemCode: s(r.MB2F01), batchNo, mrp: num((r as any).MRP), mfgDate: null, expDate: null, qty: num((r as any).MB2F94) });
    }
    return out;
  }
  /** Multi-tier price lists — only if per-level rates exist. */
  priceLevels(): MiraclePriceLevel[] { return []; }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function cleanPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
function natureOf(name: string, flag: string): 'asset' | 'liability' | 'income' | 'expense' {
  // RKACCM11.FIELD09 is the authoritative nature flag: A=asset, L=liability,
  // I=income, C=credit-trading (income), D=direct-expense, E=expense. Prefer it.
  const f = (flag || '').toUpperCase();
  if (f === 'A') return 'asset';
  if (f === 'L') return 'liability';
  if (f === 'I' || f === 'C') return 'income';
  if (f === 'D' || f === 'E') return 'expense';
  const n = name.toLowerCase();
  if (/(sales|income|revenue|jobwork income)/.test(n)) return 'income';
  if (/(purchase|expense|remuneration|interest|jobwork expense)/.test(n)) return 'expense';
  if (/(debtor|asset|cash|bank|deposit|loans & advances|investment|stock|closing)/.test(n)) return 'asset';
  if (/(creditor|liabilit|capital|loan|duties|taxes|provision|reserve|surplus|suspense)/.test(n)) return 'liability';
  return 'asset';
}
