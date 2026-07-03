import { QueryRunner } from 'typeorm';

import { InitialSchema1700000000001 } from './migrations/public/001_initial_schema';
import { SharedWabaSchema1700000000002 } from './migrations/public/002_shared_waba_schema';
import { BillingWallet1700000000003 } from './migrations/public/003_billing_wallet';
import { HardeningTables1700000000003 } from './migrations/public/003_hardening_tables';
import { CatalogManagement1700000000004 } from './migrations/public/004_catalog_management';
import { SubscriptionPlans1700000000005 } from './migrations/public/005_subscription_plans';
import * as adminWhatsapp006 from './migrations/public/006_admin_whatsapp';
import { ErpFeatureFlag1700000000007 } from './migrations/public/007_erp_feature_flag';
import { SyncTokens1700000000008 } from './migrations/public/008_sync_tokens';
import { SchemaParity1700000000009 } from './migrations/public/009_schema_parity';

export interface PublicMigration {
  name: string;
  up: (qr: QueryRunner) => Promise<void>;
}

/**
 * Ordered public-schema migrations. Shared by the standalone runner
 * (scripts/run-public-migrations.ts) and the packaged provisioning CLI
 * (src/provision-cli.ts). Every migration is idempotent, so re-running is safe.
 */
export const publicMigrations: PublicMigration[] = [
  { name: '001_initial_schema', up: (qr) => new InitialSchema1700000000001().up(qr) },
  { name: '002_shared_waba_schema', up: (qr) => new SharedWabaSchema1700000000002().up(qr) },
  { name: '003_billing_wallet', up: (qr) => new BillingWallet1700000000003().up(qr) },
  { name: '003_hardening_tables', up: (qr) => new HardeningTables1700000000003().up(qr) },
  { name: '004_catalog_management', up: (qr) => new CatalogManagement1700000000004().up(qr) },
  { name: '005_subscription_plans', up: (qr) => new SubscriptionPlans1700000000005().up(qr) },
  { name: '006_admin_whatsapp', up: (qr) => adminWhatsapp006.up(qr) },
  { name: '007_erp_feature_flag', up: (qr) => new ErpFeatureFlag1700000000007().up(qr) },
  { name: '008_sync_tokens', up: (qr) => new SyncTokens1700000000008().up(qr) },
  { name: '009_schema_parity', up: (qr) => new SchemaParity1700000000009().up(qr) },
];

/** Run every public migration on a connected DataSource, isolating failures. */
export async function runPublicMigrations(
  createQueryRunner: () => QueryRunner,
  log: (msg: string) => void = () => undefined,
): Promise<void> {
  for (const migration of publicMigrations) {
    const qr = createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await migration.up(qr);
      await qr.commitTransaction();
      log(`  ✅ ${migration.name}`);
    } catch (err) {
      await qr.rollbackTransaction();
      log(`  ⏭️  ${migration.name} — skipped (${(err as Error).message.split('\n')[0]})`);
    } finally {
      await qr.release();
    }
  }
}
