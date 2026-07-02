import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { TeamEntitlementService } from '../erp/common/team-entitlement.service';

/** Roles a store owner can hand out to staff (the owner role is not assignable here). */
export const STAFF_ROLES = ['accountant', 'employee', 'salesman', 'seller', 'staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  phone: string | null;
  whatsappNumber: string | null;
  whatsappVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

/**
 * Team / staff management (tenant-scoped). Staff are ordinary `users` rows with a
 * non-owner role and a verifiable WhatsApp number — that number is how the bot
 * recognises them and shows a role-scoped menu (see StaffCommandService).
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly entitlements: TeamEntitlementService,
  ) {}

  /** Count of active (non-owner) team members — what the plan cap applies to. */
  private async countMembers(schema: string): Promise<number> {
    const r = await this.q(schema, (qr) =>
      qr.query(`SELECT COUNT(*)::int AS n FROM users WHERE role <> 'owner' AND is_active = true`),
    );
    return Number(r[0]?.n || 0);
  }

  /** Effective team entitlement + current usage — drives the tenant Team UI. */
  async getConfig(schema: string, tenantId: string): Promise<{ allowedRoles: string[]; memberLimit: number | null; used: number; source: string }> {
    const ent = await this.entitlements.resolve(tenantId);
    const used = await this.countMembers(schema);
    return { allowedRoles: ent.roles, memberLimit: ent.memberLimit, used, source: ent.source };
  }

  /** Digits-only form used for WhatsApp number matching (mirrors the admin check). */
  static digits(s?: string | null): string {
    return (s || '').replace(/\D/g, '');
  }

  /** Normalise a typed number to +E.164 (throws on nonsense). */
  private normalize(phone: string): string {
    const n = (phone || '').replace(/[\s\-()]/g, '');
    if (!/^\+?\d{10,15}$/.test(n)) {
      throw new BadRequestException('Invalid WhatsApp number. Use international format, e.g. +919876543210');
    }
    return n.startsWith('+') ? n : `+${n}`;
  }

  private row(r: any): StaffMember {
    return {
      id: r.id,
      name: r.name,
      email: r.email ?? null,
      role: r.role,
      phone: r.phone ?? null,
      whatsappNumber: r.whatsapp_number ?? null,
      whatsappVerified: !!r.whatsapp_verified,
      isActive: r.is_active !== false,
      createdAt: r.created_at,
    };
  }

  private q<T = any>(schema: string, fn: (qr: any) => Promise<T>): Promise<T> {
    return this.cm.executeInTenantContext(schema, fn);
  }

  /** All non-owner team members (the staff roster shown in the portal). */
  async list(schema: string): Promise<StaffMember[]> {
    const rows = await this.q(schema, (qr) =>
      qr.query(
        `SELECT id, name, email, role, phone, whatsapp_number, whatsapp_verified, is_active, created_at
           FROM users WHERE role <> 'owner' ORDER BY created_at DESC`,
      ),
    );
    return rows.map((r: any) => this.row(r));
  }

  /** Add a staff member. WhatsApp stays UNVERIFIED until an OTP round-trip. */
  async add(schema: string, tenantId: string, input: { name: string; role: string; whatsappNumber: string; email?: string }): Promise<StaffMember> {
    const name = (input.name || '').trim();
    if (name.length < 2) throw new BadRequestException('Enter the staff member’s name.');
    const role = (input.role || '').trim();
    if (!STAFF_ROLES.includes(role as StaffRole)) {
      throw new BadRequestException(`Role must be one of: ${STAFF_ROLES.join(', ')}`);
    }

    // Enforce the tenant's plan/super-admin team entitlement.
    const ent = await this.entitlements.resolve(tenantId);
    if (!ent.roles.includes(role)) {
      throw new BadRequestException(
        ent.roles.length
          ? `Your plan doesn’t allow the “${role}” role. Allowed roles: ${ent.roles.join(', ')}.`
          : 'Your plan doesn’t include team members. Upgrade to add staff.',
      );
    }
    if (ent.memberLimit != null && (await this.countMembers(schema)) >= ent.memberLimit) {
      throw new BadRequestException(`You’ve reached your team limit of ${ent.memberLimit} member(s). Upgrade your plan to add more.`);
    }

    const waE164 = this.normalize(input.whatsappNumber);
    const waDigits = TeamService.digits(waE164);

    return this.q(schema, async (qr) => {
      const clash = (await qr.query(
        `SELECT id FROM users WHERE regexp_replace(COALESCE(whatsapp_number,''), '\\D', '', 'g') = $1 LIMIT 1`,
        [waDigits],
      ))[0];
      if (clash) throw new BadRequestException('A team member with this WhatsApp number already exists.');

      const inserted = (await qr.query(
        `INSERT INTO users (phone, email, name, role, whatsapp_number, whatsapp_verified, auth_provider, is_active)
         VALUES ($1, $2, $3, $4, $5, false, 'password', true)
         RETURNING id, name, email, role, phone, whatsapp_number, whatsapp_verified, is_active, created_at`,
        [waE164, (input.email || '').trim() || null, name, role, waE164],
      ))[0];
      return this.row(inserted);
    });
  }

  async updateRole(schema: string, tenantId: string, id: string, role: string): Promise<StaffMember> {
    if (!STAFF_ROLES.includes(role as StaffRole)) {
      throw new BadRequestException(`Role must be one of: ${STAFF_ROLES.join(', ')}`);
    }
    const ent = await this.entitlements.resolve(tenantId);
    if (!ent.roles.includes(role)) {
      throw new BadRequestException(`Your plan doesn’t allow the “${role}” role. Allowed roles: ${ent.roles.join(', ') || 'none'}.`);
    }
    return this.q(schema, async (qr) => {
      const r = (await qr.query(
        `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND role <> 'owner'
         RETURNING id, name, email, role, phone, whatsapp_number, whatsapp_verified, is_active, created_at`,
        [role, id],
      ))[0];
      if (!r) throw new NotFoundException('Team member not found.');
      return this.row(r);
    });
  }

  /** Soft-remove (deactivate) — preserves any orders assigned to this member. */
  async setActive(schema: string, id: string, active: boolean): Promise<StaffMember> {
    return this.q(schema, async (qr) => {
      const r = (await qr.query(
        `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND role <> 'owner'
         RETURNING id, name, email, role, phone, whatsapp_number, whatsapp_verified, is_active, created_at`,
        [active, id],
      ))[0];
      if (!r) throw new NotFoundException('Team member not found.');
      return this.row(r);
    });
  }

  async findById(schema: string, id: string): Promise<StaffMember | null> {
    const r = (await this.q(schema, (qr) =>
      qr.query(
        `SELECT id, name, email, role, phone, whatsapp_number, whatsapp_verified, is_active, created_at
           FROM users WHERE id = $1 LIMIT 1`,
        [id],
      ),
    ))[0];
    return r ? this.row(r) : null;
  }

  /**
   * Resolve an inbound WhatsApp number to a staff member (verified or pending).
   * Includes unverified rows so the webhook can catch an OTP reply.
   */
  async findByWhatsapp(schema: string, fromDigits: string): Promise<StaffMember | null> {
    if (!fromDigits) return null;
    const r = (await this.q(schema, (qr) =>
      qr.query(
        `SELECT id, name, email, role, phone, whatsapp_number, whatsapp_verified, is_active, created_at
           FROM users
          WHERE is_active = true
            AND regexp_replace(COALESCE(whatsapp_number,''), '\\D', '', 'g') = $1
          LIMIT 1`,
        [fromDigits],
      ),
    ))[0];
    return r ? this.row(r) : null;
  }

  /** Verified employees available for order assignment. */
  async listAssignableEmployees(schema: string): Promise<StaffMember[]> {
    const rows = await this.q(schema, (qr) =>
      qr.query(
        `SELECT id, name, email, role, phone, whatsapp_number, whatsapp_verified, is_active, created_at
           FROM users
          WHERE is_active = true AND role = 'employee'
          ORDER BY name ASC`,
      ),
    );
    return rows.map((r: any) => this.row(r));
  }

  /** Flip a member's WhatsApp to verified once they pass the OTP round-trip. */
  async markWhatsappVerified(schema: string, id: string): Promise<void> {
    await this.q(schema, (qr) =>
      qr.query(`UPDATE users SET whatsapp_verified = true, updated_at = NOW() WHERE id = $1`, [id]),
    );
  }
}
