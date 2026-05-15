import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { TemplateService, CreateTemplateInput } from './template.service';

@Controller('admin/waba/templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  async listTemplates(
    @Query('wabaAccountId') wabaAccountId?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.templateService.findAll(wabaAccountId, tenantId);
  }

  @Get(':id')
  async getTemplate(@Param('id') id: string) {
    return this.templateService.findById(id);
  }

  @Post()
  async createTemplate(@Body() body: CreateTemplateInput) {
    return this.templateService.createAndSubmit(body);
  }

  @Post('sync/:wabaAccountId')
  async syncTemplates(@Param('wabaAccountId') wabaAccountId: string) {
    return this.templateService.syncFromMeta(wabaAccountId);
  }

  @Delete(':id')
  async deleteTemplate(@Param('id') id: string) {
    await this.templateService.delete(id);
    return { message: 'Template deleted successfully' };
  }

  @Post('webhook/status')
  async handleStatusWebhook(@Body() body: { template_id: string; event: string; reason?: string }) {
    await this.templateService.handleStatusUpdate(body.template_id, body.event, body.reason);
    return { received: true };
  }
}
