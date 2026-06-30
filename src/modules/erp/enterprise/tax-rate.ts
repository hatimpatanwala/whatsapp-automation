import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['name', 'rate', 'is_default', 'enabled'];

@Injectable()
export class TaxRateService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'erp_tax_rates', insertable: COLS, updatable: COLS,
    searchable: ['name'], defaultOrderBy: 'name', softDelete: true,
  };
  constructor(cm: TenantConnectionManager) { super(cm); }
}

@Controller('erp/tax-rates')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class TaxRateController extends BaseErpCrudController {
  constructor(protected readonly service: TaxRateService) { super(); }
}
