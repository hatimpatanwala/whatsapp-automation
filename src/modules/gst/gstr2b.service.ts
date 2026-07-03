import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

function num(v: unknown): number {
  return Number(v) || 0;
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function normDoc(s: unknown): string {
  return String(s || '').toUpperCase().replace(/[\s/\-]/g, '');
}

interface Line {
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  invoiceValue: number;
}

/**
 * GSTR-2B (inward ITC) import + reconciliation (Phase 5). Import the portal's GSTR-2B
 * JSON, then reconcile it against the local purchase register (supplier_orders + supplier
 * GSTIN). Matching prefers the supplier invoice number, falling back to GSTIN + value.
 */
@Injectable()
export class Gstr2bService {
  constructor(private readonly cm: TenantConnectionManager) {}

  /** Parse and store a GSTR-2B JSON (or a simplified flat array) for a period, replacing prior rows. */
  async import2b(schema: string, period: string, json: any): Promise<{ imported: number; period: string }> {
    if (!/^\d{6}$/.test(period || '')) throw new BadRequestException('period must be MMYYYY');
    const lines = this.parse(json);

    return this.cm.executeInTransaction(schema, async (qr) => {
      await qr.query(`DELETE FROM "${schema}".gstr2b_records WHERE period = $1`, [period]);
      for (const l of lines) {
        await qr.query(
          `INSERT INTO "${schema}".gstr2b_records
             (period, supplier_gstin, supplier_name, invoice_number, invoice_date,
              taxable_value, igst, cgst, sgst, total_tax, invoice_value, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            period, l.supplierGstin, l.supplierName, l.invoiceNumber, l.invoiceDate,
            l.taxableValue, l.igst, l.cgst, l.sgst, l.totalTax, l.invoiceValue, JSON.stringify(l),
          ],
        );
      }
      return { imported: lines.length, period };
    });
  }

  private parse(json: any): Line[] {
    const out: Line[] = [];
    if (Array.isArray(json)) {
      for (const r of json) {
        const igst = num(r.igst ?? r.iamt);
        const cgst = num(r.cgst ?? r.camt);
        const sgst = num(r.sgst ?? r.samt);
        out.push({
          supplierGstin: r.supplierGstin || r.ctin || '',
          supplierName: r.supplierName || r.trdnm || '',
          invoiceNumber: r.invoiceNumber || r.inum || '',
          invoiceDate: r.invoiceDate || r.dt || null,
          taxableValue: num(r.taxableValue ?? r.txval),
          igst, cgst, sgst,
          totalTax: round2(igst + cgst + sgst),
          invoiceValue: num(r.invoiceValue ?? r.val),
        });
      }
      return out;
    }
    // Official portal shape: … docdata.b2b[] → { ctin, trdnm, inv[] → { inum, dt, val, itms[] → { itm_det } } }
    const b2b = json?.data?.docdata?.b2b || json?.docdata?.b2b || json?.b2b || [];
    for (const sup of b2b) {
      for (const inv of sup.inv || []) {
        let taxable = 0, igst = 0, cgst = 0, sgst = 0;
        for (const it of inv.itms || []) {
          const d = it.itm_det || it;
          taxable += num(d.txval);
          igst += num(d.iamt);
          cgst += num(d.camt);
          sgst += num(d.samt);
        }
        out.push({
          supplierGstin: sup.ctin || '',
          supplierName: sup.trdnm || '',
          invoiceNumber: inv.inum || '',
          invoiceDate: inv.dt || null,
          taxableValue: round2(taxable),
          igst: round2(igst),
          cgst: round2(cgst),
          sgst: round2(sgst),
          totalTax: round2(igst + cgst + sgst),
          invoiceValue: num(inv.val),
        });
      }
    }
    return out;
  }

  /** Reconcile stored 2B lines for a period against the purchase register. */
  async reconcile(schema: string, period: string) {
    if (!/^\d{6}$/.test(period || '')) throw new BadRequestException('period must be MMYYYY (e.g. 072026)');

    return this.cm.executeInTenantContext(schema, async (qr) => {
      const portal: any[] = await qr.query(`SELECT * FROM "${schema}".gstr2b_records WHERE period = $1`, [period]);
      const books: any[] = await qr.query(
        `SELECT so.order_number, so.supplier_invoice_no, so.subtotal, so.discount, so.total_tax, so.total,
                s.gstin AS supplier_gstin, s.company AS supplier_name
         FROM "${schema}".supplier_orders so
         LEFT JOIN "${schema}".suppliers s ON s.id = so.supplier_id
         WHERE so.removed = false AND to_char(so.created_at, 'MMYYYY') = $1`,
        [period],
      );

      const bookRows = books.map((b) => ({
        gstin: b.supplier_gstin || '',
        supplierName: b.supplier_name || '',
        docNumber: b.supplier_invoice_no || b.order_number,
        taxable: round2(num(b.subtotal) - num(b.discount)),
        tax: round2(num(b.total_tax)),
        total: round2(num(b.total)),
        used: false,
      }));

      const matched: any[] = [];
      const mismatch: any[] = [];
      const onlyInPortal: any[] = [];

      for (const p of portal) {
        const pGstin = p.supplier_gstin || '';
        const pDoc = normDoc(p.invoice_number);
        const pTotal = num(p.invoice_value);
        const pTax = num(p.total_tax);

        // 1) exact: same GSTIN + invoice number
        let idx = bookRows.findIndex((b) => !b.used && b.gstin === pGstin && normDoc(b.docNumber) === pDoc);
        // 2) fallback: same GSTIN + value within ₹1
        if (idx < 0) idx = bookRows.findIndex((b) => !b.used && b.gstin === pGstin && Math.abs(b.total - pTotal) <= 1);
        // 3) any same GSTIN → mismatch
        const sameGstin = idx < 0 ? bookRows.findIndex((b) => !b.used && b.gstin === pGstin) : -1;

        const portalLine = {
          supplierGstin: pGstin,
          supplierName: p.supplier_name,
          invoiceNumber: p.invoice_number,
          taxableValue: round2(num(p.taxable_value)),
          totalTax: round2(pTax),
          invoiceValue: round2(pTotal),
        };

        if (idx >= 0) {
          bookRows[idx].used = true;
          matched.push({ portal: portalLine, book: bookRows[idx], taxDiff: round2(pTax - bookRows[idx].tax) });
        } else if (sameGstin >= 0) {
          bookRows[sameGstin].used = true;
          mismatch.push({ portal: portalLine, book: bookRows[sameGstin], taxDiff: round2(pTax - bookRows[sameGstin].tax) });
        } else {
          onlyInPortal.push(portalLine);
        }
      }

      const onlyInBooks = bookRows.filter((b) => !b.used);

      const sum = (arr: any[], f: (x: any) => number) => round2(arr.reduce((s, x) => s + f(x), 0));
      return {
        period,
        summary: {
          itcAsPer2b: sum(portal, (p) => num(p.total_tax)),
          itcInBooks: sum(bookRows, (b) => b.tax),
          matchedTax: sum(matched, (m) => m.portal.totalTax),
          matchedCount: matched.length,
          mismatchCount: mismatch.length,
          onlyInPortalCount: onlyInPortal.length,
          onlyInBooksCount: onlyInBooks.length,
        },
        matched,
        mismatch,
        onlyInPortal,
        onlyInBooks,
      };
    });
  }
}
