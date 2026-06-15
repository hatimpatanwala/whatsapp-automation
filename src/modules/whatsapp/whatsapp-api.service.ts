import { Injectable, Logger, ServiceUnavailableException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { QUEUE_WHATSAPP_OUTBOUND } from '../../queue/queue.module';
import { CircuitBreaker, CircuitBreakerOpenError } from '../../common/resilience/circuit-breaker';

export interface SendMessagePayload {
  tenantSchema: string;
  phoneNumberId: string;
  accessToken: string;
  to: string;
  type: string;
  message: any;
}

export interface MetaApiErrorClassification {
  retryable: boolean;
  action: 'rate_limit_backoff' | 'undeliverable' | 'outside_24h_window' | 'reauth_required' | 'transient_error' | 'temporarily_blocked' | 'unknown';
  code?: number;
  message?: string;
}

@Injectable()
export class WhatsAppApiService {
  private readonly logger = new Logger(WhatsAppApiService.name);
  private readonly apiUrl: string;
  private readonly apiVersion: string;
  private readonly metaApiBreaker = new CircuitBreaker('meta-api', 10, 60000);
  private static readonly MAX_QUEUE_DEPTH = 50000;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_WHATSAPP_OUTBOUND)
    private readonly outboundQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com');
    this.apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION', 'v21.0');
  }

  async sendMessage(payload: SendMessagePayload): Promise<string> {
    // Backpressure: reject if queue is overloaded
    const waiting = await this.outboundQueue.getWaitingCount();
    if (waiting > WhatsAppApiService.MAX_QUEUE_DEPTH) {
      throw new ServiceUnavailableException(
        `Message queue at capacity (${waiting} pending). Please retry later.`,
      );
    }

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
    return this.metaApiBreaker.execute(async () => {
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
        const errorData = await response.json() as any;
        const classification = this.classifyMetaError(errorData);
        this.logger.error(
          `WhatsApp API error [${classification.code}/${classification.action}]: ${classification.message}`,
        );

        const error = new MetaApiError(
          classification.message || 'Unknown error',
          classification,
        );

        // Don't let non-retryable errors trip the circuit breaker
        if (!classification.retryable) {
          throw error;
        }

        throw error;
      }

      return response.json();
    });
  }

  classifyMetaError(errorData: any): MetaApiErrorClassification {
    const code = errorData.error?.code;
    const subcode = errorData.error?.error_subcode;
    const message = errorData.error?.message || 'Unknown error';

    switch (code) {
      case 130429:
        return { retryable: true, action: 'rate_limit_backoff', code, message };
      case 131026:
        return { retryable: false, action: 'undeliverable', code, message };
      case 131047:
        return { retryable: false, action: 'outside_24h_window', code, message };
      case 190:
        return { retryable: false, action: 'reauth_required', code, message };
      case 4:
        return { retryable: true, action: 'transient_error', code, message };
      case 368:
        return { retryable: false, action: 'temporarily_blocked', code, message };
      case 131031:
        return { retryable: false, action: 'undeliverable', code, message }; // Recipient not on WA
      case 131053:
        return { retryable: true, action: 'transient_error', code, message }; // Media upload error
      default:
        return { retryable: true, action: 'unknown', code, message };
    }
  }

  getCircuitBreakerState() {
    return {
      state: this.metaApiBreaker.getState(),
      failures: this.metaApiBreaker.getFailures(),
    };
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

  /** Interactive reply buttons with an image header (product card style). */
  async sendInteractiveButtonsWithImage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    imageUrl: string,
    footer?: string,
  ): Promise<any> {
    const interactive: any = {
      type: 'button',
      header: { type: 'image', image: { link: imageUrl } },
      body: { text: body },
      action: {
        buttons: buttons.map((btn) => ({ type: 'reply', reply: { id: btn.id, title: btn.title } })),
      },
    };
    if (footer) interactive.footer = { text: footer };
    return this.sendDirectMessage(phoneNumberId, accessToken, to, { type: 'interactive', interactive });
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

  /** Send an image that has already been uploaded to WhatsApp (by media id). */
  async sendImageById(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    mediaId: string,
    caption?: string,
  ): Promise<any> {
    const image: any = { id: mediaId };
    if (caption) image.caption = caption;
    return this.sendDirectMessage(phoneNumberId, accessToken, to, { type: 'image', image });
  }

  /**
   * Send an image reliably: upload it to WhatsApp once (cached as a media id per
   * phone number) and send by id, falling back to a link-based send if the
   * upload fails. Link-based images are often accepted but silently undelivered,
   * so the media-id path is strongly preferred for things like product cards.
   */
  async sendImageSmart(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<any> {
    const key = this.mediaCacheKey(phoneNumberId, imageUrl);
    try {
      const mediaId = await this.getOrUploadMedia(phoneNumberId, accessToken, imageUrl, key);
      if (mediaId) {
        try {
          return await this.sendImageById(phoneNumberId, accessToken, to, mediaId, caption);
        } catch (err: any) {
          // The cached media id may have expired on Meta's side — drop it so the
          // next attempt re-uploads, then fall through to the link send.
          await this.redis.del(key).catch(() => undefined);
          this.logger.warn(`sendImageById failed (${err.message}); falling back to link`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`media upload failed (${err.message}); falling back to link`);
    }
    return this.sendImage(phoneNumberId, accessToken, to, imageUrl, caption);
  }

  private mediaCacheKey(phoneNumberId: string, imageUrl: string): string {
    return `wa:media:${phoneNumberId}:${createHash('md5').update(imageUrl).digest('hex')}`;
  }

  private async getOrUploadMedia(
    phoneNumberId: string,
    accessToken: string,
    imageUrl: string,
    key: string,
  ): Promise<string | null> {
    const cached = await this.redis.get(key).catch(() => null);
    if (cached) return cached;
    const mediaId = await this.uploadMediaFromUrl(phoneNumberId, accessToken, imageUrl);
    if (mediaId) {
      // Meta stores uploaded media ~30 days; refresh our cache well before that.
      await this.redis.set(key, mediaId, 'EX', 60 * 60 * 24 * 20).catch(() => undefined);
    }
    return mediaId;
  }

  /** Download an image by URL and upload it to the WhatsApp media endpoint. */
  async uploadMediaFromUrl(
    phoneNumberId: string,
    accessToken: string,
    imageUrl: string,
  ): Promise<string | null> {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`fetch image ${imgRes.status}`);
    let contentType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    // WhatsApp image media must be jpeg or png.
    if (contentType !== 'image/png') contentType = 'image/jpeg';
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', contentType);
    form.append(
      'file',
      new Blob([buffer], { type: contentType }),
      contentType === 'image/png' ? 'image.png' : 'image.jpg',
    );

    const url = `${this.apiUrl}/${this.apiVersion}/${phoneNumberId}/media`;
    const up = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form as any,
    });
    const data = (await up.json().catch(() => ({}))) as any;
    if (!up.ok || !data?.id) {
      this.logger.error(`Media upload failed: ${JSON.stringify(data)}`);
      return null;
    }
    return data.id as string;
  }

  // ─── WhatsApp Commerce / Catalog Messages ───────────────────────────────

  /**
   * Send the full business catalog to a customer.
   * Requires a Meta Commerce catalog linked to the WABA.
   */
  async sendCatalogMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    bodyText: string,
    thumbnailProductId?: string,
    footer?: string,
  ): Promise<any> {
    const interactive: any = {
      type: 'catalog_message',
      body: { text: bodyText },
      action: {
        name: 'catalog_message',
      },
    };

    if (thumbnailProductId) {
      interactive.action.parameters = {
        thumbnail_product_retailer_id: thumbnailProductId,
      };
    }
    if (footer) interactive.footer = { text: footer };

    return this.sendDirectMessage(phoneNumberId, accessToken, to, {
      type: 'interactive',
      interactive,
    });
  }

  /**
   * Send a single product from the catalog.
   */
  async sendProductMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    catalogId: string,
    productRetailerId: string,
    bodyText?: string,
    footer?: string,
  ): Promise<any> {
    const interactive: any = {
      type: 'product',
      body: bodyText ? { text: bodyText } : undefined,
      action: {
        catalog_id: catalogId,
        product_retailer_id: productRetailerId,
      },
    };

    if (footer) interactive.footer = { text: footer };

    return this.sendDirectMessage(phoneNumberId, accessToken, to, {
      type: 'interactive',
      interactive,
    });
  }

  /**
   * Send multiple products from the catalog (up to 30 items across sections).
   */
  async sendMultiProductMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    catalogId: string,
    sections: Array<{
      title: string;
      product_items: Array<{ product_retailer_id: string }>;
    }>,
    headerText: string,
    bodyText: string,
    footer?: string,
  ): Promise<any> {
    const interactive: any = {
      type: 'product_list',
      header: { type: 'text', text: headerText },
      body: { text: bodyText },
      action: {
        catalog_id: catalogId,
        sections,
      },
    };

    if (footer) interactive.footer = { text: footer };

    return this.sendDirectMessage(phoneNumberId, accessToken, to, {
      type: 'interactive',
      interactive,
    });
  }

  /**
   * Send an order status update message to a customer.
   */
  async sendOrderStatusMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    orderNumber: string,
    status: string,
    details?: string,
  ): Promise<any> {
    const statusEmoji: Record<string, string> = {
      confirmed: '✅',
      processing: '🔄',
      shipped: '🚚',
      delivered: '📦',
      cancelled: '❌',
    };
    const emoji = statusEmoji[status] || '📋';
    const text = `${emoji} *Order Update*\n\nOrder: *${orderNumber}*\nStatus: *${status.replace(/_/g, ' ').toUpperCase()}*${details ? `\n\n${details}` : ''}`;

    return this.sendTextMessage(phoneNumberId, accessToken, to, text);
  }

  async getMediaUrl(mediaId: string, accessToken: string): Promise<string> {
    return this.metaApiBreaker.execute(async () => {
      const url = `${this.apiUrl}/${this.apiVersion}/${mediaId}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) throw new Error('Failed to get media URL');
      const data = await response.json() as any;
      return data.url;
    });
  }

  async downloadMedia(mediaUrl: string, accessToken: string): Promise<Buffer> {
    return this.metaApiBreaker.execute(async () => {
      const response = await fetch(mediaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) throw new Error('Failed to download media');
      return Buffer.from(await response.arrayBuffer());
    });
  }
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly classification: MetaApiErrorClassification,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}
