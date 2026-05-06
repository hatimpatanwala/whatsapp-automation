import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { QrCodeService } from './qr-code.service';
import { PaymentExpiryProcessor } from './payment-expiry.processor';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, QrCodeService, PaymentExpiryProcessor],
  exports: [PaymentService, QrCodeService],
})
export class PaymentModule {}
