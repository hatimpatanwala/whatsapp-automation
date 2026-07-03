/**
 * Runs the public-schema migrations (src/database/migrations/public/*) in order
 * against the configured database.
 *
 * The project applies tenant-schema migrations automatically on app boot
 * (TenantMigrationService.onModuleInit) but has no runner for the public-schema
 * migrations — this script fills that gap. The migration list + runner live in
 * src/database/public-migrations.ts (shared with the packaged provisioning CLI).
 * Every public migration is idempotent, so running this repeatedly is safe.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json --transpile-only \
 *     -r tsconfig-paths/register scripts/run-public-migrations.ts
 */
import { DataSource } from 'typeorm';
import { runPublicMigrations } from '../src/database/public-migrations';

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

  await runPublicMigrations(() => dataSource.createQueryRunner(), (m) => console.log(m));

  console.log('\nDone.');
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Public migration run failed:', err);
  process.exit(1);
});
