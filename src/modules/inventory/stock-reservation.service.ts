import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { EventBusService } from '../events/event-bus.service';
import { StockReservedEvent, ReservationExpiredEvent } from '../events/domain-events';
import { QUEUE_RESERVATION_CLEANUP } from '../../queue/queue.module';

@Injectable()
export class StockReservationService {
  private readonly logger = new Logger(StockReservationService.name);
  private readonly ttlMinutes: number;

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_RESERVATION_CLEANUP)
    private readonly cleanupQueue: Queue,
  ) {
    this.ttlMinutes = this.configService.get<number>('RESERVATION_TTL_MINUTES', 15);
  }

  async reserveStock(
    schema: string,
    productId: string,
    variantId: string | null,
    quantity: number,
    customerId: string,
    cartId?: string,
  ): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      // Find inventory with pessimistic lock
      const whereClause = variantId
        ? `product_id = $1 AND variant_id = $2`
        : `product_id = $1 AND variant_id IS NULL`;
      const params = variantId ? [productId, variantId] : [productId];

      const inv = await qr.query(
        `SELECT * FROM inventory WHERE ${whereClause} FOR UPDATE`,
        params,
      );

      if (!inv[0]) throw new Error('Inventory record not found');

      const available = inv[0].stock_quantity - inv[0].reserved_quantity;
      if (available < quantity) {
        throw new Error(`Insufficient stock. Available: ${available}, Requested: ${quantity}`);
      }

      // Increment reserved quantity
      await qr.query(
        `UPDATE inventory SET reserved_quantity = reserved_quantity + $1, version = version + 1, updated_at = NOW()
         WHERE id = $2`,
        [quantity, inv[0].id],
      );

      // Create reservation record
      const expiresAt = new Date(Date.now() + this.ttlMinutes * 60 * 1000);
      const reservation = await qr.query(
        `INSERT INTO stock_reservations (inventory_id, customer_id, cart_id, quantity, status, expires_at)
         VALUES ($1, $2, $3, $4, 'active', $5) RETURNING *`,
        [inv[0].id, customerId, cartId, quantity, expiresAt],
      );

      // Schedule expiry job
      await this.cleanupQueue.add(
        'expire-reservation',
        { schema, reservationId: reservation[0].id, inventoryId: inv[0].id, quantity },
        { delay: this.ttlMinutes * 60 * 1000 },
      );

      this.eventBus.emit(new StockReservedEvent(schema, inv[0].id, reservation[0].id, quantity));

      return reservation[0];
    });
  }

  async confirmReservation(schema: string, reservationId: string): Promise<void> {
    await this.connectionManager.executeInTransaction(schema, async (qr) => {
      const reservation = await qr.query(
        `SELECT * FROM stock_reservations WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [reservationId],
      );

      if (!reservation[0]) return;

      // Mark as confirmed - stock remains reserved until order is fulfilled
      await qr.query(
        `UPDATE stock_reservations SET status = 'confirmed' WHERE id = $1`,
        [reservationId],
      );
    });
  }

  async releaseReservation(schema: string, reservationId: string): Promise<void> {
    await this.connectionManager.executeInTransaction(schema, async (qr) => {
      const reservation = await qr.query(
        `SELECT * FROM stock_reservations WHERE id = $1 AND status IN ('active', 'confirmed') FOR UPDATE`,
        [reservationId],
      );

      if (!reservation[0]) return;

      // Release stock
      await qr.query(
        `UPDATE inventory SET reserved_quantity = reserved_quantity - $1, version = version + 1, updated_at = NOW()
         WHERE id = $2`,
        [reservation[0].quantity, reservation[0].inventory_id],
      );

      await qr.query(
        `UPDATE stock_reservations SET status = 'released' WHERE id = $1`,
        [reservationId],
      );
    });
  }

  async expireReservation(schema: string, reservationId: string, inventoryId: string, quantity: number): Promise<void> {
    await this.connectionManager.executeInTransaction(schema, async (qr) => {
      const reservation = await qr.query(
        `SELECT * FROM stock_reservations WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [reservationId],
      );

      if (!reservation[0]) return; // Already confirmed or released

      // Release reserved stock
      await qr.query(
        `UPDATE inventory SET reserved_quantity = reserved_quantity - $1, version = version + 1, updated_at = NOW()
         WHERE id = $2`,
        [quantity, inventoryId],
      );

      await qr.query(
        `UPDATE stock_reservations SET status = 'expired' WHERE id = $1`,
        [reservationId],
      );

      this.eventBus.emit(new ReservationExpiredEvent(schema, reservationId, inventoryId, quantity));
      this.logger.log(`Reservation expired: ${reservationId}`);
    });
  }

  async deductStock(schema: string, inventoryId: string, quantity: number): Promise<void> {
    await this.connectionManager.executeInTransaction(schema, async (qr) => {
      await qr.query(
        `UPDATE inventory
         SET stock_quantity = stock_quantity - $1,
             reserved_quantity = reserved_quantity - $1,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $2`,
        [quantity, inventoryId],
      );
    });
  }
}
