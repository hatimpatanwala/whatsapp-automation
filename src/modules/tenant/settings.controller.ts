import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards, HttpCode, BadRequestException, Logger, Optional } from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { OnboardingService } from '../onboarding/onboarding.service';
import { AdminWhatsAppService } from '../onboarding/admin-whatsapp.service';
import { ConversationAccountingService } from '../waba/accounting/conversation-accounting.service';
import { CommerceSettingsHelper } from '../whatsapp/helpers/commerce-settings.helper';
import { MetaCatalogSyncService } from '../catalog/meta-catalog-sync.service';

@Controller('settings')
@UseGuards(TenantGuard)
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private readonly tenantConn: TenantConnectionManager,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumberRepo: Repository<PhoneNumber>,
    private readonly onboardingService: OnboardingService,
    private readonly adminWhatsAppService: AdminWhatsAppService,
    @Optional() private readonly commerceSettingsHelper?: CommerceSettingsHelper,
    @Optional() private readonly accountingService?: ConversationAccountingService,
    @Optional() private readonly catalogSyncService?: MetaCatalogSyncService,
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
    const result = await this.tenantConn.executeInTenantContext(req.tenantContext.schemaName, async (qr) => {
      for (const [key, value] of Object.entries(body)) {
        await qr.query(
          `INSERT INTO "${req.tenantContext.schemaName}".settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, JSON.stringify(value)],
        );
      }

      // Invalidate commerce settings cache if any commerce keys were updated
      const hasCommerceKey = Object.keys(body).some(k => k.startsWith('commerce_'));
      if (hasCommerceKey && this.commerceSettingsHelper) {
        await this.commerceSettingsHelper.invalidateCache(req.tenantContext.schemaName);
      }

      return { message: 'Settings updated' };
    });

    // Auto-provision Meta catalog when commerce is first enabled and no catalog ID exists yet
    if (body.commerce_catalog_enabled === true && this.catalogSyncService && this.commerceSettingsHelper) {
      const settings = await this.commerceSettingsHelper.getCommerceSettings(req.tenantContext.schemaName);
      if (!settings.catalogId) {
        const tenantId = req.session?.['tenantId'] || req.tenantContext?.id;
        this.catalogSyncService.provisionCatalog(tenantId).then((catalogId) => {
          if (catalogId) {
            this.logger.log(`Auto-provisioned Meta catalog ${catalogId} for tenant ${tenantId}`);
          } else {
            this.logger.log(`Meta catalog not provisioned for tenant ${tenantId} (no Meta permissions or WABA) — platform catalog will be used`);
          }
        }).catch((err) =>
          this.logger.warn(`Auto-provision catalog failed for tenant ${tenantId}: ${err.message}`),
        );
      }
    }

    return result;
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

    // Fully release: deregister + delete from our WABA at Meta, clear tenant
    // pointers, and hard-delete the local record so the number is free to use
    // on another account or platform.
    return this.onboardingService.releaseNumber(tenantId, phoneId);
  }

  /**
   * Manually trigger Meta catalog provisioning for this tenant.
   * Creates a catalog under the business, links it to the phone, and syncs all products.
   */
  @Post('commerce/provision-catalog')
  @Roles('owner')
  async provisionCatalog(@Req() req: Request) {
    if (!this.catalogSyncService) {
      throw new BadRequestException('Catalog sync service is not available.');
    }

    const tenantId = req.session?.['tenantId'] || req.tenantContext?.id;

    // Check if already has a catalog
    const settings = await this.commerceSettingsHelper?.getCommerceSettings(req.tenantContext.schemaName);
    if (settings?.catalogId) {
      return { catalogId: settings.catalogId, message: 'Catalog already provisioned.', alreadyExists: true };
    }

    const catalogId = await this.catalogSyncService.provisionCatalog(tenantId);
    if (!catalogId) {
      throw new BadRequestException(
        'Could not provision Meta catalog. Ensure your platform WABA has catalog_management permission. ' +
        'Commerce features will still work using platform catalog (interactive messages).',
      );
    }

    return { catalogId, message: 'Meta catalog created and linked to your WhatsApp number.' };
  }

  // ─── Admin WhatsApp Number (personal number for admin control) ─────────────

  /**
   * Get admin WhatsApp number status.
   */
  @Get('admin-whatsapp')
  @Roles('owner')
  async getAdminWhatsapp(@Req() req: Request) {
    const tenantId = req.session?.['tenantId'] || (req as any).tenantContext?.id;
    return this.adminWhatsAppService.getStatus(tenantId);
  }

  /**
   * Send OTP to admin's personal WhatsApp number.
   */
  @Post('admin-whatsapp/send-otp')
  @Roles('owner')
  @HttpCode(200)
  async sendAdminWhatsappOtp(@Req() req: Request, @Body() body: { phone: string }) {
    const tenantId = req.session?.['tenantId'] || (req as any).tenantContext?.id;
    return this.adminWhatsAppService.sendOtp(tenantId, body.phone);
  }

  /**
   * Verify OTP for admin's personal WhatsApp number.
   */
  @Post('admin-whatsapp/verify-otp')
  @Roles('owner')
  @HttpCode(200)
  async verifyAdminWhatsappOtp(@Req() req: Request, @Body() body: { phone: string; code: string }) {
    const tenantId = req.session?.['tenantId'] || (req as any).tenantContext?.id;
    return this.adminWhatsAppService.verifyOtp(tenantId, body.phone, body.code);
  }

  /**
   * Remove admin WhatsApp number.
   */
  @Delete('admin-whatsapp')
  @Roles('owner')
  async removeAdminWhatsapp(@Req() req: Request) {
    const tenantId = req.session?.['tenantId'] || (req as any).tenantContext?.id;
    return this.adminWhatsAppService.removeAdminWhatsapp(tenantId);
  }

}
