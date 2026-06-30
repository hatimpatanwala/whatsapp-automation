import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig, CrudListOptions } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['company_id', 'first_name', 'last_name', 'job_title', 'email', 'phone', 'notes', 'enabled'];

@Injectable()
export class PersonService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'people', insertable: COLS, updatable: COLS,
    searchable: ['first_name', 'last_name', 'email', 'phone', 'job_title'], defaultOrderBy: 'first_name', softDelete: true,
  };
  constructor(cm: TenantConnectionManager) { super(cm); }

  /** Override list to include the linked company's name for display. */
  async list(schema: string, opts: CrudListOptions = {}) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = (page - 1) * limit;
    const conditions = ['p.removed = false'];
    const params: any[] = [];
    if (opts.search) { params.push(`%${opts.search}%`); conditions.push(`(p.first_name ILIKE $1 OR p.last_name ILIKE $1 OR p.email ILIKE $1 OR p.phone ILIKE $1)`); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const total = parseInt((await qr.query(`SELECT COUNT(*)::int AS total FROM "${schema}".people p ${where}`, params))[0].total);
      const data = await qr.query(
        `SELECT p.*, c.name AS company_name FROM "${schema}".people p
         LEFT JOIN "${schema}".companies c ON c.id = p.company_id
         ${where} ORDER BY p.first_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }
}

@Controller('erp/people')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class PersonController extends BaseErpCrudController {
  constructor(protected readonly service: PersonService) { super(); }
}
