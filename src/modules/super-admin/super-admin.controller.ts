import { Controller, Get, Post, Put, Param, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { SuperAdminService } from './super-admin.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

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
}
