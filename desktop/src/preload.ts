import { contextBridge, ipcRenderer } from 'electron';

/** Shape of the sync snapshot pushed from the main process (mirrors sync.ts SyncState). */
interface SyncStateWire {
  enabled: boolean;
  online: boolean;
  syncing: boolean;
  phase: 'idle' | 'connecting' | 'push' | 'pull' | 'done';
  percent: number;
  uploaded: number;
  downloaded: number;
  currentTable: string | null;
  lastSyncAt: string | null;
  error: string | null;
  pendingUpload: number;
}

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

  /** Current sync-engine state (enabled/online/syncing/progress/error). */
  getSyncState: (): Promise<SyncStateWire> => ipcRenderer.invoke('sync:get-state'),

  /** Point the sync relay at the just-logged-in cloud account + sync immediately. */
  syncLogin: (email: string, password: string): Promise<any> =>
    ipcRenderer.invoke('sync:login', { email, password }),

  /** Manually run a push+pull cycle now ("Sync now" — also resumes after a failure). */
  syncNow: (): Promise<any> => ipcRenderer.invoke('sync:now'),

  /** Redownload the entire cloud dataset from scratch ("Full resync"). */
  syncFullResync: (): Promise<any> => ipcRenderer.invoke('sync:full-resync'),

  /** Subscribe to live sync-state pushes (progress bar). Returns an unsubscribe fn. */
  onSyncState: (handler: (s: SyncStateWire) => void): (() => void) => {
    const listener = (_e: unknown, s: SyncStateWire) => handler(s);
    ipcRenderer.on('sync:state', listener);
    return () => ipcRenderer.removeListener('sync:state', listener);
  },

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
 * Inject a floating sync widget (bottom-right, ABOVE the Tally status bar so it no
 * longer overlaps the footer). Done from the preload so it works without touching the
 * Angular layout. Collapsed it's a compact pill with a live progress bar; clicking it
 * opens a panel with progress detail, last-sync time, errors, and Sync-now / Full-resync
 * actions. Hidden entirely when sync is disabled.
 */
function mountSyncWidget(): void {
  const fmtInt = (n: number) => (n || 0).toLocaleString();
  const tableLabel = (t: string | null) =>
    t ? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

  // Root (bottom-right, lifted 34px so it clears the ~24px status bar footer).
  const root = document.createElement('div');
  root.id = 'wa-sync';
  root.style.cssText = [
    'position:fixed',
    'bottom:34px',
    'right:16px',
    'z-index:2147483647',
    'font:12px Segoe UI,system-ui,sans-serif',
    'display:none',
    'flex-direction:column',
    'align-items:flex-end',
    'gap:8px',
    'user-select:none',
    'pointer-events:none',
  ].join(';');

  // Expandable detail panel (opens above the pill).
  const panel = document.createElement('div');
  panel.style.cssText = [
    'pointer-events:auto',
    'width:280px',
    'background:#0f172a',
    'color:#e2e8f0',
    'border:1px solid #1e293b',
    'border-radius:12px',
    'box-shadow:0 10px 30px rgba(0,0,0,.35)',
    'padding:14px',
    'display:none',
  ].join(';');

  // Collapsed pill (dot + label + thin progress bar).
  const pill = document.createElement('div');
  pill.style.cssText = [
    'pointer-events:auto',
    'cursor:pointer',
    'background:#0f172a',
    'color:#e2e8f0',
    'border-radius:999px',
    'padding:6px 12px',
    'display:inline-flex',
    'align-items:center',
    'gap:8px',
    'box-shadow:0 2px 10px rgba(0,0,0,.25)',
    'font-weight:600',
    'min-width:96px',
    'position:relative',
    'overflow:hidden',
  ].join(';');

  root.appendChild(panel);
  root.appendChild(pill);
  document.body.appendChild(root);

  let open = false;
  let last: SyncStateWire | null = null;

  const renderPill = (s: SyncStateWire) => {
    let dot = '#22c55e';
    let text = 'Synced';
    if (s.syncing) {
      dot = '#3b82f6';
      text =
        s.phase === 'pull'
          ? `Downloading… ${s.percent}%`
          : s.phase === 'push'
            ? `Uploading… ${s.percent}%`
            : 'Syncing…';
    } else if (!s.online) {
      dot = '#f59e0b';
      text = 'Offline — local';
    } else if (s.error) {
      dot = '#ef4444';
      text = 'Sync error';
    }
    const bar = s.syncing
      ? `<span style="position:absolute;left:0;bottom:0;height:3px;width:${Math.max(4, s.percent)}%;background:#3b82f6;transition:width .3s"></span>`
      : '';
    pill.innerHTML =
      `<span style="width:8px;height:8px;border-radius:50%;background:${dot};display:inline-block;flex:0 0 auto"></span>` +
      `<span>${text}</span>${bar}`;
    pill.title = s.syncing ? 'Your account is syncing…' : 'Click for sync details';
  };

  const renderPanel = (s: SyncStateWire) => {
    const busy = s.syncing;
    const statusText = busy
      ? s.phase === 'pull'
        ? 'Downloading your data from the cloud…'
        : s.phase === 'push'
          ? 'Uploading your changes…'
          : 'Connecting…'
      : s.error
        ? s.error
        : !s.online
          ? 'Offline — using local data. Will sync when back online.'
          : 'Your account is up to date.';
    const statusColor = s.error && !busy ? '#fca5a5' : '#94a3b8';

    const progressBlock = busy
      ? `<div style="margin:10px 0 4px;height:8px;background:#1e293b;border-radius:999px;overflow:hidden">
           <div style="height:100%;width:${Math.max(4, s.percent)}%;background:#3b82f6;transition:width .3s"></div>
         </div>
         <div style="color:#cbd5e1;font-size:11px;display:flex;justify-content:space-between">
           <span>${s.percent}%${s.currentTable ? ' · ' + tableLabel(s.currentTable) : ''}</span>
           <span>↑ ${fmtInt(s.uploaded)} · ↓ ${fmtInt(s.downloaded)}</span>
         </div>`
      : s.lastSyncAt
        ? `<div style="color:#64748b;font-size:11px;margin-top:8px">Last synced: ${new Date(s.lastSyncAt).toLocaleString()}</div>`
        : '';

    const btn = (id: string, label: string, primary: boolean, disabled: boolean) =>
      `<button data-act="${id}" ${disabled ? 'disabled' : ''} style="flex:1;cursor:${disabled ? 'default' : 'pointer'};` +
      `border:0;border-radius:8px;padding:8px 10px;font:600 12px Segoe UI,system-ui;` +
      `background:${primary ? '#2563eb' : '#1e293b'};color:${disabled ? '#64748b' : '#e2e8f0'};opacity:${disabled ? 0.6 : 1}">${label}</button>`;

    panel.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
         <span style="font-weight:700;font-size:13px">Account sync</span>
         <span data-act="close" style="cursor:pointer;color:#64748b;font-size:15px;line-height:1">×</span>
       </div>
       <div style="color:${statusColor};font-size:12px;line-height:1.5">${statusText}</div>
       ${progressBlock}
       <div style="display:flex;gap:8px;margin-top:12px">
         ${btn('now', s.error ? 'Resume' : 'Sync now', true, busy)}
         ${btn('full', 'Full resync', false, busy)}
       </div>
       <div style="color:#475569;font-size:10px;margin-top:8px;line-height:1.4">
         Full resync re-downloads your complete database. Safe to close anytime — sync resumes automatically.
       </div>`;

    panel.querySelector('[data-act="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      open = false;
      panel.style.display = 'none';
    });
    if (!busy) {
      panel.querySelector('[data-act="now"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        api.syncNow().then(render).catch(() => undefined);
      });
      panel.querySelector('[data-act="full"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        api.syncFullResync().then(render).catch(() => undefined);
      });
    }
  };

  const render = (s?: SyncStateWire | null) => {
    if (!s) return;
    last = s;
    if (!s.enabled) {
      root.style.display = 'none';
      return;
    }
    root.style.display = 'flex';
    renderPill(s);
    if (open) {
      panel.style.display = 'block';
      renderPanel(s);
    } else {
      panel.style.display = 'none';
    }
  };

  pill.addEventListener('click', () => {
    open = !open;
    if (last) render(last);
  });

  // Live pushes from the main process (smooth progress) + a slow poll as a fallback.
  api.onSyncState((s) => render(s));
  const poll = () => api.getSyncState().then(render).catch(() => undefined);
  poll();
  setInterval(poll, 2500);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', mountSyncWidget);
  } else {
    mountSyncWidget();
  }
}
