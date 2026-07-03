import { Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

interface MenuItem {
  label: string;
  route: string;
  key?: string;
  query?: Record<string, string>;
}
interface MenuSection {
  title: string;
  items: MenuItem[];
}

/**
 * Gateway — the Tally "Gateway of Tally" hub (F1). One keyboard-navigable menu over
 * every entry screen, report and master: ↑↓ move, Enter opens, or press the F-key
 * directly (global shortcuts stay active here).
 */
@Component({
  selector: 'wa-gateway',
  standalone: true,
  template: `
    <div class="p-4 md:p-8 max-w-5xl mx-auto select-none">
      <div class="text-center mb-6">
        <h1 class="text-2xl font-bold tracking-wide">Gateway</h1>
        <p class="text-sm text-slate-500">↑↓ navigate · Enter open · or press the F-key directly</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        @for (section of sections; track section.title; let s = $index) {
          <div class="border rounded-lg overflow-hidden bg-white">
            <div class="bg-slate-800 text-white px-3 py-2 text-sm font-semibold tracking-wide">{{ section.title }}</div>
            <div class="p-1">
              @for (item of section.items; track item.label; let i = $index) {
                <button (click)="open(item)" (mouseenter)="hover(s, i)"
                        class="w-full flex justify-between items-center text-left px-3 py-1.5 rounded text-sm"
                        [class.bg-amber-100]="isActive(s, i)"
                        [class.font-medium]="isActive(s, i)">
                  <span>{{ item.label }}</span>
                  @if (item.key) { <span class="text-xs text-slate-400 font-mono">{{ item.key }}</span> }
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class GatewayComponent {
  private readonly router = inject(Router);

  readonly sections: MenuSection[] = [
    {
      title: 'Transactions',
      items: [
        { label: 'Sales Invoice', route: '/entry/sales', key: 'F2' },
        { label: 'Purchase', route: '/entry/purchase', key: 'F8' },
        { label: 'Receipt (bill-wise)', route: '/entry/receipt', key: 'F5' },
        { label: 'Payment (bill-wise)', route: '/entry/payment', key: 'F6' },
        { label: 'Quotation', route: '/entry/quote' },
        { label: 'Sales Order', route: '/entry/order' },
        { label: 'Returns (CN / DN)', route: '/entry/returns' },
        { label: 'Stock Journal / Transfer', route: '/entry/stock' },
        { label: 'Journal Voucher', route: '/accounting/vouchers/new', key: 'F7', query: { type: 'journal' } },
        { label: 'Contra Voucher', route: '/accounting/vouchers/new', key: 'F4', query: { type: 'contra' } },
      ],
    },
    {
      title: 'Reports',
      items: [
        { label: 'Sales Register', route: '/entry/registers/sales' },
        { label: 'Purchase Register', route: '/entry/registers/purchase' },
        { label: 'Quotation Register', route: '/entry/registers/quote' },
        { label: 'Order Register', route: '/entry/registers/order' },
        { label: 'Day Book', route: '/accounting/reports/day-book' },
        { label: 'Trial Balance', route: '/accounting/reports/trial-balance' },
        { label: 'Profit & Loss', route: '/accounting/reports/pnl' },
        { label: 'Balance Sheet', route: '/accounting/reports/balance-sheet' },
        { label: 'Bills Outstanding (Ageing)', route: '/accounting/reports/ageing' },
        { label: 'Stock Summary', route: '/accounting/reports/stock-summary' },
        { label: 'Ledger Statement', route: '/accounting/reports/ledger' },
        { label: 'Voucher Register', route: '/accounting/vouchers' },
        { label: 'GST Returns (1 / 3B / 2B / HSN)', route: '/gst' },
      ],
    },
    {
      title: 'Masters',
      items: [
        { label: 'Item Master (Add Item / Stock)', route: '/entry/items' },
        { label: 'Ledgers (Chart of Accounts)', route: '/accounting/ledgers' },
        { label: 'Price Levels & Credit Limits', route: '/entry/masters' },
        { label: 'Products (web portal)', route: '/products' },
        { label: 'Customers', route: '/customers' },
        { label: 'Suppliers', route: '/erp/suppliers' },
        { label: 'Warehouses (Godowns)', route: '/erp/warehouses' },
        { label: 'Tax Rates', route: '/tax-rates' },
        { label: 'Dashboard (web portal)', route: '/dashboard' },
      ],
    },
  ];

  readonly sec = signal(0);
  readonly idx = signal(0);

  isActive(s: number, i: number): boolean {
    return this.sec() === s && this.idx() === i;
  }
  hover(s: number, i: number): void {
    this.sec.set(s);
    this.idx.set(i);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    const items = this.sections[this.sec()].items;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.idx.set(Math.min(this.idx() + 1, items.length - 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        this.idx.set(Math.max(this.idx() - 1, 0));
        return;
      case 'ArrowRight':
        e.preventDefault();
        this.sec.set(Math.min(this.sec() + 1, this.sections.length - 1));
        this.idx.set(Math.min(this.idx(), this.sections[this.sec()].items.length - 1));
        return;
      case 'ArrowLeft':
        e.preventDefault();
        this.sec.set(Math.max(this.sec() - 1, 0));
        this.idx.set(Math.min(this.idx(), this.sections[this.sec()].items.length - 1));
        return;
      case 'Enter':
        e.preventDefault();
        this.open(items[this.idx()]);
        return;
    }
  }

  open(item: MenuItem): void {
    void this.router.navigate([item.route], item.query ? { queryParams: item.query } : {});
  }
}
