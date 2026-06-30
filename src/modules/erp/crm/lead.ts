import { Injectable, Controller, UseGuards, Post, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';
import { BaseErpCrudController } from '../common/base-erp-crud.controller';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { firstRow } from '../common/sql-result.util';

const LEAD_COLS = ['first_name', 'last_name', 'company', 'job_title', 'email', 'phone', 'address', 'country', 'source', 'status', 'notes'];

@Injectable()
export class LeadService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'leads',
    insertable: LEAD_COLS,
    updatable: [...LEAD_COLS, 'converted_customer_id'],
    searchable: ['first_name', 'last_name', 'company', 'email', 'phone'],
    filterable: ['status'],
    defaultOrderBy: 'created_at',
    softDelete: true,
  };

  constructor(cm: TenantConnectionManager) {
    super(cm);
  }

  /** Convert a lead into a customer (idempotent) and mark it converted. */
  async convertToCustomer(schema: string, leadId: string): Promise<{ customerId: string; alreadyConverted: boolean }> {
    return this.cm.executeInTransaction(schema, async (qr) => {
      const lead = firstRow(await qr.query(`SELECT * FROM "${schema}".leads WHERE id = $1 AND removed = false`, [leadId]));
      if (!lead) throw new Error('Lead not found');
      if (lead.converted_customer_id) return { customerId: lead.converted_customer_id, alreadyConverted: true };

      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
      // Customers are keyed by phone; reuse an existing one if the phone matches.
      let customer = lead.phone
        ? firstRow(await qr.query(`SELECT id FROM "${schema}".customers WHERE phone = $1`, [lead.phone]))
        : null;
      if (!customer) {
        customer = firstRow(await qr.query(
          `INSERT INTO "${schema}".customers (phone, name, email, company, is_erp_client)
           VALUES ($1, $2, $3, $4, true) RETURNING id`,
          [lead.phone || `lead-${leadId.slice(0, 8)}`, name || 'New Client', lead.email ?? null, lead.company ?? null],
        ));
      }
      await qr.query(`UPDATE "${schema}".leads SET status = 'converted', converted_customer_id = $1, updated_at = NOW() WHERE id = $2`, [customer.id, leadId]);
      return { customerId: customer.id, alreadyConverted: false };
    });
  }
}

@Controller('erp/leads')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class LeadController extends BaseErpCrudController {
  constructor(protected readonly service: LeadService) {
    super();
  }

  @Post(':id/convert')
  @Roles('owner', 'seller')
  convert(@Req() req: Request, @Param('id') id: string) {
    return this.service.convertToCustomer(req.tenantContext.schemaName, id);
  }
}
