import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { SuperAdmin } from '../../database/entities/public/super-admin.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { RegisterDto } from './dto/register.dto';

export interface UnifiedLoginResult {
  type: 'admin' | 'tenant_user';
  admin?: any;
  user?: any;
  tenantId?: string;
  tenantSchema?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly connectionManager: TenantConnectionManager,
    @InjectRepository(SuperAdmin)
    private readonly adminRepository: Repository<SuperAdmin>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Unified login: checks super_admins first, then searches all tenant schemas for the email.
   */
  async unifiedLogin(email: string, password: string): Promise<UnifiedLoginResult> {
    // 0. Desktop hybrid auth: when ONLINE the cloud account is the source of truth —
    //    a successful cloud login is mirrored into the local DB (user row + bcrypt of
    //    the typed password), so the SAME credentials keep working OFFLINE later.
    //    Unreachable cloud (offline) or a cloud reject both fall through to the local
    //    check — local-only accounts (provisioned owner, test users) stay valid.
    await this.desktopCloudMirrorLogin(email, password);

    // 1. Check super_admins table
    const admin = await this.adminRepository.findOne({ where: { email } });
    if (admin) {
      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) throw new UnauthorizedException('Invalid credentials');
      const { passwordHash, ...adminResult } = admin;
      return { type: 'admin', admin: adminResult };
    }

    // 2. Search tenant schemas for user with this email
    const tenants = await this.tenantRepository.find({
      where: { status: 'active' },
      select: ['id', 'schemaName'],
    });

    for (const tenant of tenants) {
      try {
        const user = await this.connectionManager.executeInTenantContext(
          tenant.schemaName,
          async (qr) => {
            const result = await qr.query(
              `SELECT id, phone, name, email, password_hash, role, language, is_active FROM users WHERE email = $1`,
              [email],
            );
            return result[0] || null;
          },
        );

        if (user) {
          if (!user.is_active) {
            throw new UnauthorizedException('Account is disabled');
          }
          const isValid = await bcrypt.compare(password, user.password_hash);
          if (!isValid) throw new UnauthorizedException('Invalid credentials');

          // Update last login
          await this.connectionManager.executeInTenantContext(tenant.schemaName, async (qr) => {
            await qr.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
          });

          const { password_hash, ...userResult } = user;
          return {
            type: 'tenant_user',
            user: userResult,
            tenantId: tenant.id,
            tenantSchema: tenant.schemaName,
          };
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        continue;
      }
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  async validateUser(tenantSchema: string, phone: string, password: string): Promise<any> {
    const user = await this.connectionManager.executeInTenantContext(
      tenantSchema,
      async (qr) => {
        const result = await qr.query(
          `SELECT id, phone, name, email, password_hash, role, language, is_active FROM users WHERE phone = $1`,
          [phone],
        );
        return result[0] || null;
      },
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.connectionManager.executeInTenantContext(tenantSchema, async (qr) => {
      await qr.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    });

    const { password_hash, ...result } = user;
    return result;
  }

  /**
   * Find an existing tenant user for a social-login identity, matching first on
   * (provider, provider_user_id) then falling back to a verified email match
   * (account linking). Returns the login result shape, or null if not found.
   */
  async findOAuthUser(
    provider: 'google' | 'meta',
    providerUserId: string,
    email: string | null,
  ): Promise<UnifiedLoginResult | null> {
    const tenants = await this.tenantRepository.find({
      where: { status: 'active' },
      select: ['id', 'schemaName'],
    });

    for (const tenant of tenants) {
      try {
        const user = await this.connectionManager.executeInTenantContext(
          tenant.schemaName,
          async (qr) => {
            const byProvider = await qr.query(
              `SELECT id, phone, name, email, role, language, is_active, auth_provider
                 FROM users WHERE auth_provider = $1 AND provider_user_id = $2 LIMIT 1`,
              [provider, providerUserId],
            );
            if (byProvider[0]) return byProvider[0];
            if (email) {
              const byEmail = await qr.query(
                `SELECT id, phone, name, email, role, language, is_active, auth_provider
                   FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
                [email],
              );
              return byEmail[0] || null;
            }
            return null;
          },
        );

        if (user) {
          if (!user.is_active) throw new UnauthorizedException('Account is disabled');
          // Link the provider identity + refresh last login.
          await this.connectionManager.executeInTenantContext(tenant.schemaName, async (qr) => {
            await qr.query(
              `UPDATE users
                 SET last_login_at = NOW(),
                     auth_provider = CASE WHEN auth_provider = 'password' THEN auth_provider ELSE $2 END,
                     provider_user_id = COALESCE(provider_user_id, $3),
                     email_verified = true
               WHERE id = $1`,
              [user.id, provider, providerUserId],
            );
          });
          return {
            type: 'tenant_user',
            user,
            tenantId: tenant.id,
            tenantSchema: tenant.schemaName,
          };
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        continue;
      }
    }
    return null;
  }

  /**
   * Desktop-mode online-first auth (no-op unless DESKTOP_MODE=1 + DESKTOP_CLOUD_API).
   * Tries the cloud /auth/login with a short timeout:
   *   - cloud OK      → upsert the local mirror user with a fresh hash of the typed
   *                     password (the offline credential cache), so the local login
   *                     below succeeds; the sync relay then reconciles the data.
   *   - cloud reject  → do nothing; the local check decides (local-only accounts).
   *   - unreachable   → do nothing; offline login runs on the cached credentials.
   */
  private async desktopCloudMirrorLogin(email: string, password: string): Promise<void> {
    const base = process.env.DESKTOP_MODE === '1' ? process.env.DESKTOP_CLOUD_API : '';
    if (!base || !email || !password) return;

    let cloudUser: any = null;
    let cookie = '';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return; // cloud says no — let the local check decide
      // Capture the session cookie so we can ask the cloud what this account is
      // licensed for (the offline-app entitlement check below).
      const setCookies = (res.headers as any).getSetCookie?.() as string[] | undefined;
      cookie = (setCookies?.length
        ? setCookies.map((c) => c.split(';')[0])
        : [(res.headers.get('set-cookie') || '').split(';')[0]]
      ).filter(Boolean).join('; ');
      try {
        const body = (await res.json()) as any;
        cloudUser = body?.data?.user ?? body?.user ?? null;
      } catch {
        /* body optional */
      }
    } catch {
      return; // offline / cloud unreachable — cached local credentials decide
    }

    // Offline-app licensing gate: the downloaded desktop (offline) app is only for
    // tenants whose plan includes `erpOffline`. Online login just succeeded, so the
    // cloud is reachable — ask it what this account is licensed for and REFUSE the
    // offline login when the entitlement is missing (the web/online version stays
    // available in a browser). A definitive "not licensed" throws; an ambiguous
    // network/parse failure is lenient so cached-credential offline use still works.
    await this.assertOfflineEntitled(base, cookie);

    // Cloud accepted → refresh the local credential cache.
    try {
      const hash = await bcrypt.hash(password, 12);
      const tenants = await this.tenantRepository.find({
        where: { status: 'active' },
        select: ['id', 'schemaName', 'slug'],
      });

      for (const tenant of tenants) {
        const done = await this.connectionManager.executeInTenantContext(tenant.schemaName, async (qr) => {
          const row = (await qr.query(`SELECT id, password_hash FROM users WHERE email = $1`, [email]))[0];
          if (!row) return false;
          // Only rewrite when the cached hash no longer matches (password changed in cloud).
          if (!(await bcrypt.compare(password, row.password_hash || ''))) {
            await qr.query(`UPDATE users SET password_hash = $2, is_active = true WHERE id = $1`, [row.id, hash]);
          }
          return true;
        });
        if (done) return;
      }

      // First login of a cloud account on this device: create the mirror user in the
      // tenant this install syncs (SYNC_TENANT_SLUG), falling back to the first tenant.
      const slug = process.env.SYNC_TENANT_SLUG;
      const target = (slug && tenants.find((t) => t.slug === slug)) || tenants[0];
      if (!target) return;
      await this.connectionManager.executeInTenantContext(target.schemaName, async (qr) => {
        await qr.query(
          `INSERT INTO users (phone, name, email, password_hash, role)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [
            cloudUser?.phone || null,
            cloudUser?.name || email.split('@')[0],
            email,
            hash,
            cloudUser?.role || 'owner',
          ],
        );
      });
    } catch (err) {
      // The mirror is a convenience — never block login on it.
      console.error('[desktop-auth] cloud mirror failed:', (err as Error).message);
    }
  }

  /**
   * Offline-desktop-app entitlement gate. Reads the cloud account's licensed
   * features (via /auth/me using the just-issued session cookie) and throws when
   * `erpOffline` is absent. Only a definitive negative blocks login; any transport
   * or parsing failure is swallowed so a genuinely-offline relaunch on cached
   * credentials is never locked out by a transient hiccup.
   */
  private async assertOfflineEntitled(base: string, cookie: string): Promise<void> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${base}/auth/me`, {
        headers: cookie ? { cookie } : {},
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return; // cannot determine — stay lenient
      const body = (await res.json()) as any;
      const sub = body?.data?.subscription ?? body?.subscription ?? null;
      const features: string[] = sub?.enabledFeatures ?? [];
      // Only enforce when we got a real subscription payload back.
      if (sub && Array.isArray(features) && !features.includes('erpOffline')) {
        throw new ForbiddenException(
          'This account is not licensed for the offline desktop app. Your plan includes the online version — please use it in your web browser, or upgrade to add the offline desktop app.',
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      // network / parse failure — leave the cached-credential path to decide.
    }
  }

  /** Is this email already used by a super-admin? (social signup should not shadow admins) */
  async isAdminEmail(email: string): Promise<boolean> {
    const admin = await this.adminRepository.findOne({ where: { email } });
    return !!admin;
  }

  async register(tenantSchema: string, dto: RegisterDto): Promise<any> {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.connectionManager.executeInTenantContext(
      tenantSchema,
      async (qr) => {
        const result = await qr.query(
          `INSERT INTO users (phone, name, email, password_hash, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, phone, name, email, role, language`,
          [dto.phone, dto.name, dto.email, passwordHash, dto.role || 'staff'],
        );
        return result[0];
      },
    );

    return user;
  }
}
