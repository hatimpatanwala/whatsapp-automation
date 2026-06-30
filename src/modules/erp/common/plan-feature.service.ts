import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../../database/entities/public/subscription.entity';
import { SubscriptionPlan } from '../../../database/entities/public/subscription-plan.entity';

/**
 * Resolves the set of enabled plan features for a tenant from the public-schema
 * subscription + subscription_plan tables.
 *
 * Feature flags live on `SubscriptionPlan.features` (jsonb). A tenant's enabled
 * features are those of the plan attached to its currently-active subscription.
 * If the tenant has no active subscription, or the subscription is not linked to
 * a plan, the tenant has no premium features (everything defaults to off).
 *
 * This is the single source of truth for ERP gating: when a tenant is on a plan
 * whose `features.erp` is true the ERP is available; when they downgrade to a
 * plan without it, ERP access is removed while their data is preserved
 * (see ErpProvisioningService).
 */
@Injectable()
export class PlanFeatureService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
  ) {}

  /** Returns the plan feature map for the tenant's active subscription ({} if none). */
  async getFeatures(tenantId: string): Promise<Record<string, boolean>> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId, status: 'active' },
    });
    if (!subscription?.planId) return {};

    const plan = await this.planRepo.findOne({ where: { id: subscription.planId } });
    return plan?.features ?? {};
  }

  /** True when every requested feature is enabled on the tenant's active plan. */
  async hasFeatures(tenantId: string, features: string[]): Promise<boolean> {
    if (features.length === 0) return true;
    const enabled = await this.getFeatures(tenantId);
    return features.every((f) => enabled[f] === true);
  }

  /** Convenience: is the master ERP feature enabled for this tenant. */
  async isErpEnabled(tenantId: string): Promise<boolean> {
    return this.hasFeatures(tenantId, ['erp']);
  }
}
