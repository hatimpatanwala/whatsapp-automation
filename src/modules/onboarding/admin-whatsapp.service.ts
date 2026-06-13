import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { MetaTokenService } from '../waba/meta-token.service';
import { WhatsAppApiService } from '../whatsapp/whatsapp-api.service';

interface OtpEntry {
  code: string;
  phone: string;
  expiresAt: number;
  attempts: number;
}

@Injectable()
export class AdminWhatsAppService {
  private readonly logger = new Logger(AdminWhatsAppService.name);
  private readonly otpStore = new Map<string, OtpEntry>();
  private readonly OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ATTEMPTS = 3;
  private readonly MAX_SENDS_PER_INTERVAL = 3;
  private readonly sendTracker = new Map<string, number[]>();
  private readonly isDev: boolean;
  private readonly STATIC_OTP = '123456';

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccountRepo: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumberRepo: Repository<PhoneNumber>,
    private readonly metaTokenService: MetaTokenService,
    private readonly whatsappApiService: WhatsAppApiService,
    private readonly configService: ConfigService,
  ) {
    this.isDev = this.configService.get<string>('NODE_ENV', 'development') !== 'production';
  }

  async getStatus(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: ['id', 'adminWhatsappNumber', 'adminWhatsappVerified'],
    });
    return {
      phone: tenant?.adminWhatsappNumber || null,
      verified: tenant?.adminWhatsappVerified || false,
    };
  }

  async sendOtp(tenantId: string, phone: string) {
    // Normalize phone
    const normalized = phone.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{10,15}$/.test(normalized)) {
      throw new BadRequestException('Invalid phone number format. Use international format, e.g. +919876543210');
    }
    const fullPhone = normalized.startsWith('+') ? normalized : `+${normalized}`;

    // Check uniqueness
    await this.checkAdminPhoneUniqueness(fullPhone, tenantId);

    // Rate limit: max 3 sends per 15 minutes
    this.enforceRateLimit(tenantId);

    // In development, use static OTP (123456) and skip WhatsApp delivery
    const code = this.isDev ? this.STATIC_OTP : Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP
    this.otpStore.set(tenantId, {
      code,
      phone: fullPhone,
      expiresAt: Date.now() + this.OTP_TTL_MS,
      attempts: 0,
    });

    if (this.isDev) {
      this.logger.log(`[DEV] Admin WhatsApp OTP for tenant ${tenantId}: ${code} (static, not sent via WhatsApp)`);
    } else {
      // Send OTP via WhatsApp using the platform's shared WABA
      await this.sendWhatsAppOtp(fullPhone, code);
      this.logger.log(`Admin WhatsApp OTP sent to ${fullPhone} for tenant ${tenantId}`);
    }

    return { sent: true, message: 'Verification code sent to your WhatsApp number.' };
  }

  async verifyOtp(tenantId: string, phone: string, code: string) {
    const entry = this.otpStore.get(tenantId);

    if (!entry) {
      throw new BadRequestException('No verification code found. Please request a new one.');
    }

    if (Date.now() > entry.expiresAt) {
      this.otpStore.delete(tenantId);
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    const normalized = phone.replace(/[\s\-()]/g, '');
    const fullPhone = normalized.startsWith('+') ? normalized : `+${normalized}`;

    if (entry.phone !== fullPhone) {
      throw new BadRequestException('Phone number does not match. Please request a new code.');
    }

    entry.attempts++;
    if (entry.attempts > this.MAX_ATTEMPTS) {
      this.otpStore.delete(tenantId);
      throw new BadRequestException('Too many attempts. Please request a new verification code.');
    }

    if (entry.code !== code) {
      throw new BadRequestException(`Invalid code. ${this.MAX_ATTEMPTS - entry.attempts} attempts remaining.`);
    }

    // OTP verified — save to tenant
    this.otpStore.delete(tenantId);
    await this.tenantRepo.update(tenantId, {
      adminWhatsappNumber: fullPhone,
      adminWhatsappVerified: true,
    });

    this.logger.log(`Admin WhatsApp verified: ${fullPhone} for tenant ${tenantId}`);
    return { verified: true, message: 'WhatsApp number verified successfully!' };
  }

  /**
   * Save admin WhatsApp number directly (static mode — no OTP verification).
   * Checks that the number isn't already used by another admin.
   */
  async saveAdminWhatsapp(tenantId: string, phone: string) {
    const normalized = phone.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{10,15}$/.test(normalized)) {
      throw new BadRequestException('Invalid phone number format. Use international format, e.g. +919876543210');
    }
    const fullPhone = normalized.startsWith('+') ? normalized : `+${normalized}`;

    // Check uniqueness — no other tenant should have this number as admin WhatsApp
    await this.checkAdminPhoneUniqueness(fullPhone, tenantId);

    await this.tenantRepo.update(tenantId, {
      adminWhatsappNumber: fullPhone,
      adminWhatsappVerified: false,
    });

    this.logger.log(`Admin WhatsApp saved (static): ${fullPhone} for tenant ${tenantId}`);
    return { saved: true, phone: fullPhone, message: 'Admin WhatsApp number saved successfully.' };
  }

  /**
   * Update (change) admin WhatsApp number.
   * Checks uniqueness and saves the new number.
   */
  async updateAdminWhatsapp(tenantId: string, phone: string) {
    return this.saveAdminWhatsapp(tenantId, phone);
  }

  async removeAdminWhatsapp(tenantId: string) {
    await this.tenantRepo.update(tenantId, {
      adminWhatsappNumber: null as any,
      adminWhatsappVerified: false,
    });
    this.logger.log(`Admin WhatsApp removed for tenant ${tenantId}`);
    return { removed: true, message: 'Admin WhatsApp number removed.' };
  }

  /**
   * Check that the phone number is not already registered as admin WhatsApp for another tenant.
   */
  private async checkAdminPhoneUniqueness(phone: string, excludeTenantId: string) {
    const existing = await this.tenantRepo.findOne({
      where: { adminWhatsappNumber: phone },
      select: ['id'],
    });
    if (existing && existing.id !== excludeTenantId) {
      throw new BadRequestException('This WhatsApp number is already registered as admin for another account.');
    }
  }

  private enforceRateLimit(tenantId: string) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const sends = this.sendTracker.get(tenantId) || [];
    const recentSends = sends.filter(t => now - t < windowMs);

    if (recentSends.length >= this.MAX_SENDS_PER_INTERVAL) {
      throw new BadRequestException('Too many OTP requests. Please wait 15 minutes before trying again.');
    }

    recentSends.push(now);
    this.sendTracker.set(tenantId, recentSends);
  }

  private async sendWhatsAppOtp(to: string, code: string) {
    // Get platform's shared WABA and a phone number that can send messages
    const platformWaba = await this.wabaAccountRepo.findOne({
      where: { status: 'active' },
      order: { createdAt: 'ASC' },
    });

    if (!platformWaba) {
      throw new BadRequestException('Platform WhatsApp Business Account is not configured. Please contact support.');
    }

    const accessToken = await this.metaTokenService.getActiveToken(platformWaba.id);
    if (!accessToken) {
      throw new BadRequestException('Platform access token is not configured. Please contact support.');
    }

    // Find an active phone number under the platform WABA to send from
    const senderPhone = await this.phoneNumberRepo.findOne({
      where: { wabaAccountId: platformWaba.id, status: 'active' },
      order: { createdAt: 'ASC' },
    });

    if (!senderPhone || !senderPhone.phoneNumberId) {
      throw new BadRequestException('No active sender phone number configured. Please contact support.');
    }

    // Strip + from the recipient number (Meta API expects without +)
    const recipient = to.replace(/^\+/, '');

    // Use the approved authentication template (works outside 24-hour window)
    await this.whatsappApiService.sendTemplate(
      senderPhone.phoneNumberId,
      accessToken,
      recipient,
      'admin_otp_verification',
      'en',
      [
        {
          type: 'body',
          parameters: [{ type: 'text', text: code }],
        },
      ],
    );
  }
}
