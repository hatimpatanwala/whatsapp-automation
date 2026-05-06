import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Module({
  controllers: [TenantController],
  providers: [TenantService, TenantProvisioningService],
  exports: [TenantService, TenantProvisioningService],
})
export class TenantModule {}
