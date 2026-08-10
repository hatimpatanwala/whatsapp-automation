import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import AdmZip = require('adm-zip');
import * as ExcelJS from 'exceljs';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { backfillProductTaxonomy } from '../../database/taxonomy.util';
import { TenantProvisioningService } from '../tenant/tenant-provisioning.service';
import { MiracleParser, MiracleVoucher, MiracleCompany } from './miracle-parser';

export interface ImportOptions {
  email: string;
  password: string;
  businessName?: string;
  importInvoices?: boolean;
  postAccounting?: boolean;
  sellerGstin?: string;
  sellerAddress?: string;
}

export interface StockTakeReport {
  schema: string;
  rows: number;
  matched: number;
  unmatchedCount: number;
  unmatched: string[];
}

type Phase = 'queued' | 'extracting' | 'provisioning' | 'masters' | 'transactions' | 'done' | 'error';
export interface RunState {
  runId: string;
  status: 'running' | 'success' | 'error';
  phase: Phase;
  message: string;
  tenant?: { schema: string; created: boolean; email: string };
  counts: Record<string, number>;
  /** Post-load reconciliation report (the migration kit's validation gate). */
  validation?: {
    trialBalanceDr: number;
    trialBalanceCr: number;
    balanced: boolean;
    glVouchers: number;
    receivables: number;
    payables: number;
    stockValue: number;
    warnings: string[];
  };
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
        await this.writeSellerProfile(qr, schema, parser, company, opts);

        if (opts.importInvoices !== false) {
          this.set(state, 'transactions', 'Importing invoices, purchases, payments');
          await this.importTransactions(qr, schema, parser, company, map, state, opts.postAccounting !== false);
        }

        this.set(state, 'transactions', 'Validating & reconciling');
        state.validation = await this.validate(qr, schema);
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

  /** Find an existing tenant schema by owner email (does NOT create one). */
  private async findExistingTenant(email: string): Promise<string | null> {
    const actives = await this.tenants.find({ where: { status: 'active' }, select: ['schemaName'] });
    for (const t of actives) {
      const found = await this.connection
        .executeInTenantContext(t.schemaName, (qr) => qr.query(`SELECT 1 FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]))
        .catch(() => []);
      if (found[0]) return t.schemaName;
    }
    return null;
  }

  // ─── Seller profile (invoice_* settings, used on printed GST invoices) ─────
  private async writeSellerProfile(qr: any, schema: string, parser: MiracleParser, company: MiracleCompany, opts: ImportOptions) {
    const cityCounts = new Map<string, number>();
    for (const p of parser.parties()) if (p.city) cityCounts.set(p.city, (cityCounts.get(p.city) || 0) + 1);
    const city = company.city || [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const gstin = (opts.sellerGstin || company.gstin || '').toUpperCase().replace(/\s/g, '');
    const stateCode = gstin.length === 15 ? gstin.slice(0, 2) : company.stateCode;
    const name = opts.businessName || company.name || '';
    const kv: Record<string, string> = {
      business_name: name,
      invoice_legal_name: name,
      invoice_state: STATE_NAMES[stateCode] || '',
      invoice_state_code: stateCode || '',
      invoice_city: city,
    };
    if (gstin) kv['invoice_gstin'] = gstin;
    if (company.pan) kv['invoice_pan'] = company.pan;
    if (company.pincode) kv['invoice_pincode'] = company.pincode;
    if (company.phone) kv['invoice_phone'] = company.phone;
    const address = opts.sellerAddress || company.address;
    if (address) kv['invoice_address'] = address;
    for (const [k, v] of Object.entries(kv)) {
      if (!v) continue;
      await qr.query(
        `INSERT INTO "${schema}".settings (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [k, JSON.stringify(v)],
      );
    }
  }

  // ─── Stock-take: set on-hand quantities from an uploaded count sheet ───────
  async stockTake(buffer: Buffer, filename: string, email: string): Promise<StockTakeReport> {
    const schema = await this.findExistingTenant(email);
    if (!schema) throw new NotFoundException(`No tenant found for ${email}. Run the data migration first.`);
    const rows = await this.parseStockFile(buffer, filename);
    if (!rows.length) throw new BadRequestException('No stock rows found. Expected columns: item name + closing/quantity (optional item code).');
    return this.connection.executeInTenantContext(schema, async (qr) => {
      await qr.query(`SET "sync.apply" = 'on'`);
      const prods: any[] = await qr.query(`SELECT p.id, p.name, p.metadata->>'sku' AS sku FROM "${schema}".products p WHERE p.is_active = true`);
      const byName = new Map<string, string>();
      const bySku = new Map<string, string>();
      for (const p of prods) {
        byName.set(normName(p.name), p.id);
        if (p.sku) bySku.set(String(p.sku).toUpperCase(), p.id);
      }
      let matched = 0;
      const unmatched: string[] = [];
      for (const r of rows) {
        const pid = (r.code && bySku.get(r.code.toUpperCase())) || byName.get(normName(r.name));
        if (!pid) {
          unmatched.push(r.name || r.code);
          continue;
        }
        await qr.query(`UPDATE "${schema}".inventory SET stock_quantity = $2, updated_at = NOW() WHERE product_id = $1`, [pid, Math.max(0, Math.round(r.qty))]);
        matched++;
      }
      return { schema, rows: rows.length, matched, unmatchedCount: unmatched.length, unmatched: unmatched.slice(0, 50) };
    });
  }

  private async parseStockFile(buffer: Buffer, filename: string): Promise<{ name: string; code: string; qty: number }[]> {
    let grid: string[][] = [];
    if (/\.csv$/i.test(filename)) {
      grid = buffer
        .toString('utf8')
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
    } else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      const ws = wb.worksheets[0];
      if (!ws) return [];
      ws.eachRow((row) => {
        const vals = (row.values as any[]).slice(1).map((c) => cellText(c));
        grid.push(vals);
      });
    }
    return rowsFromGrid(grid);
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
        // Tight param list (phone/alias are left untouched on re-import to avoid
        // unique-phone clashes) — every parameter must be referenced or Postgres
        // can't infer its type.
        await qr.query(
          `UPDATE "${schema}".${table} SET ${nameCol}=$2, party_code=$3, gst_registration_type=$4, gstin=$5, pan=$6,
             state=$7, state_code=$8, billing_address=$9, pincode=$10, contact_person=$11,
             opening_balance=$12, opening_dr_cr=$13, area=$14, updated_at=NOW() WHERE id=$1`,
          [existing, p.name.slice(0, 250), p.code, reg, p.gstin || null, p.pan || null, p.state || null, p.stateCode || null,
            p.address || null, p.pincode || null, p.contactPerson || null, p.openingBalance || null, p.openingDrCr, p.area || null],
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
      // Party ledger (Sundry Debtors/Creditors) with opening balance. Capture its id
      // and map the Miracle account code → ledger so journal/contra legs (RKACCT01)
      // that reference this party post to the right ledger.
      const plRow = await qr.query(
        `INSERT INTO "${schema}".ledger_accounts (name, group_id, opening_balance, opening_type, gstin, source_type, source_id)
         SELECT $1, g.id, $2, $3, $4, $5, $6 FROM "${schema}".ledger_groups g WHERE g.name = $7
         ON CONFLICT (name) DO UPDATE SET opening_balance = EXCLUDED.opening_balance, gstin = EXCLUDED.gstin
         RETURNING id`,
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
      if (plRow[0]?.id) await this.putMap(qr, schema, 'ledger', p.code, plRow[0].id, map);
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

    // Taxonomy: turn the brand/group names kept in products.metadata into real
    // brands/categories rows + FKs — the SAME store the portal, shop and ERP
    // item master read. Without this the imported taxonomy is invisible there.
    await backfillProductTaxonomy(qr, schema);

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

    // Migrated customers are ERP clients (the dashboard/reports count these).
    await qr.query(`UPDATE "${schema}".customers SET is_erp_client = true WHERE is_erp_client IS NOT TRUE`);

    // GST tax rates from Miracle → erp_tax_rates (drives the billing GST picker
    // and the /tax-rates page). Idempotent by name.
    const haveTax = new Set<string>(
      (await qr.query(`SELECT lower(name) n FROM "${schema}".erp_tax_rates`)).map((r: any) => r.n),
    );
    for (const t of parser.taxRates()) {
      const name = t.name.replace(/\s+/g, ' ').trim();
      if (!name || haveTax.has(name.toLowerCase())) continue;
      await qr.query(
        `INSERT INTO "${schema}".erp_tax_rates (name, rate, is_default, enabled, removed) VALUES ($1,$2,$3,true,false)`,
        [name, t.rate, t.rate === 18],
      );
      haveTax.add(name.toLowerCase());
      c('tax_rate');
    }

    // ── Defensive masters (present only in exports that use these modules; this
    // export has none, so these are no-ops here but migrate automatically when a
    // future client's data contains them) ──────────────────────────────────────
    for (const sm of parser.salesmen()) {
      if (map.get(`salesman:${sm.code}`)) continue;
      const row = await qr.query(
        `INSERT INTO "${schema}".salesmen (name, phone, area, access_token, is_active)
         VALUES ($1, NULL, $2, encode(gen_random_bytes(24),'hex'), true) RETURNING id`,
        [sm.name.slice(0, 120), sm.area || null],
      ).catch(() => [] as any[]);
      if (row[0]?.id) { await this.putMap(qr, schema, 'salesman', sm.code, row[0].id, map); c('salesmen'); }
    }
    for (const gd of parser.godowns()) {
      if (map.get(`godown:${gd.code}`)) continue;
      const row = await qr.query(
        `INSERT INTO "${schema}".erp_warehouses (name, is_default, removed) VALUES ($1, false, false) RETURNING id`,
        [gd.name.slice(0, 120)],
      ).catch(() => [] as any[]);
      if (row[0]?.id) { await this.putMap(qr, schema, 'godown', gd.code, row[0].id, map); c('godowns'); }
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

    // Journal (N7) + Contra (BC) vouchers — the double-entry legs (RKACCT01) the
    // invoice/receipt path can't reconstruct. These complete the trial balance,
    // ledger statements, day book, P&L and balance sheet.
    if (postAccounting) {
      this.set(state, 'transactions', 'Importing journal & contra vouchers');
      await this.importJournals(qr, schema, parser, map, names, led, state);
    }

    // Reconcile on-hand stock from the full imported history:
    //   stock = Σ purchases − Σ sales + Σ sales-returns   (clamped at 0)
    // Miracle doesn't store current stock in the item master (it derives it from
    // vouchers), which is why most products showed 0 before this step.
    this.set(state, 'transactions', 'Reconciling stock levels');
    await qr.query(`
      UPDATE "${schema}".inventory inv
      SET stock_quantity = GREATEST(0, ROUND(sub.qty))::int, updated_at = NOW()
      FROM (
        SELECT pid AS product_id, SUM(delta) AS qty FROM (
          SELECT product_id AS pid, quantity AS delta
            FROM "${schema}".supplier_order_items WHERE product_id IS NOT NULL
          UNION ALL
          SELECT (it->>'productId')::uuid, -1 * (it->>'quantity')::numeric
            FROM "${schema}".invoices i, jsonb_array_elements(i.items) it
            WHERE i.doc_type = 'tax_invoice' AND (it->>'productId') ~ '^[0-9a-fA-F-]{36}$'
          UNION ALL
          SELECT (it->>'productId')::uuid, (it->>'quantity')::numeric
            FROM "${schema}".invoices i, jsonb_array_elements(i.items) it
            WHERE i.doc_type = 'credit_note' AND (it->>'productId') ~ '^[0-9a-fA-F-]{36}$'
        ) m GROUP BY pid
      ) sub
      WHERE inv.product_id = sub.product_id
    `);
    state.counts['stock_reconciled'] = 1;

    // Miracle's OWN closing stock (RKACPMB2) is authoritative — override the
    // voucher-derived figure with it wherever available. The voucher derivation
    // undercounts because item codes are year-scoped (they don't bridge financial
    // years), so early-year purchases don't map to the current product and stock
    // wrongly clamps to 0. Miracle's stock-summary table has the real closing qty.
    const closing = parser.closingStock();
    let fromMiracle = 0;
    for (const [code, qty] of closing) {
      const pid = map.get(`product:${code}`);
      if (!pid) continue;
      await qr.query(
        `UPDATE "${schema}".inventory SET stock_quantity = GREATEST(0, ROUND($2))::int, updated_at = NOW()
         WHERE product_id = $1`,
        [pid, qty],
      );
      fromMiracle++;
    }
    state.counts['stock_from_miracle'] = fromMiracle;

    // Real purchase cost: the item master's rate (M29F03) is often a stale opening
    // figure — the LAST ACTUAL PURCHASE price from the migrated purchase vouchers is
    // the true cost basis, and margins/profit flow from it everywhere.
    const costed = await qr.query(`
      UPDATE "${schema}".products p
      SET purchase_price = sub.last_price, updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (soi.product_id) soi.product_id, soi.unit_price AS last_price
        FROM "${schema}".supplier_order_items soi
        JOIN "${schema}".supplier_orders so ON so.id = soi.supplier_order_id AND so.removed = false
        WHERE soi.product_id IS NOT NULL AND soi.unit_price > 0 AND soi.quantity > 0
        ORDER BY soi.product_id, so.created_at DESC
      ) sub
      WHERE p.id = sub.product_id
      RETURNING p.id
    `);
    state.counts['purchase_price_from_history'] = costed.length;

    // Reconcile invoice payment status:
    //   cash memos (QS) settle immediately → paid
    //   credit sales (SS) settle FIFO from the customer's receipts (BR/CR),
    //     oldest invoice first → paid / partial / unpaid
    this.set(state, 'transactions', 'Reconciling payments');
    await qr.query(`
      UPDATE "${schema}".invoices
      SET amount_paid = total, balance_due = 0, payment_status = 'paid', updated_at = NOW()
      WHERE is_cash = true AND doc_type = 'tax_invoice'
    `);
    await qr.query(`
      WITH cr AS (
        SELECT la.source_id AS cust, SUM(v.amount) AS paid
        FROM "${schema}".vouchers v
        JOIN "${schema}".ledger_accounts la ON la.id = v.party_ledger_id
        WHERE v.voucher_type = 'receipt' AND la.source_type = 'customer' AND la.source_id IS NOT NULL
        GROUP BY la.source_id
      ),
      ranked AS (
        SELECT i.id, i.customer_id, i.total::numeric AS tot,
          COALESCE(SUM(i.total::numeric) OVER (
            PARTITION BY i.customer_id ORDER BY i.issued_at, i.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior
        FROM "${schema}".invoices i
        WHERE i.is_cash = false AND i.doc_type = 'tax_invoice' AND i.customer_id IS NOT NULL
      ),
      applied AS (
        SELECT r.id, r.tot, LEAST(r.tot, GREATEST(0, COALESCE(cr.paid, 0) - r.prior)) AS pay
        FROM ranked r LEFT JOIN cr ON cr.cust = r.customer_id
      )
      UPDATE "${schema}".invoices i SET
        amount_paid = a.pay,
        balance_due = a.tot - a.pay,
        payment_status = CASE WHEN a.pay >= a.tot THEN 'paid' WHEN a.pay > 0 THEN 'partial' ELSE 'unpaid' END,
        updated_at = NOW()
      FROM applied a WHERE i.id = a.id
    `);
    state.counts['payments_reconciled'] = 1;

    // Roll invoice totals up onto each customer (drives dashboard top-clients +
    // the customer list's lifetime value).
    await qr.query(`
      UPDATE "${schema}".customers c
      SET total_spent = COALESCE(s.amt, 0), total_orders = COALESCE(s.cnt, 0)
      FROM (
        SELECT customer_id, SUM(total)::numeric AS amt, COUNT(*)::int AS cnt
        FROM "${schema}".invoices WHERE customer_id IS NOT NULL AND doc_type = 'tax_invoice'
        GROUP BY customer_id
      ) s WHERE c.id = s.customer_id
    `);
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
    if (map.get(`invoice:${v.miracleId}`)) return; // already imported
    const number = this.invoiceNumber(v, year);
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
    const insert = (num: string) =>
      qr.query(
        `INSERT INTO "${schema}".invoices
           (invoice_number, doc_type, year, customer_id, customer_name, is_interstate, subtotal, discount,
            taxable_value, cgst, sgst, igst, total_tax, round_off, total, items, status, issued_at, is_cash,
            amount_paid, balance_due, payment_status, notes, base_total, exchange_rate, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,'issued',$16,$17,0,$14,'unpaid',$18,$14,1,'INR')
         ON CONFLICT (invoice_number) DO NOTHING RETURNING id`,
        [
          num, v.kind === 'sales_return' ? 'credit_note' : 'tax_invoice', fyOf(year), customerId, customerName.slice(0, 250),
          interstate, v.taxable, v.taxable, v.cgst, v.sgst, v.igst, v.tax, v.roundOff, v.total,
          JSON.stringify(items), v.date || null, v.isCash,
          v.kind === 'sales_return' ? 'Sales Return (Miracle)' : null,
        ],
      );
    // Miracle re-uses bill numbers across cash/counter sales, so on a clash keep
    // the clean number for the first and suffix the rest with the unique vid tail.
    let usedNumber = number;
    let row = await insert(usedNumber);
    if (!row[0]) {
      usedNumber = `${number}-${v.miracleId.slice(-6)}`.slice(0, 40);
      row = await insert(usedNumber);
    }
    const id = row[0]?.id;
    if (!id) return;
    await this.putMap(qr, schema, 'invoice', v.miracleId, id, map);
    if (post && v.kind === 'sale') await this.postSaleVoucher(qr, schema, v, id, usedNumber, customerName, led);
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
  /**
   * Post-load validation gate: does the migrated GL tie out (ΣDr = ΣCr), and what
   * are the control totals (receivables, payables, stock value)? Surfaced on the run
   * so a migration can be signed off before the client transacts on it.
   */
  private async validate(qr: any, schema: string): Promise<RunState['validation']> {
    const warnings: string[] = [];
    const [tb] = await qr.query(
      `SELECT COALESCE(SUM(debit),0)::float AS dr, COALESCE(SUM(credit),0)::float AS cr,
              COUNT(DISTINCT voucher_id)::int AS vouchers FROM "${schema}".voucher_entries`,
    );
    const dr = Math.round((tb?.dr || 0) * 100) / 100;
    const cr = Math.round((tb?.cr || 0) * 100) / 100;
    const balanced = Math.abs(dr - cr) < 5;
    if (!balanced) warnings.push(`Trial balance is off by ₹${Math.round(Math.abs(dr - cr))} (Dr ${Math.round(dr)} vs Cr ${Math.round(cr)}).`);
    const [ar] = await qr.query(`SELECT COALESCE(SUM(balance_due),0)::float AS v FROM "${schema}".invoices WHERE balance_due > 0`);
    const [ap] = await qr.query(`SELECT COALESCE(SUM(total - COALESCE(amount_paid,0)),0)::float AS v FROM "${schema}".supplier_orders`).catch(() => [{ v: 0 }]);
    const [stk] = await qr.query(
      `SELECT COALESCE(SUM(GREATEST(inv.stock_quantity,0) * COALESCE(p.purchase_price, p.base_price, 0)),0)::float AS v
       FROM "${schema}".inventory inv JOIN "${schema}".products p ON p.id = inv.product_id`,
    );
    return {
      trialBalanceDr: dr, trialBalanceCr: cr, balanced,
      glVouchers: tb?.vouchers || 0,
      receivables: Math.round((ar?.v || 0) * 100) / 100,
      payables: Math.round((ap?.v || 0) * 100) / 100,
      stockValue: Math.round((stk?.v || 0) * 100) / 100,
      warnings,
    };
  }

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
  /**
   * Post Miracle journal (N7) & contra (BC) vouchers from their double-entry legs.
   * Each leg's account code resolves to a ledger via the import map (party ledgers +
   * non-party ledgers were both mapped under 'ledger:<code>'); unknown codes land in
   * Suspense so the voucher still balances. Idempotent via miracle_import_map.
   */
  private async importJournals(
    qr: any, schema: string, parser: MiracleParser, map: Map<string, string>,
    names: Map<string, string>, led: Record<string, string>, state: RunState,
  ) {
    const c = (k: string, n = 1) => (state.counts[k] = (state.counts[k] || 0) + n);
    const resolveLedger = async (code: string): Promise<string> => {
      const mapped = map.get(`ledger:${code}`);
      if (mapped) return mapped;
      return this.ledgerByName(qr, schema, names.get(code) || code, 'Suspense Account', led);
    };
    for (const y of parser.years()) {
      for (const j of parser.journals(y)) {
        if (map.get(`journal:${j.miracleId}`)) continue;
        try {
          const entries: { ledgerId: string; debit: number; credit: number }[] = [];
          for (const leg of j.legs) {
            const ledgerId = await resolveLedger(leg.accountCode);
            entries.push({ ledgerId, debit: leg.drCr === 'dr' ? leg.amount : 0, credit: leg.drCr === 'cr' ? leg.amount : 0 });
          }
          const amount = entries.reduce((s2, e) => s2 + e.debit, 0);
          const prefix = j.kind === 'contra' ? 'CON' : 'JV';
          // Contra merged into Journal — store as voucher_type 'journal'; provenance is
          // kept in source_type (miracle_contra) and the CON/ number prefix.
          const vid = await this.writeVoucher(
            qr, schema, 'journal', `${prefix}/${j.narration || j.miracleId}`, j.date, null, amount,
            j.narration || '', j.kind === 'contra' ? 'miracle_contra' : 'miracle_journal', null, entries,
          );
          if (vid) { await this.putMap(qr, schema, 'journal', j.miracleId, vid, map); c(j.kind === 'contra' ? 'contras' : 'journals'); }
        } catch (e: any) {
          c('journal_errors');
          if ((state.counts['journal_errors'] || 0) <= 5) this.logger.warn(`journal ${j.miracleId} failed: ${e?.message}`);
        }
      }
    }
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

/** GST state code → state name (for the seller profile). */
const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

/** Normalise an item name for tolerant matching (case/space/punctuation-insensitive). */
function normName(s: string): string {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** Extract plain text from an ExcelJS cell value (handles rich text / formula / hyperlink). */
function cellText(c: any): string {
  if (c == null) return '';
  if (typeof c === 'object') {
    if (c.text) return String(c.text);
    if (c.result != null) return String(c.result);
    if (c.richText) return c.richText.map((t: any) => t.text).join('');
    if (c.hyperlink && c.text) return String(c.text);
  }
  return String(c);
}

/** Turn a raw sheet grid into {name, code, qty} rows by detecting the header. */
function rowsFromGrid(grid: string[][]): { name: string; code: string; qty: number }[] {
  const out: { name: string; code: string; qty: number }[] = [];
  let header = -1, nameC = -1, qtyC = -1, codeC = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const cells = (grid[i] || []).map((c) => String(c || '').toLowerCase());
    const n = cells.findIndex((c) => /(item|product|particular|name|description)/.test(c));
    const q = cells.findIndex((c) => /(clos|stock|qty|quantity|balance|on.?hand)/.test(c));
    if (n >= 0 && q >= 0) {
      header = i; nameC = n; qtyC = q;
      codeC = cells.findIndex((c) => /(code|sku|item.?no|alias)/.test(c));
      break;
    }
  }
  const toQty = (v: string) => Number(String(v || '').replace(/[^0-9.\-]/g, ''));
  if (header < 0) {
    // No header detected: assume column 0 = name and the last numeric column = qty.
    for (const g of grid) {
      const name = String(g[0] || '').trim();
      let qty = NaN;
      for (let j = g.length - 1; j >= 1; j--) { const n = toQty(g[j]); if (!Number.isNaN(n) && g[j] !== '') { qty = n; break; } }
      if (name && !Number.isNaN(qty)) out.push({ name, code: '', qty });
    }
    return out;
  }
  for (let i = header + 1; i < grid.length; i++) {
    const g = grid[i] || [];
    const name = String(g[nameC] || '').trim();
    const qty = toQty(g[qtyC]);
    if (!name || Number.isNaN(qty)) continue;
    out.push({ name, code: codeC >= 0 ? String(g[codeC] || '').trim() : '', qty });
  }
  return out;
}
