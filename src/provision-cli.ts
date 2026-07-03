// Must be first: silences BullMQ/ioredis ECONNREFUSED spam in desktop mode.
import './patch-ioredis';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AppModule } from './app.module';
import { runPublicMigrations } from './database/public-migrations';
import { TenantProvisioningService } from './modules/tenant/tenant-provisioning.service';

/**
 * Standalone, compiled first-run provisioning for the desktop app (Phase 6). Replaces the
 * dev-only ts-node/npm path so a packaged install can provision with no toolchain:
 *   1. run public-schema migrations,
 *   2. boot the app context (which auto-applies tenant migrations),
 *   3. create the single local tenant if it doesn't exist.
 *
 * Configured entirely via env (DB_ and TENANT_ / OWNER_ variables). Idempotent.
 */
async function main(): Promise<void> {
  const dbConf = {
    type: 'postgres' as const,
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'whatsapp_commerce',
  };

  // 1) Public schema (raw connection; no entities needed for idempotent DDL).
  const raw = new DataSource(dbConf);
  await raw.initialize();
  console.log('[provision] running public migrations…');
  await runPublicMigrations(() => raw.createQueryRunner(), (m) => console.log(m));
  await raw.destroy();

  // 2) App context — TenantMigrationService.onModuleInit applies tenant migrations.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get<DataSource>(getDataSourceToken() as never);

  const slug = process.env.TENANT_SLUG || 'local';
  // An imported cloud dump already contains the real tenant(s) — never add a synthetic
  // 'local' tenant next to them; just ensure migrations ran (done on context boot above).
  const anyTenants = await ds.query(`SELECT COUNT(*)::int AS n FROM public.tenants`);
  if (Number(anyTenants[0]?.n) > 0 && process.env.FORCE_TENANT !== '1') {
    const exists = await ds.query(`SELECT 1 FROM public.tenants WHERE slug = $1`, [slug]);
    if (!exists.length) {
      console.log(`[provision] ${anyTenants[0].n} existing tenant(s) found (imported data) — skipping default tenant creation`);
      await app.close();
      return;
    }
  }
  const exists = await ds.query(`SELECT 1 FROM public.tenants WHERE slug = $1`, [slug]);

  if (!exists.length) {
    console.log(`[provision] creating tenant '${slug}'…`);
    const prov = app.get(TenantProvisioningService);
    await prov.provisionTenant({
      name: process.env.TENANT_NAME || 'My Business',
      slug,
      ownerPhone: process.env.OWNER_PHONE || undefined,
      ownerEmail: process.env.OWNER_EMAIL || undefined,
      ownerEmailVerified: true,
      ownerPassword: process.env.OWNER_PASSWORD || undefined,
      ownerName: process.env.TENANT_NAME || 'My Business',
      plan: process.env.TENANT_PLAN || 'starter',
    });
    console.log('[provision] tenant created');
  } else {
    console.log(`[provision] tenant '${slug}' already exists — migrations ensured`);
  }

  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[provision] failed:', err);
    process.exit(1);
  });
