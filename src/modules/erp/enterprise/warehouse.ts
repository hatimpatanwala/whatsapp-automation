import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['name', 'code', 'address', 'is_default', 'enabled'];

@Injectable()
export class WarehouseService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'erp_warehouses', insertable: COLS, updatable: COLS,
    searchable: ['name', 'code'], defaultOrderBy: 'name', softDelete: true,
  };
  constructor(cm: TenantConnectionManager) { super(cm); }
}

@Controller('erp/warehouses')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class WarehouseController extends BaseErpCrudController {
  constructor(protected readonly service: WarehouseService) { super(); }
}
