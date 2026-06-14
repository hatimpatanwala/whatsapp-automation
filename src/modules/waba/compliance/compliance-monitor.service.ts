import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../config/redis.module';
import { WabaAccount } from '../../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { MetaTokenService } from '../meta-token.service';
import { AuditLogService } from '../audit-log.service';
import { QuotaEnforcementService } from '../metering/quota-enforcement.service';

/**
 * Monitors WABA compliance status with Meta.
 * - Detects account restrictions, bans, and review status changes
 * - Pauses messaging for affected tenants when WABA is restricted
 * - Periodically checks permission health and business verification status
 * - Tracks template rejections and content policy violations
 */
@Injectable()
export class ComplianceMonitorService {
  private readonly logger = new Logger(ComplianceMonitorService.name);
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(WabaAccount)
    private readonly wabaRepo: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
    private readonly tokenService: MetaTokenService,
    private readonly auditService: AuditLogService,
    private readonly quotaService: QuotaEnforcementService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {
    this.graphApiVersion = this.config.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  async handleAccountRestriction(wabaId: string, event: string, banInfo?: any): Promise<void> {
    const waba = await this.wabaRepo.findOne({ where: { wabaId } });
    if (!waba) {
      this.logger.warn(`Account restriction for unknown WABA: ${wabaId}`);
      return;
    }

    if (event === 'DISABLED' || banInfo) {
      // 1. Mark WABA as restricted
      await this.wabaRepo.update(waba.id, { status: 'restricted' } as any);

      // 2. Pause all tenants on this WABA
      const phones = await this.phoneRepo.find({ where: { wabaAccountId: waba.id } });
      const affectedTenants: string[] = [];
      for (const phone of phones) {
        if (phone.tenantId) {
          await this.quotaService.pauseMessaging(
            phone.tenantId,
            `WABA ${wabaId} restricted by Meta: ${event}`,
          );
          affectedTenants.push(phone.tenantId);
        }
      }

      // 3. Audit log
      await this.auditService.log({
        tenantId: 'system',
        actorType: 'system',
        actorId: 'compliance_monitor',
        action: 'waba.restricted',
        resourceType: 'waba_account',
        resourceId: waba.id,
        details: { wabaId, event, banInfo, affectedTenants },
      });

      this.logger.error(
        `WABA ${wabaId} RESTRICTED: ${event}. Paused ${affectedTenants.length} tenants.`,
      );
    }
  }

  async handleTemplateRestriction(
    templateId: string,
    templateName: string,
    event: string,
    reason?: string,
  ): Promise<void> {
    this.logger.warn(`Template restriction: ${templateName} (${templateId}) → ${event}`);

    await this.auditService.log({
      tenantId: 'system',
      actorType: 'system',
      actorId: 'compliance_monitor',
      action: `template.${event.toLowerCase()}`,
      resourceType: 'template',
      resourceId: templateId,
      details: { templateName, event, reason },
    });
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async checkPermissionHealth(): Promise<void> {
    const wabas = await this.wabaRepo.find({ where: { status: 'active' } as any });
    this.logger.log(`Permission health check: checking ${wabas.length} active WABAs`);

    for (const waba of wabas) {
      try {
        const token = await this.tokenService.getActiveToken(waba.id);
        const response = await fetch(
          `https://graph.facebook.com/${this.graphApiVersion}/${waba.wabaId}?fields=status,business_verification_status,on_behalf_of_business_info&access_token=${encodeURIComponent(token)}`,
        );
        const info = await response.json() as any;

        if (info.error) {
          this.logger.error(`Permission check failed for WABA ${waba.wabaId}: ${info.error.message}`);
          continue;
        }

        const updates: any = {};
        if (info.business_verification_status) updates.accountReviewStatus = info.business_verification_status;
        if (info.on_behalf_of_business_info?.id) {
          updates.metaBusinessVerification = info.business_verification_status;
        }
        if (Object.keys(updates).length > 0) {
          await this.wabaRepo.update(waba.id, updates);
        }

        if (info.business_verification_status && info.business_verification_status !== 'verified') {
          this.logger.warn(`WABA ${waba.wabaId} verification status: ${info.business_verification_status}`);
        }
      } catch (err: any) {
        this.logger.error(`Permission check failed for WABA ${waba.wabaId}: ${err.message}`);
      }
    }
  }
}
