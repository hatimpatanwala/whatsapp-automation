import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

export type NotifType = 'order' | 'payment' | 'invoice' | 'quote' | 'customer' | 'low_stock' | 'purchase';

const DEFAULT_PREFS: Record<string, boolean> = {
  order: true, payment: true, invoice: true, quote: true, customer: true, low_stock: true, purchase: true,
};

/**
 * Push notifications to the tenant's registered app devices (admin / salesman /
 * employee phones running the Capacitor app). Called from AdminFeedService so
 * every feed event — new order, payment, invoice, low stock, … — also pushes,
 * subject to the tenant's per-type preferences.
 *
 * Delivery uses FCM (Android + iOS via Firebase) when `FCM_SERVER_KEY` is set;
 * otherwise it logs what WOULD be sent, so the whole pipeline runs and is
 * testable before Firebase credentials are added. See frontend/MOBILE.md.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly config: ConfigService,
  ) {}

  // ─── Device registration ─────────────────────────────────────────────────────
  async registerDevice(schema: string, userId: string | null, body: { token: string; platform?: string; appVariant?: string }): Promise<{ ok: boolean }> {
    if (!body?.token) return { ok: false };
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".device_tokens (user_id, token, platform, app_variant, last_seen_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
           app_variant = EXCLUDED.app_variant, last_seen_at = NOW()`,
        [userId, body.token, body.platform || null, body.appVariant || null],
      ),
    ).catch((e) => this.logger.warn(`registerDevice failed: ${e?.message}`));
    return { ok: true };
  }

  async unregisterDevice(schema: string, token: string): Promise<{ ok: boolean }> {
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`DELETE FROM "${schema}".device_tokens WHERE token = $1`, [token]),
    ).catch(() => undefined);
    return { ok: true };
  }

  // ─── Preferences ──────────────────────────────────────────────────────────────
  async getPrefs(schema: string): Promise<Record<string, boolean>> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = (await qr.query(`SELECT value FROM "${schema}".settings WHERE key = 'notification_prefs'`))[0];
      const v = row?.value ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : {};
      return { ...DEFAULT_PREFS, ...v };
    }).catch(() => ({ ...DEFAULT_PREFS }));
  }

  async setPrefs(schema: string, prefs: Record<string, boolean>): Promise<Record<string, boolean>> {
    const clean: Record<string, boolean> = {};
    for (const k of Object.keys(DEFAULT_PREFS)) clean[k] = prefs?.[k] !== false;
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".settings (key, value, updated_at) VALUES ('notification_prefs', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(clean)],
      ),
    );
    return clean;
  }

  // ─── Send ─────────────────────────────────────────────────────────────────────
  /** Push a notification to every registered device for the tenant (pref-gated). */
  async pushToTenant(schema: string, n: { type: NotifType | string; title: string; body?: string; route?: string; entityId?: string }): Promise<void> {
    try {
      const prefs = await this.getPrefs(schema);
      if (n.type && prefs[n.type] === false) return; // type muted by the tenant

      const tokens: string[] = await this.cm.executeInTenantContext(schema, async (qr) =>
        (await qr.query(`SELECT token FROM "${schema}".device_tokens`)).map((r: any) => r.token),
      );
      if (!tokens.length) return;

      const serverKey = this.config.get<string>('FCM_SERVER_KEY');
      if (!serverKey) {
        this.logger.log(`[push] (no FCM_SERVER_KEY) would notify ${tokens.length} device(s): "${n.title}"${n.route ? ' → ' + n.route : ''}`);
        return;
      }
      await this.sendFcm(serverKey, tokens, n);
    } catch (e: any) {
      this.logger.warn(`pushToTenant failed: ${e?.message}`);
    }
  }

  private async sendFcm(serverKey: string, tokens: string[], n: { title: string; body?: string; route?: string; type?: string; entityId?: string }): Promise<void> {
    // Legacy FCM HTTP API — batches of up to 1000 tokens.
    for (let i = 0; i < tokens.length; i += 1000) {
      const batch = tokens.slice(i, i + 1000);
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: { Authorization: `key=${serverKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_ids: batch,
          notification: { title: n.title, body: n.body || '', sound: 'default' },
          data: { route: n.route || '', type: n.type || '', entityId: n.entityId || '' },
          priority: 'high',
        }),
      });
      if (!res.ok) this.logger.warn(`[push] FCM responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }
}
