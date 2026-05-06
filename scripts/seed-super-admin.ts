import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { SuperAdmin } from '../src/database/entities/public/super-admin.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const adminRepo = app.get<Repository<SuperAdmin>>(getRepositoryToken(SuperAdmin));

  const email = process.argv[2] || 'admin@whatsapp-commerce.com';
  const password = process.argv[3] || 'admin123456';

  const existing = await adminRepo.findOne({ where: { email } });
  if (existing) {
    console.log('⚠️  Super admin already exists:', email);
    await app.close();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = adminRepo.create({
    email,
    passwordHash,
    name: 'Super Admin',
    role: 'admin',
  });

  await adminRepo.save(admin);
  console.log('✅ Super admin created:', email);

  await app.close();
}

main();
