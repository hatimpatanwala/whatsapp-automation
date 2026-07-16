import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

/** Server-reported link state for the Smart Connect (Baileys) session. */
type ConnectState = 'idle' | 'connecting' | 'qr' | 'open' | 'closed' | 'logged_out';

interface ConnectStatus {
  state: ConnectState;
  qrDataUrl?: string;
  phone?: string;
  error?: string;
  linked: boolean;
}

/**
 * WhatsApp Smart Connect — Vyapar-style QR link of the tenant's *personal*
 * WhatsApp (via an unofficial Baileys web session) so invoices & receipts can
 * be sent straight from their own number.
 *
 * Flow (all under /whatsapp/smart-connect, gated server-side by `whatsappSuite`):
 *   • GET  /status        — poll for state + rotating QR (every 2.5s while linking).
 *   • POST /start         — begin a link; then poll until `open`.
 *   • POST /disconnect    — unlink and return to the not-linked hero.
 *   • POST /send-text     — quick "send a test message" once connected.
 *
 * A prominent, always-visible amber ban-risk disclaimer is required on this
 * page: unofficial connections can get numbers restricted or banned.
 */
@Component({
  selector: 'wa-whatsapp-connect',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900">
      <!-- ── HEADER ─────────────────────────────────────────────── -->
      <header class="bg-white border-b border-gray-100">
        <div class="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <i class="pi pi-whatsapp" style="font-size:1.2rem"></i>
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-lg font-bold leading-tight">WhatsApp Smart Connect</h1>
            <p class="text-[12px] text-gray-400 leading-tight">Send invoices &amp; receipts from your own WhatsApp number</p>
          </div>
          @if (status()) {
            <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
              [class]="linked() ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'">
              <i class="pi mr-1" style="font-size:.6rem" [class.pi-circle-fill]="linked()" [class.pi-circle]="!linked()"></i>
              {{ linked() ? 'Connected' : 'Not connected' }}
            </span>
          }
        </div>
      </header>

      <main class="max-w-3xl mx-auto px-4 sm:px-6 py-6">

        <!-- ── BAN-RISK DISCLAIMER (always visible) ─────────────── -->
        <div class="mb-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3.5 flex items-start gap-3">
          <i class="pi pi-exclamation-triangle text-amber-500 mt-0.5" style="font-size:1rem"></i>
          <p class="text-[12.5px] leading-relaxed">
            <b>Smart Connect links your personal WhatsApp using an unofficial connection.</b>
            WhatsApp may restrict or ban numbers that send automated messages. Use it for genuine
            customer invoices/receipts only, avoid bulk sending, and consider the official
            WhatsApp Business API for high volume. <b>Connect at your own risk.</b>
          </p>
        </div>

        @if (error()) {
          <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 flex items-center justify-between gap-3">
            <span>{{ error() }}</span>
            <button (click)="refreshStatus()" class="font-semibold underline shrink-0">Retry</button>
          </div>
        }

        @if (loading() && !status()) {
          <!-- initial status probe -->
          <div class="animate-pulse bg-white rounded-2xl border border-gray-100 h-56"></div>
        } @else {

          <!-- ══ CONNECTED ═══════════════════════════════════════ -->
          @if (state() === 'open') {
            <div class="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
              <div class="bg-emerald-50 px-5 py-4 flex items-center gap-3 border-b border-emerald-100">
                <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <i class="pi pi-check-circle" style="font-size:1.2rem"></i>
                </div>
                <div class="min-w-0">
                  <p class="text-[15px] font-bold text-emerald-900 leading-tight">WhatsApp connected</p>
                  <p class="text-[13px] text-emerald-700 tabular-nums">{{ status()?.phone || 'Your number is linked' }}</p>
                </div>
              </div>

              <!-- Send a test message -->
              <div class="px-5 py-4">
                <p class="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Send a test message</p>
                <div class="flex flex-col sm:flex-row gap-2">
                  <input [(ngModel)]="testPhone" placeholder="Phone (e.g. 9876543210)"
                    class="rounded-xl border border-gray-200 px-3 py-2 text-sm w-full sm:w-52" />
                  <input [(ngModel)]="testText" placeholder="Message text"
                    class="rounded-xl border border-gray-200 px-3 py-2 text-sm flex-1" />
                  <button (click)="sendTest()" [disabled]="sending() || !testPhone.trim() || !testText.trim()"
                    class="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                    <i class="pi mr-1" style="font-size:.75rem" [class.pi-send]="!sending()" [class.pi-spin]="sending()" [class.pi-spinner]="sending()"></i>
                    Send
                  </button>
                </div>
                @if (testMsg()) {
                  <p class="text-[12.5px] mt-2 font-semibold"
                    [class.text-emerald-600]="testOk()" [class.text-red-600]="!testOk()">{{ testMsg() }}</p>
                }
              </div>

              <div class="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
                <p class="text-[12px] text-gray-400">Invoices &amp; receipts will be sent from this number.</p>
                <button (click)="disconnect()" [disabled]="busy()"
                  class="rounded-xl border border-red-200 text-red-600 text-sm font-semibold px-4 py-2 hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap">
                  <i class="pi mr-1" style="font-size:.75rem" [class.pi-times-circle]="!busy()" [class.pi-spin]="busy()" [class.pi-spinner]="busy()"></i>
                  Disconnect
                </button>
              </div>
            </div>
          }

          <!-- ══ QR CODE ═════════════════════════════════════════ -->
          @else if (state() === 'qr' && status()?.qrDataUrl) {
            <div class="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col md:flex-row items-center gap-6">
              <div class="shrink-0 rounded-2xl border border-gray-100 p-3 bg-white shadow-sm">
                <img [src]="status()!.qrDataUrl" alt="WhatsApp QR code" width="260" height="260"
                  class="w-[260px] h-[260px] object-contain" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[15px] font-bold text-gray-900 mb-3">Scan to link your WhatsApp</p>
                <ol class="space-y-2.5">
                  @for (s of qrSteps; track $index) {
                    <li class="flex items-start gap-2.5 text-[13.5px] text-gray-700">
                      <span class="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{{ $index + 1 }}</span>
                      <span [innerHTML]="s"></span>
                    </li>
                  }
                </ol>
                <p class="text-[11px] text-gray-400 mt-4 flex items-center gap-1.5">
                  <i class="pi pi-spin pi-spinner text-emerald-500" style="font-size:.7rem"></i>
                  Waiting for you to scan… the code refreshes automatically.
                </p>
              </div>
            </div>
          }

          <!-- ══ CONNECTING ══════════════════════════════════════ -->
          @else if (state() === 'connecting' || (polling() && state() !== 'qr')) {
            <div class="bg-white rounded-2xl border border-gray-100 p-10 flex flex-col items-center text-center">
              <i class="pi pi-spin pi-spinner text-emerald-500 mb-4" style="font-size:2rem"></i>
              <p class="text-[15px] font-semibold text-gray-700">Preparing your secure link…</p>
              <p class="text-[13px] text-gray-400 mt-1">This takes a few seconds. A QR code will appear shortly.</p>
            </div>
          }

          <!-- ══ NOT LINKED (hero) ═══════════════════════════════ -->
          @else {
            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div class="px-6 py-8 text-center">
                <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-lg mb-5">
                  <i class="pi pi-whatsapp" style="font-size:1.8rem"></i>
                </div>
                <h2 class="text-xl font-bold text-gray-900 mb-2">Connect your WhatsApp</h2>
                <p class="text-[13.5px] text-gray-500 max-w-md mx-auto mb-6">
                  Link your WhatsApp to send invoices &amp; receipts directly from your own number — no extra apps,
                  your customers see messages from you.
                </p>
                <button (click)="connect()" [disabled]="busy()"
                  class="rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-semibold px-6 py-3 shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                  <i class="pi mr-1.5" style="font-size:.85rem" [class.pi-qrcode]="!busy()" [class.pi-spin]="busy()" [class.pi-spinner]="busy()"></i>
                  Connect WhatsApp
                </button>
                @if (state() === 'logged_out') {
                  <p class="text-[12px] text-amber-600 mt-4">Your previous session was logged out. Reconnect to continue.</p>
                }
              </div>
            </div>
          }
        }
      </main>
    </div>
  `,
})
export class WhatsappConnectComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  readonly status = signal<ConnectStatus | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);      // start / disconnect in-flight
  readonly sending = signal(false);   // test message in-flight
  readonly polling = signal(false);
  readonly error = signal('');

  readonly testMsg = signal('');
  readonly testOk = signal(false);
  testPhone = '';
  testText = 'Hello from my business 👋';

  readonly state = computed<ConnectState>(() => this.status()?.state ?? 'idle');
  readonly linked = computed(() => !!this.status()?.linked || this.state() === 'open');

  readonly qrSteps = [
    'Open <b>WhatsApp</b> on your phone',
    'Tap <b>⋮ / Settings</b> → <b>Linked Devices</b>',
    'Tap <b>Link a Device</b>',
    'Point your phone at this screen to <b>scan the code</b>',
  ];

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollBusy = false;

  ngOnInit() {
    this.refreshStatus(true);
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  /** One-shot status probe (on load, retry). Resumes polling if already linking. */
  refreshStatus(initial = false) {
    if (initial) this.loading.set(true);
    this.error.set('');
    this.api.get<ConnectStatus>('/whatsapp/smart-connect/status').subscribe({
      next: (r) => {
        this.status.set(r || { state: 'idle', linked: false });
        this.loading.set(false);
        // If the server says we're mid-link (or a QR is up), keep the poll alive.
        if (this.isLinkingState(r?.state)) this.startPolling();
        else this.stopPolling();
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(this.msg(e, 'Could not check WhatsApp connection.'));
      },
    });
  }

  /** Begin a link: POST start, then poll status until it goes `open`. */
  connect() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.post<{ state: ConnectState; linked: boolean }>('/whatsapp/smart-connect/start', {}).subscribe({
      next: (r) => {
        this.busy.set(false);
        // Optimistically reflect the returned state, then let polling take over.
        this.status.set({ state: r?.state ?? 'connecting', linked: !!r?.linked });
        this.startPolling();
        this.poll(); // fetch the first real status (with QR) immediately
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.msg(e, 'Could not start the connection.'));
      },
    });
  }

  disconnect() {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.post<{ disconnected: boolean }>('/whatsapp/smart-connect/disconnect', {}).subscribe({
      next: () => {
        this.busy.set(false);
        this.stopPolling();
        this.status.set({ state: 'closed', linked: false });
        this.testMsg.set('');
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.msg(e, 'Could not disconnect.'));
      },
    });
  }

  sendTest() {
    const phone = this.testPhone.trim();
    const text = this.testText.trim();
    if (!phone || !text || this.sending()) return;
    this.sending.set(true);
    this.testMsg.set('');
    this.api.post<{ sent: boolean; phone?: string }>('/whatsapp/smart-connect/send-text', { phone, text }).subscribe({
      next: (r) => {
        this.sending.set(false);
        this.testOk.set(!!r?.sent);
        this.testMsg.set(r?.sent ? `Sent to ${r.phone || phone} ✓` : 'Message could not be sent.');
      },
      error: (e) => {
        this.sending.set(false);
        this.testOk.set(false);
        this.testMsg.set(this.msg(e, 'Send failed — is the number on WhatsApp?'));
      },
    });
  }

  // ── polling ─────────────────────────────────────────────────────────────
  private startPolling() {
    this.polling.set(true);
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.poll(), 2500);
  }

  private stopPolling() {
    this.polling.set(false);
    this.pollBusy = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private poll() {
    if (this.pollBusy) return; // don't stack requests if one is slow
    this.pollBusy = true;
    this.api.get<ConnectStatus>('/whatsapp/smart-connect/status').subscribe({
      next: (r) => {
        this.pollBusy = false;
        this.status.set(r || { state: 'idle', linked: false });
        // Stop once open (linked) or once linking clearly ended.
        if (!this.isLinkingState(r?.state)) this.stopPolling();
      },
      error: () => { this.pollBusy = false; /* transient — keep polling */ },
    });
  }

  /** States where we should keep polling (a link is in progress / QR is live). */
  private isLinkingState(s?: ConnectState): boolean {
    return s === 'connecting' || s === 'qr';
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  private msg(e: any, fallback: string): string {
    return e?.error?.error?.message || e?.error?.message || fallback;
  }
}
