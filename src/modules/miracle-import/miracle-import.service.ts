import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import AdmZip = require('adm-zip');
import { Tenant } from '../../database/entities/public/tenant.entity';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { TenantProvisioningService } from '../tenant/tenant-provisioning.service';
import { MiracleParser, MiracleVoucher } from './miracle-parser';

export interface ImportOptions {
  email: string;
  password: string;
  businessName?: string;
  importInvoices?: boolean;
  postAccounting?: boolean;
}

type Phase = 'queued' | 'extracting' | 'provisioning' | 'masters' | 'transactions' | 'done' | 'error';
export interface RunState {
  runId: string;
  status: 'running' | 'success' | 'error';
  phase: Phase;
  message: string;
  tenant?: { schema: string; created: boolean; email: string };
  counts: Record<string, number>;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

@Injectable()
export class MiracleImportService {
  private readonly logger = new Logger(MiracleImportService.name);
  private readonly runs = new Map<string, RunState>();

  constructor(
    private readonly connection: TenantConnectionManager,
    private readonly provisioning: TenantProvisioningService,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  getRun(runId: string): RunState | undefined {
    return this.runs.get(runId);
  }

  /** Kick off an import in the background; returns the run id immediately. */
  start(buffer: Buffer, sourceFile: string, opts: ImportOptions): string {
    const runId = randomUUID();
    const state: RunState = {
      runId,
      status: 'running',
      phase: 'queued',
      message: 'Queued',
      counts: {},
      startedAt: new Date().toISOString(),
    };
    this.runs.set(runId, state);
    void this.run(state, buffer, sourceFile, opts).catch((e) => {
      state.status = 'error';
      state.phase = 'error';
      state.error = e?.message || String(e);
      state.finishedAt = new Date().toISOString();
      this.logger.error(`Miracle import ${runId} failed: ${state.error}`, e?.stack);
    });
    return runId;
  }

  private set(state: RunState, phase: Phase, message: string) {
    state.phase = phase;
    state.message = message;
    this.logger.log(`[${state.runId}] ${phase}: ${message}`);
  }

  private async run(state: RunState, buffer: Buffer, sourceFile: string, opts: ImportOptions) {
    let workDir = '';
    try {
      this.set(state, 'extracting', 'Extracting Miracle export');
      workDir = mkdtempSync(join(tmpdir(), 'miracle-'));
      const zip = new AdmZip(buffer);
      zip.extractAllTo(workDir, true);
      const root = this.findCompanyRoot(workDir);
      if (!root) throw new Error('No Miracle company data found in the zip (missing RKACCM01.DBF / YR* folders)');
      const parser = new MiracleParser(root);
      const company = parser.company();

      this.set(state, 'provisioning', 'Resolving user / tenant');
      const businessName = opts.businessName?.trim() || company.name;
      const { schema, created } = await this.resolveTenant(opts, businessName, company);
      state.tenant = { schema, created, email: opts.email };

      await this.connection.executeInTenantContext(schema, async (qr) => {
        // Bypass the sync outbox during bulk load (the tenant re-syncs lazily).
        // Session-level SET on this dedicated connection; resets on release.
        await qr.query(`SET "sync.apply" = 'on'`);
        const map = await this.loadMap(qr, schema);

        this.set(state, 'masters', 'Importing parties, products, ledgers');
        await this.importMasters(qr, schema, parser, company, map, state);

        if (opts.importInvoices !== false) {
          this.set(state, 'transactions', 'Importing invoices, purchases, payments');
          await this.importTransactions(qr, schema, parser, company, map, state, opts.postAccounting !== false);
        }
      });

      state.status = 'success';
      this.set(state, 'done', 'Import complete');
      state.finishedAt = new Date().toISOString();
    } finally {
      if (workDir && existsSync(workDir)) {
        try {
          rmSync(workDir, { recursive: true, force: true });
        } catch {
          /* best-effort temp cleanup */
        }
      }
    }
  }

  /** Locate the folder that actually holds the Miracle tables. */
  private findCompanyRoot(dir: string): string | null {
    const has = (d: string) => existsSync(join(d, 'RKACCM01.DBF')) || readdirSync(d).some((f) => /^YR\d+$/i.test(f));
    if (has(dir)) return dir;
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      try {
        if (statSync(p).isDirectory() && has(p)) return p;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  // ─── Tenant resolution ────────────────────────────────────────────────────
  private async resolveTenant(opts: ImportOptions, businessName: string, company: { gstin: string; stateCode: string }) {
    // Find an existing tenant user by email (scan active tenant schemas).
    const actives = await this.tenants.find({ where: { status: 'active' }, select: ['id', 'schemaName'] });
    for (const t of actives) {
      const found = await this.connection
        .executeInTenantContext(t.schemaName, (qr) =>
          qr.query(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [opts.email]),
        )
        .catch(() => []);
      if (found[0]) return { schema: t.schemaName, created: false };
    }

    // Provision a fresh tenant + owner user.
    const slug = await this.uniqueSlug(businessName || opts.email.split('@')[0]);
    const tenant = await this.provisioning.provisionTenant({
      name: businessName,
      slug,
      plan: 'enterprise',
      ownerEmail: opts.email,
      ownerName: businessName,
      ownerPassword: opts.password,
      ownerEmailVerified: true,
      settings: { source: 'miracle-import', gstin: company.gstin, stateCode: company.stateCode },
    } as any);
    // Fill the tenant business profile.
    await this.tenants.update(tenant.id, {
      businessName,
      onboardingStatus: 'completed',
      businessCategory: 'Trading',
    });
    return { schema: tenant.schemaName, created: true };
  }

  private async uniqueSlug(base: string): Promise<string> {
    const root = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'company';
    for (let i = 0; i < 50; i++) {
      const slug = i === 0 ? root : `${root}-${i}`;
      const exists = await this.tenants.findOne({ where: { slug }, select: ['id'] });
      if (!exists) return slug;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  // ─── Idempotency map ──────────────────────────────────────────────────────
  private async loadMap(qr: any, schema: string): Promise<Map<string, string>> {
    const rows = await qr.query(`SELECT entity_type, miracle_code, local_id FROM "${schema}".miracle_import_map`);
    const m = new Map<string, string>();
    for (const r of rows) m.set(`${r.entity_type}:${r.miracle_code}`, r.local_id);
    return m;
  }
  private async putMap(qr: any, schema: string, type: string, code: string, id: string, map: Map<string, string>) {
    map.set(`${type}:${code}`, id);
    await qr.query(
      `INSERT INTO "${schema}".miracle_import_map (entity_type, miracle_code, local_id)
       VALUES ($1,$2,$3) ON CONFLICT (entity_type, miracle_code) DO UPDATE SET local_id = EXCLUDED.local_id`,
      [type, code, id],
    );
  }

  // ─── Masters ──────────────────────────────────────────────────────────────
  private async importMasters(
    qr: any,
    schema: string,
    parser: MiracleParser,
    company: { gstin: string; stateCode: string },
    map: Map<string, string>,
    state: RunState,
  ) {
    const c = (k: string, n = 1) => (state.counts[k] = (state.counts[k] || 0) + n);
    const usedPhones = new Set<string>();

    // Parties → customers / suppliers (+ their party ledgers).
    const parties = parser.parties();
    for (const p of parties) {
      const table = p.group === 'customer' ? 'customers' : 'suppliers';
      const nameCol = p.group === 'customer' ? 'name' : 'company';
      const type = p.group;
      const existing = map.get(`${type}:${p.code}`);
      const reg = p.gstin ? 'regular' : 'consumer';
      let phone: string | null = p.phone && /^\d{10}$/.test(p.phone) && !usedPhones.has(p.phone) ? p.phone : null;
      if (phone) usedPhones.add(phone);
      if (!phone) phone = p.group === 'customer' ? `NA-${p.code}` : null;
      const vals = [
        p.name.slice(0, 250),
        p.code, // alias holds the Miracle code for traceability
        p.code,
        reg,
        p.gstin || null,
        p.pan || null,
        p.state || null,
        p.stateCode || null,
        p.address || null,
        p.pincode || null,
        p.contactPerson || null,
        phone,
        p.openingBalance || null,
        p.openingDrCr,
        p.area || null,
      ];
      if (existing) {
        await qr.query(
          `UPDATE "${schema}".${table} SET ${nameCol}=$2, party_code=$4, gst_registration_type=$5, gstin=$6, pan=$7,
             state=$8, state_code=$9, billing_address=$10, pincode=$11, contact_person=$12,
             opening_balance=$14, opening_dr_cr=$15, area=$16, updated_at=NOW() WHERE id=$1`,
          [existing, ...vals],
        );
        c(`${type}_updated`);
      } else {
        const row = await qr.query(
          `INSERT INTO "${schema}".${table}
             (${nameCol}, alias, party_code, gst_registration_type, gstin, pan, state, state_code,
              billing_address, pincode, contact_person, phone, opening_balance, opening_dr_cr, area, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true) RETURNING id`,
          vals,
        );
        await this.putMap(qr, schema, type, p.code, row[0].id, map);
        c(type);
      }
      // Party ledger (Sundry Debtors/Creditors) with opening balance.
      await qr.query(
        `INSERT INTO "${schema}".ledger_accounts (name, group_id, opening_balance, opening_type, gstin, source_type, source_id)
         SELECT $1, g.id, $2, $3, $4, $5, $6 FROM "${schema}".ledger_groups g WHERE g.name = $7
         ON CONFLICT (name) DO UPDATE SET opening_balance = EXCLUDED.opening_balance, gstin = EXCLUDED.gstin`,
        [
          p.name.slice(0, 160),
          p.openingBalance || 0,
          p.openingDrCr.toLowerCase(),
          p.gstin || null,
          p.group,
          map.get(`${type}:${p.code}`),
          p.group === 'customer' ? 'Sundry Debtors' : 'Sundry Creditors',
        ],
      );
    }

    // Products (+ inventory opening stock).
    const items = parser.items();
    for (const it of items) {
      const existing = map.get(`product:${it.code}`);
      const slug = `${it.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)}-${it.code.toLowerCase()}`;
      const meta = JSON.stringify({ sku: it.code, miracleCode: it.code, category: it.category, brand: it.brand });
      if (existing) {
        await qr.query(
          `UPDATE "${schema}".products SET name=$2, hsn_code=$3, gst_rate=$4, uom=$5, base_price=$6, sale_price=$6,
             purchase_price=$7, opening_rate=$8, updated_at=NOW() WHERE id=$1`,
          [existing, it.name.slice(0, 250), it.hsn || null, it.gstRate || null, it.unit, it.saleRate || 0, it.purchaseRate || null, it.openingRate || null],
        );
        c('product_updated');
      } else {
        const row = await qr.query(
          `INSERT INTO "${schema}".products
             (name, slug, base_price, sale_price, currency, is_active, metadata, hsn_code, gst_rate, uom, purchase_price, opening_rate, item_type)
           VALUES ($1,$2,$3,$3,'INR',true,$4::jsonb,$5,$6,$7,$8,$9,'product') RETURNING id`,
          [it.name.slice(0, 250), slug, it.saleRate || 0, meta, it.hsn || null, it.gstRate || null, it.unit, it.purchaseRate || null, it.openingRate || null],
        );
        await qr.query(
          `INSERT INTO "${schema}".inventory (product_id, stock_quantity, low_stock_threshold) VALUES ($1,$2,5)`,
          [row[0].id, Math.round(it.openingStock || 0)],
        );
        await this.putMap(qr, schema, 'product', it.code, row[0].id, map);
        c('product');
      }
    }

    // Non-party ledgers (cash/bank/sales/expense/…) into the chart of accounts.
    for (const l of parser.ledgers()) {
      if (map.get(`ledger:${l.code}`)) continue;
      const group = groupForNature(l.groupName, l.nature);
      const row = await qr.query(
        `INSERT INTO "${schema}".ledger_accounts (name, group_id, opening_balance, opening_type, gstin, source_type)
         SELECT $1, g.id, $2, $3, $4, 'miracle' FROM "${schema}".ledger_groups g WHERE g.name = $5
         ON CONFLICT (name) DO UPDATE SET opening_balance = EXCLUDED.opening_balance
         RETURNING id`,
        [l.name.slice(0, 160), l.openingBalance || 0, l.openingDrCr, l.gstin || null, group],
      );
      if (row[0]) {
        await this.putMap(qr, schema, 'ledger', l.code, row[0].id, map);
        c('ledger');
      }
    }
  }

  // ─── Transactions ─────────────────────────────────────────────────────────
  private async importTransactions(
    qr: any,
    schema: string,
    parser: MiracleParser,
    company: { gstin: string; stateCode: string },
    map: Map<string, string>,
    state: RunState,
    postAccounting: boolean,
  ) {
    const c = (k: string, n = 1) => (state.counts[k] = (state.counts[k] || 0) + n);

    // Resolve the standard posting ledgers once.
    const led = await this.ledgerIds(qr, schema);
    // Party display names (for cash/other parties without a customer row).
    const names = new Map<string, string>();
    for (const p of parser.parties()) names.set(p.code, p.name);
    for (const l of parser.ledgers()) names.set(l.code, l.name);

    const years = parser.years();
    for (const y of years) {
      const vouchers = parser.vouchers(y, company.stateCode);
      for (const v of vouchers) {
        try {
          if (v.kind === 'sale' || v.kind === 'sales_return') {
            await this.importSale(qr, schema, v, y, map, names, led, company, postAccounting);
            c(v.kind === 'sale' ? 'invoices' : 'sales_returns');
          } else if (v.kind === 'purchase') {
            await this.importPurchase(qr, schema, v, y, map, names, led, postAccounting);
            c('purchases');
          } else if (v.kind === 'receipt' || v.kind === 'payment') {
            if (postAccounting) await this.importReceiptPayment(qr, schema, v, map, names, led);
            c(v.kind === 'receipt' ? 'receipts' : 'payments');
          }
        } catch (e: any) {
          c('txn_errors');
          if ((state.counts['txn_errors'] || 0) <= 5) this.logger.warn(`voucher ${v.miracleId} failed: ${e?.message}`);
        }
      }
      state.message = `Transactions: ${y} done (${state.counts['invoices'] || 0} invoices, ${state.counts['purchases'] || 0} purchases)`;
    }
  }

  private invoiceNumber(v: MiracleVoucher, year: string): string {
    const tag = v.kind === 'sales_return' ? 'SR' : v.isCash ? 'C' : 'S';
    const bill = (v.billNo || v.miracleId).replace(/\s+/g, '');
    return `${tag}/${year.replace(/^YR/i, '')}/${bill}`.slice(0, 40);
  }

  private async importSale(
    qr: any, schema: string, v: MiracleVoucher, year: string, map: Map<string, string>,
    names: Map<string, string>, led: Record<string, string>, company: { stateCode: string }, post: boolean,
  ) {
    const number = this.invoiceNumber(v, year);
    if (map.get(`invoice:${v.miracleId}`)) return; // already imported
    const customerId = v.isCash ? null : map.get(`customer:${v.partyCode}`) || null;
    const customerName = names.get(v.partyCode) || (v.isCash ? 'Cash Sale' : v.partyCode);
    const interstate = v.igst > 0;
    const items = v.lines.map((l) => ({
      productId: map.get(`product:${l.itemCode}`) || null,
      description: names.get(l.itemCode) || l.itemCode,
      quantity: l.qty,
      unitPrice: l.rate,
      lineTotal: l.amount,
      gstRate: l.gstRate || undefined,
      hsn: l.hsn || undefined,
    }));
    const row = await qr.query(
      `INSERT INTO "${schema}".invoices
         (invoice_number, doc_type, year, customer_id, customer_name, is_interstate, subtotal, discount,
          taxable_value, cgst, sgst, igst, total_tax, round_off, total, items, status, issued_at, is_cash,
          amount_paid, balance_due, payment_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,'issued',$16,$17,0,$14,'unpaid',$18)
       ON CONFLICT (invoice_number) DO NOTHING RETURNING id`,
      [
        number, v.kind === 'sales_return' ? 'credit_note' : 'tax_invoice', fyOf(year), customerId, customerName.slice(0, 250),
        interstate, v.taxable, v.taxable, v.cgst, v.sgst, v.igst, v.tax, v.roundOff, v.total,
        JSON.stringify(items), v.date || null, v.isCash,
        v.kind === 'sales_return' ? 'Sales Return (Miracle)' : null,
      ],
    );
    const id = row[0]?.id;
    if (!id) return;
    await this.putMap(qr, schema, 'invoice', v.miracleId, id, map);
    if (post && v.kind === 'sale') await this.postSaleVoucher(qr, schema, v, id, number, customerName, led);
  }

  private async importPurchase(
    qr: any, schema: string, v: MiracleVoucher, year: string, map: Map<string, string>,
    names: Map<string, string>, led: Record<string, string>, post: boolean,
  ) {
    if (map.get(`purchase:${v.miracleId}`)) return;
    const supplierId = map.get(`supplier:${v.partyCode}`) || null;
    const number = `P/${year.replace(/^YR/i, '')}/${(v.billNo || v.miracleId).replace(/\s+/g, '')}`.slice(0, 40);
    const interstate = v.igst > 0;
    const row = await qr.query(
      `INSERT INTO "${schema}".supplier_orders
         (order_number, year, supplier_id, subtotal, total_tax, discount, total, status, payment_status,
          cgst, sgst, igst, is_interstate, supplier_invoice_no, supplier_invoice_date, created_at)
       VALUES ($1,$2,$3,$4,$5,0,$6,'received','unpaid',$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (order_number) DO NOTHING RETURNING id`,
      [number, fyOf(year), supplierId, v.taxable, v.tax, v.total, v.cgst, v.sgst, v.igst, interstate,
        (v.billNo || '').slice(0, 40) || null, v.date || null, v.date || null],
    );
    const id = row[0]?.id;
    if (!id) return;
    await this.putMap(qr, schema, 'purchase', v.miracleId, id, map);
    let sort = 0;
    for (const l of v.lines) {
      await qr.query(
        `INSERT INTO "${schema}".supplier_order_items (supplier_order_id, product_id, description, quantity, unit_price, line_total, gst_rate, hsn, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, map.get(`product:${l.itemCode}`) || null, (names.get(l.itemCode) || l.itemCode).slice(0, 500), l.qty, l.rate, l.amount, l.gstRate || 0, l.hsn || null, sort++],
      );
    }
    if (post) await this.postPurchaseVoucher(qr, schema, v, id, number, names.get(v.partyCode) || v.partyCode, led);
  }

  // ─── Accounting voucher posting (balanced by construction) ────────────────
  private async ledgerIds(qr: any, schema: string): Promise<Record<string, string>> {
    const rows = await qr.query(`SELECT id, name FROM "${schema}".ledger_accounts`);
    const by: Record<string, string> = {};
    for (const r of rows) by[r.name.toLowerCase()] = r.id;
    return by;
  }
  private async ledgerByName(qr: any, schema: string, name: string, group: string, led: Record<string, string>): Promise<string> {
    const key = name.toLowerCase();
    if (led[key]) return led[key];
    const row = await qr.query(
      `INSERT INTO "${schema}".ledger_accounts (name, group_id, opening_balance, opening_type)
       SELECT $1, g.id, 0, 'dr' FROM "${schema}".ledger_groups g WHERE g.name = $2
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name.slice(0, 160), group],
    );
    led[key] = row[0].id;
    return led[key];
  }
  private async writeVoucher(
    qr: any, schema: string, type: string, number: string, date: string | null, party: string | null,
    amount: number, reference: string, sourceType: string, sourceId: string | null, entries: { ledgerId: string; debit: number; credit: number }[],
  ): Promise<string | null> {
    // source_id is a UUID column: only invoice/purchase-sourced vouchers carry
    // one. Those get an existence-check guard (the unique index is PARTIAL, so
    // ON CONFLICT can't target it); receipt/payment vouchers pass null and are
    // deduped by the caller via miracle_import_map.
    if (sourceId) {
      const dup = await qr.query(`SELECT 1 FROM "${schema}".vouchers WHERE source_type=$1 AND source_id=$2 LIMIT 1`, [sourceType, sourceId]);
      if (dup[0]) return null;
    }
    const v = await qr.query(
      `INSERT INTO "${schema}".vouchers (voucher_type, number, date, party_ledger_id, amount, reference, source_type, source_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id`,
      [type, number.slice(0, 40), date || new Date().toISOString().slice(0, 10), party, amount, reference.slice(0, 80), sourceType, sourceId],
    );
    const vid = v[0]?.id;
    if (!vid) return null;
    for (const e of entries) {
      if (!e.ledgerId || (e.debit === 0 && e.credit === 0)) continue;
      await qr.query(
        `INSERT INTO "${schema}".voucher_entries (voucher_id, ledger_id, debit, credit) VALUES ($1,$2,$3,$4)`,
        [vid, e.ledgerId, e.debit, e.credit],
      );
    }
    return vid;
  }
  private async postSaleVoucher(qr: any, schema: string, v: MiracleVoucher, invoiceId: string, number: string, customerName: string, led: Record<string, string>) {
    const debitLedger = v.isCash ? led['cash'] : await this.ledgerByName(qr, schema, customerName, 'Sundry Debtors', led);
    const entries = [
      { ledgerId: debitLedger, debit: v.total, credit: 0 },
      { ledgerId: led['sales'], debit: 0, credit: v.taxable },
    ];
    if (v.cgst) entries.push({ ledgerId: led['cgst payable'], debit: 0, credit: v.cgst });
    if (v.sgst) entries.push({ ledgerId: led['sgst payable'], debit: 0, credit: v.sgst });
    if (v.igst) entries.push({ ledgerId: led['igst payable'], debit: 0, credit: v.igst });
    if (v.roundOff) entries.push({ ledgerId: led['round off'], debit: v.roundOff < 0 ? -v.roundOff : 0, credit: v.roundOff > 0 ? v.roundOff : 0 });
    await this.writeVoucher(qr, schema, 'sales', number, v.date, v.isCash ? null : debitLedger, v.total, number, 'invoice', invoiceId, entries);
  }
  private async postPurchaseVoucher(qr: any, schema: string, v: MiracleVoucher, purchaseId: string, number: string, supplierName: string, led: Record<string, string>) {
    const creditLedger = await this.ledgerByName(qr, schema, supplierName, 'Sundry Creditors', led);
    const entries = [
      { ledgerId: led['purchase'], debit: v.taxable, credit: 0 },
      { ledgerId: creditLedger, debit: 0, credit: v.total },
    ];
    if (v.cgst || v.sgst || v.igst) entries.push({ ledgerId: led['input tax'], debit: v.cgst + v.sgst + v.igst, credit: 0 });
    if (v.roundOff) entries.push({ ledgerId: led['round off'], debit: v.roundOff > 0 ? v.roundOff : 0, credit: v.roundOff < 0 ? -v.roundOff : 0 });
    await this.writeVoucher(qr, schema, 'purchase', number, v.date, null, v.total, number, 'purchase', purchaseId, entries);
  }
  private async importReceiptPayment(qr: any, schema: string, v: MiracleVoucher, map: Map<string, string>, names: Map<string, string>, led: Record<string, string>) {
    if (map.get(`${v.kind}:${v.miracleId}`)) return; // already imported (dedup — source_id is null)
    const partyName = names.get(v.partyCode) || v.partyCode;
    const bankLedger = v.isCash ? led['cash'] : led['bank'];
    let vid: string | null = null;
    if (v.kind === 'receipt') {
      const party = await this.ledgerByName(qr, schema, partyName, 'Sundry Debtors', led);
      vid = await this.writeVoucher(qr, schema, 'receipt', `RCP/${v.billNo || v.miracleId}`, v.date, party, v.total, v.billNo || '', 'miracle_receipt', null, [
        { ledgerId: bankLedger, debit: v.total, credit: 0 },
        { ledgerId: party, debit: 0, credit: v.total },
      ]);
    } else {
      const party = await this.ledgerByName(qr, schema, partyName, 'Sundry Creditors', led);
      vid = await this.writeVoucher(qr, schema, 'payment', `PAY/${v.billNo || v.miracleId}`, v.date, party, v.total, v.billNo || '', 'miracle_payment', null, [
        { ledgerId: party, debit: v.total, credit: 0 },
        { ledgerId: bankLedger, debit: 0, credit: v.total },
      ]);
    }
    if (vid) await this.putMap(qr, schema, v.kind, v.miracleId, vid, map);
  }
}

/** Financial year (start year) for a Miracle YR folder. YR25 = FY2019-20 … YR32 = FY2026-27. */
function fyOf(yr: string): number {
  const n = parseInt(yr.replace(/^YR/i, ''), 10);
  return Number.isNaN(n) ? new Date().getFullYear() : 1994 + n; // YR25→2019
}

/** Map a Miracle group name/nature to one of our seeded ledger_groups. */
function groupForNature(groupName: string, nature: string): string {
  const n = groupName.toLowerCase();
  if (n.includes('sales')) return 'Sales Accounts';
  if (n.includes('purchase')) return 'Purchase Accounts';
  if (n.includes('bank')) return 'Bank Accounts';
  if (n.includes('cash')) return 'Cash-in-hand';
  if (n.includes('duties') || n.includes('tax')) return 'Duties & Taxes';
  if (n.includes('capital')) return 'Capital Account';
  if (n.includes('loan')) return 'Loans (Liability)';
  if (n.includes('fixed asset')) return 'Fixed Assets';
  switch (nature) {
    case 'income':
      return 'Indirect Incomes';
    case 'expense':
      return 'Indirect Expenses';
    case 'liability':
      return 'Current Liabilities';
    default:
      return 'Current Assets';
  }
}
