import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantMigrationService } from './tenant-migration.service';
import { Tenant } from './entities/public/tenant.entity';
import { Subscription } from './entities/public/subscription.entity';
import { SuperAdmin } from './entities/public/super-admin.entity';
import { TenantMigrationHistory } from './entities/public/tenant-migration-history.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'whatsapp_commerce'),
        entities: [Tenant, Subscription, SuperAdmin, TenantMigrationHistory],
        synchronize: configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
        logging: configService.get<string>('NODE_ENV') === 'development',
        poolSize: configService.get<number>('DB_POOL_SIZE', 50),
      }),
    }),
    TypeOrmModule.forFeature([Tenant, Subscription, SuperAdmin, TenantMigrationHistory]),
  ],
  providers: [TenantConnectionManager, TenantMigrationService],
  exports: [TypeOrmModule, TenantConnectionManager, TenantMigrationService],
})
export class DatabaseModule {}
