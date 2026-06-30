import { Controller, Post, Param, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PlanFeatureService } from '../erp/common/plan-feature.service';
import { ErpReminderService } from './erp-reminder.service';

/**
 * Panel-triggered WhatsApp payment reminders. Lives in the WhatsApp module (which
 * owns the WABA send path); routes are namespaced under /erp/reminders. ERP access
 * is checked inline via PlanFeatureService (avoids guard wiring across modules).
 */
@Controller('erp/reminders')
@UseGuards(TenantGuard)
export class ErpReminderController {
  constructor(
    private readonly reminders: ErpReminderService,
    private readonly planFeatures: PlanFeatureService,
  ) {}

  private async assertErp(tenantId: string) {
    if (!(await this.planFeatures.isErpEnabled(tenantId))) throw new ForbiddenException('ERP is not enabled on your plan');
  }

  @Post('run')
  @Roles('owner', 'seller')
  async run(@Req() req: Request) {
    await this.assertErp(req.tenantContext.id);
    return this.reminders.remindOverdue(req.tenantContext.id, req.tenantContext.schemaName);
  }

  @Post('invoice/:id')
  @Roles('owner', 'seller')
  async one(@Req() req: Request, @Param('id') id: string) {
    await this.assertErp(req.tenantContext.id);
    return this.reminders.remindInvoice(req.tenantContext.id, req.tenantContext.schemaName, id);
  }
}
