import { Injectable } from '@nestjs/common';
import { WhatsAppApiService } from '../../../whatsapp/whatsapp-api.service';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

@Injectable()
export class SendTemplateNodeHandler implements NodeHandler {
  readonly nodeType = 'send_template';

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const templateName = node.config.templateName;
    const language = node.config.language || 'en';

    if (!templateName) return { action: 'error', message: 'send_template: no templateName configured' };

    const result = await this.whatsappApi.sendTemplate(
      ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, templateName, language,
    );

    const waMessageId = result?.messages?.[0]?.id;
    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      await qr.query(
        `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content, status)
         VALUES ($1, $2, 'outbound', 'template', $3, 'sent')`,
        [ctx.conversationId, waMessageId, JSON.stringify({ templateName, language })],
      );
      await qr.query(`UPDATE conversations SET last_message_at = NOW() WHERE id = $1`, [ctx.conversationId]);
    });

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
