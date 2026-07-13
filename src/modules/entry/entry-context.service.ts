import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

function num(v: unknown): number {
  return Number(v) || 0;
}

/**
 * Billing intelligence for the keyboard-first entry screens (Tally/Miracle-style).
 * Powers the typeahead cells and the live context panels:
 *   - party selected  → outstanding, open bills, recent invoices, top items w/ last rate
 *   - item selected   → current stock, last rate charged TO THIS PARTY (+when), std rate
 *
 * Read-only; every query is tenant-schema scoped. Fast single-row lookups only —
 * these fire on every keystroke/selection in the grid.
 */
@Injectable()
export class EntryContextService {
  constructor(private readonly cm: TenantConnectionManager) {}

  /** Typeahead: customers by name/display name/phone/company/GSTIN (Miracle party search). */
  searchCustomers(schema: string, q: string, limit = 10) {
    const like = `%${q}%`;
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, COALESCE(display_name, name) AS name, phone, gstin, company, total_orders, total_spent
         FROM "${schema}".customers
         WHERE deleted_at IS NULL
           AND (name ILIKE $1 OR display_name ILIKE $1 OR phone ILIKE $1 OR company ILIKE $1 OR gstin ILIKE $1)
         ORDER BY last_order_at DESC NULLS LAST
         LIMIT $2`,
        [like, Math.min(25, limit)],
      ),
    );
  }

  /** Typeahead: products by name, with stock + billing fields in one shot. */
  searchProducts(schema: string, q: string, limit = 10) {
    const like = `%${q}%`;
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.id, p.name, p.uom, p.alt_uom, p.uom_factor, p.hsn_code,
                COALESCE(p.gst_rate, 0) AS gst_rate,
                p.sale_price, p.base_price, p.purchase_price, p.mrp,
                p.tracking_mode, p.price_includes_tax, p.sale_discount_pct, p.item_type,
                COALESCE(inv.available, 0) + COALESCE(ws.qty, 0) AS stock
         FROM "${schema}".products p
         LEFT JOIN LATERAL (
           SELECT SUM(stock_quantity - reserved_quantity) AS available
           FROM "${schema}".inventory i WHERE i.product_id = p.id
         ) inv ON true
         LEFT JOIN LATERAL (
           SELECT SUM(quantity) AS qty
           FROM "${schema}".erp_stock s WHERE s.product_id = p.id
         ) ws ON true
         WHERE p.is_active = true AND p.deleted_at IS NULL
           AND (p.name ILIKE $1 OR p.metadata->>'barcode' ILIKE $1)
         ORDER BY p.name
         LIMIT $2`,
        [like, Math.min(25, limit)],
      ),
    );
  }

  /**
   * Catalog grouped by category — powers the "category discount" dialog: pick a
   * category, set a discount, and every product of that category can be billed at
   * once. Returns each product with the fields needed to build an invoice line.
   */
  categoryProducts(schema: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      // Group by the real category if linked; else fall back to the category/group
      // name the importer preserved in metadata (e.g. Miracle groups) so the feature
      // works even before products are formally categorised. Else "Uncategorised".
      const rows = await qr.query(
        `SELECT COALESCE(c.id::text, 'meta:' || lower(NULLIF(trim(p.metadata->>'category'), '')), 'uncategorised') AS category_id,
                COALESCE(c.name, NULLIF(trim(p.metadata->>'category'), ''), 'Uncategorised') AS category_name,
                p.id, p.name, p.hsn_code, p.uom, COALESCE(p.gst_rate, 0) AS gst_rate,
                COALESCE(p.sale_price, p.base_price) AS sale_price, p.base_price,
                p.price_includes_tax, COALESCE(p.sale_discount_pct, 0) AS sale_discount_pct
         FROM "${schema}".products p
         LEFT JOIN "${schema}".categories c ON c.id = p.category_id
         WHERE p.is_active = true AND p.deleted_at IS NULL
           AND COALESCE(p.item_type, 'product') <> 'service'
         ORDER BY category_name, p.name`,
      );
      const map = new Map<string, any>();
      for (const r of rows) {
        if (!map.has(r.category_id)) map.set(r.category_id, { id: r.category_id, name: r.category_name, products: [] });
        map.get(r.category_id).products.push({
          id: r.id, name: r.name, hsnCode: r.hsn_code, uom: r.uom,
          gstRate: num(r.gst_rate), salePrice: num(r.sale_price), basePrice: num(r.base_price),
          priceIncludesTax: !!r.price_includes_tax, saleDiscountPct: num(r.sale_discount_pct),
        });
      }
      return Array.from(map.values());
    });
  }

  /** Party panel: who is this customer and where do we stand with them. */
  async customerContext(schema: string, customerId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const customer = (
        await qr.query(
          `SELECT c.id, COALESCE(c.display_name, c.name) AS name, c.phone, c.email,
                  c.gstin, c.company, c.state, c.state_code, c.place_of_supply,
                  c.billing_address, c.pincode, c.default_discount_pct, c.gst_registration_type,
                  c.total_orders, c.total_spent, c.last_order_at,
                  c.price_level_id, pl.name AS price_level_name,
                  c.credit_limit, c.credit_days
           FROM "${schema}".customers c
           LEFT JOIN "${schema}".price_levels pl ON pl.id = c.price_level_id
           WHERE c.id = $1`,
          [customerId],
        )
      )[0];
      if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

      const [ar] = await qr.query(
        `SELECT COALESCE(SUM(balance_due), 0) AS outstanding,
                COUNT(*) FILTER (WHERE payment_status IN ('unpaid','partial')) AS open_invoices,
                COALESCE(SUM(balance_due) FILTER (
                  WHERE $2::int IS NOT NULL AND issued_at < NOW() - ($2::int || ' days')::interval
                ), 0) AS overdue
         FROM "${schema}".invoices WHERE customer_id = $1`,
        [customerId, customer.credit_days ?? null],
      );

      const recentInvoices = await qr.query(
        `SELECT invoice_number, total, balance_due, payment_status, issued_at
         FROM "${schema}".invoices WHERE customer_id = $1
         ORDER BY issued_at DESC NULLS LAST LIMIT 5`,
        [customerId],
      );

      // Miracle-style: what does this party usually buy, and at what rate last time.
      const topItems = await qr.query(
        `SELECT oi.product_id, oi.product_name,
                (ARRAY_AGG(oi.unit_price ORDER BY o.created_at DESC))[1] AS last_price,
                MAX(o.created_at) AS last_date,
                SUM(oi.quantity)::int AS total_qty
         FROM "${schema}".order_items oi
         JOIN "${schema}".orders o ON o.id = oi.order_id
         WHERE o.customer_id = $1 AND oi.product_id IS NOT NULL
         GROUP BY oi.product_id, oi.product_name
         ORDER BY MAX(o.created_at) DESC
         LIMIT 5`,
        [customerId],
      );

      return {
        ...customer,
        outstanding: num(ar?.outstanding),
        openInvoices: Number(ar?.open_invoices) || 0,
        overdue: num(ar?.overdue),
        recentInvoices,
        topItems,
      };
    });
  }

  /**
   * Item panel for a grid row: stock in hand + the Miracle "rate memory" —
   * last price charged to THIS customer (orders and ERP invoices, latest wins),
   * plus the last price overall as fallback context.
   */
  async itemContext(schema: string, productId: string, customerId?: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const product = (
        await qr.query(
          `SELECT p.id, p.name, p.uom, p.alt_uom, p.uom_factor, p.hsn_code,
                  COALESCE(p.gst_rate, 0) AS gst_rate,
                  p.sale_price, p.base_price, p.purchase_price, p.mrp,
                  p.tracking_mode, p.price_includes_tax, p.sale_discount_pct,
                  p.wholesale_price, p.wholesale_min_qty, p.min_sale_price, p.max_sale_price,
                  p.item_type, p.cess_pct, p.uqc,
                  COALESCE(ivm.low_stock_threshold, 5) AS min_stock,
                  COALESCE(inv.available, 0) + COALESCE(ws.qty, 0) AS stock
           FROM "${schema}".products p
           LEFT JOIN "${schema}".inventory ivm ON ivm.product_id = p.id AND ivm.variant_id IS NULL
           LEFT JOIN LATERAL (
             SELECT SUM(stock_quantity - reserved_quantity) AS available
             FROM "${schema}".inventory i WHERE i.product_id = p.id
           ) inv ON true
           LEFT JOIN LATERAL (
             SELECT SUM(quantity) AS qty FROM "${schema}".erp_stock s WHERE s.product_id = p.id
           ) ws ON true
           WHERE p.id = $1`,
          [productId],
        )
      )[0];
      if (!product) throw new NotFoundException(`Product ${productId} not found`);

      const lastToCustomer = customerId ? await this.lastSale(qr, schema, productId, customerId) : null;
      const lastOverall = await this.lastSale(qr, schema, productId);

      // Batch-tracked items: live lots FIFO-ordered (oldest/soonest-expiry first) so
      // the billing grid can suggest the old-MRP batch before the new one (§3F.1).
      let batches: any[] = [];
      if (product.tracking_mode === 'batch') {
        batches = await qr.query(
          `SELECT batch_no, expiry_date, mrp, selling_price, qty
           FROM "${schema}".item_batches
           WHERE product_id = $1 AND qty > 0
           ORDER BY expiry_date ASC NULLS LAST, created_at ASC
           LIMIT 8`,
          [productId],
        );
      }

      // Price-level rate: if the customer is on a price list that defines this product,
      // that rate wins as the billing default (Tally price levels / Miracle rate A/B/C).
      let levelPrice: { price: number; levelName: string } | null = null;
      if (customerId) {
        const [lp] = await qr.query(
          `SELECT pli.rate, pl.name AS level_name
           FROM "${schema}".customers c
           JOIN "${schema}".price_levels pl ON pl.id = c.price_level_id
           JOIN "${schema}".price_list_items pli ON pli.price_level_id = pl.id AND pli.product_id = $2
           WHERE c.id = $1`,
          [customerId, productId],
        );
        if (lp) levelPrice = { price: num(lp.rate), levelName: lp.level_name };
      }

      return { ...product, lastToCustomer, lastOverall, levelPrice, batches };
    });
  }

  /** Typeahead: suppliers by company/phone/GSTIN. */
  searchSuppliers(schema: string, q: string, limit = 10) {
    const like = `%${q}%`;
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, company AS name, contact_name, phone, gstin
         FROM "${schema}".suppliers
         WHERE removed = false AND enabled = true
           AND (company ILIKE $1 OR contact_name ILIKE $1 OR phone ILIKE $1 OR gstin ILIKE $1)
         ORDER BY updated_at DESC
         LIMIT $2`,
        [like, Math.min(25, limit)],
      ),
    );
  }

  /** Supplier panel: payables outstanding, recent purchases, usual items with last cost. */
  async supplierContext(schema: string, supplierId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const supplier = (
        await qr.query(
          `SELECT id, company AS name, contact_name, phone, gstin FROM "${schema}".suppliers WHERE id = $1`,
          [supplierId],
        )
      )[0];
      if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);

      const [ap] = await qr.query(
        `SELECT COALESCE(SUM(total), 0) AS outstanding,
                COUNT(*) FILTER (WHERE payment_status <> 'paid') AS open_orders
         FROM "${schema}".supplier_orders
         WHERE supplier_id = $1 AND removed = false AND status <> 'cancelled' AND payment_status <> 'paid'`,
        [supplierId],
      );

      const recentOrders = await qr.query(
        `SELECT order_number, supplier_invoice_no, total, status, payment_status, created_at
         FROM "${schema}".supplier_orders
         WHERE supplier_id = $1 AND removed = false
         ORDER BY created_at DESC LIMIT 5`,
        [supplierId],
      );

      const topItems = await qr.query(
        `SELECT soi.product_id, soi.description AS product_name,
                (ARRAY_AGG(soi.unit_price ORDER BY so.created_at DESC))[1] AS last_price,
                MAX(so.created_at) AS last_date,
                SUM(soi.quantity)::numeric AS total_qty
         FROM "${schema}".supplier_order_items soi
         JOIN "${schema}".supplier_orders so ON so.id = soi.supplier_order_id
         WHERE so.supplier_id = $1 AND so.removed = false AND soi.product_id IS NOT NULL
         GROUP BY soi.product_id, soi.description
         ORDER BY MAX(so.created_at) DESC
         LIMIT 5`,
        [supplierId],
      );

      return {
        ...supplier,
        outstanding: num(ap?.outstanding),
        openOrders: Number(ap?.open_orders) || 0,
        recentOrders,
        topItems,
      };
    });
  }

  /**
   * Item panel for the purchase grid: stock + purchase-rate memory (last cost from THIS
   * supplier, last cost overall) + the current sale rate so the margin is visible.
   */
  async itemPurchaseContext(schema: string, productId: string, supplierId?: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const product = (
        await qr.query(
          `SELECT p.id, p.name, p.uom, p.alt_uom, p.uom_factor, p.hsn_code,
                  COALESCE(p.gst_rate, 0) AS gst_rate,
                  p.sale_price, p.base_price, p.purchase_price, p.mrp,
                  p.tracking_mode, p.price_includes_tax, p.sale_discount_pct,
                  p.wholesale_price, p.wholesale_min_qty, p.min_sale_price, p.max_sale_price,
                  p.item_type, p.cess_pct, p.uqc,
                  COALESCE(ivm.low_stock_threshold, 5) AS min_stock,
                  COALESCE(inv.available, 0) + COALESCE(ws.qty, 0) AS stock
           FROM "${schema}".products p
           LEFT JOIN "${schema}".inventory ivm ON ivm.product_id = p.id AND ivm.variant_id IS NULL
           LEFT JOIN LATERAL (
             SELECT SUM(stock_quantity - reserved_quantity) AS available
             FROM "${schema}".inventory i WHERE i.product_id = p.id
           ) inv ON true
           LEFT JOIN LATERAL (
             SELECT SUM(quantity) AS qty FROM "${schema}".erp_stock s WHERE s.product_id = p.id
           ) ws ON true
           WHERE p.id = $1`,
          [productId],
        )
      )[0];
      if (!product) throw new NotFoundException(`Product ${productId} not found`);

      const lastFromSupplier = supplierId ? await this.lastPurchase(qr, schema, productId, supplierId) : null;
      const lastOverall = await this.lastPurchase(qr, schema, productId);

      return { ...product, lastFromSupplier, lastOverall };
    });
  }

  /** Saved addresses for a customer — the Bill To / Ship To picker on the invoice. */
  customerAddresses(schema: string, customerId: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, label, full_address, city, state, pincode, is_default
         FROM "${schema}".addresses WHERE customer_id = $1
         ORDER BY is_default DESC, created_at DESC LIMIT 10`,
        [customerId],
      ),
    );
  }

  /** Open (unpaid/partial) bills for a customer — drives bill-wise receipt allocation. */
  openBills(schema: string, customerId: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, invoice_number, issued_at, total, balance_due,
                GREATEST(0, EXTRACT(DAY FROM NOW() - issued_at))::int AS age_days
         FROM "${schema}".invoices
         WHERE customer_id = $1 AND balance_due > 0 AND COALESCE(status,'issued') <> 'cancelled'
         ORDER BY issued_at ASC`,
        [customerId],
      ),
    );
  }

  /** Open (unpaid/partial) purchase bills for a supplier — drives bill-wise payment allocation. */
  openPurchaseBills(schema: string, supplierId: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, order_number, supplier_invoice_no, created_at AS issued_at, total,
                (total - COALESCE(amount_paid, 0)) AS balance_due,
                GREATEST(0, EXTRACT(DAY FROM NOW() - created_at))::int AS age_days
         FROM "${schema}".supplier_orders
         WHERE supplier_id = $1 AND removed = false AND status <> 'cancelled'
           AND (total - COALESCE(amount_paid, 0)) > 0
         ORDER BY created_at ASC`,
        [supplierId],
      ),
    );
  }

  /** Stock Summary (Tally): item-wise stock in hand with value at the selling rate. */
  stockSummary(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.id, p.name, p.uom, COALESCE(p.gst_rate, 0) AS gst_rate,
                p.sale_price, p.base_price,
                COALESCE(inv.available, 0) + COALESCE(ws.qty, 0) AS stock,
                ROUND((COALESCE(inv.available, 0) + COALESCE(ws.qty, 0)) * COALESCE(p.sale_price, p.base_price, 0), 2) AS stock_value
         FROM "${schema}".products p
         LEFT JOIN LATERAL (
           SELECT SUM(stock_quantity - reserved_quantity) AS available
           FROM "${schema}".inventory i WHERE i.product_id = p.id
         ) inv ON true
         LEFT JOIN LATERAL (
           SELECT SUM(quantity) AS qty FROM "${schema}".erp_stock s WHERE s.product_id = p.id
         ) ws ON true
         WHERE p.is_active = true AND p.deleted_at IS NULL
         ORDER BY p.name`,
      ),
    );
  }

  /** Item-master browser: every master field + live stock in one list (Miracle Add Item). */
  listItems(schema: string, q = '') {
    const like = `%${q}%`;
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.id, p.name, p.uom, p.alt_uom, p.uom_factor, p.hsn_code,
                COALESCE(p.gst_rate, 0) AS gst_rate,
                p.base_price, p.sale_price, p.purchase_price, p.mrp, p.opening_rate,
                p.metadata->>'barcode' AS barcode,
                p.item_type, p.uqc, p.price_includes_tax, p.sale_discount_pct,
                p.wholesale_price, p.wholesale_min_qty, p.min_sale_price, p.max_sale_price,
                p.cess_pct, p.tax_exempt, p.opening_stock_date, p.max_stock, p.rack_location,
                p.tracking_mode, p.category_id, p.description, p.thumbnail, p.custom_fields,
                COALESCE(i.low_stock_threshold, 5) AS min_stock,
                COALESCE(inv.available, 0) + COALESCE(ws.qty, 0) AS stock
         FROM "${schema}".products p
         LEFT JOIN "${schema}".inventory i ON i.product_id = p.id AND i.variant_id IS NULL
         LEFT JOIN LATERAL (
           SELECT SUM(stock_quantity - reserved_quantity) AS available
           FROM "${schema}".inventory iv WHERE iv.product_id = p.id
         ) inv ON true
         LEFT JOIN LATERAL (
           SELECT SUM(quantity) AS qty FROM "${schema}".erp_stock s WHERE s.product_id = p.id
         ) ws ON true
         WHERE p.is_active = true AND p.deleted_at IS NULL AND ($1 = '%%' OR p.name ILIKE $1)
         ORDER BY p.name
         LIMIT 300`,
        [like],
      ),
    );
  }

  /**
   * Batch registry (§3F.1 MRP-wise batches): one item, many lots — each with its own
   * MRP / selling price / cost / qty. Zero-qty batches are kept for history.
   */
  itemBatches(schema: string, productId: string, liveOnly = false) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, batch_no, mfg_date, expiry_date, mrp, selling_price, purchase_cost,
                qty, godown, model_no, size, created_at
         FROM "${schema}".item_batches
         WHERE product_id = $1 ${liveOnly ? 'AND qty > 0' : ''}
         ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
        [productId],
      ),
    );
  }

  /** Location-wise stock of one item (Group H view): godown rows from erp_stock. */
  itemLocations(schema: string, productId: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT w.name AS location, s.quantity
         FROM "${schema}".erp_stock s
         JOIN "${schema}".erp_warehouses w ON w.id = s.warehouse_id
         WHERE s.product_id = $1 AND s.quantity <> 0
         ORDER BY w.name`,
        [productId],
      ),
    );
  }

  /**
   * Add Stock (Miracle item master): delta adjustment on the base inventory row —
   * the same row billing deducts from. Upserts when the product has no row yet.
   */
  async addStock(schema: string, productId: string, qty: number) {
    if (!Number(qty)) return { ok: false, message: 'Quantity required' };
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const updated = await qr.query(
        `UPDATE "${schema}".inventory
         SET stock_quantity = GREATEST(0, stock_quantity + $1), updated_at = NOW()
         WHERE product_id = $2 AND variant_id IS NULL
         RETURNING stock_quantity`,
        [Number(qty), productId],
      );
      if (!updated.length) {
        const inserted = await qr.query(
          `INSERT INTO "${schema}".inventory (product_id, stock_quantity)
           VALUES ($1, GREATEST(0, $2)) RETURNING stock_quantity`,
          [productId, Number(qty)],
        );
        return { ok: true, stock: num(inserted[0]?.stock_quantity) };
      }
      return { ok: true, stock: num(updated[0]?.stock_quantity) };
    });
  }

  /**
   * Rate history — Miracle's "at what rate did we last bill THIS party" list.
   * customerId → that party's sales (orders + invoices); supplierId → that
   * supplier's purchases. Party-specific by design; only unfiltered when no
   * party id is given. Newest first.
   */
  rateHistory(schema: string, productId: string, customerId?: string, supplierId?: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      if (supplierId) {
        return qr.query(
          `SELECT so.created_at AS at, COALESCE(NULLIF(so.supplier_invoice_no, ''), so.order_number) AS doc,
                  soi.quantity AS qty, soi.unit_price AS price
           FROM "${schema}".supplier_order_items soi
           JOIN "${schema}".supplier_orders so ON so.id = soi.supplier_order_id
           WHERE soi.product_id = $1 AND so.removed = false AND so.supplier_id = $2
           ORDER BY so.created_at DESC LIMIT 8`,
          [productId, supplierId],
        );
      }
      // $1/$2 need explicit casts: the orders branch compares them as uuid, the
      // invoices JSONB branch as text — without casts Postgres can't type them.
      return qr.query(
        `SELECT * FROM (
           SELECT o.created_at AS at, o.order_number AS doc, oi.quantity::numeric AS qty, oi.unit_price AS price, NULL::numeric AS discount
           FROM "${schema}".order_items oi
           JOIN "${schema}".orders o ON o.id = oi.order_id
           WHERE oi.product_id = $1::uuid AND ($2::uuid IS NULL OR o.customer_id = $2::uuid)
           UNION ALL
           SELECT i.issued_at AS at, i.invoice_number AS doc,
                  (item->>'quantity')::numeric AS qty, (item->>'unitPrice')::numeric AS price,
                  CASE WHEN item->>'d1' IS NOT NULL OR item->>'d2' IS NOT NULL
                       THEN round((100 - (100 - COALESCE(NULLIF(item->>'d1','')::numeric, 0))
                                       * (100 - COALESCE(NULLIF(item->>'d2','')::numeric, 0)) / 100)::numeric, 2)
                       ELSE NULL END AS discount
           FROM "${schema}".invoices i, jsonb_array_elements(i.items) item
           WHERE item->>'productId' = $1::text AND ($2::uuid IS NULL OR i.customer_id = $2::uuid)
         ) t
         ORDER BY at DESC NULLS LAST LIMIT 8`,
        [productId, customerId || null],
      );
    });
  }

  /** Latest purchase of a product from supplier_orders (optionally for one supplier). */
  private async lastPurchase(qr: any, schema: string, productId: string, supplierId?: string) {
    const cond = supplierId ? 'AND so.supplier_id = $2' : '';
    const params = supplierId ? [productId, supplierId] : [productId];
    const [row] = await qr.query(
      `SELECT soi.unit_price AS price, so.created_at AS at
       FROM "${schema}".supplier_order_items soi
       JOIN "${schema}".supplier_orders so ON so.id = soi.supplier_order_id
       WHERE soi.product_id = $1 AND so.removed = false ${cond}
       ORDER BY so.created_at DESC LIMIT 1`,
      params,
    );
    return row ? { price: num(row.price), at: row.at } : null;
  }

  /** Latest sale of a product — from order_items and ERP invoice line JSONB; newest wins. */
  private async lastSale(qr: any, schema: string, productId: string, customerId?: string) {
    const custOrder = customerId ? 'AND o.customer_id = $2' : '';
    const custInv = customerId ? 'AND i.customer_id = $2' : '';
    const params = customerId ? [productId, customerId] : [productId];

    const [fromOrders] = await qr.query(
      `SELECT oi.unit_price AS price, o.created_at AS at, NULL::numeric AS d1, NULL::numeric AS d2, NULL::numeric AS qty
       FROM "${schema}".order_items oi
       JOIN "${schema}".orders o ON o.id = oi.order_id
       WHERE oi.product_id = $1 ${custOrder}
       ORDER BY o.created_at DESC LIMIT 1`,
      params,
    );
    // Native tally invoices keep the cascading Disc-1/Disc-2 (d1/d2) in the line JSONB,
    // so we can surface the last discount actually given for this item — to this party.
    const [fromInvoices] = await qr.query(
      `SELECT (item->>'unitPrice')::numeric AS price, i.issued_at AS at,
              NULLIF(item->>'d1','')::numeric AS d1,
              NULLIF(item->>'d2','')::numeric AS d2,
              NULLIF(item->>'quantity','')::numeric AS qty
       FROM "${schema}".invoices i, jsonb_array_elements(i.items) item
       WHERE item->>'productId' = $1 ${custInv}
       ORDER BY i.issued_at DESC LIMIT 1`,
      params,
    );

    const candidates = [fromOrders, fromInvoices].filter((r) => r && r.at);
    if (!candidates.length) return null;
    candidates.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const best = candidates[0];
    const d1 = best.d1 != null ? num(best.d1) : null;
    const d2 = best.d2 != null ? num(best.d2) : null;
    // Effective discount % after cascading D1 then D2 (Miracle semantics).
    const discount = d1 != null || d2 != null
      ? Math.round((100 - (100 - (d1 || 0)) * (100 - (d2 || 0)) / 100) * 100) / 100
      : null;
    return { price: num(best.price), at: best.at, qty: best.qty != null ? num(best.qty) : null, d1, d2, discount };
  }
}
