import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

export type SocialProvider = 'google' | 'meta';

/** Returned to the super-admin UI — secrets are masked, never the plaintext. */
export interface PlatformConfigView {
  googleClientId: string;
  googleClientSecretSet: boolean;
  googleLoginEnabled: boolean;
  metaAppId: string;
  metaAppSecretSet: boolean;
  metaEmbeddedSignupConfigId: string;
  metaLoginEnabled: boolean;
  // Whether each provider is actually usable (configured + enabled).
  googleAvailable: boolean;
  metaAvailable: boolean;
  // When on, tenants may register a number directly (no Facebook account) in
  // addition to Embedded Signup. When off, only Embedded Signup is offered.
  directRegistrationEnabled: boolean;
  // Platform billing: when on, the platform's credit line is attached to each
  // new customer WABA at Embedded Signup, so ALL messaging is billed to the
  // platform (the customer is never charged by Meta).
  creditLineSharingEnabled: boolean;
  metaCreditLineId: string;
  metaBillingCurrency: string;
}

export interface UpdatePlatformConfigDto {
  googleClientId?: string;
  googleClientSecret?: string; // omit or send the mask sentinel to leave unchanged
  googleLoginEnabled?: boolean;
  metaAppId?: string;
  metaAppSecret?: string;
  metaEmbeddedSignupConfigId?: string;
  metaLoginEnabled?: boolean;
  directRegistrationEnabled?: boolean;
  creditLineSharingEnabled?: boolean;
  metaCreditLineId?: string;
  metaBillingCurrency?: string;
}

const SECRET_MASK = '••••••••';

/**
 * Platform-wide configuration that a SUPER-ADMIN manages from the dashboard
 * (Google OAuth client/secret, Meta app for social login + embedded signup,
 * and per-provider enable toggles). Stored in public.platform_config; secrets
 * are encrypted at rest with the same scheme as Meta tokens.
 *
 * Every getter falls back to the environment variable, so existing env-based
 * deployments keep working until a super-admin overrides a value in the UI.
 *
 * NOTE: This does NOT manage WABA accounts / system-user tokens — those stay in
 * waba_accounts / meta_tokens and are configured from the WABA dashboard.
 */
@Injectable()
export class PlatformConfigService implements OnModuleInit {
  private readonly logger = new Logger(PlatformConfigService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key || key.length < 32 || key.includes('default')) {
      throw new Error(
        'FATAL: TOKEN_ENCRYPTION_KEY must be set to a secure 32+ character random string.',
      );
    }
    this.encryptionKey = createHash('sha256').update(key).digest();
  }

  async onModuleInit(): Promise<void> {
    // Self-creating + idempotent: there is no public-schema migration runner.
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS public.platform_config (
          key VARCHAR(64) PRIMARY KEY,
          value TEXT,
          is_secret BOOLEAN NOT NULL DEFAULT false,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    } catch (e: any) {
      this.logger.error(`Failed to ensure platform_config table: ${e?.message || e}`);
    }
  }

  // ─── Low-level get/set ─────────────────────────────────────────────────────

  /**
   * Decrypted value from DB, or null if unset. NEVER throws — any DB error
   * (e.g. the table not existing yet) returns null so callers fall back to env.
   * This guarantees the existing env-based WABA/Meta flows can never break
   * because of this table.
   */
  private async getRaw(key: string): Promise<string | null> {
    try {
      const rows = await this.dataSource.query(
        `SELECT value, is_secret FROM public.platform_config WHERE key = $1`,
        [key],
      );
      if (!rows[0] || rows[0].value == null || rows[0].value === '') return null;
      if (rows[0].is_secret) {
        try {
          return this.decrypt(rows[0].value);
        } catch {
          return null;
        }
      }
      return rows[0].value;
    } catch (e: any) {
      this.logger.warn(`platform_config read failed for "${key}", falling back to env: ${e?.message || e}`);
      return null;
    }
  }

  /** DB value if present, otherwise the environment variable. */
  private async getWithFallback(key: string, envKey: string): Promise<string> {
    const dbVal = await this.getRaw(key);
    if (dbVal != null && dbVal !== '') return dbVal;
    return this.config.get<string>(envKey, '') || '';
  }

  private async setOne(key: string, value: string, isSecret: boolean): Promise<void> {
    const stored = isSecret && value ? this.encrypt(value) : value;
    await this.dataSource.query(
      `INSERT INTO public.platform_config (key, value, is_secret, updated_at)
         VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret, updated_at = NOW()`,
      [key, stored, isSecret],
    );
  }

  // ─── Typed accessors used across the app ───────────────────────────────────

  async getGoogleCreds(): Promise<{ clientId: string; clientSecret: string }> {
    return {
      clientId: await this.getWithFallback('google_client_id', 'GOOGLE_CLIENT_ID'),
      clientSecret: await this.getWithFallback('google_client_secret', 'GOOGLE_CLIENT_SECRET'),
    };
  }

  async getMetaCreds(): Promise<{ appId: string; appSecret: string; configId: string }> {
    return {
      appId: await this.getWithFallback('meta_app_id', 'META_APP_ID'),
      appSecret: await this.getWithFallback('meta_app_secret', 'META_APP_SECRET'),
      configId: await this.getWithFallback('meta_embedded_signup_config_id', 'META_EMBEDDED_SIGNUP_CONFIG_ID'),
    };
  }

  /** Is the provider toggle on? Defaults to ON when unset (so env-only setups work). */
  private async isEnabled(provider: SocialProvider): Promise<boolean> {
    const raw = await this.getRaw(provider === 'google' ? 'google_login_enabled' : 'meta_login_enabled');
    if (raw == null) return true;
    return raw === 'true';
  }

  /** A provider is offered to tenants only when configured AND enabled. */
  async isProviderAvailable(provider: SocialProvider): Promise<boolean> {
    if (!(await this.isEnabled(provider))) return false;
    if (provider === 'google') {
      const { clientId, clientSecret } = await this.getGoogleCreds();
      return !!(clientId && clientSecret);
    }
    const { appId, appSecret } = await this.getMetaCreds();
    return !!(appId && appSecret);
  }

  async getAvailableProviders(): Promise<{ google: boolean; meta: boolean }> {
    return {
      google: await this.isProviderAvailable('google'),
      meta: await this.isProviderAvailable('meta'),
    };
  }

  /** Direct (no-Facebook) number registration toggle. Defaults OFF (Embedded Signup only). */
  async isDirectRegistrationEnabled(): Promise<boolean> {
    return (await this.getRaw('direct_registration_enabled')) === 'true';
  }

  /**
   * Platform credit-line sharing config. When enabled (and a credit line id is
   * set), the platform's credit line is attached to each new customer WABA so
   * the PLATFORM is billed for all messaging and the customer is never charged.
   * Defaults OFF.
   */
  async getCreditLineConfig(): Promise<{ enabled: boolean; creditLineId: string; currency: string }> {
    const creditLineId = await this.getWithFallback('meta_credit_line_id', 'META_CREDIT_LINE_ID');
    const currency = (await this.getWithFallback('meta_billing_currency', 'META_BILLING_CURRENCY')) || 'USD';
    const rawEnabled = await this.getRaw('credit_line_sharing_enabled');
    return { enabled: rawEnabled === 'true', creditLineId, currency };
  }

  // ─── Super-admin read/write ────────────────────────────────────────────────

  async getAdminView(): Promise<PlatformConfigView> {
    const google = await this.getGoogleCreds();
    const meta = await this.getMetaCreds();
    return {
      googleClientId: google.clientId,
      googleClientSecretSet: !!google.clientSecret,
      googleLoginEnabled: await this.isEnabled('google'),
      metaAppId: meta.appId,
      metaAppSecretSet: !!meta.appSecret,
      metaEmbeddedSignupConfigId: meta.configId,
      metaLoginEnabled: await this.isEnabled('meta'),
      googleAvailable: await this.isProviderAvailable('google'),
      metaAvailable: await this.isProviderAvailable('meta'),
      directRegistrationEnabled: await this.isDirectRegistrationEnabled(),
      ...(await (async () => {
        const cl = await this.getCreditLineConfig();
        return {
          creditLineSharingEnabled: cl.enabled,
          metaCreditLineId: cl.creditLineId,
          metaBillingCurrency: cl.currency,
        };
      })()),
    };
  }

  async update(dto: UpdatePlatformConfigDto): Promise<PlatformConfigView> {
    if (dto.googleClientId !== undefined) await this.setOne('google_client_id', dto.googleClientId.trim(), false);
    if (dto.metaAppId !== undefined) await this.setOne('meta_app_id', dto.metaAppId.trim(), false);
    if (dto.metaEmbeddedSignupConfigId !== undefined)
      await this.setOne('meta_embedded_signup_config_id', dto.metaEmbeddedSignupConfigId.trim(), false);
    if (dto.googleLoginEnabled !== undefined)
      await this.setOne('google_login_enabled', dto.googleLoginEnabled ? 'true' : 'false', false);
    if (dto.metaLoginEnabled !== undefined)
      await this.setOne('meta_login_enabled', dto.metaLoginEnabled ? 'true' : 'false', false);
    if (dto.directRegistrationEnabled !== undefined)
      await this.setOne('direct_registration_enabled', dto.directRegistrationEnabled ? 'true' : 'false', false);
    if (dto.creditLineSharingEnabled !== undefined)
      await this.setOne('credit_line_sharing_enabled', dto.creditLineSharingEnabled ? 'true' : 'false', false);
    if (dto.metaCreditLineId !== undefined)
      await this.setOne('meta_credit_line_id', dto.metaCreditLineId.trim(), false);
    if (dto.metaBillingCurrency !== undefined)
      await this.setOne('meta_billing_currency', (dto.metaBillingCurrency.trim() || 'USD').toUpperCase(), false);

    // Secrets: only overwrite when a real new value is provided (not the mask, not blank).
    if (dto.googleClientSecret !== undefined && dto.googleClientSecret !== SECRET_MASK && dto.googleClientSecret.trim()) {
      await this.setOne('google_client_secret', dto.googleClientSecret.trim(), true);
    }
    if (dto.metaAppSecret !== undefined && dto.metaAppSecret !== SECRET_MASK && dto.metaAppSecret.trim()) {
      await this.setOne('meta_app_secret', dto.metaAppSecret.trim(), true);
    }

    return this.getAdminView();
  }

  // ─── Encryption (same scheme as MetaTokenService) ──────────────────────────

  private encrypt(plainText: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
