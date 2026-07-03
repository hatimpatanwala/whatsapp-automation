import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { SellerProfileService } from './seller-profile.service';

function num(v: unknown): number {
  return Number(v) || 0;
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Parse 'YYYY-MM' into an inclusive/exclusive date range + the portal 'MMYYYY' tag. */
function monthRange(month?: string): { from: string; toExclusive: string; fp: string } {
  const now = new Date();
  const m = /^\d{4}-\d{2}$/.test(month || '') ? (month as string) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, mm] = m.split('-').map(Number);
  const nextY = mm === 12 ? y + 1 : y;
  const nextM = mm === 12 ? 1 : mm + 1;
  return {
    from: `${m}-01`,
    toExclusive: `${nextY}-${String(nextM).padStart(2, '0')}-01`,
    fp: `${String(mm).padStart(2, '0')}${y}`,
  };
}

/**
 * Indian GST returns computed from the `invoices` table. The invoice-level
 * taxable_value / cgst / sgst / igst columns are authoritative (set at invoice
 * creation), so GSTR-1 B2B/B2C and GSTR-3B totals are exact. Rate-wise and HSN detail
 * are derived from the stored line items (`items` JSONB) and are best-effort.
 */
@Injectable()
export class GstReturnsService {
  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly seller: SellerProfileService,
  ) {}

  private invoicesInPeriod(schema: string, from: string, toExclusive: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, invoice_number, issued_at, doc_type, customer_name, buyer_gstin, seller_gstin,
                place_of_supply, is_interstate, taxable_value, cgst, sgst, igst, total_tax, total, items
         FROM "${schema}".invoices
         WHERE issued_at >= $1 AND issued_at < $2 AND COALESCE(status,'issued') <> 'cancelled'
         ORDER BY issued_at`,
        [from, toExclusive],
      ),
    );
  }

  private effectiveRate(inv: any): number {
    const taxable = num(inv.taxable_value);
    const tax = num(inv.total_tax) || num(inv.cgst) + num(inv.sgst) + num(inv.igst);
    if (taxable <= 0) return 0;
    return Math.round((tax / taxable) * 100);
  }

  /** GSTR-1 — outward supplies, split B2B / B2C, plus totals. */
  async gstr1(schema: string, month?: string) {
    const { from, toExclusive, fp } = monthRange(month);
    const invoices = await this.invoicesInPeriod(schema, from, toExclusive);

    const b2b: any[] = [];
    const b2cMap = new Map<string, any>();
    for (const inv of invoices) {
      const rate = this.effectiveRate(inv);
      const row = {
        invoiceNumber: inv.invoice_number,
        date: inv.issued_at,
        customerName: inv.customer_name,
        gstin: inv.buyer_gstin,
        placeOfSupply: inv.place_of_supply,
        rate,
        taxableValue: round2(num(inv.taxable_value)),
        igst: round2(num(inv.igst)),
        cgst: round2(num(inv.cgst)),
        sgst: round2(num(inv.sgst)),
        total: round2(num(inv.total)),
      };
      if (inv.buyer_gstin) {
        b2b.push(row);
      } else {
        // B2C small — aggregate by place of supply + rate.
        const key = `${inv.place_of_supply || ''}|${rate}`;
        const agg = b2cMap.get(key) || { placeOfSupply: inv.place_of_supply, rate, taxableValue: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        agg.taxableValue = round2(agg.taxableValue + num(inv.taxable_value));
        agg.igst = round2(agg.igst + num(inv.igst));
        agg.cgst = round2(agg.cgst + num(inv.cgst));
        agg.sgst = round2(agg.sgst + num(inv.sgst));
        agg.total = round2(agg.total + num(inv.total));
        b2cMap.set(key, agg);
      }
    }
    const b2cs = [...b2cMap.values()];
    const totals = this.sumTotals(invoices);
    return { period: fp, b2b, b2cs, totals };
  }

  /** GSTR-3B — section 3.1(a) outward taxable supplies summary. */
  async gstr3b(schema: string, month?: string) {
    const { from, toExclusive, fp } = monthRange(month);
    const invoices = await this.invoicesInPeriod(schema, from, toExclusive);
    const t = this.sumTotals(invoices);
    return {
      period: fp,
      outwardTaxableSupplies: {
        taxableValue: t.taxableValue,
        igst: t.igst,
        cgst: t.cgst,
        sgst: t.sgst,
        cess: 0,
      },
      invoiceCount: invoices.length,
      totalInvoiceValue: t.total,
    };
  }

  /** HSN-wise summary (best-effort from line items). */
  async hsnSummary(schema: string, month?: string) {
    const { from, toExclusive } = monthRange(month);
    const invoices = await this.invoicesInPeriod(schema, from, toExclusive);
    const map = new Map<string, any>();
    for (const inv of invoices) {
      const interstate = !!inv.is_interstate;
      const items: any[] = Array.isArray(inv.items) ? inv.items : [];
      for (const line of items) {
        const hsn = String(line.hsn || line.hsn_code || '').trim();
        const rate = num(line.gst_rate ?? line.gstRate);
        const value = num(line.line_total ?? line.lineTotal);
        const qty = num(line.qty ?? line.quantity);
        // Treat the stored line value as taxable; derive tax from its own rate.
        const tax = round2((value * rate) / 100);
        const key = `${hsn}|${rate}`;
        const agg = map.get(key) || { hsn: hsn || '(none)', rate, quantity: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0 };
        agg.quantity = round2(agg.quantity + qty);
        agg.taxableValue = round2(agg.taxableValue + value);
        if (interstate) agg.igst = round2(agg.igst + tax);
        else {
          agg.cgst = round2(agg.cgst + tax / 2);
          agg.sgst = round2(agg.sgst + tax / 2);
        }
        map.set(key, agg);
      }
    }
    return { rows: [...map.values()] };
  }

  /** GSTR-1 in the government offline-utility JSON shape (subset: b2b, b2cs, hsn). */
  async gstr1Json(schema: string, month: string | undefined, gstin: string) {
    const { fp } = monthRange(month);
    if (!gstin) gstin = (await this.seller.get(schema)).gstin;
    const [g1, hsn] = await Promise.all([this.gstr1(schema, month), this.hsnSummary(schema, month)]);

    const b2bByGstin = new Map<string, any>();
    for (const inv of g1.b2b) {
      const ctin = inv.gstin;
      const entry = b2bByGstin.get(ctin) || { ctin, inv: [] };
      entry.inv.push({
        inum: inv.invoiceNumber,
        idt: inv.date ? new Date(inv.date).toLocaleDateString('en-GB').replace(/\//g, '-') : '',
        val: inv.total,
        pos: (inv.placeOfSupply || '').slice(0, 2),
        rchrg: 'N',
        inv_typ: 'R',
        itms: [
          {
            num: 1,
            itm_det: { rt: inv.rate, txval: inv.taxableValue, iamt: inv.igst, camt: inv.cgst, samt: inv.sgst, csamt: 0 },
          },
        ],
      });
      b2bByGstin.set(ctin, entry);
    }

    const b2cs = g1.b2cs.map((r) => ({
      sply_ty: r.igst > 0 ? 'INTER' : 'INTRA',
      pos: (r.placeOfSupply || '').slice(0, 2),
      typ: 'OE',
      rt: r.rate,
      txval: r.taxableValue,
      iamt: r.igst,
      camt: r.cgst,
      samt: r.sgst,
      csamt: 0,
    }));

    return {
      gstin,
      fp,
      version: 'GST3.1.6',
      hash: 'hash',
      b2b: [...b2bByGstin.values()],
      b2cs,
      hsn: {
        data: hsn.rows.map((h, i) => ({
          num: i + 1,
          hsn_sc: h.hsn === '(none)' ? '' : h.hsn,
          rt: h.rate,
          qty: h.quantity,
          txval: h.taxableValue,
          iamt: h.igst,
          camt: h.cgst,
          samt: h.sgst,
          csamt: 0,
        })),
      },
    };
  }

  private sumTotals(invoices: any[]) {
    return invoices.reduce(
      (acc, inv) => ({
        taxableValue: round2(acc.taxableValue + num(inv.taxable_value)),
        igst: round2(acc.igst + num(inv.igst)),
        cgst: round2(acc.cgst + num(inv.cgst)),
        sgst: round2(acc.sgst + num(inv.sgst)),
        total: round2(acc.total + num(inv.total)),
      }),
      { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, total: 0 },
    );
  }
}
