import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppApiService } from '../../../whatsapp/whatsapp-api.service';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';

@Injectable()
export class PaymentQrNodeHandler implements NodeHandler {
  readonly nodeType = 'payment_qr';

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const orderId = ctx.variables.order_id;
    if (!orderId) {
      return { action: 'error', message: 'payment_qr: no order_id in context' };
    }

    const expiryMinutes = node.config.expiryMinutes || 30;

    // Create payment record and get QR
    const payment = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      // Get order total
      const order = await qr.query(`SELECT total FROM orders WHERE id = $1`, [orderId]);
      if (order.length === 0) throw new Error('Order not found');

      // Get UPI IDs from settings
      const settings = await qr.query(
        `SELECT value FROM settings WHERE key = 'upi_ids'`,
      );
      const upiIds = settings.length > 0 ? JSON.parse(settings[0].value) : [];
      const upiId = upiIds[0] || 'merchant@upi';

      // Create payment record
      const result = await qr.query(
        `INSERT INTO payments (order_id, amount, method, status, expires_at, metadata)
         VALUES ($1, $2, 'upi_qr', 'pending', NOW() + INTERVAL '${expiryMinutes} minutes', $3)
         RETURNING *`,
        [orderId, order[0].total, JSON.stringify({ upi_id: upiId })],
      );

      return { paymentId: result[0].id, amount: order[0].total, upiId };
    });

    ctx.variables.payment_id = payment.paymentId;

    // Send payment instruction text
    await this.messageService.logAndSendText(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId,
      `💳 Please pay ₹${payment.amount} to UPI: ${payment.upiId}\n\nPayment expires in ${expiryMinutes} minutes.\nSend a screenshot of the payment as proof.`,
    );

    // Wait for payment proof (media message)
    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id, expiryMinutes, awaitingPaymentProof: true } };
  }
}
