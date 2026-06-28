import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { OrderModule } from '../order/order.module';
import { InvoiceController } from './invoice.controller';

@Module({
  imports: [WhatsAppModule, OrderModule],
  controllers: [InvoiceController],
})
export class InvoiceModule {}
