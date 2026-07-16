import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { ErpFeatureGuard } from '../../common/guards/erp-feature.guard';
import { BaileysSessionService } from './baileys-session.service';
import { WhatsappConnectService } from './whatsapp-connect.service';

/**
 * WhatsApp Smart Connect (Vyapar-style) — link a personal WhatsApp by QR and send
 * invoices/receipts through it. Gated by the `whatsappSuite` plan flag.
 */
@Controller('whatsapp/smart-connect')
@Roles('owner', 'seller')
@UseGuards(ErpFeatureGuard)
@RequiresFeature('whatsappSuite')
export class WhatsappConnectController {
  constructor(
    private readonly baileys: BaileysSessionService,
    private readonly connect: WhatsappConnectService,
  ) {}

  private tenantId(req: Request): string {
    const id = (req as any).tenantContext?.id || (req as any).session?.tenantId;
    if (!id) throw new UnauthorizedException('No tenant context');
    return id;
  }
  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  /** Begin linking; poll status for the QR. */
  @Post('start')
  start(@Req() req: Request) {
    return this.baileys.start(this.tenantId(req));
  }

  /** Poll connection status + QR data-url. */
  @Get('status')
  status(@Req() req: Request) {
    return this.baileys.status(this.tenantId(req));
  }

  /** Unlink and wipe stored credentials. */
  @Post('disconnect')
  disconnect(@Req() req: Request) {
    return this.baileys.disconnect(this.tenantId(req));
  }

  /** Which WhatsApp channels this tenant can use (official / wa.me / smart-connect). */
  @Get('channels')
  channels(@Req() req: Request) {
    return this.connect.channels(this.tenantId(req));
  }

  /**
   * SAFE-FIRST invoice send. Sends via the official WhatsApp Business API when the
   * tenant has it connected (zero ban risk); otherwise returns a wa.me link the UI
   * opens. Never uses the unofficial channel here.
   */
  @Post('send-invoice')
  sendInvoice(@Req() req: Request, @Body() body: { invoiceId: string; phone?: string }) {
    return this.connect.sendInvoiceSafe(this.schema(req), this.tenantId(req), body.invoiceId, body.phone);
  }

  /** SAFE-FIRST receipt send (official → wa.me). */
  @Post('send-receipt')
  sendReceipt(@Req() req: Request, @Body() body: { paymentId: string; phone?: string }) {
    return this.connect.sendReceiptSafe(this.schema(req), this.tenantId(req), body.paymentId, body.phone);
  }

  /** Explicit UNOFFICIAL send through the linked personal number (ban risk, opt-in). */
  @Post('send-invoice/smart-connect')
  sendInvoiceUnofficial(@Req() req: Request, @Body() body: { invoiceId: string; phone?: string }) {
    return this.connect.sendInvoiceViaSmartConnect(this.schema(req), this.tenantId(req), body.invoiceId, body.phone);
  }

  @Post('send-receipt/smart-connect')
  sendReceiptUnofficial(@Req() req: Request, @Body() body: { paymentId: string; phone?: string }) {
    return this.connect.sendReceiptViaSmartConnect(this.schema(req), this.tenantId(req), body.paymentId, body.phone);
  }

  /** Send a free-text WhatsApp message (also handy for a "test connection" ping). */
  @Post('send-text')
  async sendText(@Req() req: Request, @Body() body: { phone: string; text: string }) {
    await this.baileys.sendText(this.tenantId(req), body.phone, body.text);
    return { sent: true };
  }
}
