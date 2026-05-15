import { Controller, Get, Post, Patch, Param, Body, Query, BadRequestException, Logger } from '@nestjs/common';
import { WabaService } from './waba.service';
import { PhoneNumberService } from './phone-number.service';
import { MetaTokenService } from './meta-token.service';
import { MetaCloudApiClient } from './meta-cloud-api.client';
import { AuditLogService } from './audit-log.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { SystemTokenService } from './embedded-signup/system-token.service';
import { WabaAllocationService } from './allocation/waba-allocation.service';
import { WabaHealthMonitorService } from './allocation/waba-health-monitor.service';
import { RiskScoringService } from './risk/risk-scoring.service';
import { ConversationAccountingService } from './accounting/conversation-accounting.service';
import {
  CreateWabaDto,
  AssignPhoneDto,
  RegisterPhoneDto,
  RequestCodeDto,
  VerifyCodeDto,
  StoreTokenDto,
  SyncWabaDto,
} from './dto/create-waba.dto';

@Controller('admin/waba')
export class WabaController {
  private readonly logger = new Logger(WabaController.name);

  constructor(
    private readonly wabaService: WabaService,
    private readonly phoneService: PhoneNumberService,
    private readonly tokenService: MetaTokenService,
    private readonly metaApi: MetaCloudApiClient,
    private readonly auditService: AuditLogService,
    private readonly onboardingService: OnboardingService,
    private readonly systemTokenService: SystemTokenService,
    private readonly allocationService: WabaAllocationService,
    private readonly healthMonitor: WabaHealthMonitorService,
    private readonly riskService: RiskScoringService,
    private readonly accountingService: ConversationAccountingService,
  ) {}

  // ─── WABA Accounts ──────────────────────────────────────────────────────────

  @Get('accounts')
  async listAccounts() {
    return this.wabaService.findAll();
  }

  @Get('accounts/:id')
  async getAccount(@Param('id') id: string) {
    return this.wabaService.findById(id);
  }

  @Post('accounts')
  async createAccount(@Body() dto: CreateWabaDto) {
    const waba = await this.wabaService.create(dto);
    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: 'waba.create',
      resourceType: 'waba_account',
      resourceId: waba.id,
      details: { wabaId: dto.wabaId },
    });
    return waba;
  }

  @Post('accounts/sync')
  async syncFromMeta(@Body() dto: SyncWabaDto) {
    const wabaInfo = await this.metaApi.getWabaInfo(dto.wabaId, dto.accessToken);
    const waba = await this.wabaService.syncFromMeta(dto.wabaId, wabaInfo);

    // Store the token
    await this.tokenService.storeToken(waba.id, dto.accessToken, 'system_user');

    // Sync phone numbers
    const phones = await this.metaApi.getPhoneNumbers(dto.wabaId, dto.accessToken);
    for (const phoneData of phones) {
      await this.phoneService.syncFromMeta(waba.id, phoneData);
    }

    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: 'waba.sync',
      resourceType: 'waba_account',
      resourceId: waba.id,
      details: { phonesSync: phones.length },
    });

    return this.wabaService.findById(waba.id);
  }

  // ─── Phone Numbers ──────────────────────────────────────────────────────────

  @Get('phones')
  async listPhones(@Query('wabaAccountId') wabaAccountId?: string) {
    return this.phoneService.findAll(wabaAccountId);
  }

  @Get('phones/:id')
  async getPhone(@Param('id') id: string) {
    return this.phoneService.findById(id);
  }

  @Post('phones/:id/assign')
  async assignPhone(@Param('id') id: string, @Body() dto: AssignPhoneDto) {
    const phone = await this.phoneService.assignToTenant(id, dto.tenantId);
    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: 'phone.assign',
      resourceType: 'phone_number',
      resourceId: id,
      details: { tenantId: dto.tenantId },
    });
    return phone;
  }

  @Post('phones/:id/unassign')
  async unassignPhone(@Param('id') id: string) {
    const phone = await this.phoneService.unassignFromTenant(id);
    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: 'phone.unassign',
      resourceType: 'phone_number',
      resourceId: id,
    });
    return phone;
  }

  @Patch('phones/:id/status')
  async updatePhoneStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'inactive' }) {
    if (!['active', 'inactive'].includes(body.status)) {
      throw new BadRequestException('Status must be "active" or "inactive"');
    }
    const phone = await this.phoneService.updateStatus(id, body.status);
    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: body.status === 'active' ? 'phone.activate' : 'phone.deactivate',
      resourceType: 'phone_number',
      resourceId: id,
      details: { status: body.status },
    });
    return phone;
  }

  @Post('phones/:id/register')
  async registerPhone(@Param('id') id: string, @Body() dto: RegisterPhoneDto) {
    const phone = await this.phoneService.register(id, dto.pin);
    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: 'phone.register',
      resourceType: 'phone_number',
      resourceId: id,
    });
    return phone;
  }

  @Post('phones/:id/request-code')
  async requestCode(@Param('id') id: string, @Body() dto: RequestCodeDto) {
    await this.phoneService.requestVerificationCode(id, dto.codeMethod);
    return { message: 'Verification code sent' };
  }

  @Post('phones/:id/verify-code')
  async verifyCode(@Param('id') id: string, @Body() dto: VerifyCodeDto) {
    return this.phoneService.verifyCode(id, dto.code);
  }

  /**
   * Super admin: register a phone number for a specific tenant under the platform WABA.
   */
  @Post('phones/register-for-tenant')
  async registerForTenant(@Body() body: { phone: string; tenantId: string }) {
    const result = await this.onboardingService.registerNumber(body.tenantId, body.phone);
    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: 'phone.register_for_tenant',
      resourceType: 'phone_number',
      resourceId: result.phoneId || body.phone,
      details: { tenantId: body.tenantId, status: result.status },
    });
    return result;
  }

  // ─── Tokens ─────────────────────────────────────────────────────────────────

  @Post('tokens')
  async storeToken(@Body() dto: StoreTokenDto) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    await this.tokenService.storeToken(dto.wabaAccountId, dto.token, dto.tokenType || 'system_user', expiresAt);
    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: 'token.store',
      resourceType: 'meta_token',
      resourceId: dto.wabaAccountId,
      details: { tokenType: dto.tokenType },
    });
    return { message: 'Token stored successfully' };
  }

  @Post('tokens/:wabaAccountId/rotate')
  async rotateToken(@Param('wabaAccountId') wabaAccountId: string, @Body() body: { token: string }) {
    await this.tokenService.rotateToken(wabaAccountId, body.token);
    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: 'token.rotate',
      resourceType: 'meta_token',
      resourceId: wabaAccountId,
    });
    return { message: 'Token rotated successfully' };
  }

  /**
   * Regenerate the system user token with updated scopes (including catalog_management).
   * Uses an admin user token to generate a new system user token.
   * Call this after enabling catalog_management on your Facebook App.
   */
  @Post('tokens/:wabaAccountId/refresh-scopes')
  async refreshTokenScopes(
    @Param('wabaAccountId') wabaAccountId: string,
    @Body() body: { adminToken: string },
  ) {
    if (!body.adminToken) {
      throw new BadRequestException(
        'adminToken is required. Use a user access token with admin permissions on the Business.',
      );
    }

    const waba = await this.wabaService.findById(wabaAccountId);
    if (!waba) throw new BadRequestException('WABA account not found');

    // Generate new system user token with all scopes including catalog_management
    const result = await this.systemTokenService.generateSystemUserToken(
      body.adminToken,
      waba.businessId,
      waba.wabaId,
    );

    // Store the new token (deactivates old one)
    await this.tokenService.storeToken(wabaAccountId, result.token, 'system_user');

    await this.auditService.log({
      actorType: 'admin',
      actorId: 'system',
      action: 'token.refresh_scopes',
      resourceType: 'meta_token',
      resourceId: wabaAccountId,
      details: { isSystemUser: result.isSystemUser, scopes: 'whatsapp_business_management,whatsapp_business_messaging,catalog_management' },
    });

    this.logger.log(`Token refreshed with catalog_management scope for WABA ${wabaAccountId}`);
    return {
      message: 'Token regenerated with catalog_management scope',
      isSystemUser: result.isSystemUser,
    };
  }

  // ─── Audit Logs ─────────────────────────────────────────────────────────────

  @Get('audit-logs')
  async getAuditLogs(
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (tenantId) {
      const [logs, total] = await this.auditService.findByTenant(
        tenantId,
        limit ? parseInt(limit) : 50,
        offset ? parseInt(offset) : 0,
      );
      return { data: logs, total };
    }
    const [logs, total] = await this.auditService.findByTenant(
      undefined as any,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
    return { data: logs, total };
  }

  // ─── WABA Pool / Allocation ─────────────────────────────────────────────────

  @Get('pool/status')
  async getPoolStatus() {
    return this.allocationService.getPoolStatus();
  }

  @Get('health/summary')
  async getHealthSummary() {
    return this.healthMonitor.getHealthSummary();
  }

  // ─── Risk Management ────────────────────────────────────────────────────────

  @Get('risk/summary')
  async getRiskSummary() {
    return this.riskService.getRiskSummary();
  }

  @Get('risk/tenant/:tenantId')
  async getTenantRisk(@Param('tenantId') tenantId: string) {
    return this.riskService.getTenantRisk(tenantId);
  }

  @Post('risk/tenant/:tenantId/score')
  async scoreTenant(@Param('tenantId') tenantId: string) {
    return this.riskService.scoreTenant(tenantId);
  }

  // ─── Usage / Accounting ─────────────────────────────────────────────────────

  @Get('usage/:tenantId')
  async getTenantUsage(
    @Param('tenantId') tenantId: string,
    @Query('period') period?: string,
  ) {
    return this.accountingService.getDetailedUsage(tenantId, period);
  }

  @Post('usage/:tenantId/reconcile')
  async reconcileUsage(
    @Param('tenantId') tenantId: string,
    @Body() body: { billingPeriod: string },
  ) {
    return this.accountingService.reconcileMonth(tenantId, body.billingPeriod);
  }

  @Get('quota/:tenantId')
  async getTenantQuota(@Param('tenantId') tenantId: string) {
    return this.accountingService.getQuotaStatus(tenantId);
  }
}
