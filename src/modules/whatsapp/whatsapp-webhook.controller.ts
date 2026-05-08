import { Controller, Get, Post, Query, Body, Req, Res, UseGuards, HttpCode, Logger, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookSignatureGuard } from '../../common/guards/webhook-signature.guard';
import { QUEUE_WEBHOOK_INGEST } from '../../queue/queue.module';

@Controller('webhook/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_WEBHOOK_INGEST)
    private readonly webhookIngestQueue: Queue,
  ) {}

  /**
   * Meta webhook verification — must return the raw challenge string (not JSON-wrapped).
   * UseInterceptors() with empty array disables the global TransformResponseInterceptor.
   */
  @Get()
  @Public()
  @UseInterceptors()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully');
      return res.status(200).send(challenge);
    }

    this.logger.warn('Webhook verification failed');
    return res.status(403).send('Verification failed');
  }

  @Post()
  @Public()
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(200)
  async receive(@Body() body: any, @Req() req: Request) {
    // Acknowledge immediately — push to queue for async processing
    // This ensures we respond within Meta's 20-second timeout
    await this.webhookIngestQueue.add('ingest', {
      payload: body,
      receivedAt: Date.now(),
    });

    return 'EVENT_RECEIVED';
  }
}
