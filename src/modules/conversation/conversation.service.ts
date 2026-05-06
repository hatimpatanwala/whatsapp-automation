import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class ConversationService {
  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async findAll(schema: string, pagination: PaginationDto): Promise<PaginatedResponse<any>> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const countResult = await qr.query(`SELECT COUNT(*) as total FROM conversations`);
      const total = parseInt(countResult[0].total);

      const conversations = await qr.query(
        `SELECT conv.*, c.name as customer_name, c.phone as customer_phone
         FROM conversations conv
         JOIN customers c ON c.id = conv.customer_id
         ORDER BY conv.last_message_at DESC NULLS LAST
         LIMIT $1 OFFSET $2`,
        [pagination.limit, pagination.skip],
      );

      return new PaginatedResponse(conversations, total, pagination.page, pagination.limit);
    });
  }

  async getMessages(schema: string, conversationId: string, pagination: PaginationDto): Promise<PaginatedResponse<any>> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const countResult = await qr.query(
        `SELECT COUNT(*) as total FROM messages WHERE conversation_id = $1`, [conversationId],
      );
      const total = parseInt(countResult[0].total);

      const messages = await qr.query(
        `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [conversationId, pagination.limit, pagination.skip],
      );

      return new PaginatedResponse(messages, total, pagination.page, pagination.limit);
    });
  }

  async sendManualReply(schema: string, conversationId: string, text: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const conv = await qr.query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
      if (!conv[0]) throw new Error('Conversation not found');

      // This returns conversation info for the caller to handle WhatsApp sending
      return { phone: conv[0].phone, conversationId };
    });
  }
}
