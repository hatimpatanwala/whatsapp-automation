import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErpModule } from '../erp/erp.module';
import { OrderModule } from '../order/order.module';
import { EntryModule } from '../entry/entry.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { MediaModule } from '../media/media.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { SfaController } from './sfa.controller';
import { SfaService } from './sfa.service';

/**
 * SFA (Sales Force Automation): admin registers salesmen by WhatsApp number;
 * each gets a tokenized /m/sales webview to take orders on customers' behalf,
 * view pending invoices, collect payments (cash/cheque/UPI/online with
 * instrument details) and record promise-to-pay follow-ups.
 */
@Module({
  imports: [ErpModule, OrderModule, EntryModule, PromotionsModule, MediaModule, WhatsAppModule, TypeOrmModule.forFeature([Tenant])],
  controllers: [SfaController],
  providers: [SfaService],
  exports: [SfaService],
})
export class SfaModule {}
