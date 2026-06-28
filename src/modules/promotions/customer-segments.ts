/**
 * Deterministic, per-customer segment predicates used for audience='segment'
 * targeting of schemes & coupons. Evaluated against the customers row (and the
 * customer's active cart) for the given customer. `qr` must already be bound to
 * the tenant schema.
 */
export async function customerSegmentFlags(qr: any, customerId: string): Promise<Record<string, boolean>> {
  if (!customerId) return {};
  const r = (await qr.query(
    `SELECT
        (c.total_orders >= 3)                                            AS high_orders,
        (c.total_orders BETWEEN 1 AND 2)                                 AS low_orders,
        (c.total_orders > 1)                                             AS repeat,
        (c.total_spent > 0)                                              AS top,
        (c.created_at >= NOW() - INTERVAL '30 days')                     AS new,
        (c.last_order_at IS NULL OR c.last_order_at < NOW() - INTERVAL '60 days') AS inactive,
        EXISTS (SELECT 1 FROM carts ca JOIN cart_items ci ON ci.cart_id = ca.id
                 WHERE ca.customer_id = c.id AND ca.status = 'active')   AS pending_cart
       FROM customers c WHERE c.id = $1`,
    [customerId],
  ))[0];
  return r || {};
}

/** Segments offered for scheme/coupon targeting (blocked/top excluded — see UI). */
export const TARGETABLE_SEGMENTS = [
  { value: 'high_orders', label: 'High-order customers (3+)' },
  { value: 'low_orders', label: 'Low-order customers (1–2)' },
  { value: 'repeat', label: 'Repeat customers' },
  { value: 'new', label: 'New customers (last 30 days)' },
  { value: 'inactive', label: 'Inactive customers (60+ days)' },
  { value: 'pending_cart', label: 'Pending-cart customers' },
];
