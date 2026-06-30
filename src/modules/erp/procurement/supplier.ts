import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['company', 'contact_name', 'email', 'phone', 'gstin', 'address', 'bank_account', 'notes', 'enabled'];

@Injectable()
export class SupplierService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'suppliers',
    insertable: COLS,
    updatable: COLS,
    searchable: ['company', 'contact_name', 'email', 'phone', 'gstin'],
    defaultOrderBy: 'company',
    softDelete: true,
  };
  constructor(cm: TenantConnectionManager) {
    super(cm);
  }
}

@Controller('erp/suppliers')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class SupplierController extends BaseErpCrudController {
  constructor(protected readonly service: SupplierService) {
    super();
  }
}
