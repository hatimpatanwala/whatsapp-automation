import { Module } from '@nestjs/common';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AdminFeedService } from './admin-feed.service';
import { AdminFeedListener } from './admin-feed.listener';
import { OrderAssignmentListener } from './order-assignment.listener';
import { AdminFeedController } from './admin-feed.controller';

/**
 * Admin notification feed — listens to domain events (order/quote/customer/…) and
 * records an in-app notification (+ WhatsApp ping via AdminNotificationService).
 * OrderAssignmentListener additionally pings the assigned employee (SmartNotification).
 */
@Module({
  imports: [OnboardingModule, WhatsAppModule],
  controllers: [AdminFeedController],
  providers: [AdminFeedService, AdminFeedListener, OrderAssignmentListener],
})
export class AdminFeedModule {}
