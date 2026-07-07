import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { CollectController } from './collect.controller';
import { CollectService } from './collect.service';

/**
 * Payments & Collections (PAYMENTS_MODULE_README): Mode A manual collection with
 * dynamic UPI QR + pending-confirmations queue, Modes B/C via the Razorpay
 * adapters (Smart Collect virtual UPI / payment links) with signature-verified,
 * idempotent webhooks. Confirmation feeds the existing invoice payment flow.
 */
@Module({
  imports: [ErpModule],
  controllers: [CollectController],
  providers: [CollectService],
  exports: [CollectService],
})
export class CollectModule {}
