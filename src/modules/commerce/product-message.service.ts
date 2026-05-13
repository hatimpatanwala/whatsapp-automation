import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { TenantCatalog } from '../../database/entities/public/tenant-catalog.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';

/**
 * Builds and sends WhatsApp product messages and multi-product messages.
 *
 * Message types:
 * - Single product message: Shows one product with image, price, and CTA
 * - Multi-product message: Shows up to 30 products grouped in sections
 * - Catalog message: Opens the full WhatsApp catalog for the phone number
 *
 * These messages use the Meta Cloud API's interactive message types.
 * The catalog must be linked to the phone number for product messages to work.
 */
@Injectable()
export class ProductMessageService {
  private readonly logger = new Logger(ProductMessageService.name);
  private readonly apiUrl: string;
  private readonly apiVersion: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly connectionManager: TenantConnectionManager,
    @InjectRepository(TenantCatalog)
    private readonly catalogRepo: Repository<TenantCatalog>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com');
    this.apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION', 'v21.0');
  }

  /**
   * Send a single product message.
   * Uses interactive type "product" which shows one product from the linked catalog.
   */
  async sendProductMessage(
    tenantId: string, schema: string,
    to: string, productId: string,
    bodyText?: string, footerText?: string,
  ): Promise<any> {
    const { catalog, accessToken, phoneNumberId } = await this.resolveContext(tenantId);

    // Get product retailer_id (slug) from tenant schema
    const product = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(`SELECT slug, name FROM products WHERE id = $1`, [productId]);
      return rows[0];
    });
    if (!product) throw new NotFoundException('Product not found');

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'product',
        body: { text: bodyText || `Check out ${product.name}` },
        action: {
          catalog_id: catalog.metaCatalogId,
          product_retailer_id: product.slug,
        },
      },
    };

    if (footerText) {
      payload.interactive.footer = { text: footerText };
    }

    return this.sendMessage(phoneNumberId, accessToken, payload);
  }

  /**
   * Send a multi-product message.
   * Uses interactive type "product_list" which shows multiple products in sections.
   * Maximum 30 products, organized in up to 10 sections.
   */
  async sendMultiProductMessage(
    tenantId: string, schema: string,
    to: string, productIds: string[],
    headerText?: string, bodyText?: string, footerText?: string,
  ): Promise<any> {
    const { catalog, accessToken, phoneNumberId } = await this.resolveContext(tenantId);

    if (productIds.length > 30) {
      throw new Error('Multi-product messages support a maximum of 30 products');
    }

    // Get product slugs from tenant schema
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',');
    const products = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT id, slug, name, category_id, c.name as category_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.id IN (${placeholders}) AND p.is_active = true`,
        productIds,
      );
    });

    if (!products.length) throw new NotFoundException('No active products found');

    // Group products by category for sections
    const sections = this.groupProductsIntoSections(products, catalog.metaCatalogId);

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'product_list',
        header: { type: 'text', text: headerText || 'Our Products' },
        body: { text: bodyText || 'Browse our selection' },
        action: {
          catalog_id: catalog.metaCatalogId,
          sections,
        },
      },
    };

    if (footerText) {
      payload.interactive.footer = { text: footerText };
    }

    return this.sendMessage(phoneNumberId, accessToken, payload);
  }

  /**
   * Send a catalog message (opens full catalog on WhatsApp).
   */
  async sendCatalogMessage(tenantId: string, to: string, bodyText?: string, footerText?: string): Promise<any> {
    const { catalog, accessToken, phoneNumberId } = await this.resolveContext(tenantId);

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'catalog_message',
        body: { text: bodyText || 'Browse our catalog' },
        action: { name: 'catalog_message' },
      },
    };

    if (footerText) {
      payload.interactive.footer = { text: footerText };
    }

    return this.sendMessage(phoneNumberId, accessToken, payload);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private groupProductsIntoSections(products: any[], catalogId: string): any[] {
    const grouped = new Map<string, any[]>();

    for (const p of products) {
      const category = p.category_name || 'Products';
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category)!.push(p);
    }

    return Array.from(grouped.entries()).slice(0, 10).map(([title, items]) => ({
      title: title.slice(0, 24), // Meta limit: 24 chars for section title
      product_items: items.map((p: any) => ({
        product_retailer_id: p.slug,
      })),
    }));
  }

  private async resolveContext(tenantId: string): Promise<{ catalog: TenantCatalog; accessToken: string; phoneNumberId: string }> {
    const catalog = await this.catalogRepo.findOne({ where: { tenantId, status: 'active' } });
    if (!catalog) throw new NotFoundException('No active catalog. Provision a catalog first.');
    if (!catalog.isLinkedToPhone) throw new NotFoundException('Catalog not linked to phone number');

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const accessToken = tenant.accessToken || this.configService.get<string>('META_SYSTEM_USER_TOKEN', '');
    if (!accessToken) throw new NotFoundException('No access token available');

    const phoneNumberId = catalog.phoneNumberId || tenant.phoneNumberId;
    if (!phoneNumberId) throw new NotFoundException('No phone number linked');

    return { catalog, accessToken, phoneNumberId };
  }

  private async sendMessage(phoneNumberId: string, accessToken: string, payload: any): Promise<any> {
    const url = `${this.apiUrl}/${this.apiVersion}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as any;
    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${data?.error?.message || response.statusText}`);
    }
    return data;
  }
}
