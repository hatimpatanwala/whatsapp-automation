import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_WHATSAPP_OUTBOUND } from '../../queue/queue.module';

export interface SendMessagePayload {
  tenantSchema: string;
  phoneNumberId: string;
  accessToken: string;
  to: string;
  type: string;
  message: any;
}

@Injectable()
export class WhatsAppApiService {
  private readonly logger = new Logger(WhatsAppApiService.name);
  private readonly apiUrl: string;
  private readonly apiVersion: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_WHATSAPP_OUTBOUND)
    private readonly outboundQueue: Queue,
  ) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com');
    this.apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION', 'v18.0');
  }

  async sendMessage(payload: SendMessagePayload): Promise<string> {
    const job = await this.outboundQueue.add('send-message', payload, {
      priority: payload.type === 'template' ? 2 : 1,
    });
    return job.id;
  }

  async sendDirectMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    messageBody: any,
  ): Promise<any> {
    const url = `${this.apiUrl}/${this.apiVersion}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        ...messageBody,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      this.logger.error(`WhatsApp API error: ${JSON.stringify(error)}`);
      throw new Error(`WhatsApp API error: ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
  }

  async sendTextMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    text: string,
  ): Promise<any> {
    return this.sendDirectMessage(phoneNumberId, accessToken, to, {
      type: 'text',
      text: { body: text },
    });
  }

  async sendInteractiveButtons(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    header?: string,
    footer?: string,
  ): Promise<any> {
    const interactive: any = {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((btn) => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title },
        })),
      },
    };

    if (header) interactive.header = { type: 'text', text: header };
    if (footer) interactive.footer = { text: footer };

    return this.sendDirectMessage(phoneNumberId, accessToken, to, {
      type: 'interactive',
      interactive,
    });
  }

  async sendInteractiveList(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    header?: string,
    footer?: string,
  ): Promise<any> {
    const interactive: any = {
      type: 'list',
      body: { text: body },
      action: {
        button: buttonText,
        sections,
      },
    };

    if (header) interactive.header = { type: 'text', text: header };
    if (footer) interactive.footer = { text: footer };

    return this.sendDirectMessage(phoneNumberId, accessToken, to, {
      type: 'interactive',
      interactive,
    });
  }

  async sendTemplate(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string,
    language: string,
    components?: any[],
  ): Promise<any> {
    const template: any = {
      name: templateName,
      language: { code: language },
    };

    if (components) template.components = components;

    return this.sendDirectMessage(phoneNumberId, accessToken, to, {
      type: 'template',
      template,
    });
  }

  async sendImage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<any> {
    const image: any = { link: imageUrl };
    if (caption) image.caption = caption;

    return this.sendDirectMessage(phoneNumberId, accessToken, to, {
      type: 'image',
      image,
    });
  }

  async getMediaUrl(mediaId: string, accessToken: string): Promise<string> {
    const url = `${this.apiUrl}/${this.apiVersion}/${mediaId}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) throw new Error('Failed to get media URL');
    const data = await response.json();
    return data.url;
  }

  async downloadMedia(mediaUrl: string, accessToken: string): Promise<Buffer> {
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) throw new Error('Failed to download media');
    return Buffer.from(await response.arrayBuffer());
  }
}
