import { Injectable, Controller, UseGuards } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';

const COLS = ['name', 'type', 'account_number', 'bank_name', 'opening_balance', 'current_balance', 'is_default', 'enabled'];

@Injectable()
export class BankAccountService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'bank_accounts', insertable: COLS, updatable: COLS,
    searchable: ['name', 'bank_name', 'account_number'], defaultOrderBy: 'name', softDelete: true,
  };
  constructor(cm: TenantConnectionManager) { super(cm); }

  async create(schema: string, dto: Record<string, any>) {
    // A new account's current balance starts at its opening balance.
    if (dto.current_balance === undefined && dto.opening_balance !== undefined) dto.current_balance = dto.opening_balance;
    return super.create(schema, dto);
  }
}

@Controller('erp/bank-accounts')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class BankAccountController extends BaseErpCrudController {
  constructor(protected readonly service: BankAccountService) { super(); }
}
