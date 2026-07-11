import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export type Level = 'none' | 'read' | 'write';

/**
 * Live RBAC permissions for the signed-in tenant user (from /access/my-permissions).
 * Drives nav visibility and write-action gating across BOTH the portal and the ERP.
 * The owner has full access. `can(feature, level)` is the single check everywhere.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly api = inject(ApiService);
  readonly owner = signal(false);
  readonly permissions = signal<Record<string, Level>>({});
  readonly ready = signal(false);
  private loaded = false;

  /**
   * A globally read-only user: permissions loaded, not the owner, and with no
   * `write` on ANY feature (e.g. the "Viewer" role). Drives blanket write-lock
   * of the ERP/portal so read-only users never see create/edit/delete controls.
   */
  readonly isReadOnly = computed(
    () => this.ready() && !this.owner() && !Object.values(this.permissions()).some((v) => v === 'write'),
  );

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.refresh();
  }

  refresh(): void {
    this.api.get<any>('/access/my-permissions').subscribe({
      next: (r) => this.apply(r),
      error: () => { this.owner.set(false); this.permissions.set({}); this.ready.set(true); },
    });
  }

  async ensure(): Promise<void> {
    if (this.ready()) return;
    try { this.apply(await firstValueFrom(this.api.get<any>('/access/my-permissions'))); }
    catch { this.ready.set(true); }
    this.loaded = true;
  }

  private apply(r: any): void {
    this.owner.set(!!r?.owner);
    this.permissions.set(r?.permissions ?? {});
    this.ready.set(true);
  }

  private rank(l: Level | undefined): number { return l === 'write' ? 2 : l === 'read' ? 1 : 0; }

  /** Does the user have at least `level` on `feature`? Owner always true. */
  can(feature: string, level: 'read' | 'write' = 'read'): boolean {
    if (this.owner()) return true;
    return this.rank(this.permissions()[feature]) >= this.rank(level);
  }

  canWrite(feature: string): boolean { return this.can(feature, 'write'); }
}
