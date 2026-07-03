import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-tenant sync tokens (Phase 2). A desktop node logs in to the cloud once, mints a
 * long-lived token, and thereafter authenticates its /sync calls with `X-Sync-Token`
 * instead of reusing the password. Tokens are per-device (multiple rows per tenant) and
 * revocable by deleting the row. Idempotent.
 */
export class SyncTokens1700000000008 implements MigrationInterface {
  name = 'SyncTokens1700000000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.sync_tokens (
        token TEXT PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        label VARCHAR(120),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_sync_tokens_tenant ON public.sync_tokens(tenant_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.sync_tokens`);
  }
}
