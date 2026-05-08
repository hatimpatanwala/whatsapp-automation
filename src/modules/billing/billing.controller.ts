import { Controller, Get, Post, Body, Req, Query, Headers, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { WalletService } from './wallet.service';
import { RazorpayService } from './razorpay.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly walletService: WalletService,
    private readonly razorpayService: RazorpayService,
  ) {}

  // ─── Wallet ─────────────────────────────────────────────────────────────────

  @Get('wallet')
  async getWallet(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    const wallet = await this.walletService.getOrCreateWallet(tenantId);
    return {
      balance: Number(wallet.balance),
      currency: wallet.currency,
      autoRecharge: wallet.autoRecharge,
      autoRechargeAmount: Number(wallet.autoRechargeAmount),
      autoRechargeThreshold: Number(wallet.autoRechargeThreshold),
      lowBalanceAlertThreshold: Number(wallet.lowBalanceAlertThreshold),
    };
  }

  @Get('wallet/transactions')
  async getTransactions(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantId = (req.session as any).tenantId;
    const [data, total] = await this.walletService.getTransactions(
      tenantId,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
    return { data, total };
  }

  @Post('wallet/settings')
  async updateWalletSettings(@Req() req: Request, @Body() body: any) {
    const tenantId = (req.session as any).tenantId;
    return this.walletService.updateSettings(tenantId, body);
  }

  // ─── Razorpay Orders ────────────────────────────────────────────────────────

  @Post('topup')
  async createTopup(@Req() req: Request, @Body() body: { amount: number }) {
    const tenantId = (req.session as any).tenantId;
    return this.razorpayService.createWalletTopupOrder(tenantId, body.amount);
  }

  @Post('subscribe')
  async createSubscription(@Req() req: Request, @Body() body: { planId: string; amount: number }) {
    const tenantId = (req.session as any).tenantId;
    return this.razorpayService.createSubscriptionOrder(tenantId, body.planId, body.amount);
  }

  @Post('verify')
  async verifyPayment(@Body() body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    return this.razorpayService.verifyPayment(body);
  }

  @Get('payments')
  async getPayments(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    return this.razorpayService.getPaymentHistory(tenantId);
  }

  @Get('config')
  async getConfig() {
    return { keyId: this.razorpayService.getKeyId() };
  }

  // ─── Razorpay Webhooks ──────────────────────────────────────────────────────

  @Post('webhook/razorpay')
  @Public()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    await this.razorpayService.handleWebhook(body, signature);
    return { received: true };
  }
}
