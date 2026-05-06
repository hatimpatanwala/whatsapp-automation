import { Controller, Get, Post, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CampaignService } from './campaign.service';
import { SegmentService } from './segment.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('campaigns')
@UseGuards(TenantGuard)
export class CampaignController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly segmentService: SegmentService,
  ) {}

  @Get()
  @Roles('owner', 'seller')
  async findAll(@Req() req: Request) {
    return this.campaignService.findAll(req.tenantContext.schemaName);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() body: { name: string; templateId?: string; segmentId?: string; scheduledAt?: string }) {
    return this.campaignService.create(req.tenantContext.schemaName, body);
  }

  @Post(':id/send')
  @Roles('owner', 'seller')
  async send(@Req() req: Request, @Param('id') id: string) {
    await this.campaignService.sendCampaign(req.tenantContext.schemaName, id, req.tenantContext);
    return { message: 'Campaign sending initiated' };
  }

  @Get('segments')
  @Roles('owner', 'seller')
  async getSegments(@Req() req: Request) {
    return this.segmentService.findAll(req.tenantContext.schemaName);
  }

  @Post('segments')
  @Roles('owner', 'seller')
  async createSegment(@Req() req: Request, @Body() body: { name: string; rules: any }) {
    return this.segmentService.create(req.tenantContext.schemaName, body);
  }
}
