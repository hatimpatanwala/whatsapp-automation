/**
 * Automation catalog — each pack GENERATES a complete workflow graph (all the node
 * types you'd otherwise place by hand in the advanced editor: triggers, messages,
 * catalog/cart/checkout, conditions, switches, waits, actions, delays, end) purely
 * from the checkbox selection. Sub-option checkboxes include/exclude optional nodes
 * and the generator re-wires the edges automatically.
 */

export interface WFNode {
  id: string; type: string; label: string; x: number; y: number;
  config: Record<string, any>; outputs: string[];
}
export interface WFEdge { id: string; from: string; to: string; label?: string; }
export interface WFGraph { nodes: WFNode[]; edges: WFEdge[]; }

export interface PackFeature {
  key: string; label: string;
  /** default-on? */ default: boolean;
  /** for the custom pack only — user-picked trigger */ triggerType?: string;
}
export interface Pack {
  key: string; name: string; description: string; icon: string;
  category: string; scales: ('small' | 'medium' | 'large')[];
  custom?: boolean;
  features: PackFeature[];
  /** Build the full graph from the set of enabled feature keys. */
  generate: (enabled: Set<string>, texts: Record<string, string>) => WFGraph;
}

export const PACK_CATEGORIES: { key: string; label: string }[] = [
  { key: 'orders', label: 'Orders & delivery' },
  { key: 'sales', label: 'Sales & quotes' },
  { key: 'billing', label: 'Invoicing & payments' },
  { key: 'purchasing', label: 'Purchasing' },
  { key: 'crm', label: 'Customers & marketing' },
  { key: 'appointments', label: 'Appointments & bookings' },
  { key: 'support', label: 'Support' },
  { key: 'custom', label: 'Custom' },
];

export const SCALES: { key: 'small' | 'medium' | 'large'; label: string }[] = [
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
];

// ── graph helpers ────────────────────────────────────────────────────────────
let _uid = 0;
function nid(pack: string, role: string) { return `${pack}:${role}`; }
function node(pack: string, role: string, type: string, label: string, x: number, y: number, config: Record<string, any> = {}): WFNode {
  return { id: nid(pack, role), type, label, x, y, config, outputs: [] };
}
function edge(from: string, to: string, label?: string): WFEdge {
  return { id: `e${++_uid}-${from}->${to}`, from, to, label };
}
/** Wire a linear chain (each node → next), filling outputs. Returns edges. */
function chain(ns: WFNode[]): WFEdge[] {
  const es: WFEdge[] = [];
  for (let i = 0; i < ns.length - 1; i++) { es.push(edge(ns[i].id, ns[i + 1].id)); ns[i].outputs.push(ns[i + 1].id); }
  return es;
}
const txt = (texts: Record<string, string>, key: string, def: string) => texts[key] ?? def;

// ── generators ───────────────────────────────────────────────────────────────

/** Full WhatsApp shopping assistant: catalog → cart → checkout → pay → confirm. */
function genShopping(en: Set<string>, t: Record<string, string>): WFGraph {
  const p = 'shopping'; const ns: WFNode[] = []; let y = 40;
  const trigger = node(p, 'trigger', 'trigger_message', 'Customer says "shop"', 300, y, { keywords: 'shop, buy, order, catalog', matchType: 'contains' }); ns.push(trigger); y += 190;
  const welcome = node(p, 'welcome', 'send_text', 'Welcome message', 300, y, { message: txt(t, 'welcome', 'Welcome to our store, {{customer_name}}! 🛍️ Let me show you what we have.') }); ns.push(welcome); y += 190;
  if (en.has('search')) { ns.push(node(p, 'search', 'search_products', 'Search products', 300, y, { noResultsMessage: 'No matches — here\'s our full catalogue instead.' })); y += 190; }
  const catalog = node(p, 'catalog', 'show_catalog', 'Show catalogue', 300, y, { header: 'Browse our products', buttonText: 'View items' }); ns.push(catalog); y += 190;
  const cart = node(p, 'cart', 'add_to_cart', 'Add to cart', 300, y, { quantityPrompt: true, confirmMessage: 'Added! Anything else, or ready to check out?' }); ns.push(cart); y += 190;
  const view = node(p, 'view', 'view_cart', 'View cart', 300, y, { showCheckout: true }); ns.push(view); y += 190;
  const checkout = node(p, 'checkout', 'checkout', 'Checkout', 300, y, { requireAddress: en.has('address'), paymentMethod: 'choice' }); ns.push(checkout); y += 190;
  const pay = node(p, 'pay', 'payment_qr', 'Send payment QR', 300, y, { expiryMinutes: 30, reminderEnabled: true }); ns.push(pay); y += 190;
  const wait = node(p, 'wait', 'wait_for_reply', 'Wait for payment', 300, y, { timeoutMinutes: 30, timeoutMessage: 'Still there? Your cart is saved.' }); ns.push(wait); y += 190;
  const cond = node(p, 'cond', 'condition', 'Payment received?', 300, y, { variable: 'payment_status', operator: 'eq', value: 'verified' }); ns.push(cond); y += 210;
  const ok = node(p, 'confirmed', 'send_text', 'Order confirmed', 560, y, { message: txt(t, 'confirmed', 'Payment received 🎉 Your order is confirmed and being prepared.') });
  const no = node(p, 'reminder', 'send_text', 'Payment reminder', 40, y, { message: txt(t, 'reminder', 'Your payment is still pending — complete it to lock in your order.') });
  ns.push(ok, no); y += 190;
  const end = node(p, 'end', 'end', 'End', 300, y, {}); ns.push(end);

  const es: WFEdge[] = [];
  // linear up to condition
  const lin = ns.filter(n => !['confirmed', 'reminder', 'end'].includes(n.id.split(':')[1]));
  es.push(...chain(lin));
  es.push(edge(cond.id, ok.id, 'Yes'), edge(cond.id, no.id, 'No'), edge(ok.id, end.id), edge(no.id, end.id));
  cond.outputs.push(ok.id, no.id); ok.outputs.push(end.id); no.outputs.push(end.id);
  if (en.has('tag')) { const tag = node(p, 'tag', 'tag_customer', 'Tag as buyer', 800, ok.y, { action: 'add', tag: 'buyer' }); ns.push(tag); es.push(edge(ok.id, tag.id)); ok.outputs.push(tag.id); }
  return { nodes: ns, edges: es };
}

/** Order status updates (event → message per stage), optional review request. */
function genOrderUpdates(en: Set<string>, t: Record<string, string>): WFGraph {
  const p = 'orderUpdates'; const ns: WFNode[] = []; const es: WFEdge[] = [];
  const trigger = node(p, 'trigger', 'trigger_order', 'When an order changes', 300, 40, { event: 'created' }); ns.push(trigger);
  const steps: [string, string, string][] = [
    ['confirmed', 'Order confirmation', 'Thanks {{customer_name}}! Order {{order_number}} is confirmed. 🧾'],
    ['packed', 'Packed / processing', 'Good news — order {{order_number}} is packed and being processed. 📦'],
    ['shipped', 'Out for delivery', 'Order {{order_number}} is out for delivery and will reach you soon! 🚚'],
    ['delivered', 'Delivered', 'Order {{order_number}} has been delivered. Thank you! 🎉'],
    ['review', 'Ask for a review', 'How was your experience, {{customer_name}}? Reply ⭐1–5 — it helps a lot!'],
  ];
  let row = 0;
  for (const [key, label, def] of steps) {
    if (!en.has(key)) continue;
    const nn = node(p, key, 'send_text', label, 300 + 260, 40 + row * 150, { message: txt(t, key, def) });
    ns.push(nn); es.push(edge(trigger.id, nn.id)); trigger.outputs.push(nn.id); row++;
  }
  return { nodes: ns, edges: es };
}

/** Abandoned cart recovery — reminder(s) + optional coupon, then check. */
function genAbandoned(en: Set<string>, t: Record<string, string>): WFGraph {
  const p = 'abandoned'; const ns: WFNode[] = [];
  const trigger = node(p, 'trigger', 'trigger_schedule', 'Cart left behind', 300, 40, { schedule: 'hourly' }); ns.push(trigger);
  const r1 = node(p, 'remind1', 'send_text', 'First reminder', 300, 230, { message: txt(t, 'remind1', 'You left something in your cart, {{customer_name}}! Reply BUY to finish your order. 🛒') }); ns.push(r1);
  const wait = node(p, 'wait', 'delay', 'Wait a day', 300, 420, { duration: 24, unit: 'hours' }); ns.push(wait);
  const chainNodes = [trigger, r1, wait];
  if (en.has('coupon')) { const c = node(p, 'coupon', 'send_text', 'Reminder with offer', 300, 610, { message: txt(t, 'coupon', 'Still thinking it over? Here\'s 10% off if you order today — use SAVE10. 🎁') }); ns.push(c); chainNodes.push(c); }
  const end = node(p, 'end', 'end', 'End', 300, 800, {}); ns.push(end); chainNodes.push(end);
  return { nodes: ns, edges: chain(chainNodes) };
}

/** Appointment booking → confirm → reminder → follow-up. */
function genAppointment(en: Set<string>, t: Record<string, string>): WFGraph {
  const p = 'appointment'; const ns: WFNode[] = [];
  const trigger = node(p, 'trigger', 'trigger_message', 'Customer wants to book', 300, 40, { keywords: 'book, appointment, slot', matchType: 'contains' }); ns.push(trigger);
  const ask = node(p, 'ask', 'send_buttons', 'Offer time slots', 300, 230, { body: txt(t, 'ask', 'Great! When works for you?'), buttons: 'Morning\nAfternoon\nEvening' }); ns.push(ask);
  const wait = node(p, 'wait', 'wait_for_reply', 'Wait for choice', 300, 420, { timeoutMinutes: 60 }); ns.push(wait);
  const confirm = node(p, 'confirm', 'send_text', 'Booking confirmation', 300, 610, { message: txt(t, 'confirm', 'Your appointment is confirmed, {{customer_name}}! 📅 See you then.') }); ns.push(confirm);
  const chainNodes = [trigger, ask, wait, confirm];
  if (en.has('reminder')) { const d = node(p, 'rdelay', 'delay', 'Wait until day before', 300, 800, { duration: 1, unit: 'hours' }); const r = node(p, 'reminder', 'send_text', 'Reminder', 300, 990, { message: txt(t, 'reminder', 'Reminder: your appointment is coming up. Reply RESCHEDULE if needed.') }); ns.push(d, r); chainNodes.push(d, r); }
  if (en.has('followup')) { const f = node(p, 'followup', 'send_text', 'Follow-up after visit', 300, 1180, { message: txt(t, 'followup', 'Thanks for visiting, {{customer_name}}! Hope it went well. 🙏') }); ns.push(f); chainNodes.push(f); }
  return { nodes: ns, edges: chain(chainNodes) };
}

/** Support menu → route to order help / catalogue / human agent. */
function genSupport(en: Set<string>, t: Record<string, string>): WFGraph {
  const p = 'support'; const ns: WFNode[] = []; const es: WFEdge[] = [];
  const trigger = node(p, 'trigger', 'trigger_message', 'Customer needs help', 300, 40, { keywords: 'help, support, issue, problem', matchType: 'contains' }); ns.push(trigger);
  const menu = node(p, 'menu', 'send_buttons', 'Support menu', 300, 230, { body: txt(t, 'menu', 'How can we help you today?'), buttons: 'Order issue\nProduct question\nTalk to us' }); ns.push(menu);
  const sw = node(p, 'router', 'switch', 'Route by choice', 300, 420, { variable: 'button_reply' }); ns.push(sw);
  es.push(edge(trigger.id, menu.id), edge(menu.id, sw.id)); trigger.outputs.push(menu.id); menu.outputs.push(sw.id);
  const orderHelp = node(p, 'orderHelp', 'send_text', 'Order help', 40, 640, { message: txt(t, 'orderHelp', 'Please share your order number and we\'ll look into it right away.') });
  const prod = node(p, 'catalog', 'show_catalog', 'Show catalogue', 300, 640, { header: 'Here\'s what we offer' });
  ns.push(orderHelp, prod);
  es.push(edge(sw.id, orderHelp.id, 'Order issue'), edge(sw.id, prod.id, 'Product question'));
  sw.outputs.push(orderHelp.id, prod.id);
  if (en.has('agent')) { const ag = node(p, 'agent', 'assign_agent', 'Connect to agent', 560, 640, { assignTo: 'any', message: 'Connecting you to our team…' }); ns.push(ag); es.push(edge(sw.id, ag.id, 'Talk to us')); sw.outputs.push(ag.id); }
  if (en.has('faq')) { const faq = node(p, 'faq', 'send_text', 'Business info', 40, 830, { message: txt(t, 'faq', 'We\'re open Mon–Sat 10am–8pm. Find us at [address]. Call [phone].') }); ns.push(faq); es.push(edge(orderHelp.id, faq.id)); orderHelp.outputs.push(faq.id); }
  return { nodes: ns, edges: es };
}

/** Welcome / first-time greeting. */
function genWelcome(en: Set<string>, t: Record<string, string>): WFGraph {
  const p = 'welcome'; const ns: WFNode[] = [];
  const trigger = node(p, 'trigger', 'trigger_message', 'First "hi"', 300, 40, { keywords: 'hi, hello, hey, start', matchType: 'contains' }); ns.push(trigger);
  const greet = node(p, 'greet', 'send_text', 'Welcome message', 300, 230, { message: txt(t, 'greet', 'Hi there! 👋 Welcome to {{business_name}}. How can we help today?') }); ns.push(greet);
  const cn = [trigger, greet];
  if (en.has('catalog')) { const c = node(p, 'catalog', 'show_catalog', 'Share catalogue', 300, 420, { header: 'Browse our products' }); ns.push(c); cn.push(c); }
  if (en.has('tag')) { const tg = node(p, 'tag', 'tag_customer', 'Tag as new lead', 300, 610, { action: 'add', tag: 'new-lead' }); ns.push(tg); cn.push(tg); }
  if (en.has('hours')) { const h = node(p, 'hours', 'send_text', 'Business hours', 300, 800, { message: txt(t, 'hours', 'We\'re open Mon–Sat, 10am–8pm. We\'ll reply as soon as we can!') }); ns.push(h); cn.push(h); }
  return { nodes: ns, edges: chain(cn) };
}

/** Simple event → message(+optional extra) notification packs. */
function genNotify(pack: string, trigger: { type: string; label: string; config: Record<string, any> }, steps: [string, string, string][]) {
  return (en: Set<string>, t: Record<string, string>): WFGraph => {
    const ns: WFNode[] = []; const es: WFEdge[] = [];
    const tr = node(pack, 'trigger', trigger.type, trigger.label, 300, 40, { ...trigger.config }); ns.push(tr);
    let row = 0;
    for (const [key, label, def] of steps) {
      if (!en.has(key)) continue;
      const nn = node(pack, key, 'send_text', label, 560, 40 + row * 150, { message: txt(t, key, def) });
      ns.push(nn); es.push(edge(tr.id, nn.id)); tr.outputs.push(nn.id); row++;
    }
    return { nodes: ns, edges: es };
  };
}

const feat = (key: string, label: string, def = true): PackFeature => ({ key, label, default: def });

export const PACKS: Pack[] = [
  // ── Orders & delivery ──
  {
    key: 'shopping', name: 'WhatsApp shopping assistant', icon: 'pi-shopping-bag', category: 'orders', scales: ['small', 'medium', 'large'],
    description: 'Full buy-on-WhatsApp flow: catalogue → cart → checkout → payment → confirmation.',
    features: [feat('search', 'Let customers search products'), feat('address', 'Collect delivery address'), feat('tag', 'Tag paying customers', false)],
    generate: genShopping,
  },
  {
    key: 'orderUpdates', name: 'Order status updates', icon: 'pi-truck', category: 'orders', scales: ['small', 'medium', 'large'],
    description: 'Notify customers automatically at each stage of their order.',
    features: [feat('confirmed', 'Order confirmation'), feat('packed', 'Packed / processing'), feat('shipped', 'Out for delivery'), feat('delivered', 'Delivered'), feat('review', 'Ask for a review', false)],
    generate: genOrderUpdates,
  },
  {
    key: 'abandoned', name: 'Abandoned cart recovery', icon: 'pi-cart-arrow-down', category: 'orders', scales: ['medium', 'large'],
    description: 'Win back customers who added to cart but didn\'t check out.',
    features: [feat('coupon', 'Send a discount nudge')],
    generate: genAbandoned,
  },
  // ── Sales & quotes ──
  {
    key: 'quotes', name: 'Quote follow-ups', icon: 'pi-file-edit', category: 'sales', scales: ['small', 'medium', 'large'],
    description: 'Keep deals moving after a quote is sent.',
    features: [feat('sent', 'Quote sent'), feat('reminder', 'Follow-up reminder'), feat('accepted', 'Thanks on acceptance')],
    generate: genNotify('quotes', { type: 'trigger_quote', label: 'On a quote event', config: { event: 'sent' } }, [
      ['sent', 'Quote sent', 'Hi {{customer_name}}, your quote {{quote_number}} is ready. Reply ACCEPT to proceed. 📄'],
      ['reminder', 'Follow-up reminder', 'Just following up on quote {{quote_number}} — happy to answer any questions!'],
      ['accepted', 'Thanks on acceptance', 'Thank you for accepting quote {{quote_number}}! We\'ll get started right away. 🎉'],
    ]),
  },
  // ── Invoicing & payments ──
  {
    key: 'invoicing', name: 'Invoicing', icon: 'pi-receipt', category: 'billing', scales: ['small', 'medium', 'large'],
    description: 'Send invoices and chase dues automatically.',
    features: [feat('created', 'Invoice sent'), feat('reminder', 'Due-date reminder'), feat('overdue', 'Overdue reminder', false)],
    generate: genNotify('invoicing', { type: 'trigger_invoice', label: 'When an invoice is created', config: { event: 'created' } }, [
      ['created', 'Invoice sent', 'Hi {{customer_name}}, here\'s invoice {{invoice_number}} for {{amount}}. Thank you! 🧾'],
      ['reminder', 'Due-date reminder', 'Friendly reminder: invoice {{invoice_number}} is due soon.'],
      ['overdue', 'Overdue reminder', 'Invoice {{invoice_number}} is now overdue — please arrange payment when you can.'],
    ]),
  },
  {
    key: 'payments', name: 'Payment reminders', icon: 'pi-wallet', category: 'billing', scales: ['small', 'medium', 'large'],
    description: 'Confirm payments and nudge pending ones.',
    features: [feat('received', 'Payment received'), feat('pending', 'Pending reminder'), feat('overdue', 'Overdue notice', false)],
    generate: genNotify('payments', { type: 'trigger_payment', label: 'On a payment event', config: { event: 'received' } }, [
      ['received', 'Payment received', 'We\'ve received your payment for {{order_number}} — thank you! ✅'],
      ['pending', 'Pending reminder', 'Reminder: payment for {{order_number}} is still pending.'],
      ['overdue', 'Overdue notice', 'Payment for {{order_number}} is overdue. Reply here if you need help.'],
    ]),
  },
  // ── Purchasing ──
  {
    key: 'purchasing', name: 'Purchase orders', icon: 'pi-inbox', category: 'purchasing', scales: ['medium', 'large'],
    description: 'Notify suppliers and track incoming stock.',
    features: [feat('placed', 'PO placed to supplier'), feat('reminder', 'Delivery reminder'), feat('received', 'Goods received', false)],
    generate: genNotify('purchasing', { type: 'trigger_schedule', label: 'When a PO is raised', config: { schedule: 'daily' } }, [
      ['placed', 'PO placed to supplier', 'Hi, we\'ve raised purchase order {{po_number}}. Please confirm dispatch. 📦'],
      ['reminder', 'Delivery reminder', 'Reminder: PO {{po_number}} delivery is due. Please share an update.'],
      ['received', 'Goods received', 'We\'ve received PO {{po_number}}. Thank you!'],
    ]),
  },
  // ── Customers & marketing ──
  {
    key: 'welcome', name: 'Welcome new customers', icon: 'pi-hand', category: 'crm', scales: ['small', 'medium', 'large'],
    description: 'Greet first-time customers and point them to what to do next.',
    features: [feat('catalog', 'Share catalogue'), feat('tag', 'Tag as new lead', false), feat('hours', 'Share business hours', false)],
    generate: genWelcome,
  },
  {
    key: 'feedback', name: 'Feedback & reviews', icon: 'pi-star', category: 'crm', scales: ['small', 'medium', 'large'],
    description: 'Ask for a rating after delivery and route unhappy customers to a human.',
    features: [feat('ask', 'Ask for rating'), feat('escalate', 'Escalate low ratings to an agent', false)],
    generate: (en, t) => {
      const p = 'feedback'; const ns: WFNode[] = []; const es: WFEdge[] = [];
      const tr = node(p, 'trigger', 'trigger_order', 'After delivery', 300, 40, { event: 'delivered' }); ns.push(tr);
      const d = node(p, 'delay', 'delay', 'Wait a bit', 300, 230, { duration: 2, unit: 'hours' }); ns.push(d);
      const ask = node(p, 'ask', 'send_buttons', 'Ask for rating', 300, 420, { body: txt(t, 'ask', 'How was your order, {{customer_name}}?'), buttons: '⭐ Great\n😐 Okay\n👎 Poor' }); ns.push(ask);
      es.push(edge(tr.id, d.id), edge(d.id, ask.id)); tr.outputs.push(d.id); d.outputs.push(ask.id);
      const thank = node(p, 'thank', 'send_text', 'Thank you', 560, 620, { message: txt(t, 'thank', 'Thank you for the feedback — it means a lot! 🙏') }); ns.push(thank);
      es.push(edge(ask.id, thank.id, '⭐ Great')); ask.outputs.push(thank.id);
      if (en.has('escalate')) { const ag = node(p, 'agent', 'assign_agent', 'Escalate to agent', 40, 620, { assignTo: 'any', message: 'Sorry to hear that — a team member will reach out.' }); ns.push(ag); es.push(edge(ask.id, ag.id, '👎 Poor')); ask.outputs.push(ag.id); }
      return { nodes: ns, edges: es };
    },
  },
  {
    key: 'winback', name: 'Win-back inactive customers', icon: 'pi-history', category: 'crm', scales: ['medium', 'large'],
    description: 'Re-engage customers who haven\'t bought in a while.',
    features: [feat('coupon', 'Include a comeback offer')],
    generate: (en, t) => {
      const p = 'winback'; const ns: WFNode[] = [];
      const tr = node(p, 'trigger', 'trigger_schedule', 'Customer went quiet', 300, 40, { schedule: 'weekly' }); ns.push(tr);
      const msg = node(p, 'msg', 'send_text', 'We miss you', 300, 230, { message: txt(t, 'msg', 'We miss you, {{customer_name}}! 💛 Come see what\'s new.') }); ns.push(msg);
      const cn = [tr, msg];
      if (en.has('coupon')) { const c = node(p, 'coupon', 'send_text', 'Comeback offer', 300, 420, { message: txt(t, 'coupon', 'Here\'s 15% off your next order — use WELCOME15. 🎁') }); ns.push(c); cn.push(c); }
      const cat = node(p, 'catalog', 'show_catalog', 'Show what\'s new', 300, 610, { header: 'New arrivals' }); ns.push(cat); cn.push(cat);
      return { nodes: ns, edges: chain(cn) };
    },
  },
  {
    key: 'birthday', name: 'Birthday & anniversary', icon: 'pi-gift', category: 'crm', scales: ['small', 'medium', 'large'],
    description: 'Send a warm greeting (and optional treat) on special days.',
    features: [feat('coupon', 'Include a birthday treat')],
    generate: (en, t) => {
      const p = 'birthday'; const ns: WFNode[] = [];
      const tr = node(p, 'trigger', 'trigger_schedule', 'On their birthday', 300, 40, { schedule: 'daily' }); ns.push(tr);
      const msg = node(p, 'msg', 'send_text', 'Birthday greeting', 300, 230, { message: txt(t, 'msg', 'Happy birthday, {{customer_name}}! 🎂 Wishing you a wonderful day.') }); ns.push(msg);
      const cn = [tr, msg];
      if (en.has('coupon')) { const c = node(p, 'coupon', 'send_text', 'Birthday treat', 300, 420, { message: txt(t, 'coupon', 'A little gift from us: 20% off this week — use HBD20. 🎉') }); ns.push(c); cn.push(c); }
      return { nodes: ns, edges: chain(cn) };
    },
  },
  // ── Appointments ──
  {
    key: 'appointment', name: 'Appointment booking', icon: 'pi-calendar', category: 'appointments', scales: ['small', 'medium', 'large'],
    description: 'Take bookings, confirm, remind and follow up — hands-free.',
    features: [feat('reminder', 'Send a reminder'), feat('followup', 'Follow up after the visit', false)],
    generate: genAppointment,
  },
  // ── Support ──
  {
    key: 'support', name: 'Support & FAQ', icon: 'pi-question-circle', category: 'support', scales: ['small', 'medium', 'large'],
    description: 'Auto-answer common questions and route to a human when needed.',
    features: [feat('agent', 'Offer "talk to a human"'), feat('faq', 'Add a business-info reply', false)],
    generate: genSupport,
  },
];

/** Triggers available in the Custom notification builder. */
export const CUSTOM_TRIGGERS: { value: string; label: string; config: Record<string, any> }[] = [
  { value: 'trigger_order', label: 'When an order is placed', config: { event: 'created' } },
  { value: 'trigger_quote', label: 'When a quote is created', config: { event: 'created' } },
  { value: 'trigger_invoice', label: 'When an invoice is created', config: { event: 'created' } },
  { value: 'trigger_payment', label: 'When a payment is received', config: { event: 'received' } },
  { value: 'trigger_message', label: 'When a customer messages a keyword', config: { keywords: 'offer', matchType: 'contains' } },
  { value: 'trigger_schedule', label: 'On a schedule', config: { schedule: 'daily' } },
];
