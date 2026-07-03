import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { EntryContextService } from './entry-context.service';

/**
 * Billing-intelligence API for the keyboard entry screens (Tally/Miracle-style).
 * Tenant-scoped via the login session. Not plan-gated: read-only helper data that
 * the entry grids fire on every party/item selection.
 */
@Controller('entry')
export class EntryContextController {
  constructor(private readonly ctx: EntryContextService) {}

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  @Get('customers')
  customers(@Req() req: Request, @Query('q') q = '') {
    return this.ctx.searchCustomers(this.schema(req), q);
  }

  @Get('products')
  products(@Req() req: Request, @Query('q') q = '') {
    return this.ctx.searchProducts(this.schema(req), q);
  }

  @Get('customer/:id/context')
  customerContext(@Req() req: Request, @Param('id') id: string) {
    return this.ctx.customerContext(this.schema(req), id);
  }

  @Get('product/:id/context')
  itemContext(@Req() req: Request, @Param('id') id: string, @Query('customerId') customerId?: string) {
    return this.ctx.itemContext(this.schema(req), id, customerId || undefined);
  }

  @Get('suppliers')
  suppliers(@Req() req: Request, @Query('q') q = '') {
    return this.ctx.searchSuppliers(this.schema(req), q);
  }

  @Get('supplier/:id/context')
  supplierContext(@Req() req: Request, @Param('id') id: string) {
    return this.ctx.supplierContext(this.schema(req), id);
  }

  @Get('product/:id/purchase-context')
  itemPurchaseContext(@Req() req: Request, @Param('id') id: string, @Query('supplierId') supplierId?: string) {
    return this.ctx.itemPurchaseContext(this.schema(req), id, supplierId || undefined);
  }

  /** Party-specific rate history (Miracle "last rates to this party" list). */
  @Get('product/:id/rate-history')
  rateHistory(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('customerId') customerId?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.ctx.rateHistory(this.schema(req), id, customerId || undefined, supplierId || undefined);
  }

  @Get('customer/:id/addresses')
  customerAddresses(@Req() req: Request, @Param('id') id: string) {
    return this.ctx.customerAddresses(this.schema(req), id);
  }

  @Get('customer/:id/open-bills')
  openBills(@Req() req: Request, @Param('id') id: string) {
    return this.ctx.openBills(this.schema(req), id);
  }

  @Get('supplier/:id/open-bills')
  openPurchaseBills(@Req() req: Request, @Param('id') id: string) {
    return this.ctx.openPurchaseBills(this.schema(req), id);
  }

  @Get('stock-summary')
  stockSummary(@Req() req: Request) {
    return this.ctx.stockSummary(this.schema(req));
  }

  /** Item master browser (Miracle Add Item): all master fields + live stock. */
  @Get('items')
  items(@Req() req: Request, @Query('q') q = '') {
    return this.ctx.listItems(this.schema(req), q);
  }

  /** Add Stock from the item master — delta on the base inventory row. */
  @Post('items/:id/add-stock')
  addStock(@Req() req: Request, @Param('id') id: string, @Body() body: { qty: number }) {
    return this.ctx.addStock(this.schema(req), id, Number(body?.qty) || 0);
  }
}
