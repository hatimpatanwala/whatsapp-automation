import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

/**
 * Platform-wide email/phone uniqueness for login accounts.
 *
 * An email may back exactly ONE live account across the whole platform — a main
 * (owner) account OR a role/staff account under any company. It only frees up
 * again when that account is DEACTIVATED (`users.is_active = false`) or its
 * company is DELETED (tenant `status <> 'active'`, whose schema is dropped and
 * therefore never scanned). Enforcing this at every account-creation path keeps
 * the same person from being registered twice, which would clash on login.
 */
@Injectable()
export class EmailRegistryService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly cm: TenantConnectionManager,
  ) {}

  /** Is `email` held by an ACTIVE user in any ACTIVE tenant? */
  isEmailTaken(email: string): Promise<boolean> {
    return this.isTaken('email', email);
  }

  /** Is `phone` held by an ACTIVE user in any ACTIVE tenant? */
  isPhoneTaken(phone: string): Promise<boolean> {
    return this.isTaken('phone', phone);
  }

  private async isTaken(field: 'email' | 'phone', raw: string): Promise<boolean> {
    const value = field === 'email' ? raw?.trim().toLowerCase() : raw?.trim();
    if (!value) return false;
    const tenants = await this.tenants.find({ where: { status: 'active' }, select: ['id', 'schemaName'] });
    for (const t of tenants) {
      try {
        const found = await this.cm.executeInTenantContext(t.schemaName, (qr) =>
          qr.query(
            `SELECT 1 FROM "${t.schemaName}".users WHERE lower(${field}) = lower($1) AND is_active = true LIMIT 1`,
            [value],
          ),
        );
        if (found.length) return true;
      } catch {
        // A tenant mid-provision / missing users table shouldn't block the check.
        continue;
      }
    }
    return false;
  }
}
