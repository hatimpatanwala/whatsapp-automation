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
    } else if (source === 'brands') {
      sections = await this.buildBrandSections(ctx.schema);
    } else if (source === 'products') {
      sections = await this.buildProductSections(ctx.schema);
    } else if (source === 'menu_workflows') {
      sections = await this.buildMenuWorkflowSections(ctx.schema);
    } else {
      // Custom items — accept `sections` (array of { title, rows }) OR a flat
      // `items`/`rows` array of { id, title, description } from the builder.
      const cfgSections = node.config.sections;
      const cfgItems = node.config.items || node.config.rows;
      if (Array.isArray(cfgSections) && cfgSections.length) {
        sections = cfgSections;
      } else if (Array.isArray(cfgItems) && cfgItems.length) {
        sections = [{
          title: node.config.sectionTitle || 'Options',
          rows: cfgItems.slice(0, 10).map((it: any, i: number) => {
            const title = String(typeof it === 'string' ? it : (it?.title ?? it?.label ?? `Option ${i + 1}`)).substring(0, 24);
            const desc = typeof it === 'object' && it?.description ? String(it.description).substring(0, 72) : undefined;
            return { id: (typeof it === 'object' && it?.id) ? it.id : `wf_list_${i}`, title, ...(desc ? { description: desc } : {}) };
          }),
        }];
      } else {
        sections = [{ title: 'Options', rows: [{ id: 'wf_list_0', title: 'Option 1' }] }];
      }
    }

    await this.messageService.logAndSendInteractiveList(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, body, buttonText, sections,
    );

    // Pause for customer selection
    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id, source } };
  }

  /** Dynamic menu: one row per ACTIVE workflow that registered a menu_item. */
  private async buildMenuWorkflowSections(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const wfs = await qr.query(
        `SELECT id, name, menu_item FROM workflows
          WHERE status = 'active' AND menu_item IS NOT NULL
          ORDER BY COALESCE((menu_item->>'order')::int, 999), name
          LIMIT 10`,
      );
      const rows = wfs.map((w: any) => {
        const mi = typeof w.menu_item === 'string' ? JSON.parse(w.menu_item) : (w.menu_item || {});
        return { id: `wf_menu_${w.id}`, title: String(mi.label || w.name).substring(0, 24) };
      });
      return [{ title: 'Menu', rows: rows.length ? rows : [{ id: 'wf_menu_none', title: 'No options yet' }] }];
    });
  }

  private async buildBrandSections(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const brands = await qr.query(
        `SELECT id, name FROM brands WHERE is_active = true ORDER BY sort_order, name LIMIT 10`,
      );
      return [{
        title: 'Brands',
        rows: brands.length
          ? brands.map((b: any) => ({ id: `wf_brand_${b.id}`, title: b.name.substring(0, 24) }))
          : [{ id: 'wf_brand_none', title: 'No brands yet' }],
      }];
    });
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
