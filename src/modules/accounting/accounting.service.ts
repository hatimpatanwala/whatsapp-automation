import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { ErpSequenceService } from '../erp/common/erp-sequence.service';
import { CreateLedgerDto, CreateVoucherDto } from './dto/accounting.dto';

const VOUCHER_PREFIX: Record<string, string> = {
  sales: 'SAL',
  purchase: 'PUR',
  payment: 'PAY',
  receipt: 'RCP',
  journal: 'JRN',
  debit_note: 'DN',
  credit_note: 'CN',
};

// Contra was merged into Journal — fold any incoming legacy type to its canonical form.
const VOUCHER_TYPE_CANONICAL: Record<string, string> = { contra: 'journal' };
const canonicalVoucherType = (t: string): string => VOUCHER_TYPE_CANONICAL[t] ?? t;

interface LedgerBalance {
  id: string;
  name: string;
  nature: 'asset' | 'liability' | 'income' | 'expense';
  /** Signed balance, debit-positive (dr = +, cr = −). */
  balance: number;
}

/**
 * Double-entry accounting engine (Phase 4). Every voucher must balance
 * (Σ debit = Σ credit); ledger balances and the financial statements are derived from
 * the voucher entries + opening balances. All access is tenant-schema scoped.
 */
@Injectable()
export class AccountingService {
  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly seq: ErpSequenceService,
  ) {}

  // ─── Masters ───────────────────────────────────────────────────────────────
  listGroups(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT * FROM "${schema}".ledger_groups ORDER BY nature, name`),
    );
  }

  listLedgers(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT la.*, g.name AS group_name, g.nature
         FROM "${schema}".ledger_accounts la
         JOIN "${schema}".ledger_groups g ON g.id = la.group_id
         WHERE la.is_active = true
         ORDER BY g.nature, la.name`,
      ),
    );
  }

  async createLedger(schema: string, dto: CreateLedgerDto) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${schema}".ledger_accounts (name, group_id, opening_balance, opening_type, gstin)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [dto.name, dto.groupId, dto.openingBalance ?? 0, dto.openingType ?? 'dr', dto.gstin ?? null],
      );
      return rows[0];
    });
  }

  // ─── Vouchers ────────────────────────────────────────────────────────────
  async createVoucher(schema: string, dto: CreateVoucherDto) {
    const entries = (dto.entries ?? []).map((e) => ({
      ledgerId: e.ledgerId,
      debit: e.debit ?? 0,
      credit: e.credit ?? 0,
      narration: e.narration,
    }));
    if (entries.length < 2) {
      throw new BadRequestException('A voucher needs at least two entries (a debit and a credit)');
    }
    const totalDebit = round2(entries.reduce((s, e) => s + e.debit, 0));
    const totalCredit = round2(entries.reduce((s, e) => s + e.credit, 0));
    if (totalDebit <= 0) throw new BadRequestException('Voucher total must be greater than zero');
    if (totalDebit !== totalCredit) {
      throw new BadRequestException(`Voucher does not balance: debit ${totalDebit} ≠ credit ${totalCredit}`);
    }

    const date = dto.date ? dto.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    return this.cm.executeInTransaction(schema, (qr) =>
      this.insertVoucher(qr, schema, {
        type: dto.type,
        date,
        narration: dto.narration,
        partyLedgerId: dto.partyLedgerId,
        reference: dto.reference,
        entries,
      }),
    );
  }

  /** Low-level voucher writer shared by manual creation and auto-posting. */
  private async insertVoucher(
    qr: QueryRunner,
    schema: string,
    p: {
      type: string;
      date: string;
      narration?: string;
      partyLedgerId?: string | null;
      reference?: string | null;
      entries: Array<{ ledgerId: string; debit: number; credit: number; narration?: string }>;
      sourceType?: string;
      sourceId?: string;
    },
  ) {
    const totalDebit = round2(p.entries.reduce((s, e) => s + (e.debit || 0), 0));
    const year = Number(p.date.slice(0, 4));
    const type = canonicalVoucherType(p.type);
    const prefix = VOUCHER_PREFIX[type] ?? 'VCH';
    const num = await this.seq.next(schema, `voucher_${type}`, { year, prefix }, qr);
    const voucher = (
      await qr.query(
        `INSERT INTO "${schema}".vouchers
           (voucher_type, number, date, narration, party_ledger_id, amount, reference, source_type, source_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [type, num.formatted, p.date, p.narration ?? null, p.partyLedgerId ?? null, totalDebit, p.reference ?? null, p.sourceType ?? null, p.sourceId ?? null],
      )
    )[0];
    for (const e of p.entries) {
      await qr.query(
        `INSERT INTO "${schema}".voucher_entries (voucher_id, ledger_id, debit, credit, narration)
         VALUES ($1,$2,$3,$4,$5)`,
        [voucher.id, e.ledgerId, e.debit || 0, e.credit || 0, e.narration ?? null],
      );
    }
    return { ...voucher, entries: p.entries };
  }

  private async namedLedgerId(qr: QueryRunner, schema: string, name: string): Promise<string | null> {
    const r = await qr.query(`SELECT id FROM "${schema}".ledger_accounts WHERE name = $1 LIMIT 1`, [name]);
    return r[0]?.id ?? null;
  }

  /** Find or create an Indirect-Incomes ledger by name (e.g. "Freight Income"). */
  private async ensureIncomeLedger(qr: QueryRunner, schema: string, name: string): Promise<string | null> {
    const existing = await this.namedLedgerId(qr, schema, name);
    if (existing) return existing;
    const ins = await qr.query(
      `INSERT INTO "${schema}".ledger_accounts (name, group_id)
       SELECT $1, g.id FROM "${schema}".ledger_groups g WHERE g.name = 'Indirect Incomes'
       ON CONFLICT (name) DO NOTHING RETURNING id`,
      [name.slice(0, 160)],
    );
    return ins[0]?.id ?? this.namedLedgerId(qr, schema, name);
  }

  /** Find or create a Duties & Taxes ledger by name (e.g. "TCS Payable"). */
  private async ensureDutyLedger(qr: QueryRunner, schema: string, name: string): Promise<string | null> {
    const existing = await this.namedLedgerId(qr, schema, name);
    if (existing) return existing;
    const ins = await qr.query(
      `INSERT INTO "${schema}".ledger_accounts (name, group_id)
       SELECT $1, g.id FROM "${schema}".ledger_groups g WHERE g.name = 'Duties & Taxes'
       ON CONFLICT (name) DO NOTHING RETURNING id`,
      [name.slice(0, 160)],
    );
    return ins[0]?.id ?? this.namedLedgerId(qr, schema, name);
  }

  /** Cancel a voucher (register action): excluded from every report; entries retained. */
  async cancelVoucher(schema: string, id: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `UPDATE "${schema}".vouchers SET status = 'cancelled' WHERE id = $1 AND status = 'active' RETURNING id, number`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException(`Voucher ${id} not found or already cancelled`);
      return { id: rows[0].id, number: rows[0].number, cancelled: true };
    });
  }

  /**
   * Find or create the party ledger for a customer (Sundry Debtors) or supplier
   * (Sundry Creditors) — idempotent by (source_type, source_id).
   */
  private async ensurePartyLedger(
    qr: QueryRunner,
    schema: string,
    kind: 'customer' | 'supplier',
    partyId?: string | null,
    partyName?: string | null,
  ): Promise<string | null> {
    if (!partyId) return null;
    const groupName = kind === 'customer' ? 'Sundry Debtors' : 'Sundry Creditors';
    const found = await qr.query(
      `SELECT id FROM "${schema}".ledger_accounts WHERE source_type=$1 AND source_id=$2`,
      [kind, partyId],
    );
    if (found[0]) return found[0].id;
    const grp = await qr.query(`SELECT id FROM "${schema}".ledger_groups WHERE name=$1 LIMIT 1`, [groupName]);
    const groupId = grp[0]?.id;
    if (!groupId) return null;
    const base = (partyName && partyName.trim()) || `${kind === 'customer' ? 'Customer' : 'Supplier'} ${String(partyId).slice(0, 8)}`;
    for (const candidate of [base, `${base} (${String(partyId).slice(0, 6)})`]) {
      const ins = await qr.query(
        `INSERT INTO "${schema}".ledger_accounts (name, group_id, source_type, source_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
        [candidate, groupId, kind, partyId],
      );
      if (ins[0]) return ins[0].id;
      const re = await qr.query(
        `SELECT id FROM "${schema}".ledger_accounts WHERE source_type=$1 AND source_id=$2`,
        [kind, partyId],
      );
      if (re[0]) return re[0].id;
    }
    return null;
  }

  /** Auto-post a Sales voucher for an issued invoice (Dr Debtor, Cr Sales + GST). Idempotent. */
  async postSalesInvoice(schema: string, invoiceId: string): Promise<void> {
    await this.cm.executeInTransaction(schema, async (qr) => {
      const dup = await qr.query(`SELECT 1 FROM "${schema}".vouchers WHERE source_type='invoice' AND source_id=$1`, [invoiceId]);
      if (dup.length) return;
      const inv = (await qr.query(`SELECT * FROM "${schema}".invoices WHERE id=$1`, [invoiceId]))[0];
      if (!inv) return;

      // Miracle cash memo: money is received on the spot — debit Cash, no debtor needed.
      const isCash = !!inv.is_cash;
      const debtor = isCash
        ? await this.namedLedgerId(qr, schema, 'Cash')
        : await this.ensurePartyLedger(qr, schema, 'customer', inv.customer_id, inv.customer_name);
      const salesId = await this.namedLedgerId(qr, schema, 'Sales');
      if (!debtor || !salesId) return;

      const total = num(inv.total);
      const cgst = num(inv.cgst);
      const sgst = num(inv.sgst);
      const igst = num(inv.igst);
      if (total <= 0) return;

      // Charges (freight/packing…) credit their OWN income ledgers under Indirect
      // Incomes, not Sales — so the P&L shows them separately (real ERP behaviour).
      const charges: Array<{ label: string; amount: number }> = Array.isArray(inv.charges) ? inv.charges : [];
      const chargesAmt = round2(charges.reduce((s, c) => s + num(c.amount), 0));
      const taxable = round2(num(inv.taxable_value) - chargesAmt); // lines-only taxable

      const entries: Array<{ ledgerId: string; debit: number; credit: number }> = [
        { ledgerId: debtor, debit: total, credit: 0 },
      ];
      if (taxable > 0) entries.push({ ledgerId: salesId, debit: 0, credit: taxable });
      for (const ch of charges) {
        const amt = round2(num(ch.amount));
        if (amt === 0) continue;
        const ledgerId = await this.ensureIncomeLedger(qr, schema, `${String(ch.label || 'Charges')} Income`);
        if (ledgerId) entries.push({ ledgerId, debit: amt < 0 ? -amt : 0, credit: amt > 0 ? amt : 0 });
      }

      const splitTax = round2(cgst + sgst + igst);
      let taxCredited = splitTax;
      if (splitTax > 0) {
        const cgstId = await this.namedLedgerId(qr, schema, 'CGST Payable');
        const sgstId = await this.namedLedgerId(qr, schema, 'SGST Payable');
        const igstId = await this.namedLedgerId(qr, schema, 'IGST Payable');
        if (cgst > 0 && cgstId) entries.push({ ledgerId: cgstId, debit: 0, credit: cgst });
        if (sgst > 0 && sgstId) entries.push({ ledgerId: sgstId, debit: 0, credit: sgst });
        if (igst > 0 && igstId) entries.push({ ledgerId: igstId, debit: 0, credit: igst });
      } else {
        // ERP invoices store a combined total_tax without the CGST/SGST split.
        const totalTax = num(inv.total_tax);
        const outputTaxId = await this.namedLedgerId(qr, schema, 'Output Tax');
        if (totalTax > 0 && outputTaxId) {
          entries.push({ ledgerId: outputTaxId, debit: 0, credit: totalTax });
          taxCredited = totalTax;
        }
      }

      // TCS collected rides on the invoice value — its own liability, never Round Off.
      const tcs = round2(num(inv.tcs_amount));
      if (tcs > 0) {
        const tcsId = await this.ensureDutyLedger(qr, schema, 'TCS Payable');
        if (tcsId) entries.push({ ledgerId: tcsId, debit: 0, credit: tcs });
      }

      // Absorb rounding into Round Off so the voucher balances exactly.
      const creditSum = round2(taxable + chargesAmt + taxCredited + tcs);
      const diff = round2(total - creditSum);
      const roundId = await this.namedLedgerId(qr, schema, 'Round Off');
      if (Math.abs(diff) >= 0.01 && roundId) {
        if (diff > 0) entries.push({ ledgerId: roundId, debit: 0, credit: diff });
        else entries.push({ ledgerId: roundId, debit: -diff, credit: 0 });
      }

      const td = round2(entries.reduce((s, e) => s + e.debit, 0));
      const tc = round2(entries.reduce((s, e) => s + e.credit, 0));
      if (td !== tc) return; // refuse to post an unbalanced voucher

      const date = inv.issued_at ? new Date(inv.issued_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      await this.insertVoucher(qr, schema, {
        type: 'sales',
        date,
        narration: `Auto-posted: Invoice ${inv.invoice_number}`,
        partyLedgerId: debtor,
        reference: inv.invoice_number,
        entries,
        sourceType: 'invoice',
        sourceId: invoiceId,
      });
    });
  }

  /** Auto-post a Receipt voucher for a verified payment (Dr Cash/Bank, Cr Debtor). Idempotent. */
  async postReceipt(schema: string, paymentId: string, customerId?: string, amount?: number): Promise<void> {
    await this.cm.executeInTransaction(schema, async (qr) => {
      const dup = await qr.query(`SELECT 1 FROM "${schema}".vouchers WHERE source_type='payment' AND source_id=$1`, [paymentId]);
      if (dup.length) return;
      const pay = (await qr.query(`SELECT * FROM "${schema}".payments WHERE id=$1`, [paymentId]))[0];
      if (!pay) return;

      const amt = round2(amount ?? num(pay.amount));
      if (amt <= 0) return;
      const isCash = String(pay.method || '').toLowerCase().includes('cash');
      const bankLedger = await this.namedLedgerId(qr, schema, isCash ? 'Cash' : 'Bank');

      let custName: string | undefined;
      if (customerId) {
        const c = await qr.query(`SELECT name FROM "${schema}".customers WHERE id=$1`, [customerId]);
        custName = c[0]?.name;
      }
      const debtor = await this.ensurePartyLedger(qr, schema, 'customer', customerId, custName);
      if (!bankLedger || !debtor) return;

      await this.insertVoucher(qr, schema, {
        type: 'receipt',
        date: new Date().toISOString().slice(0, 10),
        narration: 'Auto-posted: Payment received',
        partyLedgerId: debtor,
        reference: String(pay.transaction_ref || paymentId).slice(0, 40),
        entries: [
          { ledgerId: bankLedger, debit: amt, credit: 0 },
          { ledgerId: debtor, debit: 0, credit: amt },
        ],
        sourceType: 'payment',
        sourceId: paymentId,
      });
    });
  }

  /**
   * Auto-post a Purchase voucher for a recorded supplier order
   * (Dr Purchase + Input Tax, Cr Supplier). Idempotent by source id.
   */
  async postPurchase(schema: string, supplierOrderId: string): Promise<void> {
    await this.cm.executeInTransaction(schema, async (qr) => {
      const dup = await qr.query(
        `SELECT 1 FROM "${schema}".vouchers WHERE source_type='purchase' AND source_id=$1`,
        [supplierOrderId],
      );
      if (dup.length) return;
      const so = (
        await qr.query(
          `SELECT so.*, s.company AS supplier_name
           FROM "${schema}".supplier_orders so
           LEFT JOIN "${schema}".suppliers s ON s.id = so.supplier_id
           WHERE so.id = $1`,
          [supplierOrderId],
        )
      )[0];
      if (!so) return;

      const total = num(so.total);
      const totalTax = num(so.total_tax);
      // taxable = total − tax: exact regardless of Add/Less charges on the purchase.
      const taxable = round2(total - totalTax);
      if (total <= 0) return;

      const creditor = await this.ensurePartyLedger(qr, schema, 'supplier', so.supplier_id, so.supplier_name);
      const purchaseId = await this.namedLedgerId(qr, schema, 'Purchase');
      const inputTaxId = await this.namedLedgerId(qr, schema, 'Input Tax');
      if (!creditor || !purchaseId) return;

      const entries: Array<{ ledgerId: string; debit: number; credit: number }> = [
        { ledgerId: purchaseId, debit: taxable, credit: 0 },
      ];
      if (totalTax > 0 && inputTaxId) entries.push({ ledgerId: inputTaxId, debit: totalTax, credit: 0 });
      entries.push({ ledgerId: creditor, debit: 0, credit: total });

      // Absorb rounding into Round Off so the voucher balances exactly.
      const debitSum = round2(taxable + (totalTax > 0 && inputTaxId ? totalTax : 0));
      const diff = round2(total - debitSum);
      const roundId = await this.namedLedgerId(qr, schema, 'Round Off');
      if (Math.abs(diff) >= 0.01 && roundId) {
        if (diff > 0) entries.unshift({ ledgerId: roundId, debit: diff, credit: 0 });
        else entries.push({ ledgerId: roundId, debit: 0, credit: -diff });
      }

      const td = round2(entries.reduce((s, e) => s + e.debit, 0));
      const tc = round2(entries.reduce((s, e) => s + e.credit, 0));
      if (td !== tc) return; // refuse to post an unbalanced voucher

      const date = so.created_at ? new Date(so.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const billRef = so.supplier_invoice_no ? ` / Bill ${so.supplier_invoice_no}` : '';
      await this.insertVoucher(qr, schema, {
        type: 'purchase',
        date,
        narration: `Auto-posted: Purchase ${so.order_number}${billRef}`,
        partyLedgerId: creditor,
        reference: so.supplier_invoice_no || so.order_number,
        entries,
        sourceType: 'purchase',
        sourceId: supplierOrderId,
      });
    });
  }

  /** Auto-post a Payment voucher for a supplier payment (Dr Supplier, Cr Cash/Bank). Idempotent. */
  async postSupplierPayment(schema: string, paymentId: string): Promise<void> {
    await this.cm.executeInTransaction(schema, async (qr) => {
      const dup = await qr.query(`SELECT 1 FROM "${schema}".vouchers WHERE source_type='supplier_payment' AND source_id=$1`, [paymentId]);
      if (dup.length) return;
      const pay = (
        await qr.query(
          `SELECT p.*, so.supplier_id, so.order_number, s.company AS supplier_name
           FROM "${schema}".payments p
           JOIN "${schema}".supplier_orders so ON so.id = p.supplier_order_id
           LEFT JOIN "${schema}".suppliers s ON s.id = so.supplier_id
           WHERE p.id = $1`,
          [paymentId],
        )
      )[0];
      if (!pay) return;

      const amt = round2(num(pay.amount));
      if (amt <= 0) return;
      const isCash = String(pay.method || '').toLowerCase().includes('cash');
      const bankLedger = await this.namedLedgerId(qr, schema, isCash ? 'Cash' : 'Bank');
      const creditor = await this.ensurePartyLedger(qr, schema, 'supplier', pay.supplier_id, pay.supplier_name);
      if (!bankLedger || !creditor) return;

      await this.insertVoucher(qr, schema, {
        type: 'payment',
        date: new Date().toISOString().slice(0, 10),
        narration: `Auto-posted: Payment against ${pay.order_number}`,
        partyLedgerId: creditor,
        reference: String(pay.ref || pay.order_number).slice(0, 40),
        entries: [
          { ledgerId: creditor, debit: amt, credit: 0 },
          { ledgerId: bankLedger, debit: 0, credit: amt },
        ],
        sourceType: 'supplier_payment',
        sourceId: paymentId,
      });
    });
  }

  /** Auto-post a sales return (Dr Sales Returns + Output Tax, Cr Customer). Idempotent. */
  async postCreditNote(schema: string, creditNoteId: string): Promise<void> {
    await this.cm.executeInTransaction(schema, async (qr) => {
      const dup = await qr.query(`SELECT 1 FROM "${schema}".vouchers WHERE source_type='credit_note' AND source_id=$1`, [creditNoteId]);
      if (dup.length) return;
      const cn = (await qr.query(`SELECT * FROM "${schema}".credit_notes WHERE id=$1`, [creditNoteId]))[0];
      if (!cn) return;

      const total = round2(num(cn.total));
      const totalTax = round2(num(cn.total_tax));
      const taxable = round2(total - totalTax);
      if (total <= 0) return;

      const debtor = await this.ensurePartyLedger(qr, schema, 'customer', cn.customer_id, cn.customer_name);
      const salesReturnsId = await this.namedLedgerId(qr, schema, 'Sales Returns');
      const outputTaxId = await this.namedLedgerId(qr, schema, 'Output Tax');
      if (!debtor || !salesReturnsId) return;

      const entries: Array<{ ledgerId: string; debit: number; credit: number }> = [
        { ledgerId: salesReturnsId, debit: taxable, credit: 0 },
      ];
      if (totalTax > 0 && outputTaxId) entries.push({ ledgerId: outputTaxId, debit: totalTax, credit: 0 });
      entries.push({ ledgerId: debtor, debit: 0, credit: round2(taxable + (totalTax > 0 && outputTaxId ? totalTax : 0)) });

      await this.insertVoucher(qr, schema, {
        type: 'credit_note',
        date: cn.created_at ? new Date(cn.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        narration: `Auto-posted: Sales return ${cn.note_number}`,
        partyLedgerId: debtor,
        reference: cn.note_number,
        entries,
        sourceType: 'credit_note',
        sourceId: creditNoteId,
      });
    });
  }

  /** Auto-post a purchase return (Dr Supplier, Cr Purchase Returns + Input Tax). Idempotent. */
  async postDebitNote(schema: string, debitNoteId: string): Promise<void> {
    await this.cm.executeInTransaction(schema, async (qr) => {
      const dup = await qr.query(`SELECT 1 FROM "${schema}".vouchers WHERE source_type='debit_note' AND source_id=$1`, [debitNoteId]);
      if (dup.length) return;
      const dn = (
        await qr.query(
          `SELECT dn.*, s.company AS supplier_name FROM "${schema}".debit_notes dn
           LEFT JOIN "${schema}".suppliers s ON s.id = dn.supplier_id WHERE dn.id=$1`,
          [debitNoteId],
        )
      )[0];
      if (!dn) return;

      const total = round2(num(dn.total));
      const totalTax = round2(num(dn.total_tax));
      const taxable = round2(total - totalTax);
      if (total <= 0) return;

      const creditor = await this.ensurePartyLedger(qr, schema, 'supplier', dn.supplier_id, dn.supplier_name);
      const purchaseReturnsId = await this.namedLedgerId(qr, schema, 'Purchase Returns');
      const inputTaxId = await this.namedLedgerId(qr, schema, 'Input Tax');
      if (!creditor || !purchaseReturnsId) return;

      const creditTax = totalTax > 0 && inputTaxId ? totalTax : 0;
      const entries: Array<{ ledgerId: string; debit: number; credit: number }> = [
        { ledgerId: creditor, debit: round2(taxable + creditTax), credit: 0 },
        { ledgerId: purchaseReturnsId, debit: 0, credit: taxable },
      ];
      if (creditTax > 0 && inputTaxId) entries.push({ ledgerId: inputTaxId, debit: 0, credit: creditTax });

      await this.insertVoucher(qr, schema, {
        type: 'debit_note',
        date: dn.created_at ? new Date(dn.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        narration: `Auto-posted: Purchase return ${dn.note_number}`,
        partyLedgerId: creditor,
        reference: dn.note_number,
        entries,
        sourceType: 'debit_note',
        sourceId: debitNoteId,
      });
    });
  }

  /** Receivables + payables ageing (Tally: Bills Outstanding / Ageing Analysis). */
  async ageing(schema: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const receivables = await qr.query(
        `SELECT COALESCE(customer_name, '—') AS party,
                SUM(balance_due) AS total,
                SUM(balance_due) FILTER (WHERE issued_at >= NOW() - INTERVAL '30 days') AS d0_30,
                SUM(balance_due) FILTER (WHERE issued_at <  NOW() - INTERVAL '30 days' AND issued_at >= NOW() - INTERVAL '60 days') AS d31_60,
                SUM(balance_due) FILTER (WHERE issued_at <  NOW() - INTERVAL '60 days' AND issued_at >= NOW() - INTERVAL '90 days') AS d61_90,
                SUM(balance_due) FILTER (WHERE issued_at <  NOW() - INTERVAL '90 days') AS d90_plus,
                COUNT(*)::int AS bills
         FROM "${schema}".invoices
         WHERE balance_due > 0 AND COALESCE(status,'issued') <> 'cancelled'
         GROUP BY customer_name
         ORDER BY SUM(balance_due) DESC`,
      );
      const payables = await qr.query(
        `SELECT COALESCE(s.company, '—') AS party,
                SUM(so.total) AS total,
                SUM(so.total) FILTER (WHERE so.created_at >= NOW() - INTERVAL '30 days') AS d0_30,
                SUM(so.total) FILTER (WHERE so.created_at <  NOW() - INTERVAL '30 days' AND so.created_at >= NOW() - INTERVAL '60 days') AS d31_60,
                SUM(so.total) FILTER (WHERE so.created_at <  NOW() - INTERVAL '60 days' AND so.created_at >= NOW() - INTERVAL '90 days') AS d61_90,
                SUM(so.total) FILTER (WHERE so.created_at <  NOW() - INTERVAL '90 days') AS d90_plus,
                COUNT(*)::int AS bills
         FROM "${schema}".supplier_orders so
         LEFT JOIN "${schema}".suppliers s ON s.id = so.supplier_id
         WHERE so.removed = false AND so.status <> 'cancelled' AND so.payment_status <> 'paid'
         GROUP BY s.company
         ORDER BY SUM(so.total) DESC`,
      );
      const sum = (rows: any[], k: string) => round2(rows.reduce((s, r) => s + num(r[k]), 0));
      return {
        receivables,
        payables,
        totals: {
          receivable: sum(receivables, 'total'),
          payable: sum(payables, 'total'),
        },
      };
    });
  }

  listVouchers(schema: string, opts: { type?: string; from?: string; to?: string; limit?: number } = {}) {
    const conds: string[] = [`v.status = 'active'`];
    const params: unknown[] = [];
    let p = 1;
    if (opts.type) { conds.push(`v.voucher_type = $${p++}`); params.push(opts.type); }
    if (opts.from) { conds.push(`v.date >= $${p++}`); params.push(opts.from); }
    if (opts.to) { conds.push(`v.date <= $${p++}`); params.push(opts.to); }
    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT v.*, l.name AS party_name
         FROM "${schema}".vouchers v
         LEFT JOIN "${schema}".ledger_accounts l ON l.id = v.party_ledger_id
         WHERE ${conds.join(' AND ')}
         ORDER BY v.date DESC, v.created_at DESC
         LIMIT $${p}`,
        [...params, limit],
      ),
    );
  }

  async getVoucher(schema: string, id: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const v = (await qr.query(`SELECT * FROM "${schema}".vouchers WHERE id = $1`, [id]))[0];
      if (!v) throw new NotFoundException(`Voucher ${id} not found`);
      v.entries = await qr.query(
        `SELECT ve.*, l.name AS ledger_name
         FROM "${schema}".voucher_entries ve
         JOIN "${schema}".ledger_accounts l ON l.id = ve.ledger_id
         WHERE ve.voucher_id = $1 ORDER BY ve.created_at`,
        [id],
      );
      return v;
    });
  }

  // ─── Balances & reports ───────────────────────────────────────────────────
  private async balances(schema: string, asOf?: string): Promise<LedgerBalance[]> {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT la.id, la.name, g.nature, la.opening_balance, la.opening_type,
                COALESCE(SUM(ve.debit),0)  AS debit,
                COALESCE(SUM(ve.credit),0) AS credit
         FROM "${schema}".ledger_accounts la
         JOIN "${schema}".ledger_groups g ON g.id = la.group_id
         LEFT JOIN "${schema}".voucher_entries ve ON ve.ledger_id = la.id
         LEFT JOIN "${schema}".vouchers v ON v.id = ve.voucher_id AND v.status = 'active'
              ${asOf ? 'AND v.date <= $1' : ''}
         WHERE la.is_active = true
         GROUP BY la.id, la.name, g.nature, la.opening_balance, la.opening_type`,
        asOf ? [asOf] : [],
      ),
    );
    return rows.map((r: any) => {
      const opening = Number(r.opening_balance) * (r.opening_type === 'cr' ? -1 : 1);
      const balance = opening + Number(r.debit) - Number(r.credit);
      return { id: r.id, name: r.name, nature: r.nature, balance };
    });
  }

  async trialBalance(schema: string, asOf?: string) {
    const bals = await this.balances(schema, asOf);
    const rows = bals
      .filter((b) => Math.abs(b.balance) > 0.005)
      .map((b) => ({
        id: b.id,
        name: b.name,
        nature: b.nature,
        debit: b.balance > 0 ? round2(b.balance) : 0,
        credit: b.balance < 0 ? round2(-b.balance) : 0,
      }));
    const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
    return { asOf: asOf ?? null, rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  }

  async profitAndLoss(schema: string, from?: string, to?: string) {
    // P&L is period-based; opening balances don't apply to nominal accounts, so we sum
    // entries within the period rather than cumulative balances.
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT la.name, g.nature,
                COALESCE(SUM(ve.debit),0) AS debit, COALESCE(SUM(ve.credit),0) AS credit
         FROM "${schema}".ledger_accounts la
         JOIN "${schema}".ledger_groups g ON g.id = la.group_id
         LEFT JOIN "${schema}".voucher_entries ve ON ve.ledger_id = la.id
         LEFT JOIN "${schema}".vouchers v ON v.id = ve.voucher_id AND v.status='active'
              ${from ? 'AND v.date >= $1' : ''} ${to ? `AND v.date <= $${from ? 2 : 1}` : ''}
         WHERE g.nature IN ('income','expense')
         GROUP BY la.name, g.nature`,
        [from, to].filter(Boolean) as string[],
      ),
    );
    const income: Array<{ name: string; amount: number }> = [];
    const expense: Array<{ name: string; amount: number }> = [];
    for (const r of rows as any[]) {
      if (r.nature === 'income') {
        const amt = round2(Number(r.credit) - Number(r.debit));
        if (Math.abs(amt) > 0.005) income.push({ name: r.name, amount: amt });
      } else {
        const amt = round2(Number(r.debit) - Number(r.credit));
        if (Math.abs(amt) > 0.005) expense.push({ name: r.name, amount: amt });
      }
    }
    const totalIncome = round2(income.reduce((s, r) => s + r.amount, 0));
    const totalExpense = round2(expense.reduce((s, r) => s + r.amount, 0));
    return { from: from ?? null, to: to ?? null, income, expense, totalIncome, totalExpense, netProfit: round2(totalIncome - totalExpense) };
  }

  async balanceSheet(schema: string, asOf?: string) {
    const bals = await this.balances(schema, asOf);
    const assets: Array<{ name: string; amount: number }> = [];
    const liabilities: Array<{ name: string; amount: number }> = [];
    let income = 0;
    let expense = 0;
    for (const b of bals) {
      if (b.nature === 'asset' && Math.abs(b.balance) > 0.005) assets.push({ name: b.name, amount: round2(b.balance) });
      else if (b.nature === 'liability' && Math.abs(b.balance) > 0.005) liabilities.push({ name: b.name, amount: round2(-b.balance) });
      else if (b.nature === 'income') income += -b.balance;
      else if (b.nature === 'expense') expense += b.balance;
    }
    const netProfit = round2(income - expense);
    const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
    const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.amount, 0) + netProfit);
    return { asOf: asOf ?? null, assets, liabilities, netProfit, totalAssets, totalLiabilities, balanced: Math.abs(totalAssets - totalLiabilities) < 0.01 };
  }

  dayBook(schema: string, date?: string) {
    const d = date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const vouchers = await qr.query(
        `SELECT v.*, l.name AS party_name FROM "${schema}".vouchers v
         LEFT JOIN "${schema}".ledger_accounts l ON l.id = v.party_ledger_id
         WHERE v.date = $1 AND v.status='active' ORDER BY v.created_at`,
        [d],
      );
      return { date: d, vouchers };
    });
  }

  async ledgerStatement(schema: string, ledgerId: string, from?: string, to?: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const ledger = (await qr.query(`SELECT * FROM "${schema}".ledger_accounts WHERE id = $1`, [ledgerId]))[0];
      if (!ledger) throw new NotFoundException(`Ledger ${ledgerId} not found`);
      const conds = [`ve.ledger_id = $1`, `v.status='active'`];
      const params: unknown[] = [ledgerId];
      let p = 2;
      if (from) { conds.push(`v.date >= $${p++}`); params.push(from); }
      if (to) { conds.push(`v.date <= $${p++}`); params.push(to); }
      const entries = await qr.query(
        `SELECT v.id AS voucher_id, v.number, v.date, v.voucher_type, ve.debit, ve.credit, ve.narration
         FROM "${schema}".voucher_entries ve
         JOIN "${schema}".vouchers v ON v.id = ve.voucher_id
         WHERE ${conds.join(' AND ')}
         ORDER BY v.date, v.created_at`,
        params,
      );
      let running = Number(ledger.opening_balance) * (ledger.opening_type === 'cr' ? -1 : 1);
      const lines = entries.map((e: any) => {
        running += Number(e.debit) - Number(e.credit);
        return { ...e, balance: round2(running) };
      });
      return { ledger: { id: ledger.id, name: ledger.name }, opening: round2(Number(ledger.opening_balance)), lines, closing: round2(running) };
    });
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: unknown): number {
  return Number(v) || 0;
}
