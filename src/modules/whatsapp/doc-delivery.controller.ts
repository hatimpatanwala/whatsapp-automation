import { BadRequestException, Controller, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { BuilderService } from '../builder/builder.service';
import { DocDeliveryService } from './doc-delivery.service';

/**
 * "Send this PDF to my WhatsApp" endpoints. The WhatsApp in-app browser can't
 * download files, so instead of a browser download these deliver the document to
 * the admin's chat. Two auth paths:
 *   - console/* : the ERP console (`/m/erp`) — authed by its `erp` session token;
 *                 recipient is the admin who opened the console (session.created_by).
 *   - portal/*  : the full web portal opened inside WhatsApp — authed by the web
 *                 session; recipient is the admin phone carried in on portal-login.
 * The desktop portal never calls these — it downloads inline.
 */
@Controller('m/doc-delivery')
export class DocDeliveryController {
  constructor(
    private readonly builder: BuilderService,
    private readonly delivery: DocDeliveryService,
  ) {}

  private token(req: Request, q?: string): string {
    return (req.headers['x-builder-token'] as string) || q || '';
  }

  // ── Console (erp token) ─────────────────────────────────────────────────────
  @Post('console/eway/:id')
  async consoleEway(@Req() req: Request, @Param('id') id: string, @Query('token') token?: string) {
    const { schemaName, tenantId, createdBy } = await this.builder.getErpSessionMeta(this.token(req, token));
    return this.delivery.sendEway(tenantId, schemaName, this.requirePhone(createdBy), id);
  }

  @Post('console/invoice/:id')
  async consoleInvoice(@Req() req: Request, @Param('id') id: string, @Query('token') token?: string) {
    const { schemaName, tenantId, createdBy } = await this.builder.getErpSessionMeta(this.token(req, token));
    return this.delivery.sendInvoice(tenantId, schemaName, this.requirePhone(createdBy), id);
  }

  // ── Portal (web session) ────────────────────────────────────────────────────
  @Post('portal/eway/:id')
  @UseGuards(TenantGuard)
  async portalEway(@Req() req: Request, @Param('id') id: string) {
    const { id: tenantId, schemaName } = req.tenantContext!;
    return this.delivery.sendEway(tenantId, schemaName, this.requirePhone(req.session.adminPhone), id);
  }

  @Post('portal/invoice/:id')
  @UseGuards(TenantGuard)
  async portalInvoice(@Req() req: Request, @Param('id') id: string) {
    const { id: tenantId, schemaName } = req.tenantContext!;
    return this.delivery.sendInvoice(tenantId, schemaName, this.requirePhone(req.session.adminPhone), id);
  }

  private requirePhone(phone?: string | null): string {
    if (!phone) throw new BadRequestException('No WhatsApp number on file. Open this from your WhatsApp chat to receive the PDF there.');
    return phone;
  }
}
