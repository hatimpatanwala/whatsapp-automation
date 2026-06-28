import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

interface Cust {
  id: string; whatsappName?: string; displayName?: string; whatsappPhone: string; email?: string;
  totalOrders: number; totalSpent: number; status: string; lastActivity?: string; activeCartItems?: number;
}

/**
 * Token-secured customer-insights webview (/m/customers), opened from WhatsApp
 * (admin → Customers). Browse customers by segment (top spenders, pending cart,
 * high/low order counts, …) with each customer's last activity + cart. Auth is
 * the ?token= query param (a 'customers' session).
 */
@Component({
  selector: 'wa-customers-webview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-10">
      <header class="sticky top-0 z-20 bg-green-600 text-white shadow">
        <div class="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <i class="pi pi-users" style="font-size:1.1rem"></i>
          <h1 class="text-base font-semibold">Customers</h1>
          <span class="ml-auto text-xs opacity-90">{{ total() }} total</span>
        </div>
      </header>

      @if (!token() || loadError()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ loadError() || 'Missing or invalid link.' }}</p>
          </div>
        </div>
      } @else {
        <div class="max-w-2xl mx-auto p-3 space-y-3">
          <input [ngModel]="search()" (ngModelChange)="onSearch($event)" class="w-full border border-gray-300 rounded-full px-4 py-2 text-sm" placeholder="Search name or phone…" />

          <div class="flex gap-2 overflow-x-auto pb-1">
            @for (s of segments; track s.key) {
              <button class="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border"
                [class]="segment() === s.key ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'"
                (click)="select(s.key)">
                {{ s.label }}@if (counts()[s.countKey] !== undefined) { <span class="ml-1 opacity-70">{{ counts()[s.countKey] }}</span> }
              </button>
            }
          </div>

          @if (loading()) {
            <p class="text-center text-sm text-gray-400 py-10"><i class="pi pi-spin pi-spinner mr-1"></i>Loading…</p>
          } @else if (!customers().length) {
            <p class="text-center text-sm text-gray-400 py-10">No customers in this segment.</p>
          } @else {
            @for (c of customers(); track c.id) {
              <div class="bg-white rounded-xl border border-gray-100 p-3.5 shadow-sm">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-semibold text-sm text-gray-900 truncate">{{ c.displayName || c.whatsappName || c.whatsappPhone }}</p>
                    <p class="text-xs text-gray-500">{{ c.whatsappPhone }}</p>
                    <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span class="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{{ c.totalOrders }} orders</span>
                      <span class="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">₹{{ c.totalSpent | number:'1.0-0' }}</span>
                      @if (c.activeCartItems && c.activeCartItems > 0) {
                        <span class="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">🛒 {{ c.activeCartItems }} in cart</span>
                      }
                      @if (c.status === 'blocked') { <span class="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded">blocked</span> }
                    </div>
                    @if (c.lastActivity) { <p class="text-[10px] text-gray-400 mt-1">Last active {{ c.lastActivity | date:'medium' }}</p> }
                  </div>
                  <a class="shrink-0 text-green-600" [href]="'https://wa.me/' + c.whatsappPhone.replace(/[^0-9]/g,'')" target="_blank">
                    <i class="pi pi-whatsapp" style="font-size:1.2rem"></i>
                  </a>
                </div>
              </div>
            }
          }
        </div>
      }
    </div>
  `,
})
export class CustomersWebviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = environment.apiUrl;

  token = signal('');
  loading = signal(true);
  loadError = signal<string | null>(null);
  customers = signal<Cust[]>([]);
  counts = signal<Record<string, number>>({});
  total = signal(0);
  segment = signal('');
  search = signal('');
  private searchTimer: any = null;

  segments = [
    { key: '', label: 'All', countKey: 'all' },
    { key: 'top', label: '⭐ Top', countKey: 'top' },
    { key: 'high_orders', label: '🔥 High Orders', countKey: 'highOrders' },
    { key: 'low_orders', label: '🌱 Low Orders', countKey: 'lowOrders' },
    { key: 'pending_cart', label: '🛒 Pending Cart', countKey: 'pendingCart' },
    { key: 'repeat', label: '🔁 Repeat', countKey: 'repeat' },
    { key: 'new', label: '✨ New', countKey: 'new' },
    { key: 'inactive', label: '💤 Inactive', countKey: 'inactive' },
    { key: 'blocked', label: '🚫 Blocked', countKey: 'blocked' },
  ];

  constructor() { this.http = new HttpClient(inject(HttpBackend)); }
  private unwrap<T>(r: any): T { return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T; }
  private opts() { return { headers: { 'X-Builder-Token': this.token() } }; }

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token') || '';
    this.token.set(t);
    if (!t) { this.loading.set(false); return; }
    this.http.get<any>(`${this.base}/m/customers/bootstrap`, this.opts()).subscribe({
      next: (r) => {
        const d = this.unwrap<any>(r) || {};
        this.counts.set(d.counts || {});
        this.customers.set(d.customers || []);
        this.total.set(d.total || 0);
        this.loading.set(false);
      },
      error: (e) => { this.loading.set(false); this.loadError.set(e?.error?.message || 'This link is invalid or has expired.'); },
    });
  }

  select(key: string) { this.segment.set(key); this.reload(); }
  onSearch(v: string) {
    this.search.set(v);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 350);
  }

  private reload() {
    this.loading.set(true);
    let url = `${this.base}/m/customers/list?segment=${encodeURIComponent(this.segment())}`;
    if (this.search().trim()) url += `&search=${encodeURIComponent(this.search().trim())}`;
    this.http.get<any>(url, this.opts()).subscribe({
      next: (r) => { const d = this.unwrap<any>(r) || {}; this.customers.set(d.data || []); this.total.set(d.total || 0); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }
}
