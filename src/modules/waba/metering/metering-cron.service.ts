import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConversationMeteringService } from './conversation-metering.service';
import { QuotaEnforcementService } from './quota-enforcement.service';

@Injectable()
export class MeteringCronService {
  private readonly logger = new Logger(MeteringCronService.name);

  constructor(
    private readonly metering: ConversationMeteringService,
    private readonly quota: QuotaEnforcementService,
  ) {}

  /**
   * Close expired conversation sessions every 5 minutes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async closeExpiredSessions(): Promise<void> {
    const closed = await this.metering.closeExpiredSessions();
    if (closed > 0) {
      this.logger.log(`Closed ${closed} expired conversation sessions`);
    }
  }

  /**
   * Reset monthly quotas on the 1st of each month at midnight IST.
   */
  @Cron('0 0 1 * *', { timeZone: 'Asia/Kolkata' })
  async resetMonthlyQuotas(): Promise<void> {
    this.logger.log('Starting monthly quota reset...');
    const count = await this.quota.resetMonthlyQuotas();
    this.logger.log(`Monthly quota reset complete: ${count} subscriptions reset`);
  }
}
