/**
 * Shared find-or-create + backfill for the product taxonomy (categories/brands).
 *
 * These two tenant tables are the SINGLE source of truth for product taxonomy —
 * the portal (catalog management, shop, promos), the ERP item master and reports
 * all read them via products.category_id / products.brand_id. Historic text
 * stores (products.metadata.category/brand written by the Miracle importer,
 * custom_fields.brand written by the old ERP item-master free-text field) are
 * linked back to real rows here — and the consumed text keys are REMOVED, so a
 * later manual clear of the FK can never be resurrected from stale text.
 * Used by the Miracle import (after every run) and tenant migration 091.
 */

/** Minimal query surface shared by TypeORM QueryRunner and raw clients. */
export interface Queryable {
  query(sql: string, params?: any[]): Promise<any[]>;
}

const slugify = (name: string, fallback: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

/**
 * Find-or-create one taxonomy row. Case-insensitive, whitespace-tolerant name
 * match preferring the ACTIVE row; a soft-deleted match is reactivated (the
 * portal lists filter `WHERE is_active = true`, so linking products to a hidden
 * row would reproduce the invisible-taxonomy bug this util exists to fix).
 * The insert races a concurrent portal create on the UNIQUE slug — ON CONFLICT
 * DO NOTHING + re-select settles it. Returns the row id, or null for a blank name.
 */
async function findOrCreate(qr: Queryable, schema: string, table: 'categories' | 'brands', rawName: string): Promise<string | null> {
  const name = String(rawName || '').trim().slice(0, 250);
  if (!name) return null;
  const hit = (await qr.query(
    `SELECT id, is_active FROM "${schema}".${table}
     WHERE lower(trim(name)) = lower($1)
     ORDER BY is_active DESC NULLS LAST, created_at ASC LIMIT 1`,
    [name],
  ))[0];
  if (hit) {
    if (hit.is_active !== true) {
      await qr.query(`UPDATE "${schema}".${table} SET is_active = true WHERE id = $1`, [hit.id]);
    }
    return hit.id;
  }
  const base = slugify(name, table === 'brands' ? 'brand' : 'category');
  let slug = base;
  let n = 1;
  while ((await qr.query(`SELECT 1 FROM "${schema}".${table} WHERE slug = $1 LIMIT 1`, [slug])).length) {
    slug = `${base}-${++n}`;
  }
  const row = (await qr.query(
    `INSERT INTO "${schema}".${table} (name, slug, is_active) VALUES ($1, $2, true)
     ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [name, slug],
  ))[0];
  if (row?.id) return row.id;
  // Lost the slug race — the winner's row carries the name now.
  const again = (await qr.query(
    `SELECT id FROM "${schema}".${table} WHERE lower(trim(name)) = lower($1) ORDER BY is_active DESC NULLS LAST LIMIT 1`,
    [name],
  ))[0];
  return again?.id ?? null;
}

export const findOrCreateCategory = (qr: Queryable, schema: string, name: string) => findOrCreate(qr, schema, 'categories', name);
export const findOrCreateBrand = (qr: Queryable, schema: string, name: string) => findOrCreate(qr, schema, 'brands', name);

/**
 * Link every product whose taxonomy still lives as text to real rows:
 *   metadata->>'category'                          → products.category_id
 *   custom_fields->>'brand', metadata->>'brand'    → products.brand_id
 * custom_fields.brand (a deliberate ERP user edit) outranks the imported
 * metadata.brand, hence two passes in that order. Consumed text keys are
 * stripped in the same UPDATE. Idempotent and additive — an already-assigned
 * FK is never overwritten, so manual re-categorisation survives re-runs.
 *
 * OFFLINE REPLICAS SKIP THIS ENTIRELY (sync.role = 'node', set by the desktop
 * installer): running it locally would mint different UUIDs for the same names
 * as the cloud's run, and the sync relay would then push same-slug/different-id
 * rows into /sync/apply, aborting the batch on the UNIQUE slug and wedging the
 * outbox. The cloud's backfill rows reach nodes through normal sync instead.
 */
export async function backfillProductTaxonomy(qr: Queryable, schema: string): Promise<void> {
  const role = (await qr.query(`SELECT current_setting('sync.role', true) AS role`))[0]?.role;
  if (role === 'node') return;

  const cats: Array<{ name: string }> = await qr.query(
    `SELECT DISTINCT trim(metadata->>'category') AS name
     FROM "${schema}".products
     WHERE NULLIF(trim(metadata->>'category'), '') IS NOT NULL AND category_id IS NULL
     ORDER BY 1`,
  );
  for (const g of cats) {
    const id = await findOrCreateCategory(qr, schema, g.name);
    if (!id) continue;
    await qr.query(
      `UPDATE "${schema}".products SET category_id = $1, metadata = metadata - 'category'
       WHERE category_id IS NULL AND lower(trim(metadata->>'category')) = lower($2)`,
      [id, String(g.name).trim()],
    );
  }

  for (const source of ['custom_fields', 'metadata'] as const) {
    const brands: Array<{ name: string }> = await qr.query(
      `SELECT DISTINCT trim(${source}->>'brand') AS name
       FROM "${schema}".products
       WHERE NULLIF(trim(${source}->>'brand'), '') IS NOT NULL AND brand_id IS NULL
       ORDER BY 1`,
    );
    for (const b of brands) {
      const id = await findOrCreateBrand(qr, schema, b.name);
      if (!id) continue;
      await qr.query(
        `UPDATE "${schema}".products
         SET brand_id = $1, metadata = metadata - 'brand', custom_fields = custom_fields - 'brand'
         WHERE brand_id IS NULL AND lower(trim(${source}->>'brand')) = lower($2)`,
        [id, String(b.name).trim()],
      );
    }
  }
}
