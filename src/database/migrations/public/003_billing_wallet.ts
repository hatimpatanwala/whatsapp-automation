import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillingWallet1700000000003 implements MigrationInterface {
  name = 'BillingWallet1700000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Wallet balance per tenant
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID UNIQUE NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        balance DECIMAL(12, 4) NOT NULL DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'INR',
        auto_recharge BOOLEAN DEFAULT false,
        auto_recharge_amount DECIMAL(12, 4) DEFAULT 0,
        auto_recharge_threshold DECIMAL(12, 4) DEFAULT 0,
        low_balance_alert_threshold DECIMAL(12, 4) DEFAULT 100,
        is_low_balance_alerted BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Wallet transactions log
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.wallet_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        type VARCHAR(30) NOT NULL,
        amount DECIMAL(12, 4) NOT NULL,
        balance_before DECIMAL(12, 4) NOT NULL,
        balance_after DECIMAL(12, 4) NOT NULL,
        description TEXT,
        reference_type VARCHAR(50),
        reference_id VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        razorpay_order_id VARCHAR(100),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Razorpay subscriptions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.razorpay_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        subscription_id UUID REFERENCES public.subscriptions(id),
        razorpay_subscription_id VARCHAR(100) UNIQUE,
        razorpay_plan_id VARCHAR(100) NOT NULL,
        razorpay_customer_id VARCHAR(100),
        status VARCHAR(30) DEFAULT 'created',
        current_start TIMESTAMPTZ,
        current_end TIMESTAMPTZ,
        charge_at TIMESTAMPTZ,
        total_count INT DEFAULT 0,
        paid_count INT DEFAULT 0,
        remaining_count INT,
        short_url VARCHAR(500),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Razorpay payment orders
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.razorpay_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        razorpay_order_id VARCHAR(100) UNIQUE NOT NULL,
        amount DECIMAL(12, 4) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(30) DEFAULT 'created',
        purpose VARCHAR(50) NOT NULL,
        razorpay_payment_id VARCHAR(100),
        razorpay_signature VARCHAR(255),
        receipt VARCHAR(100),
        notes JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wallets_tenant ON public.wallets(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wallet_txn_tenant ON public.wallet_transactions(tenant_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet ON public.wallet_transactions(wallet_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_rzp_sub_tenant ON public.razorpay_subscriptions(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_rzp_orders_tenant ON public.razorpay_orders(tenant_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.razorpay_orders CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.razorpay_subscriptions CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.wallet_transactions CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.wallets CASCADE`);
  }
}
