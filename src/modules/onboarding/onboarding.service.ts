import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomInt } from 'crypto';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { MetaToken } from '../../database/entities/public/meta-token.entity';
import { MetaTokenService } from '../waba/meta-token.service';
import { AuditLogService } from '../waba/audit-log.service';

export interface RegisterNumberResult {
  status: 'already_business' | 'already_occupied' | 'registered' | 'needs_verification';
  phone: string;
  message: string;
  phoneId?: string;
  needsVerification?: boolean;
  instructions?: string[];
}

export interface BusinessProfileDto {
  businessName: string;
  businessCategory: string;
  businessDescription?: string;
  businessAddress?: string;
  logoUrl?: string;
}

/**
 * Onboarding status progression (simplified):
 *   pending → whatsapp_connected → profile_complete → completed
 *
 * Architecture:
 *   - The PLATFORM owns the shared WABA (Business Phone System / BPS)
 *   - User provides their phone number
 *   - Platform registers that number under its shared WABA via Meta Cloud API
 *   - Number is assigned exclusively to the tenant (no other tenant can use it)
 *   - User does NOT need a Facebook/Meta account
 */
export type OnboardingStep = 'pending' | 'phone_verified' | 'whatsapp_connected' | 'profile_complete' | 'completed';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumberRepository: Repository<PhoneNumber>,
    @InjectRepository(MetaToken)
    private readonly metaTokenRepository: Repository<MetaToken>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccountRepository: Repository<WabaAccount>,
    private readonly metaTokenService: MetaTokenService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditLogService,
  ) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  async getStatus(tenantId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: [
        'id', 'onboardingStatus', 'whatsappPhone', 'phoneNumberId',
        'wabaId', 'businessName', 'businessCategory', 'businessDescription',
        'businessAddress', 'logoUrl', 'adminWhatsappNumber', 'adminWhatsappVerified',
      ],
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      currentStep: tenant.onboardingStatus as OnboardingStep,
      phone: tenant.whatsappPhone || null,
      hasWhatsAppConfig: !!tenant.phoneNumberId && !!tenant.wabaId,
      businessName: tenant.businessName || null,
      businessCategory: tenant.businessCategory || null,
      businessDescription: tenant.businessDescription || null,
      businessAddress: tenant.businessAddress || null,
      logoUrl: tenant.logoUrl || null,
      adminWhatsappNumber: tenant.adminWhatsappNumber || null,
      adminWhatsappVerified: tenant.adminWhatsappVerified || false,
    };
  }

  /**
   * Step 1: Register a phone number under the platform's shared WABA.
   *
   * Flow:
   * 1. Normalize & validate the phone number
   * 2. Check if it's already in our pool (assigned to another tenant or this tenant)
   * 3. Try to register on Meta via POST /{waba_id}/phone_numbers
   * 4. Parse Meta response:
   *    - Success → save with phoneNumberId, mark needs_verification
   *    - "already registered" error → tell user to delete WA Business / remove from other BSP
   *    - Other error → save locally for admin to fix later
   */
  async registerNumber(tenantId: string, phone: string): Promise<RegisterNumberResult> {
    // Normalize phone
    const normalized = phone.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{10,15}$/.test(normalized)) {
      throw new BadRequestException('Invalid phone number format. Use international format, e.g. +91XXXXXXXXXX');
    }
    const fullPhone = normalized.startsWith('+') ? normalized : `+${normalized}`;

    // Check 1: Is this number already in our pool?
    const existingInPool = await this.phoneNumberRepository.findOne({
      where: { phoneNumber: fullPhone },
    });

    if (existingInPool) {
      // Already assigned to another tenant → unavailable.
      if (existingInPool.tenantId && existingInPool.tenantId !== tenantId) {
        return {
          status: 'already_occupied',
          phone: fullPhone,
          message: 'This number is already in use by another account on the platform.',
        };
      }
      // Already ours AND fully active → nothing to do.
      if (existingInPool.tenantId === tenantId && existingInPool.status === 'active' && existingInPool.phoneNumberId) {
        await this.updateTenantWithPhone(tenantId, fullPhone, existingInPool);
        return {
          status: 'registered',
          phone: fullPhone,
          message: 'This number is already registered and active on your account.',
          phoneId: existingInPool.id,
        };
      }
      // Otherwise (ours-but-not-active, or unassigned) → claim it and let the
      // automated Meta flow below resume activation / send the OTP.
      await this.phoneNumberRepository.update(existingInPool.id, { tenantId });
    }

    // Run the automated multi-WABA registration pipeline (smart selection +
    // failover across all active WABAs).
    return this.runRegistrationPipeline(fullPhone, tenantId);
  }

  /**
   * Automated registration pipeline across ALL active WABAs.
   *
   * Smartly load-balances onto the WABA hosting the fewest numbers, and fails
   * over to the next WABA if one can't add the number. Two passes:
   *   Pass 1 — is the number already on ANY of our WABAs? Resume from there.
   *   Pass 2 — add it to a WABA, trying each until one succeeds.
   * The only human step is typing the OTP Meta sends to the physical number.
   */
  private async runRegistrationPipeline(fullPhone: string, tenantId: string): Promise<RegisterNumberResult> {
    const candidates = await this.getCandidateWabasWithTokens();
    if (!candidates.length) {
      throw new BadRequestException(
        'No usable WhatsApp Business Account is configured (none with a valid token). Please contact support.',
      );
    }

    // Pass 1: already on one of our WABAs? Resume wherever it left off.
    for (const { waba, token } of candidates) {
      const onWaba = await this.findNumberOnWaba(waba.wabaId, fullPhone, token);
      if (onWaba) {
        return this.resumeOnWaba(waba, token, onWaba, fullPhone, tenantId);
      }
    }

    // Pass 2: not on any of our WABAs → add it, failing over across candidates.
    const verifiedName = await this.resolveVerifiedName(tenantId);
    let lastError: string | undefined;
    for (const { waba, token } of candidates) {
      const reg = await this.registerPhoneOnMeta(fullPhone, waba.wabaId, token, verifiedName);

      // Globally taken (another WABA/WA Business app/BSP) — other WABAs won't help.
      if (reg.alreadyTaken) {
        return {
          status: 'already_business',
          phone: fullPhone,
          message: reg.errorMessage!,
          instructions: reg.instructions,
        };
      }

      if (reg.phoneNumberId) {
        const phoneRecord = await this.upsertPhoneRecord(
          waba.id, fullPhone, reg.phoneNumberId, tenantId, 'pending_verification', 'pending',
        );
        await this.updateTenantWithPhone(tenantId, fullPhone, phoneRecord);
        const code = await this.requestCodeOnMeta(reg.phoneNumberId, token);
        await this.phoneNumberRepository.update(phoneRecord.id, { codeVerificationStatus: 'code_sent' });
        this.logger.log(`Phone ${fullPhone} added to WABA ${waba.wabaId} (tenant ${tenantId}); OTP sent=${code.sent}`);
        return {
          status: 'needs_verification',
          phone: fullPhone,
          phoneId: phoneRecord.id,
          needsVerification: true,
          message: code.sent
            ? 'Number added! A 6-digit code was sent via SMS — enter it below to activate.'
            : `Number added, but WhatsApp could not send the code: ${code.error} You can tap "Resend SMS" to try again.`,
        };
      }

      // Generic failure on this WABA (bad token, capacity, transient) → try next,
      // remembering the real Meta reason so we can tell the tenant.
      lastError = reg.metaError || `WABA ${waba.wabaId} could not add the number.`;
      this.logger.warn(`Add failed on WABA ${waba.wabaId} for ${fullPhone}: ${lastError}; trying next WABA`);
    }

    // All WABAs exhausted → save locally for the retry cron to pick up, and tell
    // the tenant exactly what Meta said.
    const fallbackWaba = candidates[0].waba;
    const phoneRecord = await this.upsertPhoneRecord(
      fallbackWaba.id, fullPhone, null, tenantId, 'pending_registration', 'not_started',
    );
    await this.updateTenantWithPhone(tenantId, fullPhone, phoneRecord);
    this.logger.warn(`Phone ${fullPhone} saved pending_registration; no WABA could add it. lastError=${lastError}`);
    return {
      status: 'registered',
      phone: fullPhone,
      phoneId: phoneRecord.id,
      message: lastError
        ? `WhatsApp couldn't register this number yet: ${lastError} We'll keep retrying automatically — or tap Retry.`
        : 'Number saved. Automatic activation could not be completed right now — it will be retried automatically.',
    };
  }

  /**
   * Resume onboarding for a number already present on a given WABA at Meta:
   * activate it directly if verified/connected, otherwise (re)send the OTP.
   */
  private async resumeOnWaba(
    waba: WabaAccount,
    token: string,
    onWaba: { id: string; codeVerificationStatus: string; status: string },
    fullPhone: string,
    tenantId: string,
  ): Promise<RegisterNumberResult> {
    const phoneRecord = await this.upsertPhoneRecord(waba.id, fullPhone, onWaba.id, tenantId);

    if (onWaba.status === 'CONNECTED' || onWaba.codeVerificationStatus === 'VERIFIED') {
      const result = await this.activatePhoneOnMeta(phoneRecord, waba, token);
      await this.updateTenantWithPhone(tenantId, fullPhone, phoneRecord);
      if (result.active) {
        return {
          status: 'registered',
          phone: fullPhone,
          phoneId: phoneRecord.id,
          message: result.warning
            ? `Number connected and activated automatically. ${result.warning}`
            : 'Number connected and activated automatically — you\'re all set!',
        };
      }
      // Register failed (likely still needs verification) → fall through to OTP.
    }

    const code = await this.requestCodeOnMeta(onWaba.id, token);
    await this.phoneNumberRepository.update(phoneRecord.id, {
      codeVerificationStatus: 'code_sent',
      status: 'pending_verification',
      registrationStatus: 'pending',
    });
    await this.updateTenantWithPhone(tenantId, fullPhone, phoneRecord);
    return {
      status: 'needs_verification',
      phone: fullPhone,
      phoneId: phoneRecord.id,
      needsVerification: true,
      message: code.sent
        ? 'A 6-digit verification code was sent to this number. Enter it below to activate.'
        : `This number needs verification, but WhatsApp could not send the code: ${code.error} Tap "Resend SMS" to try again.`,
    };
  }

  /**
   * Request a verification code for a phone number (SMS or voice call).
   */
  async requestVerificationCode(tenantId: string, phoneId: string, method: 'sms' | 'voice' = 'sms') {
    const phone = await this.phoneNumberRepository.findOne({
      where: { id: phoneId, tenantId },
    });
    if (!phone) throw new NotFoundException('Phone number not found');
    if (!phone.phoneNumberId) throw new BadRequestException('Phone number has no Meta ID yet. Contact administrator.');

    const waba = await this.getWabaForPhone(phone);
    const accessToken = await this.metaTokenService.getActiveToken(waba.id);

    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${phone.phoneNumberId}/request_code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ code_method: method.toUpperCase(), language: 'en_US' }),
        },
      );
      const data = await response.json() as any;
      if (!response.ok) {
        throw new BadRequestException(data.error?.message || 'Failed to request verification code');
      }

      await this.phoneNumberRepository.update(phone.id, {
        codeVerificationStatus: 'code_sent',
      });

      return { sent: true, method, message: `Verification code sent via ${method.toUpperCase()}` };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`Verification code request failed: ${err.message}`);
      throw new BadRequestException('Failed to request verification code. Please try again.');
    }
  }

  /**
   * Verify the phone number with the code received via SMS/voice.
   * On success, marks the number as active.
   */
  async verifyNumber(tenantId: string, phoneId: string, code: string) {
    const phone = await this.phoneNumberRepository.findOne({
      where: { id: phoneId, tenantId },
    });
    if (!phone) throw new NotFoundException('Phone number not found');
    if (!phone.phoneNumberId) throw new BadRequestException('Phone number has no Meta ID yet. Contact administrator.');

    const waba = await this.getWabaForPhone(phone);
    const accessToken = await this.metaTokenService.getActiveToken(waba.id);

    // 1) Verify the OTP with Meta
    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${phone.phoneNumberId}/verify_code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ code }),
        },
      );
      const data = await response.json() as any;
      if (!response.ok) {
        const msg = (data.error?.message || '').toLowerCase();
        // "already verified" is not an error for us — proceed to activation.
        if (!msg.includes('already')) {
          throw new BadRequestException(data.error?.message || 'Invalid verification code');
        }
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`Verification failed: ${err.message}`);
      throw new BadRequestException('Verification failed. Please check the code and try again.');
    }

    await this.phoneNumberRepository.update(phone.id, { codeVerificationStatus: 'verified' });

    // 2) Auto-register on the Cloud API (with a PIN) and subscribe webhooks — no
    // further manual/admin steps. After this the number can send & receive.
    const result = await this.activatePhoneOnMeta(phone, waba, accessToken);

    // 3) Point the tenant at this phone number id
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (tenant && !tenant.phoneNumberId) {
      await this.tenantRepository.update(tenantId, { phoneNumberId: phone.phoneNumberId });
    }

    if (result.active) {
      return {
        verified: true,
        active: true,
        message: result.warning
          ? `Phone number verified and activated! ${result.warning}`
          : 'Phone number verified and activated — ready to send and receive messages!',
      };
    }
    return {
      verified: true,
      active: false,
      message: `Number verified, but final activation needs attention: ${result.warning || 'please try again'}`,
    };
  }

  /**
   * Save business profile information.
   */
  async saveBusinessProfile(tenantId: string, dto: BusinessProfileDto) {
    if (!dto.businessName?.trim()) {
      throw new BadRequestException('Business name is required');
    }

    await this.tenantRepository.update(tenantId, {
      businessName: dto.businessName,
      businessCategory: dto.businessCategory,
      businessDescription: dto.businessDescription || null,
      businessAddress: dto.businessAddress || null,
      logoUrl: dto.logoUrl || null,
      name: dto.businessName,
      onboardingStatus: 'profile_complete',
    });

    this.logger.log(`Business profile saved for tenant ${tenantId}`);
    return { saved: true };
  }

  /**
   * Mark onboarding as completed.
   */
  async completeOnboarding(tenantId: string) {
    await this.tenantRepository.update(tenantId, {
      onboardingStatus: 'completed',
    });
    this.logger.log(`Onboarding completed for tenant ${tenantId}`);
    return { completed: true };
  }

  /**
   * Skip onboarding (allow user to set up later from settings).
   */
  async skipOnboarding(tenantId: string) {
    await this.tenantRepository.update(tenantId, {
      onboardingStatus: 'completed',
    });
    return { skipped: true };
  }

  /**
   * Remove a number from the platform entirely:
   *   1. Deregister it from the Cloud API and delete it from our WABA at Meta,
   *      so the number is FREE to be used on another account/BSP/platform.
   *   2. Clear the tenant's pointers to it.
   *   3. Hard-delete the local record (so it's available again on our platform).
   */
  async releaseNumber(tenantId: string, phoneId: string): Promise<{ message: string; freed: boolean }> {
    const phone = await this.phoneNumberRepository.findOne({ where: { id: phoneId, tenantId } });
    if (!phone) {
      throw new NotFoundException('Phone number not found or not assigned to your account.');
    }

    let freed = false;
    let warning = '';

    if (phone.phoneNumberId) {
      try {
        const waba = await this.getWabaForPhone(phone);
        const token = await this.metaTokenService.getActiveToken(waba.id).catch(() => null);
        if (token) {
          // Deregister releases the number for re-registration elsewhere; the
          // delete detaches it from our WABA. Either succeeding means it's freed.
          const deregistered = await this.deregisterFromCloudApi(phone.phoneNumberId, token);
          const deleted = await this.deletePhoneFromWaba(phone.phoneNumberId, token);
          freed = deregistered || deleted;
          if (!freed) {
            warning = 'The number was removed from your account, but releasing it from WhatsApp on Meta did not fully complete. It may take a few minutes.';
          }
        } else {
          warning = 'No active WABA token was available, so the number may still be attached to the WABA on Meta. Contact support if you need it fully released.';
        }
      } catch (err: any) {
        this.logger.warn(`Release from Meta failed for ${phone.phoneNumber}: ${err.message}`);
        warning = 'The number was removed from your account, but releasing it from WhatsApp on Meta did not fully complete.';
      }
    } else {
      // Never made it onto Meta — nothing to release there.
      freed = true;
    }

    // Clear tenant pointers if they reference this number
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (tenant && (tenant.phoneNumberId === phone.phoneNumberId || tenant.whatsappPhone === phone.phoneNumber)) {
      await this.tenantRepository.update(tenantId, {
        phoneNumberId: null as any,
        wabaId: null as any,
        whatsappPhone: null as any,
      });
    }

    // Hard-delete from our DB so the number is free on our platform too.
    await this.phoneNumberRepository.delete(phone.id);
    this.logger.log(`Phone ${phone.phoneNumber} released & deleted for tenant ${tenantId} (freed on Meta=${freed})`);

    // Audit log so admins can see release history in the super-admin dashboard.
    await this.auditService.log({
      tenantId,
      actorType: 'tenant_user',
      actorId: tenantId,
      action: 'phone.released',
      resourceType: 'phone_number',
      resourceId: phone.id,
      details: {
        phoneNumber: phone.phoneNumber,
        phoneNumberId: phone.phoneNumberId || null,
        wabaAccountId: phone.wabaAccountId || null,
        freedOnMeta: freed,
        ...(warning ? { warning } : {}),
      },
    }).catch((e) => this.logger.warn(`Audit log for phone.released failed: ${e.message}`));

    return {
      message: freed
        ? 'Number removed from your account and released from WhatsApp. It is now free to use on another account or platform.'
        : warning || 'Number removed from your account.',
      freed,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async getPlatformWaba(): Promise<WabaAccount | null> {
    return this.wabaAccountRepository.findOne({
      where: { status: 'active' },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Resolve the display name to register a number under at Meta (verified_name
   * is required by POST /{waba}/phone_numbers). Uses the tenant's business name.
   */
  private async resolveVerifiedName(tenantId: string): Promise<string> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['businessName', 'name'],
    });
    const name = (tenant?.businessName || tenant?.name || '').trim();
    return name || 'Business';
  }

  /**
   * All active WABAs that have a usable token, smartly ordered for assignment:
   * the WABA hosting the FEWEST phone numbers comes first (load balancing).
   */
  private async getCandidateWabasWithTokens(): Promise<{ waba: WabaAccount; token: string }[]> {
    const wabas = await this.wabaAccountRepository.find({
      where: { status: 'active' },
      order: { createdAt: 'ASC' },
    });
    if (!wabas.length) return [];

    const counts = await Promise.all(
      wabas.map((w) => this.phoneNumberRepository.count({ where: { wabaAccountId: w.id } })),
    );
    const ranked = wabas
      .map((w, i) => ({ waba: w, count: counts[i] }))
      .sort((a, b) => a.count - b.count);

    const result: { waba: WabaAccount; token: string }[] = [];
    for (const { waba } of ranked) {
      const token = await this.metaTokenService.getActiveToken(waba.id).catch(() => null);
      if (token) result.push({ waba, token });
    }
    return result;
  }

  /**
   * Resolve the WABA a phone number belongs to (multi-WABA aware), falling back
   * to the platform default if the link is missing.
   */
  private async getWabaForPhone(phone: PhoneNumber): Promise<WabaAccount> {
    if (phone.wabaAccountId) {
      const waba = await this.wabaAccountRepository.findOne({ where: { id: phone.wabaAccountId } });
      if (waba) return waba;
    }
    const fallback = await this.getPlatformWaba();
    if (!fallback) throw new BadRequestException('No WhatsApp Business Account is linked to this number.');
    return fallback;
  }

  /**
   * Background retry: periodically re-attempt activation for any numbers stuck
   * in `pending_registration` (e.g. saved while no WABA was ready, or a WABA was
   * temporarily failing). Runs the same multi-WABA pipeline; numbers that get
   * added move to `pending_verification` and drop out of this query. Verified/
   * connected numbers are activated fully with no user interaction.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryStuckRegistrations(): Promise<void> {
    const stuck = await this.phoneNumberRepository.find({
      where: { status: 'pending_registration' },
      order: { updatedAt: 'ASC' },
      take: 50,
    });
    if (!stuck.length) return;

    this.logger.log(`Retry cron: re-attempting activation for ${stuck.length} pending number(s)`);
    for (const phone of stuck) {
      if (!phone.tenantId) continue;
      try {
        const result = await this.runRegistrationPipeline(phone.phoneNumber, phone.tenantId);
        this.logger.log(`Retry cron: ${phone.phoneNumber} → ${result.status}`);
      } catch (err: any) {
        this.logger.warn(`Retry cron: ${phone.phoneNumber} failed — ${err.message}`);
      }
    }
  }

  /**
   * Generate a random 6-digit Cloud API two-step verification PIN.
   */
  private generatePin(): string {
    return String(randomInt(0, 1000000)).padStart(6, '0');
  }

  /**
   * Look up a number on a WABA's phone list at Meta and return its onboarding
   * state. Resilient to field deprecations (retries without the fields param).
   */
  private async findNumberOnWaba(
    wabaId: string,
    phone: string,
    accessToken: string,
  ): Promise<{ id: string; codeVerificationStatus: string; status: string; verifiedName?: string } | null> {
    const target = phone.replace(/[^0-9]/g, '');
    const fetchList = async (withFields: boolean): Promise<any> => {
      const url = new URL(`https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/phone_numbers`);
      if (withFields) {
        url.searchParams.set('fields', 'id,display_phone_number,code_verification_status,status,verified_name');
      }
      url.searchParams.set('limit', '100');
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      return res.json();
    };
    try {
      let data = await fetchList(true);
      if (data?.error) data = await fetchList(false); // a requested field may be unsupported
      if (!data?.data) return null;
      for (const p of data.data) {
        const disp = (p.display_phone_number || '').replace(/[^0-9]/g, '');
        if (disp && (disp === target || target.endsWith(disp) || disp.endsWith(target))) {
          return {
            id: p.id,
            codeVerificationStatus: p.code_verification_status || 'NOT_VERIFIED',
            status: p.status || 'UNKNOWN',
            verifiedName: p.verified_name,
          };
        }
      }
      return null;
    } catch (err: any) {
      this.logger.warn(`findNumberOnWaba failed for ${phone}: ${err.message}`);
      return null;
    }
  }

  /**
   * Request a verification code (OTP) from Meta for a phone number id.
   * Returns true if Meta accepted the request.
   */
  private async requestCodeOnMeta(
    phoneNumberId: string,
    accessToken: string,
    method: 'SMS' | 'VOICE' = 'SMS',
  ): Promise<{ sent: boolean; error?: string }> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${phoneNumberId}/request_code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ code_method: method, language: 'en_US' }),
        },
      );
      const data = await res.json() as any;
      if (!res.ok) {
        this.logger.warn(`request_code failed for ${phoneNumberId}: ${data.error?.message}`);
        return { sent: false, error: data.error?.message || 'WhatsApp could not send the verification code.' };
      }
      return { sent: true };
    } catch (err: any) {
      this.logger.warn(`request_code error for ${phoneNumberId}: ${err.message}`);
      return { sent: false, error: `Could not reach WhatsApp to send the code: ${err.message}` };
    }
  }

  /**
   * Register the number on the WhatsApp Cloud API (POST /{id}/register with a
   * PIN). This is what actually makes a verified number able to send/receive.
   * Treats "already registered" as success and persists the PIN we used.
   */
  private async registerOnCloudApi(
    phone: PhoneNumber,
    accessToken: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const pin = phone.metadata?.cloudApiPin || this.generatePin();
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${phone.phoneNumberId}/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
        },
      );
      const data = await res.json() as any;
      const msg = (data.error?.message || '').toLowerCase();
      const alreadyRegistered = msg.includes('already') && (msg.includes('regist') || msg.includes('connect'));
      if ((res.ok && data.success) || alreadyRegistered) {
        await this.phoneNumberRepository.update(phone.id, {
          isPinEnabled: true,
          metadata: { ...(phone.metadata || {}), cloudApiPin: pin },
        });
        return { ok: true };
      }
      this.logger.warn(`Cloud API register failed for ${phone.phoneNumberId}: ${data.error?.message}`);
      return { ok: false, error: data.error?.message || 'Cloud API registration failed' };
    } catch (err: any) {
      this.logger.warn(`Cloud API register error for ${phone.phoneNumberId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Subscribe our app to the WABA's webhooks (idempotent on Meta's side).
   */
  private async subscribeWabaWebhook(wabaId: string, accessToken: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/subscribed_apps`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json() as any;
      if (res.ok && data.success) return true;
      this.logger.warn(`Webhook subscribe failed for WABA ${wabaId}: ${data.error?.message}`);
      return false;
    } catch (err: any) {
      this.logger.warn(`Webhook subscribe error for WABA ${wabaId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Deregister a number from the WhatsApp Cloud API (POST /{id}/deregister).
   * This releases the number so it can be registered on another account/BSP.
   */
  private async deregisterFromCloudApi(phoneNumberId: string, accessToken: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${phoneNumberId}/deregister`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json() as any;
      if (res.ok && (data.success ?? true)) return true;
      this.logger.warn(`Deregister failed for ${phoneNumberId}: ${data.error?.message}`);
      return false;
    } catch (err: any) {
      this.logger.warn(`Deregister error for ${phoneNumberId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Delete a phone number node from our WABA at Meta (DELETE /{phone-number-id}),
   * detaching it so it no longer counts against / appears on our WABA.
   */
  private async deletePhoneFromWaba(phoneNumberId: string, accessToken: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${phoneNumberId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json() as any;
      if (res.ok && (data.success ?? true)) return true;
      this.logger.warn(`Delete phone from WABA failed for ${phoneNumberId}: ${data.error?.message}`);
      return false;
    } catch (err: any) {
      this.logger.warn(`Delete phone error for ${phoneNumberId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Finalize activation: register on Cloud API + subscribe webhooks + mark the
   * local record active. Used both after OTP verification and when a number is
   * found already-verified on our WABA.
   */
  private async activatePhoneOnMeta(
    phone: PhoneNumber,
    waba: WabaAccount,
    accessToken: string,
  ): Promise<{ active: boolean; warning?: string }> {
    const reg = await this.registerOnCloudApi(phone, accessToken);
    const subscribed = await this.subscribeWabaWebhook(waba.wabaId, accessToken);

    if (reg.ok) {
      await this.phoneNumberRepository.update(phone.id, {
        status: 'active',
        registrationStatus: 'registered',
        codeVerificationStatus: 'verified',
        webhookSubscribed: subscribed,
        lastOnboardedAt: new Date(),
      });
      return {
        active: true,
        warning: subscribed ? undefined : 'Webhook subscription is pending and will be retried automatically.',
      };
    }

    await this.phoneNumberRepository.update(phone.id, { webhookSubscribed: subscribed });
    return { active: false, warning: reg.error };
  }

  /**
   * Create or update the local phone record for a number, keyed by phone number.
   */
  private async upsertPhoneRecord(
    wabaAccountId: string,
    phone: string,
    phoneNumberId: string | null,
    tenantId: string,
    status = 'pending_verification',
    registrationStatus = 'pending',
  ): Promise<PhoneNumber> {
    const existing = await this.phoneNumberRepository.findOne({ where: { phoneNumber: phone } });
    if (existing) {
      await this.phoneNumberRepository.update(existing.id, {
        wabaAccountId,
        tenantId,
        ...(phoneNumberId ? { phoneNumberId } : {}),
      });
      return (await this.phoneNumberRepository.findOne({ where: { id: existing.id } }))!;
    }
    const record = this.phoneNumberRepository.create({
      wabaAccountId,
      phoneNumber: phone,
      phoneNumberId: phoneNumberId || null,
      displayName: phone,
      status,
      registrationStatus,
      tenantId,
    });
    return this.phoneNumberRepository.save(record);
  }

  /**
   * Register a phone number under the platform's shared WABA via Meta Cloud API.
   * POST /{waba_id}/phone_numbers
   *
   * This is the SINGLE source of truth for detecting:
   * - Numbers already on another WABA (WATI, Gupshup, Interakt, etc.)
   * - Numbers with WhatsApp Business app
   * - Numbers with regular WhatsApp (these can be registered — user gets OTP)
   * - Clean numbers with no WhatsApp (these can be registered — user gets OTP)
   */
  private async registerPhoneOnMeta(
    phone: string,
    wabaId: string,
    accessToken: string,
    verifiedName: string,
  ): Promise<{
    phoneNumberId: string | null;
    alreadyTaken: boolean;
    errorMessage?: string;
    instructions?: string[];
    metaError?: string;
  }> {
    try {
      // Meta expects `cc` = country code and `phone_number` = the NATIONAL number
      // (without the country code), plus a required `verified_name` (display name).
      const rawNumber = phone.replace(/^\+/, '');
      const cc = this.extractCountryCode(rawNumber);
      const nationalNumber = rawNumber.startsWith(cc) ? rawNumber.slice(cc.length) : rawNumber;
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/phone_numbers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            cc,
            phone_number: nationalNumber,
            verified_name: verifiedName,
            migrate_phone_number: false,
          }),
        },
      );
      const data = await response.json() as any;

      if (response.ok && data.id) {
        this.logger.log(`Phone ${phone} registered on Meta WABA ${wabaId}, phone_number_id: ${data.id}`);
        return { phoneNumberId: data.id, alreadyTaken: false };
      }

      // Parse Meta error to give meaningful feedback
      const errorMsg = data.error?.message || '';
      const errorCode = data.error?.code;
      const errorSubcode = data.error?.error_subcode;

      this.logger.warn(`Meta registration failed for ${phone}: [${errorCode}/${errorSubcode}] ${errorMsg}`);

      // Detect "already registered" scenarios
      if (this.isAlreadyRegisteredError(errorMsg, errorCode, errorSubcode)) {
        return {
          phoneNumberId: null,
          alreadyTaken: true,
          errorMessage: 'This phone number is already registered with WhatsApp Business on another platform.',
          instructions: [
            'If you have WhatsApp Business app: Open WhatsApp Business → Settings → Account → Delete Account',
            'If your number is on WATI, Gupshup, Interakt, or another BSP: Remove the number from that platform\'s dashboard first',
            'After removing, wait 5 minutes for Meta to release the number',
            'Then come back here and try registering again',
          ],
        };
      }

      // Detect "regular WhatsApp" — this should NOT happen for POST (regular WA numbers CAN be registered)
      // But if Meta returns a specific conflict for regular WA:
      if (this.isRegularWhatsAppError(errorMsg, errorCode, errorSubcode)) {
        return {
          phoneNumberId: null,
          alreadyTaken: true,
          errorMessage: 'This phone number has regular WhatsApp installed. You need to delete it before using WhatsApp Business API.',
          instructions: [
            'Open WhatsApp on your phone',
            'Go to Settings → Account → Delete my account',
            'Wait 5 minutes after deletion',
            'Come back here and register the number again',
            'Note: You will lose your WhatsApp chat history on this number',
          ],
        };
      }

      // Other Meta API errors — surface the real reason to the tenant.
      this.logger.warn(`Unrecognized Meta error for ${phone}: ${JSON.stringify(data)}`);
      return { phoneNumberId: null, alreadyTaken: false, metaError: errorMsg || 'WhatsApp registration was rejected by Meta.' };
    } catch (err: any) {
      this.logger.warn(`Meta phone registration network error: ${err.message}`);
      return { phoneNumberId: null, alreadyTaken: false, metaError: `Could not reach WhatsApp: ${err.message}` };
    }
  }

  /**
   * Detect if Meta error means the number is already registered on another WABA/BSP.
   */
  private isAlreadyRegisteredError(msg: string, code?: number, subcode?: number): boolean {
    const lowerMsg = msg.toLowerCase();
    // Common Meta error patterns for already-registered numbers
    if (lowerMsg.includes('already registered')) return true;
    if (lowerMsg.includes('already being used')) return true;
    if (lowerMsg.includes('belongs to another')) return true;
    if (lowerMsg.includes('already connected')) return true;
    if (lowerMsg.includes('phone number is associated')) return true;
    if (lowerMsg.includes('migrate_phone_number')) return true;
    // Meta error code 100 with subcode 2388093 = phone already in use by another business
    if (code === 100 && subcode === 2388093) return true;
    // Error code 368 = temporarily blocked (often means number is in use)
    if (code === 368) return true;
    return false;
  }

  /**
   * Detect if Meta error means the number has regular WhatsApp (not Business).
   * Note: In most cases, regular WhatsApp numbers CAN be registered via Cloud API
   * and the user just gets an OTP. This handles edge cases where Meta explicitly blocks it.
   */
  private isRegularWhatsAppError(msg: string, code?: number, subcode?: number): boolean {
    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes('whatsapp account exists') && !lowerMsg.includes('business')) return true;
    if (lowerMsg.includes('delete your whatsapp account')) return true;
    return false;
  }

  /**
   * Extract country code from a raw phone number (without +).
   * Uses a simple heuristic based on well-known country codes.
   */
  private extractCountryCode(rawNumber: string): string {
    // Check 3-digit codes first, then 2-digit, then 1-digit
    const threeCodes = ['880', '971', '966', '234', '263'];
    const twoCodes = ['91', '44', '55', '27', '52', '49', '33', '62', '92', '63', '81', '82', '39', '34', '61'];
    const oneCodes = ['1', '7'];

    for (const cc of threeCodes) {
      if (rawNumber.startsWith(cc)) return cc;
    }
    for (const cc of twoCodes) {
      if (rawNumber.startsWith(cc)) return cc;
    }
    for (const cc of oneCodes) {
      if (rawNumber.startsWith(cc)) return cc;
    }
    // Fallback: assume first 2 digits
    return rawNumber.substring(0, 2);
  }

  /**
   * Try to resolve the Meta phone_number_id by listing phone numbers on the WABA
   * and matching by display phone number. Updates the phone record if found.
   */
  private async syncPhoneNumberIdFromMeta(phoneRecord: PhoneNumber): Promise<void> {
    try {
      const waba = await this.wabaAccountRepository.findOne({ where: { id: phoneRecord.wabaAccountId } });
      if (!waba) return;

      const accessToken = await this.metaTokenService.getActiveToken(waba.id);
      if (!accessToken) return;

      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${waba.wabaId}/phone_numbers`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const data = await response.json() as any;
      if (!data.data) return;

      // Normalize the stored phone for matching
      const normalized = phoneRecord.phoneNumber.replace(/[^0-9]/g, '');

      for (const metaPhone of data.data) {
        const metaDisplay = (metaPhone.display_phone_number || '').replace(/[^0-9]/g, '');
        if (metaDisplay === normalized || normalized.endsWith(metaDisplay) || metaDisplay.endsWith(normalized)) {
          await this.phoneNumberRepository.update(phoneRecord.id, {
            phoneNumberId: metaPhone.id,
            displayName: metaPhone.verified_name || phoneRecord.displayName,
            qualityRating: metaPhone.quality_rating || phoneRecord.qualityRating,
          });
          phoneRecord.phoneNumberId = metaPhone.id;
          this.logger.log(`Synced phone_number_id=${metaPhone.id} from Meta for phone ${phoneRecord.phoneNumber}`);
          return;
        }
      }
      this.logger.warn(`Could not find Meta phone_number_id for ${phoneRecord.phoneNumber} on WABA ${waba.wabaId}`);
    } catch (err: any) {
      this.logger.error(`Failed to sync phone_number_id from Meta: ${err.message}`);
    }
  }

  private async updateTenantWithPhone(tenantId: string, phone: string, phoneRecord: PhoneNumber) {
    // Re-fetch the phone record to get the latest data (in case it was just updated)
    const freshPhone = await this.phoneNumberRepository.findOne({
      where: { id: phoneRecord.id },
      relations: ['wabaAccount'],
    });
    const record = freshPhone || phoneRecord;

    const updateData: Partial<Tenant> = {
      whatsappPhone: phone,
      onboardingStatus: 'whatsapp_connected' as any,
    };
    if (record.phoneNumberId) {
      updateData.phoneNumberId = record.phoneNumberId;
    }
    if (record.wabaAccountId) {
      const wabaId = record.wabaAccount?.wabaId
        || (await this.wabaAccountRepository.findOne({ where: { id: record.wabaAccountId } }))?.wabaId;
      if (wabaId) {
        updateData.wabaId = wabaId;
      }
    }
    this.logger.log(
      `Updating tenant ${tenantId} with phone data: phoneNumberId=${record.phoneNumberId}, wabaId=${updateData.wabaId}, phone=${phone}`,
    );
    await this.tenantRepository.update(tenantId, updateData);
  }
}
