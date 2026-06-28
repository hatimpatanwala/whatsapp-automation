import { Module, forwardRef } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';
import { CampaignModule } from '../campaign/campaign.module';
import { BuilderModule } from '../builder/builder.module';
import { CustomersWebviewController } from './customers-webview.controller';

@Module({
  imports: [forwardRef(() => CampaignModule), BuilderModule],
  controllers: [CustomerController, AddressController, CustomersWebviewController],
  providers: [CustomerService, AddressService],
  exports: [CustomerService, AddressService],
})
export class CustomerModule {}
