import { Module } from '@nestjs/common';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { AdminFeedService } from './admin-feed.service';
import { AdminFeedListener } from './admin-feed.listener';
import { AdminFeedController } from './admin-feed.controller';

/**
 * Admin notification feed — listens to domain events (order/quote/customer/…) and
 * records an in-app notification (+ WhatsApp ping via AdminNotificationService).
 */
@Module({
  imports: [OnboardingModule],
  controllers: [AdminFeedController],
  providers: [AdminFeedService, AdminFeedListener],
})
export class AdminFeedModule {}
