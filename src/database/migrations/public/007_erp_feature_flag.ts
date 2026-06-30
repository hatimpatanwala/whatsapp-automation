import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enables the premium ERP/CRM layer on the appropriate subscription plans by
 * merging ERP feature flags into `subscription_plans.features` (jsonb).
 *
 * Default packaging (adjustable later from the super-admin plan editor):
 *   - Professional → erp + erpInvoicing + erpCrm
 *   - Enterprise   → erp + erpInvoicing + erpCrm + erpProcurement + erpHr
 *   - Trial / Starter / Growth → no ERP
 *
 * Idempotent: uses jsonb `||` merge, so re-running only overwrites these keys.
 * Tenants on an ERP-enabled plan get ERP access immediately (ErpFeatureGuard);
 * downgrading to a plan without `erp` removes access while preserving data.
 */
export class ErpFeatureFlag1700000000007 implements MigrationInterface {
  name = 'ErpFeatureFlag1700000000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Professional: invoicing + CRM
    await queryRunner.query(`
      UPDATE public.subscription_plans
      SET features = features || '{"erp": true, "erpInvoicing": true, "erpCrm": true, "erpProcurement": false, "erpHr": false}'::jsonb,
          updated_at = NOW()
      WHERE tier = 'professional'
    `);

    // Enterprise: full ERP
    await queryRunner.query(`
      UPDATE public.subscription_plans
      SET features = features || '{"erp": true, "erpInvoicing": true, "erpCrm": true, "erpProcurement": true, "erpHr": true}'::jsonb,
          updated_at = NOW()
      WHERE tier = 'enterprise'
    `);

    // Lower tiers: explicitly off (so the keys exist and the UI can show an upsell).
    await queryRunner.query(`
      UPDATE public.subscription_plans
      SET features = features || '{"erp": false, "erpInvoicing": false, "erpCrm": false, "erpProcurement": false, "erpHr": false}'::jsonb,
          updated_at = NOW()
      WHERE tier IN ('trial', 'starter', 'growth')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE public.subscription_plans
      SET features = features - 'erp' - 'erpInvoicing' - 'erpCrm' - 'erpProcurement' - 'erpHr',
          updated_at = NOW()
    `);
  }
}
