import { createHmac } from 'crypto';

/**
 * Provider abstraction (PAYMENTS_MODULE_README §6.1): the ERP never knows which
 * gateway is in use. Adapters: manual (Mode A), Razorpay Smart Collect (Mode B
 * virtual UPI), Razorpay payment links (Mode C). Credentials arrive per call —
 * they live encrypted per tenant, never in the adapter.
 */

export interface ProviderCreds {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

export interface CollectionHandle {
  provider: string;
  providerRef?: string;
  virtualUpiId?: string;
  payLink?: string;
  upiIntent?: string;
}

export interface NormalizedPaymentEvent {
  providerEventId: string;
  eventType: string;
  referenceId?: string;
  providerRef?: string;
  virtualUpiId?: string;
  amount?: number;
  method?: string;
  paid: boolean;
}

const RZP_API = 'https://api.razorpay.com/v1';

function rzpAuth(creds: ProviderCreds): string {
  return 'Basic ' + Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
}

/** HMAC-SHA256 webhook signature check (Razorpay convention). Constant-time compare. */
export function verifyRazorpaySignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  if (!signature || !webhookSecret) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** Mode A: nothing external — the dynamic UPI intent is built from the merchant's own VPA. */
export function manualCollection(vpa: string, payeeName: string, amount: number, referenceId: string): CollectionHandle {
  const intent =
    `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName || 'Merchant')}` +
    `&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(referenceId)}`;
  return { provider: 'manual', upiIntent: intent };
}

/** Mode C: Razorpay payment link (30-min+ expiry per the spec's link-expiry note). */
export async function razorpayPaymentLink(
  creds: ProviderCreds, amount: number, referenceId: string, description: string, customer?: { name?: string; contact?: string },
): Promise<CollectionHandle> {
  const res = await fetch(`${RZP_API}/payment_links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: rzpAuth(creds) },
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      currency: 'INR',
      reference_id: referenceId.slice(0, 40),
      description: description.slice(0, 250),
      expire_by: Math.floor(Date.now() / 1000) + 45 * 60,
      customer: customer?.contact ? { name: customer.name, contact: customer.contact } : undefined,
      notify: { sms: false, email: false },
    }),
  });
  const body: any = await res.json();
  if (!res.ok) throw new Error(body?.error?.description || `Razorpay link failed (${res.status})`);
  return { provider: 'razorpay', providerRef: body.id, payLink: body.short_url };
}

/** Mode B: Razorpay Smart Collect virtual account with a per-invoice VPA. */
export async function razorpayVirtualAccount(
  creds: ProviderCreds, referenceId: string, description: string,
): Promise<CollectionHandle> {
  const res = await fetch(`${RZP_API}/virtual_accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: rzpAuth(creds) },
    body: JSON.stringify({
      receivers: { types: ['vpa'] },
      description: description.slice(0, 250),
      notes: { reference_id: referenceId },
    }),
  });
  const body: any = await res.json();
  if (!res.ok) throw new Error(body?.error?.description || `Smart Collect failed (${res.status})`);
  const vpa = body?.receivers?.find((r: any) => r.entity === 'vpa')?.address;
  return { provider: 'razorpay-smart', providerRef: body.id, virtualUpiId: vpa };
}

/** Server-initiated refund (Mode C). */
export async function razorpayRefund(creds: ProviderCreds, paymentId: string, amount: number): Promise<string> {
  const res = await fetch(`${RZP_API}/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: rzpAuth(creds) },
    body: JSON.stringify({ amount: Math.round(amount * 100) }),
  });
  const body: any = await res.json();
  if (!res.ok) throw new Error(body?.error?.description || `Refund failed (${res.status})`);
  return body.id;
}

/** Normalise the Razorpay webhook families we care about into one event shape. */
export function parseRazorpayEvent(payload: any): NormalizedPaymentEvent | null {
  const type = payload?.event as string;
  if (!type) return null;
  const eventId = payload?.id || `${type}:${payload?.created_at}`;

  if (type === 'payment_link.paid') {
    const link = payload?.payload?.payment_link?.entity;
    const pay = payload?.payload?.payment?.entity;
    return {
      providerEventId: eventId, eventType: type, paid: true,
      referenceId: link?.reference_id, providerRef: pay?.id || link?.id,
      amount: (Number(pay?.amount ?? link?.amount_paid) || 0) / 100,
      method: pay?.method || 'link',
    };
  }
  if (type === 'virtual_account.credited') {
    const va = payload?.payload?.virtual_account?.entity;
    const pay = payload?.payload?.payment?.entity;
    return {
      providerEventId: eventId, eventType: type, paid: true,
      referenceId: va?.notes?.reference_id, providerRef: pay?.id || va?.id,
      virtualUpiId: va?.receivers?.find((r: any) => r.entity === 'vpa')?.address,
      amount: (Number(pay?.amount) || 0) / 100,
      method: pay?.method || 'upi',
    };
  }
  if (type === 'payment.captured') {
    const pay = payload?.payload?.payment?.entity;
    return {
      providerEventId: eventId, eventType: type, paid: true,
      referenceId: pay?.notes?.reference_id, providerRef: pay?.id,
      amount: (Number(pay?.amount) || 0) / 100, method: pay?.method,
    };
  }
  if (type === 'payment.failed') {
    const pay = payload?.payload?.payment?.entity;
    return {
      providerEventId: eventId, eventType: type, paid: false,
      referenceId: pay?.notes?.reference_id, providerRef: pay?.id,
      amount: (Number(pay?.amount) || 0) / 100, method: pay?.method,
    };
  }
  return { providerEventId: eventId, eventType: type, paid: false };
}
