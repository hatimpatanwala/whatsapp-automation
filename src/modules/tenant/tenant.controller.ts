import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('admin/tenants')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly provisioningService: TenantProvisioningService,
  ) {}

  @Get()
  @Roles('admin', 'support')
  async findAll() {
    return this.tenantService.findAll();
  }

  @Get(':id')
  @Roles('admin', 'support')
  async findOne(@Param('id') id: string) {
    return this.tenantService.findById(id);
  }

  @Post()
  @Roles('admin')
  async create(@Body() dto: CreateTenantDto) {
    return this.provisioningService.provisionTenant(dto);
  }

  @Put(':id/suspend')
  @Roles('admin')
  async suspend(@Param('id') id: string) {
    await this.tenantService.suspend(id);
    return { message: 'Tenant suspended' };
  }

  @Put(':id/activate')
  @Roles('admin')
  async activate(@Param('id') id: string) {
    await this.tenantService.activate(id);
    return { message: 'Tenant activated' };
  }
}
