import { Injectable } from '@angular/core';

/**
 * Retains half-finished voucher entries across navigation. Miracle keeps its
 * screens alive; our SPA destroys a component the moment the operator jumps
 * away (e.g. to Item Master to add stock mid-invoice). Entry components
 * snapshot their typed state on destroy and restore it on return; a successful
 * save — or Alt+X — clears the draft. localStorage-backed, so a draft even
 * survives an app restart.
 */
@Injectable({ providedIn: 'root' })
export class EntryDraftService {
  private key(k: string): string { return `wa-entry-draft:${k}`; }

  save(k: string, state: unknown): void {
    try { localStorage.setItem(this.key(k), JSON.stringify({ at: Date.now(), state })); } catch { /* storage full — skip */ }
  }

  load<T>(k: string): T | null {
    try {
      const raw = localStorage.getItem(this.key(k));
      if (!raw) return null;
      return (JSON.parse(raw).state ?? null) as T | null;
    } catch { return null; }
  }

  clear(k: string): void { localStorage.removeItem(this.key(k)); }

  /** Transient status-bar chip (rendered by the ERP layout). */
  note(msg: string): void { document.dispatchEvent(new CustomEvent('wa-draft-note', { detail: msg })); }
}
