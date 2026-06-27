import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

export interface CartItemInput {
  productId?: string;
  quantity: number;
  unitPrice: number;
}

export interface ApplicableScheme {
  schemeId: string;
  name: string;
  description: string;
  action: string;
  scope: string;
  combinable: boolean;
  weight: number;
  discount: number;          // money saved if this scheme is applied
  label: string;             // short badge text, e.g. "10% OFF"
}

export interface EvaluateResult {
  subtotal: number;
  applicable: ApplicableScheme[];
  recommendedIds: string[];  // auto-selected default (respecting weight/combinable)
  discountTotal: number;     // discount for the recommended set
}

@Injectable()
export class PromotionsEngine {
  constructor(private readonly conn: TenantConnectionManager) {}

  /** Evaluate a cart against active instant schemes → applicable offers + recommended selection. */
  async evaluateCart(schema: string, items: CartItemInput[], customerId?: string): Promise<EvaluateResult> {
    const lines = (items || []).filter((i) => i && i.productId && Number(i.quantity) > 0);
    const subtotal = (items || []).reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
    if (!lines.length) return { subtotal, applicable: [], recommendedIds: [], discountTotal: 0 };

    return this.conn.executeInTenantContext(schema, async (qr) => {
      // Map each cart product → its category/brand.
      const ids = [...new Set(lines.map((l) => l.productId))];
      const prodRows = await qr.query(
        `SELECT id, category_id, brand_id FROM products WHERE id = ANY($1)`,
        [ids],
      );
      const meta = new Map<string, { categoryId?: string; brandId?: string }>();
      prodRows.forEach((r: any) => meta.set(r.id, { categoryId: r.category_id, brandId: r.brand_id }));

      // Active, in-window, instant discount schemes for this audience.
      const schemes = await qr.query(
        `SELECT s.* FROM schemes s
          WHERE s.status = 'active' AND s.type = 'instant' AND s.action = 'discount'
            AND (s.valid_from IS NULL OR s.valid_from <= NOW())
            AND (s.valid_until IS NULL OR s.valid_until >= NOW())
            AND (s.audience = 'all' OR ($1::uuid IS NOT NULL AND EXISTS (
                  SELECT 1 FROM scheme_customers sc WHERE sc.scheme_id = s.id AND sc.customer_id = $1)))
          ORDER BY s.weight DESC`,
        [customerId || null],
      );

      const applicable: ApplicableScheme[] = [];
      for (const s of schemes) {
        const cfg = typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {});
        const scopeIds: string[] = s.scope_ids || [];

        // Lines this scheme covers.
        const matched = lines.filter((l) => {
          const m = meta.get(l.productId!) || {};
          if (s.scope === 'all') return true;
          if (s.scope === 'product') return scopeIds.includes(l.productId!);
          if (s.scope === 'category') return !!m.categoryId && scopeIds.includes(m.categoryId);
          if (s.scope === 'brand') return !!m.brandId && scopeIds.includes(m.brandId);
          return false;
        });
        if (!matched.length) continue;

        const matchedTotal = matched.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);
        const matchedQty = matched.reduce((sum, l) => sum + Number(l.quantity), 0);

        // Conditions.
        if (cfg.minQty && matchedQty < Number(cfg.minQty)) continue;
        if (cfg.minCartValue && subtotal < Number(cfg.minCartValue)) continue;

        // Discount.
        let discount = 0;
        let label = '';
        if (cfg.discountType === 'amount') {
          discount = Math.min(Number(cfg.discountValue) || 0, matchedTotal);
          label = `₹${cfg.discountValue} OFF`;
        } else {
          const pct = Number(cfg.discountValue) || 0;
          discount = Math.round(matchedTotal * pct) / 100;
          label = `${pct}% OFF`;
        }
        if (discount <= 0) continue;

        applicable.push({
          schemeId: s.id, name: s.name, description: s.description || '',
          action: s.action, scope: s.scope, combinable: !!s.combinable,
          weight: Number(s.weight) || 0, discount: Math.round(discount * 100) / 100, label,
        });
      }

      const { ids: recommendedIds, total: discountTotal } = this.select(applicable);
      return { subtotal, applicable, recommendedIds, discountTotal };
    });
  }

  /**
   * Default selection: combinable schemes stack; a non-combinable scheme applies
   * alone (highest weight, then discount). Pick whichever saves more.
   */
  select(applicable: ApplicableScheme[], appliedIds?: string[]): { ids: string[]; total: number } {
    if (!applicable.length) return { ids: [], total: 0 };

    // Explicit selection (from the user): enforce the combinable rule.
    if (appliedIds && appliedIds.length) {
      const chosen = applicable.filter((a) => appliedIds.includes(a.schemeId));
      const nonComb = chosen.find((a) => !a.combinable);
      // A non-combinable selection wins alone (highest weight among chosen non-combinables).
      if (nonComb) {
        const best = chosen.filter((a) => !a.combinable).sort((a, b) => b.weight - a.weight || b.discount - a.discount)[0];
        return { ids: [best.schemeId], total: best.discount };
      }
      return { ids: chosen.map((a) => a.schemeId), total: round(chosen.reduce((s, a) => s + a.discount, 0)) };
    }

    const combinables = applicable.filter((a) => a.combinable);
    const nonCombinables = applicable.filter((a) => !a.combinable);
    const stackTotal = combinables.reduce((s, a) => s + a.discount, 0);
    const bestNon = nonCombinables.sort((a, b) => b.weight - a.weight || b.discount - a.discount)[0];

    if (bestNon && bestNon.discount > stackTotal) {
      return { ids: [bestNon.schemeId], total: round(bestNon.discount) };
    }
    return { ids: combinables.map((a) => a.schemeId), total: round(stackTotal) };
  }

  /** Per-entity best-discount badges for product display (catalog / search). */
  async productBadges(schema: string): Promise<{ all?: string; categories: Record<string, string>; brands: Record<string, string>; products: Record<string, string> }> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      const schemes = await qr.query(
        `SELECT scope, scope_ids, conditions FROM schemes
          WHERE status = 'active' AND type = 'instant' AND action = 'discount' AND audience = 'all'
            AND (valid_from IS NULL OR valid_from <= NOW())
            AND (valid_until IS NULL OR valid_until >= NOW())
          ORDER BY weight DESC`,
      );
      const out = { all: undefined as string | undefined, categories: {} as Record<string, string>, brands: {} as Record<string, string>, products: {} as Record<string, string> };
      for (const s of schemes) {
        const cfg = typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {});
        const label = cfg.discountType === 'amount' ? `₹${cfg.discountValue} OFF` : `${Number(cfg.discountValue) || 0}% OFF`;
        if (cfg.minQty || cfg.minCartValue) continue; // conditional offers aren't shown as a flat product badge
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
