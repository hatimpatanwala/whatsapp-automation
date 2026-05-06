import { Controller, Post, Get, Body, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SignupDto } from './dto/signup.dto';
import { Public } from '../../common/decorators/public.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { SuperAdmin } from '../../database/entities/public/super-admin.entity';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { TenantProvisioningService } from '../tenant/tenant-provisioning.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantProvisioning: TenantProvisioningService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(SuperAdmin)
    private readonly adminRepository: Repository<SuperAdmin>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
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
   * Public self-service signup: creates a new tenant with a trial plan (100 conversations).
   * Auto-logs in the user after signup and redirects to onboarding.
   */
  @Post('signup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() dto: SignupDto, @Req() req: Request) {
    // Generate a URL-safe slug from business name or user name
    const baseName = (dto.businessName || dto.name).toLowerCase();
    const slug = baseName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36);

    // Check if email is already registered
    const existingTenants = await this.tenantRepository.find({
      where: { status: 'active' },
      select: ['id', 'schemaName'],
    });

    for (const t of existingTenants) {
      try {
        const existingUser = await this.authService['connectionManager'].executeInTenantContext(
          t.schemaName,
          async (qr) => {
            const result = await qr.query(`SELECT id FROM users WHERE email = $1`, [dto.email]);
            return result[0] || null;
          },
        );
        if (existingUser) {
          return { error: true, message: 'An account with this email already exists. Please login instead.' };
        }
      } catch {
        continue;
      }
    }

    // Create tenant with trial plan
    const tenant = await this.tenantProvisioning.provisionTenant({
      name: dto.businessName || dto.name + "'s Store",
      slug,
      plan: 'trial',
      ownerPhone: dto.phone,
      ownerName: dto.name,
      ownerEmail: dto.email,
      ownerPassword: dto.password,
    });

    // Auto-login the new user
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
        select: ['id', 'onboardingStatus', 'whatsappPhone', 'businessName', 'phoneNumberId'],
      });

      // Get subscription info for trial status display
      const subscription = await this.subscriptionRepository.findOne({
        where: { tenantId: session.tenantId, status: 'active' },
      });

      return {
        type: 'tenant_user',
        user,
        tenant: tenant ? {
          id: tenant.id,
          onboardingStatus: tenant.onboardingStatus,
          whatsappPhone: tenant.whatsappPhone,
          businessName: tenant.businessName,
          hasWhatsAppConfig: !!tenant.phoneNumberId,
        } : null,
        subscription: subscription ? {
          plan: subscription.plan,
          maxConversations: subscription.maxConversations,
          conversationsUsed: subscription.conversationsUsed,
          validUntil: subscription.validUntil,
          status: subscription.status,
        } : null,
      };
    }

    return { type: null };
  }
}
