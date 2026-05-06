import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AddressService } from './address.service';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('customers/:customerId/addresses')
@UseGuards(TenantGuard)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get()
  async findAll(@Req() req: Request, @Param('customerId') customerId: string) {
    return this.addressService.findByCustomer(req.tenantContext.schemaName, customerId);
  }

  @Post()
  async create(
    @Req() req: Request,
    @Param('customerId') customerId: string,
    @Body() body: any,
  ) {
    return this.addressService.create(req.tenantContext.schemaName, customerId, body);
  }

  @Delete(':id')
  async delete(@Req() req: Request, @Param('id') id: string) {
    await this.addressService.delete(req.tenantContext.schemaName, id);
    return { message: 'Address deleted' };
  }
}
