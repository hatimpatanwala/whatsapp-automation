import { Controller, Post, Req, Body, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BuilderService, BuilderType } from './builder.service';

/**
 * Session-authenticated endpoint for the tenant panel to mint a Builder link
 * (same builder the WhatsApp bot uses). Returns the token + the relative path so
 * the panel can open /m/builder?token=... directly.
 */
@Controller('builder')
@UseGuards(TenantGuard)
export class BuilderAdminController {
  constructor(private readonly builder: BuilderService) {}

  @Post('sessions')
  @Roles('owner', 'seller')
  async mint(
    @Req() req: Request,
    @Body() body: { type: BuilderType; customerPhone?: string; customerName?: string },
  ) {
    const t = req.tenantContext;
    const type: BuilderType = body?.type === 'quote' ? 'quote' : 'order';
    const session = await this.builder.createSession({
      tenantId: t.id,
      schemaName: t.schemaName,
      type,
      customerPhone: body?.customerPhone,
      customerName: body?.customerName,
      createdBy: 'panel',
    });
    return { token: session.token, path: session.path, url: session.url, type };
  }
}
