import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { LoyaltyService } from '../../../promotions/loyalty.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

/**
 * Lists the store's currently-active offers (schemes), loyalty programs and
 * public coupons to the customer. Instant offers auto-apply in the cart; loyalty
 * shows the customer's own progress; coupons are codes the customer types.
 */
@Injectable()
export class ShowOffersNodeHandler implements NodeHandler {
  readonly nodeType = 'show_offers';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly loyalty: LoyaltyService,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const cfg = node.config || {};
    const data = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      // Resolve customer id from phone for loyalty progress.
      if (!ctx.customerId) {
        const c = (await qr.query(`SELECT id FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1`, [ctx.customerPhone, `+${ctx.customerPhone}`]))[0];
        if (c?.id) ctx.customerId = c.id;
      }
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

    const loyalty = ctx.customerId
      ? await this.loyalty.progressForCustomer(ctx.schema, ctx.customerId).catch(() => [])
      : [];

    let body: string;
    if (!data.schemes.length && !data.coupons.length && !loyalty.length) {
      body = resolveTemplate(cfg.emptyMessage || 'No active offers right now — check back soon! 🛍️', ctx);
    } else {
      body = cfg.header || '🎉 *Current Offers*';
      for (const s of data.schemes) {
        const cfg2 = typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {});
        body += `\n\n🏷️ *${s.name}* — ${this.schemeLabel(s.action, cfg2)}`;
        if (s.description) body += `\n_${s.description}_`;
      }
      if (loyalty.length) {
        body += `\n\n⭐ *Loyalty Rewards*`;
        for (const l of loyalty) {
          const c = typeof l.conditions === 'string' ? JSON.parse(l.conditions) : (l.conditions || {});
          const r = typeof l.reward === 'string' ? JSON.parse(l.reward) : (l.reward || {});
          const target = Number(c.target) || 0;
          const progress = Number(l.progress) || 0;
          const rewardTxt = r.discountType === 'amount' ? `₹${r.discountValue} off` : `${r.discountValue || 0}% off`;
          if (c.metric === 'orders') {
            const have = Math.floor(progress);
            body += `\n• *${l.name}* — ${have}/${target} orders → ${rewardTxt} coupon`;
          } else {
            const remain = Math.max(0, target - progress);
            body += `\n• *${l.name}* — spend ${remain > 0 ? `₹${Math.round(remain)} more` : 'reached!'} → ${rewardTxt} coupon`;
          }
        }
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
