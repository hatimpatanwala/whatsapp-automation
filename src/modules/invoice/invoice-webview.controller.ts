import { Controller, Get, Post, Body, Query, Headers, BadRequestException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { BuilderService } from '../builder/builder.service';
import { OrderService } from '../order/order.service';
import { InvoiceService, DocType } from '../whatsapp/invoice.service';

/**
 * Token-authenticated WhatsApp webview (/m/invoice-builder) — lets an admin
 * bill a customer from inside WhatsApp: build an order, set its status, and
 * issue + send the invoice. Auth is purely the 'invoice' builder session token
 * (X-Builder-Token header or ?token=); no login required.
 */
@Controller('m/invoice')
export class InvoiceWebviewController {
  constructor(
    private readonly conn: TenantConnectionManager,
    private readonly builder: BuilderService,
    private readonly orders: OrderService,
    private readonly invoices: InvoiceService,
  ) {}

  private token(token?: string, header?: string): string {
    const t = token || header;
    if (!t) throw new BadRequestException('Missing link token.');
    return t;
  }

  /** Store info + customers + products for the picker, plus the prefilled customer. */
  @Public()
  @Get('bootstrap')
  async bootstrap(@Query('token') token?: string, @Headers('x-builder-token') header?: string) {
    const s = await this.builder.getInvoiceSession(this.token(token, header));
    const settings = await this.invoiceSettings(s.schema_name);
    const [tenant, lists] = await Promise.all([
      this.conn.executeGlobal(async (qr) =>
        (await qr.query(`SELECT business_name, name FROM tenants WHERE id = $1`, [s.tenant_id]))[0]),
      this.conn.executeInTenantContext(s.schema_name, async (qr) => {
        const [customers, products] = await Promise.all([
          qr.query(`SELECT id, name, phone FROM customers ORDER BY (last_order_at IS NULL), last_order_at DESC NULLS LAST, name ASC LIMIT 500`),
          qr.query(`SELECT id, name, COALESCE(sale_price, base_price) AS price FROM products WHERE is_active = true ORDER BY name LIMIT 500`),
        ]);
        return { customers, products };
      }),
    ]);
    return {
      store: { name: tenant?.business_name || tenant?.name || 'Store', legalName: settings.legalName, hasGstin: !!settings.gstin, defaultDocType: settings.defaultDocType },
      customer: s.customer_id ? { id: s.customer_id, name: s.customer_name, phone: s.customer_phone } : null,
      customers: (lists.customers || []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })),
      products: (lists.products || []).map((p: any) => ({ id: p.id, name: p.name, price: Number(p.price) || 0 })),
    };
  }

  /** Build the order, set its status, then issue (and optionally send) the invoice. */
  @Public()
  @Post('create')
  async create(
    @Body() body: {
      customerId: string;
      items: { productId?: string; productName?: string; quantity: number; unitPrice: number }[];
      discount?: number; deliveryFee?: number; notes?: string;
      status?: string; docType?: DocType; send?: boolean;
    },
    @Query('token') token?: string, @Headers('x-builder-token') header?: string,
  ) {
    const s = await this.builder.getInvoiceSession(this.token(token, header));
    if (!body?.customerId) throw new BadRequestException('Pick a customer.');
    if (!body?.items?.length) throw new BadRequestException('Add at least one item.');

    const order = await this.orders.createDirect(s.schema_name, {
      customerId: body.customerId, items: body.items,
      discount: body.discount, deliveryFee: body.deliveryFee, notes: body.notes,
    });
    if (body.status && body.status !== 'pending') {
      await this.orders.updateStatus(s.schema_name, order.id, body.status).catch(() => undefined);
    }

    const docType: DocType = body.docType || 'tax_invoice';
    let invoiceNumber: string | undefined;
    let sent = false;
    let reason: string | undefined;
    if (body.send === false) {
      const inv = await this.invoices.createInvoiceForOrder(s.schema_name, order.id, docType);
      invoiceNumber = inv?.invoice_number;
    } else {
      const res = await this.invoices.generateAndSend({ id: s.tenant_id, schemaName: s.schema_name }, order.id, docType, {});
      invoiceNumber = res?.invoiceNumber;
      sent = !!res?.ok;
      reason = res?.ok ? undefined : res?.reason;
    }
    return { orderNumber: order.order_number, status: body.status || 'pending', invoiceNumber: invoiceNumber || null, sent, reason };
  }

  private async invoiceSettings(schema: string): Promise<{ legalName: string; gstin: string; defaultDocType: string }> {
    try {
      const rows = await this.conn.executeInTenantContext(schema, async (qr) =>
        qr.query(`SELECT key, value FROM "${schema}".settings WHERE key IN ('invoice_legal_name','invoice_gstin','invoice_default_doc_type')`));
      const m: Record<string, any> = {};
      for (const r of rows) { let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep */ } } m[r.key] = v; }
      return { legalName: m['invoice_legal_name'] || '', gstin: m['invoice_gstin'] || '', defaultDocType: m['invoice_default_doc_type'] || 'tax_invoice' };
    } catch {
      return { legalName: '', gstin: '', defaultDocType: 'tax_invoice' };
    }
  }
}
