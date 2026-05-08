import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WebhookSubscription } from '../../../database/entities/public/webhook-subscription.entity';

const DEFAULT_SUBSCRIBED_FIELDS = [
  'messages',
  'message_template_status_update',
  'message_template_quality_update',
  'phone_number_name_update',
  'phone_number_quality_update',
  'account_update',
  'account_review_update',
  'business_capability_update',
  'security',
  'flows',
];

/**
 * Manages webhook subscriptions for WABA accounts.
 * Ensures each WABA is subscribed to receive the events our platform needs.
 */
@Injectable()
export class WebhookSubscriptionService {
  private readonly logger = new Logger(WebhookSubscriptionService.name);
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(WebhookSubscription)
    private readonly subscriptionRepo: Repository<WebhookSubscription>,
    private readonly config: ConfigService,
  ) {
    this.graphApiVersion = this.config.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  /**
   * Subscribe a WABA to our app's webhooks.
   * Stores the subscription record and calls Meta's API.
   */
  async subscribeWaba(
    wabaAccountId: string,
    wabaId: string,
    accessToken: string,
  ): Promise<WebhookSubscription> {
    // Check for existing subscription
    let subscription = await this.subscriptionRepo.findOne({
      where: { wabaAccountId, wabaId },
    });

    if (!subscription) {
      subscription = this.subscriptionRepo.create({
        wabaAccountId,
        wabaId,
        status: 'pending',
        subscribedFields: DEFAULT_SUBSCRIBED_FIELDS,
        appId: this.config.get<string>('META_APP_ID', ''),
      });
    }

    try {
      // Call Meta API to subscribe
      const url = `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/subscribed_apps`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json() as any;

      if (response.ok && data.success) {
        subscription.status = 'active';
        subscription.lastVerifiedAt = new Date();
        subscription.lastError = null;
        subscription.retryCount = 0;
        this.logger.log(`Webhook subscribed for WABA ${wabaId}`);
      } else {
        subscription.status = 'failed';
        subscription.lastError = data.error?.message || 'Unknown error';
        subscription.retryCount++;
        this.logger.warn(`Webhook subscription failed for WABA ${wabaId}: ${subscription.lastError}`);
      }
    } catch (err: any) {
      subscription.status = 'failed';
      subscription.lastError = err.message;
      subscription.retryCount++;
      this.logger.error(`Webhook subscription error for WABA ${wabaId}: ${err.message}`);
    }

    return this.subscriptionRepo.save(subscription);
  }

  /**
   * Verify that a WABA's webhook subscription is still active.
   */
  async verifySubscription(wabaId: string, accessToken: string): Promise<boolean> {
    try {
      const url = `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/subscribed_apps`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await response.json() as any;
      const isSubscribed = data.data?.length > 0;

      // Update record
      const subscription = await this.subscriptionRepo.findOne({ where: { wabaId } });
      if (subscription) {
        subscription.lastVerifiedAt = new Date();
        subscription.status = isSubscribed ? 'active' : 'inactive';
        await this.subscriptionRepo.save(subscription);
      }

      return isSubscribed;
    } catch (err: any) {
      this.logger.warn(`Webhook verification failed for WABA ${wabaId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Unsubscribe a WABA from webhooks.
   */
  async unsubscribeWaba(wabaId: string, accessToken: string): Promise<void> {
    try {
      const url = `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/subscribed_apps`;
      await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      await this.subscriptionRepo.update({ wabaId }, { status: 'inactive' });
      this.logger.log(`Webhook unsubscribed for WABA ${wabaId}`);
    } catch (err: any) {
      this.logger.warn(`Webhook unsubscribe failed for WABA ${wabaId}: ${err.message}`);
    }
  }

  /**
   * Get all webhook subscriptions (admin dashboard).
   */
  async getAllSubscriptions(): Promise<WebhookSubscription[]> {
    return this.subscriptionRepo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Get subscription status for a specific WABA.
   */
  async getSubscriptionByWaba(wabaId: string): Promise<WebhookSubscription | null> {
    return this.subscriptionRepo.findOne({ where: { wabaId } });
  }
}
