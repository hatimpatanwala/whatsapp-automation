import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { InvoiceController } from './invoice.controller';

@Module({
  imports: [WhatsAppModule],
  controllers: [InvoiceController],
})
export class InvoiceModule {}
