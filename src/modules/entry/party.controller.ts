import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PartyGroup, PartyInput, PartyService } from './party.service';

/** Party Master API (PARTY_MASTER_README.md §3): one API for both roles. */
@Controller('entry/party')
export class PartyController {
  constructor(private readonly parties: PartyService) {}

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  @Get()
  list(@Req() req: Request, @Query('q') q = '', @Query('group') group?: PartyGroup) {
    return this.parties.list(this.schema(req), q, group === 'debtor' || group === 'creditor' ? group : undefined);
  }

  /** Duplicate-GSTIN warning (spec: warn, never block). */
  @Get('check-gstin')
  checkGstin(@Req() req: Request, @Query('gstin') gstin = '', @Query('exclude') exclude?: string) {
    return this.parties.gstinExists(this.schema(req), gstin, exclude);
  }

  @Get(':group/:id')
  get(@Req() req: Request, @Param('group') group: PartyGroup, @Param('id') id: string) {
    return this.parties.get(this.schema(req), group, id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: PartyInput) {
    return this.parties.create(this.schema(req), body);
  }

  @Patch(':group/:id')
  update(@Req() req: Request, @Param('group') group: PartyGroup, @Param('id') id: string, @Body() body: PartyInput) {
    return this.parties.update(this.schema(req), group, id, body);
  }

  @Delete(':group/:id')
  softDelete(@Req() req: Request, @Param('group') group: PartyGroup, @Param('id') id: string) {
    return this.parties.softDelete(this.schema(req), group, id);
  }

  /** Shipping addresses — debtors only (1 → many). */
  @Post('debtor/:id/addresses')
  addAddress(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.parties.addAddress(this.schema(req), id, body);
  }

  @Delete('debtor/:id/addresses/:addressId')
  removeAddress(@Req() req: Request, @Param('id') id: string, @Param('addressId') addressId: string) {
    return this.parties.removeAddress(this.schema(req), id, addressId);
  }
}
