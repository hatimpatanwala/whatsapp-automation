import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { RazorpayOrder } from '../../database/entities/public/razorpay-order.entity';
import { RazorpaySubscription } from '../../database/entities/public/razorpay-subscription.entity';
import { WalletService } from './wallet.service';

interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly config: RazorpayConfig;
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  constructor(
    @InjectRepository(RazorpayOrder)
    private readonly orderRepo: Repository<RazorpayOrder>,
    @InjectRepository(RazorpaySubscription)
    private readonly subRepo: Repository<RazorpaySubscription>,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
  ) {
    this.config = {
      keyId: this.configService.get<string>('RAZORPAY_KEY_ID', ''),
      keySecret: this.configService.get<string>('RAZORPAY_KEY_SECRET', ''),
      webhookSecret: this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET', ''),
    };
  }

  /**
   * Create a Razorpay order for wallet top-up.
   */
  async createWalletTopupOrder(tenantId: string, amountInr: number): Promise<{
    orderId: string;
    razorpayOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
  }> {
    if (amountInr < 1) throw new BadRequestException('Minimum top-up is ₹1');

    const receipt = `wallet_${tenantId.slice(0, 8)}_${Date.now()}`;
    const amountPaise = Math.round(amountInr * 100);

    const rzpOrder = await this.razorpayRequest('POST', '/orders', {
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: { tenant_id: tenantId, purpose: 'wallet_topup' },
    });

    const order = this.orderRepo.create({
      tenantId,
      razorpayOrderId: rzpOrder.id,
      amount: amountInr,
      currency: 'INR',
      status: 'created',
      purpose: 'wallet_topup',
      receipt,
      notes: { tenant_id: tenantId },
    });
    await this.orderRepo.save(order);

    return {
      orderId: order.id,
      razorpayOrderId: rzpOrder.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: this.config.keyId,
    };
  }

  /**
   * Create a Razorpay order for subscription payment.
   */
  async createSubscriptionOrder(tenantId: string, planId: string, amountInr: number): Promise<any> {
    const receipt = `sub_${tenantId.slice(0, 8)}_${Date.now()}`;
    const amountPaise = Math.round(amountInr * 100);

    const rzpOrder = await this.razorpayRequest('POST', '/orders', {
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: { tenant_id: tenantId, purpose: 'subscription', plan_id: planId },
    });

    const order = this.orderRepo.create({
      tenantId,
      razorpayOrderId: rzpOrder.id,
      amount: amountInr,
      currency: 'INR',
      status: 'created',
      purpose: 'subscription',
      receipt,
      notes: { tenant_id: tenantId, plan_id: planId },
    });
    await this.orderRepo.save(order);

    return {
      orderId: order.id,
      razorpayOrderId: rzpOrder.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: this.config.keyId,
    };
  }

  /**
   * Verify Razorpay payment signature and credit wallet / activate subscription.
   */
  async verifyPayment(data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<{ verified: boolean; message: string }> {
    // Verify signature
    const body = data.razorpay_order_id + '|' + data.razorpay_payment_id;
    const expectedSig = createHmac('sha256', this.config.keySecret).update(body).digest('hex');

    if (expectedSig !== data.razorpay_signature) {
      this.logger.warn(`Invalid Razorpay signature for order ${data.razorpay_order_id}`);
      return { verified: false, message: 'Invalid payment signature' };
    }

    // Update order
    const order = await this.orderRepo.findOne({ where: { razorpayOrderId: data.razorpay_order_id } });
    if (!order) return { verified: false, message: 'Order not found' };

    if (order.status === 'paid') return { verified: true, message: 'Already processed' };

    await this.orderRepo.update(order.id, {
      status: 'paid',
      razorpayPaymentId: data.razorpay_payment_id,
      razorpaySignature: data.razorpay_signature,
    });

    // Credit wallet for top-ups
    if (order.purpose === 'wallet_topup') {
      await this.walletService.credit(order.tenantId, Number(order.amount), 'Wallet top-up via Razorpay', {
        razorpayPaymentId: data.razorpay_payment_id,
        razorpayOrderId: data.razorpay_order_id,
        referenceType: 'razorpay_order',
        referenceId: order.id,
      });
    }

    this.logger.log(`Payment verified for order ${data.razorpay_order_id}: ₹${order.amount}`);
    return { verified: true, message: 'Payment verified and processed' };
  }

  /**
   * Handle Razorpay webhook events.
   */
  async handleWebhook(body: any, signature: string): Promise<void> {
    // Verify webhook signature
    const expectedSig = createHmac('sha256', this.config.webhookSecret).update(JSON.stringify(body)).digest('hex');
    if (expectedSig !== signature) {
      this.logger.warn('Invalid Razorpay webhook signature');
      return;
    }

    const event = body.event;
    const payload = body.payload;

    switch (event) {
      case 'payment.captured': {
        const payment = payload.payment?.entity;
        if (payment?.order_id) {
          await this.verifyPayment({
            razorpay_order_id: payment.order_id,
            razorpay_payment_id: payment.id,
            razorpay_signature: '', // Webhook-verified, no client signature
          });
        }
        break;
      }
      case 'payment.failed': {
        const payment = payload.payment?.entity;
        if (payment?.order_id) {
          await this.orderRepo.update(
            { razorpayOrderId: payment.order_id },
            { status: 'failed', razorpayPaymentId: payment.id },
          );
        }
        break;
      }
      case 'subscription.activated':
      case 'subscription.charged':
      case 'subscription.cancelled':
      case 'subscription.paused':
      case 'subscription.resumed': {
        const sub = payload.subscription?.entity;
        if (sub?.id) {
          const status = event.split('.')[1];
          await this.subRepo.update(
            { razorpaySubscriptionId: sub.id },
            { status },
          );
        }
        break;
      }
    }

    this.logger.log(`Razorpay webhook processed: ${event}`);
  }

  /**
   * Get Razorpay key ID for frontend checkout.
   */
  getKeyId(): string {
    return this.config.keyId;
  }

  /**
   * Get payment history for a tenant.
   */
  async getPaymentHistory(tenantId: string): Promise<RazorpayOrder[]> {
    return this.orderRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  private async razorpayRequest(method: string, path: string, body?: any): Promise<any> {
    const auth = Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64');
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${this.baseUrl}${path}`, options);
    const data = await response.json();

    if (!response.ok) {
      this.logger.error(`Razorpay API error: ${JSON.stringify(data)}`);
      throw new Error(data.error?.description || 'Razorpay API error');
    }

    return data;
  }
}
