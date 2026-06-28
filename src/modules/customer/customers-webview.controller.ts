import { Controller, Get, Req, Query } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { BuilderService } from '../builder/builder.service';
import { CustomerService } from './customer.service';

/**
 * Public, TOKEN-authenticated customer-insights webview (/m/customers) — the page
 * the admin opens from WhatsApp to browse customers by segment (top spenders,
 * pending cart, high/low orders, …) with each customer's last activity + cart.
 * The X-Builder-Token header (or ?token=) carries a 'customers' session.
 */
@Controller('m/customers')
@Public()
export class CustomersWebviewController {
  constructor(
    private readonly builder: BuilderService,
    private readonly customers: CustomerService,
  ) {}

  private token(req: Request, q?: string): string {
    return (req.headers['x-builder-token'] as string) || q || '';
  }

  private async schema(req: Request, token?: string): Promise<string> {
    const { schemaName } = await this.builder.getCustomersSchema(this.token(req, token));
    return schemaName;
  }

  @Get('bootstrap')
  async bootstrap(@Req() req: Request, @Query('token') token?: string) {
    const schema = await this.schema(req, token);
    const [counts, list] = await Promise.all([
      this.customers.segmentSummary(schema),
      this.customers.segmentList(schema, '', 1, 50),
    ]);
    return { counts, customers: list.data, total: list.total };
  }

  @Get('list')
  async list(
    @Req() req: Request,
    @Query('token') token?: string,
    @Query('segment') segment?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    const schema = await this.schema(req, token);
    return this.customers.segmentList(schema, segment || '', Number(page) || 1, 50, search);
  }
}
