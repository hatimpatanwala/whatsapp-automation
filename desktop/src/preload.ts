import { contextBridge, ipcRenderer } from 'electron';

/**
 * Secure bridge exposed to the Angular app as `window.desktop`.
 *
 * Angular can feature-detect the desktop runtime with `if (window.desktop) { … }`
 * and stays a plain web app in the browser/portal.
 *
 * Phase 1+ extends this with local-DB / sync-status channels (e.g. syncState$,
 * forceSync(), onlineStatus) — the renderer never touches Node or the DB directly.
 */
const api = {
  /** True when running inside the Electron desktop shell. */
  isDesktop: true,

  platform: process.platform,

  /** App version (matches desktop/package.json). */
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),

  /** Manually trigger an update check. */
  checkForUpdates: (): Promise<{ updateAvailable: boolean; version?: string; dev?: boolean }> =>
    ipcRenderer.invoke('app:check-updates'),

  /** First-run local login hint (phone) so the UI can prefill the offline login. */
  getDefaultLogin: (): Promise<{ phone: string }> => ipcRenderer.invoke('app:get-default-login'),

  /** Browser online/offline signal. */
  isOnline: (): boolean => (typeof navigator !== 'undefined' ? navigator.onLine : true),

  /** Current sync-engine state (enabled/online/syncing/lastSyncAt/error). */
  getSyncState: (): Promise<{
    enabled: boolean;
    online: boolean;
    syncing: boolean;
    lastSyncAt: string | null;
    error: string | null;
  }> => ipcRenderer.invoke('sync:get-state'),

  /** Point the sync relay at the just-logged-in cloud account + sync immediately. */
  syncLogin: (email: string, password: string): Promise<any> =>
    ipcRenderer.invoke('sync:login', { email, password }),

  /** Manually run a push+pull cycle now ("Sync now"). */
  syncNow: (): Promise<any> => ipcRenderer.invoke('sync:now'),

  /**
   * Subscribe to native menu / global-shortcut commands (Tally keymap forwarded from
   * the main process). Returns an unsubscribe function.
   */
  onMenuCommand: (handler: (command: string) => void): (() => void) => {
    const listener = (_e: unknown, command: string) => handler(command);
    ipcRenderer.on('menu-command', listener);
    return () => ipcRenderer.removeListener('menu-command', listener);
  },
};

contextBridge.exposeInMainWorld('desktop', api);

export type DesktopApi = typeof api;

/**
 * Inject a small, always-visible sync-status badge (bottom-right). Done from the preload
 * so it works without touching the Angular layout. Hidden entirely when sync is disabled.
 */
function mountSyncBadge(): void {
  const badge = document.createElement('div');
  badge.id = 'wa-sync-badge';
  badge.style.cssText = [
    'position:fixed',
    'bottom:12px',
    'right:12px',
    'z-index:2147483647',
    'font:600 12px Segoe UI,system-ui,sans-serif',
    'padding:5px 10px',
    'border-radius:999px',
    'display:none',
    'align-items:center',
    'gap:6px',
    'box-shadow:0 2px 8px rgba(0,0,0,.15)',
    'user-select:none',
    'pointer-events:auto',
    'cursor:pointer',
  ].join(';');
  badge.title = 'Click to sync now';
  badge.addEventListener('click', () => {
    api.syncNow().then(render).catch(() => undefined);
  });
  document.body.appendChild(badge);

  const render = (s: {
    enabled: boolean;
    online: boolean;
    syncing: boolean;
    lastSyncAt: string | null;
    error: string | null;
  }) => {
    if (!s || !s.enabled) {
      badge.style.display = 'none';
      return;
    }
    badge.style.display = 'inline-flex';
    let dot = '#22c55e';
    let text = 'Synced';
    if (s.syncing) {
      dot = '#3b82f6';
      text = 'Syncing…';
    } else if (!s.online) {
      dot = '#f59e0b';
      text = 'Offline — local';
    } else if (s.error) {
      dot = '#ef4444';
      text = 'Sync error';
    }
    badge.style.background = '#0f172a';
    badge.style.color = '#e2e8f0';
    badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${dot};display:inline-block"></span>${text}`;
    badge.title = (s.lastSyncAt ? `Last sync: ${new Date(s.lastSyncAt).toLocaleString()}\n` : '') + 'Click to sync now';
  };

  const poll = () => api.getSyncState().then(render).catch(() => undefined);
  poll();
  setInterval(poll, 3000);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', mountSyncBadge);
  } else {
    mountSyncBadge();
  }
}
