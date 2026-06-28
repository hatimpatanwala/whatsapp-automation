import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class CustomerService {
  constructor(private readonly connectionManager: TenantConnectionManager) {}

  /** Common SELECT columns + derived activity/cart fields (c = customers alias). */
  private readonly customerCols = `
    c.id, c.phone as whatsapp_phone, c.name as whatsapp_name, c.display_name, c.email,
    c.language, c.tags, c.metadata, c.notes, c.total_orders, c.total_spent,
    c.last_order_at, c.opted_in, c.created_at, c.updated_at,
    CASE WHEN c.opted_in = false THEN 'blocked' ELSE 'active' END as status,
    GREATEST(c.last_order_at, c.updated_at,
      (SELECT MAX(ca.updated_at) FROM carts ca WHERE ca.customer_id = c.id)) as last_activity,
    COALESCE((SELECT SUM(ci.quantity) FROM carts ca JOIN cart_items ci ON ci.cart_id = ca.id
               WHERE ca.customer_id = c.id AND ca.status = 'active'), 0) as active_cart_items`;

  /** Quick-segment → extra WHERE clause + default ORDER BY. */
  private segmentClause(segment?: string): { where: string; orderBy: string } {
    switch (segment) {
      case 'top':         return { where: 'c.total_spent > 0', orderBy: 'c.total_spent DESC' };
      case 'high_orders': return { where: 'c.total_orders >= 3', orderBy: 'c.total_orders DESC' };
      case 'low_orders':  return { where: 'c.total_orders BETWEEN 1 AND 2', orderBy: 'c.total_orders ASC, c.total_spent DESC' };
      case 'pending_cart':return { where: `EXISTS (SELECT 1 FROM carts ca JOIN cart_items ci ON ci.cart_id = ca.id WHERE ca.customer_id = c.id AND ca.status = 'active')`, orderBy: 'last_activity DESC NULLS LAST' };
      case 'new':         return { where: `c.created_at >= NOW() - INTERVAL '30 days'`, orderBy: 'c.created_at DESC' };
      case 'repeat':      return { where: 'c.total_orders > 1', orderBy: 'c.total_orders DESC' };
      case 'inactive':    return { where: `(c.last_order_at IS NULL OR c.last_order_at < NOW() - INTERVAL '60 days')`, orderBy: 'c.last_order_at ASC NULLS FIRST' };
      case 'blocked':     return { where: 'c.opted_in = false', orderBy: 'c.created_at DESC' };
      default:            return { where: '1=1', orderBy: 'c.created_at DESC' };
    }
  }

  async findAll(schema: string, pagination: PaginationDto, search?: string, segment?: string): Promise<PaginatedResponse<any>> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const seg = this.segmentClause(segment);
      const where: string[] = [seg.where];
      const params: any[] = [];

      if (search) {
        params.push(`%${search}%`);
        where.push(`(c.phone LIKE $${params.length} OR c.name ILIKE $${params.length} OR c.display_name ILIKE $${params.length} OR c.email ILIKE $${params.length})`);
      }
      const whereClause = where.join(' AND ');

      const countResult = await qr.query(`SELECT COUNT(*) as total FROM customers c WHERE ${whereClause}`, params);
      const total = parseInt(countResult[0].total);

      params.push(pagination.limit, pagination.skip);
      const customers = await qr.query(
        `SELECT ${this.customerCols} FROM customers c WHERE ${whereClause}
          ORDER BY ${seg.orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return new PaginatedResponse(customers, total, pagination.page, pagination.limit);
    });
  }

  /** Customers in a segment for the WhatsApp webview (with last activity + cart). */
  async segmentList(schema: string, segment: string, page = 1, limit = 50, search?: string): Promise<{ data: any[]; total: number }> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const seg = this.segmentClause(segment);
      const where: string[] = [seg.where];
      const params: any[] = [];
      if (search) {
        params.push(`%${search}%`);
        where.push(`(c.phone LIKE $${params.length} OR c.name ILIKE $${params.length} OR c.display_name ILIKE $${params.length})`);
      }
      const whereClause = where.join(' AND ');
      const total = parseInt((await qr.query(`SELECT COUNT(*) total FROM customers c WHERE ${whereClause}`, params))[0].total);
      params.push(limit, (page - 1) * limit);
      const data = await qr.query(
        `SELECT ${this.customerCols} FROM customers c WHERE ${whereClause}
          ORDER BY ${seg.orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return { data, total };
    });
  }

  /** Counts per quick-segment for the filter chips. */
  async segmentSummary(schema: string): Promise<Record<string, number>> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const r = (await qr.query(`
        SELECT
          COUNT(*)::int AS all,
          COUNT(*) FILTER (WHERE c.total_spent > 0)::int AS top,
          COUNT(*) FILTER (WHERE c.total_orders >= 3)::int AS high_orders,
          COUNT(*) FILTER (WHERE c.total_orders BETWEEN 1 AND 2)::int AS low_orders,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM carts ca JOIN cart_items ci ON ci.cart_id = ca.id WHERE ca.customer_id = c.id AND ca.status = 'active'))::int AS pending_cart,
          COUNT(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '30 days')::int AS new,
          COUNT(*) FILTER (WHERE c.total_orders > 1)::int AS repeat,
          COUNT(*) FILTER (WHERE c.last_order_at IS NULL OR c.last_order_at < NOW() - INTERVAL '60 days')::int AS inactive,
          COUNT(*) FILTER (WHERE c.opted_in = false)::int AS blocked
        FROM customers c`))[0];
      return r || {};
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(`SELECT ${this.customerCols} FROM customers c WHERE c.id = $1`, [id]);
      if (!result[0]) throw new NotFoundException('Customer not found');
      return result[0];
    });
  }

  /** Update editable profile fields (name, display name/nickname, email, notes, tags, block). */
  async update(
    schema: string,
    id: string,
    data: { name?: string; displayName?: string; email?: string; notes?: string; tags?: string[]; optedIn?: boolean },
  ): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const map: Record<string, any> = {
        name: data.name,
        display_name: data.displayName,
        email: data.email,
        notes: data.notes,
        tags: data.tags,
        opted_in: data.optedIn,
      };
      const fields: string[] = [];
      const params: any[] = [];
      for (const [col, val] of Object.entries(map)) {
        if (val !== undefined) { params.push(val); fields.push(`${col} = $${params.length}`); }
      }
      if (!fields.length) return this.findById(schema, id);
      fields.push('updated_at = NOW()');
      params.push(id);
      const r = await qr.query(`UPDATE customers c SET ${fields.join(', ')} WHERE c.id = $${params.length} RETURNING id`, params);
      if (!r[0]) throw new NotFoundException('Customer not found');
      return this.findById(schema, id);
    });
  }

  async findByPhone(schema: string, phone: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(`SELECT * FROM customers WHERE phone = $1`, [phone]);
      return result[0] || null;
    });
  }

  async updateTags(schema: string, customerId: string, tags: string[]): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `UPDATE customers SET tags = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [tags, customerId],
      );
      return result[0];
    });
  }

  async getCustomerOrders(schema: string, customerId: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT o.id, o.order_number, o.status, o.total as total_amount, o.currency, o.created_at,
                COALESCE((SELECT SUM(oi.quantity)::int FROM order_items oi WHERE oi.order_id = o.id), 0) as item_count
           FROM orders o WHERE o.customer_id = $1 ORDER BY o.created_at DESC`,
        [customerId],
      );
    });
  }

  /** The customer's current active cart (for the detail page / segments). */
  async getActiveCart(schema: string, customerId: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const cart = (await qr.query(
        `SELECT id, updated_at FROM carts WHERE customer_id = $1 AND status = 'active' LIMIT 1`,
        [customerId],
      ))[0];
      if (!cart) return { items: [], total: 0, updatedAt: null };
      const items = await qr.query(
        `SELECT p.name, ci.quantity, ci.unit_price FROM cart_items ci
           JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = $1`,
        [cart.id],
      );
      const total = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price), 0);
      return {
        updatedAt: cart.updated_at,
        total,
        items: items.map((i: any) => ({ name: i.name, quantity: Number(i.quantity), unitPrice: Number(i.unit_price) })),
      };
    });
  }

  async getStats(schema: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const stats = await qr.query(`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'active' OR status IS NULL)::int as active,
          COUNT(*) FILTER (WHERE status = 'blocked')::int as blocked,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int as new_this_month,
          COUNT(*) FILTER (WHERE total_orders > 1)::int as repeat_customers,
          CASE WHEN COUNT(*) FILTER (WHERE total_orders > 0) > 0
            THEN ROUND(COALESCE(SUM(total_spent), 0) / NULLIF(COUNT(*) FILTER (WHERE total_orders > 0), 0), 2)
            ELSE 0
          END::numeric as average_order_value
        FROM customers
      `);

      const topSpenders = await qr.query(`
        SELECT id, phone as whatsapp_phone, name as whatsapp_name, total_spent
        FROM customers
        WHERE total_spent > 0
        ORDER BY total_spent DESC
        LIMIT 5
      `);

      return { ...stats[0], top_spenders: topSpenders };
    });
  }

  async getSegmentedCustomers(schema: string, rules: any): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let whereClause = 'opted_in = true';
      const params: any[] = [];

      if (rules.tags && rules.tags.length > 0) {
        params.push(rules.tags);
        whereClause += ` AND tags && $${params.length}`;
      }
      if (rules.minOrders) {
        params.push(rules.minOrders);
        whereClause += ` AND total_orders >= $${params.length}`;
      }
      if (rules.minSpent) {
        params.push(rules.minSpent);
        whereClause += ` AND total_spent >= $${params.length}`;
      }
      if (rules.lastOrderAfter) {
        params.push(rules.lastOrderAfter);
        whereClause += ` AND last_order_at >= $${params.length}`;
      }

      return qr.query(`SELECT * FROM customers WHERE ${whereClause}`, params);
    });
  }
}
