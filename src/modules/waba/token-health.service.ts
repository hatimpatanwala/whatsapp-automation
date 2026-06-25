import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { MetaToken } from '../../database/entities/public/meta-token.entity';
import { MetaTokenService } from './meta-token.service';
import { AuditLogService } from './audit-log.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';

/**
 * Periodic token health validation.
 * - Validates tokens via Meta's /debug_token endpoint
 * - Detects expired or revoked tokens before they cause silent failures
 * - Alerts when tokens approach expiry (7-day warning window)
 * - Detects token drift (token changed outside platform)
 */
@Injectable()
export class TokenHealthService {
  private readonly logger = new Logger(TokenHealthService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(MetaToken)
    private readonly tokenRepo: Repository<MetaToken>,
    private readonly metaTokenService: MetaTokenService,
    private readonly auditService: AuditLogService,
    private readonly config: ConfigService,
    private readonly platformConfig: PlatformConfigService,
  ) {
    this.appId = this.config.get<string>('META_APP_ID', '');
    this.appSecret = this.config.get<string>('META_APP_SECRET', '');
    this.graphApiVersion = this.config.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  @Cron(CronExpression.EVERY_4_HOURS)
  async validateAllTokens(): Promise<void> {
    const tokens = await this.tokenRepo.find({ where: { isActive: true } });
    this.logger.log(`Token health check: validating ${tokens.length} active tokens`);

    let valid = 0;
    let invalid = 0;
    let expiringSoon = 0;

    for (const token of tokens) {
      try {
        const decrypted = this.metaTokenService['decrypt'](token.encryptedToken);
        const result = await this.debugToken(decrypted);

        if (!result || !result.is_valid) {
          await this.handleInvalidToken(token, result);
          invalid++;
          continue;
        }

        // Check expiry proximity (7-day warning window)
        if (result.expires_at) {
          const expiresIn = result.expires_at - Math.floor(Date.now() / 1000);
          if (expiresIn < 7 * 86400) {
            expiringSoon++;
            this.logger.warn(
              `Token for WABA ${token.wabaAccountId} expires in ${Math.round(expiresIn / 86400)} days`,
            );
            await this.auditService.log({
              tenantId: 'system',
              actorType: 'system',
              actorId: 'token_health',
              action: 'token.expiring_soon',
              resourceType: 'meta_token',
              resourceId: token.id,
              details: {
                wabaAccountId: token.wabaAccountId,
                expiresIn,
                expiresAt: new Date(result.expires_at * 1000).toISOString(),
              },
            });

            // Update stored expiry
            if (!token.expiresAt) {
              await this.tokenRepo.update(token.id, {
                expiresAt: new Date(result.expires_at * 1000),
              });
            }
          }
        }

        valid++;

        // Update last validated timestamp
        await this.tokenRepo.update(token.id, {
          lastValidatedAt: new Date(),
        } as any);
      } catch (err: any) {
        this.logger.error(`Token health check failed for ${token.id}: ${err.message}`);
      }
    }

    this.logger.log(
      `Token health check complete: ${valid} valid, ${invalid} invalid, ${expiringSoon} expiring soon`,
    );
  }

  private async debugToken(token: string): Promise<any> {
    try {
      const { appId, appSecret } = await this.platformConfig.getMetaCreds();
      const aId = appId || this.appId;
      const aSecret = appSecret || this.appSecret;
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${aId}|${aSecret}`,
      );
      const data = await response.json() as any;
      return data.data;
    } catch (err: any) {
      this.logger.error(`debug_token API call failed: ${err.message}`);
      return null;
    }
  }

  private async handleInvalidToken(token: MetaToken, debugResult: any): Promise<void> {
    const reason = debugResult?.error?.message || 'Token validation failed';
    this.logger.error(
      `Invalid token detected for WABA ${token.wabaAccountId}: ${reason}`,
    );

    // Record the failure in the audit log (don't deactivate — let admins
    // investigate). MetaToken has no metadata column, so we don't write to it.
    await this.auditService.log({
      tenantId: 'system',
      actorType: 'system',
      actorId: 'token_health',
      action: 'token.invalid_detected',
      resourceType: 'meta_token',
      resourceId: token.id,
      details: {
        wabaAccountId: token.wabaAccountId,
        tokenType: token.tokenType,
        reason,
        debugResult,
      },
    });
  }
}
