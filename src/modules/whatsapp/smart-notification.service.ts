import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { QUEUE_NOTIFICATION_FLUSH } from '../../queue/queue.module';
import { MessageOrchestratorService } from './message-orchestrator.service';
import { MetaTokenService } from '../waba/meta-token.service';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';

export type NotifyAudience = 'customer' | 'admin';
export type NotifyChannel = 'utility' | 'marketing';

export interface NotifyInput {
  tenantId: string;
  schema: string;
  /** Optional — resolved from the tenant's WABA if omitted. */
  phoneNumberId?: string;
  accessToken?: string;
  recipientPhone: string;
  audience: NotifyAudience;
  channel: NotifyChannel;
  /** Short one-line summary used when consolidating multiple notifications. */
  summary: string;
  /** Full message sent free-form when the service window is open. Defaults to summary. */
  detail?: string;
  recipientName?: string;
  /** Bypass batching — send immediately (uses urgentTemplate when window closed). */
  urgent?: boolean;
  urgentTemplate?: { name: string; language?: string; components?: any[] };
  /**
   * Deliver ONLY inside an open service window (free-form). If the window is
   * closed, hold the message and deliver it the next time the recipient messages
   * — never send a template. Used for non-urgent nudges like abandoned carts.
   */
  windowOnly?: boolean;
}

interface PendingItem {
  tenantId: string;
  schema: string;
  phoneNumberId: string;
  accessToken: string;
  audience: NotifyAudience;
  channel: NotifyChannel;
  summary: string;
  detail: string;
  recipientName?: string;
  createdAt: number;
}

const AWAIT_TTL_SEC = 48 * 60 * 60; // post-teaser content waits up to 48h for a tap
const PEND_TTL_SEC = 6 * 60 * 60;

/**
 * Smart, cost-efficient WhatsApp notifications for customers and admins.
 *
 * Strategy (per recipient):
 *  - Service window OPEN  → send the message free-form immediately (FREE).
 *  - Service window CLOSED → buffer it and schedule a single batch flush
 *    (default 1h). At flush: if the window has since opened, send everything
 *    free-form; otherwise send ONE teaser template ("you have N updates / we
 *    have offers for you — tap to view"). When the recipient taps it (or sends
 *    any message), the window opens and onInbound() flushes the real content
 *    free-form. This collapses many paid template sends into one.
 */
@Injectable()
export class SmartNotificationService {
  private readonly logger = new Logger(SmartNotificationService.name);
  private readonly batchMs: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly orchestrator: MessageOrchestratorService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NOTIFICATION_FLUSH) private readonly flushQueue: Queue,
    @Optional() private readonly metaTokenService: MetaTokenService,
    @Optional() @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @Optional() @InjectRepository(WabaAccount) private readonly wabaRepo: Repository<WabaAccount>,
    @Optional() @InjectRepository(PhoneNumber) private readonly phoneRepo: Repository<PhoneNumber>,
    @Optional() private readonly connectionManager: TenantConnectionManager,
  ) {
    this.batchMs = Math.max(1, this.config.get<number>('NOTIFICATION_BATCH_MINUTES', 60)) * 60 * 1000;
  }

  private readonly batchCache = new Map<string, { ms: number; exp: number }>();

  /** Per-tenant batch window (minutes), from the notification_batch_minutes setting. */
  private async getBatchMs(schema: string): Promise<number> {
    const cached = this.batchCache.get(schema);
    if (cached && cached.exp > Date.now()) return cached.ms;
    let ms = this.batchMs;
    if (this.connectionManager) {
      try {
        const rows = await this.connectionManager.executeInTenantContext(schema, (qr) =>
          qr.query(`SELECT value FROM settings WHERE key = 'notification_batch_minutes'`));
        if (rows[0]?.value !== undefined) {
          const n = parseInt(typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value, 10);
          if (!Number.isNaN(n) && n > 0) ms = n * 60 * 1000;
        }
      } catch { /* use default */ }
    }
    this.batchCache.set(schema, { ms, exp: Date.now() + 5 * 60 * 1000 });
    return ms;
  }

  /** Resolve the tenant's sender phone-number-id + a live access token. */
  private async resolveCreds(tenantId: string): Promise<{ phoneNumberId: string; accessToken: string } | null> {
    if (!this.tenantRepo || !this.wabaRepo) return null;
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) return null;
    let waba: WabaAccount | null = null;
    if (tenant.wabaId) waba = await this.wabaRepo.findOne({ where: { wabaId: tenant.wabaId } });
    if (!waba) waba = await this.wabaRepo.findOne({ where: { status: 'active' }, order: { createdAt: 'ASC' } });
    if (!waba) return null;
    let accessToken = tenant.accessToken || '';
    if (!accessToken && this.metaTokenService) {
      accessToken = await this.metaTokenService.getActiveToken(waba.id).catch(() => '');
    }
    let phoneNumberId = tenant.phoneNumberId || '';
    if (!phoneNumberId && this.phoneRepo) {
      const phone = await this.phoneRepo.findOne({ where: { wabaAccountId: waba.id, status: 'active' }, order: { createdAt: 'ASC' } });
      phoneNumberId = phone?.phoneNumberId || '';
    }
    if (!phoneNumberId || !accessToken) return null;
    return { phoneNumberId, accessToken };
  }

  private pendKey(schema: string, phone: string, channel: NotifyChannel) {
    return `notif:pend:${schema}:${phone}:${channel}`;
  }
  private awaitKey(schema: string, phone: string) {
    return `notif:await:${schema}:${phone}`;
  }

  /** Entry point: route a notification through the smart pipeline. */
  async notify(input: NotifyInput): Promise<void> {
    const detail = input.detail || input.summary;

    let phoneNumberId = input.phoneNumberId || '';
    let accessToken = input.accessToken || '';
    if (!phoneNumberId || !accessToken) {
      const creds = await this.resolveCreds(input.tenantId);
      if (!creds) { this.logger.warn(`notify: no send creds for tenant ${input.tenantId}`); return; }
      phoneNumberId = creds.phoneNumberId;
      accessToken = creds.accessToken;
    }

    const item: PendingItem = {
      tenantId: input.tenantId, schema: input.schema, phoneNumberId,
      accessToken, audience: input.audience, channel: input.channel,
      summary: input.summary, detail, recipientName: input.recipientName, createdAt: Date.now(),
    };

    try {
      const windowOpen = await this.orchestrator.hasActiveServiceWindow(input.tenantId, input.recipientPhone);
      if (windowOpen) {
        await this.orchestrator.sendText(input.tenantId, phoneNumberId, accessToken, input.recipientPhone, detail, 'service');
        return;
      }

      if (input.windowOnly) {
        // Out of window + window-only → never send a template. Hold it and let
        // the webhook onInbound() flush it free-form when the recipient returns.
        const awaitKey = this.awaitKey(input.schema, input.recipientPhone);
        await this.redis.rpush(awaitKey, JSON.stringify(item));
        await this.redis.expire(awaitKey, AWAIT_TTL_SEC);
        return;
      }

      if (input.urgent) {
        // Time-critical and out of window → send its specific template now.
        if (input.urgentTemplate) {
          await this.orchestrator.sendTemplate(
            input.tenantId, phoneNumberId, accessToken, input.recipientPhone,
            input.urgentTemplate.name, input.urgentTemplate.language || 'en', input.urgentTemplate.components, input.channel,
          );
        }
        return;
      }

      // Out of window, non-urgent → buffer + schedule a single batch flush.
      const key = this.pendKey(input.schema, input.recipientPhone, input.channel);
      await this.redis.rpush(key, JSON.stringify(item));
      await this.redis.expire(key, PEND_TTL_SEC);
      const delay = await this.getBatchMs(input.schema);
      await this.flushQueue.add(
        'flush',
        { schema: input.schema, phone: input.recipientPhone, channel: input.channel },
        { jobId: `nflush:${input.schema}:${input.recipientPhone}:${input.channel}`, delay, removeOnComplete: true, removeOnFail: true },
      );
    } catch (err: any) {
      this.logger.warn(`notify failed for ${input.recipientPhone}: ${err.message}`);
    }
  }

  /** Batch flush (called by the delayed queue worker). */
  async flush(schema: string, phone: string, channel: NotifyChannel): Promise<void> {
    const items = await this.drain(this.pendKey(schema, phone, channel));
    if (!items.length) return;
    const first = items[0];

    const windowOpen = await this.orchestrator.hasActiveServiceWindow(first.tenantId, phone);
    if (windowOpen) {
      await this.orchestrator.sendText(first.tenantId, first.phoneNumberId, first.accessToken, phone, this.consolidate(items), 'service');
      return;
    }

    // Still closed → stash the real content and send a single teaser template.
    const awaitKey = this.awaitKey(schema, phone);
    for (const it of items) await this.redis.rpush(awaitKey, JSON.stringify(it));
    await this.redis.expire(awaitKey, AWAIT_TTL_SEC);

    const total = await this.redis.llen(awaitKey);
    await this.sendTeaser(first, phone, channel, total);
  }

  /** Called from the webhook on every inbound message (the service window just opened). */
  async onInbound(schema: string, phone: string): Promise<void> {
    try {
      const items = [
        ...(await this.drain(this.awaitKey(schema, phone))),
        ...(await this.drain(this.pendKey(schema, phone, 'utility'))),
        ...(await this.drain(this.pendKey(schema, phone, 'marketing'))),
      ];
      if (!items.length) return;
      const first = items[0];
      await this.orchestrator.sendText(first.tenantId, first.phoneNumberId, first.accessToken, phone, this.consolidate(items), 'service');
    } catch (err: any) {
      this.logger.warn(`onInbound flush failed for ${phone}: ${err.message}`);
    }
  }

  private async drain(key: string): Promise<PendingItem[]> {
    const raw = await this.redis.lrange(key, 0, -1);
    if (!raw.length) return [];
    await this.redis.del(key);
    return raw.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean) as PendingItem[];
  }

  private consolidate(items: PendingItem[]): string {
    if (items.length === 1) return items[0].detail;
    const audience = items[0].audience;
    const header = audience === 'admin' ? '🔔 *Store updates*' : '🔔 *Here are your updates*';
    const lines = items.map((it, i) => `${i + 1}. ${it.summary}`).join('\n');
    return `${header}\n\n${lines}`;
  }

  private async sendTeaser(item: PendingItem, phone: string, channel: NotifyChannel, count: number): Promise<void> {
    const isAdmin = item.audience === 'admin';
    let name: string;
    let components: any[];
    if (channel === 'marketing' && !isAdmin) {
      name = 'customer_offers_teaser';
      components = [{ type: 'body', parameters: [{ type: 'text', text: item.recipientName || 'there' }, { type: 'text', text: String(count) }] }];
    } else if (isAdmin) {
      name = 'admin_updates_teaser';
      components = [{ type: 'body', parameters: [{ type: 'text', text: String(count) }] }];
    } else {
      name = 'customer_updates_teaser';
      components = [{ type: 'body', parameters: [{ type: 'text', text: item.recipientName || 'there' }, { type: 'text', text: String(count) }] }];
    }

    await this.orchestrator.sendTemplate(
      item.tenantId, item.phoneNumberId, item.accessToken, phone, name, 'en', components, channel,
    );
  }
}
