import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Body, Query, Req, UseGuards, HttpCode, NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { WorkflowService, CreateWorkflowDto, UpdateWorkflowDto, SaveDefinitionDto } from './workflow.service';
import { getWorkflowTemplates } from '../onboarding/business-categories';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('workflows')
@UseGuards(TenantGuard, SubscriptionGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  @Roles('owner', 'seller')
  async findAll(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.workflowService.findAll(req.tenantContext.schemaName, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      search,
    });
  }

  // Ready-made workflow templates (same set used in onboarding personalization).
  // Declared before :id so the literal path matches first.
  @Get('templates')
  @Roles('owner', 'seller')
  async getTemplates(@Query('category') category?: string) {
    const templates = getWorkflowTemplates(category || 'retail', 'your store');
    return Object.values(templates).map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      nodeCount: Array.isArray(t.nodes) ? t.nodes.length : 0,
      trigger: t.trigger,
      nodes: t.nodes,
      edges: t.edges,
    }));
  }

  @Get(':id')
  @Roles('owner', 'seller')
  async findById(@Req() req: Request, @Param('id') id: string) {
    const workflow = await this.workflowService.findById(req.tenantContext.schemaName, id);
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() body: CreateWorkflowDto) {
    return this.workflowService.create(
      req.tenantContext.schemaName,
      body,
      (req as any).session?.userId,
    );
  }

  @Patch(':id')
  @Roles('owner', 'seller')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateWorkflowDto) {
    const result = await this.workflowService.update(req.tenantContext.schemaName, id, body);
    if (!result) throw new NotFoundException('Workflow not found');
    return result;
  }

  @Put(':id/definition')
  @Roles('owner', 'seller')
  async saveDefinition(@Req() req: Request, @Param('id') id: string, @Body() body: SaveDefinitionDto) {
    const result = await this.workflowService.saveDefinition(req.tenantContext.schemaName, id, body);
    if (!result) throw new NotFoundException('Workflow not found');
    return result;
  }

  @Delete(':id')
  @Roles('owner')
  @HttpCode(204)
  async delete(@Req() req: Request, @Param('id') id: string) {
    await this.workflowService.delete(req.tenantContext.schemaName, id);
  }

  @Post(':id/activate')
  @Roles('owner', 'seller')
  async activate(@Req() req: Request, @Param('id') id: string) {
    const result = await this.workflowService.activate(req.tenantContext.schemaName, id);
    if (!result) throw new NotFoundException('Workflow not found');
    return result;
  }

  @Post(':id/pause')
  @Roles('owner', 'seller')
  async pause(@Req() req: Request, @Param('id') id: string) {
    const result = await this.workflowService.pause(req.tenantContext.schemaName, id);
    if (!result) throw new NotFoundException('Workflow not found');
    return result;
  }

  @Post(':id/preview')
  @Roles('owner', 'seller')
  async setPreview(@Req() req: Request, @Param('id') id: string) {
    const result = await this.workflowService.setPreview(req.tenantContext.schemaName, id);
    if (!result) throw new NotFoundException('Workflow not found');
    return result;
  }

  @Post(':id/archive')
  @Roles('owner')
  async archive(@Req() req: Request, @Param('id') id: string) {
    const result = await this.workflowService.archive(req.tenantContext.schemaName, id);
    if (!result) throw new NotFoundException('Workflow not found');
    return result;
  }

  @Post(':id/duplicate')
  @Roles('owner', 'seller')
  async duplicate(@Req() req: Request, @Param('id') id: string) {
    const result = await this.workflowService.duplicate(
      req.tenantContext.schemaName,
      id,
      (req as any).session?.userId,
    );
    if (!result) throw new NotFoundException('Workflow not found');
    return result;
  }

  @Post(':id/test')
  @Roles('owner', 'seller')
  async testRun(@Req() req: Request, @Param('id') id: string, @Body() body?: Record<string, any>) {
    return this.workflowService.testRun(req.tenantContext.schemaName, id, body);
  }

  @Get(':id/executions')
  @Roles('owner', 'seller')
  async getExecutionLogs(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.workflowService.getExecutionLogs(req.tenantContext.schemaName, id, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
