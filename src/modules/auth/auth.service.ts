import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
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
