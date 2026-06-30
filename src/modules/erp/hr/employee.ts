import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['name', 'surname', 'email', 'phone', 'department', 'position', 'gender', 'birthday', 'address', 'urgent_contact', 'salary', 'status'];

@Injectable()
export class EmployeeService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'employees',
    insertable: COLS,
    updatable: COLS,
    searchable: ['name', 'surname', 'email', 'phone', 'department', 'position'],
    filterable: ['department', 'status'],
    defaultOrderBy: 'name',
    softDelete: true,
  };
  constructor(cm: TenantConnectionManager) {
    super(cm);
  }
}

@Controller('erp/employees')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class EmployeeController extends BaseErpCrudController {
  constructor(protected readonly service: EmployeeService) {
    super();
  }
}
