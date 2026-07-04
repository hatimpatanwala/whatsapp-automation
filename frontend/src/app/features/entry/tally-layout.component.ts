import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

interface MenuEntry {
  label: string;
  route?: string;
  query?: Record<string, string>;
  key?: string;
  divider?: boolean;
  action?: 'logout' | 'quit';
}
interface MenuGroup {
  title: string;
  entries: MenuEntry[];
}

/**
 * Miracle-style ERP chrome (user's reference: Miracle 9 / RKIT):
 *   1. classic top MODULE MENU BAR (Master | Transaction | GST | Report | Utility | Setup)
 *      with dropdowns,
 *   2. a FUNCTION-KEY TOOLBAR of big flat buttons (F2 Sales … F8 Purchase),
 *   3. a dense white work area on a desktop-grey shell,
 *   4. a bottom STATUS BAR with the active shortcut legend.
 * Styling is plain scoped CSS on purpose — the frame must survive even if the global
 * stylesheet fails. Keymap follows Miracle: F2 Sales, F8 Purchase, F5 Receipt,
 * F6 Payment, F7 Journal, F4 Contra, F3 Masters, F9 Day Book, F11 Setup.
 */
@Component({
  selector: 'wa-tally-layout',
  standalone: true,
  imports: [RouterOutlet, DatePipe, FormsModule],
  template: `
    <div class="mcl-root" (click)="openMenu.set(null)">
      <!-- Title bar -->
      <header class="mcl-title">
        <span class="mcl-co">{{ companyName() }}</span>
        <span class="mcl-app">WhatsApp Commerce ERP</span>
        <span class="mcl-date">{{ today | date: 'dd-MM-yyyy' }} · F.Y. {{ fy }}</span>
      </header>

      <!-- Module menu bar -->
      <nav class="mcl-menubar" (click)="$event.stopPropagation()">
        @for (m of menus; track m.title; let i = $index) {
          <div class="mcl-menu">
            <button class="mcl-menu-btn" [class.mcl-menu-open]="openMenu() === i"
                    (click)="toggleMenu(i)" (mouseenter)="hoverMenu(i)">{{ m.title }}</button>
            @if (openMenu() === i) {
              <div class="mcl-dropdown">
                @for (e of m.entries; track e.label) {
                  @if (e.divider) { <div class="mcl-sep"></div> }
                  @else {
                    <button class="mcl-item" (click)="go(e)">
                      <span>{{ e.label }}</span>
                      @if (e.key) { <span class="mcl-item-key">{{ e.key }}</span> }
                    </button>
                  }
                }
              </div>
            }
          </div>
        }
        <span class="mcl-menubar-right">{{ userName() }}</span>
      </nav>

      <!-- Function-key toolbar -->
      <div class="mcl-toolbar">
        @for (b of toolbar; track b.label) {
          <button class="mcl-fkey" [class.mcl-fkey-active]="isActive(b)" (click)="go(b)">
            <span class="mcl-fkey-key">{{ b.key }}</span>
            <span class="mcl-fkey-lbl">{{ b.label }}</span>
          </button>
        }
      </div>

      <!-- Work area -->
      <main class="mcl-work">
        <div class="mcl-sheet">
          <router-outlet />
        </div>
      </main>

      <!-- Status bar -->
      <footer class="mcl-status">
        <span><b>Enter</b> Next</span>
        <span><b>Esc</b> Back</span>
        <span><b>Ctrl+Enter</b> Save</span>
        <span><b>F9</b> Calc</span>
        <span><b>Ins</b> +Row</span>
        <span><b>Ctrl+Del</b> −Row</span>
        <span><b>Alt+P</b> Party</span>
        <span><b>Alt+I</b> Item</span>
        <span><b>Alt+L</b> Last rates</span>
        <span><b>F2</b> Sales · <b>F8</b> Purch · <b>F5</b> Rcpt · <b>F6</b> Pymt · <b>F9</b> DayBk</span>
        <span class="mcl-help-link" (click)="openHelp()"><b>Alt+H</b> Help</span>
        <span class="mcl-status-right" (click)="exitToPortal()">Web Portal ⤴</span>
      </footer>

      <!-- F9 inline calculator (Miracle): evaluate an expression into the focused field. -->
      @if (calcOpen()) {
        <div class="mcl-calc-backdrop" (mousedown)="closeCalc(false)">
          <div class="mcl-calc" (mousedown)="$event.stopPropagation()">
            <div class="mcl-calc-title">🖩 Calculator <span>Enter apply · Esc cancel</span></div>
            <input data-calc-input [(ngModel)]="calcExpr" (keydown)="onCalcKey($event)"
                   placeholder="e.g. 250*12-5%…" autocomplete="off" spellcheck="false" />
            <div class="mcl-calc-result" [class.mcl-calc-err]="calcResult() === null">
              = {{ calcResult() !== null ? calcResult() : '…' }}
            </div>
          </div>
        </div>
      }

      <!-- Shortcut help overlay (Alt+H / F1) — the full Miracle keymap in one card. -->
      @if (helpOpen()) {
        <div class="mcl-help-backdrop" (mousedown)="closeHelp()">
          <div class="mcl-help" tabindex="-1" data-help-box
               (mousedown)="$event.stopPropagation()" (keydown)="onHelpKey($event)">
            <div class="mcl-help-title">⌨ Keyboard Shortcuts <span>Esc close</span></div>
            <div class="mcl-help-cols">
              @for (g of helpGroups; track g.title) {
                <div>
                  <div class="mcl-help-h">{{ g.title }}</div>
                  @for (s of g.keys; track s[0]) {
                    <div class="mcl-help-row"><kbd>{{ s[0] }}</kbd><span>{{ s[1] }}</span></div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .mcl-root {
        position: fixed; inset: 0; display: flex; flex-direction: column; z-index: 10;
        background: #d6d2c4; font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 13px;
      }

      .mcl-title {
        display: flex; align-items: center; gap: 14px; flex: 0 0 auto;
        background: linear-gradient(180deg, #1d5c8f 0%, #14456e 100%);
        color: #fff; padding: 5px 12px; font-size: 13px;
      }
      .mcl-co { font-weight: 700; letter-spacing: .2px; text-transform: uppercase; }
      .mcl-app { opacity: .7; font-size: 11.5px; }
      .mcl-date { margin-left: auto; font-size: 12px; }

      .mcl-menubar {
        display: flex; align-items: stretch; flex: 0 0 auto;
        background: #ece9d8; border-bottom: 1px solid #aca899; padding: 0 4px;
      }
      .mcl-menu { position: relative; }
      .mcl-menu-btn {
        background: transparent; border: 1px solid transparent; padding: 4px 12px;
        font-size: 12.5px; cursor: pointer; color: #1f2430;
      }
      .mcl-menu-btn:hover, .mcl-menu-open {
        background: #cbe0f7 !important; border-color: #7da2ce !important;
      }
      .mcl-dropdown {
        position: absolute; top: 100%; left: 0; z-index: 300; min-width: 230px;
        background: #fff; border: 1px solid #7da2ce; box-shadow: 3px 3px 8px rgba(0,0,0,.25);
        padding: 3px;
      }
      .mcl-item {
        display: flex; justify-content: space-between; gap: 18px; width: 100%;
        background: transparent; border: 0; text-align: left; padding: 5px 10px;
        font-size: 12.5px; cursor: pointer; color: #1f2430;
      }
      .mcl-item:hover { background: #2a6cb5; color: #fff; }
      .mcl-item:hover .mcl-item-key { color: #cfe3fa; }
      .mcl-item-key { color: #777; font-size: 11px; font-family: Consolas, monospace; }
      .mcl-sep { height: 1px; background: #d8d4c8; margin: 3px 6px; }
      .mcl-menubar-right { margin-left: auto; align-self: center; font-size: 11.5px; color: #555; padding-right: 8px; }

      .mcl-toolbar {
        display: flex; gap: 3px; flex-wrap: wrap; flex: 0 0 auto;
        background: #e3e0d2; border-bottom: 1px solid #aca899; padding: 4px 6px;
      }
      .mcl-fkey {
        display: flex; flex-direction: column; align-items: center; min-width: 74px;
        background: linear-gradient(180deg, #fdfdfb, #e8e5d8); border: 1px solid #b5b19f;
        border-radius: 3px; padding: 3px 8px; cursor: pointer; gap: 1px;
      }
      .mcl-fkey:hover { background: #d3e5f8; border-color: #7da2ce; }
      .mcl-fkey-active { background: #2a6cb5 !important; border-color: #1d5c8f !important; }
      .mcl-fkey-active .mcl-fkey-key, .mcl-fkey-active .mcl-fkey-lbl { color: #fff; }
      .mcl-fkey-key { font-family: Consolas, monospace; font-size: 11px; font-weight: 700; color: #1d5c8f; }
      .mcl-fkey-lbl { font-size: 11px; color: #333; white-space: nowrap; }

      .mcl-work { flex: 1 1 auto; overflow: auto; padding: 10px; }
      .mcl-sheet {
        background: #fff; min-height: calc(100% - 2px);
        border: 1px solid #9aa7b8; box-shadow: 0 1px 6px rgba(20,40,70,.18);
      }

      .mcl-status {
        display: flex; gap: 18px; align-items: center; flex: 0 0 auto;
        background: #1d5c8f; color: #d7e6f7; padding: 4px 12px; font-size: 11.5px;
      }
      .mcl-status b { color: #ffd76b; font-weight: 600; margin-right: 3px; }
      .mcl-status-right { margin-left: auto; cursor: pointer; }
      .mcl-status-right:hover { text-decoration: underline; color: #fff; }
      .mcl-help-link { cursor: pointer; }
      .mcl-help-link:hover { text-decoration: underline; color: #fff; }

      .mcl-help-backdrop {
        position: fixed; inset: 0; background: rgba(20, 40, 70, .5); z-index: 700;
        display: flex; align-items: flex-start; justify-content: center; padding-top: 7vh;
      }
      .mcl-help {
        background: #fff; border: 1px solid #7da2ce; box-shadow: 4px 6px 18px rgba(0,0,0,.35);
        width: 780px; max-width: 95vw; max-height: 82vh; overflow: auto;
        padding: 14px 18px; font-size: 13px; outline: none;
      }
      .mcl-help-title { font-weight: 700; color: #14456e; font-size: 15px; margin-bottom: 12px; display: flex; justify-content: space-between; }
      .mcl-help-title span { font-weight: 400; font-size: 11px; color: #888; }
      .mcl-help-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
      .mcl-help-h { font-weight: 700; color: #14456e; font-size: 11.5px; text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid #dfe5ee; padding-bottom: 3px; margin-bottom: 6px; }
      .mcl-help-row { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
      .mcl-help-row kbd {
        font-family: Consolas, monospace; font-size: 11px; background: #f2f5fa;
        border: 1px solid #c6d2e2; border-bottom-width: 2px; border-radius: 3px;
        padding: 1px 6px; white-space: nowrap; color: #14456e; min-width: 58px; text-align: center;
      }
      .mcl-help-row span { color: #333; font-size: 12px; }

      .mcl-calc-backdrop { position: fixed; inset: 0; z-index: 800; background: rgba(20,40,70,.25);
        display: flex; align-items: flex-start; justify-content: center; padding-top: 22vh; }
      .mcl-calc { background: #fff; border: 1px solid #7da2ce; box-shadow: 4px 6px 18px rgba(0,0,0,.35);
        width: 320px; padding: 10px 12px; }
      .mcl-calc-title { font-weight: 700; color: #14456e; font-size: 13px; margin-bottom: 8px;
        display: flex; justify-content: space-between; }
      .mcl-calc-title span { font-weight: 400; font-size: 10.5px; color: #888; }
      .mcl-calc input { width: 100%; box-sizing: border-box; border: 1px solid #9db6d8; padding: 6px 8px;
        font-size: 15px; font-family: Consolas, monospace; text-align: right; }
      .mcl-calc input:focus { outline: none; background: #fdf6d8; border-color: #d9a520; }
      .mcl-calc-result { margin-top: 6px; text-align: right; font-family: Consolas, monospace;
        font-size: 14px; font-weight: 700; color: #14456e; }
      .mcl-calc-err { color: #b91c1c; font-weight: 400; }
    `,
  ],
})
export class TallyLayoutComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly today = new Date();
  readonly fy = this.finYear();
  readonly openMenu = signal<number | null>(null);
  readonly helpOpen = signal(false);
  private helpPrevFocus: HTMLElement | null = null;

  constructor() {
    // Miracle behaviour: every screen opens with the cursor already in its first
    // field (party A/c on vouchers) — the operator types immediately, no mouse.
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      setTimeout(() => this.focusFirst(), 150);
      setTimeout(() => this.focusFirst(), 600); // lazy chunks may still be rendering
    });
  }

  /** Focus priority: [data-autofocus] → party field → first input on the sheet. */
  private focusFirst(): void {
    const sheet = document.querySelector('.mcl-sheet');
    if (!sheet) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && sheet.contains(active)) return; // user already typing
    const el = (sheet.querySelector('[data-autofocus]')
      || sheet.querySelector('[data-cell="party"]')
      || sheet.querySelector('input:not([type="checkbox"]), select, textarea')) as HTMLElement | null;
    el?.focus();
    (el as HTMLInputElement | null)?.select?.();
  }

  readonly helpGroups: Array<{ title: string; keys: Array<[string, string]> }> = [
    {
      title: 'Vouchers',
      keys: [
        ['F2', 'Sales Invoice'], ['F8', 'Purchase'], ['F5', 'Receipt'], ['F6', 'Payment'],
        ['F7', 'Journal'], ['F4', 'Contra'], ['F3 / F1', 'Gateway'],
      ],
    },
    {
      title: 'Inside an entry',
      keys: [
        ['Enter / Tab', 'Next field'], ['Shift+Enter', 'Previous field'],
        ['Ctrl+Enter', 'Save voucher (Miracle)'], ['Ctrl+A', 'Save voucher'],
        ['F9', 'Calculator in any field — Enter applies the result'],
        ['Ins', 'Insert row'], ['Ctrl+Del', 'Delete row'], ['↑ ↓', 'Move rows / pick from list'],
        ['Alt+P', 'Party details (outstanding, credit, history)'], ['Alt+I', 'Item details (stock, rates, last rate)'],
        ['Alt+L', 'Last rates to THIS party — Enter applies to the line'],
        ['Shift+F1', 'Narration recall list (in the narration field)'],
        ['Ctrl+R', 'Repeat last narration'],
        ['Esc', 'Close list / back'],
      ],
    },
    {
      title: 'Reports & more',
      keys: [
        ['F9', 'Day Book (outside a field)'], ['F10', 'Trial Balance'], ['F11', 'Price & Credit Masters'], ['F12', 'Settings'],
        ['Ctrl+P', 'Print current screen'], ['PgUp / PgDn', 'Prev / next (print & registers)'],
        ['Alt+M/T/G/R/U/S/E', 'Open module menus (E = Exit)'], ['Ctrl+U', 'Utility menu'],
        ['F1 / Alt+H', 'This help'],
      ],
    },
  ];

  @HostListener('document:keydown', ['$event'])
  onHelpShortcut(e: KeyboardEvent): void {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      if (this.helpOpen()) { this.closeHelp(); return; }
      this.openHelp();
    }
  }

  openHelp(): void {
    this.helpPrevFocus = document.activeElement as HTMLElement | null;
    this.helpOpen.set(true);
    setTimeout(() => (document.querySelector('[data-help-box]') as HTMLElement | null)?.focus());
  }

  onHelpKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeHelp(); }
  }

  /** F1 (via the keyboard service) and the Electron Help menu open the same overlay. */
  @HostListener('document:wa-help')
  onHelpEvent(): void {
    if (!this.helpOpen()) this.openHelp();
  }

  // ─── F9 inline calculator (Miracle) ─────────────────────────────────────────
  readonly calcOpen = signal(false);
  calcExpr = '';
  private calcTarget: HTMLInputElement | null = null;

  @HostListener('document:keydown', ['$event'])
  onCalcShortcut(e: KeyboardEvent): void {
    if (e.key !== 'F9' || this.calcOpen()) return;
    const el = e.target as HTMLElement | null;
    if (!el || el.tagName !== 'INPUT') return; // F9 outside a field = Day Book (global key)
    e.preventDefault();
    e.stopPropagation();
    this.calcTarget = el as HTMLInputElement;
    this.calcExpr = this.calcTarget.value || '';
    this.calcOpen.set(true);
    setTimeout(() => {
      const box = document.querySelector('[data-calc-input]') as HTMLInputElement | null;
      box?.focus(); box?.select();
    });
  }

  onCalcKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); this.closeCalc(true); }
    else if (e.key === 'Escape') { e.preventDefault(); this.closeCalc(false); }
  }

  closeCalc(apply: boolean): void {
    const target = this.calcTarget;
    const result = this.calcResult();
    this.calcOpen.set(false);
    this.calcTarget = null;
    setTimeout(() => {
      if (!target) return;
      if (apply && result !== null) {
        target.value = String(result);
        // Let Angular's ngModel see the programmatic write.
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
      target.focus();
      target.select();
    });
  }

  /** Result of the current expression, or null when invalid/incomplete. */
  calcResult(): number | null {
    const v = evalExpression(this.calcExpr);
    return v === null || !isFinite(v) ? null : Math.round((v + Number.EPSILON) * 10000) / 10000;
  }

  closeHelp(): void {
    this.helpOpen.set(false);
    const back = this.helpPrevFocus;
    this.helpPrevFocus = null;
    setTimeout(() => back?.focus());
  }

  readonly menus: MenuGroup[] = [
    {
      title: 'Master',
      entries: [
        { label: 'Item Master (Add Item / Stock)', route: '/entry/items' },
        { label: 'Ledgers (Chart of Accounts)', route: '/accounting/ledgers' },
        { label: 'Price Levels & Credit Limits', route: '/entry/masters', key: 'F11' },
        { divider: true, label: 'd1' },
        { label: 'Products (web portal)', route: '/products' },
        { label: 'Customers', route: '/customers' },
        { label: 'Suppliers', route: '/erp/suppliers' },
        { label: 'Warehouses (Godowns)', route: '/erp/warehouses' },
        { label: 'Tax Rates', route: '/tax-rates' },
      ],
    },
    {
      title: 'Transaction',
      entries: [
        { label: 'Sales Invoice', route: '/entry/sales', key: 'F2' },
        { label: 'Purchase Invoice', route: '/entry/purchase', key: 'F8' },
        { label: 'Receipt (bill-wise)', route: '/entry/receipt', key: 'F5' },
        { label: 'Payment (bill-wise)', route: '/entry/payment', key: 'F6' },
        { label: 'Journal Voucher', route: '/accounting/vouchers/new', query: { type: 'journal' }, key: 'F7' },
        { label: 'Contra Voucher', route: '/accounting/vouchers/new', query: { type: 'contra' }, key: 'F4' },
        { divider: true, label: 'd1' },
        { label: 'Quotation', route: '/entry/quote' },
        { label: 'Sales Order', route: '/entry/order' },
        { label: 'Returns (CN / DN)', route: '/entry/returns' },
        { label: 'Stock Journal / Transfer', route: '/entry/stock' },
      ],
    },
    {
      title: 'GST',
      entries: [
        { label: 'GST Returns (GSTR-1 / 3B / 2B / HSN)', route: '/gst' },
      ],
    },
    {
      title: 'Report',
      entries: [
        { label: 'Day Book', route: '/accounting/reports/day-book', key: 'F9' },
        { label: 'Voucher Register', route: '/accounting/vouchers' },
        { divider: true, label: 'd0' },
        { label: 'Sales Register', route: '/entry/registers/sales' },
        { label: 'Purchase Register', route: '/entry/registers/purchase' },
        { label: 'Quotation Register', route: '/entry/registers/quote' },
        { label: 'Order Register', route: '/entry/registers/order' },
        { divider: true, label: 'd1' },
        { label: 'Trial Balance', route: '/accounting/reports/trial-balance' },
        { label: 'Profit & Loss', route: '/accounting/reports/pnl' },
        { label: 'Balance Sheet', route: '/accounting/reports/balance-sheet' },
        { divider: true, label: 'd2' },
        { label: 'Bills Outstanding (Ageing)', route: '/accounting/reports/ageing' },
        { label: 'Stock Summary', route: '/accounting/reports/stock-summary' },
        { label: 'Ledger Statement', route: '/accounting/reports/ledger' },
      ],
    },
    {
      title: 'Utility',
      entries: [
        { label: 'Home (Business Overview)', route: '/home' },
        { label: 'Gateway (keyboard hub)', route: '/gateway', key: 'F3' },
        { label: 'Web Portal (WhatsApp, campaigns…)', route: '/dashboard' },
      ],
    },
    {
      title: 'Setup',
      entries: [
        { label: 'Price Levels & Credit', route: '/entry/masters', key: 'F11' },
        { label: 'Business Settings', route: '/settings' },
      ],
    },
    {
      // Miracle's Exit menu (Alt+E): leave the ERP without hunting for buttons.
      title: 'Exit',
      entries: [
        { label: 'Web Portal (dashboard)', route: '/dashboard' },
        { label: 'Logout', action: 'logout' },
        { label: 'Quit', action: 'quit' },
      ],
    },
  ];

  readonly toolbar: MenuEntry[] = [
    { key: '', label: 'Home', route: '/home' },
    { key: 'F2', label: 'Sales', route: '/entry/sales' },
    { key: 'F8', label: 'Purchase', route: '/entry/purchase' },
    { key: 'F5', label: 'Receipt', route: '/entry/receipt' },
    { key: 'F6', label: 'Payment', route: '/entry/payment' },
    { key: 'F7', label: 'Journal', route: '/accounting/vouchers/new', query: { type: 'journal' } },
    { key: 'F4', label: 'Contra', route: '/accounting/vouchers/new', query: { type: 'contra' } },
    { key: '', label: 'Quote', route: '/entry/quote' },
    { key: '', label: 'Order', route: '/entry/order' },
    { key: '', label: 'Returns', route: '/entry/returns' },
    { key: '', label: 'Stock Jrnl', route: '/entry/stock' },
    { key: '', label: 'Items', route: '/entry/items' },
    { key: '', label: 'Registers', route: '/entry/registers/sales' },
    { key: 'F9', label: 'Day Book', route: '/accounting/reports/day-book' },
    { key: '', label: 'Outstanding', route: '/accounting/reports/ageing' },
    { key: '', label: 'GST', route: '/gst' },
    { key: 'F3', label: 'Gateway', route: '/gateway' },
  ];

  companyName(): string {
    return this.auth.currentUser()?.name || 'My Company';
  }
  userName(): string {
    return this.auth.currentUser()?.email || '';
  }

  private finYear(): string {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${String(y + 1).slice(2)}`;
  }

  toggleMenu(i: number): void {
    this.openMenu.set(this.openMenu() === i ? null : i);
  }
  hoverMenu(i: number): void {
    if (this.openMenu() !== null) this.openMenu.set(i);
  }

  isActive(e: MenuEntry): boolean {
    return !!e.route && this.router.url.split('?')[0] === e.route;
  }

  go(e: MenuEntry): void {
    this.openMenu.set(null);
    if (e.action === 'logout') {
      this.auth.logout().subscribe({
        next: () => void this.router.navigate(['/auth/login']),
        error: () => void this.router.navigate(['/auth/login']),
      });
      return;
    }
    if (e.action === 'quit') {
      window.close();
      return;
    }
    if (!e.route) return;
    void this.router.navigate([e.route], e.query ? { queryParams: e.query } : {});
  }

  exitToPortal(): void {
    void this.router.navigate(['/dashboard']);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.openMenu() !== null) this.openMenu.set(null);
  }

  /** Alt+M/T/G/R/U/S/E from the keyboard service — open the corresponding module menu. */
  @HostListener('document:wa-menubar', ['$event'])
  onMenubarKey(e: Event): void {
    const idx = (e as CustomEvent<number>).detail;
    if (idx >= 0 && idx < this.menus.length) {
      this.openMenu.set(this.openMenu() === idx ? null : idx);
    }
  }
}

/**
 * Tiny safe arithmetic parser for the F9 calculator — + − × ÷ ( ) unary minus and
 * calculator-style percent (`250-5%` = 237.5, `250*5%` = 12.5). No eval/Function.
 */
function evalExpression(src: string): number | null {
  const s = (src || '').replace(/\s+/g, '');
  if (!s) return null;
  let pos = 0;

  interface Val { v: number; pct: boolean; }

  function parseNumber(): Val | null {
    const m = /^\d*\.?\d+/.exec(s.slice(pos));
    if (!m) return null;
    pos += m[0].length;
    return withPercent({ v: parseFloat(m[0]), pct: false });
  }

  function withPercent(val: Val): Val {
    if (s[pos] === '%') { pos++; return { v: val.v, pct: true }; }
    return val;
  }

  function parseUnary(): Val | null {
    if (s[pos] === '-') { pos++; const inner = parseUnary(); return inner && { v: -inner.v, pct: inner.pct }; }
    if (s[pos] === '(') {
      pos++;
      const inner = parseAdd();
      if (!inner || s[pos] !== ')') return null;
      pos++;
      return withPercent({ v: inner.v, pct: false });
    }
    return parseNumber();
  }

  function parseMul(): Val | null {
    let acc = parseUnary();
    while (acc && (s[pos] === '*' || s[pos] === '/' || s[pos] === 'x')) {
      const op = s[pos]; pos++;
      const rhs = parseUnary();
      if (!rhs) return null;
      const rv = rhs.pct ? rhs.v / 100 : rhs.v;
      acc = { v: op === '/' ? acc.v / rv : acc.v * rv, pct: false };
    }
    return acc;
  }

  function parseAdd(): Val | null {
    let acc = parseMul();
    while (acc && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos]; pos++;
      const rhs = parseMul();
      if (!rhs) return null;
      // "a - b%" means b percent OF a — how billing people use a calculator.
      const rv = rhs.pct ? (acc.v * rhs.v) / 100 : rhs.v;
      acc = { v: op === '+' ? acc.v + rv : acc.v - rv, pct: false };
    }
    return acc;
  }

  try {
    const out = parseAdd();
    if (!out || pos !== s.length) return null;
    return out.v;
  } catch {
    return null;
  }
}
