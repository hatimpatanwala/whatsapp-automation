import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AuthService, UnifiedLoginResult } from './auth.service';
import { TenantProvisioningService } from '../tenant/tenant-provisioning.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';

export type OAuthProvider = 'google' | 'meta';

export interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
}

/**
 * Social login / signup (Google + Meta) using the standard OAuth 2.0
 * authorization-code flow. Identity only — this signs the user into (or creates)
 * their tenant account. Connecting WhatsApp is a separate step (Embedded Signup).
 *
 * Meta login reuses the same Meta app (META_APP_ID/SECRET) as Embedded Signup, so
 * a user who signs in with Meta already has a Facebook session in the browser and
 * can continue into Embedded Signup without logging into Facebook again.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly graphVersion: string;

  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    private readonly tenantProvisioning: TenantProvisioningService,
    private readonly platformConfig: PlatformConfigService,
  ) {
    this.graphVersion = this.config.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  /** Configured (creds present) AND enabled by the super-admin. */
  async isAvailable(provider: OAuthProvider): Promise<boolean> {
    return this.platformConfig.isProviderAvailable(provider);
  }

  /** Map of which providers tenants may use right now. */
  async getAvailableProviders(): Promise<{ google: boolean; meta: boolean }> {
    return this.platformConfig.getAvailableProviders();
  }

  /** A random, URL-safe CSRF state token (stored in session, verified on callback). */
  generateState(): string {
    return randomBytes(16).toString('hex');
  }

  private callbackUrl(provider: OAuthProvider): string {
    const base = this.config.get<string>('OAUTH_CALLBACK_BASE_URL', '').replace(/\/$/, '');
    return `${base}/auth/oauth/${provider}/callback`;
  }

  /** Frontend URL to redirect the browser back to after the callback completes. */
  frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL', '').replace(/\/$/, '');
  }

  /** Build the provider's consent screen URL. */
  async getAuthorizeUrl(provider: OAuthProvider, state: string): Promise<string> {
    if (!(await this.isAvailable(provider))) {
      throw new BadRequestException(`${provider} login is not enabled`);
    }
    const redirectUri = this.callbackUrl(provider);

    if (provider === 'google') {
      const { clientId } = await this.platformConfig.getGoogleCreds();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        include_granted_scopes: 'true',
        prompt: 'select_account',
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    // Meta / Facebook Login. Users without a Facebook account can create one in
    // this same dialog, then grant permission to the platform's Meta app.
    const { appId } = await this.platformConfig.getMetaCreds();
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email,public_profile',
      state,
    });
    return `https://www.facebook.com/${this.graphVersion}/dialog/oauth?${params.toString()}`;
  }

  /** Exchange the auth code for an access token and fetch the user's profile. */
  async fetchProfile(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
    const redirectUri = this.callbackUrl(provider);
    if (provider === 'google') return this.fetchGoogleProfile(code, redirectUri);
    return this.fetchMetaProfile(code, redirectUri);
  }

  private async fetchGoogleProfile(code: string, redirectUri: string): Promise<OAuthProfile> {
    const { clientId, clientSecret } = await this.platformConfig.getGoogleCreds();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new BadRequestException(`Google token exchange failed: ${await tokenRes.text()}`);
    }
    const token = await tokenRes.json();

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!profileRes.ok) {
      throw new BadRequestException(`Google profile fetch failed: ${await profileRes.text()}`);
    }
    const p = await profileRes.json();
    return {
      provider: 'google',
      providerUserId: p.sub,
      email: p.email || null,
      emailVerified: !!p.email_verified,
      name: p.name || p.email || 'User',
      avatarUrl: p.picture || null,
    };
  }

  private async fetchMetaProfile(code: string, redirectUri: string): Promise<OAuthProfile> {
    const { appId, appSecret } = await this.platformConfig.getMetaCreds();
    const tokenUrl = new URL(`https://graph.facebook.com/${this.graphVersion}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      throw new BadRequestException(`Meta token exchange failed: ${await tokenRes.text()}`);
    }
    const token = await tokenRes.json();

    const profileUrl = new URL(`https://graph.facebook.com/${this.graphVersion}/me`);
    profileUrl.searchParams.set('fields', 'id,name,email,picture');
    profileUrl.searchParams.set('access_token', token.access_token);

    const profileRes = await fetch(profileUrl.toString());
    if (!profileRes.ok) {
      throw new BadRequestException(`Meta profile fetch failed: ${await profileRes.text()}`);
    }
    const p = await profileRes.json();
    return {
      provider: 'meta',
      providerUserId: p.id,
      email: p.email || null,
      emailVerified: !!p.email, // Meta only returns email if verified + granted
      name: p.name || p.email || 'User',
      avatarUrl: p.picture?.data?.url || null,
    };
  }

  /**
   * Resolve a social profile to a session: log into the existing account if one
   * matches (by provider id or email), otherwise provision a fresh trial tenant.
   * Returns the unified login result plus whether a new account was created.
   */
  async loginOrSignup(
    profile: OAuthProfile,
  ): Promise<{ result: UnifiedLoginResult; isNew: boolean }> {
    if (!profile.email) {
      throw new BadRequestException(
        'Your account did not share an email address, which is required to sign up. Please grant email permission or use email signup.',
      );
    }
    if (await this.authService.isAdminEmail(profile.email)) {
      throw new BadRequestException('This email belongs to an admin account. Please log in with email + password.');
    }

    const existing = await this.authService.findOAuthUser(
      profile.provider,
      profile.providerUserId,
      profile.email,
    );
    if (existing) return { result: existing, isNew: false };

    // New account → provision a trial tenant with a passwordless owner.
    const baseName = profile.name.toLowerCase();
    const slug =
      baseName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) +
      '-' +
      randomBytes(4).toString('hex');

    const tenant = await this.tenantProvisioning.provisionTenant({
      name: `${profile.name}'s Store`,
      slug,
      plan: 'trial',
      ownerName: profile.name,
      ownerEmail: profile.email,
      authProvider: profile.provider,
      providerUserId: profile.providerUserId,
      avatarUrl: profile.avatarUrl || undefined,
      ownerEmailVerified: profile.emailVerified,
    });

    const result = await this.authService.findOAuthUser(
      profile.provider,
      profile.providerUserId,
      profile.email,
    );
    if (!result) {
      throw new BadRequestException('Failed to create account. Please try again.');
    }
    this.logger.log(`Social signup: created tenant ${tenant.slug} via ${profile.provider}`);
    return { result, isNew: true };
  }
}
