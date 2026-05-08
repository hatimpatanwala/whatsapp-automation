import { Module } from '@nestjs/common';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { SegmentService } from './segment.service';
import { BroadcastProcessor } from './broadcast.processor';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WabaModule } from '../waba/waba.module';

@Module({
  imports: [WhatsAppModule, WabaModule],
  controllers: [CampaignController],
  providers: [CampaignService, SegmentService, BroadcastProcessor],
  exports: [CampaignService, SegmentService],
})
export class CampaignModule {}
