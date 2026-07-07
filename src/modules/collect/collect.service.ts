import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { ErpInvoiceService } from '../erp/invoicing/erp-invoice.service';
import {
  CollectionHandle, manualCollection, parseRazorpayEvent, razorpayPaymentLink,
  razorpayRefund, razorpayVirtualAccount, verifyRazorpaySignature,
} from './providers';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Payments & Collections (PAYMENTS_MODULE_README):
 *   Mode A — merchant's own UPI/bank; dynamic upi:// QR per invoice; customer pays
 *            out-of-band; admin confirms from the pending queue.
 *   Mode B — Razorpay Smart Collect virtual UPI per invoice; webhook auto-confirms.
 *   Mode C — Razorpay payment link; webhook auto-confirms.
 * A collection reaches CONFIRMED only via admin action (A) or a signature-verified
 * webhook (B/C); confirmation is idempotent and feeds the existing invoice
 * recordPayment (ledger receipt voucher + WhatsApp receipt downstream).
 */
@Injectable()
export class CollectService {
  private readonly logger = new Logger(CollectService.name);
  private readonly encKey: Buffer;

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly invoices: ErpInvoiceService,
    config: ConfigService,
  ) {
    this.encKey = createHash('sha256').update(config.get<string>('TOKEN_ENCRYPTION_KEY') || 'dev-only').digest();
  }

  // ─── Per-tenant credential storage (encrypted at rest, settings table) ───────
  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
  }
  private decrypt(stored: string): string {
    const [iv, tag, data] = stored.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
  }

  private async getSetting(qr: any, schema: string, key: string): Promise<string | null> {
    const r = await qr.query(`SELECT value FROM "${schema}".settings WHERE key = $1`, [key]);
    if (!r[0]) return null;
    try { return JSON.parse(r[0].value); } catch { return r[0].value; }
  }
  private async setSetting(qr: any, schema: string, key: string, value: string): Promise<void> {
    await qr.query(
      `INSERT INTO "${schema}".settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)],
    );
  }

  async getConfig(schema: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const mode = (await this.getSetting(qr, schema, 'pay_mode')) || 'A';
      const keyId = (await this.getSetting(qr, schema, 'pay_key_id')) || '';
      const hasSecret = !!(await this.getSetting(qr, schema, 'pay_key_secret'));
      const hasWebhook = !!(await this.getSetting(qr, schema, 'pay_webhook_secret'));
      return { mode, provider: mode === 'A' ? 'manual' : 'razorpay', keyId, hasSecret, hasWebhook };
    });
  }

  async setConfig(schema: string, body: { mode?: string; keyId?: string; keySecret?: string; webhookSecret?: string }) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      if (body.mode && ['A', 'B', 'C'].includes(body.mode)) await this.setSetting(qr, schema, 'pay_mode', body.mode);
      if (body.keyId !== undefined) await this.setSetting(qr, schema, 'pay_key_id', body.keyId.trim());
      // Secrets: encrypted at rest, never echoed back.
      if (body.keySecret) await this.setSetting(qr, schema, 'pay_key_secret', this.encrypt(body.keySecret.trim()));
      if (body.webhookSecret) await this.setSetting(qr, schema, 'pay_webhook_secret', this.encrypt(body.webhookSecret.trim()));
      return { saved: true };
    });
  }

  private async creds(qr: any, schema: string) {
    const keyId = (await this.getSetting(qr, schema, 'pay_key_id')) || '';
    const secEnc = await this.getSetting(qr, schema, 'pay_key_secret');
    const whEnc = await this.getSetting(qr, schema, 'pay_webhook_secret');
    return {
      keyId,
      keySecret: secEnc ? this.decrypt(secEnc) : '',
      webhookSecret: whEnc ? this.decrypt(whEnc) : '',
    };
  }

  // ─── Collection methods (Mode A setup) ──────────────────────────────────────
  listMethods(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT * FROM "${schema}".payment_methods ORDER BY is_default DESC, created_at`),
    );
  }

  async addMethod(schema: string, m: any) {
    if (!['upi', 'bank', 'qr'].includes(m?.type)) throw new BadRequestException('type must be upi | bank | qr');
    if (m.type === 'upi' && !m.vpa?.trim()) throw new BadRequestException('UPI method needs a VPA');
    if (m.type === 'bank' && !(m.accountNo?.trim() && m.ifsc?.trim())) throw new BadRequestException('Bank method needs account no + IFSC');
    return this.cm.executeInTransaction(schema, async (qr) => {
      if (m.isDefault) await qr.query(`UPDATE "${schema}".payment_methods SET is_default = false`);
      const rows = await qr.query(
        `INSERT INTO "${schema}".payment_methods (type, label, vpa, holder_name, bank_name, account_no, ifsc, qr_asset, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [m.type, m.label?.trim() || null, m.vpa?.trim() || null, m.holderName?.trim() || null,
         m.bankName?.trim() || null, m.accountNo?.trim() || null, m.ifsc?.trim().toUpperCase() || null,
         m.qrAsset?.trim() || null, !!m.isDefault],
      );
      return { id: rows[0].id };
    });
  }

  async updateMethod(schema: string, id: string, m: any) {
    return this.cm.executeInTransaction(schema, async (qr) => {
      if (m.isDefault) await qr.query(`UPDATE "${schema}".payment_methods SET is_default = false`);
      await qr.query(
        `UPDATE "${schema}".payment_methods SET
           label = COALESCE($2, label), is_active = COALESCE($3, is_active), is_default = COALESCE($4, is_default)
         WHERE id = $1`,
        [id, m.label ?? null, m.isActive ?? null, m.isDefault ?? null],
      );
      return { id };
    });
  }

  // ─── Create a collection for an invoice ─────────────────────────────────────
  async createForInvoice(schema: string, invoiceId: string) {
    return this.cm.executeInTransaction(schema, async (qr) => {
      const inv = (await qr.query(
        `SELECT id, invoice_number, customer_id, customer_name, customer_phone, balance_due, total
         FROM "${schema}".invoices WHERE id = $1`, [invoiceId],
      ))[0];
      if (!inv) throw new NotFoundException('Invoice not found');
      const amount = round2(Number(inv.balance_due) || Number(inv.total) || 0);
      if (amount <= 0) throw new BadRequestException('Nothing due on this invoice');

      // reference_id: THE join key across message ↔ gateway ↔ webhook ↔ ledger (§7).
      const referenceId = String(inv.invoice_number).slice(0, 60);
      const existing = (await qr.query(
        `SELECT * FROM "${schema}".payment_collections WHERE reference_id = $1`, [referenceId],
      ))[0];
      if (existing && existing.status === 'CONFIRMED') throw new BadRequestException(`${referenceId} is already collected`);

      const mode = ((await this.getSetting(qr, schema, 'pay_mode')) || 'A') as 'A' | 'B' | 'C';
      let handle: CollectionHandle;
      if (mode === 'C') {
        handle = await razorpayPaymentLink(await this.creds(qr, schema), amount, referenceId,
          `Invoice ${referenceId}`, { name: inv.customer_name, contact: inv.customer_phone });
      } else if (mode === 'B') {
        handle = await razorpayVirtualAccount(await this.creds(qr, schema), referenceId, `Invoice ${referenceId}`);
      } else {
        const def = (await qr.query(
          `SELECT * FROM "${schema}".payment_methods WHERE is_active = true ORDER BY is_default DESC, created_at LIMIT 1`,
        ))[0];
        if (!def?.vpa) {
          // Bank-only merchants still get a collection record; the UI shows bank details.
          handle = { provider: 'manual' };
        } else {
          handle = manualCollection(def.vpa, def.holder_name || def.label || 'Merchant', amount, referenceId);
        }
      }

      const row = existing
        ? (await qr.query(
            `UPDATE "${schema}".payment_collections SET amount = $2, mode = $3, provider = $4,
               provider_ref = $5, virtual_upi_id = $6, pay_link = $7, status = 'PENDING'
             WHERE id = $1 RETURNING *`,
            [existing.id, amount, mode, handle.provider, handle.providerRef ?? null,
             handle.virtualUpiId ?? null, handle.payLink ?? null],
          ))[0]
        : (await qr.query(
            `INSERT INTO "${schema}".payment_collections
               (invoice_id, customer_id, amount, mode, provider, provider_ref, reference_id, virtual_upi_id, pay_link)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [inv.id, inv.customer_id, amount, mode, handle.provider, handle.providerRef ?? null,
             referenceId, handle.virtualUpiId ?? null, handle.payLink ?? null],
          ))[0];

      // Dynamic UPI QR (data-URL) so the operator can show/print/send it right away.
      const intent = handle.upiIntent
        || (handle.virtualUpiId
          ? manualCollection(handle.virtualUpiId, 'Merchant', amount, referenceId).upiIntent
          : null);
      const qrDataUrl = intent ? await QRCode.toDataURL(intent, { margin: 1, width: 260 }) : null;

      const methods = await qr.query(
        `SELECT type, label, vpa, holder_name, bank_name, account_no, ifsc FROM "${schema}".payment_methods WHERE is_active = true ORDER BY is_default DESC`,
      );
      return { ...row, upiIntent: intent, qrDataUrl, methods };
    });
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  /** Customer/operator says "paid" — a CLAIM, not proof (§10.1). */
  async claim(schema: string, id: string, note?: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `UPDATE "${schema}".payment_collections SET status = 'CLAIMED', claim_note = COALESCE($2, claim_note)
         WHERE id = $1 AND status IN ('PENDING','CLAIMED') RETURNING id, reference_id`,
        [id, note?.trim() || null],
      );
      if (!rows[0]) throw new NotFoundException('Collection not found or already settled');
      await qr.query(
        `INSERT INTO "${schema}".payment_event_log (collection_id, event_type, source, payload_json)
         VALUES ($1, 'claimed', 'customer', $2::jsonb)`,
        [id, JSON.stringify({ note: note || null })],
      );
      return { id, status: 'CLAIMED' };
    });
  }

  /**
   * Mode-A manual confirm ("Payment Received") or system confirm via webhook.
   * Idempotent; feeds the existing invoice payment flow (ledger + receipt voucher).
   */
  async confirm(schema: string, id: string, by: string, source: 'admin' | 'webhook' = 'admin', raw?: any) {
    const c = await this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `UPDATE "${schema}".payment_collections
         SET status = 'CONFIRMED', confirmed_by = $2, confirmed_at = NOW(), raw_event_json = COALESCE($3::jsonb, raw_event_json)
         WHERE id = $1 AND status NOT IN ('CONFIRMED','REFUNDED','PARTIALLY_REFUNDED')
         RETURNING *`,
        [id, by, raw ? JSON.stringify(raw) : null],
      );
      if (rows[0]) {
        await qr.query(
          `INSERT INTO "${schema}".payment_event_log (collection_id, event_type, source, payload_json, signature_valid)
           VALUES ($1, 'confirmed', $2, $3::jsonb, $4)`,
          [id, source, JSON.stringify({ by }), source === 'webhook'],
        );
      }
      return rows[0] || null;
    });
    if (!c) return { id, status: 'CONFIRMED', alreadyConfirmed: true }; // idempotent re-delivery

    // Downstream is identical for all modes: the existing payment flow marks the
    // invoice paid, reconciles balance and auto-posts the receipt voucher.
    if (c.invoice_id) {
      try {
        await this.invoices.recordPayment(schema, c.invoice_id, {
          amount: Number(c.amount),
          description: `Collection ${c.reference_id} (${c.provider}${c.method_used ? '/' + c.method_used : ''})`,
        } as any);
      } catch (err) {
        this.logger.warn(`recordPayment for collection ${c.id} failed: ${(err as Error).message}`);
      }
    }
    return { id: c.id, status: 'CONFIRMED' };
  }

  list(schema: string, status?: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT c.*, i.invoice_number, i.customer_name
         FROM "${schema}".payment_collections c
         LEFT JOIN "${schema}".invoices i ON i.id = c.invoice_id
         ${status ? `WHERE c.status = ANY(string_to_array($1, ','))` : ''}
         ORDER BY c.created_at DESC LIMIT 200`,
        status ? [status] : [],
      ),
    );
  }

  /** Reconciliation view: signature-valid credits that did not auto-match (§9.2). */
  unmatched(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT * FROM "${schema}".payment_event_log
         WHERE event_type = 'unmatched' ORDER BY received_at DESC LIMIT 100`,
      ),
    );
  }

  async refund(schema: string, collectionId: string, amount: number, reason: string, by: string) {
    return this.cm.executeInTransaction(schema, async (qr) => {
      const c = (await qr.query(`SELECT * FROM "${schema}".payment_collections WHERE id = $1`, [collectionId]))[0];
      if (!c) throw new NotFoundException('Collection not found');
      if (c.status !== 'CONFIRMED' && c.status !== 'PARTIALLY_REFUNDED') throw new BadRequestException('Only confirmed collections can be refunded');
      const amt = round2(Number(amount) || 0);
      if (amt <= 0 || amt > Number(c.amount)) throw new BadRequestException('Invalid refund amount');

      // Server-initiated only (§10.1). Gateway refund when a provider payment exists;
      // manual collections just record the refund for the books.
      let providerRef: string | null = null;
      if (c.provider !== 'manual' && c.provider_ref?.startsWith('pay_')) {
        providerRef = await razorpayRefund(await this.creds(qr, schema), c.provider_ref, amt);
      }
      const r = (await qr.query(
        `INSERT INTO "${schema}".payment_refunds (collection_id, amount, provider_ref, reason, created_by, status)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [collectionId, amt, providerRef, reason?.trim() || null, by, providerRef ? 'processed' : 'recorded'],
      ))[0];
      const newStatus = amt >= Number(c.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      await qr.query(`UPDATE "${schema}".payment_collections SET status = $2 WHERE id = $1`, [collectionId, newStatus]);
      return { id: r.id, providerRef, status: newStatus, note: 'UPI refunds typically reach the customer in 3–5 days' };
    });
  }

  // ─── Webhook (Modes B/C) — signature-verified, idempotent, amount-checked ───
  async webhook(schema: string, rawBody: string, signature: string) {
    return this.cm.executeInTransaction(schema, async (qr) => {
      const creds = await this.creds(qr, schema);
      const valid = verifyRazorpaySignature(rawBody, signature, creds.webhookSecret);
      let payload: any;
      try { payload = JSON.parse(rawBody); } catch { throw new BadRequestException('Invalid JSON'); }
      const ev = parseRazorpayEvent(payload);
      if (!ev) return { ok: true, ignored: true };

      if (!valid) {
        await qr.query(
          `INSERT INTO "${schema}".payment_event_log (event_type, source, provider_event_id, payload_json, signature_valid)
           VALUES ($1, 'webhook', $2, $3::jsonb, false) ON CONFLICT DO NOTHING`,
          [ev.eventType, ev.providerEventId, rawBody],
        );
        throw new BadRequestException('Webhook signature mismatch');
      }

      // Idempotency: dedupe on the provider event id (§10.1).
      const logged = await qr.query(
        `INSERT INTO "${schema}".payment_event_log (event_type, source, provider_event_id, payload_json, signature_valid)
         VALUES ($1, 'webhook', $2, $3::jsonb, true)
         ON CONFLICT (provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [ev.eventType, ev.providerEventId, rawBody],
      );
      if (!logged.length) return { ok: true, duplicate: true };

      if (!ev.paid) return { ok: true };

      const c = ev.referenceId
        ? (await qr.query(`SELECT * FROM "${schema}".payment_collections WHERE reference_id = $1`, [ev.referenceId]))[0]
        : null;

      // Amount & match guard: unmatched or mismatched money goes to reconciliation,
      // never auto-confirmed (§10.2).
      if (!c || Math.abs(Number(c.amount) - (ev.amount || 0)) > 0.01) {
        await qr.query(
          `INSERT INTO "${schema}".payment_event_log (collection_id, event_type, source, provider_event_id, payload_json, signature_valid)
           VALUES ($1, 'unmatched', 'webhook', $2, $3::jsonb, true)`,
          [c?.id ?? null, `${ev.providerEventId}:unmatched`, JSON.stringify({ referenceId: ev.referenceId, amount: ev.amount, expected: c?.amount ?? null })],
        );
        return { ok: true, unmatched: true };
      }

      await qr.query(
        `UPDATE "${schema}".payment_collections SET method_used = $2, provider_ref = COALESCE($3, provider_ref) WHERE id = $1`,
        [c.id, ev.method || null, ev.providerRef || null],
      );
      return { collectionId: c.id, payload };
    }).then(async (r: any) => {
      if (r?.collectionId) return this.confirm(schema, r.collectionId, 'system', 'webhook', r.payload);
      return r;
    });
  }
}
