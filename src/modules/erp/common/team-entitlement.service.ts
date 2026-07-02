import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../../database/entities/public/subscription.entity';
import { SubscriptionPlan } from '../../../database/entities/public/subscription-plan.entity';
import { Tenant } from '../../../database/entities/public/tenant.entity';

/** The roles a store owner can hand out (must match TeamService STAFF_ROLES subset). */
export const CONFIGURABLE_TEAM_ROLES = ['employee', 'salesman', 'accountant'] as const;

export interface TeamEntitlement {
  /** Roles the tenant is allowed to assign. */
  roles: string[];
  /** Max total team members (null = unlimited). */
  memberLimit: number | null;
  /** Where the entitlement came from — for display/debugging. */
  source: 'tenant' | 'plan' | 'default';
}

/**
 * Resolves a tenant's TEAM entitlements — which staff roles they may assign and
 * how many members they may add. Two configurable levels, tenant overrides plan:
 *
 *   1. Package/plan   → `subscription_plans.limits.teamRoles` + `.teamMemberLimit`
 *                       (edited by super-admin in the plan form).
 *   2. Per-tenant     → `tenants.settings.team = { roles, memberLimit }`
 *                       (edited by super-admin on the tenant detail page).
 *
 * With neither configured, the default allows all roles with no cap (nothing is
 * silently blocked for tenants a super-admin hasn't restricted).
 */
@Injectable()
export class TeamEntitlementService {
  private readonly DEFAULT: TeamEntitlement = { roles: [...CONFIGURABLE_TEAM_ROLES], memberLimit: null, source: 'default' };

  constructor(
    @InjectRepository(Subscription) private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async resolve(tenantId: string): Promise<TeamEntitlement> {
    // 1) Per-tenant override on the public tenant record.
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } }).catch(() => null);
    const override = (tenant?.settings as any)?.team;
    if (override && Array.isArray(override.roles)) {
      return { roles: this.clean(override.roles), memberLimit: this.num(override.memberLimit), source: 'tenant' };
    }

    // 2) Plan-level config (stored inside the plan's limits JSONB).
    const sub = await this.subscriptionRepo.findOne({ where: { tenantId, status: 'active' } }).catch(() => null);
    if (sub?.planId) {
      const plan = await this.planRepo.findOne({ where: { id: sub.planId } }).catch(() => null);
      const limits = (plan?.limits as any) || {};
      if (Array.isArray(limits.teamRoles)) {
        // teamMemberLimit is the team-specific cap; fall back to the generic userLimit.
        const cap = limits.teamMemberLimit !== undefined ? limits.teamMemberLimit : limits.userLimit;
        return { roles: this.clean(limits.teamRoles), memberLimit: this.num(cap), source: 'plan' };
      }
    }

    return { ...this.DEFAULT };
  }

  private clean(roles: any[]): string[] {
    return roles.filter((r) => (CONFIGURABLE_TEAM_ROLES as readonly string[]).includes(r));
  }
  private num(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
}
