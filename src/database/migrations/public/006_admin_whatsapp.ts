import { QueryRunner } from 'typeorm';

export async function up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS admin_whatsapp_number VARCHAR(20) NULL;
  `);
  await queryRunner.query(`
    ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS admin_whatsapp_verified BOOLEAN DEFAULT false;
  `);
}

export async function down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`ALTER TABLE public.tenants DROP COLUMN IF EXISTS admin_whatsapp_verified;`);
  await queryRunner.query(`ALTER TABLE public.tenants DROP COLUMN IF EXISTS admin_whatsapp_number;`);
}
