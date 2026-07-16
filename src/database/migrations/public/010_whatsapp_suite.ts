import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WhatsApp Suite — the single purchasable bundle that gates the whole WhatsApp
 * layer (Campaigns, Conversations, Catalog, Workflow Builder + the new Smart
 * Connect). Two things:
 *
 *  1. GRANDFATHER: every EXISTING plan gets `whatsappSuite: true` so no current
 *     tenant loses WhatsApp when the master gate ships. New plans decide via the
 *     super-admin plan editor. (Idempotent jsonb `||` merge — only sets the key
 *     where it's missing.)
 *
 *  2. whatsapp_personal_sessions — the encrypted, DB-backed Baileys auth store
 *     for Smart Connect (survives restarts + is visible to every node). One row
 *     per tenant. Creds/keys are login-equivalent secrets, stored AES-encrypted.
 */
export class WhatsappSuite1700000000010 implements MigrationInterface {
  name = 'WhatsappSuite1700000000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Grandfather every existing plan ON (only where the key isn't set yet).
    await queryRunner.query(`
      UPDATE public.subscription_plans
      SET features = features || '{"whatsappSuite": true}'::jsonb,
          updated_at = NOW()
      WHERE NOT (features ? 'whatsappSuite')
    `);

    // 2. Baileys Smart Connect session store (public schema — one WhatsApp per tenant).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.whatsapp_personal_sessions (
        tenant_id UUID PRIMARY KEY,
        phone VARCHAR(32),
        state VARCHAR(16) NOT NULL DEFAULT 'idle',
        creds_enc TEXT,
        keys_enc TEXT,
        last_connected_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.whatsapp_personal_sessions`);
    await queryRunner.query(`
      UPDATE public.subscription_plans
      SET features = features - 'whatsappSuite', updated_at = NOW()
    `);
  }
}
