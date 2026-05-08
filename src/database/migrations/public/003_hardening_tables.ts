import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Platform Hardening Tables
 *
 * Adds tables for:
 * - token_health_checks: Token validation history and health tracking
 * - compliance_events: WABA restrictions, template bans, verification changes
 * - throughput_adjustments: Per-phone-number throttle history
 * - webhook_dlq: Dead letter queue for failed webhook processing
 *
 * Also adds missing indexes on conversation_sessions.
 */
export class HardeningTables1700000000003 implements MigrationInterface {
  name = 'HardeningTables1700000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Token health checks
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.token_health_checks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meta_token_id UUID NOT NULL,
        waba_account_id UUID NOT NULL,
        is_valid BOOLEAN NOT NULL,
        error_message TEXT,
        expires_at TIMESTAMPTZ,
        debug_response JSONB DEFAULT '{}',
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_thc_meta_token FOREIGN KEY (meta_token_id) REFERENCES public.meta_tokens(id) ON DELETE CASCADE,
        CONSTRAINT fk_thc_waba FOREIGN KEY (waba_account_id) REFERENCES public.waba_accounts(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_thc_waba_checked
        ON public.token_health_checks(waba_account_id, checked_at DESC)
    `);

    // Compliance events
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.compliance_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        waba_account_id UUID,
        event_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'info',
        details JSONB DEFAULT '{}',
        affected_tenants TEXT[] DEFAULT '{}',
        resolved BOOLEAN NOT NULL DEFAULT FALSE,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_ce_waba FOREIGN KEY (waba_account_id) REFERENCES public.waba_accounts(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ce_type_created
        ON public.compliance_events(event_type, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ce_unresolved
        ON public.compliance_events(resolved, created_at DESC)
        WHERE resolved = FALSE
    `);

    // Throughput adjustments
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.throughput_adjustments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone_number_id UUID NOT NULL,
        previous_rate INTEGER NOT NULL,
        new_rate INTEGER NOT NULL,
        reason VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_ta_phone FOREIGN KEY (phone_number_id) REFERENCES public.phone_numbers(id) ON DELETE CASCADE
      )
    `);

    // Webhook DLQ
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.webhook_dlq (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        original_payload JSONB NOT NULL,
        error_message TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        replayed BOOLEAN NOT NULL DEFAULT FALSE,
        replayed_at TIMESTAMPTZ,
        failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wdlq_unreplayed
        ON public.webhook_dlq(replayed, created_at DESC)
        WHERE replayed = FALSE
    `);

    // Missing index on conversation_sessions
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_conv_sessions_tenant_phone_status
        ON public.conversation_sessions(tenant_id, customer_phone, status)
        WHERE status = 'open'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.webhook_dlq`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.throughput_adjustments`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.compliance_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.token_health_checks`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_conv_sessions_tenant_phone_status`);
  }
}
