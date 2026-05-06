import {
  Controller, Get, Post, Body, Req, UseGuards, HttpCode,
} from '@nestjs/common';
import { Request } from 'express';
import { OnboardingService, ConnectWhatsAppDto, BusinessProfileDto } from './onboarding.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('onboarding')
@UseGuards(TenantGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @Roles('owner', 'seller')
  async getStatus(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.getStatus(tenantId);
  }

  @Post('check-phone')
  @Roles('owner')
  @HttpCode(200)
  async checkPhone(@Req() req: Request, @Body() body: { phone: string }) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.checkPhone(tenantId, body.phone);
  }

  @Post('connect-whatsapp')
  @Roles('owner')
  async connectWhatsApp(@Req() req: Request, @Body() dto: ConnectWhatsAppDto) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.connectWhatsApp(tenantId, dto);
  }

  @Post('business-profile')
  @Roles('owner')
  async saveBusinessProfile(@Req() req: Request, @Body() dto: BusinessProfileDto) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.saveBusinessProfile(tenantId, dto);
  }

  @Post('complete')
  @Roles('owner')
  @HttpCode(200)
  async complete(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.completeOnboarding(tenantId);
  }

  @Post('skip')
  @Roles('owner')
  @HttpCode(200)
  async skip(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.skipOnboarding(tenantId);
  }

  @Get('setup-guide')
  @Roles('owner', 'seller')
  async getSetupGuide() {
    return this.onboardingService.getSetupGuide();
  }
}
