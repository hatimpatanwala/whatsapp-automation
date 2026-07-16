import { Module, forwardRef } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { BaileysSessionService } from './baileys-session.service';
import { WhatsappConnectService } from './whatsapp-connect.service';
import { WhatsappConnectController } from './whatsapp-connect.controller';

/**
 * WhatsApp send + Smart Connect. Imports ErpModule (ErpDocumentService PDF builders +
 * ErpFeatureGuard's PlanFeatureService) and WhatsAppModule (official-API DocDelivery +
 * SmartNotification creds check for the safe send path). REDIS_CLIENT (global),
 * ScheduleModule (root) and the DB connection manager are already available.
 */
@Module({
  imports: [ErpModule, forwardRef(() => WhatsAppModule)],
  controllers: [WhatsappConnectController],
  providers: [BaileysSessionService, WhatsappConnectService],
  exports: [BaileysSessionService],
})
export class WhatsappConnectModule {}
