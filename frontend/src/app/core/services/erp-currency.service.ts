import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

/**
 * Holds the tenant's BASE currency symbol (default ₹) for consistent display on
 * base-currency screens — reports, POS, generic CRUD money columns, document
 * lists. Loaded once from /erp/currencies (the `isBase` row). Per-invoice
 * currency (which can differ from base) is handled locally in the invoice screen.
 */
@Injectable({ providedIn: 'root' })
export class ErpCurrencyService {
  private readonly api = inject(ApiService);
  /** Base currency symbol; reactive so templates update once loaded. */
  readonly symbol = signal('₹');
  readonly code = signal('INR');
  private loading = false;

  /** Idempotent — safe to call from every component's ngOnInit. */
  load(): void {
    if (this.loading) return;
    this.loading = true;
    this.api.get<any>('/erp/currencies').subscribe({
      next: (r) => {
        const base = (r?.data || []).find((c: any) => c.isBase);
        if (base?.symbol) this.symbol.set(base.symbol);
        if (base?.code) this.code.set(base.code);
      },
      error: () => { this.loading = false; },
    });
  }
}
