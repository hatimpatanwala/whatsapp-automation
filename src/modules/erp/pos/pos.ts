import { Injectable, Controller, UseGuards, Get, Post, Body, Query, Req, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { ErpInvoiceService } from '../invoicing/erp-invoice.service';
import { firstRow } from '../common/sql-result.util';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

interface PosItem { productId?: string; description: string; quantity: number; unitPrice: number; }
interface CheckoutInput {
  items: PosItem[];
  customerName?: string;
  customerPhone?: string;
  taxRate?: number;
  discount?: number;
  paymentModeId?: string;
  paid?: boolean; // record a full payment immediately
  currency?: string;
}

/**
 * Point-of-Sale: fast over-the-counter sales. Search/scan a product (by name, SKU
 * or barcode), build a cart, and check out — which creates an ERP invoice and,
 * when `paid`, records a full payment in one step. Reuses ErpInvoiceService so POS
 * sales appear in the same invoices list, dashboard and GST reports.
 */
@Injectable()
export class PosService {
  constructor(private readonly cm: TenantConnectionManager, private readonly invoices: ErpInvoiceService) {}

  /** Search active products by name / SKU / exact barcode (barcode match wins). */
  async searchProducts(schema: string, q: string) {
    const query = (q || '').trim();
    if (!query) return { data: [] };
    const data = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, name, sku, barcode, base_price, sale_price, COALESCE(gst_rate, 0) AS gst_rate
         FROM "${schema}".products
         WHERE is_active = true AND (barcode = $1 OR sku ILIKE $2 OR name ILIKE $2)
         ORDER BY (barcode = $1) DESC, name LIMIT 25`,
        [query, `%${query}%`],
      ));
    return { data };
  }

  async checkout(schema: string, input: CheckoutInput) {
    if (!input.items?.length) throw new BadRequestException('Cart is empty');
    const invoice: any = await this.invoices.create(schema, {
      customerName: input.customerName || undefined,
      customerPhone: input.customerPhone || undefined,
      items: input.items.map((it) => ({ productId: it.productId, description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice) })),
      taxRate: Number(input.taxRate) || 0,
      discount: Number(input.discount) || 0,
      currency: input.currency,
      note: 'POS sale',
    });
    let payment: any = null;
    if (input.paid) {
      const res: any = await this.invoices.recordPayment(schema, invoice.id, { amount: Number(invoice.total), paymentModeId: input.paymentModeId, description: 'POS payment' });
      payment = res.payment;
      return { invoice: res.invoice, payment };
    }
    return { invoice, payment };
  }
}

@Controller('erp/pos')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class PosController {
  constructor(private readonly service: PosService) {}
  @Get('products') @Roles('owner', 'seller')
  search(@Req() req: Request, @Query('q') q: string) { return this.service.searchProducts(req.tenantContext.schemaName, q); }
  @Post('checkout') @Roles('owner', 'seller')
  checkout(@Req() req: Request, @Body() body: CheckoutInput) { return this.service.checkout(req.tenantContext.schemaName, body); }
}
