import { Module } from '@nestjs/common';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { SegmentService } from './segment.service';
import { BroadcastProcessor } from './broadcast.processor';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsAppModule],
  controllers: [CampaignController],
  providers: [CampaignService, SegmentService, BroadcastProcessor],
  exports: [CampaignService, SegmentService],
})
export class CampaignModule {}
