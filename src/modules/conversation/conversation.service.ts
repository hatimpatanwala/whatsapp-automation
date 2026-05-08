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
        `SELECT conv.*,
                json_build_object(
                  'id', c.id,
                  'whatsapp_phone', c.phone,
                  'whatsapp_name', c.name
                ) as customer,
                (SELECT m.content FROM messages m
                 WHERE m.conversation_id = conv.id
                 ORDER BY m.created_at DESC LIMIT 1
                ) as last_message_content
         FROM conversations conv
         JOIN customers c ON c.id = conv.customer_id
         ORDER BY conv.last_message_at DESC NULLS LAST
         LIMIT $1 OFFSET $2`,
        [pagination.limit, pagination.skip],
      );
      conversations.forEach((c: any) => {
        c.customer = typeof c.customer === 'string' ? JSON.parse(c.customer) : c.customer;
        // Build a text preview from the last message JSONB content
        const lmc = c.last_message_content;
        if (lmc) {
          const obj = typeof lmc === 'string' ? JSON.parse(lmc) : lmc;
          c.lastMessagePreview = obj?.body
            || obj?.button_reply?.title
            || obj?.list_reply?.title
            || obj?.caption
            || (obj?.type ? `[${obj.type}]` : '');
        }
        delete c.last_message_content;
      });

      return new PaginatedResponse(conversations, total, pagination.page, pagination.limit);
    });
  }

  async getStats(schema: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const stats = await qr.query(`
        SELECT
          COUNT(*)::int as total_conversations,
          COUNT(*) FILTER (WHERE status = 'open')::int as open_conversations,
          COUNT(*) FILTER (WHERE status = 'pending')::int as pending_conversations,
          COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= CURRENT_DATE)::int as resolved_today,
          COUNT(*) FILTER (WHERE assigned_to IS NULL AND status IN ('open', 'pending'))::int as unassigned,
          0::numeric as average_first_response_minutes,
          0::numeric as average_resolution_minutes
        FROM conversations
      `);
      return stats[0];
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
