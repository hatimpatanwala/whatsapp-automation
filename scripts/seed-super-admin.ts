import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { AppModule } from '../src/app.module';
import { SuperAdmin } from '../src/database/entities/public/super-admin.entity';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const adminRepo = app.get<Repository<SuperAdmin>>(
      getRepositoryToken(SuperAdmin),
    );

    const email =
      process.env.SUPER_ADMIN_EMAIL ||
      process.argv[2] ||
      'admin@whatsapp-commerce.com';

    const password =
      process.env.SUPER_ADMIN_PASSWORD ||
      process.argv[3] ||
      'admin123456';

    const name =
      process.env.SUPER_ADMIN_NAME ||
      'Super Admin';

    const role =
      process.env.SUPER_ADMIN_ROLE ||
      'admin';

    console.log('🔍 Checking existing super admin...');

    const existingAdmin = await adminRepo.findOne({
      where: { email },
    });

    if (existingAdmin) {
      console.log(`⚠️ Super admin already exists: ${email}`);
      return;
    }

    console.log('🔐 Hashing password...');

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = adminRepo.create({
      email,
      passwordHash,
      name,
      role,
    });

    await adminRepo.save(admin);

    console.log('✅ Super admin created successfully');
    console.log(`📧 Email: ${email}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();