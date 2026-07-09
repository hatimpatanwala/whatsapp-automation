import { Global, Module } from '@nestjs/common';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';
import { PermissionGuard } from '../../common/guards/permission.guard';

/**
 * RBAC (employees, roles, per-feature read/write permissions). Global so the
 * PermissionGuard + AccessService can be applied from any controller across the
 * portal and ERP without every feature module importing this one.
 */
@Global()
@Module({
  controllers: [AccessController],
  providers: [AccessService, PermissionGuard],
  exports: [AccessService, PermissionGuard],
})
export class AccessModule {}
