import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class SendListNodeHandler implements NodeHandler {
  readonly nodeType = 'send_list';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const body = resolveTemplate(node.config.body || node.config.message || node.config.text || 'Please select an option:', ctx);
    const buttonText = node.config.buttonText || 'View Options';
    const source = node.config.source || 'custom';

    let sections: any[];

    if (source === 'categories') {
      sections = await this.buildCategorySections(ctx.schema);
    } else if (source === 'products') {
      sections = await this.buildProductSections(ctx.schema);
    } else {
      // Custom items — not yet supported in the builder, just send a basic list
      sections = [{ title: 'Options', rows: [{ id: 'wf_list_0', title: 'Option 1' }] }];
    }

    await this.messageService.logAndSendInteractiveList(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, body, buttonText, sections,
    );

    // Pause for customer selection
    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id, source } };
  }

  private async buildCategorySections(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const cats = await qr.query(
        `SELECT id, name FROM categories WHERE is_active = true ORDER BY sort_order, name LIMIT 10`,
      );
      return [{
        title: 'Categories',
        rows: cats.map((c: any) => ({ id: `wf_cat_${c.id}`, title: c.name.substring(0, 24) })),
      }];
    });
  }

  private async buildProductSections(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const products = await qr.query(
        `SELECT p.id, p.name, COALESCE(p.sale_price, p.base_price) AS price FROM products p WHERE p.is_active = true ORDER BY p.created_at DESC LIMIT 10`,
      );
      return [{
        title: 'Products',
        rows: products.map((p: any) => ({
          id: `wf_prod_${p.id}`,
          title: p.name.substring(0, 24),
          description: `₹${p.price}`,
        })),
      }];
    });
  }
}
