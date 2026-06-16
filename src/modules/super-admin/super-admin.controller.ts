import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SuperAdminService } from './super-admin.service';
import { TemplateProvisioningService, CreateTemplateInput } from '../onboarding/template-provisioning.service';
import { QuoteService } from '../quote/quote.service';
import { Public } from '../../common/decorators/public.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';

@Controller('admin')
@UseGuards(SuperAdminGuard)
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly templateProvisioningService: TemplateProvisioningService,
    private readonly quoteService: QuoteService,
  ) {}

  @Post('auth/login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }, @Req() req: Request) {
    const admin = await this.superAdminService.login(body.email, body.password);
    (req.session as any).adminId = admin.id;
    (req.session as any).adminRole = admin.role;
    (req.session as any).isAdmin = true;
    return { admin };
  }

  @Get('auth/me')
  async me(@Req() req: Request) {
    const session = req.session as any;
    if (!session?.isAdmin || !session?.adminId) {
      return { admin: null };
    }
    const admin = await this.superAdminService.findById(session.adminId);
    return { admin };
  }

  @Get('stats')
  async getStats() {
    return this.superAdminService.getPlatformStats();
  }

  @Get('tenants/:id/usage')
  async getTenantUsage(@Param('id') id: string) {
    return this.superAdminService.getTenantUsage(id);
  }

  @Put('subscriptions/:id')
  async updateSubscription(@Param('id') id: string, @Body() body: any) {
    return this.superAdminService.updateSubscription(id, body);
  }

  /**
   * Provision all WhatsApp message templates on the platform WABA.
   * Creates authentication, utility, and marketing templates via Meta Graph API.
   */
  @Post('templates/provision')
  @HttpCode(HttpStatus.OK)
  async provisionTemplates() {
    return this.templateProvisioningService.provisionAll();
  }

  /** List all WhatsApp message templates with their Meta approval status. */
  @Get('templates')
  async listTemplates() {
    return this.templateProvisioningService.listTemplates();
  }

  /** Create a new custom message template (submitted to Meta for approval). */
  @Post('templates')
  @HttpCode(HttpStatus.OK)
  async createTemplate(@Body() dto: CreateTemplateInput) {
    return this.templateProvisioningService.createCustomTemplate(dto);
  }

  /** Delete a message template by name. */
  @Delete('templates/:name')
  async deleteTemplate(@Param('name') name: string) {
    return this.templateProvisioningService.deleteTemplate(name);
  }

  // ─── Quote Management (Admin) ─────────────────────────────────────

  @Get('tenants/:id/quotes')
  async getTenantQuotes(
    @Param('id') tenantId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const schema = await this.superAdminService.getTenantSchema(tenantId);
    return this.quoteService.findAll(schema, {
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('tenants/:id/quotes/stats')
  async getTenantQuoteStats(@Param('id') tenantId: string) {
    const schema = await this.superAdminService.getTenantSchema(tenantId);
    return this.quoteService.getStats(schema);
  }

  @Get('tenants/:id/quotes/:quoteId')
  async getTenantQuote(@Param('id') tenantId: string, @Param('quoteId') quoteId: string) {
    const schema = await this.superAdminService.getTenantSchema(tenantId);
    return this.quoteService.findById(schema, quoteId);
  }
}
