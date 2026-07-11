import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { PermissionService } from './permission.service';

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
  private readonly perms = inject(PermissionService);
  readonly enabled = signal(false);
  /** Plan-level read-only (tenant downgraded from ERP). */
  readonly planReadOnly = signal(false);
  /**
   * Effective read-only for the current user: the tenant's plan is read-only OR
   * the signed-in user's ROLE has no write permission anywhere (e.g. Viewer).
   * This is the single flag ERP components use to hide/disable write actions, so
   * a role-based read-only user cannot create/edit/delete in the UI.
   */
  readonly readOnly = computed(() => this.planReadOnly() || this.perms.isReadOnly());
  readonly provisioned = signal(false);

  /** Can the current user WRITE this feature? (plan not read-only AND role allows). */
  canWrite(feature: string): boolean {
    return !this.planReadOnly() && this.perms.canWrite(feature);
  }
  /**
   * The tenant's full live plan-feature map from /erp/status (erp, erpOffline,
   * sfa, …). This endpoint is NOT erp-gated, so it is the single live source of
   * truth for EVERY entitlement — including modules like the salesman app that
   * work with ERP switched off. `has()` reads from it.
   */
  readonly features = signal<Record<string, boolean>>({});
  has(key: string): boolean { return this.features()[key] === true; }
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
      error: () => { this.enabled.set(false); this.planReadOnly.set(false); this.ready.set(true); },
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
    this.planReadOnly.set(!!s?.readOnly);
    this.provisioned.set(!!s?.provisioned);
    this.features.set(s?.features ?? {});
    this.ready.set(true);
  }
}
