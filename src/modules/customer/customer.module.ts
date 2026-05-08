import { Module, forwardRef } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';
import { CampaignModule } from '../campaign/campaign.module';

@Module({
  imports: [forwardRef(() => CampaignModule)],
  controllers: [CustomerController, AddressController],
  providers: [CustomerService, AddressService],
  exports: [CustomerService, AddressService],
})
export class CustomerModule {}
