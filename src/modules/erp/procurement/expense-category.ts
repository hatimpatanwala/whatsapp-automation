import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['name', 'description', 'enabled'];

@Injectable()
export class ExpenseCategoryService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'expense_categories',
    insertable: COLS,
    updatable: COLS,
    searchable: ['name', 'description'],
    defaultOrderBy: 'name',
    softDelete: true,
  };
  constructor(cm: TenantConnectionManager) {
    super(cm);
  }
}

@Controller('erp/expense-categories')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ExpenseCategoryController extends BaseErpCrudController {
  constructor(protected readonly service: ExpenseCategoryService) {
    super();
  }
}
