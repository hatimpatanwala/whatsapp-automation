import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { EventBusService } from '../events/event-bus.service';
import { OrderCreatedEvent, OrderStatusChangedEvent } from '../events/domain-events';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
  ) {}

  async findAll(schema: string, pagination: PaginationDto, status?: string, search?: string, paymentStatus?: string): Promise<PaginatedResponse<any>> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let whereClause = '1=1';
      const params: any[] = [];

      if (status) {
        params.push(status);
        whereClause += ` AND o.status = $${params.length}`;
      }
      if (paymentStatus) {
        params.push(paymentStatus);
        whereClause += ` AND COALESCE(p.status, 'pending') = $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        whereClause += ` AND (o.order_number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
      }

      const countResult = await qr.query(
        `SELECT COUNT(*) as total FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN payments p ON p.order_id = o.id
         WHERE ${whereClause}`, params,
      );
      const total = parseInt(countResult[0].total);

      params.push(pagination.limit, pagination.skip);
      const orders = await qr.query(
        `SELECT o.id, o.order_number, o.status, o.subtotal, o.discount,
                o.delivery_fee, o.total as total_amount, o.currency, o.notes,
                o.placed_at, o.confirmed_at, o.delivered_at,
                o.created_at, o.updated_at,
                (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) as item_count,
                COALESCE(p.status, 'pending') as payment_status,
                json_build_object(
                  'id', c.id,
                  'whatsapp_phone', c.phone,
                  'whatsapp_name', c.name,
                  'first_name', NULL,
                  'last_name', NULL
                ) as customer
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN payments p ON p.order_id = o.id
         WHERE ${whereClause}
         ORDER BY o.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      // Parse customer JSON
      const mappedOrders = orders.map((o: any) => ({
        ...o,
        customer: typeof o.customer === 'string' ? JSON.parse(o.customer) : o.customer,
      }));

      return new PaginatedResponse(mappedOrders, total, pagination.page, pagination.limit);
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const order = await qr.query(
        `SELECT o.id, o.order_number, o.status, o.subtotal, o.discount,
                o.delivery_fee, o.tax_amount, o.total as total_amount, o.currency, o.notes,
                o.cancelled_reason as cancel_reason,
                o.placed_at, o.confirmed_at, o.delivered_at,
                o.created_at, o.updated_at,
                json_build_object(
                  'id', c.id,
                  'whatsapp_phone', c.phone,
                  'whatsapp_name', c.name,
                  'first_name', NULL,
                  'last_name', NULL,
                  'total_orders', COALESCE(c.total_orders, 0),
                  'total_spent', COALESCE(c.total_spent, 0)
                ) as customer,
                json_build_object(
                  'street', COALESCE(a.full_address, ''),
                  'city', COALESCE(a.city, ''),
                  'postal_code', COALESCE(a.pincode, '')
                ) as shipping_address
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN addresses a ON a.id = o.address_id
         WHERE o.id = $1`,
        [id],
      );
      if (!order[0]) throw new NotFoundException('Order not found');

      const items = await qr.query(
        `SELECT oi.*, COALESCE(oi.product_name, p.name) as product_name, p.slug as sku, p.images as image_urls
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`, [id],
      );

      const payment = await qr.query(
        `SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [id],
      );

      const delivery = await qr.query(
        `SELECT * FROM deliveries WHERE order_id = $1`, [id],
      );

      const o = order[0];
      return {
        ...o,
        customer: typeof o.customer === 'string' ? JSON.parse(o.customer) : o.customer,
        shipping_address: typeof o.shipping_address === 'string' ? JSON.parse(o.shipping_address) : o.shipping_address,
        payment_status: payment[0]?.status ?? 'pending',
        items,
        payment: payment[0],
        delivery: delivery[0],
      };
    });
  }

  async createFromCart(schema: string, customerId: string, addressId: string): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      // Get active cart with items
      const cartItems = await qr.query(
        `SELECT ci.*, p.name as product_name, pv.name as variant_name
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         JOIN products p ON p.id = ci.product_id
         LEFT JOIN product_variants pv ON pv.id = ci.variant_id
         WHERE c.customer_id = $1 AND c.status = 'active'`,
        [customerId],
      );

      if (!cartItems || cartItems.length === 0) {
        throw new Error('Cart is empty');
      }

      // Calculate totals
      let subtotal = 0;
      cartItems.forEach((item: any) => {
        subtotal += item.quantity * parseFloat(item.unit_price);
      });

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`;

      // Create order
      const order = await qr.query(
        `INSERT INTO orders (order_number, customer_id, address_id, status, subtotal, total)
         VALUES ($1, $2, $3, 'pending', $4, $4) RETURNING *`,
        [orderNumber, customerId, addressId, subtotal],
      );

      // Create order items
      for (const item of cartItems) {
        await qr.query(
          `INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            order[0].id, item.product_id, item.variant_id,
            item.product_name, item.variant_name,
            item.quantity, item.unit_price, item.quantity * parseFloat(item.unit_price),
          ],
        );
      }

      // Mark cart as checked out
      await qr.query(
        `UPDATE carts SET status = 'checked_out', updated_at = NOW() WHERE customer_id = $1 AND status = 'active'`,
        [customerId],
      );

      // Update customer stats
      await qr.query(
        `UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + $1, last_order_at = NOW() WHERE id = $2`,
        [subtotal, customerId],
      );

      // Emit event
      this.eventBus.emit(new OrderCreatedEvent(schema, order[0].id, customerId, orderNumber, subtotal));

      return order[0];
    });
  }

  /**
   * Create an order directly from a provided list of items with explicit prices
   * (used by the Builder webview — admin builds an order with custom prices/qty,
   * bypassing the cart). No address required; status starts 'pending'.
   */
  async createDirect(
    schema: string,
    data: {
      customerId: string;
      items: { productId?: string; productName?: string; quantity: number; unitPrice: number }[];
      notes?: string;
      discount?: number;
      deliveryFee?: number;
      taxAmount?: number;
    },
  ): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      let subtotal = 0;
      data.items.forEach((it) => {
        subtotal += Number(it.quantity) * Number(it.unitPrice);
      });

      const discount = Math.max(0, Number(data.discount) || 0);
      const deliveryFee = Math.max(0, Number(data.deliveryFee) || 0);
      const taxAmount = Math.max(0, Number(data.taxAmount) || 0);
      const total = Math.max(0, subtotal + taxAmount - discount + deliveryFee);

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`;

      const order = await qr.query(
        `INSERT INTO orders (order_number, customer_id, status, subtotal, tax_amount, discount, delivery_fee, total, notes)
         VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8) RETURNING *`,
        [orderNumber, data.customerId, subtotal, taxAmount, discount, deliveryFee, total, data.notes || null],
      );

      for (const it of data.items) {
        await qr.query(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order[0].id, it.productId || null, it.productName || 'Item', it.quantity, it.unitPrice, Number(it.quantity) * Number(it.unitPrice)],
        );
      }

      await qr.query(
        `UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + $1, last_order_at = NOW() WHERE id = $2`,
        [total, data.customerId],
      );

      this.eventBus.emit(new OrderCreatedEvent(schema, order[0].id, data.customerId, orderNumber, total));
      return order[0];
    });
  }

  async updateStatus(schema: string, orderId: string, newStatus: string, reason?: string): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      const order = await qr.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
      if (!order[0]) throw new NotFoundException('Order not found');

      const oldStatus = order[0].status;

      const updates: string[] = [`status = $1`];
      const params: any[] = [newStatus];
      let paramIdx = 2;

      if (newStatus === 'confirmed') {
        updates.push(`confirmed_at = NOW()`);
      } else if (newStatus === 'delivered') {
        updates.push(`delivered_at = NOW()`);
      } else if (newStatus === 'cancelled' && reason) {
        updates.push(`cancelled_reason = $${paramIdx++}`);
        params.push(reason);
      }

      updates.push(`updated_at = NOW()`);
      params.push(orderId);

      await qr.query(
        `UPDATE orders SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        params,
      );

      this.eventBus.emit(new OrderStatusChangedEvent(
        schema, orderId, order[0].customer_id, oldStatus, newStatus,
      ));

      return { ...order[0], status: newStatus };
    });
  }

  /**
   * Full order edit: replace line items and/or adjust discount, delivery fee,
   * notes, and status. Recomputes subtotal/total from the items. Used by the
   * admin order-detail edit screen.
   */
  async updateOrder(
    schema: string,
    orderId: string,
    data: {
      items?: { productId?: string; productName?: string; quantity: number; unitPrice: number }[];
      discount?: number;
      deliveryFee?: number;
      notes?: string;
      status?: string;
    },
  ): Promise<any> {
    await this.connectionManager.executeInTransaction(schema, async (qr) => {
      const existing = await qr.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
      if (!existing[0]) throw new NotFoundException('Order not found');

      let subtotal = Number(existing[0].subtotal) || 0;

      if (Array.isArray(data.items)) {
        if (data.items.length === 0) throw new Error('An order must have at least one item');
        subtotal = data.items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0);

        await qr.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
        for (const it of data.items) {
          await qr.query(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [orderId, it.productId || null, it.productName || 'Item', it.quantity, it.unitPrice, Number(it.quantity) * Number(it.unitPrice)],
          );
        }
      }

      const discount = data.discount != null ? Number(data.discount) : Number(existing[0].discount) || 0;
      const deliveryFee = data.deliveryFee != null ? Number(data.deliveryFee) : Number(existing[0].delivery_fee) || 0;
      const total = Math.max(0, subtotal - discount + deliveryFee);

      await qr.query(
        `UPDATE orders
            SET subtotal = $1, discount = $2, delivery_fee = $3, total = $4,
                notes = COALESCE($5, notes),
                status = COALESCE($6, status),
                updated_at = NOW()
          WHERE id = $7`,
        [subtotal, discount, deliveryFee, total, data.notes ?? null, data.status ?? null, orderId],
      );

      if (data.status && data.status !== existing[0].status) {
        this.eventBus.emit(new OrderStatusChangedEvent(
          schema, orderId, existing[0].customer_id, existing[0].status, data.status,
        ));
      }
    });

    return this.findById(schema, orderId);
  }

  async getStats(schema: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const stats = await qr.query(`
        SELECT
          COUNT(*)::int as "totalOrders",
          COUNT(*) FILTER (WHERE status = 'pending')::int as "pendingOrders",
          COUNT(*) FILTER (WHERE status = 'processing')::int as "processingOrders",
          COUNT(*) FILTER (WHERE status IN ('completed', 'delivered'))::int as "completedOrders",
          COUNT(*) FILTER (WHERE status IN ('cancelled', 'canceled'))::int as "canceledOrders",
          COALESCE(SUM(total) FILTER (WHERE status NOT IN ('cancelled', 'canceled')), 0)::numeric as "totalRevenue",
          CASE WHEN COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'canceled')) > 0
            THEN ROUND(COALESCE(SUM(total) FILTER (WHERE status NOT IN ('cancelled', 'canceled')), 0) / NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'canceled')), 0), 2)
            ELSE 0
          END::numeric as "averageOrderValue",
          COALESCE(SUM(total) FILTER (WHERE placed_at >= CURRENT_DATE AND status NOT IN ('cancelled', 'canceled')), 0)::numeric as "revenueToday",
          COUNT(*) FILTER (WHERE placed_at >= CURRENT_DATE)::int as "ordersToday"
        FROM orders
      `);
      return stats[0];
    });
  }

  async getDashboardCounts(schema: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const [pendingPayments] = await qr.query(
        `SELECT COUNT(*) as count FROM "${schema}".payments WHERE status = 'pending'`
      );
      const [openConversations] = await qr.query(
        `SELECT COUNT(*) as count FROM "${schema}".conversations WHERE status = 'open'`
      );
      const [pendingOrders] = await qr.query(
        `SELECT COUNT(*) as count FROM "${schema}".orders WHERE status = 'pending'`
      );
      const [pendingDeliveries] = await qr.query(
        `SELECT COUNT(*) as count FROM "${schema}".deliveries WHERE status = 'pending'`
      );
      return {
        pendingPayments: parseInt(pendingPayments?.count ?? '0'),
        openConversations: parseInt(openConversations?.count ?? '0'),
        pendingOrders: parseInt(pendingOrders?.count ?? '0'),
        pendingDeliveries: parseInt(pendingDeliveries?.count ?? '0'),
      };
    });
  }

  async getChartData(schema: string, days: number = 7): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(`
        SELECT
          DATE(placed_at) as date,
          COUNT(*) as order_count,
          COALESCE(SUM(total), 0) as revenue
        FROM "${schema}".orders
        WHERE placed_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(placed_at)
        ORDER BY date ASC
      `);
      return {
        labels: rows.map((r: any) => r.date),
        revenue: rows.map((r: any) => parseFloat(r.revenue)),
        orders: rows.map((r: any) => parseInt(r.order_count)),
      };
    });
  }
}
