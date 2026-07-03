import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Tally-style keyboard navigation (Phase 3). Maps function keys / commands to routes so
 * the desktop ERP feels like Tally. Works in two ways:
 *   - a global document keydown listener (browser + desktop), and
 *   - Electron menu accelerators forwarded via `window.desktop.onMenuCommand`.
 *
 * Registered once at startup via provideAppInitializer in app.config.ts.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private readonly router = inject(Router);
  private started = false;

  /** command → route (with optional ?query). */
  /**
   * MIRACLE keymap (user's reference ERP): F2 Sales, F8 Purchase, F5 Receipt (cash/bank
   * in), F6 Payment (out), F7 Journal, F4 Contra, F3 Masters/Gateway, F9 Day Book,
   * F11 Setup (price & credit). F1 also opens the Gateway (help key).
   */
  private readonly routeMap: Record<string, string> = {
    gateway: '/gateway',
    'voucher:contra': '/accounting/vouchers/new?type=contra',
    'voucher:payment': '/entry/payment',
    'voucher:receipt': '/entry/receipt',
    'voucher:journal': '/accounting/vouchers/new?type=journal',
    'voucher:sales': '/entry/sales',
    'voucher:purchase': '/entry/purchase',
    'report:daybook': '/accounting/reports/day-book',
    'report:trial-balance': '/accounting/reports/trial-balance',
    'report:pnl': '/accounting/reports/pnl',
    'report:balance-sheet': '/accounting/reports/balance-sheet',
    'report:gst': '/gst',
    features: '/entry/masters',
    configure: '/settings',
  };

  init(): void {
    if (this.started) return;
    this.started = true;

    const desktop = (window as unknown as { desktop?: { onMenuCommand?: (cb: (c: string) => void) => void } }).desktop;
    desktop?.onMenuCommand?.((command) => this.run(command));

    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent): void {
    // Ctrl+P — print the current screen (Miracle prints everything). Works while typing.
    if (e.ctrlKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      window.print();
      return;
    }

    // Alt+M/T/G/R/U/S — open the Miracle module menus (handled by the ERP layout).
    if (e.altKey && !e.ctrlKey) {
      const menuIdx = { m: 0, t: 1, g: 2, r: 3, u: 4, s: 5 }[e.key.toLowerCase()];
      if (menuIdx !== undefined) {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('wa-menubar', { detail: menuIdx }));
        return;
      }
    }

    const command = this.keyToCommand(e);
    if (!command) return;

    // Don't hijack typing, except Escape.
    const el = e.target as HTMLElement | null;
    const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (typing && e.key !== 'Escape') return;

    e.preventDefault();
    this.run(command);
  }

  private keyToCommand(e: KeyboardEvent): string | null {
    if (e.ctrlKey || e.altKey || e.metaKey) return null;
    switch (e.key) {
      // Miracle keymap
      case 'F1': return 'gateway';
      case 'F2': return 'voucher:sales';
      case 'F3': return 'gateway';
      case 'F4': return 'voucher:contra';
      case 'F5': return 'voucher:receipt';
      case 'F6': return 'voucher:payment';
      case 'F7': return 'voucher:journal';
      case 'F8': return 'voucher:purchase';
      case 'F9': return 'report:daybook';
      case 'F10': return 'report:trial-balance';
      case 'F11': return 'features';
      case 'F12': return 'configure';
      case 'Escape': return 'back';
      default: return null;
    }
  }

  private run(command: string): void {
    if (command === 'back') {
      history.back();
      return;
    }
    const route = this.routeMap[command];
    if (!route) return;
    const [path, query] = route.split('?');
    const queryParams = query
      ? Object.fromEntries(new URLSearchParams(query))
      : undefined;
    void this.router.navigate([path], queryParams ? { queryParams } : {});
  }
}
