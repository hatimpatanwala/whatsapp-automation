import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException, Logger, Optional } from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { OnboardingService } from '../onboarding/onboarding.service';
import { ConversationAccountingService } from '../waba/accounting/conversation-accounting.service';

@Controller('settings')
@UseGuards(TenantGuard)
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private readonly tenantConn: TenantConnectionManager,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumberRepo: Repository<PhoneNumber>,
    private readonly onboardingService: OnboardingService,
    @Optional() private readonly accountingService?: ConversationAccountingService,
  ) {}

  @Get()
  @Roles('owner', 'seller')
  async getAll(@Req() req: Request) {
    return this.tenantConn.executeInTenantContext(req.tenantContext.schemaName, async (qr) => {
      const rows = await qr.query(`SELECT key, value FROM "${req.tenantContext.schemaName}".settings`);
      const settings: Record<string, any> = {};
      rows.forEach((r: any) => {
        try {
          settings[r.key] = JSON.parse(r.value);
        } catch {
          settings[r.key] = r.value;
        }
      });
      return settings;
    });
  }

  @Put()
  @Roles('owner')
  async update(@Req() req: Request, @Body() body: Record<string, any>) {
    return this.tenantConn.executeInTenantContext(req.tenantContext.schemaName, async (qr) => {
      for (const [key, value] of Object.entries(body)) {
        await qr.query(
          `INSERT INTO "${req.tenantContext.schemaName}".settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, JSON.stringify(value)],
        );
      }
      return { message: 'Settings updated' };
    });
  }

  @Put('allow-exceed')
  @Roles('owner')
  async updateAllowExceed(@Req() req: Request, @Body() body: { allowExceed: boolean }) {
    const tenantId = req.session?.['tenantId'] || req.tenantContext?.id;
    await this.subscriptionRepo.update(
      { tenantId, status: 'active' },
      { allowExceed: body.allowExceed },
    );
    return { message: 'Allow exceed updated', allowExceed: body.allowExceed };
  }

  /**
   * Get all phone numbers assigned to this tenant.
   */
  @Get('phones')
  @Roles('owner', 'seller')
  async getPhones(@Req() req: Request) {
    const tenantId = req.session?.['tenantId'] || (req as any).tenantContext?.id;
    return this.phoneNumberRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Add a phone number for this tenant.
   * Uses the same register-number flow as onboarding (checks Meta, registers under platform WABA).
   */
  @Post('phones')
  @Roles('owner')
  async addPhone(@Req() req: Request, @Body() body: { phone: string }) {
    const tenantId = req.session?.['tenantId'] || (req as any).tenantContext?.id;
    return this.onboardingService.registerNumber(tenantId, body.phone);
  }

  /**
   * Activate or deactivate a phone number for this tenant.
   */
  @Patch('phones/:id/status')
  @Roles('owner')
  async updatePhoneStatus(@Req() req: Request, @Param('id') phoneId: string, @Body() body: { status: 'active' | 'inactive' }) {
    if (!['active', 'inactive'].includes(body.status)) {
      throw new BadRequestException('Status must be "active" or "inactive"');
    }
    const tenantId = req.session?.['tenantId'] || (req as any).tenantContext?.id;
    const phone = await this.phoneNumberRepo.findOne({ where: { id: phoneId, tenantId } });
    if (!phone) {
      throw new BadRequestException('Phone number not found or not assigned to your account.');
    }
    await this.phoneNumberRepo.update(phoneId, { status: body.status });
    this.logger.log(`Phone ${phone.phoneNumber} status changed to ${body.status} by tenant ${tenantId}`);
    return { message: `Phone number ${body.status === 'active' ? 'activated' : 'deactivated'}`, status: body.status };
  }

  /**
   * Get usage and quota status for this tenant.
   */
  @Get('usage')
  @Roles('owner', 'seller')
  async getUsage(@Req() req: Request, @Query('period') period?: string) {
    const tenantId = req.session?.['tenantId'] || (req as any).tenantContext?.id;
    if (!this.accountingService) {
      return { message: 'Accounting service not available' };
    }
    const [usage, quota] = await Promise.all([
      this.accountingService.getDetailedUsage(tenantId, period),
      this.accountingService.getQuotaStatus(tenantId),
    ]);
    return { usage, quota };
  }

  /**
   * Remove a phone number from this tenant.
   */
  @Delete('phones/:id')
  @Roles('owner')
  async removePhone(@Req() req: Request, @Param('id') phoneId: string) {
    const tenantId = req.session?.['tenantId'] || (req as any).tenantContext?.id;

    const phone = await this.phoneNumberRepo.findOne({ where: { id: phoneId, tenantId } });
    if (!phone) {
      throw new BadRequestException('Phone number not found or not assigned to your account.');
    }

    // Unassign from tenant (don't delete from pool — just remove tenant assignment)
    await this.phoneNumberRepo.update(phoneId, { tenantId: null as any });
    this.logger.log(`Phone ${phone.phoneNumber} removed from tenant ${tenantId}`);

    return { message: 'Phone number removed from your account.' };
  }

}
