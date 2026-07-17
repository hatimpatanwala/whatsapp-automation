import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

type UpdateType = 'order' | 'invoice' | 'payment' | 'reminder' | 'quote' | 'marketing' | 'delivery' | 'update';

interface UpdateItem {
  id: string;
  type: UpdateType;
  title: string;
  body: string | null;
  link: string | null;
  icon: string | null;
  isRead: boolean;
  createdAt: string;
}

type TabKey = 'all' | 'orders' | 'invoices' | 'quotations' | 'payments';

/**
 * Customer-facing "My Updates" inbox opened from WhatsApp (/m/updates). A
 * read-only-ish feed of order/invoice/payment/quote notifications, authenticated
 * purely by the ?token= query param (a customer-bound updates session).
 *
 * Mirrors the token-webview convention: a bare HttpClient (built from HttpBackend)
 * so it bypasses the app's session/tenant/401-redirect interceptors — the token is
 * the only credential. These /m/updates/* endpoints take the token as ?token= (not
 * the X-Builder-Token header), so we thread it through as a query param.
 */
@Component({
  selector: 'wa-updates-webview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-10">
      <!-- ─── HEADER ──────────────────────────────────────────────── -->
      <header class="sticky top-0 z-20 bg-green-600 text-white shadow">
        <div class="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 text-lg leading-none">🔔</div>
          <div class="min-w-0 flex-1">
            <h1 class="text-[15px] font-bold leading-tight truncate">
              {{ name() ? 'Hi ' + name() + ', your updates' : 'Your updates' }}
            </h1>
            @if (!loading() && !error()) {
              <p class="text-[11px] text-green-50/90 leading-tight">
                @if (unreadCount() > 0) { {{ unreadCount() }} unread }
                @else { You're all caught up }
              </p>
            }
          </div>
          @if (unreadCount() > 0) {
            <button class="shrink-0 text-[11px] font-semibold bg-white/15 hover:bg-white/25 rounded-full px-3 py-1.5 disabled:opacity-50 transition"
              [disabled]="markingAll()" (click)="markAllRead()">
              @if (markingAll()) { … } @else { Mark all read }
            </button>
          }
        </div>

        <!-- ─── TABS ──────────────────────────────────────────────── -->
        @if (!loading() && !error()) {
          <div class="max-w-xl mx-auto flex gap-1 overflow-x-auto px-2 pb-1 no-scrollbar">
            @for (t of tabs; track t.key) {
              <button
                class="shrink-0 relative flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-t-lg transition"
                [class]="tab() === t.key ? 'bg-gray-50 text-green-700' : 'text-white/80 hover:text-white'"
                (click)="tab.set(t.key)">
                {{ t.label }}
                @if (tabCount(t.key) > 0) {
                  <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none"
                    [class]="tab() === t.key ? 'bg-green-100 text-green-700' : 'bg-white/20 text-white'">{{ tabCount(t.key) }}</span>
                }
              </button>
            }
          </div>
        }
      </header>

      <!-- ─── LOADING SKELETON ──────────────────────────────────────── -->
      @if (loading()) {
        <div class="max-w-xl mx-auto p-3 space-y-3">
          @for (s of [1,2,3,4]; track s) {
            <div class="bg-white rounded-2xl border border-gray-100 p-4 flex gap-3 animate-pulse">
              <div class="w-10 h-10 rounded-full bg-gray-200 shrink-0"></div>
              <div class="flex-1 space-y-2 pt-0.5">
                <div class="h-3 bg-gray-200 rounded w-2/3"></div>
                <div class="h-2.5 bg-gray-100 rounded w-full"></div>
                <div class="h-2.5 bg-gray-100 rounded w-1/3"></div>
              </div>
            </div>
          }
        </div>
      }

      <!-- ─── ERROR ─────────────────────────────────────────────────── -->
      @if (error()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p class="text-3xl mb-2">🔒</p>
            <p class="text-sm font-semibold text-red-800">{{ error() }}</p>
          </div>
        </div>
      }

      <!-- ─── LIST ──────────────────────────────────────────────────── -->
      @if (!loading() && !error()) {
        <main class="max-w-xl mx-auto p-3 space-y-2.5">
          <!-- Unread-only toggle chip -->
          <div class="flex justify-end -mb-0.5">
            <button
              class="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition"
              [class]="unreadOnly() ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200'"
              (click)="unreadOnly.set(!unreadOnly())">
              <span class="w-2 h-2 rounded-full" [class]="unreadOnly() ? 'bg-white' : 'bg-gray-300'"></span>
              Unread only
            </button>
          </div>

          @if (!visible().length) {
            <div class="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
              <p class="text-4xl mb-2">📭</p>
              <p class="text-sm font-semibold text-gray-700">{{ tab() === 'all' && !unreadOnly() ? 'No updates yet' : 'Nothing here' }}</p>
              <p class="text-xs text-gray-400 mt-1">
                {{ unreadOnly() ? 'No unread updates in this tab.' : 'New updates will show up here.' }}
              </p>
            </div>
          }

          @for (u of visible(); track u.id) {
            <button type="button"
              class="w-full text-left bg-white rounded-2xl border shadow-sm active:scale-[0.995] transition flex gap-3 p-3.5 relative"
              [class.border-gray-100]="u.isRead"
              [class.border-l-4]="!u.isRead"
              [class]="!u.isRead ? accentBorder(u.type) : ''"
              (click)="open(u)">
              <div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-xl leading-none"
                [class]="accentBg(u.type)">{{ u.icon || fallbackIcon(u.type) }}</div>
              <div class="min-w-0 flex-1">
                <div class="flex items-start gap-2">
                  <p class="text-[14px] font-bold text-gray-900 leading-snug flex-1 min-w-0">{{ u.title }}</p>
                  @if (!u.isRead) { <span class="mt-1 w-2 h-2 rounded-full bg-green-500 shrink-0"></span> }
                </div>
                @if (u.body) { <p class="text-[13px] text-gray-500 leading-snug mt-0.5 line-clamp-3">{{ u.body }}</p> }
                <div class="flex items-center gap-2 mt-1.5">
                  <span class="text-[11px] text-gray-400">{{ timeAgo(u.createdAt) }}</span>
                  @if (u.link) { <span class="text-[11px] text-green-600 font-semibold">View →</span> }
                </div>
              </div>
            </button>
          }
        </main>
      }
    </div>
  `,
  styles: [`
    .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
  `],
})
export class UpdatesWebviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = environment.apiUrl;

  token = signal('');
  loading = signal(true);
  error = signal<string | null>(null);
  markingAll = signal(false);

  name = signal<string | null>(null);
  updates = signal<UpdateItem[]>([]);

  tab = signal<TabKey>('all');
  unreadOnly = signal(false);

  readonly tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'orders', label: 'Orders' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'quotations', label: 'Quotations' },
    { key: 'payments', label: 'Payments' },
  ];

  constructor() {
    this.http = new HttpClient(inject(HttpBackend));
  }

  /** The token is the only credential; thread it through as ?token= on every call. */
  private params() {
    return { params: { token: this.token() } };
  }
  private unwrap<T>(r: any): T {
    return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
  }

  unreadCount = computed(() => this.updates().filter((u) => !u.isRead).length);

  /** Which update types belong to a given tab. */
  private matchesTab(u: UpdateItem, key: TabKey): boolean {
    switch (key) {
      case 'orders': return u.type === 'order';
      case 'invoices': return u.type === 'invoice';
      case 'quotations': return u.type === 'quote';
      case 'payments': return u.type === 'payment' || u.type === 'reminder';
      case 'all':
      default: return true;
    }
  }

  /** Count per tab (ignores the unread-only chip, so tab badges stay stable). */
  tabCount(key: TabKey): number {
    return this.updates().filter((u) => this.matchesTab(u, key)).length;
  }

  /** The list actually shown: current tab + optional unread-only filter. */
  visible = computed<UpdateItem[]>(() => {
    const key = this.tab();
    const unread = this.unreadOnly();
    return this.updates().filter((u) => this.matchesTab(u, key) && (!unread || !u.isRead));
  });

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token') || '';
    this.token.set(t);
    if (!t) {
      this.loading.set(false);
      this.error.set('This link has expired — please ask for a new one.');
      return;
    }
    this.http.get<any>(`${this.base}/m/updates/list`, this.params()).subscribe({
      next: (r) => {
        const d = this.unwrap<{ name: string | null; updates: UpdateItem[] }>(r) || { name: null, updates: [] };
        this.name.set(d.name || null);
        this.updates.set(d.updates || []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('This link has expired — please ask for a new one.');
      },
    });
  }

  /** Tap a card: optimistically mark read, fire the read call, then follow the link. */
  open(u: UpdateItem): void {
    if (!u.isRead) {
      this.updates.update((list) => list.map((x) => (x.id === u.id ? { ...x, isRead: true } : x)));
      this.http.post<any>(`${this.base}/m/updates/${u.id}/read`, {}, this.params()).subscribe({ error: () => {} });
    }
    if (u.link) {
      // Same-tab navigation, matching how the other webviews open links.
      window.location.href = u.link;
    }
  }

  markAllRead(): void {
    if (this.markingAll() || !this.unreadCount()) return;
    this.markingAll.set(true);
    // Optimistic: everything read immediately.
    this.updates.update((list) => list.map((x) => (x.isRead ? x : { ...x, isRead: true })));
    this.http.post<any>(`${this.base}/m/updates/read-all`, {}, this.params()).subscribe({
      next: () => this.markingAll.set(false),
      error: () => this.markingAll.set(false),
    });
  }

  /** Emoji fallback when the server didn't send an icon. */
  fallbackIcon(type: UpdateType): string {
    switch (type) {
      case 'order': return '📦';
      case 'invoice': return '🧾';
      case 'payment': return '💰';
      case 'reminder': return '⏰';
      case 'quote': return '📝';
      case 'marketing': return '📣';
      case 'delivery': return '🚚';
      default: return '🔔';
    }
  }

  /** Tinted avatar background per type. */
  accentBg(type: UpdateType): string {
    switch (type) {
      case 'order': return 'bg-blue-50';
      case 'invoice': return 'bg-indigo-50';
      case 'payment': return 'bg-emerald-50';
      case 'reminder': return 'bg-amber-50';
      case 'quote': return 'bg-purple-50';
      case 'marketing': return 'bg-rose-50';
      case 'delivery': return 'bg-teal-50';
      default: return 'bg-gray-100';
    }
  }

  /** Left accent border colour for an unread card. */
  accentBorder(type: UpdateType): string {
    switch (type) {
      case 'order': return 'border-l-blue-500';
      case 'invoice': return 'border-l-indigo-500';
      case 'payment': return 'border-l-emerald-500';
      case 'reminder': return 'border-l-amber-500';
      case 'quote': return 'border-l-purple-500';
      case 'marketing': return 'border-l-rose-500';
      case 'delivery': return 'border-l-teal-500';
      default: return 'border-l-green-500';
    }
  }

  /** Compact relative time, e.g. "just now", "5m ago", "2h ago", "3d ago". */
  timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    if (!then || isNaN(then)) return '';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 45) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }
}
