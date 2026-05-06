import { Controller, Get, Post, Query, Body, Req, UseGuards, HttpCode, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookSignatureGuard } from '../../common/guards/webhook-signature.guard';
import { WebhookProcessorService } from './webhook-processor.service';

@Controller('webhook/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookProcessor: WebhookProcessorService,
  ) {}

  @Get()
  @Public()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully');
      return parseInt(challenge);
    }

    this.logger.warn('Webhook verification failed');
    return 'Verification failed';
  }

  @Post()
  @Public()
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(200)
  async receive(@Body() body: any, @Req() req: Request) {
    // Always respond 200 immediately to WhatsApp
    // Process asynchronously
    this.webhookProcessor.processWebhook(body).catch((error) => {
      this.logger.error(`Webhook processing failed: ${error.message}`, error.stack);
    });

    return 'EVENT_RECEIVED';
  }
}
