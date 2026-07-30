import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

/**
 * Web-push (browser notifications) for the field-sales app. Env-gated: does
 * nothing useful until WEBPUSH_PUBLIC_KEY / WEBPUSH_PRIVATE_KEY are set (generate
 * a pair with `npx web-push generate-vapid-keys`). Subscriptions are stored
 * per-tenant, keyed by the logged-in user; a dead endpoint (410/404) is pruned.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey = process.env.WEBPUSH_PUBLIC_KEY || '';
  private readonly privateKey = process.env.WEBPUSH_PRIVATE_KEY || '';
  private readonly subject = process.env.WEBPUSH_SUBJECT || 'mailto:support@whatsappdemo.duckdns.org';

  constructor(private readonly cm: TenantConnectionManager) {
    if (this.configured()) {
      try { webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey); }
      catch (e: any) { this.logger.warn(`Invalid VAPID config: ${e.message}`); }
    }
  }

  configured(): boolean { return !!(this.publicKey && this.privateKey); }
  getPublicKey(): string { return this.publicKey; }

  /** Store (or refresh) a browser push subscription for a user. */
  async saveSubscription(schema: string, userId: string, sub: any, userAgent?: string) {
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) return { saved: false, reason: 'Invalid subscription' };
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, last_used_at = NOW()`,
        [userId, endpoint, p256dh, auth, userAgent || null],
      ));
    return { saved: true, enabled: this.configured() };
  }

  async removeSubscription(schema: string, endpoint: string) {
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`DELETE FROM "${schema}".push_subscriptions WHERE endpoint = $1`, [endpoint]));
    return { removed: true };
  }

  /** Fire a notification to every device a user has registered. Best-effort. */
  async sendToUser(schema: string, userId: string, payload: { title: string; body: string; url?: string; tag?: string }) {
    if (!this.configured() || !userId) return { sent: 0 };
    const subs = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT id, endpoint, p256dh, auth FROM "${schema}".push_subscriptions WHERE user_id = $1`, [userId]));
    const body = JSON.stringify(payload);
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await this.removeSubscription(schema, s.endpoint).catch(() => {});
        } else {
          this.logger.warn(`Push failed for ${s.id}: ${e?.message}`);
        }
      }
    }
    return { sent };
  }
}
