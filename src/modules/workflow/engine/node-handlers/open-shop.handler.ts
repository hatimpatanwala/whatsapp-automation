import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppApiService } from '../../../whatsapp/whatsapp-api.service';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { BuilderService } from '../../../builder/builder.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

/**
 * Opens the customer-facing SHOP webview: mints a 'shop' session bound to the
 * customer and sends a CTA URL button that opens the storefront (product grid →
 * cart → checkout) inside WhatsApp's in-app browser.
 */
@Injectable()
export class OpenShopNodeHandler implements NodeHandler {
  readonly nodeType = 'open_shop';
  private readonly logger = new Logger(OpenShopNodeHandler.name);

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly builder: BuilderService,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const cfg = node.config || {};
    try {
      // Resolve tenant id + customer id (best-effort) from the context.
      let tenantId = ctx.tenant?.id;
      let customerId = ctx.customerId;
      if (!tenantId || !customerId) {
        await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
          if (!customerId) {
            const c = (await qr.query(`SELECT id FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1`, [ctx.customerPhone, `+${ctx.customerPhone}`]))[0];
            if (c?.id) { customerId = c.id; ctx.customerId = c.id; }
          }
        });
        if (!tenantId) {
          const t = await this.connectionManager.executeGlobal(async (qr) =>
            (await qr.query(`SELECT id FROM tenants WHERE schema_name = $1`, [ctx.schema]))[0]);
          tenantId = t?.id;
        }
      }
      if (!tenantId) throw new Error('No tenant id for shop session');

      const { url: baseUrl } = await this.builder.createShopSession({
        tenantId,
        schemaName: ctx.schema,
        customerId: customerId || null,
        customerPhone: ctx.customerPhone || null,
        customerName: ctx.customerName || null,
      });
      // Deep-link to a specific view (e.g. 'cart') when configured.
      const url = cfg.startView ? `${baseUrl}&view=${encodeURIComponent(cfg.startView)}` : baseUrl;

      const body = resolveTemplate(cfg.message || '🛍️ Tap below to browse our store, build your cart and checkout — all in one place.', ctx);
      const buttonText = (cfg.buttonLabel || '🛒 Open Store').slice(0, 20);
      await this.whatsappApi.sendCtaUrl(ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, body, buttonText, url);
    } catch (err: any) {
      this.logger.error(`open_shop failed: ${err.message}`);
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, ctx.conversationId,
        cfg.errorMessage || 'Sorry, the store could not be opened right now. Please try again shortly.',
      );
    }

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
