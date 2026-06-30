import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['name', 'registration_number', 'tax_number', 'email', 'phone', 'website', 'industry', 'address', 'country', 'enabled'];

@Injectable()
export class CompanyService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'companies', insertable: COLS, updatable: COLS,
    searchable: ['name', 'email', 'phone', 'tax_number', 'industry'], defaultOrderBy: 'name', softDelete: true,
  };
  constructor(cm: TenantConnectionManager) { super(cm); }
}

@Controller('erp/companies')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class CompanyController extends BaseErpCrudController {
  constructor(protected readonly service: CompanyService) { super(); }
}
