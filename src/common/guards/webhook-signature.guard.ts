import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-hub-signature-256'] as string;

    if (!signature) {
      this.logger.warn('Missing webhook signature');
      throw new UnauthorizedException('Missing signature');
    }

    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');
    if (!appSecret) {
      this.logger.error('WHATSAPP_APP_SECRET not configured');
      throw new UnauthorizedException('Webhook verification not configured');
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      this.logger.error('Raw body not available — webhook signature cannot be verified. Ensure raw body parsing is enabled in main.ts');
      throw new UnauthorizedException('Raw body required for signature verification');
    }

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      this.logger.warn('Invalid webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}
