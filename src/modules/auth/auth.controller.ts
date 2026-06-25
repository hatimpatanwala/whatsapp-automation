import { Controller, Post, Get, Body, Req, Res, Query, Param, HttpCode, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { OAuthService, OAuthProvider } from './oauth.service';
import { EmailVerificationService } from './email-verification.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SignupDto, SendEmailOtpDto, VerifyEmailOtpDto } from './dto/signup.dto';
import { Public } from '../../common/decorators/public.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { SuperAdmin } from '../../database/entities/public/super-admin.entity';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { SubscriptionPlan } from '../../database/entities/public/subscription-plan.entity';
import { TenantProvisioningService } from '../tenant/tenant-provisioning.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauthService: OAuthService,
    private readonly emailVerification: EmailVerificationService,
    private readonly tenantProvisioning: TenantProvisioningService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(SuperAdmin)
    private readonly adminRepository: Repository<SuperAdmin>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
  ) {}

  /**
   * Unified login endpoint: email + password.
   * Determines if user is super_admin or tenant user automatically.
   */
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.authService.unifiedLogin(dto.email, dto.password);

    if (result.type === 'admin') {
      (req.session as any).adminId = result.admin.id;
      (req.session as any).adminRole = result.admin.role;
      (req.session as any).isAdmin = true;
      return { type: 'admin', admin: result.admin };
    }

    // Tenant user
    req.session.userId = result.user.id;
    req.session.userRole = result.user.role;
    req.session.tenantId = result.tenantId;
    req.session.tenantSchema = result.tenantSchema;

    return { type: 'tenant_user', user: result.user, tenantId: result.tenantId };
  }

  /**
   * Step 1 of signup: validate email uniqueness and send verification OTP.
   */
  @Post('send-email-otp')
  @Public()
  @HttpCode(HttpStatus.OK)
  async sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    // Check if email is already registered
    const emailTaken = await this.isEmailTaken(dto.email);
    if (emailTaken) {
      return { error: true, message: 'An account with this email already exists. Please login instead.' };
    }

    return this.emailVerification.sendOtp(dto);
  }

  /**
   * Step 2 of signup: verify OTP, create tenant, and auto-login.
   */
  @Post('verify-email-otp')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async verifyEmailOtp(@Body() dto: VerifyEmailOtpDto, @Req() req: Request) {
    const signupData = this.emailVerification.verifyOtp(dto.email, dto.code);

    // Double-check email uniqueness
    const emailTaken = await this.isEmailTaken(signupData.email);
    if (emailTaken) {
      return { error: true, message: 'An account with this email already exists. Please login instead.' };
    }

    // Generate slug
    const baseName = (signupData.businessName || signupData.name).toLowerCase();
    const slug = baseName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36);

    // Create tenant with trial plan
    const tenant = await this.tenantProvisioning.provisionTenant({
      name: signupData.businessName || signupData.name + "'s Store",
      slug,
      plan: 'trial',
      ownerName: signupData.name,
      ownerEmail: signupData.email,
      ownerPassword: signupData.password,
    });

    // Auto-login
    const loginResult = await this.authService.unifiedLogin(signupData.email, signupData.password);
    req.session.userId = loginResult.user.id;
    req.session.userRole = loginResult.user.role;
    req.session.tenantId = loginResult.tenantId;
    req.session.tenantSchema = loginResult.tenantSchema;

    return {
      type: 'tenant_user',
      user: loginResult.user,
      tenantId: loginResult.tenantId,
      tenant: { id: tenant.id, name: tenant.name },
    };
  }

  // ─── Social login / signup (Google + Meta) ────────────────────────────────

  /**
   * Step 1: redirect the browser to the provider's consent screen.
   * GET /auth/oauth/google  or  /auth/oauth/meta
   */
  /** Which social providers the super-admin has enabled — used to show/hide buttons. */
  @Get('oauth/providers')
  @Public()
  async oauthProviders() {
    return this.oauthService.getAvailableProviders();
  }

  @Get('oauth/:provider')
  @Public()
  async oauthStart(@Param('provider') provider: string, @Req() req: Request, @Res() res: Response) {
    const p = this.normalizeProvider(provider);
    if (!(await this.oauthService.isAvailable(p))) {
      return res.redirect(`${this.oauthService.frontendUrl()}/auth/login?error=oauth_unconfigured`);
    }
    const state = this.oauthService.generateState();
    (req.session as any).oauthState = state;
    (req.session as any).oauthProvider = p;
    return res.redirect(await this.oauthService.getAuthorizeUrl(p, state));
  }

  /**
   * Step 2: provider redirects back here with ?code & ?state.
   * Verifies state, resolves the identity to a session, redirects into the app.
   * GET /auth/oauth/google/callback
   */
  @Get('oauth/:provider/callback')
  @Public()
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontend = this.oauthService.frontendUrl();
    const p = this.normalizeProvider(provider);

    try {
      if (error) throw new BadRequestException(error);
      const sessionState = (req.session as any).oauthState;
      if (!code || !state || !sessionState || state !== sessionState) {
        throw new BadRequestException('Invalid or expired OAuth state');
      }
      delete (req.session as any).oauthState;
      delete (req.session as any).oauthProvider;

      const profile = await this.oauthService.fetchProfile(p, code);
      const { result, isNew } = await this.oauthService.loginOrSignup(profile);

      req.session.userId = result.user.id;
      req.session.userRole = result.user.role;
      req.session.tenantId = result.tenantId;
      req.session.tenantSchema = result.tenantSchema;

      // New accounts go to onboarding; returning users to the dashboard.
      const dest = isNew ? '/onboarding' : '/dashboard';
      return res.redirect(`${frontend}${dest}`);
    } catch (err: any) {
      const msg = encodeURIComponent(err?.message || 'Social login failed');
      return res.redirect(`${frontend}/auth/login?error=oauth&message=${msg}`);
    }
  }

  private normalizeProvider(provider: string): OAuthProvider {
    const p = (provider || '').toLowerCase();
    if (p === 'google') return 'google';
    if (p === 'meta' || p === 'facebook') return 'meta';
    throw new BadRequestException(`Unsupported provider: ${provider}`);
  }

  /**
   * Legacy signup endpoint (direct create without email verification).
   * Kept for backward compatibility — new registrations should use send-email-otp → verify-email-otp.
   */
  @Post('signup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() dto: SignupDto, @Req() req: Request) {
    const baseName = (dto.businessName || dto.name).toLowerCase();
    const slug = baseName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36);

    const emailTaken = await this.isEmailTaken(dto.email);
    if (emailTaken) {
      return { error: true, message: 'An account with this email already exists. Please login instead.' };
    }

    const tenant = await this.tenantProvisioning.provisionTenant({
      name: dto.businessName || dto.name + "'s Store",
      slug,
      plan: 'trial',
      ownerName: dto.name,
      ownerEmail: dto.email,
      ownerPassword: dto.password,
    });

    const loginResult = await this.authService.unifiedLogin(dto.email, dto.password);
    req.session.userId = loginResult.user.id;
    req.session.userRole = loginResult.user.role;
    req.session.tenantId = loginResult.tenantId;
    req.session.tenantSchema = loginResult.tenantSchema;

    return {
      type: 'tenant_user',
      user: loginResult.user,
      tenantId: loginResult.tenantId,
      tenant: { id: tenant.id, name: tenant.name },
    };
  }

  private async isEmailTaken(email: string): Promise<boolean> {
    const existingTenants = await this.tenantRepository.find({
      where: { status: 'active' },
      select: ['id', 'schemaName'],
    });

    for (const t of existingTenants) {
      try {
        const existingUser = await this.authService['connectionManager'].executeInTenantContext(
          t.schemaName,
          async (qr) => {
            const result = await qr.query(`SELECT id FROM users WHERE email = $1`, [email]);
            return result[0] || null;
          },
        );
        if (existingUser) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  @Post('register')
  @UseGuards(TenantGuard)
  @Roles('owner')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const tenantSchema = req.tenantContext.schemaName;
    const user = await this.authService.register(tenantSchema, dto);
    return { user };
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request) {
    return new Promise<{ message: string }>((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) reject(err);
        resolve({ message: 'Logged out' });
      });
    });
  }

  /**
   * Unified session rehydration endpoint.
   * Returns either admin or tenant user based on what's in the session.
   */
  @Get('me')
  @Public()
  async me(@Req() req: Request) {
    const session = req.session as any;

    // Admin session
    if (session?.isAdmin && session?.adminId) {
      const admin = await this.adminRepository.findOne({ where: { id: session.adminId } });
      if (!admin) return { type: null };
      const { passwordHash, ...adminResult } = admin;
      return { type: 'admin', admin: adminResult };
    }

    // Tenant user session
    if (session?.userId && session?.tenantSchema) {
      const user = await this.authService['connectionManager'].executeInTenantContext(
        session.tenantSchema,
        async (qr) => {
          const result = await qr.query(
            `SELECT id, phone, name, email, role, language FROM users WHERE id = $1`,
            [session.userId],
          );
          return result[0];
        },
      );

      if (!user) return { type: null };

      const tenant = await this.tenantRepository.findOne({
        where: { id: session.tenantId },
        select: ['id', 'slug', 'onboardingStatus', 'whatsappPhone', 'businessName', 'businessCategory', 'businessDescription', 'businessAddress', 'logoUrl', 'phoneNumberId'],
      });

      // Get subscription info for trial status display
      const subscription = await this.subscriptionRepository.findOne({
        where: { tenantId: session.tenantId, status: 'active' },
      });

      // Load the subscription plan to get enabled features
      let enabledFeatures: string[] = [];
      let planName = subscription?.plan ?? '';
      let planLimits: Record<string, number | null> = {};
      if (subscription) {
        let plan: SubscriptionPlan | null = null;

        if (subscription.planId) {
          plan = await this.planRepository.findOne({ where: { id: subscription.planId } });
        }

        // Fallback: look up plan by tier name if planId is missing
        if (!plan && subscription.plan) {
          plan = await this.planRepository.findOne({
            where: { tier: subscription.plan, isActive: true },
          });
          // Backfill the planId so future lookups are fast
          if (plan) {
            await this.subscriptionRepository.update(subscription.id, { planId: plan.id });
          }
        }

        if (plan) {
          enabledFeatures = plan.getEnabledFeatures();
          planName = plan.name;
          planLimits = plan.limits || {};
        }
      }

      return {
        type: 'tenant_user',
        user,
        tenant: tenant ? {
          id: tenant.id,
          slug: tenant.slug,
          onboardingStatus: tenant.onboardingStatus,
          whatsappPhone: tenant.whatsappPhone,
          businessName: tenant.businessName,
          businessCategory: tenant.businessCategory,
          businessDescription: tenant.businessDescription,
          businessAddress: tenant.businessAddress,
          logoUrl: tenant.logoUrl,
          hasWhatsAppConfig: !!tenant.phoneNumberId,
        } : null,
        subscription: subscription ? {
          plan: subscription.plan,
          planId: subscription.planId,
          planName,
          status: subscription.status,
          maxProducts: subscription.maxProducts,
          maxConversations: subscription.maxConversations,
          maxCampaignsPerMonth: subscription.maxCampaignsPerMonth,
          conversationsUsed: subscription.conversationsUsed,
          validFrom: subscription.validFrom,
          validUntil: subscription.validUntil,
          allowExceed: subscription.allowExceed,
          enabledFeatures,
          limits: planLimits,
        } : null,
      };
    }

    return { type: null };
  }
}
