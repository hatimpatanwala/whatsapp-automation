import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { QueryRunner } from 'typeorm';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';

/** One exportable dataset → one tenant table, optionally filtered. */
interface ExportDataset {
  key: string;
  label: string;
  group: string;
  table: string;
  where?: string;
}

export interface DatasetSummary {
  key: string;
  label: string;
  group: string;
  count: number;
}

export interface DatasetGroup {
  group: string;
  datasets: DatasetSummary[];
}

/** Hard cap per sheet/file so a huge tenant can never blow up memory. */
const ROW_CAP = 50_000;

/**
 * Full ERP data export. Lets a tenant download ALL of their ERP data — company
 * profile, customers, sales, purchases, inventory, accounting — either as one
 * Excel workbook (a sheet per dataset) or as individual CSV files.
 *
 * Deliberately read-friendly: every dataset is `SELECT *` so the export is
 * complete (no column drifts to maintain), and every query is wrapped so a
 * table missing for a given tenant simply yields no sheet instead of failing
 * the whole export. Because GETs are allowed by ErpFeatureGuard for
 * downgraded-but-provisioned tenants, a tenant that dropped ERP can still pull
 * all of their preserved data out.
 */
@Injectable()
export class ErpExportService {
  private readonly logger = new Logger(ErpExportService.name);

  constructor(private readonly cm: TenantConnectionManager) {}

  /**
   * The exportable datasets, in the order they appear in the workbook and on the
   * export page. `where` clauses are intentionally conservative; if one ever
   * references a column a tenant doesn't have, the query falls back to an
   * unfiltered `SELECT *` (see `fetch`).
   */
  readonly datasets: ExportDataset[] = [
    // ── Company & setup ──────────────────────────────────────────────────────
    { key: 'business_profile', label: 'Business Profile & Settings', group: 'Company & Setup', table: 'settings' },
    { key: 'branches', label: 'Branches', group: 'Company & Setup', table: 'branches' },
    { key: 'employees', label: 'Employees', group: 'Company & Setup', table: 'employees' },
    { key: 'bank_accounts', label: 'Cash & Bank Accounts', group: 'Company & Setup', table: 'bank_accounts' },
    { key: 'payment_modes', label: 'Payment Modes', group: 'Company & Setup', table: 'payment_modes' },
    { key: 'tax_rates', label: 'Tax Rates', group: 'Company & Setup', table: 'erp_tax_rates' },
    { key: 'currencies', label: 'Currencies', group: 'Company & Setup', table: 'erp_currencies' },

    // ── Customers & CRM ──────────────────────────────────────────────────────
    { key: 'customers', label: 'Customers', group: 'Customers & CRM', table: 'customers' },
    { key: 'companies', label: 'Companies', group: 'Customers & CRM', table: 'companies' },
    { key: 'people', label: 'People', group: 'Customers & CRM', table: 'people' },
    { key: 'leads', label: 'Leads', group: 'Customers & CRM', table: 'leads' },

    // ── Sales ────────────────────────────────────────────────────────────────
    { key: 'invoices', label: 'Invoices', group: 'Sales', table: 'invoices' },
    { key: 'orders', label: 'Orders', group: 'Sales', table: 'orders' },
    { key: 'order_items', label: 'Order Items', group: 'Sales', table: 'order_items' },
    { key: 'payments', label: 'Payments Received', group: 'Sales', table: 'payments' },
    { key: 'quotes', label: 'Quotes', group: 'Sales', table: 'quotes' },
    { key: 'quote_items', label: 'Quote Items', group: 'Sales', table: 'quote_items' },
    { key: 'offers', label: 'Offers', group: 'Sales', table: 'offers' },
    { key: 'offer_items', label: 'Offer Items', group: 'Sales', table: 'offer_items' },
    { key: 'credit_notes', label: 'Credit Notes', group: 'Sales', table: 'credit_notes' },
    { key: 'recurring_invoices', label: 'Recurring Invoices', group: 'Sales', table: 'recurring_invoices' },
    { key: 'eway_bills', label: 'E-Way Bills', group: 'Sales', table: 'eway_bills' },

    // ── Purchases ────────────────────────────────────────────────────────────
    { key: 'suppliers', label: 'Suppliers', group: 'Purchases', table: 'suppliers' },
    { key: 'supplier_orders', label: 'Purchase Orders', group: 'Purchases', table: 'supplier_orders' },
    { key: 'supplier_order_items', label: 'Purchase Order Items', group: 'Purchases', table: 'supplier_order_items' },
    { key: 'expenses', label: 'Expenses', group: 'Purchases', table: 'expenses' },
    { key: 'expense_categories', label: 'Expense Categories', group: 'Purchases', table: 'expense_categories' },
    { key: 'debit_notes', label: 'Debit Notes', group: 'Purchases', table: 'debit_notes' },

    // ── Catalog & inventory ──────────────────────────────────────────────────
    { key: 'products', label: 'Products', group: 'Catalog & Inventory', table: 'products' },
    { key: 'product_variants', label: 'Product Variants', group: 'Catalog & Inventory', table: 'product_variants' },
    { key: 'product_batches', label: 'Batch & Serial Numbers', group: 'Catalog & Inventory', table: 'product_batches' },
    { key: 'categories', label: 'Categories', group: 'Catalog & Inventory', table: 'categories' },
    { key: 'brands', label: 'Brands', group: 'Catalog & Inventory', table: 'brands' },
    { key: 'inventory', label: 'Inventory', group: 'Catalog & Inventory', table: 'inventory' },
    { key: 'warehouses', label: 'Warehouses', group: 'Catalog & Inventory', table: 'erp_warehouses' },
    { key: 'erp_stock', label: 'Warehouse Stock', group: 'Catalog & Inventory', table: 'erp_stock' },
    { key: 'erp_stock_movements', label: 'Stock Movements', group: 'Catalog & Inventory', table: 'erp_stock_movements' },
  ];

  /** Record counts per dataset, grouped — drives the export page. */
  async datasetSummary(schema: string): Promise<DatasetGroup[]> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const summaries: DatasetSummary[] = [];
      for (const ds of this.datasets) {
        const count = await this.count(qr, schema, ds);
        if (count === null) continue; // table absent for this tenant
        summaries.push({ key: ds.key, label: ds.label, group: ds.group, count });
      }
      const groups: DatasetGroup[] = [];
      for (const s of summaries) {
        let g = groups.find((x) => x.group === s.group);
        if (!g) { g = { group: s.group, datasets: [] }; groups.push(g); }
        g.datasets.push(s);
      }
      return groups;
    });
  }

  /** Build a single .xlsx workbook with one sheet per non-empty dataset. */
  async buildWorkbook(schema: string): Promise<Buffer> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const wb = new Workbook();
      wb.creator = 'WA Commerce ERP';

      const index = wb.addWorksheet('Overview');
      index.columns = [
        { header: 'Dataset', key: 'label', width: 34 },
        { header: 'Group', key: 'group', width: 22 },
        { header: 'Records', key: 'count', width: 12 },
      ];
      index.getRow(1).font = { bold: true };

      const usedNames = new Set<string>(['Overview']);
      for (const ds of this.datasets) {
        const rows = await this.fetch(qr, schema, ds);
        index.addRow({ label: ds.label, group: ds.group, count: rows.length });
        if (!rows.length) continue;

        const sheet = wb.addWorksheet(this.sheetName(ds.label, usedNames));
        const keys = Object.keys(rows[0]);
        sheet.columns = keys.map((k) => ({ header: k, key: k, width: 18 }));
        sheet.getRow(1).font = { bold: true };
        for (const row of rows) {
          const obj: Record<string, unknown> = {};
          for (const k of keys) obj[k] = this.cell(row[k]);
          sheet.addRow(obj);
        }
      }

      const buf = await wb.xlsx.writeBuffer();
      return Buffer.from(buf);
    });
  }

  /** Build a single dataset as CSV. */
  async buildCsv(schema: string, key: string): Promise<{ filename: string; csv: string }> {
    const ds = this.datasets.find((d) => d.key === key);
    if (!ds) throw new NotFoundException('Unknown dataset');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await this.fetch(qr, schema, ds);
      return { filename: `${ds.key}.csv`, csv: this.toCsv(rows) };
    });
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** COUNT(*) for a dataset; null when the table doesn't exist for this tenant. */
  private async count(qr: QueryRunner, schema: string, ds: ExportDataset): Promise<number | null> {
    try {
      const r = await qr.query(
        `SELECT COUNT(*)::int AS n FROM "${schema}".${ds.table}${ds.where ? ` WHERE ${ds.where}` : ''}`,
      );
      return r[0]?.n ?? 0;
    } catch {
      // Retry without the WHERE in case the filter column is missing.
      try {
        const r = await qr.query(`SELECT COUNT(*)::int AS n FROM "${schema}".${ds.table}`);
        return r[0]?.n ?? 0;
      } catch {
        return null;
      }
    }
  }

  /** SELECT * for a dataset, capped; tolerant of a missing filter column / table. */
  private async fetch(qr: QueryRunner, schema: string, ds: ExportDataset): Promise<any[]> {
    try {
      return await qr.query(
        `SELECT * FROM "${schema}".${ds.table}${ds.where ? ` WHERE ${ds.where}` : ''} LIMIT ${ROW_CAP}`,
      );
    } catch {
      try {
        return await qr.query(`SELECT * FROM "${schema}".${ds.table} LIMIT ${ROW_CAP}`);
      } catch (e) {
        this.logger.warn(`export: skipped ${ds.table} (${(e as Error).message})`);
        return [];
      }
    }
  }

  /** Excel-safe, unique sheet name (≤31 chars, no []:*?/\). */
  private sheetName(label: string, used: Set<string>): string {
    let base = label.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let name = base;
    let i = 2;
    while (used.has(name)) {
      const suffix = ` ${i++}`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name);
    return name;
  }

  /** Normalise a DB value for a cell: objects/arrays → JSON, dates → ISO, null → ''. */
  private cell(v: unknown): string | number | boolean {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') return JSON.stringify(v);
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    return String(v);
  }

  private toCsv(rows: any[]): string {
    if (!rows.length) return '';
    const keys = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = String(this.cell(v));
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [keys.join(',')];
    for (const r of rows) lines.push(keys.map((k) => esc(r[k])).join(','));
    return lines.join('\r\n');
  }
}
