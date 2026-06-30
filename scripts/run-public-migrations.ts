/**
 * Runs the public-schema migrations (src/database/migrations/public/*) in order
 * against the configured database.
 *
 * The project applies tenant-schema migrations automatically on app boot
 * (TenantMigrationService.onModuleInit) but has no runner for the public-schema
 * migrations — this script fills that gap. Every public migration is written to
 * be idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
 * INSERT … ON CONFLICT / UPDATE), so running this repeatedly is safe; each
 * migration is isolated so an already-applied one that errors does not block the
 * rest.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json --transpile-only \
 *     -r tsconfig-paths/register scripts/run-public-migrations.ts
 */
import { DataSource, QueryRunner } from 'typeorm';

import { InitialSchema1700000000001 } from '../src/database/migrations/public/001_initial_schema';
import { SharedWabaSchema1700000000002 } from '../src/database/migrations/public/002_shared_waba_schema';
import { BillingWallet1700000000003 } from '../src/database/migrations/public/003_billing_wallet';
import { HardeningTables1700000000003 } from '../src/database/migrations/public/003_hardening_tables';
import { CatalogManagement1700000000004 } from '../src/database/migrations/public/004_catalog_management';
import { SubscriptionPlans1700000000005 } from '../src/database/migrations/public/005_subscription_plans';
import * as adminWhatsapp006 from '../src/database/migrations/public/006_admin_whatsapp';
import { ErpFeatureFlag1700000000007 } from '../src/database/migrations/public/007_erp_feature_flag';

type Runnable = { name: string; up: (qr: QueryRunner) => Promise<void> };

const migrations: Runnable[] = [
  { name: '001_initial_schema', up: (qr) => new InitialSchema1700000000001().up(qr) },
  { name: '002_shared_waba_schema', up: (qr) => new SharedWabaSchema1700000000002().up(qr) },
  { name: '003_billing_wallet', up: (qr) => new BillingWallet1700000000003().up(qr) },
  { name: '003_hardening_tables', up: (qr) => new HardeningTables1700000000003().up(qr) },
  { name: '004_catalog_management', up: (qr) => new CatalogManagement1700000000004().up(qr) },
  { name: '005_subscription_plans', up: (qr) => new SubscriptionPlans1700000000005().up(qr) },
  { name: '006_admin_whatsapp', up: (qr) => adminWhatsapp006.up(qr) },
  { name: '007_erp_feature_flag', up: (qr) => new ErpFeatureFlag1700000000007().up(qr) },
];

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'whatsapp_commerce',
  });

  await dataSource.initialize();
  console.log('Connected. Running public migrations...\n');

  let ok = 0;
  let skipped = 0;
  for (const migration of migrations) {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await migration.up(qr);
      await qr.commitTransaction();
      console.log(`  ✅ ${migration.name}`);
      ok++;
    } catch (err) {
      await qr.rollbackTransaction();
      console.log(`  ⏭️  ${migration.name} — skipped (${(err as Error).message.split('\n')[0]})`);
      skipped++;
    } finally {
      await qr.release();
    }
  }

  console.log(`\nDone. ${ok} applied, ${skipped} skipped.`);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Public migration run failed:', err);
  process.exit(1);
});
