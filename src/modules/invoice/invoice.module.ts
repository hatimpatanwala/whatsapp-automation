import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { OrderModule } from '../order/order.module';
import { BuilderModule } from '../builder/builder.module';
import { InvoiceController } from './invoice.controller';
import { InvoiceWebviewController } from './invoice-webview.controller';

@Module({
  imports: [WhatsAppModule, OrderModule, BuilderModule],
  controllers: [InvoiceController, InvoiceWebviewController],
})
export class InvoiceModule {}
