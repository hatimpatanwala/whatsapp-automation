import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SyncService, SyncChange } from './sync.service';
import { MAX_SYNC_BATCH } from './sync.constants';

/**
 * Sync API used by the desktop relay.
 *
 * Data endpoints are @Public() (the AuthGuard is bypassed) and resolve the tenant
 * explicitly, in priority order:
 *   1. `req.tenantContext` — set by TenantResolutionMiddleware from a login session (cloud).
 *   2. `X-Sync-Token` — a per-tenant token minted via POST /sync/token (cloud, tokenless
 *      calls after the first login).
 *   3. `X-Sync-Key` + DESKTOP_MODE — the local backend's shared key (localhost only).
 *
 * `POST /sync/token` is NOT public: it needs a real login session to mint a token for
 * that tenant.
 *
 * Every handler returns `{ success: true, data }` so the global response interceptor
 * passes it through verbatim — raw snake_case rows must NOT be camelCased.
 */
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  private async resolveSchema(req: Request): Promise<string> {
    if (req.tenantContext?.schemaName) return req.tenantContext.schemaName;

    const token = req.headers['x-sync-token'];
    if (typeof token === 'string' && token) {
      const schema = await this.sync.tenantSchemaByToken(token);
      if (schema) return schema;
    }

    const key = req.headers['x-sync-key'];
    const localKey = process.env.SYNC_LOCAL_KEY;
    if (process.env.DESKTOP_MODE === '1' && localKey && key === localKey) {
      return this.sync.singleTenantSchema();
    }
    throw new UnauthorizedException('sync authentication required');
  }

  @Public()
  @Get('changes')
  async changes(
    @Req() req: Request,
    @Query('source') source = 'version',
    @Query('since') since = '0',
    @Query('limit') limit?: string,
  ) {
    const schema = await this.resolveSchema(req);
    const s = Math.max(0, parseInt(since, 10) || 0);
    const l = Math.min(MAX_SYNC_BATCH, Math.max(1, parseInt(limit || '200', 10) || 200));
    const data =
      source === 'outbox'
        ? await this.sync.readFromOutbox(schema, s, l)
        : await this.sync.readByVersion(schema, s, l);
    return { success: true, data };
  }

  @Public()
  @Post('apply')
  async apply(@Req() req: Request, @Body() body: { nodeId?: string; changes?: SyncChange[] }) {
    const schema = await this.resolveSchema(req);
    const data = await this.sync.applyChanges(schema, body?.nodeId, body?.changes || []);
    return { success: true, data };
  }

  @Public()
  @Get('status')
  async status(@Req() req: Request) {
    const schema = await this.resolveSchema(req);
    return { success: true, data: await this.sync.status(schema) };
  }

  /** Mint a sync token for the logged-in tenant (session required — not @Public). */
  @Post('token')
  async token(@Req() req: Request, @Body() body: { label?: string }) {
    const tenantId = req.tenantContext?.id;
    if (!tenantId) throw new UnauthorizedException('login required to mint a sync token');
    const token = await this.sync.issueToken(tenantId, body?.label);
    return { success: true, data: { token } };
  }
}
