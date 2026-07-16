import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { BaileysSessionService } from './baileys-session.service';
import { WhatsappConnectService } from './whatsapp-connect.service';
import { WhatsappConnectController } from './whatsapp-connect.controller';

/**
 * WhatsApp Smart Connect (Baileys). Imports ErpModule for ErpDocumentService (PDF
 * builders) and the ErpFeatureGuard's PlanFeatureService. REDIS_CLIENT (global) and
 * ScheduleModule (root) are already available.
 */
@Module({
  imports: [ErpModule],
  controllers: [WhatsappConnectController],
  providers: [BaileysSessionService, WhatsappConnectService],
  exports: [BaileysSessionService],
})
export class WhatsappConnectModule {}
