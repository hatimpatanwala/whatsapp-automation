import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TenantProvisioningService } from '../src/modules/tenant/tenant-provisioning.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const provisioningService = app.get(TenantProvisioningService);

  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const name = getArg('--name');
  const slug = getArg('--slug');
  const phone = getArg('--phone');
  const ownerPhone = getArg('--owner-phone');
  const ownerPassword = getArg('--owner-password');
  const plan = getArg('--plan') || 'starter';

  if (!name || !slug) {
    console.error('Usage: npx ts-node scripts/create-tenant.ts --name "Store Name" --slug store-name [--phone +91xxx] [--owner-phone +91xxx] [--owner-password pass] [--plan starter]');
    process.exit(1);
  }

  try {
    const tenant = await provisioningService.provisionTenant({
      name,
      slug,
      phoneNumberId: phone,
      ownerPhone,
      ownerPassword,
      ownerName: name,
      plan,
    });

    console.log('✅ Tenant created successfully:');
    console.log(JSON.stringify(tenant, null, 2));
  } catch (error) {
    console.error('❌ Error:', (error as any).message);
  }

  await app.close();
}

main();
