import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

/**
 * Live ERP access state for the current tenant (from /erp/status):
 *  - `enabled`  → plan includes ERP → full read/write access.
 *  - `readOnly` → tenant HAD ERP (provisioned) but downgraded → can VIEW/export
 *                 their data, but not create/edit (writes are blocked server-side).
 *  - neither    → no ERP at all → ERP is hidden, an upgrade teaser is shown.
 *
 * This is the single source of truth for ERP visibility in the panel (more current
 * than the login-session feature list, which only refreshes on re-login).
 */
@Injectable({ providedIn: 'root' })
export class ErpAccessService {
  private readonly api = inject(ApiService);
  readonly enabled = signal(false);
  readonly readOnly = signal(false);
  readonly provisioned = signal(false);
  /**
   * False until the first /erp/status response lands. The nav uses this to avoid
   * rendering any ERP-conditional item from default (false) state on first paint
   * — otherwise a tenant could briefly see the wrong ERP nav before status loads
   * (the "locked items flash that disappears on refresh" bug).
   */
  readonly ready = signal(false);
  private loaded = false;

  /** Visible in the nav at all (full or read-only archive). */
  readonly visible = computed(() => this.enabled() || this.readOnly());

  /** Idempotent — call from the layout once after login. */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.refresh();
  }

  refresh(): void {
    this.api.get<any>('/erp/status').subscribe({
      next: (s) => this.apply(s),
      error: () => { this.enabled.set(false); this.readOnly.set(false); this.ready.set(true); },
    });
  }

  /** Await fresh status — used by the route guard so it can allow read-only access. */
  async ensure(): Promise<{ enabled: boolean; readOnly: boolean }> {
    try {
      const s = await firstValueFrom(this.api.get<any>('/erp/status'));
      this.apply(s);
      this.loaded = true;
      return { enabled: !!s?.enabled, readOnly: !!s?.readOnly };
    } catch {
      this.ready.set(true);
      return { enabled: this.enabled(), readOnly: this.readOnly() };
    }
  }

  private apply(s: any): void {
    this.enabled.set(!!s?.enabled);
    this.readOnly.set(!!s?.readOnly);
    this.provisioned.set(!!s?.provisioned);
    this.ready.set(true);
  }
}
