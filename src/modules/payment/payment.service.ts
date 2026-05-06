import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { EventBusService } from '../events/event-bus.service';
import { PaymentVerifiedEvent, PaymentRejectedEvent, PaymentExpiredEvent } from '../events/domain-events';
import { QrCodeService } from './qr-code.service';
import { QUEUE_PAYMENT_EXPIRY } from '../../queue/queue.module';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
    private readonly qrCodeService: QrCodeService,
    @InjectQueue(QUEUE_PAYMENT_EXPIRY)
    private readonly expiryQueue: Queue,
  ) {}

  async createPayment(
    schema: string,
    orderId: string,
    method: string,
    amount: number,
    expiryMinutes = 30,
  ): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      // Get tenant UPI settings
      const settings = await qr.query(
        `SELECT value FROM settings WHERE key = 'upi_ids'`,
      );
      const upiIds = JSON.parse(settings[0]?.value || '[]');
      const upiId = upiIds[0] || null;

      // Generate QR code if UPI
      let qrCodeUrl: string | null = null;
      if (method === 'upi_qr' && upiId) {
        qrCodeUrl = await this.qrCodeService.generateUpiQr(upiId, amount, orderId);
      }

      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      const payment = await qr.query(
        `INSERT INTO payments (order_id, method, amount, upi_id, qr_code_url, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
        [orderId, method, amount, upiId, qrCodeUrl, expiresAt],
      );

      // Schedule expiry
      await this.expiryQueue.add(
        'payment-expired',
        { schema, paymentId: payment[0].id, orderId },
        { delay: expiryMinutes * 60 * 1000 },
      );

      return payment[0];
    });
  }

  async findAll(schema: string, status?: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let query = `SELECT p.*, o.order_number, c.phone as customer_phone, c.name as customer_name
                   FROM payments p
                   JOIN orders o ON o.id = p.order_id
                   JOIN customers c ON c.id = o.customer_id`;
      const params: any[] = [];

      if (status) {
        query += ` WHERE p.status = $1`;
        params.push(status);
      }

      query += ` ORDER BY p.created_at DESC`;
      return qr.query(query, params);
    });
  }

  async verifyPayment(schema: string, paymentId: string, verifiedBy: string, transactionRef?: string): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      const payment = await qr.query(
        `SELECT p.*, o.customer_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1 FOR UPDATE`,
        [paymentId],
      );
      if (!payment[0]) throw new NotFoundException('Payment not found');

      await qr.query(
        `UPDATE payments SET status = 'verified', verified_by = $1, verified_at = NOW(), transaction_ref = $2, updated_at = NOW()
         WHERE id = $3`,
        [verifiedBy, transactionRef, paymentId],
      );

      // Update order status to confirmed
      await qr.query(
        `UPDATE orders SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [payment[0].order_id],
      );

      this.eventBus.emit(new PaymentVerifiedEvent(
        schema, paymentId, payment[0].order_id, payment[0].customer_id, parseFloat(payment[0].amount),
      ));

      return { ...payment[0], status: 'verified' };
    });
  }

  async rejectPayment(schema: string, paymentId: string, reason: string): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      const payment = await qr.query(
        `SELECT p.*, o.customer_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1`,
        [paymentId],
      );
      if (!payment[0]) throw new NotFoundException('Payment not found');

      await qr.query(
        `UPDATE payments SET status = 'rejected', notes = $1, updated_at = NOW() WHERE id = $2`,
        [reason, paymentId],
      );

      this.eventBus.emit(new PaymentRejectedEvent(
        schema, paymentId, payment[0].order_id, payment[0].customer_id, reason,
      ));

      return { ...payment[0], status: 'rejected' };
    });
  }

  async handleExpiry(schema: string, paymentId: string, orderId: string): Promise<void> {
    await this.connectionManager.executeInTransaction(schema, async (qr) => {
      const payment = await qr.query(
        `SELECT p.*, o.customer_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1 AND p.status = 'pending'`,
        [paymentId],
      );

      if (!payment[0]) return; // Already handled

      await qr.query(`UPDATE payments SET status = 'expired', updated_at = NOW() WHERE id = $1`, [paymentId]);

      this.eventBus.emit(new PaymentExpiredEvent(schema, paymentId, orderId, payment[0].customer_id));
    });
  }
}
