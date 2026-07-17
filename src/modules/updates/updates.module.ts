import { Module, forwardRef } from '@nestjs/common';
import { BuilderModule } from '../builder/builder.module';
import { UpdatesService } from './updates.service';
import { UpdatesController } from './updates.controller';

/**
 * "My Updates" inbox — the store + customer webview API behind the single-ping
 * WhatsApp notification model. Imports BuilderModule for webview-session tokens;
 * REDIS_CLIENT (global) + the DB connection manager are already available.
 */
@Module({
  imports: [forwardRef(() => BuilderModule)],
  controllers: [UpdatesController],
  providers: [UpdatesService],
  exports: [UpdatesService],
})
export class UpdatesModule {}
