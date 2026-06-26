import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { OrderService } from '../order/order.service';
import { QuoteService } from '../quote/quote.service';

export type BuilderType = 'order' | 'quote';

interface CreateSessionInput {
  tenantId: string;
  schemaName: string;
  type: BuilderType;
  customerId?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  conversationId?: string | null;
  createdBy?: string | null;
}

interface BuilderItemInput {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Backs the secure "Builder" webview — a hosted page opened inside WhatsApp's
 * in-app browser (or the tenant panel) where an admin builds a new order/quote
 * (pick products, set qty + price) and submits it into the tenant's schema.
 *
 * Security: each builder link carries a single-use, time-limited, random token.
 * The token row (public.builder_sessions) carries the tenant + type + customer,
 * so the page needs NO login — and without a valid token the page is useless
 * (it cannot be opened in a plain browser). The token is invalidated on submit
 * and after a 2-hour TTL. We store only a SHA-256 hash of the token.
 */
@Injectable()
export class BuilderService implements OnModuleInit {
  private readonly logger = new Logger(BuilderService.name);
  private readonly ttlMs = 2 * 60 * 60 * 1000; // 2 hours

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly connectionManager: TenantConnectionManager,
    private readonly orderService: OrderService,
    private readonly quoteService: QuoteService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Self-creating + idempotent (there is no public-schema migration runner).
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS public.builder_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token_hash VARCHAR(64) NOT NULL UNIQUE,
          tenant_id UUID NOT NULL,
          schema_name VARCHAR(120) NOT NULL,
          type VARCHAR(10) NOT NULL,
          customer_id UUID,
          customer_phone VARCHAR(32),
          customer_name VARCHAR(200),
          conversation_id UUID,
          created_by VARCHAR(64),
          status VARCHAR(16) NOT NULL DEFAULT 'open',
          result_id UUID,
          result_number VARCHAR(40),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
    } catch (e: any) {
      this.logger.error(`Failed to ensure builder_sessions table: ${e?.message || e}`);
    }
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Mint a builder session + return the secret token and the full webview URL. */
  async createSession(input: CreateSessionInput): Promise<{ token: string; url: string; path: string }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.ds.query(
      `INSERT INTO public.builder_sessions
         (token_hash, tenant_id, schema_name, type, customer_id, customer_phone, customer_name, conversation_id, created_by, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10)`,
      [
        this.hash(token),
        input.tenantId,
        input.schemaName,
        input.type,
        input.customerId || null,
        input.customerPhone || null,
        input.customerName || null,
        input.conversationId || null,
        input.createdBy || null,
        expiresAt,
      ],
    );
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    const path = `/m/builder?token=${token}`;
    return { token, url: `${base}${path}`, path };
  }

  /** Resolve + validate a token to its (open, unexpired) session row. */
  private async resolveSession(token: string): Promise<any> {
    if (!token) throw new UnauthorizedException('Missing builder token.');
    const rows = await this.ds.query(
      `SELECT * FROM public.builder_sessions WHERE token_hash = $1`,
      [this.hash(token)],
    );
    const s = rows[0];
    if (!s) throw new UnauthorizedException('Invalid builder link.');
    if (s.status !== 'open') throw new ForbiddenException('This builder link has already been used.');
    if (new Date(s.expires_at).getTime() < Date.now()) {
      throw new ForbiddenException('This builder link has expired. Please request a new one.');
    }
    return s;
  }

  /** Context for the page: type + (pre-bound) customer. */
  async getSession(token: string): Promise<any> {
    const s = await this.resolveSession(token);
    return {
      type: s.type as BuilderType,
      customer: { phone: s.customer_phone || null, name: s.customer_name || null },
      customerLocked: !!s.customer_id || !!s.customer_phone,
    };
  }

  /** Active products with live stock for the token's tenant. */
  async getProducts(token: string): Promise<any[]> {
    const s = await this.resolveSession(token);
    return this.connectionManager.executeInTenantContext(s.schema_name, async (qr) => {
      const rows = await qr.query(
        `SELECT p.id, p.name, p.base_price, p.sale_price, p.currency, p.thumbnail,
                COALESCE(inv.stock_quantity, 0) AS stock_quantity
           FROM products p
           LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.variant_id IS NULL
          WHERE p.is_active = true
          ORDER BY p.sort_order ASC NULLS LAST, p.name ASC`,
      );
      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        price: Number(r.sale_price ?? r.base_price ?? 0),
        basePrice: Number(r.base_price ?? 0),
        currency: r.currency || 'INR',
        thumbnail: r.thumbnail || null,
        stock: Number(r.stock_quantity ?? 0),
      }));
    });
  }

  /** Submit the built order/quote into the tenant schema; invalidate the token. */
  async submit(
    token: string,
    payload: { items: BuilderItemInput[]; customer?: { phone?: string; name?: string }; title?: string; notes?: string },
  ): Promise<{ type: BuilderType; id: string; number: string }> {
    const s = await this.resolveSession(token);
    const items = (payload?.items || []).filter((i) => i && i.quantity > 0);
    if (!items.length) throw new BadRequestException('Add at least one item before submitting.');
    for (const it of items) {
      if (it.unitPrice == null || Number(it.unitPrice) < 0) {
        throw new BadRequestException(`Set a valid price for "${it.name}".`);
      }
    }

    const schema = s.schema_name;
    let customerId: string | null = s.customer_id;
    if (!customerId) {
      const phone = (payload.customer?.phone || s.customer_phone || '').trim();
      if (!phone) throw new BadRequestException('Customer phone number is required.');
      customerId = await this.resolveCustomer(schema, phone, payload.customer?.name || s.customer_name);
    }

    let resultId: string;
    let resultNumber: string;
    const type = s.type as BuilderType;

    if (type === 'order') {
      const order = await this.orderService.createDirect(schema, {
        customerId: customerId!,
        notes: payload.notes,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.name,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      });
      resultId = order.id;
      resultNumber = order.order_number;
    } else {
      const quote = await this.quoteService.create(schema, {
        customerId: customerId!,
        title: payload.title,
        notes: payload.notes,
        items: items.map((i) => ({
          productId: i.productId,
          description: i.name,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      });
      resultId = quote.id;
      resultNumber = quote.quote_number;
    }

    await this.ds.query(
      `UPDATE public.builder_sessions SET status = 'submitted', result_id = $1, result_number = $2 WHERE id = $3`,
      [resultId, resultNumber, s.id],
    );

    this.logger.log(`Builder submit: ${type} ${resultNumber} for tenant ${s.tenant_id}`);
    return { type, id: resultId, number: resultNumber };
  }

  private async resolveCustomer(schema: string, phone: string, name?: string | null): Promise<string> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const existing = await qr.query(`SELECT id FROM customers WHERE phone = $1 LIMIT 1`, [phone]);
      if (existing[0]) return existing[0].id;
      const created = await qr.query(
        `INSERT INTO customers (phone, name, status) VALUES ($1, $2, 'active') RETURNING id`,
        [phone, name || phone],
      );
      return created[0].id;
    });
  }
}
