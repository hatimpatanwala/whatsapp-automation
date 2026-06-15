import { Module, forwardRef } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WabaModule } from '../waba/waba.module';

@Module({
  imports: [WhatsAppModule, forwardRef(() => WabaModule)],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
