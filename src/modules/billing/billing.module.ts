import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../../database/entities/public/wallet.entity';
import { WalletTransaction } from '../../database/entities/public/wallet-transaction.entity';
import { RazorpayOrder } from '../../database/entities/public/razorpay-order.entity';
import { RazorpaySubscription } from '../../database/entities/public/razorpay-subscription.entity';
import { WalletService } from './wallet.service';
import { RazorpayService } from './razorpay.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      RazorpayOrder,
      RazorpaySubscription,
    ]),
  ],
  controllers: [BillingController],
  providers: [WalletService, RazorpayService],
  exports: [WalletService, RazorpayService],
})
export class BillingModule {}
