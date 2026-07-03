import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AccountingService } from './accounting.service';
import { CreateLedgerDto, CreateVoucherDto } from './dto/accounting.dto';

/**
 * Double-entry accounting API (Phase 4). Tenant-scoped via the login session
 * (TenantResolutionMiddleware → req.tenantContext). Routes live under /api/accounting.
 */
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  // masters
  @Get('groups')
  groups(@Req() req: Request) {
    return this.accounting.listGroups(this.schema(req));
  }

  @Get('ledgers')
  ledgers(@Req() req: Request) {
    return this.accounting.listLedgers(this.schema(req));
  }

  @Post('ledgers')
  createLedger(@Req() req: Request, @Body() dto: CreateLedgerDto) {
    return this.accounting.createLedger(this.schema(req), dto);
  }

  // vouchers
  @Get('vouchers')
  vouchers(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accounting.listVouchers(this.schema(req), {
      type,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('vouchers')
  createVoucher(@Req() req: Request, @Body() dto: CreateVoucherDto) {
    return this.accounting.createVoucher(this.schema(req), dto);
  }

  @Get('vouchers/:id')
  voucher(@Req() req: Request, @Param('id') id: string) {
    return this.accounting.getVoucher(this.schema(req), id);
  }

  @Post('vouchers/:id/cancel')
  cancelVoucher(@Req() req: Request, @Param('id') id: string) {
    return this.accounting.cancelVoucher(this.schema(req), id);
  }

  // reports
  @Get('reports/trial-balance')
  trialBalance(@Req() req: Request, @Query('asOf') asOf?: string) {
    return this.accounting.trialBalance(this.schema(req), asOf);
  }

  @Get('reports/pnl')
  pnl(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.profitAndLoss(this.schema(req), from, to);
  }

  @Get('reports/balance-sheet')
  balanceSheet(@Req() req: Request, @Query('asOf') asOf?: string) {
    return this.accounting.balanceSheet(this.schema(req), asOf);
  }

  @Get('reports/day-book')
  dayBook(@Req() req: Request, @Query('date') date?: string) {
    return this.accounting.dayBook(this.schema(req), date);
  }

  @Get('reports/ageing')
  ageing(@Req() req: Request) {
    return this.accounting.ageing(this.schema(req));
  }

  @Get('reports/ledger/:id')
  ledgerStatement(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.ledgerStatement(this.schema(req), id, from, to);
  }
}
