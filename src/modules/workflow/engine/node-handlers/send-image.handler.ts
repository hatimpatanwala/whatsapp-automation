import { Injectable } from '@nestjs/common';
import { WhatsAppApiService } from '../../../whatsapp/whatsapp-api.service';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class SendImageNodeHandler implements NodeHandler {
  readonly nodeType = 'send_image';

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const imageUrl = resolveTemplate(node.config.imageUrl || '', ctx);
    const caption = resolveTemplate(node.config.caption || '', ctx);

    if (!imageUrl) return { action: 'error', message: 'send_image: no imageUrl configured' };

    const result = await this.whatsappApi.sendImage(
      ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, imageUrl, caption,
    );

    // Log outbound message
    const waMessageId = result?.messages?.[0]?.id;
    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      await qr.query(
        `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content, status)
         VALUES ($1, $2, 'outbound', 'image', $3, 'sent')`,
        [ctx.conversationId, waMessageId, JSON.stringify({ imageUrl, caption })],
      );
      await qr.query(`UPDATE conversations SET last_message_at = NOW() WHERE id = $1`, [ctx.conversationId]);
    });

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
