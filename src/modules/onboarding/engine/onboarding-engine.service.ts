import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingSession, OnboardingState } from '../../../database/entities/public/onboarding-session.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { WabaAccount } from '../../../database/entities/public/waba-account.entity';
import { Tenant } from '../../../database/entities/public/tenant.entity';
import { MetaTokenService } from '../../waba/meta-token.service';
import { NumberStateDetectorService, DetectionResult } from './number-state-detector.service';
import { MigrationGuideService } from './migration-guide.service';
import { ConfigService } from '@nestjs/config';

export interface StartOnboardingResult {
  sessionId: string;
  state: OnboardingState;
  phoneNumberId?: string;
  migrationGuide?: any;
  message: string;
}

export interface SessionStatus {
  sessionId: string;
  state: OnboardingState;
  phone: string;
  detectionResult: Record<string, any>;
  migrationInstructions: string[] | null;
  detectedProvider: string | null;
  retryCount: number;
  otpAttempts: number;
  stepLog: Array<{ state: string; timestamp: string; detail?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OnboardingEngineService {
  private readonly logger = new Logger(OnboardingEngineService.name);
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(OnboardingSession)
    private readonly sessionRepo: Repository<OnboardingSession>,
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
    @InjectRepository(WabaAccount)
    private readonly wabaRepo: Repository<WabaAccount>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly metaTokenService: MetaTokenService,
    private readonly detector: NumberStateDetectorService,
    private readonly migrationGuide: MigrationGuideService,
    private readonly configService: ConfigService,
  ) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  /**
   * Start a new onboarding session for a phone number.
   * Validates the number, checks for existing sessions, then runs detection.
   */
  async startOnboarding(tenantId: string, phone: string): Promise<StartOnboardingResult> {
    // Normalize phone
    const normalized = phone.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{10,15}$/.test(normalized)) {
      throw new BadRequestException('Invalid phone number format. Use international format, e.g. +91XXXXXXXXXX');
    }
    const fullPhone = normalized.startsWith('+') ? normalized : `+${normalized}`;

    // Check for existing active session
    const existingSession = await this.sessionRepo.findOne({
      where: { tenantId, phoneNumber: fullPhone, state: 'active' as any },
    });
    if (existingSession) {
      return {
        sessionId: existingSession.id,
        state: 'active',
        message: 'This number is already active on your account.',
      };
    }

    // Check if number is already assigned to another tenant
    const existingPhone = await this.phoneRepo.findOne({ where: { phoneNumber: fullPhone } });
    if (existingPhone?.tenantId && existingPhone.tenantId !== tenantId) {
      throw new BadRequestException('This number is already in use by another account on the platform.');
    }

    // If number exists and belongs to this tenant and is active, return early
    if (existingPhone?.tenantId === tenantId && existingPhone.status === 'active') {
      return {
        sessionId: '',
        state: 'active',
        phoneNumberId: existingPhone.phoneNumberId,
        message: 'This number is already registered to your account.',
      };
    }

    // If number exists in the pool unassigned (e.g. platform test number or pre-provisioned),
    // assign it directly to this tenant — no need to call Meta API
    if (existingPhone && !existingPhone.tenantId && existingPhone.phoneNumberId) {
      await this.phoneRepo.update(existingPhone.id, {
        tenantId,
        status: 'active',
      });

      const updateData: Partial<Tenant> = {
        whatsappPhone: fullPhone,
        phoneNumberId: existingPhone.phoneNumberId,
        onboardingStatus: 'whatsapp_connected' as any,
      };
      if (existingPhone.wabaAccountId) {
        const waba = await this.wabaRepo.findOne({ where: { id: existingPhone.wabaAccountId } });
        if (waba) updateData.wabaId = waba.wabaId;
      }
      await this.tenantRepo.update(tenantId, updateData);

      this.logger.log(`Phone ${fullPhone} from pool assigned to tenant ${tenantId}`);
      return {
        sessionId: '',
        state: 'active',
        phoneNumberId: existingPhone.phoneNumberId,
        message: 'Number activated and assigned to your account!',
      };
    }

    // Expire any pending sessions for this phone+tenant
    await this.sessionRepo.update(
      { tenantId, phoneNumber: fullPhone, state: 'initiated' as any },
      { state: 'expired' },
    );

    // Create session
    const session = this.sessionRepo.create({
      tenantId,
      phoneNumber: fullPhone,
      countryCode: this.extractCountryCode(fullPhone.replace(/^\+/, '')),
      state: 'initiated',
      stepLog: [{ state: 'initiated', timestamp: new Date().toISOString() }],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
    });
    await this.sessionRepo.save(session);

    // Run detection
    return this.detectAndRoute(session);
  }

  /**
   * Core routing logic: detect phone state via Meta API and transition session accordingly.
   */
  async detectAndRoute(session: OnboardingSession): Promise<StartOnboardingResult> {
    await this.transition(session, 'detecting');

    const platformWaba = await this.getPlatformWaba();
    if (!platformWaba) {
      await this.transition(session, 'failed', 'Platform WABA not configured');
      throw new BadRequestException('Platform WhatsApp Business Account is not configured. Please contact support.');
    }

    const accessToken = await this.metaTokenService.getActiveToken(platformWaba.id);
    if (!accessToken) {
      await this.transition(session, 'failed', 'Platform access token not configured');
      throw new BadRequestException('Platform access token is not configured. Please contact the administrator.');
    }

    const detection = await this.detector.detectViaRegistration(
      session.phoneNumber,
      platformWaba.wabaId,
      accessToken,
    );

    // Store detection result
    session.detectionResult = detection as any;
    session.wabaAccountId = platformWaba.id;

    if (detection.registered && detection.phoneNumberId) {
      // Number registered on Meta — save phone record and go to OTP
      session.phoneNumberIdMeta = detection.phoneNumberId;
      await this.transition(session, 'otp_sent', 'Registration succeeded, OTP verification needed');

      const phoneRecord = await this.createOrUpdatePhoneRecord(session, platformWaba, detection);
      session.phoneRecordId = phoneRecord.id;
      await this.sessionRepo.save(session);

      // Auto-request OTP via SMS
      await this.requestOtpInternal(session, accessToken, 'sms');

      return {
        sessionId: session.id,
        state: 'otp_sent',
        phoneNumberId: phoneRecord.id,
        message: 'Number registered! A verification code has been sent via SMS.',
      };
    }

    // Number NOT registered — route based on detected state
    switch (detection.state) {
      case 'other_bsp': {
        session.detectedProvider = detection.detectedProvider || null;
        const guide = this.migrationGuide.getGuide('other_bsp', detection.detectedProvider);
        session.migrationInstructions = guide.steps;
        await this.transition(session, 'needs_bsp_migration', detection.summary);

        return {
          sessionId: session.id,
          state: 'needs_bsp_migration',
          migrationGuide: guide,
          message: detection.summary,
        };
      }

      case 'business_wa': {
        const guide = this.migrationGuide.getGuide('business_wa');
        session.migrationInstructions = guide.steps;
        await this.transition(session, 'needs_business_removal', detection.summary);

        return {
          sessionId: session.id,
          state: 'needs_business_removal',
          migrationGuide: guide,
          message: detection.summary,
        };
      }

      case 'regular_wa': {
        const guide = this.migrationGuide.getGuide('regular_wa');
        session.migrationInstructions = guide.steps;
        await this.transition(session, 'needs_wa_removal', detection.summary);

        return {
          sessionId: session.id,
          state: 'needs_wa_removal',
          migrationGuide: guide,
          message: detection.summary,
        };
      }

      default: {
        await this.transition(session, 'failed', detection.summary);
        return {
          sessionId: session.id,
          state: 'failed',
          message: detection.summary || 'Registration failed. Please try again or contact support.',
        };
      }
    }
  }

  /**
   * Retry detection after user claims to have completed migration steps.
   */
  async retryAfterUserAction(sessionId: string, tenantId: string): Promise<StartOnboardingResult> {
    const session = await this.getSession(sessionId, tenantId);

    const retryableStates: OnboardingState[] = [
      'needs_wa_removal', 'needs_business_removal', 'needs_bsp_migration', 'waiting_user_action',
    ];
    if (!retryableStates.includes(session.state)) {
      throw new BadRequestException(`Cannot retry from state: ${session.state}`);
    }

    if (session.retryCount >= session.maxRetries) {
      await this.transition(session, 'failed', 'Maximum retries exceeded');
      throw new BadRequestException('Maximum retry attempts reached. Please contact support.');
    }

    session.retryCount++;
    session.lastRetryAt = new Date();
    await this.transition(session, 'retry_detecting', `Retry #${session.retryCount}`);

    return this.detectAndRoute(session);
  }

  /**
   * Request OTP verification code.
   */
  async requestOtp(sessionId: string, tenantId: string, method: 'sms' | 'voice' = 'sms') {
    const session = await this.getSession(sessionId, tenantId);

    if (session.state !== 'otp_sent' && session.state !== 'otp_verified') {
      throw new BadRequestException(`Cannot request OTP in state: ${session.state}`);
    }

    if (!session.phoneNumberIdMeta) {
      throw new BadRequestException('Phone number has no Meta ID. Please restart onboarding.');
    }

    const accessToken = await this.getAccessToken(session.wabaAccountId);
    await this.requestOtpInternal(session, accessToken, method);

    return { sent: true, method, message: `Verification code sent via ${method.toUpperCase()}` };
  }

  /**
   * Verify OTP code and activate the number.
   */
  async verifyOtp(sessionId: string, tenantId: string, code: string) {
    const session = await this.getSession(sessionId, tenantId);

    if (session.state !== 'otp_sent') {
      throw new BadRequestException(`Cannot verify OTP in state: ${session.state}`);
    }

    if (session.otpAttempts >= session.maxOtpAttempts) {
      await this.transition(session, 'failed', 'Too many OTP attempts');
      throw new BadRequestException('Too many verification attempts. Please restart onboarding.');
    }

    session.otpAttempts++;
    await this.sessionRepo.save(session);

    const accessToken = await this.getAccessToken(session.wabaAccountId);

    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${session.phoneNumberIdMeta}/verify_code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ code }),
        },
      );
      const data = await response.json() as any;

      if (!response.ok) {
        throw new BadRequestException(data.error?.message || 'Invalid verification code');
      }

      // OTP verified — activate
      await this.transition(session, 'otp_verified', 'OTP verified');
      return this.activateNumber(session);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`OTP verification failed for session ${sessionId}: ${err.message}`);
      throw new BadRequestException('Verification failed. Please check the code and try again.');
    }
  }

  /**
   * Activate the phone number: mark phone record as active, update tenant.
   */
  async activateNumber(session: OnboardingSession) {
    await this.transition(session, 'registering', 'Activating number');

    // Update phone record
    if (session.phoneRecordId) {
      await this.phoneRepo.update(session.phoneRecordId, {
        status: 'active',
        registrationStatus: 'registered',
        codeVerificationStatus: 'verified',
        lastOnboardedAt: new Date(),
      });
    }

    // Update tenant
    const tenant = await this.tenantRepo.findOne({ where: { id: session.tenantId } });
    if (tenant) {
      const updateData: Partial<Tenant> = {
        whatsappPhone: session.phoneNumber,
        onboardingStatus: 'whatsapp_connected' as any,
      };
      if (session.phoneNumberIdMeta) {
        updateData.phoneNumberId = session.phoneNumberIdMeta;
      }
      if (session.wabaAccountId) {
        const waba = await this.wabaRepo.findOne({ where: { id: session.wabaAccountId } });
        if (waba) updateData.wabaId = waba.wabaId;
      }
      await this.tenantRepo.update(session.tenantId, updateData);
    }

    await this.transition(session, 'active', 'Number activated');

    return {
      verified: true,
      sessionId: session.id,
      state: 'active' as OnboardingState,
      message: 'Phone number verified and activated!',
    };
  }

  /**
   * Get session status for the frontend.
   */
  async getSessionStatus(sessionId: string, tenantId: string): Promise<SessionStatus> {
    const session = await this.getSession(sessionId, tenantId);
    return {
      sessionId: session.id,
      state: session.state,
      phone: session.phoneNumber,
      detectionResult: session.detectionResult,
      migrationInstructions: session.migrationInstructions,
      detectedProvider: session.detectedProvider,
      retryCount: session.retryCount,
      otpAttempts: session.otpAttempts,
      stepLog: session.stepLog,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /**
   * Get the latest active (non-expired, non-failed) session for a tenant.
   */
  async getActiveSession(tenantId: string): Promise<OnboardingSession | null> {
    return this.sessionRepo.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Internal helpers ──────────────────────────────────────────────────

  private async transition(session: OnboardingSession, newState: OnboardingState, detail?: string) {
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
    this.logger.log(`Session ${session.id}: ${session.previousState} → ${newState}${detail ? ` (${detail})` : ''}`);
  }

  private async getSession(sessionId: string, tenantId: string): Promise<OnboardingSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId },
    });
    if (!session) throw new NotFoundException('Onboarding session not found');

    if (session.expiresAt && new Date() > new Date(session.expiresAt) && session.state !== 'active' && session.state !== 'failed') {
      await this.transition(session, 'expired', 'Session expired');
      throw new BadRequestException('This onboarding session has expired. Please start again.');
    }

    return session;
  }

  private async getPlatformWaba(): Promise<WabaAccount | null> {
    return this.wabaRepo.findOne({
      where: { status: 'active' },
      order: { createdAt: 'ASC' },
    });
  }

  private async getAccessToken(wabaAccountId: string): Promise<string> {
    const token = await this.metaTokenService.getActiveToken(wabaAccountId);
    if (!token) throw new BadRequestException('Platform access token not available.');
    return token;
  }

  private async requestOtpInternal(session: OnboardingSession, accessToken: string, method: 'sms' | 'voice') {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${session.phoneNumberIdMeta}/request_code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ code_method: method.toUpperCase(), language: 'en_US' }),
        },
      );
      const data = await response.json() as any;

      if (!response.ok) {
        this.logger.warn(`OTP request failed: ${data.error?.message}`);
        // Don't throw — OTP failure is non-fatal, user can retry
      }

      session.otpMethod = method;
      session.otpSentAt = new Date();
      await this.sessionRepo.save(session);
    } catch (err: any) {
      this.logger.warn(`OTP request error: ${err.message}`);
    }
  }

  private async createOrUpdatePhoneRecord(
    session: OnboardingSession,
    platformWaba: WabaAccount,
    detection: DetectionResult,
  ): Promise<PhoneNumber> {
    // Check if phone record already exists
    let phoneRecord = await this.phoneRepo.findOne({ where: { phoneNumber: session.phoneNumber } });

    if (phoneRecord) {
      await this.phoneRepo.update(phoneRecord.id, {
        wabaAccountId: platformWaba.id,
        phoneNumberId: detection.phoneNumberId,
        tenantId: session.tenantId,
        status: 'pending_verification',
        registrationStatus: 'pending',
      });
      return this.phoneRepo.findOne({ where: { id: phoneRecord.id } });
    }

    phoneRecord = this.phoneRepo.create({
      wabaAccountId: platformWaba.id,
      phoneNumber: session.phoneNumber,
      phoneNumberId: detection.phoneNumberId,
      displayName: session.phoneNumber,
      status: 'pending_verification',
      registrationStatus: 'pending',
      tenantId: session.tenantId,
    });
    return this.phoneRepo.save(phoneRecord);
  }

  private extractCountryCode(rawNumber: string): string {
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
    return rawNumber.substring(0, 2);
  }
}
