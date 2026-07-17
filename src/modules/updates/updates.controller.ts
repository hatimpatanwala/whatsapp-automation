import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { UpdatesService } from './updates.service';

/**
 * "My Updates" customer webview API (token-authenticated, no login). The SPA route
 * /m/updates?token=... calls these. Served under the global /api prefix.
 */
@Controller('m/updates')
@Public()
export class UpdatesController {
  constructor(private readonly updates: UpdatesService) {}

  private token(req: Request, q?: string): string {
    return (req.headers['x-builder-token'] as string) || q || '';
  }

  @Get('list')
  list(@Req() req: Request, @Query('token') token?: string) {
    return this.updates.listForCustomer(this.token(req, token));
  }

  @Post(':id/read')
  read(@Req() req: Request, @Param('id') id: string, @Query('token') token?: string) {
    return this.updates.markRead(this.token(req, token), id);
  }

  @Post('read-all')
  readAll(@Req() req: Request, @Query('token') token?: string) {
    return this.updates.markAllRead(this.token(req, token));
  }
}
