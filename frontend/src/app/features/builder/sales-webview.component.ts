import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

type Tab = 'home' | 'customers' | 'pending' | 'followups';

const unwrap = <T>(r: any): T => (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;

/**
 * Salesman field app (`/m/sales`) — token-secured WhatsApp webview. The admin
 * shares a wa.me link; the salesman opens it inside WhatsApp and can: see the
 * day's collection targets, search customers with outstanding, punch orders on
 * their behalf, collect payments (cash / cheque no+date / UPI / online + txn ref)
 * and record promise-to-pay follow-ups when the customer can't pay today.
 */
@Component({
  selector: 'wa-sales-webview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-24">
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <i class="pi pi-briefcase" style="font-size:1.05rem"></i>
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-[15px] font-bold truncate leading-tight">Sales App</h1>
            <p class="text-[11px] text-gray-400 leading-tight truncate">{{ me()?.name || '…' }} {{ me()?.route ? '· ' + me()?.route : '' }}</p>
          </div>
        </div>
        @if (authed()) {
          <div class="max-w-2xl mx-auto px-2 flex gap-1 overflow-x-auto no-scrollbar">
            @for (t of tabs; track t.id) {
              <button (click)="go(t.id)"
                class="px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors"
                [class.border-indigo-600]="view() === t.id"
                [class.text-indigo-700]="view() === t.id"
                [class.border-transparent]="view() !== t.id"
                [class.text-gray-400]="view() !== t.id">{{ t.label }}</button>
            }
          </div>
        }
      </header>

      @if (loadError()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ loadError() }}</p>
            <p class="text-xs text-red-500 mt-1">Ask your admin to share a fresh link.</p>
          </div>
        </div>
      } @else if (authed()) {
        <main class="max-w-2xl mx-auto px-4 py-4">

          <!-- ── HOME ─────────────────────────────────────────────── -->
          @if (view() === 'home') {
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white rounded-2xl border border-gray-100 p-4">
                <p class="text-[11px] font-semibold text-gray-400 uppercase">Market outstanding</p>
                <p class="text-xl font-bold tabular-nums mt-1">₹{{ fmt(home()?.pendingTotal) }}</p>
                <p class="text-[11px] text-gray-400">{{ home()?.pendingBills || 0 }} open bill(s)</p>
              </div>
              <div class="bg-white rounded-2xl border border-gray-100 p-4">
                <p class="text-[11px] font-semibold text-gray-400 uppercase">Collected today</p>
                <p class="text-xl font-bold tabular-nums mt-1 text-emerald-700">₹{{ fmt(home()?.collectedToday?.amount) }}</p>
                <p class="text-[11px] text-gray-400">{{ home()?.collectedToday?.count || 0 }} receipt(s)</p>
              </div>
            </div>
            <h2 class="text-[13px] font-bold text-gray-500 uppercase mt-5 mb-2">Promises due today</h2>
            @if (!home()?.promisesDue?.length) {
              <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No follow-ups due. 🎉</p>
            }
            @for (p of home()?.promisesDue || []; track p.id) {
              <div class="bg-white rounded-xl border border-amber-200 p-3 mb-2">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ p.customerName }}</p>
                    <p class="text-[11px] text-gray-400">{{ p.invoiceNumber || 'On account' }} · promised {{ p.promiseDate | date:'d MMM' }}</p>
                  </div>
                  <p class="text-sm font-bold tabular-nums text-amber-700">₹{{ fmt(p.amount) }}</p>
                </div>
                <div class="flex gap-2 mt-2">
                  <button (click)="openCollectForPromise(p)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">Collect now</button>
                  <button (click)="markPromise(p, 'broken')" class="text-[12px] font-semibold text-red-600 border border-red-200 rounded-lg px-3">Not paid</button>
                </div>
              </div>
            }
          }

          <!-- ── CUSTOMERS ────────────────────────────────────────── -->
          @if (view() === 'customers') {
            @if (!customer()) {
              <input [(ngModel)]="custQ" (ngModelChange)="searchCustomers()" placeholder="Search name / phone / area…"
                class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3 bg-white" />
              @for (c of customers(); track c.id) {
                <button (click)="openCustomer(c.id)" class="w-full text-left bg-white rounded-xl border border-gray-100 p-3 mb-2 active:bg-gray-50">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold truncate">{{ c.name }}</p>
                      <p class="text-[11px] text-gray-400">{{ c.phone }} {{ c.area ? '· ' + c.area : '' }}</p>
                    </div>
                    <div class="text-right shrink-0">
                      <p class="text-sm font-bold tabular-nums" [class.text-red-600]="+c.outstanding > 0">₹{{ fmt(c.outstanding) }}</p>
                      <p class="text-[11px] text-gray-400">{{ c.openBills }} bill(s)</p>
                    </div>
                  </div>
                </button>
              }
            } @else {
              <!-- customer detail -->
              <button (click)="customer.set(null)" class="text-[12px] font-semibold text-indigo-700 mb-2"><i class="pi pi-arrow-left mr-1"></i>All customers</button>
              <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
                <p class="text-base font-bold">{{ customer()?.name }}</p>
                <p class="text-[12px] text-gray-400">{{ customer()?.phone }} {{ customer()?.area ? '· ' + customer()?.area : '' }}</p>
                <div class="flex gap-2 mt-3">
                  <button (click)="startOrder()" class="flex-1 text-[13px] font-semibold bg-indigo-600 text-white rounded-xl py-2">+ New order</button>
                  <button (click)="openPromise(null)" class="flex-1 text-[13px] font-semibold border border-amber-300 text-amber-700 rounded-xl py-2">Promise to pay</button>
                </div>
              </div>
              <h2 class="text-[13px] font-bold text-gray-500 uppercase mb-2">Open bills</h2>
              @if (!customer()?.bills?.length) { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">Nothing outstanding. 🎉</p> }
              @for (b of customer()?.bills || []; track b.id) {
                <div class="bg-white rounded-xl border border-gray-100 p-3 mb-2">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-semibold">{{ b.invoiceNumber }}</p>
                      <p class="text-[11px] text-gray-400">{{ b.issuedAt | date:'d MMM yy' }} {{ b.dueDate ? '· due ' + (b.dueDate | date:'d MMM') : '' }}</p>
                    </div>
                    <div class="text-right">
                      <p class="text-sm font-bold tabular-nums text-red-600">₹{{ fmt(b.balanceDue) }}</p>
                      <p class="text-[10px] text-gray-400">of ₹{{ fmt(b.total) }}</p>
                    </div>
                  </div>
                  <div class="flex gap-2 mt-2">
                    <button (click)="openCollect(b)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">₹ Collect</button>
                    <button (click)="openPromise(b)" class="text-[12px] font-semibold text-amber-700 border border-amber-300 rounded-lg px-3">Promise</button>
                  </div>
                </div>
              }
              @if (customer()?.promises?.length) {
                <h2 class="text-[13px] font-bold text-gray-500 uppercase mt-4 mb-2">Open promises</h2>
                @for (p of customer()?.promises || []; track p.id) {
                  <div class="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-2 flex items-center justify-between">
                    <p class="text-[12px] text-amber-800">₹{{ fmt(p.amount) }} on {{ p.promiseDate | date:'d MMM' }}{{ p.note ? ' — ' + p.note : '' }}</p>
                  </div>
                }
              }
            }
          }

          <!-- ── PENDING (collection run) ─────────────────────────── -->
          @if (view() === 'pending') {
            @for (b of pending(); track b.id) {
              <div class="bg-white rounded-xl border border-gray-100 p-3 mb-2">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ b.customerName }}</p>
                    <p class="text-[11px] text-gray-400">{{ b.invoiceNumber }} · {{ b.issuedAt | date:'d MMM' }} {{ b.dueDate ? '· due ' + (b.dueDate | date:'d MMM') : '' }}</p>
                  </div>
                  <p class="text-sm font-bold tabular-nums text-red-600 shrink-0">₹{{ fmt(b.balanceDue) }}</p>
                </div>
                <div class="flex gap-2 mt-2">
                  <button (click)="openCollect(b)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">₹ Collect</button>
                  <button (click)="openPromiseFor(b)" class="text-[12px] font-semibold text-amber-700 border border-amber-300 rounded-lg px-3">Promise</button>
                </div>
              </div>
            } @empty { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No pending bills. 🎉</p> }
          }

          <!-- ── FOLLOW-UPS ───────────────────────────────────────── -->
          @if (view() === 'followups') {
            <div class="flex gap-1 mb-3">
              @for (s of ['due','open','all']; track s) {
                <button (click)="promiseScope.set(s); loadPromises()"
                  class="px-3 py-1.5 text-[12px] font-semibold rounded-full border"
                  [class.bg-indigo-600]="promiseScope() === s" [class.text-white]="promiseScope() === s"
                  [class.border-indigo-600]="promiseScope() === s" [class.border-gray-200]="promiseScope() !== s"
                  [class.text-gray-500]="promiseScope() !== s">{{ s | titlecase }}</button>
              }
            </div>
            @for (p of promiseList(); track p.id) {
              <div class="bg-white rounded-xl border p-3 mb-2"
                [class.border-amber-300]="p.status === 'open'" [class.border-gray-100]="p.status !== 'open'">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ p.customerName }}</p>
                    <p class="text-[11px] text-gray-400">{{ p.invoiceNumber || 'On account' }} · {{ p.promiseDate | date:'d MMM yy' }} · {{ p.status }}</p>
                    @if (p.note) { <p class="text-[11px] text-gray-500 mt-0.5">{{ p.note }}</p> }
                  </div>
                  <p class="text-sm font-bold tabular-nums shrink-0">₹{{ fmt(p.amount) }}</p>
                </div>
                @if (p.status === 'open') {
                  <div class="flex gap-2 mt-2">
                    <button (click)="openCollectForPromise(p)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">Collect now</button>
                    <button (click)="markPromise(p, 'broken')" class="text-[12px] font-semibold text-red-600 border border-red-200 rounded-lg px-3">Not paid</button>
                  </div>
                }
              </div>
            } @empty { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No follow-ups here.</p> }
          }
        </main>
      }

      <!-- ── COLLECT SHEET ──────────────────────────────────────── -->
      @if (collectFor(); as bill) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" (click)="collectFor.set(null)">
          <div class="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" (click)="$event.stopPropagation()">
            <h3 class="text-base font-bold mb-1">Collect payment</h3>
            <p class="text-[12px] text-gray-400 mb-3">{{ bill.invoiceNumber }} · balance ₹{{ fmt(bill.balanceDue) }}</p>
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Amount</label>
            <input type="number" [(ngModel)]="colAmount" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Payment type</label>
            <div class="grid grid-cols-4 gap-1.5 mb-3 mt-1">
              @for (m of ['cash','cheque','upi','online']; track m) {
                <button (click)="colMethod.set(m)"
                  class="py-2 text-[12px] font-semibold rounded-xl border"
                  [class.bg-indigo-600]="colMethod() === m" [class.text-white]="colMethod() === m"
                  [class.border-indigo-600]="colMethod() === m" [class.border-gray-200]="colMethod() !== m">{{ m | titlecase }}</button>
              }
            </div>
            @if (colMethod() === 'cheque' || colMethod() === 'online' || colMethod() === 'upi') {
              <label class="text-[11px] font-semibold text-gray-500 uppercase">{{ colMethod() === 'cheque' ? 'Cheque number' : 'Transaction ref' }}</label>
              <input [(ngModel)]="colInstrument" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3"
                [placeholder]="colMethod() === 'cheque' ? '6-digit cheque no' : 'UTR / UPI ref'" />
            }
            @if (colMethod() === 'cheque') {
              <label class="text-[11px] font-semibold text-gray-500 uppercase">Cheque date</label>
              <input type="date" [(ngModel)]="colInstrumentDate" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
            }
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Note (optional)</label>
            <input [(ngModel)]="colNote" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-4" />
            @if (sheetError()) { <p class="text-[12px] text-red-600 mb-2">{{ sheetError() }}</p> }
            <button (click)="submitCollect()" [disabled]="busy()"
              class="w-full bg-emerald-600 text-white font-bold rounded-xl py-3 disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save receipt' }}
            </button>
          </div>
        </div>
      }

      <!-- ── PROMISE SHEET ──────────────────────────────────────── -->
      @if (promiseSheet()) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" (click)="promiseSheet.set(false)">
          <div class="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" (click)="$event.stopPropagation()">
            <h3 class="text-base font-bold mb-1">Promise to pay</h3>
            <p class="text-[12px] text-gray-400 mb-3">{{ promiseBill()?.invoiceNumber || 'On account' }} — customer will pay on the chosen date; it shows in Follow-ups.</p>
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Amount</label>
            <input type="number" [(ngModel)]="prAmount" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Will pay on</label>
            <input type="date" [(ngModel)]="prDate" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Note (optional)</label>
            <input [(ngModel)]="prNote" placeholder="e.g. after market day" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-4" />
            @if (sheetError()) { <p class="text-[12px] text-red-600 mb-2">{{ sheetError() }}</p> }
            <button (click)="submitPromise()" [disabled]="busy()"
              class="w-full bg-amber-500 text-white font-bold rounded-xl py-3 disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save promise' }}
            </button>
          </div>
        </div>
      }

      <!-- ── ORDER SHEET ────────────────────────────────────────── -->
      @if (orderSheet()) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" (click)="orderSheet.set(false)">
          <div class="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <h3 class="text-base font-bold mb-1">New order — {{ customer()?.name }}</h3>
            <input [(ngModel)]="prodQ" (ngModelChange)="searchProducts()" placeholder="Search item…"
              class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm my-3" />
            @for (p of products(); track p.id) {
              <button (click)="addLine(p)" class="w-full text-left flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-1">
                <span class="text-[13px] font-medium truncate">{{ p.name }}</span>
                <span class="text-[12px] text-gray-500 tabular-nums shrink-0">₹{{ fmt(p.salePrice ?? p.basePrice) }}</span>
              </button>
            }
            @if (lines().length) {
              <h4 class="text-[12px] font-bold text-gray-500 uppercase mt-3 mb-1">Cart</h4>
              @for (l of lines(); track $index) {
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-[13px] flex-1 truncate">{{ l.productName }}</span>
                  <input type="number" [(ngModel)]="l.quantity" class="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" />
                  <input type="number" [(ngModel)]="l.unitPrice" class="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" />
                  <button (click)="removeLine($index)" class="text-red-500 px-1"><i class="pi pi-times"></i></button>
                </div>
              }
              <p class="text-right text-sm font-bold tabular-nums mb-3">Total ₹{{ fmt(orderTotal()) }}</p>
            }
            @if (sheetError()) { <p class="text-[12px] text-red-600 mb-2">{{ sheetError() }}</p> }
            <button (click)="submitOrder()" [disabled]="busy() || !lines().length"
              class="w-full bg-indigo-600 text-white font-bold rounded-xl py-3 disabled:opacity-50">
              {{ busy() ? 'Placing…' : 'Place order' }}
            </button>
          </div>
        </div>
      }

      @if (toast()) {
        <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {{ toast() }}
        </div>
      }
    </div>
  `,
})
export class SalesWebviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = `${environment.apiUrl}/sfa/m`;

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: '🏠 Today' },
    { id: 'customers', label: '👥 Customers' },
    { id: 'pending', label: '₹ Pending' },
    { id: 'followups', label: '📅 Follow-ups' },
  ];

  private t = '';
  private token = '';
  readonly authed = signal(false);
  readonly loadError = signal('');
  readonly view = signal<Tab>('home');
  readonly me = signal<any>(null);
  readonly home = signal<any>(null);
  readonly customers = signal<any[]>([]);
  readonly customer = signal<any>(null);
  readonly pending = signal<any[]>([]);
  readonly promiseList = signal<any[]>([]);
  readonly promiseScope = signal('due');
  readonly products = signal<any[]>([]);
  readonly lines = signal<any[]>([]);
  readonly collectFor = signal<any>(null);
  readonly promiseSheet = signal(false);
  readonly promiseBill = signal<any>(null);
  readonly orderSheet = signal(false);
  readonly colMethod = signal('cash');
  readonly busy = signal(false);
  readonly sheetError = signal('');
  readonly toast = signal('');
  custQ = ''; prodQ = '';
  colAmount: number | null = null; colInstrument = ''; colInstrumentDate = ''; colNote = '';
  private colPromiseId: string | null = null;
  private colCustomerId: string | null = null;
  prAmount: number | null = null; prDate = ''; prNote = '';
  readonly orderTotal = computed(() => this.lines().reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0));

  constructor() { this.http = new HttpClient(inject(HttpBackend)); }

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    this.t = qp.get('t') || '';
    this.token = qp.get('token') || '';
    if (!this.t || !this.token) { this.loadError.set('Missing or invalid link.'); return; }
    this.get('me').subscribe({
      next: (r) => { const d = unwrap<any>(r); this.me.set(d.salesman); this.home.set(d); this.authed.set(true); },
      error: (e) => this.loadError.set(e?.error?.message || 'Link expired or deactivated.'),
    });
  }

  private qs(extra: Record<string, string> = {}) {
    return { params: { t: this.t, token: this.token, ...extra } };
  }
  private get(path: string, extra: Record<string, string> = {}) { return this.http.get(`${this.base}/${path}`, this.qs(extra)); }
  private post(path: string, body: any) { return this.http.post(`${this.base}/${path}`, body, this.qs()); }

  go(t: Tab) {
    this.view.set(t);
    if (t === 'home') this.refreshHome();
    if (t === 'customers' && !this.customers().length) this.searchCustomers();
    if (t === 'pending') this.get('pending').subscribe((r) => this.pending.set(unwrap(r)));
    if (t === 'followups') this.loadPromises();
  }

  refreshHome() {
    this.get('me').subscribe((r) => { const d = unwrap<any>(r); this.me.set(d.salesman); this.home.set(d); });
  }

  searchCustomers() {
    this.get('customers', { q: this.custQ }).subscribe((r) => this.customers.set(unwrap(r)));
  }
  openCustomer(id: string) {
    this.get(`customers/${id}`).subscribe((r) => this.customer.set(unwrap(r)));
  }
  loadPromises() {
    this.get('promises', { scope: this.promiseScope() }).subscribe((r) => this.promiseList.set(unwrap(r)));
  }

  // Collect
  openCollect(bill: any) {
    this.collectFor.set(bill);
    this.colAmount = Number(bill.balanceDue) || null;
    this.colMethod.set('cash'); this.colInstrument = ''; this.colInstrumentDate = ''; this.colNote = '';
    this.colPromiseId = null; this.sheetError.set('');
  }
  openCollectForPromise(p: any) {
    this.collectFor.set({ id: p.invoiceId, invoiceNumber: p.invoiceNumber || 'On account', balanceDue: p.balanceDue ?? p.amount });
    this.colAmount = Number(p.amount) || null;
    this.colMethod.set('cash'); this.colInstrument = ''; this.colInstrumentDate = ''; this.colNote = '';
    this.colPromiseId = p.id; this.sheetError.set('');
  }
  submitCollect() {
    const bill = this.collectFor();
    if (!bill?.id) { this.sheetError.set('This promise has no linked invoice — collect from the customer\'s bill list.'); return; }
    if (!(Number(this.colAmount) > 0)) { this.sheetError.set('Enter the amount received.'); return; }
    if (this.colMethod() === 'cheque' && !this.colInstrument.trim()) { this.sheetError.set('Cheque number is required.'); return; }
    this.busy.set(true);
    this.post('collect', {
      invoiceId: bill.id, amount: Number(this.colAmount), method: this.colMethod(),
      instrumentNo: this.colInstrument || undefined, instrumentDate: this.colInstrumentDate || undefined,
      note: this.colNote || undefined, promiseId: this.colPromiseId || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false); this.collectFor.set(null); this.showToast('✅ Payment recorded');
        this.refreshHome();
        if (this.customer()) this.openCustomer(this.customer().id);
        if (this.view() === 'pending') this.go('pending');
        if (this.view() === 'followups') this.loadPromises();
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not record payment.'); },
    });
  }

  // Promise
  openPromise(bill: any) {
    this.promiseBill.set(bill);
    this.colCustomerId = this.customer()?.id || bill?.customerId || null;
    this.prAmount = bill ? Number(bill.balanceDue) || null : null;
    this.prDate = ''; this.prNote = ''; this.sheetError.set('');
    this.promiseSheet.set(true);
  }
  openPromiseFor(bill: any) {
    this.promiseBill.set(bill);
    this.colCustomerId = bill.customerId;
    this.prAmount = Number(bill.balanceDue) || null;
    this.prDate = ''; this.prNote = ''; this.sheetError.set('');
    this.promiseSheet.set(true);
  }
  submitPromise() {
    if (!this.colCustomerId) { this.sheetError.set('No customer selected.'); return; }
    if (!(Number(this.prAmount) > 0) || !this.prDate) { this.sheetError.set('Amount and date are required.'); return; }
    this.busy.set(true);
    this.post('promises', {
      customerId: this.colCustomerId, invoiceId: this.promiseBill()?.id || undefined,
      amount: Number(this.prAmount), promiseDate: this.prDate, note: this.prNote || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false); this.promiseSheet.set(false); this.showToast('📅 Promise saved');
        if (this.customer()) this.openCustomer(this.customer().id);
        if (this.view() === 'followups') this.loadPromises();
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not save promise.'); },
    });
  }
  markPromise(p: any, status: string) {
    this.http.patch(`${this.base}/promises/${p.id}`, { status }, this.qs()).subscribe({
      next: () => { this.showToast(status === 'broken' ? 'Marked not paid' : 'Updated'); this.loadPromises(); this.refreshHome(); },
      error: () => this.showToast('Could not update'),
    });
  }

  // Order
  startOrder() {
    this.lines.set([]); this.prodQ = ''; this.products.set([]); this.sheetError.set('');
    this.orderSheet.set(true); this.searchProducts();
  }
  searchProducts() {
    this.get('products', { q: this.prodQ }).subscribe((r) => this.products.set(unwrap(r)));
  }
  addLine(p: any) {
    this.lines.update((ls) => [...ls, { productId: p.id, productName: p.name, quantity: 1, unitPrice: Number(p.salePrice ?? p.basePrice) || 0 }]);
  }
  removeLine(i: number) { this.lines.update((ls) => ls.filter((_, x) => x !== i)); }
  submitOrder() {
    this.busy.set(true);
    this.post('orders', { customerId: this.customer()?.id, items: this.lines() }).subscribe({
      next: (r: any) => {
        const d = unwrap<any>(r);
        this.busy.set(false); this.orderSheet.set(false);
        this.showToast(`✅ Order ${d?.orderNumber || 'placed'}`);
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not place order.'); },
    });
  }

  fmt(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  showToast(msg: string) { this.toast.set(msg); setTimeout(() => this.toast.set(''), 2500); }
}
