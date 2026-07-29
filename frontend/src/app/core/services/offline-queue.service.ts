import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** Set on replayed requests so the offline interceptor lets them pass through (no re-queue). */
export const SKIP_OFFLINE_QUEUE = new HttpContextToken<boolean>(() => false);

export interface QueuedRequest {
  id: string;
  method: string;
  /** Absolute URL as originally sent. */
  url: string;
  body: any;
  /** Short human label for the pending list (e.g. "Order", "Collection"). */
  label: string;
  ts: number;
}

/**
 * Offline-first write queue for the field-sales app. Mutating calls that fail
 * because the device is offline are parked in localStorage and replayed the
 * moment connectivity returns (or on next app load). Survives refreshes and
 * app kills — a rep can take orders on a dead-zone beat and everything syncs
 * when they get signal back.
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly http = inject(HttpClient);
  private readonly KEY = 'sfa_offline_queue';

  readonly online = signal<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly pending = signal<QueuedRequest[]>(this.read());
  readonly syncing = signal(false);
  readonly count = computed(() => this.pending().length);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.online.set(true); this.flush(); });
      window.addEventListener('offline', () => this.online.set(false));
      // Attempt a sync on startup if we came back with a non-empty queue.
      if (this.online() && this.pending().length) setTimeout(() => this.flush(), 1500);
    }
  }

  /** Label a mutating URL for the pending list. */
  private static labelFor(url: string): string {
    if (url.includes('/orders')) return 'Order';
    if (url.includes('/collect')) return 'Collection';
    if (url.includes('/checkin') || url.includes('/visits')) return 'Visit';
    if (url.includes('/attendance')) return 'Attendance';
    if (url.includes('/expenses')) return 'Expense';
    if (url.includes('/customers')) return 'New outlet';
    if (url.includes('/promises')) return 'Promise';
    if (url.includes('/reminders')) return 'Reminder';
    return 'Change';
  }

  enqueue(method: string, url: string, body: any): QueuedRequest {
    const item: QueuedRequest = {
      id: `${Date.now()}-${this.pending().length}-${Math.round(performance.now())}`,
      method, url, body, label: OfflineQueueService.labelFor(url), ts: Date.now(),
    };
    const next = [...this.pending(), item];
    this.pending.set(next);
    this.write(next);
    return item;
  }

  /** Replay every queued request in order; stop early if we drop offline again. */
  async flush(): Promise<void> {
    if (this.syncing() || !this.online() || !this.pending().length) return;
    this.syncing.set(true);
    try {
      for (const item of [...this.pending()]) {
        try {
          await this.replay(item);
          this.remove(item.id);
        } catch (e: any) {
          // Network still down → keep it queued and stop; anything else (4xx/5xx)
          // means the server rejected it — drop it so it can't wedge the queue.
          if (e?.status === 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) break;
          this.remove(item.id);
        }
      }
    } finally {
      this.syncing.set(false);
    }
  }

  private replay(item: QueuedRequest): Promise<any> {
    const ctx = new HttpContext().set(SKIP_OFFLINE_QUEUE, true);
    return new Promise((resolve, reject) => {
      this.http.request(item.method, item.url, { body: item.body, withCredentials: true, context: ctx })
        .subscribe({ next: resolve, error: reject });
    });
  }

  private remove(id: string) {
    const next = this.pending().filter((q) => q.id !== id);
    this.pending.set(next);
    this.write(next);
  }

  private read(): QueuedRequest[] {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; }
  }
  private write(list: QueuedRequest[]) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch { /* storage full / private mode */ }
  }

  /** Only queue writes aimed at the field-sales app surface. */
  static isQueueable(method: string, url: string): boolean {
    const m = method.toUpperCase();
    if (m !== 'POST' && m !== 'PUT' && m !== 'PATCH') return false;
    return url.includes('/sfa/app/') && url.startsWith(environment.apiUrl);
  }
}
