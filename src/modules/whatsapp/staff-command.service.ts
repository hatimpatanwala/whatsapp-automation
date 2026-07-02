import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { EventBusService } from '../events/event-bus.service';
import { OrderStatusChangedEvent } from '../events/domain-events';
import { OrderService } from '../order/order.service';
import { WhatsAppApiService } from './whatsapp-api.service';
import { TeamService, StaffMember } from './team.service';
import { StaffWhatsAppService } from './staff-whatsapp.service';

/** Multi-step state for the salesman's "new order" flow (Redis-backed). */
interface SalesState {
  flow: 'new_order';
  step: 'customer' | 'customer_name' | 'products' | 'qty';
  data: {
    customerId?: string;
    customerPhone?: string;
    items: { productId: string | null; productName: string; unitPrice: number; quantity: number }[];
    pending?: { productId: string; productName: string; price: number };
  };
}

/**
 * The staff counterpart to AdminCommandService. When a message arrives from a
 * number that belongs to a (verified) staff `users` row, this builds a
 * ROLE-SCOPED WhatsApp experience:
 *   - accountant → money view (receivables, today's sales)
 *   - employee   → orders assigned to them + status updates
 *   - salesman   → their orders (order-taking flow lands in a later phase)
 *
 * If the number belongs to a staff row that is still UNVERIFIED, an inbound
 * message is treated as an OTP reply to complete WhatsApp verification.
 */
@Injectable()
export class StaffCommandService {
  private readonly logger = new Logger(StaffCommandService.name);

  private readonly ORDER_STATUSES: { id: string; title: string }[] = [
    { id: 'processing', title: '👨‍🍳 Preparing' },
    { id: 'ready_for_delivery', title: '📦 Ready' },
    { id: 'delivered', title: '🚚 Delivered' },
  ];

  private readonly STATE_TTL = 1800; // 30 min

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly cm: TenantConnectionManager,
    private readonly team: TeamService,
    private readonly staffWhatsapp: StaffWhatsAppService,
    private readonly eventBus: EventBusService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly orderService?: OrderService,
  ) {}

  /** Pure read: is this inbound number a staff member (verified or pending)? */
  async resolveStaff(tenant: any, from: string): Promise<StaffMember | null> {
    try {
      return await this.team.findByWhatsapp(tenant.schemaName, TeamService.digits(from));
    } catch {
      return null;
    }
  }

  /** Entry point — called by the webhook when `from` resolves to a staff member. */
  async handle(tenant: any, member: StaffMember, message: any): Promise<void> {
    const to = message.from;
    const { id, text } = this.parseReply(message);

    // Not verified yet → treat this message as an OTP round-trip.
    if (!member.whatsappVerified) {
      return this.handleVerification(tenant, member, to, text || '');
    }

    const cmd = (id || text || '').trim();
    const lower = cmd.toLowerCase();
    if (!cmd || ['menu', 'hi', 'hello', 'start', 'back'].includes(lower)) {
      return this.showRoleMenu(tenant, member, to);
    }

    switch (member.role) {
      case 'accountant':
        return this.handleAccountant(tenant, member, to, cmd);
      case 'employee':
        return this.handleEmployee(tenant, member, to, cmd);
      case 'salesman':
        return this.handleSalesman(tenant, member, to, id || '', (text || '').trim());
      default:
        return this.showRoleMenu(tenant, member, to);
    }
  }

  // ── Verification ────────────────────────────────────────────────────────────
  private async handleVerification(tenant: any, member: StaffMember, to: string, text: string): Promise<void> {
    const res = await this.staffWhatsapp.verifyByReply(tenant.schemaName, TeamService.digits(to), text);
    if (res.verified) {
      const fresh = (await this.team.findById(tenant.schemaName, member.id)) || member;
      await this.send(tenant, to, `✅ You're verified, ${fresh.name}! You can now manage the store over WhatsApp.`);
      return this.showRoleMenu(tenant, fresh, to);
    }
    const msg: Record<string, string> = {
      no_pending: '👋 Your WhatsApp isn’t verified yet. Ask your admin to send your verification code, then reply with it here.',
      expired: '⌛ That code expired. Ask your admin to resend your verification code.',
      too_many: '🚫 Too many attempts. Ask your admin to resend a fresh verification code.',
      mismatch: '❌ That code doesn’t match. Please re-enter the 6-digit code we sent you.',
      not_a_code: '🔐 Please reply with the 6-digit verification code your admin sent you.',
    };
    await this.send(tenant, to, msg[res.reason || 'not_a_code'] || msg.not_a_code);
  }

  // ── Role menus ──────────────────────────────────────────────────────────────
  private async showRoleMenu(tenant: any, member: StaffMember, to: string): Promise<void> {
    await this.clearState(tenant.schemaName, to); // a fresh menu cancels any in-progress flow
    if (member.role === 'accountant') {
      return this.sendButtons(tenant, to, `💼 *Accounts* — hi ${member.name}.\nChoose what to check.`, [
        { id: 'acc_recv', title: '💰 Receivables' },
        { id: 'acc_today', title: '📊 Today’s sales' },
      ]);
    }
    if (member.role === 'employee') {
      return this.sendButtons(tenant, to, `📦 *Orders* — hi ${member.name}.\nHere’s what you can do.`, [
        { id: 'emp_orders', title: '📋 My orders' },
      ]);
    }
    if (member.role === 'salesman') {
      return this.sendButtons(tenant, to, `🧑‍💼 *Sales* — hi ${member.name}.`, [
        { id: 'sm_new', title: '🆕 New order' },
        { id: 'sm_orders', title: '📋 My orders' },
      ]);
    }
    await this.send(tenant, to, `Hi ${member.name}. Your role doesn’t have a WhatsApp menu yet.`);
  }

  // ── Accountant ──────────────────────────────────────────────────────────────
  private async handleAccountant(tenant: any, member: StaffMember, to: string, cmd: string): Promise<void> {
    if (cmd === 'acc_recv') {
      const r = await this.q(tenant.schemaName, (qr) =>
        qr.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(balance_due),0)::float AS amt
                    FROM invoices WHERE year IS NOT NULL AND payment_status <> 'paid'`),
      );
      const { n, amt } = r[0] || { n: 0, amt: 0 };
      await this.send(tenant, to, `💰 *Receivables*\n${n} unpaid invoice(s) · ₹${this.money(amt)} outstanding.`);
      return this.showRoleMenu(tenant, member, to);
    }
    if (cmd === 'acc_today') {
      const r = await this.q(tenant.schemaName, (qr) =>
        qr.query(`SELECT COALESCE(SUM(base_total),0)::float AS amt, COUNT(*)::int AS n
                    FROM invoices WHERE year IS NOT NULL AND issued_at::date = CURRENT_DATE`),
      );
      const { n, amt } = r[0] || { n: 0, amt: 0 };
      await this.send(tenant, to, `📊 *Today*\n${n} invoice(s) · ₹${this.money(amt)} billed today.`);
      return this.showRoleMenu(tenant, member, to);
    }
    return this.showRoleMenu(tenant, member, to);
  }

  // ── Employee ────────────────────────────────────────────────────────────────
  private async handleEmployee(tenant: any, member: StaffMember, to: string, cmd: string): Promise<void> {
    if (cmd === 'emp_orders') return this.listAssignedOrders(tenant, member, to);
    if (cmd.startsWith('sorder_')) return this.showAssignedOrder(tenant, member, to, cmd.slice('sorder_'.length));
    if (cmd.startsWith('sostatus_')) {
      const rest = cmd.slice('sostatus_'.length);
      const idx = rest.lastIndexOf('_');
      if (idx > 0) return this.setOrderStatus(tenant, member, to, rest.slice(0, idx), rest.slice(idx + 1));
    }
    return this.showRoleMenu(tenant, member, to);
  }

  private async listAssignedOrders(tenant: any, member: StaffMember, to: string): Promise<void> {
    const rows = await this.q(tenant.schemaName, (qr) =>
      qr.query(
        `SELECT id, order_number, status, total FROM orders
          WHERE assigned_to = $1 AND status NOT IN ('delivered','cancelled')
          ORDER BY assigned_at DESC NULLS LAST, created_at DESC LIMIT 10`,
        [member.id],
      ),
    );
    if (!rows.length) {
      await this.send(tenant, to, '✅ You have no open orders assigned right now.');
      return;
    }
    await this.sendList(tenant, to, '📋 *Your assigned orders*', 'View order', [
      {
        title: 'Orders',
        rows: rows.map((o: any) => ({
          id: `sorder_${o.id}`,
          title: `#${o.order_number} · ₹${this.money(o.total)}`,
          description: this.label(o.status),
        })),
      },
    ]);
  }

  private async showAssignedOrder(tenant: any, member: StaffMember, to: string, orderId: string): Promise<void> {
    const data = await this.q(tenant.schemaName, async (qr) => {
      const order = (await qr.query(`SELECT * FROM orders WHERE id = $1 AND assigned_to = $2`, [orderId, member.id]))[0];
      if (!order) return null;
      const items = await qr.query(`SELECT product_name, quantity, total_price FROM order_items WHERE order_id = $1`, [orderId]);
      return { order, items };
    });
    if (!data) {
      await this.send(tenant, to, 'That order isn’t assigned to you.');
      return;
    }
    const lines = data.items.map((i: any) => `• ${i.product_name} ×${i.quantity} — ₹${this.money(i.total_price)}`).join('\n');
    const body = `📦 *Order #${data.order.order_number}*\nStatus: ${this.label(data.order.status)}\n\n${lines}\n\n*Total: ₹${this.money(data.order.total)}*`;
    const buttons = this.ORDER_STATUSES
      .filter((s) => s.id !== data.order.status)
      .slice(0, 3)
      .map((s) => ({ id: `sostatus_${orderId}_${s.id}`, title: s.title }));
    await this.sendButtons(tenant, to, body, buttons);
  }

  private async setOrderStatus(tenant: any, member: StaffMember, to: string, orderId: string, status: string): Promise<void> {
    if (!this.ORDER_STATUSES.some((s) => s.id === status)) return this.showRoleMenu(tenant, member, to);
    const changed = await this.q(tenant.schemaName, async (qr) => {
      const cur = (await qr.query(`SELECT status, customer_id, order_number FROM orders WHERE id = $1 AND assigned_to = $2`, [orderId, member.id]))[0];
      if (!cur) return null;
      const stamp = status === 'delivered' ? ', delivered_at = NOW()' : '';
      await qr.query(`UPDATE orders SET status = $1${stamp}, updated_at = NOW() WHERE id = $2`, [status, orderId]);
      return cur;
    });
    if (!changed) {
      await this.send(tenant, to, 'That order isn’t assigned to you.');
      return;
    }
    // Fire the same event the admin path uses, so the customer gets notified.
    this.eventBus.emit(new OrderStatusChangedEvent(tenant.schemaName, orderId, changed.customer_id, changed.status, status));
    await this.send(tenant, to, `✅ Order #${changed.order_number} → *${this.label(status)}*.`);
  }

  // ── Salesman: take an order on behalf of a customer ─────────────────────────
  private async handleSalesman(tenant: any, member: StaffMember, to: string, id: string, text: string): Promise<void> {
    const schema = tenant.schemaName;
    if (id === 'sm_new') return this.smStartOrder(tenant, member, to);
    if (id === 'sm_cancel') { await this.clearState(schema, to); await this.send(tenant, to, '✖️ Order cancelled.'); return this.showRoleMenu(tenant, member, to); }
    if (id === 'sm_orders') return this.smListOrders(tenant, member, to);
    if (id === 'sm_place') return this.smPlaceOrder(tenant, member, to);
    if (id.startsWith('smp_')) return this.smAskQty(tenant, member, to, id.slice('smp_'.length));

    // Free text is interpreted against the active flow step.
    const state = (await this.getState(schema, to)) as SalesState | null;
    if (state?.flow === 'new_order') return this.smHandleText(tenant, member, to, state, text);
    return this.showRoleMenu(tenant, member, to);
  }

  private async smListOrders(tenant: any, member: StaffMember, to: string): Promise<void> {
    const rows = await this.q(tenant.schemaName, (qr) =>
      qr.query(`SELECT order_number, status, total FROM orders WHERE created_by_user_id = $1 ORDER BY created_at DESC LIMIT 10`, [member.id]),
    );
    if (!rows.length) { await this.send(tenant, to, 'You haven’t created any orders yet.'); return this.showRoleMenu(tenant, member, to); }
    const lines = rows.map((o: any) => `• #${o.order_number} — ₹${this.money(o.total)} · ${this.label(o.status)}`).join('\n');
    await this.send(tenant, to, `📋 *Your recent orders*\n${lines}`);
    return this.showRoleMenu(tenant, member, to);
  }

  private async smStartOrder(tenant: any, member: StaffMember, to: string): Promise<void> {
    await this.setState(tenant.schemaName, to, { flow: 'new_order', step: 'customer', data: { items: [] } });
    await this.send(tenant, to, '🆕 *New order*\nSend the customer’s WhatsApp number (with country code), e.g. `919876543210`.\n\nSend *cancel* to stop.');
  }

  private async smHandleText(tenant: any, member: StaffMember, to: string, state: SalesState, text: string): Promise<void> {
    const schema = tenant.schemaName;
    if (text.toLowerCase() === 'cancel') { await this.clearState(schema, to); return this.showRoleMenu(tenant, member, to); }

    if (state.step === 'customer') {
      const digits = (text || '').replace(/\D/g, '');
      if (digits.length < 8) return void (await this.send(tenant, to, 'Please send a valid WhatsApp number with country code, e.g. `919876543210`.'));
      const existing = await this.q(schema, (qr) =>
        qr.query(`SELECT id, name FROM customers WHERE regexp_replace(COALESCE(phone,''),'\\D','','g') = $1 LIMIT 1`, [digits]),
      );
      if (existing[0]) {
        state.data.customerId = existing[0].id;
        state.step = 'products';
        await this.setState(schema, to, state);
        await this.send(tenant, to, `👤 Customer: *${existing[0].name || digits}*. Now add products.`);
        return this.smShowProducts(tenant, to, state);
      }
      state.data.customerPhone = digits;
      state.step = 'customer_name';
      await this.setState(schema, to, state);
      return void (await this.send(tenant, to, 'New customer — what’s their *name*?'));
    }

    if (state.step === 'customer_name') {
      const name = (text || '').trim();
      if (name.length < 2) return void (await this.send(tenant, to, 'Please enter the customer’s name.'));
      const created = await this.q(schema, (qr) =>
        qr.query(`INSERT INTO customers (phone, name) VALUES ($1, $2) RETURNING id`, [state.data.customerPhone, name]),
      );
      state.data.customerId = created[0].id;
      state.step = 'products';
      await this.setState(schema, to, state);
      await this.send(tenant, to, `👤 Added *${name}*. Now add products.`);
      return this.smShowProducts(tenant, to, state);
    }

    if (state.step === 'qty') {
      const qty = parseInt((text || '').replace(/[^0-9]/g, ''), 10);
      if (!qty || qty < 1) return void (await this.send(tenant, to, 'Please reply with a quantity (a number), e.g. `2`.'));
      const p = state.data.pending;
      if (p) {
        state.data.items.push({ productId: p.productId, productName: p.productName, unitPrice: p.price, quantity: qty });
        state.data.pending = undefined;
      }
      state.step = 'products';
      await this.setState(schema, to, state);
      return this.smShowProducts(tenant, to, state);
    }

    // step === 'products' → treat text as a product search
    return this.smShowProducts(tenant, to, state, text);
  }

  private async smShowProducts(tenant: any, to: string, state: SalesState, search?: string): Promise<void> {
    const like = `%${(search || '').trim()}%`;
    const products = await this.q(tenant.schemaName, (qr) =>
      qr.query(
        `SELECT id, name, COALESCE(sale_price, base_price, 0) AS price FROM products
          WHERE is_active = true ${search ? 'AND name ILIKE $1' : ''}
          ORDER BY name ASC LIMIT 8`,
        search ? [like] : [],
      ),
    );
    const cart = state.data.items;
    const total = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const summary = cart.length ? `🛒 ${cart.length} item(s) · ₹${this.money(total)}\n${cart.map((i) => `• ${i.productName} ×${i.quantity}`).join('\n')}\n\n` : '';

    if (!products.length) {
      await this.send(tenant, to, `${summary}No products match “${search}”. Send another search term, or *cancel*.`);
      return;
    }

    const productRows = products.map((p: any) => ({
      id: `smp_${p.id}`,
      title: this.trim(p.name, 24),
      description: `₹${this.money(p.price)}`,
    }));
    const actionRows: { id: string; title: string; description?: string }[] = [];
    if (cart.length) actionRows.push({ id: 'sm_place', title: '✅ Place order', description: `${cart.length} item(s) · ₹${this.money(total)}` });
    actionRows.push({ id: 'sm_cancel', title: '✖️ Cancel' });

    const sections = [{ title: 'Products', rows: productRows }, { title: 'Actions', rows: actionRows }];
    await this.sendList(tenant, to, `${summary}🛍️ *Add products* — tap one to add. You can also type to search.`, 'Products', sections);
  }

  private async smAskQty(tenant: any, member: StaffMember, to: string, productId: string): Promise<void> {
    const state = (await this.getState(tenant.schemaName, to)) as SalesState | null;
    if (!state || state.flow !== 'new_order') return this.showRoleMenu(tenant, member, to);
    const p = (await this.q(tenant.schemaName, (qr) =>
      qr.query(`SELECT id, name, COALESCE(sale_price, base_price, 0) AS price FROM products WHERE id = $1 AND is_active = true`, [productId]),
    ))[0];
    if (!p) { await this.send(tenant, to, 'That product is unavailable.'); return this.smShowProducts(tenant, to, state); }
    state.data.pending = { productId: p.id, productName: p.name, price: Number(p.price) };
    state.step = 'qty';
    await this.setState(tenant.schemaName, to, state);
    await this.send(tenant, to, `How many *${p.name}* (₹${this.money(p.price)} each)? Reply with a number.`);
  }

  private async smPlaceOrder(tenant: any, member: StaffMember, to: string): Promise<void> {
    const schema = tenant.schemaName;
    const state = (await this.getState(schema, to)) as SalesState | null;
    if (!state || state.flow !== 'new_order' || !state.data.customerId) return this.showRoleMenu(tenant, member, to);
    if (!state.data.items.length) { await this.send(tenant, to, 'Add at least one product first.'); return this.smShowProducts(tenant, to, state); }
    if (!this.orderService) { await this.send(tenant, to, 'Order creation is unavailable right now.'); return; }
    try {
      const order = await this.orderService.createDirect(schema, {
        customerId: state.data.customerId,
        items: state.data.items,
        createdByUserId: member.id,
      });
      await this.clearState(schema, to);
      const total = state.data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      await this.send(tenant, to, `✅ *Order #${order.order_number}* placed — ₹${this.money(total)}.\nThe store has been notified and the customer will get a confirmation.`);
      await this.showRoleMenu(tenant, member, to);
    } catch (err: any) {
      await this.send(tenant, to, `⚠️ ${err?.message || 'Could not place the order.'} Send *menu* to retry.`);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private parseReply(message: any): { id?: string; text?: string } {
    if (message.type === 'interactive') {
      const i = message.interactive;
      if (i?.button_reply) return { id: i.button_reply.id, text: i.button_reply.title };
      if (i?.list_reply) return { id: i.list_reply.id, text: i.list_reply.title };
    }
    if (message.type === 'text') return { text: message.text?.body };
    return {};
  }

  private q<T = any>(schema: string, fn: (qr: any) => Promise<T>): Promise<T> {
    return this.cm.executeInTenantContext(schema, fn);
  }

  // Redis-backed flow state (salesman order-taking), keyed by staff number.
  private stateKey(schema: string, phone: string): string {
    return `staff:cmd:${schema}:${TeamService.digits(phone)}`;
  }
  private async getState(schema: string, phone: string): Promise<SalesState | null> {
    const raw = await this.redis.get(this.stateKey(schema, phone));
    return raw ? (JSON.parse(raw) as SalesState) : null;
  }
  private async setState(schema: string, phone: string, state: SalesState): Promise<void> {
    await this.redis.set(this.stateKey(schema, phone), JSON.stringify(state), 'EX', this.STATE_TTL);
  }
  private async clearState(schema: string, phone: string): Promise<void> {
    await this.redis.del(this.stateKey(schema, phone));
  }
  private trim(s: string, n: number): string {
    return (s || '').length > n ? `${(s || '').slice(0, n - 1)}…` : s || '';
  }

  private label(status: string): string {
    return (status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  private money(v: any): string {
    return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private async send(tenant: any, to: string, text: string): Promise<void> {
    await this.whatsappApi.sendTextMessage(tenant.phoneNumberId, tenant.accessToken, to, text);
  }
  private async sendButtons(tenant: any, to: string, body: string, buttons: { id: string; title: string }[]): Promise<void> {
    if (!buttons.length) return this.send(tenant, to, body);
    await this.whatsappApi.sendInteractiveButtons(tenant.phoneNumberId, tenant.accessToken, to, body, buttons.slice(0, 3));
  }
  private async sendList(
    tenant: any,
    to: string,
    body: string,
    buttonText: string,
    sections: { title: string; rows: { id: string; title: string; description?: string }[] }[],
  ): Promise<void> {
    await this.whatsappApi.sendInteractiveList(tenant.phoneNumberId, tenant.accessToken, to, body, buttonText, sections);
  }
}
