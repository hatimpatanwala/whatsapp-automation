import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema parity for fresh installs (found by the desktop first-run test): several
 * Tenant entity columns were added to the cloud DB during early development (dev-time
 * schema sync) but never captured in a public migration, so a brand-new database is
 * missing them and provisioning fails with 42703 (column does not exist).
 * All idempotent — a no-op on databases that already have the columns.
 */
export class SchemaParity1700000000009 implements MigrationInterface {
  name = 'SchemaParity1700000000009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.tenants
        ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(30) DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(20),
        ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS business_category VARCHAR(100),
        ADD COLUMN IF NOT EXISTS business_description TEXT,
        ADD COLUMN IF NOT EXISTS business_address TEXT,
        ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.tenants
        DROP COLUMN IF EXISTS onboarding_status, DROP COLUMN IF EXISTS whatsapp_phone,
        DROP COLUMN IF EXISTS business_name, DROP COLUMN IF EXISTS business_category,
        DROP COLUMN IF EXISTS business_description, DROP COLUMN IF EXISTS business_address,
        DROP COLUMN IF EXISTS logo_url
    `);
  }
}
