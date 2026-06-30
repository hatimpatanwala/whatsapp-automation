import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['name', 'description', 'ref', 'expense_category_id', 'supplier_id', 'amount', 'tax_amount', 'total', 'payment_mode_id', 'expense_date'];
const money = (n: any) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

@Injectable()
export class ExpenseService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'expenses',
    insertable: COLS,
    updatable: COLS,
    searchable: ['name', 'description', 'ref'],
    filterable: ['expense_category_id', 'supplier_id'],
    defaultOrderBy: 'expense_date',
    softDelete: true,
  };
  constructor(cm: TenantConnectionManager) {
    super(cm);
  }

  /** total = amount + tax_amount (computed server-side). */
  private withTotal(dto: Record<string, any>): Record<string, any> {
    if (dto.amount !== undefined || dto.tax_amount !== undefined) {
      dto.total = money(money(dto.amount) + money(dto.tax_amount));
    }
    return dto;
  }
  async create(schema: string, dto: Record<string, any>) {
    return super.create(schema, this.withTotal(dto));
  }
  async update(schema: string, id: string, dto: Record<string, any>) {
    return super.update(schema, id, this.withTotal(dto));
  }
}

@Controller('erp/expenses')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ExpenseController extends BaseErpCrudController {
  constructor(protected readonly service: ExpenseService) {
    super();
  }
}
