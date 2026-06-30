import { Injectable, Controller, UseGuards, Get, Post, Body, Query, Req, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { firstRow } from '../common/sql-result.util';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

interface AdjustInput { warehouseId: string; productId: string; quantity: number; mode?: 'set' | 'delta'; note?: string; }
interface TransferInput { fromWarehouseId: string; toWarehouseId: string; productId: string; quantity: number; note?: string; }

/**
 * Multi-warehouse stock. erp_stock holds per-(warehouse, product) quantities; every
 * change is also written to erp_stock_movements for an audit trail. Independent of
 * the WhatsApp-commerce `inventory` table (single-location sellable stock), so the
 * existing commerce flow is untouched.
 */
@Injectable()
export class StockService {
  constructor(private readonly cm: TenantConnectionManager) {}

  /** Products with their quantity in a given warehouse (0 if none yet). */
  async byWarehouse(schema: string, warehouseId: string) {
    if (!warehouseId) return { data: [], total: 0 };
    const data = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.id AS product_id, p.name, p.sku, COALESCE(s.quantity, 0) AS quantity
         FROM "${schema}".products p
         LEFT JOIN "${schema}".erp_stock s ON s.product_id = p.id AND s.warehouse_id = $1 AND s.variant_id IS NULL
         WHERE p.is_active = true ORDER BY p.name LIMIT 500`,
        [warehouseId],
      ));
    return { data, total: data.length };
  }

  /** A product's stock across all warehouses. */
  async overview(schema: string, productId: string) {
    if (!productId) return [];
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT w.id AS warehouse_id, w.name AS warehouse, COALESCE(s.quantity,0) AS quantity
         FROM "${schema}".erp_warehouses w
         LEFT JOIN "${schema}".erp_stock s ON s.warehouse_id = w.id AND s.product_id = $1 AND s.variant_id IS NULL
         WHERE w.removed = false ORDER BY w.name`,
        [productId],
      ));
  }

  async adjust(schema: string, input: AdjustInput) {
    if (!input.warehouseId || !input.productId) throw new BadRequestException('warehouseId and productId are required');
    const qty = Number(input.quantity);
    if (isNaN(qty)) throw new BadRequestException('Invalid quantity');
    return this.cm.executeInTransaction(schema, async (qr) => {
      const existing = firstRow(await qr.query(
        `SELECT quantity FROM "${schema}".erp_stock WHERE warehouse_id=$1 AND product_id=$2 AND variant_id IS NULL FOR UPDATE`,
        [input.warehouseId, input.productId],
      ));
      const current = existing ? Number(existing.quantity) : 0;
      const next = input.mode === 'delta' ? current + qty : qty;
      if (next < 0) throw new BadRequestException('Resulting stock cannot be negative');
      const delta = next - current;
      await qr.query(
        `INSERT INTO "${schema}".erp_stock (warehouse_id, product_id, quantity)
         VALUES ($1,$2,$3)
         ON CONFLICT (warehouse_id, product_id, variant_id) DO UPDATE SET quantity = $3, updated_at = NOW()`,
        [input.warehouseId, input.productId, next],
      );
      if (delta !== 0) {
        await qr.query(
          `INSERT INTO "${schema}".erp_stock_movements (warehouse_id, product_id, quantity_delta, type, note)
           VALUES ($1,$2,$3,'adjust',$4)`,
          [input.warehouseId, input.productId, delta, input.note ?? null],
        );
      }
      return { warehouseId: input.warehouseId, productId: input.productId, quantity: next };
    });
  }

  async transfer(schema: string, input: TransferInput) {
    const qty = Number(input.quantity);
    if (!(qty > 0)) throw new BadRequestException('Transfer quantity must be positive');
    if (input.fromWarehouseId === input.toWarehouseId) throw new BadRequestException('Choose two different warehouses');
    return this.cm.executeInTransaction(schema, async (qr) => {
      const src = firstRow(await qr.query(
        `SELECT quantity FROM "${schema}".erp_stock WHERE warehouse_id=$1 AND product_id=$2 AND variant_id IS NULL FOR UPDATE`,
        [input.fromWarehouseId, input.productId],
      ));
      const have = src ? Number(src.quantity) : 0;
      if (have < qty) throw new BadRequestException(`Not enough stock in source (have ${have})`);

      await qr.query(`UPDATE "${schema}".erp_stock SET quantity = quantity - $3, updated_at = NOW() WHERE warehouse_id=$1 AND product_id=$2 AND variant_id IS NULL`, [input.fromWarehouseId, input.productId, qty]);
      await qr.query(
        `INSERT INTO "${schema}".erp_stock (warehouse_id, product_id, quantity) VALUES ($1,$2,$3)
         ON CONFLICT (warehouse_id, product_id, variant_id) DO UPDATE SET quantity = "${schema}".erp_stock.quantity + $3, updated_at = NOW()`,
        [input.toWarehouseId, input.productId, qty],
      );
      await qr.query(`INSERT INTO "${schema}".erp_stock_movements (warehouse_id, product_id, quantity_delta, type, note) VALUES ($1,$2,$3,'transfer_out',$4)`, [input.fromWarehouseId, input.productId, -qty, input.note ?? null]);
      await qr.query(`INSERT INTO "${schema}".erp_stock_movements (warehouse_id, product_id, quantity_delta, type, note) VALUES ($1,$2,$3,'transfer_in',$4)`, [input.toWarehouseId, input.productId, qty, input.note ?? null]);
      return { ok: true, moved: qty };
    });
  }
}

@Controller('erp/stock')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class StockController {
  constructor(private readonly service: StockService) {}
  @Get() @Roles('owner', 'seller')
  byWarehouse(@Req() req: Request, @Query('warehouseId') warehouseId: string) { return this.service.byWarehouse(req.tenantContext.schemaName, warehouseId); }
  @Get('overview') @Roles('owner', 'seller')
  overview(@Req() req: Request, @Query('productId') productId: string) { return this.service.overview(req.tenantContext.schemaName, productId); }
  @Post('adjust') @Roles('owner', 'seller')
  adjust(@Req() req: Request, @Body() body: AdjustInput) { return this.service.adjust(req.tenantContext.schemaName, body); }
  @Post('transfer') @Roles('owner', 'seller')
  transfer(@Req() req: Request, @Body() body: TransferInput) { return this.service.transfer(req.tenantContext.schemaName, body); }
}
