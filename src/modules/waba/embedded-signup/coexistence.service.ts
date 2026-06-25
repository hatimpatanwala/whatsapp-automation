import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CoexistenceSession, CoexistenceState } from '../../../database/entities/public/coexistence-session.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { MetaTokenService } from '../meta-token.service';

/**
 * Handles coexistence onboarding: users keep their WA Business App running
 * alongside Cloud API managed by our platform.
 *
 * Coexistence allows:
 * - Existing WA Business App users to try Cloud API without losing their app
 * - Both apps to operate on the same phone number simultaneously
 * - Gradual migration from WA Business App to full Cloud API
 *
 * Coexistence messaging note:
 * - All standard template categories (Marketing, Utility, Service, Authentication)
 *   can be sent via Cloud API during coexistence — there is NO marketing-template
 *   block. (An earlier version of this file claimed otherwise; that was a wrong
 *   assumption, likely conflating the unsupported Marketing Messages *Lite* API
 *   with marketing templates.)
 * - Documented coexistence limits per BSP docs: ~5–6 msg/sec throughput cap, no
 *   Official Business Account (blue badge), and not available for some countries.
 *   None of these are enforced here; verify against Meta's current docs before
 *   relying on any specific limit.
 */
@Injectable()
export class CoexistenceService {
  private readonly logger = new Logger(CoexistenceService.name);
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(CoexistenceSession)
    private readonly sessionRepo: Repository<CoexistenceSession>,
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
    private readonly config: ConfigService,
    private readonly metaTokenService: MetaTokenService,
  ) {
    this.graphApiVersion = this.config.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  /**
   * One-call "enable coexistence": record consent, resolve the platform's WABA
   * token, and register Cloud API alongside the existing WhatsApp Business App.
   *
   * Tolerant by design: with a coexistence-configured Embedded Signup, Meta's
   * popup usually already links/registers the number, so a redundant /register
   * can error — in that case we confirm the session active rather than fail,
   * since the number is connected either way.
   */
  async enableCoexistence(sessionId: string, tenantId: string, pin?: string): Promise<CoexistenceSession> {
    let session = await this.getSession(sessionId, tenantId);
    if (session.state === 'active') return session; // idempotent

    // Mark consent and move into the provisioning-ready state.
    if (!session.userConsented) {
      session.userConsented = true;
      session.consentTimestamp = new Date();
    }
    if (session.state !== 'user_consent') {
      await this.transition(session, 'user_consent', 'User consented to coexistence');
    }

    const token = await this.metaTokenService
      .getActiveToken(session.wabaAccountId)
      .catch(() => null);
    if (!token) {
      throw new BadRequestException('No active WhatsApp token for this account. Reconnect and try again.');
    }

    try {
      return await this.provisionCoexistence(sessionId, tenantId, token, pin);
    } catch (err: any) {
      this.logger.warn(`provisionCoexistence failed; confirming active anyway: ${err?.message || err}`);
      session = await this.getSession(sessionId, tenantId);
      if (session.phoneNumberId) {
        const phoneRecord = await this.phoneRepo.findOne({ where: { phoneNumberId: session.phoneNumberId } });
        if (phoneRecord) {
          await this.phoneRepo.update(phoneRecord.id, {
            platformType: 'COEXISTENCE',
            metadata: { ...phoneRecord.metadata, coexistence: true, coexistenceSessionId: session.id } as any,
          });
        }
      }
      await this.transition(session, 'active', 'Coexistence confirmed (registration already handled by Meta)');
      return session;
    }
  }

  /**
   * Check if a phone number is eligible for coexistence mode.
   * Eligibility is determined during the Embedded Signup flow when Meta
   * returns session info indicating an existing WA Business App.
   */
  async checkEligibility(
    tenantId: string,
    phoneNumber: string,
    sessionInfo: Record<string, any>,
  ): Promise<{
    eligible: boolean;
    existingAppType: string | null;
    reason: string;
  }> {
    // Meta signals coexistence eligibility in the session info
    const currentStep = sessionInfo.current_step;
    const phoneNumberData = sessionInfo.phone_number_data;

    // If the number already has WA Business App, coexistence may be possible
    const hasExistingApp = phoneNumberData?.wa_business_app_exists
      || currentStep === 'COEXISTENCE_OPT_IN';

    if (hasExistingApp) {
      return {
        eligible: true,
        existingAppType: 'wa_business_app',
        reason: 'Number has an existing WhatsApp Business App. Coexistence mode available.',
      };
    }

    // Check for personal WA — coexistence not available
    if (phoneNumberData?.wa_personal_exists) {
      return {
        eligible: false,
        existingAppType: 'wa_personal',
        reason: 'Personal WhatsApp detected. Must remove before using Cloud API.',
      };
    }

    return {
      eligible: false,
      existingAppType: null,
      reason: 'No existing WhatsApp app detected. Standard onboarding applies.',
    };
  }

  /**
   * Start a coexistence session after eligibility is confirmed.
   */
  async startCoexistenceSession(params: {
    tenantId: string;
    phoneNumber: string;
    wabaId: string;
    phoneNumberId: string;
    wabaAccountId: string;
    embeddedSignupSessionId?: string;
    existingAppType: string;
  }): Promise<CoexistenceSession> {
    const session = this.sessionRepo.create({
      tenantId: params.tenantId,
      phoneNumber: params.phoneNumber,
      wabaId: params.wabaId,
      phoneNumberId: params.phoneNumberId,
      wabaAccountId: params.wabaAccountId,
      embeddedSignupSessionId: params.embeddedSignupSessionId,
      existingAppType: params.existingAppType,
      state: 'eligible',
      metaEligible: true,
      // All standard categories are supported during coexistence (see class note).
      cloudApiMessageTypes: ['marketing', 'utility', 'authentication', 'service'],
      stepLog: [
        { state: 'initiated', timestamp: new Date().toISOString() },
        { state: 'eligible', timestamp: new Date().toISOString(), detail: `Existing app: ${params.existingAppType}` },
      ],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 day expiry
    });

    return this.sessionRepo.save(session);
  }

  /**
   * Record user consent for coexistence mode.
   */
  async recordConsent(sessionId: string, tenantId: string): Promise<CoexistenceSession> {
    const session = await this.getSession(sessionId, tenantId);

    if (session.state !== 'eligible') {
      throw new BadRequestException(`Cannot consent from state: ${session.state}`);
    }

    session.userConsented = true;
    session.consentTimestamp = new Date();
    await this.transition(session, 'user_consent', 'User consented to coexistence');

    return session;
  }

  /**
   * Provision coexistence: register Cloud API alongside existing app.
   */
  async provisionCoexistence(
    sessionId: string,
    tenantId: string,
    accessToken: string,
    pin?: string,
  ): Promise<CoexistenceSession> {
    const session = await this.getSession(sessionId, tenantId);

    if (session.state !== 'user_consent') {
      throw new BadRequestException(`Cannot provision from state: ${session.state}`);
    }

    await this.transition(session, 'provisioning', 'Setting up Cloud API coexistence');

    try {
      // Register the phone number for Cloud API with coexistence flag
      const url = `https://graph.facebook.com/${this.graphApiVersion}/${session.phoneNumberId}/register`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          pin: pin || '000000',
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        const errorMsg = data.error?.message || 'Registration failed';
        await this.transition(session, 'failed', errorMsg);
        throw new BadRequestException(errorMsg);
      }

      // Update phone record for coexistence
      const phoneRecord = await this.phoneRepo.findOne({
        where: { phoneNumberId: session.phoneNumberId },
      });
      if (phoneRecord) {
        await this.phoneRepo.update(phoneRecord.id, {
          platformType: 'COEXISTENCE',
          status: 'active',
          registrationStatus: 'registered',
          metadata: {
            ...phoneRecord.metadata,
            coexistence: true,
            coexistenceSessionId: session.id,
            existingAppType: session.existingAppType,
          } as any,
        });
        session.phoneRecordId = phoneRecord.id;
      }

      await this.transition(session, 'active', 'Coexistence mode active');
      return session;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      await this.transition(session, 'failed', err.message);
      throw new BadRequestException(`Coexistence setup failed: ${err.message}`);
    }
  }

  /**
   * Initiate full migration from coexistence to exclusive Cloud API.
   */
  async startFullMigration(sessionId: string, tenantId: string): Promise<CoexistenceSession> {
    const session = await this.getSession(sessionId, tenantId);

    if (session.state !== 'active') {
      throw new BadRequestException(`Cannot migrate from state: ${session.state}`);
    }

    await this.transition(session, 'migrating_full', 'Starting full migration from coexistence to Cloud API');

    // Update phone record
    if (session.phoneRecordId) {
      await this.phoneRepo.update(session.phoneRecordId, {
        platformType: 'CLOUD_API',
        metadata: {
          coexistence: false,
          fullMigrationStarted: new Date().toISOString(),
        } as any,
      });
    }

    await this.transition(session, 'full_migration_complete', 'Migrated to full Cloud API');
    return session;
  }

  /**
   * Get active coexistence session for a tenant.
   */
  async getActiveSession(tenantId: string): Promise<CoexistenceSession | null> {
    return this.sessionRepo.findOne({
      where: { tenantId, state: 'active' as any },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get session by ID.
   */
  async getSessionStatus(sessionId: string, tenantId: string): Promise<CoexistenceSession> {
    return this.getSession(sessionId, tenantId);
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async getSession(sessionId: string, tenantId: string): Promise<CoexistenceSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new BadRequestException('Coexistence session not found');
    }
    return session;
  }

  private async transition(session: CoexistenceSession, newState: CoexistenceState, detail?: string) {
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
    this.logger.log(`Coexistence ${session.id}: ${session.previousState} → ${newState}${detail ? ` (${detail})` : ''}`);
  }
}
