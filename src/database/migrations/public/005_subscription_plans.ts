import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubscriptionPlans1700000000005 implements MigrationInterface {
  name = 'SubscriptionPlans1700000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create subscription_plans table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.subscription_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        tier VARCHAR(30) NOT NULL,
        description TEXT,
        monthly_price INT DEFAULT 0,
        yearly_price INT DEFAULT 0,
        price_per_conversation INT DEFAULT 0,
        limits JSONB DEFAULT '{}',
        features JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 2. Add plan_id column to subscriptions table
    await queryRunner.query(`
      ALTER TABLE public.subscriptions
      ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.subscription_plans(id)
    `);

    // 3. Add allow_exceed column if not exists
    await queryRunner.query(`
      ALTER TABLE public.subscriptions
      ADD COLUMN IF NOT EXISTS allow_exceed BOOLEAN DEFAULT false
    `);

    // 4. Seed default plans
    await queryRunner.query(`
      INSERT INTO public.subscription_plans (name, tier, description, monthly_price, yearly_price, price_per_conversation, limits, features, is_active, sort_order)
      VALUES
      (
        'Trial',
        'trial',
        'Free trial with limited features for 30 days',
        0, 0, 0,
        '{"conversationLimit": 100, "messageLimit": 500, "productLimit": 20, "campaignLimit": 2, "userLimit": 1}',
        '{"deliveries": false, "customers": true, "campaigns": false, "conversations": true, "whatsappCatalog": false, "workflowBuilder": false, "aiFeatures": false, "advancedAnalytics": false, "multiCatalog": false}',
        true, 0
      ),
      (
        'Starter',
        'starter',
        'Perfect for small businesses getting started with WhatsApp commerce',
        4900, 49900, 5,
        '{"conversationLimit": 500, "messageLimit": 2000, "productLimit": 100, "campaignLimit": 5, "userLimit": 3}',
        '{"deliveries": true, "customers": true, "campaigns": false, "conversations": true, "whatsappCatalog": false, "workflowBuilder": false, "aiFeatures": false, "advancedAnalytics": false, "multiCatalog": false}',
        true, 1
      ),
      (
        'Growth',
        'growth',
        'For growing businesses that need more power and automation',
        19000, 190000, 3,
        '{"conversationLimit": 2000, "messageLimit": 10000, "productLimit": 500, "campaignLimit": 20, "userLimit": 10}',
        '{"deliveries": true, "customers": true, "campaigns": true, "conversations": true, "whatsappCatalog": true, "workflowBuilder": true, "aiFeatures": false, "advancedAnalytics": true, "multiCatalog": false}',
        true, 2
      ),
      (
        'Professional',
        'professional',
        'Advanced features for scaling your business operations',
        39000, 390000, 2,
        '{"conversationLimit": 5000, "messageLimit": 30000, "productLimit": 2000, "campaignLimit": null, "userLimit": 25}',
        '{"deliveries": true, "customers": true, "campaigns": true, "conversations": true, "whatsappCatalog": true, "workflowBuilder": true, "aiFeatures": true, "advancedAnalytics": true, "multiCatalog": true}',
        true, 3
      ),
      (
        'Enterprise',
        'enterprise',
        'Unlimited access for large-scale operations with dedicated support',
        79000, 790000, 1,
        '{"conversationLimit": null, "messageLimit": null, "productLimit": null, "campaignLimit": null, "userLimit": null}',
        '{"deliveries": true, "customers": true, "campaigns": true, "conversations": true, "whatsappCatalog": true, "workflowBuilder": true, "aiFeatures": true, "advancedAnalytics": true, "multiCatalog": true}',
        true, 4
      )
      ON CONFLICT DO NOTHING
    `);

    // 5. Backfill existing subscriptions with plan_id
    await queryRunner.query(`
      UPDATE public.subscriptions s
      SET plan_id = sp.id
      FROM public.subscription_plans sp
      WHERE s.plan_id IS NULL
        AND (
          (s.plan = 'starter' AND sp.tier = 'starter')
          OR (s.plan = 'trial' AND sp.tier = 'starter')
          OR (s.plan = 'pro' AND sp.tier = 'professional')
          OR (s.plan = 'enterprise' AND sp.tier = 'enterprise')
          OR (s.plan = 'growth' AND sp.tier = 'growth')
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS plan_id`);
    await queryRunner.query(`ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS allow_exceed`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.subscription_plans`);
  }
}
