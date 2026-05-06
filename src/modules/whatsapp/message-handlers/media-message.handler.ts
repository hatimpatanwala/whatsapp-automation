import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppMessageService } from '../whatsapp-message.service';
import { MessageContext } from './text-message.handler';

@Injectable()
export class MediaMessageHandler {
  private readonly logger = new Logger(MediaMessageHandler.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly whatsappApi: WhatsAppApiService,
    private readonly messageService: WhatsAppMessageService,
  ) {}

  async handle(context: MessageContext, media: any, type: string): Promise<void> {
    const { schema, tenant, from } = context;

    // Get customer and conversation
    const customer = await this.getCustomer(schema, from);
    if (!customer) return;

    const conversation = await this.getConversation(schema, customer.id);
    if (!conversation) return;

    // Log the inbound media message
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content)
         VALUES ($1, $2, 'inbound', $3, $4)`,
        [conversation.id, context.messageId, type, JSON.stringify(media)],
      );
      await qr.query(
        `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
        [conversation.id],
      );
    });

    // Check if we're expecting a payment proof
    const currentFlow = conversation.context?.flow;
    if (currentFlow === 'awaiting_payment_proof' && type === 'image') {
      await this.handlePaymentProof(context, customer, conversation, media);
      return;
    }

    // Default response for media
    await this.messageService.logAndSendText(
      schema, tenant.phoneNumberId, tenant.accessToken,
      from, conversation.id,
      'Thank you for the image. Type "menu" to see available options.',
    );
  }

  private async handlePaymentProof(
    context: MessageContext,
    customer: any,
    conversation: any,
    media: any,
  ): Promise<void> {
    const { schema, tenant } = context;
    const orderId = conversation.context?.pending_payment_order_id;

    if (!orderId) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversation.id,
        'No pending payment found. Type "menu" to continue.',
      );
      return;
    }

    // Download media and store it (simplified - would use S3 in production)
    const mediaId = media.id;
    const mediaUrl = await this.whatsappApi.getMediaUrl(mediaId, tenant.accessToken);

    // Update payment record with proof
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `UPDATE payments SET status = 'proof_uploaded', proof_image_url = $1, updated_at = NOW()
         WHERE order_id = $2 AND status = 'pending'`,
        [mediaUrl, orderId],
      );
    });

    await this.messageService.logAndSendText(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversation.id,
      '✅ Payment proof received! Our team will verify it shortly. You\'ll be notified once confirmed.',
    );

    // Update flow
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `UPDATE conversations SET context = jsonb_set(context, '{flow}', '"payment_verification_pending"') WHERE id = $1`,
        [conversation.id],
      );
    });
  }

  private async getCustomer(schema: string, phone: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(`SELECT * FROM customers WHERE phone = $1`, [phone]);
      return result[0];
    });
  }

  private async getConversation(schema: string, customerId: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `SELECT * FROM conversations WHERE customer_id = $1 AND status = 'open'`, [customerId],
      );
      return result[0];
    });
  }
}
