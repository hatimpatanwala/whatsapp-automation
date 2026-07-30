import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';
import { EmailRegistryService } from './email-registry.service';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Tenant } from '../../database/entities/public/tenant.entity';

/**
 * RBAC (employees, roles, per-feature read/write permissions). Global so the
 * PermissionGuard + AccessService can be applied from any controller across the
 * portal and ERP without every feature module importing this one.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [AccessController],
  providers: [AccessService, EmailRegistryService, PermissionGuard],
  exports: [AccessService, EmailRegistryService, PermissionGuard],
})
export class AccessModule {}
