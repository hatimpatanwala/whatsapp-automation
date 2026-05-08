import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../database/entities/public/subscription.entity';

/**
 * Guard that checks whether the tenant's subscription is active and within limits.
 * Blocks access when:
 * - Trial has expired (validUntil < now)
 * - Conversation limit has been reached (conversationsUsed >= maxConversations)
 *
 * Use @UseGuards(SubscriptionGuard) on controllers/routes that require an active subscription
 * (e.g., workflow builder, campaign creation, sending messages).
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.session?.tenantId || request.tenantContext?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId, status: 'active' },
    });

    if (!subscription) {
      throw new ForbiddenException('No active subscription found. Please subscribe to a plan.');
    }

    // Check trial expiry
    if (subscription.validUntil && new Date() > new Date(subscription.validUntil)) {
      throw new ForbiddenException(
        'Your trial has expired. Please upgrade to a paid plan to continue using the platform.',
      );
    }

    // Check conversation limit (only block if tenant has NOT enabled exceed)
    if (subscription.conversationsUsed >= subscription.maxConversations && !subscription.allowExceed) {
      throw new ForbiddenException(
        `You have reached your conversation limit (${subscription.maxConversations}). Please upgrade your plan or enable exceed in settings.`,
      );
    }

    // Attach subscription to request for downstream use
    request.subscription = subscription;

    return true;
  }
}
