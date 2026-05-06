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
    const rawBody = request.rawBody || JSON.stringify(request.body);

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    if (!crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )) {
      this.logger.warn('Invalid webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}
