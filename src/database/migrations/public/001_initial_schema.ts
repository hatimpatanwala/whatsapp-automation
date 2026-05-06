import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000001 implements MigrationInterface {
  name = 'InitialSchema1700000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Enable extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // Tenants table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        schema_name VARCHAR(120) UNIQUE NOT NULL,
        phone_number_id VARCHAR(50),
        waba_id VARCHAR(50),
        access_token TEXT,
        webhook_secret VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Subscriptions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
        plan VARCHAR(50) NOT NULL,
        max_products INT DEFAULT 50,
        max_conversations INT DEFAULT 1000,
        conversations_used INT DEFAULT 0,
        max_campaigns_per_month INT DEFAULT 5,
        valid_from TIMESTAMPTZ NOT NULL,
        valid_until TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Super admins table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.super_admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Migration history table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.tenant_migration_history (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        checksum VARCHAR(64)
      )
    `);

    // Indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenants_phone_number_id ON public.tenants(phone_number_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON public.subscriptions(tenant_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.tenant_migration_history CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.subscriptions CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.super_admins CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.tenants CASCADE`);
  }
}
