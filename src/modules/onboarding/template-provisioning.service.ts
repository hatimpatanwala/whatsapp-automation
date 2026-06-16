import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { MetaTokenService } from '../waba/meta-token.service';

interface TemplateDefinition {
  name: string;
  category: 'AUTHENTICATION' | 'UTILITY' | 'MARKETING';
  language: string;
  components: any[];
}

export interface ProvisionResult {
  name: string;
  status: 'created' | 'already_exists' | 'failed';
  id?: string;
  error?: string;
}

export interface TemplateButtonInput {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

export interface CreateTemplateInput {
  name: string;
  category: 'AUTHENTICATION' | 'UTILITY' | 'MARKETING';
  language?: string;
  body: string;
  examples?: string[];
  footer?: string;
  header?: string;
  buttons?: TemplateButtonInput[];
}

export interface TemplateSummary {
  name: string;
  status: string; // APPROVED | PENDING | REJECTED | ...
  category: string;
  language: string;
  body: string;
  rejectedReason?: string;
}

@Injectable()
export class TemplateProvisioningService {
  private readonly logger = new Logger(TemplateProvisioningService.name);
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(WabaAccount)
    private readonly wabaAccountRepo: Repository<WabaAccount>,
    private readonly metaTokenService: MetaTokenService,
    private readonly configService: ConfigService,
  ) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  /**
   * Provision all platform message templates on the WABA.
   */
  /** Resolve the active platform WABA and its live access token. */
  private async resolveWabaToken(): Promise<{ wabaId: string; accessToken: string }> {
    const waba = await this.wabaAccountRepo.findOne({
      where: { status: 'active' },
      order: { createdAt: 'ASC' },
    });
    if (!waba) {
      throw new BadRequestException('No active WABA found. Please configure a WhatsApp Business Account first.');
    }
    const accessToken = await this.metaTokenService.getActiveToken(waba.id);
    if (!accessToken) {
      throw new BadRequestException('No active access token for the WABA.');
    }
    return { wabaId: waba.wabaId, accessToken };
  }

  /** List all message templates on the WABA with their Meta approval status. */
  async listTemplates(): Promise<TemplateSummary[]> {
    const { wabaId, accessToken } = await this.resolveWabaToken();
    const res = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/message_templates?fields=name,status,category,language,components,quality_score&limit=250`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json() as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || 'Failed to list templates');
    return (data.data || []).map((t: any) => ({
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      body: (t.components || []).find((c: any) => c.type === 'BODY')?.text || '',
      rejectedReason: t.status === 'REJECTED' ? (t.rejected_reason || 'Rejected by Meta — see WhatsApp Manager') : undefined,
    }));
  }

  /** Create a single custom template from super-admin input. */
  async createCustomTemplate(input: CreateTemplateInput): Promise<ProvisionResult> {
    const name = (input.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 512);
    if (!name) throw new BadRequestException('Template name is required.');
    if (!input.body || !input.body.trim()) throw new BadRequestException('Template body is required.');
    if (!['AUTHENTICATION', 'UTILITY', 'MARKETING'].includes(input.category)) {
      throw new BadRequestException('Category must be AUTHENTICATION, UTILITY or MARKETING.');
    }
    // Meta rejects templates whose body ends with (or starts with) a variable.
    const trimmed = input.body.trim();
    if (/\{\{\s*\d+\s*\}\}\s*$/.test(trimmed)) {
      throw new BadRequestException('Body cannot end with a variable — add some text after the last {{n}}.');
    }
    if (/^\s*\{\{\s*\d+\s*\}\}/.test(trimmed)) {
      throw new BadRequestException('Body cannot start with a variable — add some text before the first {{n}}.');
    }

    const components: any[] = [];
    if (input.header && input.header.trim()) {
      components.push({ type: 'HEADER', format: 'TEXT', text: input.header.trim() });
    }

    const varCount = (input.body.match(/\{\{\s*\d+\s*\}\}/g) || []).length;
    const body: any = { type: 'BODY', text: input.body };
    if (varCount > 0) {
      const ex = (input.examples || []).map((e) => String(e || '')).slice(0, varCount);
      while (ex.length < varCount) ex.push('sample');
      body.example = { body_text: [ex] };
    }
    components.push(body);

    if (input.footer && input.footer.trim()) {
      components.push({ type: 'FOOTER', text: input.footer.trim() });
    }

    if (input.buttons && input.buttons.length) {
      components.push({
        type: 'BUTTONS',
        buttons: input.buttons.slice(0, 10).map((b) => {
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
          if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
          return { type: 'QUICK_REPLY', text: b.text };
        }),
      });
    }

    const { wabaId, accessToken } = await this.resolveWabaToken();
    return this.createTemplate(wabaId, accessToken, {
      name,
      category: input.category,
      language: input.language || 'en',
      components,
    });
  }

  /** Delete a template by name. */
  async deleteTemplate(name: string): Promise<{ success: boolean }> {
    const { wabaId, accessToken } = await this.resolveWabaToken();
    const res = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json() as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || 'Failed to delete template');
    return { success: true };
  }

  async provisionAll(): Promise<{ results: ProvisionResult[]; summary: { created: number; existing: number; failed: number } }> {
    const { wabaId, accessToken } = await this.resolveWabaToken();

    // Fetch existing template names up front so re-syncing reliably reports
    // "already_exists" instead of Meta's generic re-create error.
    const existingNames = new Set<string>();
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/message_templates?fields=name&limit=250`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json() as any;
      (data.data || []).forEach((t: any) => existingNames.add(t.name));
    } catch { /* fall back to create-and-detect */ }

    const templates = this.getAllTemplates();
    const results: ProvisionResult[] = [];

    for (const template of templates) {
      if (existingNames.has(template.name)) {
        results.push({ name: template.name, status: 'already_exists' });
        continue;
      }
      const result = await this.createTemplate(wabaId, accessToken, template);
      results.push(result);
      // Small delay between API calls to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    const summary = {
      created: results.filter(r => r.status === 'created').length,
      existing: results.filter(r => r.status === 'already_exists').length,
      failed: results.filter(r => r.status === 'failed').length,
    };

    this.logger.log(`Template provisioning complete: ${summary.created} created, ${summary.existing} existing, ${summary.failed} failed`);
    return { results, summary };
  }

  private async createTemplate(wabaId: string, accessToken: string, template: TemplateDefinition): Promise<ProvisionResult> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/message_templates`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name: template.name,
            language: template.language,
            category: template.category,
            components: template.components,
          }),
        },
      );

      const data = await response.json() as any;

      if (response.ok && data.id) {
        this.logger.log(`Template "${template.name}" created with ID ${data.id}`);
        return { name: template.name, status: 'created', id: data.id };
      }

      const errorMsg = data.error?.message || '';
      // If template already exists, that's fine
      if (errorMsg.toLowerCase().includes('already exists') || data.error?.code === 2388047) {
        return { name: template.name, status: 'already_exists' };
      }

      this.logger.warn(`Failed to create template "${template.name}": ${errorMsg}`);
      return { name: template.name, status: 'failed', error: errorMsg };
    } catch (err: any) {
      this.logger.error(`Network error creating template "${template.name}": ${err.message}`);
      return { name: template.name, status: 'failed', error: err.message };
    }
  }

  private getAllTemplates(): TemplateDefinition[] {
    return [
      // ─── AUTHENTICATION ─────────────────────────────────────────────
      {
        // AUTHENTICATION templates use Meta's fixed OTP format (body is auto-generated).
        name: 'admin_otp_verification',
        category: 'AUTHENTICATION',
        language: 'en',
        components: [
          { type: 'BODY', add_security_recommendation: true },
          { type: 'FOOTER', code_expiration_minutes: 5 },
          { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }] },
        ],
      },

      // ─── UTILITY: Order ─────────────────────────────────────────────
      {
        name: 'order_confirmation',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, your order #{{2}} has been confirmed! {{3}} items totalling {{4}}. We\'ll notify you when it ships. Thank you for shopping with us!',
            example: { body_text: [['Rahul', 'ORD-0042', '3', 'Rs. 1,299']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
        ],
      },
      {
        name: 'order_shipped',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, great news! Your order #{{2}} has been shipped. {{3}} Track your delivery or reply here for updates.',
            example: { body_text: [['Rahul', 'ORD-0042', 'Expected delivery: 20 May 2026']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
          {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Track Order' }],
          },
        ],
      },
      {
        name: 'order_delivered',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, your order #{{2}} has been delivered! We hope you love it. Reply "HELP" if you have any issues or "REORDER" to place a new order.',
            example: { body_text: [['Rahul', 'ORD-0042']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Rate Us' },
              { type: 'QUICK_REPLY', text: 'Reorder' },
            ],
          },
        ],
      },
      {
        name: 'order_cancelled',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, your order #{{2}} has been cancelled. {{3}} If you have any questions, reply to this message.',
            example: { body_text: [['Rahul', 'ORD-0042', 'Reason: Out of stock']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
        ],
      },

      // ─── UTILITY: Payment ──────────────────────────────────────���────
      {
        name: 'payment_received',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, we\'ve received your payment of {{2}} for order #{{3}}. Your order is now being processed. Thank you!',
            example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
        ],
      },
      {
        name: 'payment_verified',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, your payment of {{2}} for order #{{3}} has been verified. Your order will be shipped soon!',
            example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
        ],
      },
      {
        name: 'payment_reminder',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, a friendly reminder that payment of {{2}} is pending for your order #{{3}}. Please complete the payment to avoid cancellation. Reply "PAY" for payment options.',
            example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Pay Now' },
              { type: 'QUICK_REPLY', text: 'Cancel Order' },
            ],
          },
        ],
      },
      {
        name: 'payment_refunded',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, your refund of {{2}} for order #{{3}} has been processed. It may take 3-5 business days to reflect in your account. Reply if you need any help.',
            example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
        ],
      },

      // ─── UTILITY: Delivery ──────────────────────────────────��───────
      {
        name: 'delivery_update',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, delivery update for order #{{2}}: {{3}}. {{4}} — reply here if you need any help.',
            example: { body_text: [['Rahul', 'ORD-0042', 'Out for delivery', 'Expected by 6 PM today']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
          {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Track' }],
          },
        ],
      },
      {
        name: 'delivery_failed',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, we were unable to deliver your order #{{2}}. Reason: {{3}}. We\'ll retry delivery tomorrow. Reply "RESCHEDULE" to pick a new time or "PICKUP" for self-collection.',
            example: { body_text: [['Rahul', 'ORD-0042', 'No one at home']] },
          },
          { type: 'FOOTER', text: 'Powered by WA Commerce' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Reschedule' },
              { type: 'QUICK_REPLY', text: 'Pickup' },
            ],
          },
        ],
      },

      // ─── UTILITY: Admin Notifications ───────────────────────────────
      {
        name: 'admin_new_order',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'New order received! Order #{{1}} from {{2}} for {{3}}. Items: {{4}}. Reply "CONFIRM" to confirm or "VIEW" for details.',
            example: { body_text: [['ORD-0042', 'Rahul', 'Rs. 1,299', '2x T-Shirt, 1x Jeans']] },
          },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Confirm' },
              { type: 'QUICK_REPLY', text: 'View' },
            ],
          },
        ],
      },
      {
        name: 'admin_payment_received',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Payment received! {{1}} paid {{2}} for order #{{3}} via {{4}}. Reply "VERIFY" to verify or "REJECT" if suspicious.',
            example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042', 'UPI']] },
          },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Verify' },
              { type: 'QUICK_REPLY', text: 'Reject' },
            ],
          },
        ],
      },
      {
        name: 'admin_low_stock',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Low stock alert! {{1}} has only {{2}} units remaining. Current threshold: {{3}}. Reply "RESTOCK" to update inventory.',
            example: { body_text: [['Blue Cotton T-Shirt', '3', '5']] },
          },
          {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Restock' }],
          },
        ],
      },
      {
        name: 'admin_new_customer',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'New customer! {{1}} ({{2}}) just opted in to your store. You now have {{3}} customers in total. Reply VIEW for details.',
            example: { body_text: [['Rahul', '+919876543210', '156']] },
          },
        ],
      },
      {
        name: 'admin_daily_summary',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Daily Summary for {{1}}:\n- Orders: {{2}}\n- Revenue: {{3}}\n- New Customers: {{4}}\n- Messages: {{5}}\n\nReply "DETAILS" for full report.',
            example: { body_text: [['17 May 2026', '12', 'Rs. 15,400', '5', '87']] },
          },
          {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Details' }],
          },
        ],
      },

      // ─── MARKETING ──────────────────────────────────────────────────
      {
        name: 'campaign_promotional',
        category: 'MARKETING',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, {{2}} Reply SHOP to browse or STOP to unsubscribe.',
            example: { body_text: [['Rahul', 'Check out our latest summer collection! Up to 50% off on all items this weekend.']] },
          },
          { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Shop Now' },
              { type: 'QUICK_REPLY', text: 'Unsubscribe' },
            ],
          },
        ],
      },
      {
        name: 'campaign_discount',
        category: 'MARKETING',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, exclusive offer just for you! Get {{2}} off on {{3}}. Use code: {{4}}. Valid until {{5}}. Reply "ORDER" to shop now!',
            example: { body_text: [['Rahul', '20%', 'all T-Shirts', 'SUMMER20', '25 May 2026']] },
          },
          { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Order Now' },
              { type: 'QUICK_REPLY', text: 'Unsubscribe' },
            ],
          },
        ],
      },
      {
        name: 'abandoned_cart_reminder',
        category: 'MARKETING',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, you left {{2}} in your cart! Your items are still available. Complete your order before they sell out. Reply "CHECKOUT" to place your order.',
            example: { body_text: [['Rahul', '2 items worth Rs. 999']] },
          },
          { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Checkout' },
              { type: 'QUICK_REPLY', text: 'Remove' },
            ],
          },
        ],
      },
      {
        name: 'back_in_stock',
        category: 'MARKETING',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, great news! {{2}} is back in stock. Only {{3}} units available — grab yours before it\'s gone! Reply "ORDER" to buy now.',
            example: { body_text: [['Rahul', 'Blue Cotton T-Shirt', '10']] },
          },
          { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
          {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Order' }],
          },
        ],
      },

      // ─── UTILITY: Customer Service ──────────────────────────────────
      {
        name: 'welcome_message',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Welcome to {{1}}! We\'re happy to have you here. Browse our catalog by replying "MENU" or ask us anything. We\'re here to help!',
            example: { body_text: [['Fresh Mart']] },
          },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Menu' },
              { type: 'QUICK_REPLY', text: 'Support' },
            ],
          },
        ],
      },
      {
        name: 'order_feedback',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, we hope you\'re enjoying your order #{{2}}! How would you rate your experience? Reply with a number 1-5 (5 being excellent).',
            example: { body_text: [['Rahul', 'ORD-0042']] },
          },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: '5 - Excellent' },
              { type: 'QUICK_REPLY', text: '3 - Average' },
              { type: 'QUICK_REPLY', text: '1 - Poor' },
            ],
          },
        ],
      },

      // ─── SMART TEASERS ──────────────────────────────────────────────
      // Sent (batched) when the recipient is OUTSIDE their 24h service window.
      // A single tap opens the window so the real, detailed updates can be
      // delivered free-form for free.
      {
        name: 'customer_updates_teaser',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, you have {{2}} new update(s) waiting on your orders. Tap below to view them now.',
            example: { body_text: [['Rahul', '3']] },
          },
          { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'View Updates' }] },
        ],
      },
      {
        name: 'customer_offers_teaser',
        category: 'MARKETING',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, we have {{2}} exciting offer(s) just for you! 🎁 Tap below to see what\'s waiting.',
            example: { body_text: [['Rahul', '2']] },
          },
          { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
          { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Show Offers' }] },
        ],
      },
      {
        name: 'admin_updates_teaser',
        category: 'UTILITY',
        language: 'en',
        components: [
          {
            type: 'BODY',
            text: 'You have {{1}} new store update(s) — orders, payments and alerts. Tap below to view them now.',
            example: { body_text: [['5']] },
          },
          { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'View Updates' }] },
        ],
      },
    ];
  }
}
