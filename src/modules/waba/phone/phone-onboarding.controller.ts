import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { PhoneOnboardingService } from './phone-onboarding.service';
import { QualityMonitorService } from './quality-monitor.service';

@Controller('admin/waba/phones')
export class PhoneOnboardingController {
  constructor(
    private readonly onboarding: PhoneOnboardingService,
    private readonly quality: QualityMonitorService,
  ) {}

  @Get(':id/onboarding-status')
  async getOnboardingStatus(@Param('id') id: string) {
    return this.onboarding.getOnboardingStatus(id);
  }

  @Post(':id/onboard')
  async startOnboarding(@Param('id') id: string, @Body() body: { tenantId: string }) {
    return this.onboarding.startOnboarding(id, body.tenantId);
  }

  @Post(':id/request-code')
  async requestCode(@Param('id') id: string, @Body() body: { method?: 'SMS' | 'VOICE' }) {
    await this.onboarding.requestCode(id, body.method || 'SMS');
    return { message: 'Verification code sent' };
  }

  @Post(':id/verify-code')
  async verifyCode(@Param('id') id: string, @Body() body: { code: string }) {
    await this.onboarding.verifyCode(id, body.code);
    return { message: 'Code verified successfully' };
  }

  @Post(':id/register')
  async register(@Param('id') id: string, @Body() body: { pin: string }) {
    await this.onboarding.register(id, body.pin);
    return { message: 'Phone registered successfully' };
  }

  @Post(':id/business-profile')
  async setProfile(@Param('id') id: string, @Body() profile: any) {
    await this.onboarding.setBusinessProfile(id, profile);
    return { message: 'Business profile updated' };
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string) {
    return this.onboarding.completeOnboarding(id);
  }

  // ─── Quality Monitoring ─────────────────────────────────────────

  @Get(':id/quality-history')
  async qualityHistory(@Param('id') id: string) {
    return this.quality.getQualityHistory(id);
  }

  @Get('quality/summary')
  async qualitySummary() {
    return this.quality.getQualitySummary();
  }

  @Post('webhook/quality')
  async handleQualityWebhook(@Body() body: {
    phone_number_id: string;
    current_limit: string;
    event: string;
    reason?: string;
  }) {
    await this.quality.recordQualityChange(body.phone_number_id, {
      currentRating: body.current_limit,
      eventType: body.event,
      reason: body.reason,
    });
    return { received: true };
  }
}
