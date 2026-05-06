import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { EventBusService } from '../events/event-bus.service';
import { OrderCreatedEvent, OrderStatusChangedEvent } from '../events/domain-events';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
  ) {}

  async findAll(schema: string, pagination: PaginationDto, status?: string): Promise<PaginatedResponse<any>> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let whereClause = '1=1';
      const params: any[] = [];

      if (status) {
        params.push(status);
        whereClause += ` AND o.status = $${params.length}`;
      }

      const countResult = await qr.query(
        `SELECT COUNT(*) as total FROM orders o WHERE ${whereClause}`, params,
      );
      const total = parseInt(countResult[0].total);

      params.push(pagination.limit, pagination.skip);
      const orders = await qr.query(
        `SELECT o.*, c.phone as customer_phone, c.name as customer_name
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE ${whereClause}
         ORDER BY o.placed_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return new PaginatedResponse(orders, total, pagination.page, pagination.limit);
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const order = await qr.query(
        `SELECT o.*, c.phone as customer_phone, c.name as customer_name,
                a.full_address, a.city, a.pincode
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN addresses a ON a.id = o.address_id
         WHERE o.id = $1`,
        [id],
      );
      if (!order[0]) throw new NotFoundException('Order not found');

      const items = await qr.query(
        `SELECT * FROM order_items WHERE order_id = $1`, [id],
      );

      const payment = await qr.query(
        `SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [id],
      );

      const delivery = await qr.query(
        `SELECT * FROM deliveries WHERE order_id = $1`, [id],
      );

      return { ...order[0], items, payment: payment[0], delivery: delivery[0] };
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

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 4).toUpperCase()}`;

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

  async getStats(schema: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const stats = await qr.query(`
        SELECT
          COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
          COALESCE(SUM(total) FILTER (WHERE status != 'cancelled'), 0) as total_revenue,
          COALESCE(SUM(total) FILTER (WHERE placed_at >= NOW() - INTERVAL '30 days' AND status != 'cancelled'), 0) as revenue_30d,
          COUNT(*) FILTER (WHERE placed_at >= NOW() - INTERVAL '30 days') as orders_30d
        FROM orders
      `);
      return stats[0];
    });
  }
}
