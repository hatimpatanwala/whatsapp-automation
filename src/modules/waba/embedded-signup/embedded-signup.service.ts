import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { Tenant } from '../../../database/entities/public/tenant.entity';
import { EmbeddedSignupSession, EmbeddedSignupState } from '../../../database/entities/public/embedded-signup-session.entity';
import { WabaService } from '../waba.service';
import { PhoneNumberService } from '../phone-number.service';
import { MetaTokenService } from '../meta-token.service';
import { AuditLogService } from '../audit-log.service';
import { SystemTokenService } from './system-token.service';
import { WebhookSubscriptionService } from './webhook-subscription.service';
import { CoexistenceService } from './coexistence.service';
import { OnboardingRollbackService } from './onboarding-rollback.service';

/**
 * Handles Meta's Embedded Signup flow for WhatsApp Business.
 *
 * Enhanced flow with sessionInfoVersion:2:
 * 1. Frontend opens Facebook Login popup with whatsapp_business_management scope
 * 2. User grants permissions, selects/creates WABA and phone number
 * 3. Meta fires onSignupSuccess with session info (WABA ID, phone number ID)
 * 4. Frontend sends auth code + session info to backend
 * 5. We exchange code → short-lived token → long-lived token → system user token
 * 6. Sync WABA and phone numbers, detect coexistence eligibility
 * 7. Subscribe webhooks, store tokens, activate
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/embedded-signup
 */
@Injectable()
export class EmbeddedSignupService {
  private readonly logger = new Logger(EmbeddedSignupService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly configId: string;
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(EmbeddedSignupSession)
    private readonly sessionRepo: Repository<EmbeddedSignupSession>,
    private readonly wabaService: WabaService,
    private readonly phoneService: PhoneNumberService,
    private readonly tokenService: MetaTokenService,
    private readonly auditService: AuditLogService,
    private readonly systemTokenService: SystemTokenService,
    private readonly webhookService: WebhookSubscriptionService,
    private readonly coexistenceService: CoexistenceService,
    private readonly rollbackService: OnboardingRollbackService,
    private readonly configService: ConfigService,
  ) {
    this.appId = this.configService.get<string>('META_APP_ID', '');
    this.appSecret = this.configService.get<string>('META_APP_SECRET', '');
    this.configId = this.configService.get<string>('META_EMBEDDED_SIGNUP_CONFIG_ID', '');
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  /**
   * Get the config needed by the frontend to initialize Facebook Login SDK.
   */
  getEmbeddedSignupConfig() {
    return {
      appId: this.appId,
      configId: this.configId,
      version: this.graphApiVersion,
      loginParams: {
        scope: 'whatsapp_business_management,whatsapp_business_messaging,catalog_management',
        extras: {
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: 3,
        },
      },
    };
  }

  /**
   * Process the callback from Meta's Embedded Signup (sessionInfoVersion:3).
   * Called after the user completes the Facebook Login popup.
   *
   * The frontend sends us:
   * - code: the auth code from FB.getLoginStatus()
   * - sessionInfo: data from the onSignupSuccess callback (WABA ID, phone number ID, etc.)
   */
  async processSignupCallback(tenantId: string, data: {
    code: string;
    phoneNumberId?: string;
    wabaId?: string;
    sessionInfo?: Record<string, any>;
    redirectUri?: string;
  }): Promise<{
    success: boolean;
    message: string;
    phoneNumber?: string;
    wabaId?: string;
    sessionId?: string;
    isCoexistence?: boolean;
    coexistenceSessionId?: string;
  }> {
    this.logger.log(`Processing Embedded Signup for tenant ${tenantId}`);

    // Create tracking session
    const session = this.sessionRepo.create({
      tenantId,
      state: 'initiated',
      rawSessionInfo: data.sessionInfo || {},
      stepLog: [{ state: 'initiated', timestamp: new Date().toISOString() }],
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2h expiry
    });
    await this.sessionRepo.save(session);
    let finalToken: string | undefined;

    try {
      // Step 1: Exchange auth code for access token
      await this.transition(session, 'code_received');
      session.authCodeHash = createHash('sha256').update(data.code).digest('hex').substring(0, 64);

      const tokenResult = await this.exchangeCodeForToken(data.code, data.redirectUri);
      if (!tokenResult.access_token) {
        await this.transition(session, 'failed', 'Failed to get access token from Meta');
        throw new BadRequestException('Failed to get access token from Meta');
      }

      const userToken = tokenResult.access_token;
      await this.transition(session, 'token_exchanged');

      // Step 2: Extract WABA/phone IDs from sessionInfo (v2) or fallback
      let wabaId = data.sessionInfo?.waba_id || data.wabaId;
      let phoneNumberId = data.sessionInfo?.phone_number_id || data.phoneNumberId;

      // Step 3: If not provided, discover from token scopes
      if (!wabaId) {
        const sharedWabas = await this.fetchSharedWabas(userToken);
        if (sharedWabas.length === 0) {
          await this.transition(session, 'failed', 'No WABA found');
          throw new BadRequestException('No WhatsApp Business Account found. Please complete the signup process.');
        }
        wabaId = sharedWabas[0].id;
      }

      session.wabaId = wabaId;
      session.phoneNumberId = phoneNumberId || null;

      // Step 4: Sync the WABA
      const wabaInfo = await this.fetchGraphApi(`/${wabaId}`, userToken, {
        fields: 'name,status,business_verification_status,on_behalf_of_business_info,primary_funding_id',
      });
      const waba = await this.wabaService.syncFromMeta(wabaId, wabaInfo);
      session.wabaAccountId = waba.id;
      session.businessId = wabaInfo.on_behalf_of_business_info?.id || null;
      await this.transition(session, 'waba_synced');

      // Step 5: Generate system user token (long-lived, non-expiring)
      finalToken = userToken;
      try {
        const longLived = await this.systemTokenService.exchangeForLongLivedToken(userToken);
        const systemResult = await this.systemTokenService.generateSystemUserToken(
          longLived.access_token,
          session.businessId || '',
          wabaId,
        );
        finalToken = systemResult.token;

        await this.tokenService.storeToken(waba.id, finalToken,
          systemResult.isSystemUser ? 'system_user' : 'long_lived_user',
        );
        await this.transition(session, 'system_token_generated',
          systemResult.isSystemUser ? 'System user token' : 'Long-lived user token (fallback)',
        );
      } catch (tokenErr: any) {
        // Fallback: store the user token
        this.logger.warn(`System token generation failed, using user token: ${tokenErr.message}`);
        await this.tokenService.storeToken(waba.id, userToken, 'embedded_signup');
        await this.transition(session, 'system_token_generated', 'User token (fallback)');
      }

      // Step 6: Fetch and sync phone numbers
      const phones = await this.fetchGraphApi(`/${wabaId}/phone_numbers`, finalToken, {
        fields: 'id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,is_official_business_account',
      });

      let assignedPhone: any = null;
      for (const phoneData of phones.data || []) {
        const phone = await this.phoneService.syncFromMeta(waba.id, phoneData);
        if (!assignedPhone || phoneData.id === phoneNumberId) {
          await this.phoneService.assignToTenant(phone.id, tenantId);
          assignedPhone = phone;
          phoneNumberId = phoneData.id;
        }
      }
      session.phoneNumberId = phoneNumberId || null;
      session.phoneRecordId = assignedPhone?.id || null;
      await this.transition(session, 'phone_synced');

      // Step 7: Check for coexistence
      let isCoexistence = false;
      let coexistenceSessionId: string | undefined;

      if (data.sessionInfo) {
        const coexCheck = await this.coexistenceService.checkEligibility(
          tenantId,
          assignedPhone?.phoneNumber || '',
          data.sessionInfo,
        );

        if (coexCheck.eligible) {
          isCoexistence = true;
          session.isCoexistence = true;
          session.detectedPlatform = coexCheck.existingAppType;

          const coexSession = await this.coexistenceService.startCoexistenceSession({
            tenantId,
            phoneNumber: assignedPhone?.phoneNumber || '',
            wabaId,
            phoneNumberId: phoneNumberId || '',
            wabaAccountId: waba.id,
            embeddedSignupSessionId: session.id,
            existingAppType: coexCheck.existingAppType || 'unknown',
          });
          coexistenceSessionId = coexSession.id;
        }
      }

      // Step 8: Subscribe to webhooks
      await this.webhookService.subscribeWaba(waba.id, wabaId, finalToken);
      await this.transition(session, 'webhook_subscribed');

      // Step 9: Update tenant record (token resolved via MetaTokenService, NOT stored in plain text)
      await this.tenantRepo.update(tenantId, {
        phoneNumberId: phoneNumberId || '',
        wabaId,
        onboardingStatus: 'whatsapp_connected',
      });

      // Step 10: Complete
      await this.transition(session, 'completed');

      await this.auditService.log({
        tenantId,
        actorType: 'tenant_user',
        actorId: tenantId,
        action: 'embedded_signup.complete',
        resourceType: 'waba_account',
        resourceId: waba.id,
        details: {
          wabaId,
          phoneNumberId,
          isCoexistence,
          sessionId: session.id,
        },
      });

      this.logger.log(`Embedded Signup completed for tenant ${tenantId}: WABA ${wabaId}${isCoexistence ? ' (coexistence)' : ''}`);

      return {
        success: true,
        message: isCoexistence
          ? 'WhatsApp Business connected in coexistence mode! Your existing WA Business App continues working.'
          : 'WhatsApp Business connected successfully!',
        phoneNumber: assignedPhone?.phoneNumber,
        wabaId,
        sessionId: session.id,
        isCoexistence,
        coexistenceSessionId,
      };
    } catch (err: any) {
      if (session.state !== 'failed') {
        await this.transition(session, 'failed', err.message);
      }
      // Rollback completed steps to prevent inconsistent state
      try {
        const rolledBack = await this.rollbackService.rollback(session, finalToken);
        if (rolledBack.length > 0) {
          this.logger.warn(`Onboarding rollback for session ${session.id}: reversed [${rolledBack.join(', ')}]`);
        }
      } catch (rollbackErr: any) {
        this.logger.error(`Onboarding rollback failed for session ${session.id}: ${rollbackErr.message}`);
      }
      throw err;
    }
  }

  /**
   * Get the status of an embedded signup session.
   */
  async getSessionStatus(sessionId: string, tenantId: string): Promise<EmbeddedSignupSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId },
    });
    if (!session) throw new BadRequestException('Session not found');
    return session;
  }

  /**
   * Get the latest signup session for a tenant.
   */
  async getLatestSession(tenantId: string): Promise<EmbeddedSignupSession | null> {
    return this.sessionRepo.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Resume a failed onboarding session from the last successful step.
   */
  async resumeOnboarding(sessionId: string, tenantId: string): Promise<{
    success: boolean;
    message: string;
    sessionId: string;
    resumedFrom: string;
  }> {
    const session = await this.getSessionStatus(sessionId, tenantId);

    if (session.state === 'completed') {
      return { success: true, message: 'Onboarding already completed', sessionId, resumedFrom: 'completed' };
    }
    if (session.state !== 'failed') {
      throw new BadRequestException(`Cannot resume from state: ${session.state}`);
    }
    if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
      throw new BadRequestException('Session expired. Please start a new onboarding flow.');
    }

    const resumeFrom = session.previousState || 'initiated';
    this.logger.log(`Resuming onboarding session ${sessionId} from state: ${resumeFrom}`);

    // Reset state to previous successful state
    session.state = resumeFrom as any;
    session.errorMessage = null;
    session.stepLog = [
      ...(session.stepLog || []),
      { state: 'resumed', timestamp: new Date().toISOString(), detail: `Resumed from ${resumeFrom}` },
    ];
    await this.sessionRepo.save(session);

    return {
      success: true,
      message: `Onboarding resumed from step: ${resumeFrom}. Please retry the signup.`,
      sessionId,
      resumedFrom: resumeFrom,
    };
  }

  /**
   * Expire stale signup sessions that passed their TTL.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions(): Promise<void> {
    const result = await this.sessionRepo.update(
      {
        state: Not(In(['completed', 'failed', 'expired'] as any[])),
        expiresAt: LessThan(new Date()),
      },
      { state: 'expired' as any },
    );
    if (result.affected) {
      this.logger.log(`Expired ${result.affected} stale signup sessions`);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────

  private async transition(session: EmbeddedSignupSession, newState: EmbeddedSignupState, detail?: string) {
    session.previousState = session.state;
    session.state = newState;
    session.stepLog = [
      ...(session.stepLog || []),
      { state: newState, timestamp: new Date().toISOString(), detail },
    ];
    if (newState === 'failed') {
      session.errorMessage = detail || null;
    }
    await this.sessionRepo.save(session);
    this.logger.log(`EmbeddedSignup ${session.id}: ${session.previousState} → ${newState}${detail ? ` (${detail})` : ''}`);
  }

  private async exchangeCodeForToken(code: string, _redirectUri?: string): Promise<any> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`;

    // Use POST with form body for the token exchange.
    // For FB JS SDK codes (response_type:'code' via FB.login()), Meta requires
    // grant_type=authorization_code and no redirect_uri (or empty string).
    const body = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      code,
      grant_type: 'authorization_code',
    });

    this.logger.debug(`Token exchange: POST ${url} (code length: ${code.length})`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await response.json();

    if (!response.ok) {
      this.logger.error(`Token exchange failed: ${JSON.stringify(data)}`);
      throw new BadRequestException((data as any).error?.message || 'Token exchange failed');
    }

    return data;
  }

  private async fetchSharedWabas(accessToken: string): Promise<any[]> {
    const data = await this.fetchGraphApi('/debug_token', accessToken, {
      input_token: accessToken,
    });
    const granularScopes = data.data?.granular_scopes || [];
    const wabaScope = granularScopes.find((s: any) => s.scope === 'whatsapp_business_management');
    if (wabaScope?.target_ids?.length) {
      return wabaScope.target_ids.map((id: string) => ({ id }));
    }

    const businesses = await this.fetchGraphApi('/me/businesses', accessToken, {
      fields: 'id,name',
    });
    const wabas: any[] = [];
    for (const biz of businesses.data || []) {
      const bizWabas = await this.fetchGraphApi(`/${biz.id}/owned_whatsapp_business_accounts`, accessToken, {
        fields: 'id,name',
      });
      wabas.push(...(bizWabas.data || []));
    }
    return wabas;
  }

  private async fetchGraphApi(path: string, accessToken: string, params?: Record<string, string>, method = 'GET'): Promise<any> {
    const url = new URL(`https://graph.facebook.com/${this.graphApiVersion}${path}`);
    if (params && method === 'GET') {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    url.searchParams.set('access_token', accessToken);

    const options: RequestInit = { method };
    if (method === 'POST' && params) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(params);
    }

    const response = await fetch(url.toString(), options);
    return response.json();
  }
}
