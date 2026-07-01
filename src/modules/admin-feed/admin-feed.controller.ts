import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AdminFeedService } from './admin-feed.service';

/** Portal notification feed for the admin (bell). */
@Controller('notifications')
@UseGuards(TenantGuard)
export class AdminFeedController {
  constructor(private readonly feed: AdminFeedService) {}

  @Get()
  list(@Req() req: Request) {
    return this.feed.list(req.tenantContext.schemaName);
  }

  @Post('read')
  @HttpCode(200)
  read(@Req() req: Request, @Body() body: { id?: string }) {
    return this.feed.markRead(req.tenantContext.schemaName, body?.id);
  }
}
