import {
  Controller, Get, Post, Delete, Body, Req, Param, UseGuards, HttpCode, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { OnboardingService, BusinessProfileDto } from './onboarding.service';
import { OnboardingEngineService } from './engine/onboarding-engine.service';
import { AdminWhatsAppService } from './admin-whatsapp.service';
import { PersonalizationService, PersonalizeDto } from './personalization.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('onboarding')
@UseGuards(TenantGuard)
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly onboardingEngine: OnboardingEngineService,
    private readonly adminWhatsAppService: AdminWhatsAppService,
    private readonly personalizationService: PersonalizationService,
  ) {}

  @Get('status')
  @Roles('owner', 'seller')
  async getStatus(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.getStatus(tenantId);
  }

  /**
   * Step 1: Register a phone number under the platform's shared WABA.
   * Checks if number is available, registers it on Meta, assigns to tenant.
   */
  @Post('register-number')
  @Roles('owner')
  @HttpCode(200)
  async registerNumber(@Req() req: Request, @Body() body: { phone: string }) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.registerNumber(tenantId, body.phone);
  }

  /**
   * Request a verification code via SMS or voice call.
   */
  @Post('request-code')
  @Roles('owner')
  @HttpCode(200)
  async requestVerificationCode(
    @Req() req: Request,
    @Body() body: { phoneId: string; method?: 'sms' | 'voice' },
  ) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.requestVerificationCode(tenantId, body.phoneId, body.method);
  }

  /**
   * Verify the phone number with the code received.
   */
  @Post('verify-code')
  @Roles('owner')
  @HttpCode(200)
  async verifyNumber(
    @Req() req: Request,
    @Body() body: { phoneId: string; code: string },
  ) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingService.verifyNumber(tenantId, body.phoneId, body.code);
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

  // ─── Session-based onboarding engine endpoints ──────────────────────────

  /**
   * Start a new onboarding session with phone detection.
   * Returns session ID and detected state (fresh, business_wa, other_bsp, etc.)
   */
  @Post('start')
  @Roles('owner')
  @HttpCode(200)
  async startSession(@Req() req: Request, @Body() body: { phone: string }) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingEngine.startOnboarding(tenantId, body.phone);
  }

  /**
   * Get session status (for polling / resuming UI).
   */
  @Get('session/:sessionId')
  @Roles('owner')
  async getSessionStatus(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingEngine.getSessionStatus(sessionId, tenantId);
  }

  /**
   * Get the latest onboarding session for this tenant.
   */
  @Get('session')
  @Roles('owner')
  async getActiveSession(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingEngine.getActiveSession(tenantId);
  }

  /**
   * Retry detection after user completes migration steps.
   */
  @Post('session/:sessionId/retry')
  @Roles('owner')
  @HttpCode(200)
  async retrySession(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingEngine.retryAfterUserAction(sessionId, tenantId);
  }

  /**
   * Request OTP for a session.
   */
  @Post('session/:sessionId/request-otp')
  @Roles('owner')
  @HttpCode(200)
  async sessionRequestOtp(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Body() body: { method?: 'sms' | 'voice' },
  ) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingEngine.requestOtp(sessionId, tenantId, body.method);
  }

  /**
   * Verify OTP for a session.
   */
  @Post('session/:sessionId/verify-otp')
  @Roles('owner')
  @HttpCode(200)
  async sessionVerifyOtp(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Body() body: { code: string },
  ) {
    const tenantId = (req.session as any).tenantId;
    return this.onboardingEngine.verifyOtp(sessionId, tenantId, body.code);
  }

  // ─── Admin WhatsApp (personal number for admin control) ────────────────────

  /**
   * Send OTP to admin's personal WhatsApp number for verification.
   */
  @Post('admin-whatsapp/send-otp')
  @Roles('owner')
  @HttpCode(200)
  async sendAdminWhatsappOtp(@Req() req: Request, @Body() body: { phone: string }) {
    const tenantId = (req.session as any).tenantId;
    return this.adminWhatsAppService.sendOtp(tenantId, body.phone);
  }

  /**
   * Verify the OTP sent to admin's personal WhatsApp number.
   */
  @Post('admin-whatsapp/verify-otp')
  @Roles('owner')
  @HttpCode(200)
  async verifyAdminWhatsappOtp(@Req() req: Request, @Body() body: { phone: string; code: string }) {
    const tenantId = (req.session as any).tenantId;
    return this.adminWhatsAppService.verifyOtp(tenantId, body.phone, body.code);
  }

  /**
   * Save admin WhatsApp number directly (static — no OTP verification).
   */
  @Post('admin-whatsapp/save')
  @Roles('owner')
  @HttpCode(200)
  async saveAdminWhatsapp(@Req() req: Request, @Body() body: { phone: string }) {
    const tenantId = (req.session as any).tenantId;
    return this.adminWhatsAppService.saveAdminWhatsapp(tenantId, body.phone);
  }

  /**
   * Remove admin WhatsApp number.
   */
  @Delete('admin-whatsapp')
  @Roles('owner')
  async removeAdminWhatsapp(@Req() req: Request) {
    const tenantId = (req.session as any).tenantId;
    return this.adminWhatsAppService.removeAdminWhatsapp(tenantId);
  }

  /**
   * Skip admin WhatsApp setup (user can do it later from settings).
   */
  @Post('admin-whatsapp/skip')
  @Roles('owner')
  @HttpCode(200)
  async skipAdminWhatsapp() {
    return { skipped: true };
  }

  // ─── Personalization (business category + feature selection + auto-workflows) ──

  /**
   * Get business categories, subcategories, and available features.
   */
  @Get('categories')
  @Roles('owner', 'seller')
  async getCategories() {
    return this.personalizationService.getCategories();
  }

  /**
   * Personalize the tenant: save category/subcategory and auto-create workflows.
   */
  @Post('personalize')
  @Roles('owner')
  @HttpCode(200)
  async personalize(@Req() req: Request, @Body() dto: PersonalizeDto) {
    const tenantId = (req.session as any).tenantId;
    return this.personalizationService.personalize(tenantId, dto);
  }
}
