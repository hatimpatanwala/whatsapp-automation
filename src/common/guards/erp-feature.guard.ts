import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';
import { PlanFeatureService } from '../../modules/erp/common/plan-feature.service';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

/**
 * Gates a route behind the plan features declared with @RequiresFeature().
 *
 * - If every required feature is enabled → full access.
 * - If ERP is NOT on the plan BUT the tenant was previously provisioned (they had
 *   ERP and created data), **read-only** access is allowed for safe GET/HEAD
 *   requests, so a downgraded user can still view and export their records.
 *   Mutating requests (POST/PUT/PATCH/DELETE) are blocked → upgrade required.
 *   When read-only is granted, `request.erpReadOnly = true` is set.
 *
 * Apply AFTER TenantGuard so `request.tenantContext` is populated.
 */
@Injectable()
export class ErpFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planFeatures: PlanFeatureService,
    private readonly cm: TenantConnectionManager,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRES_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request.session?.tenantId || request.tenantContext?.id;
    const schema = request.tenantContext?.schemaName;
    if (!tenantId) throw new ForbiddenException('Tenant context required');

    const features = await this.planFeatures.getFeatures(tenantId);
    const missing = required.filter((f) => features[f] !== true);

    if (missing.length === 0) {
      request.planFeatures = features;
      request.erpReadOnly = false;
      return true;
    }

    // ERP not on the plan. Allow read-only access to already-owned data.
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    if (isRead && schema && (await this.isProvisioned(schema))) {
      request.planFeatures = features;
      request.erpReadOnly = true;
      return true;
    }

    throw new ForbiddenException(
      'ERP is not included in your current plan. ' +
        (await this.isProvisioned(schema).catch(() => false)
          ? 'Your data is preserved in read-only mode — upgrade to edit again.'
          : 'Upgrade to a plan that includes ERP to use this feature.'),
    );
  }

  /** True if this tenant has the ERP one-time provisioning marker set. */
  private async isProvisioned(schema?: string): Promise<boolean> {
    if (!schema) return false;
    try {
      return await this.cm.executeInTenantContext(schema, async (qr) => {
        const rows = await qr.query(`SELECT value FROM "${schema}".settings WHERE key = 'erp_provisioned'`);
        return rows[0]?.value === true;
      });
    } catch {
      return false;
    }
  }
}
