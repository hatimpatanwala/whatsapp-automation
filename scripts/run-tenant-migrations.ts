import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TenantMigrationService } from '../src/database/tenant-migration.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const migrationService = app.get(TenantMigrationService);

  const args = process.argv.slice(2);
  const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '10');
  const tenantSlug = args.find(a => a.startsWith('--tenant='))?.split('=')[1];

  try {
    if (tenantSlug) {
      const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
      console.log(`Running migrations for schema: ${schemaName}`);
      await migrationService.runMigrationsForSchema(schemaName);
      console.log('✅ Migrations completed for single tenant');
    } else {
      console.log(`Running pending migrations (batch size: ${batchSize})...`);
      await migrationService.runPendingMigrations(batchSize);
      console.log('✅ All pending migrations completed');
    }
  } catch (error) {
    console.error('❌ Migration error:', error.message);
  }

  await app.close();
}

main();
