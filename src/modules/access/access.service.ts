import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { firstRow } from '../erp/common/sql-result.util';
import { ACCESS_FEATURES, FEATURE_KEYS, Level, fullAccess } from './access.constants';

/**
 * RBAC engine: roles (per-feature read/write maps), employees (tenant login
 * users) and effective-permission resolution. The tenant owner always has full
 * access. A user's effective permissions = their role's map, with any per-user
 * override merged on top; missing features default to 'none'.
 */
@Injectable()
export class AccessService {
  constructor(private readonly cm: TenantConnectionManager) {}

  features() { return ACCESS_FEATURES; }

  // ─── Roles ──────────────────────────────────────────────────────────────────
  listRoles(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT r.*, (SELECT COUNT(*)::int FROM "${schema}".users u WHERE u.role_id = r.id AND u.is_active) AS user_count
         FROM "${schema}".roles r ORDER BY r.is_system DESC, lower(r.name)`,
      ),
    );
  }

  async createRole(schema: string, body: { name: string; description?: string; permissions?: Record<string, Level> }) {
    if (!body?.name?.trim()) throw new BadRequestException('Role name is required');
    const perms = this.sanitizePerms(body.permissions);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${schema}".roles (name, description, permissions) VALUES ($1,$2,$3::jsonb) RETURNING *`,
        [body.name.trim(), body.description?.trim() || null, JSON.stringify(perms)],
      ).catch((e: any) => {
        if (String(e?.message || '').includes('uq_roles_name')) throw new BadRequestException('A role with that name already exists');
        throw e;
      });
      return rows[0];
    });
  }

  async updateRole(schema: string, id: string, body: { name?: string; description?: string; permissions?: Record<string, Level> }) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const role = (await qr.query(`SELECT * FROM "${schema}".roles WHERE id = $1`, [id]))[0];
      if (!role) throw new NotFoundException('Role not found');
      // The Owner system role is always full-access and cannot be weakened.
      const perms = role.is_system && role.name === 'Owner'
        ? fullAccess()
        : (body.permissions !== undefined ? this.sanitizePerms(body.permissions) : (typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions));
      const name = role.is_system ? role.name : (body.name?.trim() || role.name);
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".roles SET name = $2, description = $3, permissions = $4::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, name, body.description ?? role.description, JSON.stringify(perms)],
      ));
      return row;
    });
  }

  async deleteRole(schema: string, id: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const role = (await qr.query(`SELECT * FROM "${schema}".roles WHERE id = $1`, [id]))[0];
      if (!role) throw new NotFoundException('Role not found');
      if (role.is_system) throw new BadRequestException('System roles cannot be deleted');
      const inUse = (await qr.query(`SELECT COUNT(*)::int AS n FROM "${schema}".users WHERE role_id = $1`, [id]))[0];
      if (Number(inUse?.n) > 0) throw new BadRequestException(`Role is assigned to ${inUse.n} user(s) — reassign them first`);
      await qr.query(`DELETE FROM "${schema}".roles WHERE id = $1`, [id]);
      return { deleted: true };
    });
  }

  // ─── Employees (tenant login users) ──────────────────────────────────────────
  listEmployees(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT u.id, u.name, u.email, u.phone, u.role, u.role_id, u.is_active, u.last_login_at, u.permissions,
                r.name AS role_name, r.permissions AS role_permissions, r.is_system AS role_is_system
         FROM "${schema}".users u
         LEFT JOIN "${schema}".roles r ON r.id = u.role_id
         ORDER BY u.is_active DESC, lower(u.name)`,
      ),
    );
  }

  async createEmployee(schema: string, body: { name: string; email?: string; phone?: string; password: string; roleId?: string }) {
    if (!body?.name?.trim()) throw new BadRequestException('Name is required');
    if (!body?.email?.trim() && !body?.phone?.trim()) throw new BadRequestException('Email or phone is required');
    if (!body?.password || body.password.length < 6) throw new BadRequestException('Password must be at least 6 characters');
    const hash = await bcrypt.hash(body.password, 12);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      // The legacy `role` string is 'seller' for every RBAC employee — enough to
      // clear the coarse @Roles gate; the fine-grained control is the RBAC role
      // (role_id) enforced by PermissionGuard. Only the tenant owner is 'owner'.
      const rows = await qr.query(
        `INSERT INTO "${schema}".users (name, email, phone, password_hash, role, role_id, is_active)
         VALUES ($1,$2,$3,$4,'seller',$5,true) RETURNING id, name, email, phone, role, role_id, is_active`,
        [body.name.trim(), body.email?.trim() || null, body.phone?.trim() || null, hash, body.roleId || null],
      ).catch((e: any) => {
        if (String(e?.message || '').includes('duplicate') || String(e?.message || '').includes('unique')) {
          throw new BadRequestException('A user with that email or phone already exists');
        }
        throw e;
      });
      return rows[0];
    });
  }

  async updateEmployee(schema: string, id: string, body: { name?: string; roleId?: string | null; isActive?: boolean; permissions?: Record<string, Level> | null; password?: string }) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const user = (await qr.query(`SELECT * FROM "${schema}".users WHERE id = $1`, [id]))[0];
      if (!user) throw new NotFoundException('Employee not found');
      // Never allow the last active owner to be locked out.
      if (body.isActive === false && user.role === 'owner') {
        const owners = (await qr.query(`SELECT COUNT(*)::int AS n FROM "${schema}".users WHERE role = 'owner' AND is_active`, []))[0];
        if (Number(owners?.n) <= 1) throw new BadRequestException('Cannot deactivate the last active owner');
      }
      // Keep the legacy `role` string as-is (owner stays owner; employees stay
      // 'seller'); the RBAC role is role_id. Fine control lives in PermissionGuard.
      const perms = body.permissions === undefined ? user.permissions
        : (body.permissions === null ? null : JSON.stringify(this.sanitizePerms(body.permissions)));
      const passHash = body.password ? await bcrypt.hash(body.password, 12) : null;
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".users SET
           name = COALESCE($2, name),
           role_id = $3,
           is_active = COALESCE($4, is_active),
           permissions = $5,
           password_hash = COALESCE($6, password_hash),
           updated_at = NOW()
         WHERE id = $1 RETURNING id, name, email, phone, role, role_id, is_active`,
        [id, body.name?.trim() ?? null,
         body.roleId !== undefined ? body.roleId : user.role_id,
         body.isActive ?? null,
         typeof perms === 'string' || perms === null ? perms : (perms ? JSON.stringify(perms) : null),
         passHash],
      ));
      return row;
    });
  }

  // ─── Permission resolution ────────────────────────────────────────────────────
  async getPermissions(schema: string, userId: string): Promise<{ owner: boolean; permissions: Record<string, Level> }> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const u = (await qr.query(
        `SELECT u.role, u.permissions AS user_perms, r.permissions AS role_perms
         FROM "${schema}".users u LEFT JOIN "${schema}".roles r ON r.id = u.role_id WHERE u.id = $1`,
        [userId],
      ))[0];
      if (!u) return { owner: false, permissions: {} };
      if (u.role === 'owner' || u.role === 'admin') return { owner: true, permissions: fullAccess() };
      const base: Record<string, Level> = this.asMap(u.role_perms);
      const override: Record<string, Level> = this.asMap(u.user_perms);
      const merged: Record<string, Level> = {};
      for (const k of FEATURE_KEYS) merged[k] = override[k] ?? base[k] ?? 'none';
      return { owner: false, permissions: merged };
    });
  }

  private asMap(v: any): Record<string, Level> {
    if (!v) return {};
    const o = typeof v === 'string' ? JSON.parse(v) : v;
    return o && typeof o === 'object' ? o : {};
  }

  private sanitizePerms(p?: Record<string, Level>): Record<string, Level> {
    const out: Record<string, Level> = {};
    for (const k of FEATURE_KEYS) {
      const v = p?.[k];
      out[k] = v === 'write' || v === 'read' ? v : 'none';
    }
    return out;
  }
}
