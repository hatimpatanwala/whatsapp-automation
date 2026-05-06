import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalStrategy } from './strategies/local.strategy';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { SuperAdmin } from '../../database/entities/public/super-admin.entity';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    PassportModule.register({ session: true }),
    TypeOrmModule.forFeature([Tenant, SuperAdmin, Subscription]),
    TenantModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy],
  exports: [AuthService],
})
export class AuthModule {}
