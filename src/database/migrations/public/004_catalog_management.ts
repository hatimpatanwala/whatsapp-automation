import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Multi-Tenant Catalog Management
 *
 * Adds tables for:
 * - tenant_catalogs: Per-tenant Meta Commerce catalog tracking (one catalog per tenant)
 * - catalog_sync_jobs: Tracks sync operations between platform and Meta
 * - catalog_assignment_history: Audit trail for catalog-to-phone-number assignments
 *
 * Architecture: Shared WABA, different catalogs per tenant.
 * Each tenant gets their own Meta catalog under the platform's Meta Business,
 * linked to their specific phone number.
 */
export class CatalogManagement1700000000004 implements MigrationInterface {
  name = 'CatalogManagement1700000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ─── tenant_catalogs: one Meta catalog per tenant ────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.tenant_catalogs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        meta_catalog_id VARCHAR(50) NOT NULL,
        meta_business_id VARCHAR(50) NOT NULL,
        catalog_name VARCHAR(255) NOT NULL,
        phone_number_id VARCHAR(50),
        waba_id VARCHAR(50),
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        is_linked_to_phone BOOLEAN DEFAULT false,
        is_catalog_visible BOOLEAN DEFAULT false,
        is_cart_enabled BOOLEAN DEFAULT false,
        product_count INT DEFAULT 0,
        last_sync_at TIMESTAMPTZ,
        last_sync_status VARCHAR(30),
        last_sync_error TEXT,
        provisioned_by VARCHAR(50) DEFAULT 'system',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_tenant_catalog UNIQUE (tenant_id),
        CONSTRAINT uq_meta_catalog UNIQUE (meta_catalog_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_tenant_catalogs_tenant ON public.tenant_catalogs(tenant_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_tenant_catalogs_meta_id ON public.tenant_catalogs(meta_catalog_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_tenant_catalogs_phone ON public.tenant_catalogs(phone_number_id) WHERE phone_number_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_tenant_catalogs_status ON public.tenant_catalogs(status) WHERE status = 'active'
    `);

    // ─── catalog_sync_jobs: track sync operations ────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.catalog_sync_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        catalog_id UUID NOT NULL REFERENCES public.tenant_catalogs(id) ON DELETE CASCADE,
        job_type VARCHAR(30) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        total_products INT DEFAULT 0,
        synced_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        skipped_count INT DEFAULT 0,
        error_details JSONB DEFAULT '[]',
        triggered_by VARCHAR(50) DEFAULT 'system',
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_catalog_sync_jobs_tenant ON public.catalog_sync_jobs(tenant_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_catalog_sync_jobs_status ON public.catalog_sync_jobs(status) WHERE status IN ('pending', 'running')
    `);
    await queryRunner.query(`
      CREATE INDEX idx_catalog_sync_jobs_created ON public.catalog_sync_jobs(created_at DESC)
    `);

    // ─── catalog_assignment_history: audit trail ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.catalog_assignment_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        catalog_id UUID REFERENCES public.tenant_catalogs(id) ON DELETE SET NULL,
        meta_catalog_id VARCHAR(50) NOT NULL,
        phone_number_id VARCHAR(50) NOT NULL,
        action VARCHAR(30) NOT NULL,
        previous_catalog_id VARCHAR(50),
        performed_by VARCHAR(50) DEFAULT 'system',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_catalog_assignment_tenant ON public.catalog_assignment_history(tenant_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_catalog_assignment_created ON public.catalog_assignment_history(created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.catalog_assignment_history CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.catalog_sync_jobs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.tenant_catalogs CASCADE`);
  }
}
