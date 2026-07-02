import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TeamService } from '../whatsapp/team.service';
import { StaffWhatsAppService } from '../whatsapp/staff-whatsapp.service';

/**
 * Owner-only team management. Add staff (accountant/employee/salesman) with a
 * WhatsApp number, then verify that number over WhatsApp so the bot recognises
 * them and shows a role-scoped menu.
 */
@Controller('team')
@UseGuards(TenantGuard)
@Roles('owner')
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly staffWa: StaffWhatsAppService,
  ) {}

  private schema(req: Request): string {
    return req.tenantContext!.schemaName;
  }
  private tenantId(req: Request): string {
    return req.tenantContext!.id;
  }

  @Get()
  list(@Req() req: Request) {
    return this.team.list(this.schema(req));
  }

  /** Effective team entitlement + usage (allowed roles, member limit, used) for the UI. */
  @Get('config')
  config(@Req() req: Request) {
    return this.team.getConfig(this.schema(req), this.tenantId(req));
  }

  @Post()
  async add(@Req() req: Request, @Body() body: { name: string; role: string; whatsappNumber: string; email?: string }) {
    const schema = this.schema(req);
    const member = await this.team.add(schema, this.tenantId(req), body);
    // Kick off WhatsApp verification immediately (best-effort — never 500 the add).
    const otp = await this.staffWa.sendOtp(schema, member).catch(() => ({ sent: false } as any));
    return { member, otpSent: !!otp.sent, staticCode: otp.staticCode };
  }

  @Post(':id/send-otp')
  async resendOtp(@Req() req: Request, @Param('id') id: string) {
    const schema = this.schema(req);
    const member = await this.team.findById(schema, id);
    if (!member) throw new NotFoundException('Team member not found.');
    const otp = await this.staffWa.sendOtp(schema, member);
    return { sent: !!otp.sent, staticCode: otp.staticCode };
  }

  @Patch(':id/role')
  updateRole(@Req() req: Request, @Param('id') id: string, @Body() body: { role: string }) {
    return this.team.updateRole(this.schema(req), this.tenantId(req), id, body?.role);
  }

  @Patch(':id/active')
  setActive(@Req() req: Request, @Param('id') id: string, @Body() body: { active: boolean }) {
    return this.team.setActive(this.schema(req), id, body?.active !== false);
  }
}
