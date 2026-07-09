/**
 * The canonical catalog of permissionable features (RBAC). A role/user holds a
 * level per feature: 'none' | 'read' | 'write' ('write' implies 'read'). Keep in
 * lock-step with the frontend PermissionService feature list and the seed in
 * tenant migration 079_rbac.
 */
export const ACCESS_FEATURES: { key: string; label: string; group: string }[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'Overview' },
  { key: 'orders', label: 'Orders', group: 'Sales' },
  { key: 'invoices', label: 'Invoices', group: 'Sales' },
  { key: 'quotes', label: 'Quotes', group: 'Sales' },
  { key: 'salesmen', label: 'Salesmen (Field App)', group: 'Sales' },
  { key: 'schemes', label: 'Schemes & Offers', group: 'Sales' },
  { key: 'purchases', label: 'Purchases', group: 'Purchases' },
  { key: 'suppliers', label: 'Suppliers', group: 'Purchases' },
  { key: 'customers', label: 'Customers', group: 'Customers' },
  { key: 'products', label: 'Products / Items', group: 'Catalog' },
  { key: 'inventory', label: 'Inventory & Stock', group: 'Catalog' },
  { key: 'payments', label: 'Payments', group: 'Accounting' },
  { key: 'accounting', label: 'Accounting / Ledgers', group: 'Accounting' },
  { key: 'gst', label: 'GST Returns', group: 'Accounting' },
  { key: 'reports', label: 'Reports', group: 'Insights' },
  { key: 'settings', label: 'Business Settings', group: 'Admin' },
  { key: 'employees', label: 'Employees & Roles', group: 'Admin' },
];

export const FEATURE_KEYS = ACCESS_FEATURES.map((f) => f.key);

export type Level = 'none' | 'read' | 'write';

/** Does `have` satisfy `need`? write ⊇ read ⊇ none. */
export function levelSatisfies(have: Level | undefined, need: 'read' | 'write'): boolean {
  const rank: Record<string, number> = { none: 0, read: 1, write: 2 };
  return (rank[have || 'none'] || 0) >= rank[need];
}

/** A full all-write map (the Owner role / owner bypass). */
export function fullAccess(): Record<string, Level> {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, 'write' as Level]));
}
