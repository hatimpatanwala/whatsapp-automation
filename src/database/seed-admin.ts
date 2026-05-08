import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

/**
 * Seed script to create the default super admin user.
 *
 * Usage: npx ts-node src/database/seed-admin.ts
 *
 * Default credentials:
 *   Email:    admin@wacommerce.in
 *   Password: Admin@123456
 */
async function seedAdmin() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'whatsapp_commerce',
  });

  await dataSource.initialize();
  console.log('Connected to database');

  const email = process.env.ADMIN_EMAIL || 'admin@wacommerce.in';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const name = process.env.ADMIN_NAME || 'Platform Admin';

  // Check if admin already exists
  const existing = await dataSource.query(
    'SELECT id FROM public.super_admins WHERE email = $1',
    [email],
  );

  if (existing.length > 0) {
    console.log(`Super admin already exists: ${email}`);
    await dataSource.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await dataSource.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name, role, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'admin', NOW())`,
    [email, passwordHash, name],
  );

  console.log('');
  console.log('===========================================');
  console.log('  Super Admin Created Successfully!');
  console.log('===========================================');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     admin`);
  console.log('');
  console.log('  Login at: http://localhost:4200/admin/login');
  console.log('===========================================');
  console.log('');

  await dataSource.destroy();
}

seedAdmin().catch((err) => {
  console.error('Failed to seed admin:', err.message);
  process.exit(1);
});
