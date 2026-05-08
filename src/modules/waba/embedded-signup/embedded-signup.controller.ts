import { Controller, Get, Post, Body, Req, Param, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { EmbeddedSignupService } from './embedded-signup.service';
import { CoexistenceService } from './coexistence.service';
import { WebhookSubscriptionService } from './webhook-subscription.service';

@Controller('onboarding/embedded-signup')
export class EmbeddedSignupController {
  constructor(
    private readonly signupService: EmbeddedSignupService,
    private readonly coexistenceService: CoexistenceService,
    private readonly webhookService: WebhookSubscriptionService,
  ) {}

  /**
   * Get Facebook SDK config for embedded signup button.
   */
  @Get('config')
  async getConfig() {
    return this.signupService.getEmbeddedSignupConfig();
  }

  /**
   * Process the callback after user completes Facebook Login (sessionInfoVersion:2).
   */
  @Post('callback')
  async processCallback(@Req() req: Request, @Body() body: {
    code: string;
    phoneNumberId?: string;
    wabaId?: string;
    sessionInfo?: Record<string, any>;
  }) {
    const tenantId = (req.session as any).tenantId;
    if (!tenantId) throw new UnauthorizedException('Not authenticated');
    return this.signupService.processSignupCallback(tenantId, body);
  }

  /**
   * Get the status of an embedded signup session.
   */
  @Get('session/:sessionId')
  async getSessionStatus(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const tenantId = (req.session as any).tenantId;
    if (!tenantId) throw new UnauthorizedException('Not authenticated');
    return this.signupService.getSessionStatus(sessionId, tenantId);
  }

  /**
   * Get the latest embedded signup session for the tenant.
   */
  @Get('session')
  async getLatestSession(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    if (!tenantId) throw new UnauthorizedException('Not authenticated');
    return this.signupService.getLatestSession(tenantId);
  }

  // ─── Coexistence endpoints ──────────────────────────────────────────

  /**
   * Get active coexistence session for the tenant.
   */
  @Get('coexistence')
  async getCoexistenceSession(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    if (!tenantId) throw new UnauthorizedException('Not authenticated');
    return this.coexistenceService.getActiveSession(tenantId);
  }

  /**
   * Get coexistence session status by ID.
   */
  @Get('coexistence/:sessionId')
  async getCoexistenceStatus(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const tenantId = (req.session as any).tenantId;
    if (!tenantId) throw new UnauthorizedException('Not authenticated');
    return this.coexistenceService.getSessionStatus(sessionId, tenantId);
  }

  /**
   * Record user consent for coexistence mode.
   */
  @Post('coexistence/:sessionId/consent')
  async consentCoexistence(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const tenantId = (req.session as any).tenantId;
    if (!tenantId) throw new UnauthorizedException('Not authenticated');
    return this.coexistenceService.recordConsent(sessionId, tenantId);
  }

  /**
   * Start full migration from coexistence to exclusive Cloud API.
   */
  @Post('coexistence/:sessionId/migrate')
  async migrateFromCoexistence(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const tenantId = (req.session as any).tenantId;
    if (!tenantId) throw new UnauthorizedException('Not authenticated');
    return this.coexistenceService.startFullMigration(sessionId, tenantId);
  }
}
