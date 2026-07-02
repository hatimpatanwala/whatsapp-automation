import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { MetaTokenService } from '../waba/meta-token.service';
import { WhatsAppApiService } from './whatsapp-api.service';
import { TeamService } from './team.service';

interface StaffOtpEntry {
  code: string;
  userId: string;
  schema: string;
  expiresAt: number;
  attempts: number;
}

/**
 * WhatsApp OTP verification for STAFF numbers — the same proof-of-ownership
 * pattern used for the tenant admin (onboarding/admin-whatsapp.service.ts),
 * scoped to a tenant `users` row instead of the tenant record.
 *
 * The code is delivered with the platform's already-approved authentication
 * template (`admin_otp_verification`), which reaches the staff number even
 * outside the 24h window, and the staff member confirms by replying to the
 * business number with the code (handled by StaffCommandService). No new Meta
 * template is required.
 */
@Injectable()
export class StaffWhatsAppService {
  private readonly logger = new Logger(StaffWhatsAppService.name);
  private readonly otpStore = new Map<string, StaffOtpEntry>(); // key: `${schema}:${digits}`
  private readonly OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes — staff read it in a separate chat
  private readonly MAX_ATTEMPTS = 4;
  private readonly isDev: boolean;
  private readonly staticOtpCode: string;

  constructor(
    @InjectRepository(WabaAccount) private readonly wabaAccountRepo: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber) private readonly phoneNumberRepo: Repository<PhoneNumber>,
    private readonly metaTokenService: MetaTokenService,
    private readonly whatsappApi: WhatsAppApiService,
    private readonly team: TeamService,
    private readonly config: ConfigService,
  ) {
    this.isDev = this.config.get<string>('NODE_ENV', 'development') !== 'production';
    this.staticOtpCode = (this.config.get<string>('STATIC_OTP_CODE', '') || '').trim();
  }

  private key(schema: string, digits: string): string {
    return `${schema}:${digits}`;
  }

  /** Generate + deliver an OTP to a staff member's WhatsApp number. */
  async sendOtp(schema: string, member: { id: string; name: string; whatsappNumber: string | null }): Promise<{ sent: boolean; staticCode?: string }> {
    if (!member.whatsappNumber) throw new BadRequestException('This team member has no WhatsApp number.');
    const digits = TeamService.digits(member.whatsappNumber);
    const code = this.staticOtpCode || randomInt(0, 1_000_000).toString().padStart(6, '0');

    this.otpStore.set(this.key(schema, digits), {
      code,
      userId: member.id,
      schema,
      expiresAt: Date.now() + this.OTP_TTL_MS,
      attempts: 0,
    });

    if (this.staticOtpCode) {
      this.logger.log(`[STATIC OTP] Staff OTP for ${member.name} (${schema}): ${code}`);
      return { sent: true, staticCode: code };
    }
    if (this.isDev) {
      this.logger.log(`[DEV] Staff OTP for ${member.name} (${schema}): ${code}`);
      return { sent: true };
    }
    try {
      await this.deliver(member.whatsappNumber, code);
    } catch (err: any) {
      this.logger.error(`Staff OTP send failed (${schema}/${member.id}): ${err?.message}`);
      throw new BadRequestException('Could not send the verification code over WhatsApp right now. Please try again shortly.');
    }
    this.logger.log(`Staff OTP sent to ${member.name} (${schema})`);
    return { sent: true };
  }

  /**
   * A staff member replied to the business number with (hopefully) their code.
   * Returns the verified member id on success, or a reason to relay back.
   */
  async verifyByReply(schema: string, fromDigits: string, text: string): Promise<{ verified: boolean; userId?: string; reason?: string }> {
    const entry = this.otpStore.get(this.key(schema, fromDigits));
    if (!entry) return { verified: false, reason: 'no_pending' };

    if (Date.now() > entry.expiresAt) {
      this.otpStore.delete(this.key(schema, fromDigits));
      return { verified: false, reason: 'expired' };
    }

    const code = (text || '').replace(/\D/g, '').trim();
    if (!code) return { verified: false, reason: 'not_a_code' };

    entry.attempts++;
    if (entry.attempts > this.MAX_ATTEMPTS) {
      this.otpStore.delete(this.key(schema, fromDigits));
      return { verified: false, reason: 'too_many' };
    }
    if (entry.code !== code) {
      return { verified: false, reason: 'mismatch' };
    }

    this.otpStore.delete(this.key(schema, fromDigits));
    await this.team.markWhatsappVerified(schema, entry.userId);
    this.logger.log(`Staff WhatsApp verified (${schema}/${entry.userId})`);
    return { verified: true, userId: entry.userId };
  }

  /** Whether a pending (undelivered-yet-unverified) OTP exists for this number. */
  hasPending(schema: string, fromDigits: string): boolean {
    const e = this.otpStore.get(this.key(schema, fromDigits));
    return !!e && Date.now() <= e.expiresAt;
  }

  /** Deliver the code via the platform's shared WABA authentication template. */
  private async deliver(to: string, code: string): Promise<void> {
    const platformWaba = await this.wabaAccountRepo.findOne({ where: { status: 'active' }, order: { createdAt: 'ASC' } });
    if (!platformWaba) throw new BadRequestException('Platform WhatsApp Business Account is not configured.');
    const accessToken = await this.metaTokenService.getActiveToken(platformWaba.id);
    if (!accessToken) throw new BadRequestException('Platform access token is not configured.');
    const senderPhone = await this.phoneNumberRepo.findOne({ where: { wabaAccountId: platformWaba.id, status: 'active' }, order: { createdAt: 'ASC' } });
    if (!senderPhone?.phoneNumberId) throw new BadRequestException('No active sender phone number configured.');

    await this.whatsappApi.sendTemplate(
      senderPhone.phoneNumberId,
      accessToken,
      to.replace(/^\+/, ''),
      'admin_otp_verification',
      'en',
      [{ type: 'body', parameters: [{ type: 'text', text: code }] }],
    );
  }
}
