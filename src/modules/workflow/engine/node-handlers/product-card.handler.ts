import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppApiService } from '../../../whatsapp/whatsapp-api.service';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { CommerceSettingsHelper } from '../../../whatsapp/helpers/commerce-settings.helper';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

/**
 * Shows the selected product as a card (image + name + price + description).
 * If the cart feature is ON:
 *   - not in cart  → [🛒 Add to Cart] [🛒 View Cart] [🛍️ Keep Shopping]
 *   - in cart (N)  → [➖ Remove one] [➕ Add one] [🛒 View Cart], with "In cart: N"
 * The ➕/➖/Add buttons loop back to this node and re-render live; View Cart and
 * Keep Shopping follow this node's edges (label them "view"/"cart" and
 * "back"/"catalog"). If the cart is OFF, it just shows the product (no buttons).
 */
@Injectable()
export class ProductCardNodeHandler implements NodeHandler {
  readonly nodeType = 'product_card';

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly commerceSettings: CommerceSettingsHelper,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const productId = ctx.variables.selected_product_id;
    if (!productId) {
      const next = findNextEdge(edges, node.id);
      return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
    }

    const settings = await this.commerceSettings.getCommerceSettings(ctx.schema).catch(() => ({ cartEnabled: false } as any));
    const cartEnabled = !!settings.cartEnabled;
    const actionId = ctx.lastReply?.actionId || '';

    const data = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      let customerId = ctx.customerId;
      if (!customerId) {
        const c = (await qr.query(`SELECT id FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1`, [ctx.customerPhone, `+${ctx.customerPhone}`]))[0];
        customerId = c?.id;
      }

      const p = (await qr.query(
        `SELECT name, description, thumbnail, images, COALESCE(sale_price, base_price) AS price, currency FROM products WHERE id = $1 AND is_active = true`,
        [productId],
      ))[0];
      if (!p) return null;

      // Apply cart mutation from a previous button tap on this card.
      if (cartEnabled && customerId) {
        if (actionId.startsWith('pc_add_') || actionId.startsWith('pc_inc_')) {
          await this.changeQty(qr, customerId, productId, p.price, +1);
        } else if (actionId.startsWith('pc_dec_')) {
          await this.changeQty(qr, customerId, productId, p.price, -1);
        }
      }

      let qty = 0;
      if (cartEnabled && customerId) {
        const row = (await qr.query(
          `SELECT ci.quantity FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
           WHERE c.customer_id = $1 AND c.status = 'active' AND ci.product_id = $2`,
          [customerId, productId],
        ))[0];
        qty = row?.quantity || 0;
      }
      return { p, qty };
    });

    if (!data) {
      await this.text(ctx, 'Sorry, that product is no longer available. Send *menu* to browse.');
      const next = findNextEdge(edges, node.id);
      return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
    }

    const { p, qty } = data;
    const image = p.thumbnail || (Array.isArray(p.images) && p.images.length ? p.images[0] : null);
    const cur = p.currency || '₹';
    let body = `*${p.name}*\n${cur}${p.price}`;
    if (p.description) body += `\n\n${String(p.description).substring(0, 350)}`;
    if (cartEnabled && qty > 0) body += `\n\n🛒 In your cart: *${qty}*`;

    // Cart disabled → just show the product (no Add-to-Cart buttons) and let the
    // customer keep browsing. We deliberately do NOT fall through to a View Cart
    // edge here — that would dead-end on an empty cart. Prefer a back/catalog
    // edge; otherwise nudge to the menu and end.
    if (!cartEnabled) {
      if (image) await this.whatsappApi.sendImageSmart(ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, image, body).catch(() => this.text(ctx, body));
      else await this.text(ctx, body);
      const backEdge = edges.find((e) => e.from === node.id && /back|catalog|browse|shop/i.test(`${e.label || ''}${(e as any).condition || ''}`));
      if (backEdge) return { action: 'continue', nextNodeId: backEdge.to };
      await this.text(ctx, '🛍️ Send *menu* to see more products.');
      return { action: 'end' };
    }

    const buttons = qty > 0
      ? [
        { id: `pc_dec_${productId}`, title: '➖ Remove one' },
        { id: `pc_inc_${productId}`, title: '➕ Add one' },
        { id: 'pc_view', title: '🛒 View Cart' },
      ]
      : [
        { id: `pc_add_${productId}`, title: '🛒 Add to Cart' },
        { id: 'pc_view', title: '🛒 View Cart' },
        { id: 'pc_back', title: '🛍️ Keep Shopping' },
      ];

    // Send the product image as a best-effort extra (link-based images are
    // sometimes accepted by the Cloud API but silently undelivered), and ALWAYS
    // carry the full product details in the interactive buttons message — that
    // one is reliably delivered, so the customer always sees name/price/details
    // plus the actions even if the image never arrives.
    if (image) {
      await this.whatsappApi
        .sendImageSmart(ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, image, `*${p.name}*`)
        .catch(() => { /* image is optional — details follow in the buttons message */ });
    }
    await this.whatsappApi.sendInteractiveButtons(ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, body, buttons);

    // add/inc/dec loop back to this card; view/back follow this node's edges.
    const viewEdge = edges.find((e) => e.from === node.id && /view|cart/i.test(`${e.label || ''}${(e as any).condition || ''}`));
    const backEdge = edges.find((e) => e.from === node.id && /back|catalog|browse|shop/i.test(`${e.label || ''}${(e as any).condition || ''}`));
    ctx.variables._buttonMap = {
      [`pc_add_${productId}`]: node.id,
      [`pc_inc_${productId}`]: node.id,
      [`pc_dec_${productId}`]: node.id,
      ...(viewEdge ? { pc_view: viewEdge.to } : { pc_view: node.id }),
      ...(backEdge ? { pc_back: backEdge.to } : {}),
    };
    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id } };
  }

  private async changeQty(qr: any, customerId: string, productId: string, price: number, delta: number): Promise<void> {
    let cart = (await qr.query(`SELECT id FROM carts WHERE customer_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`, [customerId]))[0];
    if (!cart) cart = (await qr.query(`INSERT INTO carts (customer_id, status) VALUES ($1, 'active') RETURNING id`, [customerId]))[0];
    const item = (await qr.query(`SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2`, [cart.id, productId]))[0];
    if (!item) {
      if (delta > 0) await qr.query(`INSERT INTO cart_items (cart_id, product_id, quantity, unit_price) VALUES ($1, $2, 1, $3)`, [cart.id, productId, price]);
      return;
    }
    const next = item.quantity + delta;
    if (next <= 0) await qr.query(`DELETE FROM cart_items WHERE id = $1`, [item.id]);
    else await qr.query(`UPDATE cart_items SET quantity = $1 WHERE id = $2`, [next, item.id]);
  }

  private async text(ctx: ExecutionContext, body: string): Promise<void> {
    await this.messageService.logAndSendText(ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, ctx.conversationId, body);
  }
}
