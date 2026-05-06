import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { EventBusService } from '../events/event-bus.service';
import { StockLowEvent } from '../events/domain-events';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
  ) {}

  async getAll(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(`
        SELECT i.*, p.name as product_name, pv.name as variant_name
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        LEFT JOIN product_variants pv ON pv.id = i.variant_id
        ORDER BY p.name
      `);
    });
  }

  async getLowStock(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(`
        SELECT i.*, p.name as product_name
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        WHERE i.track_inventory = true
          AND (i.stock_quantity - i.reserved_quantity) <= i.low_stock_threshold
        ORDER BY (i.stock_quantity - i.reserved_quantity)
      `);
    });
  }

  async adjustStock(schema: string, inventoryId: string, adjustment: number, reason?: string): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      // Pessimistic lock
      const inv = await qr.query(
        `SELECT i.*, p.name as product_name FROM inventory i
         JOIN products p ON p.id = i.product_id
         WHERE i.id = $1 FOR UPDATE`,
        [inventoryId],
      );

      if (!inv[0]) throw new Error('Inventory record not found');

      const newQuantity = inv[0].stock_quantity + adjustment;
      if (newQuantity < 0) throw new Error('Cannot reduce stock below zero');
      if (newQuantity < inv[0].reserved_quantity) throw new Error('Cannot reduce below reserved quantity');

      await qr.query(
        `UPDATE inventory SET stock_quantity = $1, version = version + 1, updated_at = NOW() WHERE id = $2`,
        [newQuantity, inventoryId],
      );

      // Check low stock
      const available = newQuantity - inv[0].reserved_quantity;
      if (available <= inv[0].low_stock_threshold) {
        this.eventBus.emit(new StockLowEvent(
          schema, inv[0].product_id, inv[0].product_name, available, inv[0].low_stock_threshold,
        ));
      }

      return { ...inv[0], stock_quantity: newQuantity };
    });
  }

  async getAvailableStock(schema: string, productId: string, variantId?: string): Promise<number> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const whereClause = variantId
        ? `product_id = $1 AND variant_id = $2`
        : `product_id = $1 AND variant_id IS NULL`;
      const params = variantId ? [productId, variantId] : [productId];

      const result = await qr.query(
        `SELECT stock_quantity - reserved_quantity as available FROM inventory WHERE ${whereClause}`,
        params,
      );

      return result[0]?.available || 0;
    });
  }
}
