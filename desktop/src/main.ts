import { app, BrowserWindow, Menu, shell, ipcMain, dialog, MenuItemConstructorOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import {
  LOCAL_APP_URL,
  CLOUD_PORTAL_URL,
  DEV_URL,
  SHELL_ONLY,
  IS_DEV,
  PRODUCT_NAME,
  UPDATE_FEED_URL,
  DEFAULT_TENANT,
} from './config';
import { startLocalDb, stopLocalDb } from './localdb';
import { startBackend, stopBackend } from './backend';
import { provision, isProvisioned } from './provision';
import { startSync, stopSync, getSyncState, setCloudCreds, syncNow } from './sync';

let mainWindow: BrowserWindow | null = null;

// Never die silently on a stray rejection (e.g. a non-Error rejection from a child
// process library) — log it; the boot path shows its own dialog.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack || reason.message : String(reason));
});

// DESKTOP_DEBUG=1 exposes the Chromium DevTools protocol so Playwright (connectOverCDP)
// can drive the real app window for UI verification.
if (process.env.DESKTOP_DEBUG === '1') {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.DESKTOP_DEBUG_PORT || '9222');
}

// Google OAuth rejects embedded browsers by user-agent sniffing ("disallowed_useragent").
// Electron IS real Chromium, so drop the Electron/app tokens and present the plain
// Chrome UA — Google sign-in then works in the app window (same-window redirect flow).
app.userAgentFallback = app.userAgentFallback
  .replace(/ ?wacommerce-desktop\/[\d.]+/i, '')
  .replace(/ ?Electron\/[\d.]+/, '');

// ─── Single-instance lock ──────────────────────────────────────────────────
// A desktop ERP must never run twice against the same local data / Postgres cluster.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: PRODUCT_NAME,
    backgroundColor: '#0f172a',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  showBootScreen('Starting…');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** A lightweight loading screen shown while the local DB + backend spin up. */
function showBootScreen(message: string): void {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{height:100%;margin:0}
    body{display:flex;flex-direction:column;gap:18px;align-items:center;justify-content:center;
      background:#0f172a;color:#e2e8f0;font-family:Segoe UI,system-ui,sans-serif}
    .spinner{width:38px;height:38px;border:4px solid #1e293b;border-top-color:#22c55e;
      border-radius:50%;animation:spin 1s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    h1{font-size:16px;font-weight:600;margin:0}
    p{font-size:13px;color:#94a3b8;margin:0}
  </style></head><body>
    <div class="spinner"></div>
    <h1>${PRODUCT_NAME}</h1>
    <p id="msg">${message}</p>
  </body></html>`;
  mainWindow?.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

/** Boot the embedded backend, then point the window at it. Falls back to cloud on failure. */
async function bootLocalStack(): Promise<void> {
  // Dev / shell-only: skip the embedded stack and just load a URL.
  if (SHELL_ONLY) {
    await mainWindow?.loadURL(DEV_URL || CLOUD_PORTAL_URL);
    return;
  }

  try {
    showBootScreen('Starting local database…');
    await startLocalDb();

    if (!isProvisioned()) {
      showBootScreen('Setting up your company (first run)…');
      await provision((label) => showBootScreen(label));
    }

    showBootScreen('Starting ERP services…');
    await startBackend();

    // Assets are local and hashed — a stale HTTP cache can pin an old index.html whose
    // stylesheet hashes no longer exist (renders unstyled). A stale session cookie can
    // also point at a tenant from a different DB mode (embedded↔docker) and 500 every
    // request. Both clears are instant for a local app.
    await mainWindow?.webContents.session.clearCache();
    await mainWindow?.webContents.session.clearStorageData({ storages: ['cookies'] });
    try {
      await mainWindow?.loadURL(LOCAL_APP_URL);
    } catch (navErr) {
      // ERR_ABORTED (-3) = our navigation was superseded by another one (e.g. an
      // automation client drove the window first). The app is fine — don't fail boot.
      if ((navErr as { errno?: number })?.errno !== -3) throw navErr;
    }

    // Begin cloud sync (no-op unless DESKTOP_SYNC=1). Offline ticks retry silently.
    startSync();
  } catch (err) {
    // NOTE: not all rejection values are Errors (embedded-postgres can reject with
    // undefined) — format defensively so the fallback dialog always appears.
    const msg = err instanceof Error ? err.message || String(err) : String(err ?? 'Unknown startup error');
    console.error('[boot] local stack failed:', msg);
    const options = {
      type: 'error' as const,
      title: 'Local startup failed',
      message: 'Could not start the local ERP engine.',
      detail: `${msg}\n\nOpen the online portal instead?`,
      buttons: ['Open online portal', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    };
    const choice = mainWindow ? dialog.showMessageBoxSync(mainWindow, options) : dialog.showMessageBoxSync(options);
    if (choice === 0) await mainWindow?.loadURL(CLOUD_PORTAL_URL);
    else app.quit();
  }
}

// ─── Tally-style application menu ────────────────────────────────────────────
function sendMenuCommand(command: string): void {
  mainWindow?.webContents.send('menu-command', command);
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Company',
      submenu: [
        { label: 'Gateway (F3)', accelerator: 'F3', click: () => sendMenuCommand('gateway') },
        { label: 'Help (F1)', accelerator: 'F1', click: () => sendMenuCommand('help') },
        { type: 'separator' },
        { label: 'Features (F11)', accelerator: 'F11', click: () => sendMenuCommand('features') },
        { label: 'Configure (F12)', accelerator: 'F12', click: () => sendMenuCommand('configure') },
        { type: 'separator' },
        { role: 'quit', label: 'Quit (Ctrl+Q)', accelerator: 'CommandOrControl+Q' },
      ],
    },
    {
      // Miracle keymap: F2 Sales, F8 Purchase, F5 Receipt, F6 Payment, F7 Journal, F4 Contra.
      label: 'Transaction',
      submenu: [
        { label: 'Sales Invoice (F2)', accelerator: 'F2', click: () => sendMenuCommand('voucher:sales') },
        { label: 'Purchase (F8)', accelerator: 'F8', click: () => sendMenuCommand('voucher:purchase') },
        { label: 'Receipt (F5)', accelerator: 'F5', click: () => sendMenuCommand('voucher:receipt') },
        { label: 'Payment (F6)', accelerator: 'F6', click: () => sendMenuCommand('voucher:payment') },
        { label: 'Journal (F7)', accelerator: 'F7', click: () => sendMenuCommand('voucher:journal') },
        { label: 'Contra (F4)', accelerator: 'F4', click: () => sendMenuCommand('voucher:contra') },
      ],
    },
    {
      label: 'Reports',
      submenu: [
        { label: 'Day Book (F9)', accelerator: 'F9', click: () => sendMenuCommand('report:daybook') },
        { label: 'Trial Balance', click: () => sendMenuCommand('report:trial-balance') },
        { label: 'Profit & Loss', click: () => sendMenuCommand('report:pnl') },
        { label: 'Balance Sheet', click: () => sendMenuCommand('report:balance-sheet') },
        { type: 'separator' },
        { label: 'GST Returns', click: () => sendMenuCommand('report:gst') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for Updates…', click: () => autoUpdater.checkForUpdatesAndNotify() },
        { label: `About ${PRODUCT_NAME}`, click: () => sendMenuCommand('about') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Auto-update ─────────────────────────────────────────────────────────────
function initAutoUpdate(): void {
  if (IS_DEV) return;
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_URL });
    autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    console.error('[updater] init failed', err);
  }
}

// ─── IPC handlers (bridge for the renderer / Angular) ────────────────────────
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('sync:get-state', () => getSyncState());
// The renderer hands us the just-logged-in user's cloud credentials so the relay
// syncs THEIR tenant, then we kick an immediate cycle.
ipcMain.handle('sync:login', async (_e, creds: { email?: string; password?: string }) => {
  if (creds?.email && creds?.password) setCloudCreds(creds.email, creds.password);
  return syncNow();
});
// "Sync now" button.
ipcMain.handle('sync:now', () => syncNow());
ipcMain.handle('app:get-default-login', () => ({
  email: DEFAULT_TENANT.ownerEmail,
  // password intentionally not exposed to the renderer
}));
ipcMain.handle('app:check-updates', async () => {
  if (IS_DEV) return { updateAvailable: false, dev: true };
  const result = await autoUpdater.checkForUpdates();
  return { updateAvailable: !!result?.updateInfo, version: result?.updateInfo?.version };
});

// ─── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();
  createWindow();
  await bootLocalStack();
  initAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Tear down the backend + Postgres cleanly on quit.
app.on('before-quit', async (e) => {
  e.preventDefault();
  stopSync();
  stopBackend();
  await stopLocalDb();
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
