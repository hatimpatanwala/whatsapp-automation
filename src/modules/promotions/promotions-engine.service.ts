import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

export interface CartItemInput {
  productId?: string;
  quantity: number;
  unitPrice: number;
}

export interface FreeItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number; // original price (the value given away); added to the order at 0
}

export interface ApplicableScheme {
  schemeId: string;
  name: string;
  description: string;
  action: string;
  scope: string;
  combinable: boolean;
  weight: number;
  discount: number;        // money discount (0 for free-item schemes)
  freeItems: FreeItem[];   // free items granted (empty for discount schemes)
  saving: number;          // discount + value of free items (for ranking)
  label: string;           // short badge text
}

export interface EvaluateResult {
  subtotal: number;
  applicable: ApplicableScheme[];
  recommendedIds: string[];
  discountTotal: number;   // discount for the recommended set
  freeItems: FreeItem[];   // free items for the recommended set
}

@Injectable()
export class PromotionsEngine {
  constructor(private readonly conn: TenantConnectionManager) {}

  /** Evaluate a cart against active instant schemes → applicable offers + recommended selection. */
  async evaluateCart(schema: string, items: CartItemInput[], customerId?: string): Promise<EvaluateResult> {
    const lines = (items || []).filter((i) => i && i.productId && Number(i.quantity) > 0);
    const subtotal = (items || []).reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
    if (!lines.length) return { subtotal, applicable: [], recommendedIds: [], discountTotal: 0, freeItems: [] };

    return this.conn.executeInTenantContext(schema, async (qr) => {
      // Cart products → category/brand/name/price.
      const ids = [...new Set(lines.map((l) => l.productId))];
      const prodRows = await qr.query(
        `SELECT id, category_id, brand_id, name, COALESCE(sale_price, base_price) AS price FROM products WHERE id = ANY($1)`,
        [ids],
      );
      const meta = new Map<string, { categoryId?: string; brandId?: string; name: string; price: number }>();
      prodRows.forEach((r: any) => meta.set(r.id, { categoryId: r.category_id, brandId: r.brand_id, name: r.name, price: Number(r.price) || 0 }));

      const schemes = await qr.query(
        `SELECT s.* FROM schemes s
          WHERE s.status = 'active' AND s.type = 'instant'
            AND (s.valid_from IS NULL OR s.valid_from <= NOW())
            AND (s.valid_until IS NULL OR s.valid_until >= NOW())
            AND (s.audience = 'all' OR ($1::uuid IS NOT NULL AND EXISTS (
                  SELECT 1 FROM scheme_customers sc WHERE sc.scheme_id = s.id AND sc.customer_id = $1)))
          ORDER BY s.weight DESC`,
        [customerId || null],
      );

      // Resolve "get free" products referenced by buy_x_get_y schemes.
      const getIds = [...new Set(schemes.map((s: any) => (typeof s.conditions === 'string' ? JSON.parse(s.conditions) : s.conditions || {}).getProductId).filter(Boolean))] as string[];
      const getProds = new Map<string, { name: string; price: number }>();
      if (getIds.length) {
        const rows = await qr.query(`SELECT id, name, COALESCE(sale_price, base_price) AS price FROM products WHERE id = ANY($1)`, [getIds]);
        rows.forEach((r: any) => getProds.set(r.id, { name: r.name, price: Number(r.price) || 0 }));
      }

      const applicable: ApplicableScheme[] = [];
      for (const s of schemes) {
        const cfg = typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {});
        const scopeIds: string[] = s.scope_ids || [];

        const matched = lines.filter((l) => {
          const m = meta.get(l.productId!) || ({} as any);
          if (s.scope === 'all') return true;
          if (s.scope === 'product') return scopeIds.includes(l.productId!);
          if (s.scope === 'category') return !!m.categoryId && scopeIds.includes(m.categoryId);
          if (s.scope === 'brand') return !!m.brandId && scopeIds.includes(m.brandId);
          return false;
        });
        if (!matched.length) continue;

        const matchedTotal = matched.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);
        const matchedQty = matched.reduce((sum, l) => sum + Number(l.quantity), 0);

        if (cfg.minCartValue && subtotal < Number(cfg.minCartValue)) continue;

        let discount = 0;
        let freeItems: FreeItem[] = [];
        let label = '';

        if (s.action === 'discount' || s.action === 'qty_discount') {
          if (cfg.minQty && matchedQty < Number(cfg.minQty)) continue;
          if (cfg.discountType === 'amount') {
            discount = Math.min(Number(cfg.discountValue) || 0, matchedTotal);
            label = `₹${cfg.discountValue} OFF`;
          } else {
            const pct = Number(cfg.discountValue) || 0;
            discount = round(matchedTotal * pct / 100);
            label = `${pct}% OFF`;
          }
          if (discount <= 0) continue;
        } else if (s.action === 'buy_x_get_x_free') {
          // Same product free: for each matching line, every buyQty paid → getQty free.
          const buyQty = Math.max(1, Number(cfg.buyQty) || 1);
          const getQty = Math.max(1, Number(cfg.getQty) || 1);
          for (const l of matched) {
            const sets = Math.floor(Number(l.quantity) / buyQty);
            const freeQ = sets * getQty;
            if (freeQ > 0) {
              const m = meta.get(l.productId!)!;
              freeItems.push({ productId: l.productId!, name: m.name, quantity: freeQ, unitPrice: m.price });
            }
          }
          if (!freeItems.length) continue;
          label = `Buy ${buyQty} Get ${getQty}`;
        } else if (s.action === 'buy_x_get_y_free') {
          // Different product free: every buyQty of scoped products → getQty of the gift.
          const buyQty = Math.max(1, Number(cfg.buyQty) || 1);
          const getQty = Math.max(1, Number(cfg.getQty) || 1);
          const gift = cfg.getProductId ? getProds.get(cfg.getProductId) : null;
          if (!gift || !cfg.getProductId) continue;
          const sets = Math.floor(matchedQty / buyQty);
          const freeQ = sets * getQty;
          if (freeQ <= 0) continue;
          freeItems.push({ productId: cfg.getProductId, name: gift.name, quantity: freeQ, unitPrice: gift.price });
          label = `Free ${gift.name}`;
        } else {
          continue;
        }

        const freeValue = freeItems.reduce((s2, f) => s2 + f.quantity * f.unitPrice, 0);
        applicable.push({
          schemeId: s.id, name: s.name, description: s.description || '', action: s.action, scope: s.scope,
          combinable: !!s.combinable, weight: Number(s.weight) || 0,
          discount: round(discount), freeItems, saving: round(discount + freeValue), label,
        });
      }

      const sel = this.select(applicable);
      return { subtotal, applicable, recommendedIds: sel.ids, discountTotal: sel.discount, freeItems: sel.freeItems };
    });
  }

  /**
   * Default selection: combinable schemes stack; a non-combinable scheme applies
   * alone (highest weight, then saving). Pick whichever saves more.
   */
  select(applicable: ApplicableScheme[], appliedIds?: string[]): { ids: string[]; discount: number; freeItems: FreeItem[] } {
    if (!applicable.length) return { ids: [], discount: 0, freeItems: [] };

    const pack = (list: ApplicableScheme[]) => ({
      ids: list.map((a) => a.schemeId),
      discount: round(list.reduce((s, a) => s + a.discount, 0)),
      freeItems: list.flatMap((a) => a.freeItems),
    });

    if (appliedIds && appliedIds.length) {
      const chosen = applicable.filter((a) => appliedIds.includes(a.schemeId));
      const nonComb = chosen.filter((a) => !a.combinable);
      if (nonComb.length) {
        const best = [...nonComb].sort((a, b) => b.weight - a.weight || b.saving - a.saving)[0];
        return pack([best]);
      }
      return pack(chosen);
    }

    const combinables = applicable.filter((a) => a.combinable);
    const nonCombinables = applicable.filter((a) => !a.combinable);
    const stackSaving = combinables.reduce((s, a) => s + a.saving, 0);
    const bestNon = [...nonCombinables].sort((a, b) => b.weight - a.weight || b.saving - a.saving)[0];

    if (bestNon && bestNon.saving > stackSaving) return pack([bestNon]);
    return pack(combinables);
  }

  /** Per-entity best badges for product display (catalog / search). */
  async productBadges(schema: string): Promise<{ all?: string; categories: Record<string, string>; brands: Record<string, string>; products: Record<string, string> }> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      const schemes = await qr.query(
        `SELECT scope, scope_ids, action, conditions FROM schemes
          WHERE status = 'active' AND type = 'instant' AND audience = 'all'
            AND (valid_from IS NULL OR valid_from <= NOW())
            AND (valid_until IS NULL OR valid_until >= NOW())
          ORDER BY weight DESC`,
      );
      const out = { all: undefined as string | undefined, categories: {} as Record<string, string>, brands: {} as Record<string, string>, products: {} as Record<string, string> };
      for (const s of schemes) {
        const cfg = typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {});
        if (cfg.minCartValue) continue; // cart-level conditions aren't shown as a flat product badge
        let label = '';
        if (s.action === 'discount' || s.action === 'qty_discount') label = cfg.discountType === 'amount' ? `₹${cfg.discountValue} OFF` : `${Number(cfg.discountValue) || 0}% OFF`;
        else if (s.action === 'buy_x_get_x_free') label = `Buy ${cfg.buyQty || 1} Get ${cfg.getQty || 1}`;
        else if (s.action === 'buy_x_get_y_free') label = `FREE GIFT`;
        if (!label) continue;
        if (s.scope === 'all') { if (!out.all) out.all = label; }
        else if (s.scope === 'category') { for (const id of s.scope_ids || []) if (!out.categories[id]) out.categories[id] = label; }
        else if (s.scope === 'brand') { for (const id of s.scope_ids || []) if (!out.brands[id]) out.brands[id] = label; }
        else if (s.scope === 'product') { for (const id of s.scope_ids || []) if (!out.products[id]) out.products[id] = label; }
      }
      return out;
    });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
