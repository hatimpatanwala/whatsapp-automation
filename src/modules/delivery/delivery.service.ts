import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { EventBusService } from '../events/event-bus.service';
import { DeliveryStatusChangedEvent } from '../events/domain-events';
import { DeliveryProvider } from './providers/delivery-provider.interface';
import { SelfManagedProvider } from './providers/self-managed.provider';

@Injectable()
export class DeliveryService {
  private providers: Map<string, DeliveryProvider> = new Map();

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
  ) {
    this.providers.set('self_managed', new SelfManagedProvider());
  }

  async createDelivery(schema: string, orderId: string, providerType = 'self_managed'): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const delivery = await qr.query(
        `INSERT INTO deliveries (order_id, provider_type, status) VALUES ($1, $2, 'pending') RETURNING *`,
        [orderId, providerType],
      );
      return delivery[0];
    });
  }

  async assignDelivery(schema: string, deliveryId: string, assignedTo: string, estimatedDelivery?: Date): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      const delivery = await qr.query(`SELECT * FROM deliveries WHERE id = $1`, [deliveryId]);
      if (!delivery[0]) throw new NotFoundException('Delivery not found');

      await qr.query(
        `UPDATE deliveries SET assigned_to = $1, estimated_delivery = $2, status = 'assigned', updated_at = NOW() WHERE id = $3`,
        [assignedTo, estimatedDelivery, deliveryId],
      );

      const order = await qr.query(`SELECT customer_id FROM orders WHERE id = $1`, [delivery[0].order_id]);

      this.eventBus.emit(new DeliveryStatusChangedEvent(
        schema, deliveryId, delivery[0].order_id, order[0].customer_id, 'pending', 'assigned',
      ));

      return { ...delivery[0], assigned_to: assignedTo, status: 'assigned' };
    });
  }

  async updateStatus(schema: string, deliveryId: string, status: string, notes?: string): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      const delivery = await qr.query(`SELECT * FROM deliveries WHERE id = $1`, [deliveryId]);
      if (!delivery[0]) throw new NotFoundException('Delivery not found');

      const oldStatus = delivery[0].status;
      const updates: string[] = [`status = $1`, `updated_at = NOW()`];
      const params: any[] = [status];

      if (notes) {
        updates.push(`notes = $${params.length + 1}`);
        params.push(notes);
      }

      if (status === 'delivered') {
        updates.push(`delivered_at = NOW()`);
      }

      params.push(deliveryId);
      await qr.query(
        `UPDATE deliveries SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params,
      );

      // Update order status accordingly
      if (status === 'in_transit') {
        await qr.query(`UPDATE orders SET status = 'out_for_delivery', updated_at = NOW() WHERE id = $1`, [delivery[0].order_id]);
      } else if (status === 'delivered') {
        await qr.query(`UPDATE orders SET status = 'delivered', delivered_at = NOW(), updated_at = NOW() WHERE id = $1`, [delivery[0].order_id]);
      }

      const order = await qr.query(`SELECT customer_id FROM orders WHERE id = $1`, [delivery[0].order_id]);

      this.eventBus.emit(new DeliveryStatusChangedEvent(
        schema, deliveryId, delivery[0].order_id, order[0].customer_id, oldStatus, status,
      ));

      return { ...delivery[0], status };
    });
  }

  async findAll(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(`
        SELECT d.*, o.order_number, c.phone as customer_phone, c.name as customer_name
        FROM deliveries d
        JOIN orders o ON o.id = d.order_id
        JOIN customers c ON c.id = o.customer_id
        ORDER BY d.created_at DESC
      `);
    });
  }
}
