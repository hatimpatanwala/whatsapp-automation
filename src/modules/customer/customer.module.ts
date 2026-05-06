import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';

@Module({
  controllers: [CustomerController, AddressController],
  providers: [CustomerService, AddressService],
  exports: [CustomerService, AddressService],
})
export class CustomerModule {}
