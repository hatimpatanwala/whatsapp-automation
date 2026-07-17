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
import { UpdatesService } from '../updates/updates.service';
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
  /** Update category for the My-Updates inbox tabs (order|invoice|payment|quote|reminder|marketing|delivery). */
  updateType?: string;
  /** Customer id, if known — lets the inbox link updates to a specific customer. */
  customerId?: string | null;
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
  /**
   * Interactive quick-reply buttons. When the window is open these are sent as
   * an interactive message; tapping a button (its title) triggers the matching
   * workflow. Titles should align with workflow keywords (e.g. "Track Order").
   */
  buttons?: { id: string; title: string }[];
  /**
   * A single CTA-URL button (opens a link, e.g. the storefront cart) sent when
   * the window is open. Takes precedence over `buttons` — WhatsApp can't combine
   * a CTA-URL with quick-reply buttons.
   */
  ctaUrl?: { url: string; label: string };
  /**
   * The specific UTILITY template to send when the window is CLOSED (e.g. an
   * order/payment status update). Its own quick-reply button opens the window so
   * the customer can continue. Marketing notifications omit this and use a teaser.
   */
  template?: { name: string; params?: string[]; language?: string };
  /**
   * The real MARKETING template to send when the window is closed AND the tenant
   * has chosen "full marketing template" mode (marketing_template_mode=template).
   * Otherwise the cost-efficient utility door-opener is used.
   */
  marketingTemplate?: { name: string; params?: string[]; language?: string };
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
  buttons?: { id: string; title: string }[];
  ctaUrl?: { url: string; label: string };
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
    private readonly updates: UpdatesService,
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

  private readonly mktModeCache = new Map<string, { mode: string; exp: number }>();

  /** 'efficient' (door-opener, default) or 'template' (full marketing template). */
  private async getMarketingMode(schema: string): Promise<string> {
    const cached = this.mktModeCache.get(schema);
    if (cached && cached.exp > Date.now()) return cached.mode;
    let mode = 'efficient';
    if (this.connectionManager) {
      try {
        const rows = await this.connectionManager.executeInTenantContext(schema, (qr) =>
          qr.query(`SELECT value FROM settings WHERE key = 'marketing_template_mode'`));
        if (rows[0]?.value !== undefined) {
          const v = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
          if (v === 'template' || v === 'efficient') mode = v;
        }
      } catch { /* default */ }
    }
    this.mktModeCache.set(schema, { mode, exp: Date.now() + 5 * 60 * 1000 });
    return mode;
  }

  /** Public wrapper for callers that need the tenant's WhatsApp sender creds. */
  async getCreds(tenantId: string): Promise<{ phoneNumberId: string; accessToken: string } | null> {
    return this.resolveCreds(tenantId);
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

  private awaitKey(schema: string, phone: string) {
    return `notif:await:${schema}:${phone}`;
  }
  private doorKey(schema: string, phone: string) {
    return `notif:door:${schema}:${phone}`;
  }

  /**
   * Entry point (single-ping / My-Updates model). Every notification is RECORDED in
   * the recipient's inbox; the WhatsApp message is at most ONE "you have updates —
   * tap to view" ping per unviewed episode, linking to the /m/updates webview. All
   * the detail lives (free) in the webview, so we never send multiple paid messages
   * for a burst of events. Since a free service window can no longer be assumed, the
   * ping is charged either way — so we send exactly one and let the rest accumulate.
   */
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

    try {
      // 1) Always record the update in the inbox (this is the source of truth).
      await this.updates.record({
        schema: input.schema, audience: input.audience, recipientPhone: input.recipientPhone,
        customerId: input.customerId, type: input.updateType || 'update',
        title: input.summary, body: detail, link: input.ctaUrl?.url,
      });

      // windowOnly nudges (legacy abandoned-cart) never ping — they just sit in the inbox.
      if (input.windowOnly) return;

      // 2) Send at most ONE ping per unviewed episode. A burst of events → one ping.
      if (!(await this.updates.shouldPing(input.schema, input.recipientPhone))) return;

      await this.sendUpdatesPing(input, phoneNumberId, accessToken);
    } catch (err: any) {
      this.logger.warn(`notify failed for ${input.recipientPhone}: ${err.message}`);
    }
  }

  /**
   * Send the single "you have updates — tap to view" ping into the My-Updates webview.
   * Inside an open window it's a free-form CTA-URL (one tap → webview). If the window
   * is closed we fall back to the approved utility teaser template (one charged
   * message); onInbound() then delivers the webview link when the recipient replies.
   */
  private async sendUpdatesPing(input: NotifyInput, phoneNumberId: string, accessToken: string): Promise<void> {
    const isAdmin = input.audience === 'admin';
    const count = isAdmin
      ? await this.updates.unseenCountAdmin(input.schema)
      : await this.updates.unseenCount(input.schema, input.recipientPhone, input.customerId);
    const link = await (isAdmin
      ? this.updates.adminWebviewLink(input.tenantId, input.schema, input.recipientPhone)
      : this.updates.webviewLink(input.tenantId, input.schema, input.recipientPhone, input.customerId, input.recipientName)
    ).catch(() => '');

    const body = input.audience === 'admin'
      ? `🔔 You have ${count > 1 ? `${count} new store updates` : 'a new store update'}. Tap to view.`
      : `🔔 Hi ${input.recipientName || 'there'}, you have ${count > 1 ? `${count} new updates` : 'a new update'}. Tap to view.`;

    const windowOpen = await this.orchestrator.hasActiveServiceWindow(input.tenantId, input.recipientPhone);
    if (windowOpen && link) {
      await this.orchestrator.sendCtaUrl(
        input.tenantId, phoneNumberId, accessToken, input.recipientPhone,
        body, 'View updates', link, undefined, undefined, 'service',
      );
      return;
    }

    // Window closed → one utility teaser template (its tap opens the window; onInbound
    // then sends the webview link). This is the single charged message per episode.
    const name = isAdmin ? 'admin_updates_teaser' : 'customer_updates_teaser';
    const components = isAdmin
      ? [{ type: 'body', parameters: [{ type: 'text', text: String(count || 1) }] }]
      : [{ type: 'body', parameters: [{ type: 'text', text: input.recipientName || 'there' }, { type: 'text', text: String(count || 1) }] }];
    await this.orchestrator.sendTemplate(
      input.tenantId, phoneNumberId, accessToken, input.recipientPhone, name, 'en', components, 'utility', true,
    );
  }

  /** Door-opener decision (called by the debounced queue worker). */
  async flush(schema: string, phone: string): Promise<void> {
    const awaitK = this.awaitKey(schema, phone);
    const raw = await this.redis.lrange(awaitK, 0, -1);
    const items = raw.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean) as PendingItem[];
    if (!items.length) return;
    const first = items[0];

    const windowOpen = await this.orchestrator.hasActiveServiceWindow(first.tenantId, phone);
    if (windowOpen) {
      // Window opened in the meantime → deliver everything free-form, no template.
      await this.redis.del(awaitK);
      await this.redis.del(this.doorKey(schema, phone));
      await this.sendConsolidated(items, phone);
      return;
    }

    // Still closed → send exactly ONE utility door-opener (atomic guard). The
    // buffered content stays put until the recipient taps/opens the window.
    const reserved = await this.redis.set(this.doorKey(schema, phone), '1', 'EX', 24 * 60 * 60, 'NX');
    if (reserved !== 'OK') return;
    await this.sendDoorOpener(first, phone, items.length);
  }

  /**
   * Called from the webhook on every inbound message. If the recipient (customer OR
   * admin) has unseen updates, reply with ONE link into their My-Updates webview —
   * "if the customer/admin messages, open the webview". Resets the ping either way.
   */
  async onInbound(tenantId: string, schema: string, phone: string, audience: NotifyAudience = 'customer'): Promise<void> {
    try {
      const isAdmin = audience === 'admin';
      const count = isAdmin ? await this.updates.unseenCountAdmin(schema) : await this.updates.unseenCount(schema, phone);
      await this.updates.resetPing(schema, phone);
      if (count <= 0) return;
      // Only once per inbound episode (avoid re-sending the link on every message).
      const shownKey = `notif:shown:${schema}:${phone}`;
      if ((await this.redis.set(shownKey, '1', 'EX', 6 * 3600, 'NX')) !== 'OK') return;

      const creds = await this.resolveCreds(tenantId);
      if (!creds) return;
      const link = await (isAdmin
        ? this.updates.adminWebviewLink(tenantId, schema, phone)
        : this.updates.webviewLink(tenantId, schema, phone)
      ).catch(() => '');
      if (!link) return;
      const who = isAdmin ? 'store updates' : 'updates';
      const body = `🔔 You have ${count > 1 ? `${count} ${who}` : `a new ${isAdmin ? 'store update' : 'update'}`}. Tap to view.`;
      await this.orchestrator.sendCtaUrl(
        tenantId, creds.phoneNumberId, creds.accessToken, phone,
        body, 'View updates', link, undefined, undefined, 'service',
      );
    } catch (err: any) {
      this.logger.warn(`onInbound failed for ${phone}: ${err.message}`);
    }
  }

  /** Send the consolidated updates as an interactive message (buttons trigger workflows). */
  private async sendConsolidated(items: PendingItem[], phone: string): Promise<void> {
    const first = items[0];
    const body = this.consolidate(items);
    // A single held update with a CTA-URL (e.g. abandoned cart → open the cart).
    if (items.length === 1 && first.ctaUrl) {
      await this.orchestrator.sendCtaUrl(
        first.tenantId, first.phoneNumberId, first.accessToken, phone,
        body, first.ctaUrl.label.slice(0, 20), first.ctaUrl.url, undefined, undefined, 'service',
      );
      return;
    }
    // Single update → reuse its buttons; multiple → a generic navigation set.
    const buttons = (items.length === 1 && first.buttons?.length)
      ? first.buttons
      : (first.audience === 'admin'
        ? [{ id: 'orders', title: '📦 Orders' }, { id: 'menu', title: '🛍️ Menu' }]
        : [{ id: 'track', title: '🚚 Track Order' }, { id: 'orders', title: '📦 My Orders' }, { id: 'menu', title: '🛍️ Menu' }]);
    await this.orchestrator.sendButtons(
      first.tenantId, first.phoneNumberId, first.accessToken, phone,
      body, buttons.slice(0, 3).map((b) => ({ ...b, title: b.title.slice(0, 20) })), undefined, undefined, 'service',
    );
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

  /**
   * Send ONE utility "door-opener" template. Always utility (cheapest; a single
   * tap opens the window so the real content — including any marketing — is then
   * delivered free-form for free). forceTemplate ensures it's sent as a template
   * even though the window is closed.
   */
  private async sendDoorOpener(item: PendingItem, phone: string, count: number): Promise<void> {
    const isAdmin = item.audience === 'admin';
    const name = isAdmin ? 'admin_updates_teaser' : 'customer_updates_teaser';
    const components = isAdmin
      ? [{ type: 'body', parameters: [{ type: 'text', text: String(count) }] }]
      : [{ type: 'body', parameters: [{ type: 'text', text: item.recipientName || 'there' }, { type: 'text', text: String(count) }] }];

    await this.orchestrator.sendTemplate(
      item.tenantId, item.phoneNumberId, item.accessToken, phone, name, 'en', components, 'utility', true,
    );
  }
}
