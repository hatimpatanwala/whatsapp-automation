import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { randomInt } from 'crypto';

interface OtpEntry {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
  signupData: {
    name: string;
    email: string;
    password: string;
    businessName?: string;
  };
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly otpStore = new Map<string, OtpEntry>();
  private readonly OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_ATTEMPTS = 5;
  private readonly MAX_SENDS_PER_INTERVAL = 3;
  private readonly sendTracker = new Map<string, number[]>();
  private readonly isDev: boolean;
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.isDev = configService.get<string>('NODE_ENV', 'development') !== 'production';

    const smtpHost = configService.get<string>('SMTP_HOST', '');
    this.fromEmail = configService.get<string>('SMTP_FROM', 'noreply@wacommerce.com');

    if (smtpHost) {
      const smtpUser = configService.get<string>('SMTP_USER', '');
      const smtpPass = configService.get<string>('SMTP_PASS', '');
      const smtpPort = configService.get<number>('SMTP_PORT', 25);

      const transportOpts: any = {
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
      };

      if (smtpUser && smtpPass) {
        transportOpts.auth = { user: smtpUser, pass: smtpPass };
      }
      // TLS certificate validation stays on by default; only relax it if a
      // deployment explicitly opts in for an internal relay with a self-signed cert.
      if (configService.get<string>('SMTP_TLS_INSECURE', 'false') === 'true') {
        transportOpts.tls = { rejectUnauthorized: false };
      }

      this.transporter = nodemailer.createTransport(transportOpts);
      this.logger.log(`SMTP transport configured (host=${smtpHost}, port=${smtpPort}, auth=${!!smtpUser})`);
    } else if (!this.isDev) {
      this.logger.warn('No SMTP_HOST configured — email OTPs will be logged only');
    }
  }

  async sendOtp(signupData: { name: string; email: string; password: string; businessName?: string }) {
    const email = signupData.email.toLowerCase().trim();

    this.enforceRateLimit(email);

    // Always a cryptographically random 6-digit code (never a static value).
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    this.otpStore.set(email, {
      code,
      email,
      expiresAt: Date.now() + this.OTP_TTL_MS,
      attempts: 0,
      signupData: { ...signupData, email },
    });

    if (this.isDev) {
      this.logger.log(`[DEV] Email verification OTP for ${email}: ${code}`);
    } else if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.fromEmail,
          to: email,
          subject: 'WA Commerce - Verify Your Email',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #059669; margin: 0;">WA Commerce</h2>
              </div>
              <p>Hi ${signupData.name},</p>
              <p>Your verification code is:</p>
              <div style="text-align: center; margin: 24px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111827; background: #f3f4f6; padding: 12px 24px; border-radius: 8px;">${code}</span>
              </div>
              <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
            </div>
          `,
        });
        this.logger.log(`Email verification OTP sent to ${email}`);
      } catch (err: any) {
        this.logger.error(`Failed to send email OTP to ${email}: ${err.message}`);
        this.logger.log(`[FALLBACK] Email verification OTP for ${email}: ${code}`);
      }
    } else {
      this.logger.log(`[NO-SMTP] Email verification OTP for ${email}: ${code}`);
    }

    return { sent: true, message: `Verification code sent to ${email}` };
  }

  verifyOtp(email: string, code: string): { name: string; email: string; password: string; businessName?: string } {
    const normalizedEmail = email.toLowerCase().trim();
    const entry = this.otpStore.get(normalizedEmail);

    if (!entry) {
      throw new BadRequestException('No verification code found. Please request a new one.');
    }

    if (Date.now() > entry.expiresAt) {
      this.otpStore.delete(normalizedEmail);
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    entry.attempts++;
    if (entry.attempts > this.MAX_ATTEMPTS) {
      this.otpStore.delete(normalizedEmail);
      throw new BadRequestException('Too many attempts. Please request a new verification code.');
    }

    if (entry.code !== code) {
      throw new BadRequestException(`Invalid code. ${this.MAX_ATTEMPTS - entry.attempts} attempts remaining.`);
    }

    const signupData = entry.signupData;
    this.otpStore.delete(normalizedEmail);
    return signupData;
  }

  private enforceRateLimit(email: string) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const sends = this.sendTracker.get(email) || [];
    const recentSends = sends.filter(t => now - t < windowMs);

    if (recentSends.length >= this.MAX_SENDS_PER_INTERVAL) {
      throw new BadRequestException('Too many verification requests. Please wait 15 minutes before trying again.');
    }

    recentSends.push(now);
    this.sendTracker.set(email, recentSends);
  }
}
