import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

/**
 * Price levels (Tally price lists / Miracle rate structures) + per-party credit control.
 * Levels hold per-product rates; each customer can be assigned a level, which then wins
 * as the billing rate. Credit limit/days feed the sales-entry warning and overdue checks.
 */
@Injectable()
export class PricingService {
  constructor(private readonly cm: TenantConnectionManager) {}

  listLevels(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT pl.*, COUNT(pli.id)::int AS rate_count
         FROM "${schema}".price_levels pl
         LEFT JOIN "${schema}".price_list_items pli ON pli.price_level_id = pl.id
         GROUP BY pl.id ORDER BY pl.name`,
      ),
    );
  }

  async createLevel(schema: string, name: string) {
    if (!name?.trim()) throw new BadRequestException('Price level needs a name');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${schema}".price_levels (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET updated_at = NOW() RETURNING *`,
        [name.trim()],
      );
      return rows[0];
    });
  }

  levelRates(schema: string, levelId: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT pli.product_id, p.name AS product_name, p.sale_price, p.base_price, pli.rate
         FROM "${schema}".price_list_items pli
         JOIN "${schema}".products p ON p.id = pli.product_id
         WHERE pli.price_level_id = $1
         ORDER BY p.name`,
        [levelId],
      ),
    );
  }

  /** Upsert a batch of product rates for a level (rate <= 0 deletes the entry). */
  async saveLevelRates(schema: string, levelId: string, items: Array<{ productId: string; rate: number }>) {
    if (!items?.length) return { saved: 0 };
    return this.cm.executeInTransaction(schema, async (qr) => {
      let saved = 0;
      for (const it of items) {
        if (!it.productId) continue;
        const rate = Number(it.rate) || 0;
        if (rate <= 0) {
          await qr.query(
            `DELETE FROM "${schema}".price_list_items WHERE price_level_id = $1 AND product_id = $2`,
            [levelId, it.productId],
          );
        } else {
          await qr.query(
            `INSERT INTO "${schema}".price_list_items (price_level_id, product_id, rate)
             VALUES ($1, $2, $3)
             ON CONFLICT (price_level_id, product_id) DO UPDATE SET rate = EXCLUDED.rate, updated_at = NOW()`,
            [levelId, it.productId, rate],
          );
        }
        saved++;
      }
      return { saved };
    });
  }

  /** Per-party billing settings: price level + credit limit/days. */
  async updateCustomerSettings(
    schema: string,
    customerId: string,
    input: { priceLevelId?: string | null; creditLimit?: number | null; creditDays?: number | null },
  ) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `UPDATE "${schema}".customers
         SET price_level_id = $1, credit_limit = $2, credit_days = $3
         WHERE id = $4
         RETURNING id, price_level_id, credit_limit, credit_days`,
        [input.priceLevelId ?? null, input.creditLimit ?? null, input.creditDays ?? null, customerId],
      );
      if (!rows[0]) throw new BadRequestException(`Customer ${customerId} not found`);
      return rows[0];
    });
  }
}
