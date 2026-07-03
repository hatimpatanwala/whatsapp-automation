import { app } from 'electron';
import * as path from 'path';

/**
 * Resolves the parent NestJS project + Angular build + local data locations for both
 * `npm run dev` (source tree) and a packaged install.
 *
 * Packaged layout (Phase 6) bundles the backend build under
 * `resources/backend` via electron-builder `extraResources`.
 */
export function parentRoot(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'backend');
  // dev: desktop/dist/main.js → parent root is two levels up.
  return path.resolve(__dirname, '..', '..');
}

/** Compiled backend entry the local server is forked from (`npm run build` in parent). */
export function backendEntry(): string {
  return path.join(parentRoot(), 'dist', 'main.js');
}

/** Angular production build the local backend serves as the SPA. */
export function frontendDir(): string {
  return path.join(parentRoot(), 'frontend', 'dist', 'wa-commerce', 'browser');
}

/**
 * Embedded-Postgres data directory. Kept OFF the productName-based userData path
 * (which contains spaces) because initdb/postgres on Windows dislikes spaces.
 */
export function pgDataDir(): string {
  return path.join(app.getPath('appData'), 'WaCommerceERP', 'pgdata');
}

/** Small marker/flag files (e.g. first-run provisioning done). */
export function stateFile(name: string): string {
  return path.join(app.getPath('appData'), 'WaCommerceERP', name);
}
