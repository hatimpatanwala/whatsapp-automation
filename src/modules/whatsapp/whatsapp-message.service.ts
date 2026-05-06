import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { WhatsAppApiService } from './whatsapp-api.service';

@Injectable()
export class WhatsAppMessageService {
  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly whatsappApi: WhatsAppApiService,
  ) {}

  async logAndSendText(
    schema: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    conversationId: string,
    text: string,
  ): Promise<void> {
    const result = await this.whatsappApi.sendTextMessage(phoneNumberId, accessToken, to, text);
    const waMessageId = result?.messages?.[0]?.id;

    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content, status)
         VALUES ($1, $2, 'outbound', 'text', $3, 'sent')`,
        [conversationId, waMessageId, JSON.stringify({ body: text })],
      );
      await qr.query(
        `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
        [conversationId],
      );
    });
  }

  async logAndSendInteractiveButtons(
    schema: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    conversationId: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    header?: string,
  ): Promise<void> {
    const result = await this.whatsappApi.sendInteractiveButtons(
      phoneNumberId, accessToken, to, body, buttons, header,
    );
    const waMessageId = result?.messages?.[0]?.id;

    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content, status)
         VALUES ($1, $2, 'outbound', 'interactive', $3, 'sent')`,
        [conversationId, waMessageId, JSON.stringify({ body, buttons, header })],
      );
      await qr.query(
        `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
        [conversationId],
      );
    });
  }

  async logAndSendInteractiveList(
    schema: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    conversationId: string,
    body: string,
    buttonText: string,
    sections: any[],
    header?: string,
  ): Promise<void> {
    const result = await this.whatsappApi.sendInteractiveList(
      phoneNumberId, accessToken, to, body, buttonText, sections, header,
    );
    const waMessageId = result?.messages?.[0]?.id;

    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content, status)
         VALUES ($1, $2, 'outbound', 'interactive', $3, 'sent')`,
        [conversationId, waMessageId, JSON.stringify({ body, buttonText, sections, header })],
      );
      await qr.query(
        `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
        [conversationId],
      );
    });
  }
}
