/**
 * Tables replicated between a distributor's local (embedded-Postgres) DB and the cloud.
 * Phase 2 slice 1 = master data. Keep this list in lock-step with the tables wired in
 * tenant migration `059_sync_infrastructure` (index.ts SYNC_TABLES_059).
 */
export const SYNCABLE_TABLES = [
  // master data (migration 059) — parents first so version-ordered apply satisfies FKs
  'customers',
  'categories',
  'brands',
  'products',
  'product_variants',
  'suppliers',
  'erp_tax_rates',
  'erp_warehouses',
  // transactional documents (migration 060)
  'orders',
  'order_items',
  'invoices',
  'quotes',
  'quote_items',
  'payments',
  'deliveries',
] as const;

export type SyncableTable = (typeof SYNCABLE_TABLES)[number];

/** Max rows returned/applied per sync request. */
export const MAX_SYNC_BATCH = 500;

/** Env var holding the shared key that authorises the desktop → local-backend sync calls. */
export const SYNC_LOCAL_KEY_ENV = 'SYNC_LOCAL_KEY';
