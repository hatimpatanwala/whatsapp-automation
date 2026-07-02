import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { TeamController } from './team.controller';

/**
 * Sales / staff module. Owns the portal-facing team management API; the staff
 * services themselves (TeamService, StaffWhatsAppService, StaffCommandService)
 * live in WhatsAppModule so the webhook can recognise staff without a circular
 * dependency. This module just imports and exposes them over HTTP.
 */
@Module({
  imports: [WhatsAppModule],
  controllers: [TeamController],
})
export class SalesModule {}
