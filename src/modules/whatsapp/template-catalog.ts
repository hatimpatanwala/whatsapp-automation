/**
 * Free-form equivalents of the WhatsApp message templates.
 *
 * When a recipient's 24h service window is OPEN we never send a (paid, restricted)
 * template — we send the SAME content as a free-form session message instead.
 * renderTemplateAsText() reproduces a template's body/header/footer with its
 * variables filled in, so any template send can be transparently downgraded to
 * free-form text.
 */

export interface TemplateText {
  header?: string;
  body: string;
  footer?: string;
}

/** Body/footer text (with {{n}} placeholders) for the standard library. */
export const TEMPLATE_TEXT: Record<string, TemplateText> = {
  order_confirmation: { body: "Hi {{1}}, your order #{{2}} has been confirmed! {{3}} items totalling {{4}}. We'll notify you when it ships. Thank you for shopping with us!", footer: 'Powered by WA Commerce' },
  order_shipped: { body: 'Hi {{1}}, great news! Your order #{{2}} has been shipped. {{3}} Track your delivery or reply here for updates.', footer: 'Powered by WA Commerce' },
  order_delivered: { body: 'Hi {{1}}, your order #{{2}} has been delivered! We hope you love it. Reply "HELP" if you have any issues or "REORDER" to place a new order.', footer: 'Powered by WA Commerce' },
  order_cancelled: { body: 'Hi {{1}}, your order #{{2}} has been cancelled. {{3}} If you have any questions, reply to this message.', footer: 'Powered by WA Commerce' },
  payment_received: { body: "Hi {{1}}, we've received your payment of {{2}} for order #{{3}}. Your order is now being processed. Thank you!", footer: 'Powered by WA Commerce' },
  payment_verified: { body: 'Hi {{1}}, your payment of {{2}} for order #{{3}} has been verified. Your order will be shipped soon!', footer: 'Powered by WA Commerce' },
  payment_reminder: { body: 'Hi {{1}}, a friendly reminder that payment of {{2}} is pending for your order #{{3}}. Please complete the payment to avoid cancellation. Reply "PAY" for payment options.', footer: 'Powered by WA Commerce' },
  payment_refunded: { body: 'Hi {{1}}, your refund of {{2}} for order #{{3}} has been processed. It may take 3-5 business days to reflect in your account. Reply if you need any help.', footer: 'Powered by WA Commerce' },
  delivery_update: { body: 'Hi {{1}}, delivery update for order #{{2}}: {{3}}. {{4}} — reply here if you need any help.', footer: 'Powered by WA Commerce' },
  delivery_failed: { body: 'Hi {{1}}, we were unable to deliver your order #{{2}}. Reason: {{3}}. We\'ll retry delivery tomorrow. Reply "RESCHEDULE" to pick a new time or "PICKUP" for self-collection.', footer: 'Powered by WA Commerce' },
  admin_new_order: { body: 'New order received! Order #{{1}} from {{2}} for {{3}}. Items: {{4}}. Reply "CONFIRM" to confirm or "VIEW" for details.' },
  admin_payment_received: { body: 'Payment received! {{1}} paid {{2}} for order #{{3}} via {{4}}. Reply "VERIFY" to verify or "REJECT" if suspicious.' },
  admin_low_stock: { body: 'Low stock alert! {{1}} has only {{2}} units remaining. Current threshold: {{3}}. Reply "RESTOCK" to update inventory.' },
  admin_new_customer: { body: 'New customer! {{1}} ({{2}}) just opted in to your store. You now have {{3}} customers in total. Reply VIEW for details.' },
  admin_daily_summary: { body: 'Daily Summary for {{1}}:\n- Orders: {{2}}\n- Revenue: {{3}}\n- New Customers: {{4}}\n- Messages: {{5}}\n\nReply "DETAILS" for full report.' },
  campaign_promotional: { body: 'Hi {{1}}, {{2}} Reply SHOP to browse or STOP to unsubscribe.', footer: 'Reply STOP to unsubscribe' },
  campaign_discount: { body: 'Hi {{1}}, exclusive offer just for you! Get {{2}} off on {{3}}. Use code: {{4}}. Valid until {{5}}. Reply "ORDER" to shop now!', footer: 'Reply STOP to unsubscribe' },
  abandoned_cart_reminder: { body: 'Hi {{1}}, you left {{2}} in your cart! Your items are still available. Complete your order before they sell out. Reply "CHECKOUT" to place your order.', footer: 'Reply STOP to unsubscribe' },
  back_in_stock: { body: "Hi {{1}}, great news! {{2}} is back in stock. Only {{3}} units available — grab yours before it's gone! Reply \"ORDER\" to buy now.", footer: 'Reply STOP to unsubscribe' },
  welcome_message: { body: 'Welcome to {{1}}! We\'re happy to have you here. Browse our catalog by replying "MENU" or ask us anything. We\'re here to help!' },
  order_feedback: { body: "Hi {{1}}, we hope you're enjoying your order #{{2}}! How would you rate your experience? Reply with a number 1-5 (5 being excellent)." },
  order_status_update: { body: 'Hi {{1}}, update on your order #{{2}}: {{3}}. Tap below to track your order anytime.' },
  payment_update: { body: 'Hi {{1}}, payment update for your order #{{2}}: {{3}}. Tap below to view your orders.' },
  customer_updates_teaser: { body: 'Hi {{1}}, you have {{2}} new update(s) waiting on your orders. Reply here to view them now.' },
  customer_offers_teaser: { body: "Hi {{1}}, we have {{2}} exciting offer(s) just for you! 🎁 Reply here to see what's waiting.", footer: 'Reply STOP to unsubscribe' },
  admin_updates_teaser: { body: 'You have {{1}} new store update(s) — orders, payments and alerts. Reply here to view them now.' },
};

/** Replace {{1}}, {{2}}, … with the supplied params (1-indexed). */
function fill(text: string, params: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const v = params[Number(n) - 1];
    return v !== undefined && v !== null && v !== '' ? String(v) : '';
  }).replace(/[ \t]{2,}/g, ' ').replace(/ +([.!?,])/g, '$1').trim();
}

/** Extract ordered body parameter values from WhatsApp *send* components. */
export function paramsFromComponents(components?: any[]): string[] {
  if (!Array.isArray(components)) return [];
  const body = components.find((c) => String(c?.type).toLowerCase() === 'body');
  if (!body?.parameters) return [];
  return body.parameters.map((p: any) => (p?.text ?? p?.image?.link ?? '')).map((x: any) => String(x));
}

/** Pull body/footer/header text out of *definition* components (BODY/FOOTER/HEADER with .text). */
export function textFromDefinitionComponents(components?: any[]): TemplateText | null {
  if (!Array.isArray(components)) return null;
  const body = components.find((c) => String(c?.type).toUpperCase() === 'BODY');
  if (!body?.text) return null;
  const footer = components.find((c) => String(c?.type).toUpperCase() === 'FOOTER');
  const header = components.find((c) => String(c?.type).toUpperCase() === 'HEADER');
  return { body: body.text, footer: footer?.text, header: header?.format === 'TEXT' ? header?.text : undefined };
}

/**
 * Render a template as free-form text. Resolves the template body from the known
 * catalog (by name) or from definition components, fills variables from `params`
 * (or from send components), and returns the full text — or null if it can't.
 */
export function renderTemplateAsText(
  templateName: string,
  params: string[] = [],
  components?: any[],
): string | null {
  const tpl: TemplateText | null = TEMPLATE_TEXT[templateName] || textFromDefinitionComponents(components);
  if (!tpl) return null;
  const p = params.length ? params : paramsFromComponents(components);
  let out = '';
  if (tpl.header) out += `*${fill(tpl.header, p)}*\n\n`;
  out += fill(tpl.body, p);
  if (tpl.footer) out += `\n\n_${tpl.footer}_`;
  return out.trim();
}
