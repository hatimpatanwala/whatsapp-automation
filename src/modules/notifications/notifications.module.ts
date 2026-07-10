import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';

/**
 * App push notifications. Global so AdminFeedService (and any other emitter) can
 * inject PushService without import wiring.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [PushService],
  exports: [PushService],
})
export class NotificationsModule {}
