import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

/**
 * Lists the store's currently-active offers (schemes) and public coupons to the
 * customer. Offers auto-apply in the cart; coupons are codes the customer types.
 */
@Injectable()
export class ShowOffersNodeHandler implements NodeHandler {
  readonly nodeType = 'show_offers';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const cfg = node.config || {};
    const data = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      const schemes = await qr.query(
        `SELECT name, description, action, conditions FROM schemes
          WHERE status = 'active' AND type = 'instant' AND audience = 'all'
            AND (valid_from IS NULL OR valid_from <= NOW())
            AND (valid_until IS NULL OR valid_until >= NOW())
          ORDER BY weight DESC LIMIT 10`,
      );
      const coupons = await qr.query(
        `SELECT code, description, discount_type, discount_value, min_cart_value FROM coupons
          WHERE status = 'active' AND audience = 'all'
            AND (valid_from IS NULL OR valid_from <= NOW())
            AND (valid_until IS NULL OR valid_until >= NOW())
            AND (usage_limit IS NULL OR used_count < usage_limit)
          ORDER BY created_at DESC LIMIT 10`,
      );
      return { schemes, coupons };
    });

    let body: string;
    if (!data.schemes.length && !data.coupons.length) {
      body = resolveTemplate(cfg.emptyMessage || 'No active offers right now — check back soon! 🛍️', ctx);
    } else {
      body = cfg.header || '🎉 *Current Offers*';
      for (const s of data.schemes) {
        const cfg2 = typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {});
        body += `\n\n🏷️ *${s.name}* — ${this.schemeLabel(s.action, cfg2)}`;
        if (s.description) body += `\n_${s.description}_`;
      }
      if (data.coupons.length) {
        body += `\n\n🎟️ *Coupons*`;
        for (const c of data.coupons) {
          const d = c.discount_type === 'amount' ? `₹${c.discount_value} off` : `${c.discount_value}% off`;
          const min = Number(c.min_cart_value) > 0 ? ` (min ₹${c.min_cart_value})` : '';
          body += `\n• Use *${c.code}* — ${d}${min}`;
        }
      }
      body += `\n\n🛍️ Offers apply automatically in your cart. Send *menu* to start shopping!`;
    }

    await this.messageService.logAndSendText(ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, ctx.conversationId, body);

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }

  private schemeLabel(action: string, cfg: any): string {
    if (action === 'buy_x_get_x_free') return `Buy ${cfg.buyQty || 1} Get ${cfg.getQty || 1} Free`;
    if (action === 'buy_x_get_y_free') return `Buy ${cfg.buyQty || 1} → Free Gift 🎁`;
    return cfg.discountType === 'amount' ? `₹${cfg.discountValue} OFF` : `${cfg.discountValue || 0}% OFF`;
  }
}
