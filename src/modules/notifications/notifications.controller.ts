import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PushService } from './push.service';

/**
 * App push-notification API: register/unregister the device's FCM token and
 * manage the tenant's per-type notification preferences (which events push).
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly push: PushService) {}

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName || (req.session as any)?.tenantSchema;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  /** The app registers its push token after the user grants permission. */
  @Post('devices')
  register(@Req() req: Request, @Body() body: { token: string; platform?: string; appVariant?: string }) {
    const userId = (req.session as any)?.userId || null;
    return this.push.registerDevice(this.schema(req), userId, body);
  }

  @Delete('devices/:token')
  unregister(@Req() req: Request, @Param('token') token: string) {
    return this.push.unregisterDevice(this.schema(req), token);
  }

  @Get('prefs')
  prefs(@Req() req: Request) {
    return this.push.getPrefs(this.schema(req));
  }

  @Patch('prefs')
  setPrefs(@Req() req: Request, @Body() body: Record<string, boolean>) {
    return this.push.setPrefs(this.schema(req), body || {});
  }
}
