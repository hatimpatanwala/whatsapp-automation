import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig, CrudListOptions } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['product_id', 'warehouse_id', 'type', 'batch_number', 'serial_number', 'mfg_date', 'expiry_date', 'quantity', 'cost_price', 'notes', 'enabled'];

/**
 * Batch / serial tracking — lots (mfg/expiry/qty) or serialised units, per product
 * and optionally per warehouse. List joins product + warehouse names for display.
 */
@Injectable()
export class BatchService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'product_batches', insertable: COLS, updatable: COLS,
    searchable: ['batch_number', 'serial_number'], filterable: ['product_id', 'type'],
    defaultOrderBy: 'created_at', softDelete: true,
  };
  constructor(cm: TenantConnectionManager) { super(cm); }

  async list(schema: string, opts: CrudListOptions = {}) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = (page - 1) * limit;
    const conditions = ['b.removed = false'];
    const params: any[] = [];
    if (opts.search) { params.push(`%${opts.search}%`); conditions.push(`(b.batch_number ILIKE $1 OR b.serial_number ILIKE $1)`); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const total = parseInt((await qr.query(`SELECT COUNT(*)::int AS total FROM "${schema}".product_batches b ${where}`, params))[0].total);
      const data = await qr.query(
        `SELECT b.*, p.name AS product_name, w.name AS warehouse_name
         FROM "${schema}".product_batches b
         LEFT JOIN "${schema}".products p ON p.id = b.product_id
         LEFT JOIN "${schema}".erp_warehouses w ON w.id = b.warehouse_id
         ${where} ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }
}

@Controller('erp/batches')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class BatchController extends BaseErpCrudController {
  constructor(protected readonly service: BatchService) { super(); }
}
