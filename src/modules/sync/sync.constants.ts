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
  // full-coverage masters + stock (migration 077)
  'price_levels',
  'price_list_items',
  'addresses',
  'inventory',
  'erp_stock',
  'item_batches',
  'salesmen',
  // transactional documents (migration 060)
  'orders',
  'order_items',
  'invoices',
  'quotes',
  'quote_items',
  'payments',
  'deliveries',
  // purchases + collections + SFA follow-ups (migration 077)
  'supplier_orders',
  'supplier_order_items',
  'payment_methods',
  'payment_collections',
  'payment_promises',
  // full SFA module (migration 083)
  'salesman_beats',
  'salesman_targets',
  'salesman_visits',
  // accounting / GL, returns, expenses, banking, stock movements (migration 097)
  // parents first so version-ordered apply satisfies FKs (ledgers → vouchers → entries)
  'ledger_groups',
  'ledger_accounts',
  'vouchers',
  'voucher_entries',
  'expense_categories',
  'expenses',
  'bank_accounts',
  'credit_notes',
  'debit_notes',
  'inventory_movements',
  // user-customizable document templates (migration 099)
  'document_templates',
] as const;

export type SyncableTable = (typeof SYNCABLE_TABLES)[number];

/** Max rows returned/applied per sync request. */
export const MAX_SYNC_BATCH = 500;

/** Env var holding the shared key that authorises the desktop → local-backend sync calls. */
export const SYNC_LOCAL_KEY_ENV = 'SYNC_LOCAL_KEY';
