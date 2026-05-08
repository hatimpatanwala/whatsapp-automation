import { Injectable, Logger } from '@nestjs/common';
import { EmbeddedSignupSession } from '../../../database/entities/public/embedded-signup-session.entity';
import { WabaService } from '../waba.service';
import { PhoneNumberService } from '../phone-number.service';
import { MetaTokenService } from '../meta-token.service';
import { WebhookSubscriptionService } from './webhook-subscription.service';

/**
 * Saga-pattern rollback for failed embedded signup onboarding.
 * Reverses completed steps in reverse order when a later step fails,
 * preventing the system from being left in an inconsistent state.
 */
@Injectable()
export class OnboardingRollbackService {
  private readonly logger = new Logger(OnboardingRollbackService.name);

  constructor(
    private readonly wabaService: WabaService,
    private readonly phoneService: PhoneNumberService,
    private readonly tokenService: MetaTokenService,
    private readonly webhookService: WebhookSubscriptionService,
  ) {}

  async rollback(session: EmbeddedSignupSession, accessToken?: string): Promise<string[]> {
    const rolledBack: string[] = [];
    const steps = [...(session.stepLog || [])].reverse();

    for (const step of steps) {
      try {
        switch (step.state) {
          case 'webhook_subscribed':
            if (session.wabaId && accessToken) {
              await this.webhookService.unsubscribeWaba(session.wabaId, accessToken);
              rolledBack.push('webhook_subscribed');
            }
            break;

          case 'phone_synced':
            if (session.phoneRecordId) {
              await this.phoneService.unassignFromTenant(session.phoneRecordId);
              rolledBack.push('phone_synced');
            }
            break;

          case 'system_token_generated':
            if (session.wabaAccountId) {
              await this.tokenService.revokeAllTokens(session.wabaAccountId);
              rolledBack.push('system_token_generated');
            }
            break;

          case 'waba_synced':
            if (session.wabaAccountId) {
              await this.wabaService.markPending(session.wabaAccountId);
              rolledBack.push('waba_synced');
            }
            break;

          case 'initiated':
          case 'code_received':
          case 'token_exchanged':
          case 'failed':
          case 'completed':
            // No rollback needed for these states
            break;
        }
      } catch (rollbackErr: any) {
        this.logger.error(
          `Rollback step '${step.state}' failed for session ${session.id}: ${rollbackErr.message}`,
        );
        // Continue rolling back other steps — partial rollback is better than none
      }
    }

    this.logger.log(`Rollback completed for session ${session.id}: reversed [${rolledBack.join(', ')}]`);
    return rolledBack;
  }
}
