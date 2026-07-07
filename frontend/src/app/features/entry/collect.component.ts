import { Component, HostListener, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntryService } from '../../core/services/entry.service';

/**
 * Payments & Collections (PAYMENTS_MODULE_README §9): the admin panel.
 *   Queue — claimed/pending Mode-A collections with the "Payment Received"
 *           button (the ONLY manual path to CONFIRMED) + bulk confirm.
 *   Feed  — recently confirmed collections (all modes).
 *   Reconciliation — signature-valid credits that didn't auto-match.
 *   Setup — collection methods (UPI/bank, default, active) + mode + gateway keys
 *           (stored server-side, encrypted; secrets never echoed back).
 */
@Component({
  selector: 'wa-collect',
  standalone: true,
  imports: [FormsModule, DatePipe, JsonPipe],
  template: `
    <div class="p-3 md:p-5 select-none">
      <div class="flex items-center gap-4 mb-3 border-b pb-2 flex-wrap">
        <h1 class="text-lg font-semibold">Payments &amp; Collections</h1>
        <div class="flex rounded overflow-hidden border text-sm">
          @for (t of tabs; track t) {
            <button (click)="tab.set(t)" class="px-3 py-1 capitalize"
                    [class.bg-slate-800]="tab() === t" [class.text-white]="tab() === t">{{ t }}</button>
          }
        </div>
        <span class="text-xs text-slate-500">Mode {{ cfg()?.mode || 'A' }} · {{ cfg()?.mode === 'A' ? 'manual (₹0 fees, direct to your bank)' : cfg()?.mode === 'B' ? 'auto-reconciled UPI' : 'payment gateway' }}</span>
        @if (msg()) { <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">✓ {{ msg() }}</span> }
        @if (err()) { <span class="text-sm text-red-600">{{ err() }}</span> }
      </div>

      <!-- QUEUE -->
      @if (tab() === 'queue') {
        <p class="text-xs text-slate-500 mb-2">A customer's "paid" claim is not proof — verify against your bank/UPI app, then click <b>Payment Received</b>. Screenshots are claims, not confirmation.</p>
        <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
          <thead><tr class="bg-slate-100 text-slate-600">
            <th class="border border-slate-300 px-2 py-1 w-8"><input type="checkbox" (change)="toggleAll($any($event.target).checked)" /></th>
            <th class="border border-slate-300 px-2 py-1 text-left">Invoice</th>
            <th class="border border-slate-300 px-2 py-1 text-left">Party</th>
            <th class="border border-slate-300 px-2 py-1 w-24 text-right">Amount</th>
            <th class="border border-slate-300 px-2 py-1 w-24">Status</th>
            <th class="border border-slate-300 px-2 py-1 text-left">Claim note</th>
            <th class="border border-slate-300 px-2 py-1 w-40 text-left">Created</th>
            <th class="border border-slate-300 px-2 py-1 w-40"></th>
          </tr></thead>
          <tbody>
            @for (c of pending(); track c.id) {
              <tr [class.bg-amber-50]="c.status === 'CLAIMED'">
                <td class="border border-slate-300 text-center"><input type="checkbox" [checked]="sel().has(c.id)" (change)="toggleSel(c.id)" /></td>
                <td class="border border-slate-300 px-2 py-1 font-mono text-xs">{{ c.referenceId }}</td>
                <td class="border border-slate-300 px-2 py-1">{{ c.customerName || '—' }}</td>
                <td class="border border-slate-300 px-2 py-1 text-right font-medium">{{ fmt(c.amount) }}</td>
                <td class="border border-slate-300 px-2 py-1 text-center text-xs">
                  <span [class.text-amber-700]="c.status === 'CLAIMED'">{{ c.status }}</span>
                </td>
                <td class="border border-slate-300 px-2 py-1 text-xs text-slate-500">{{ c.claimNote || '' }}</td>
                <td class="border border-slate-300 px-2 py-1 text-xs">{{ c.createdAt | date: 'dd-MM-yy HH:mm' }}</td>
                <td class="border border-slate-300 px-2 py-1 text-center">
                  <button (click)="confirm(c)" class="text-xs px-2 py-1 rounded bg-emerald-600 text-white">✓ Payment Received</button>
                </td>
              </tr>
            } @empty { <tr><td colspan="8" class="border border-slate-300 px-2 py-4 text-center text-slate-400">No pending collections. 🎉</td></tr> }
          </tbody>
        </table>
        @if (sel().size) {
          <button (click)="bulkConfirm()" class="mt-2 px-3 py-1.5 rounded bg-emerald-700 text-white text-sm">✓ Confirm {{ sel().size }} selected</button>
        }
      }

      <!-- FEED -->
      @if (tab() === 'feed') {
        <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
          <thead><tr class="bg-slate-100 text-slate-600">
            <th class="border border-slate-300 px-2 py-1 text-left">Invoice</th>
            <th class="border border-slate-300 px-2 py-1 text-left">Party</th>
            <th class="border border-slate-300 px-2 py-1 w-24 text-right">Amount</th>
            <th class="border border-slate-300 px-2 py-1 w-20">Mode</th>
            <th class="border border-slate-300 px-2 py-1 w-24">Method</th>
            <th class="border border-slate-300 px-2 py-1 w-28">Confirmed by</th>
            <th class="border border-slate-300 px-2 py-1 w-40">When</th>
            <th class="border border-slate-300 px-2 py-1 w-24"></th>
          </tr></thead>
          <tbody>
            @for (c of confirmed(); track c.id) {
              <tr [class.opacity-50]="c.status !== 'CONFIRMED'">
                <td class="border border-slate-300 px-2 py-1 font-mono text-xs">{{ c.referenceId }}</td>
                <td class="border border-slate-300 px-2 py-1">{{ c.customerName || '—' }}</td>
                <td class="border border-slate-300 px-2 py-1 text-right font-medium">{{ fmt(c.amount) }}</td>
                <td class="border border-slate-300 px-2 py-1 text-center text-xs">{{ c.mode }}/{{ c.provider }}</td>
                <td class="border border-slate-300 px-2 py-1 text-center text-xs">{{ c.methodUsed || '—' }}</td>
                <td class="border border-slate-300 px-2 py-1 text-center text-xs">{{ c.confirmedBy }}</td>
                <td class="border border-slate-300 px-2 py-1 text-xs">{{ c.confirmedAt | date: 'dd-MM-yy HH:mm' }}</td>
                <td class="border border-slate-300 px-2 py-1 text-center">
                  @if (c.status === 'CONFIRMED') {
                    <button (click)="refund(c)" class="text-xs text-red-700 hover:underline">refund</button>
                  } @else { <span class="text-xs">{{ c.status }}</span> }
                </td>
              </tr>
            } @empty { <tr><td colspan="8" class="border border-slate-300 px-2 py-4 text-center text-slate-400">No confirmed collections yet.</td></tr> }
          </tbody>
        </table>
      }

      <!-- RECONCILIATION -->
      @if (tab() === 'reconcile') {
        <p class="text-xs text-slate-500 mb-2">Signature-valid credits that didn't auto-match an open collection (wrong amount / unknown reference). Match them manually against the invoice, then confirm from the queue.</p>
        <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
          <thead><tr class="bg-slate-100 text-slate-600">
            <th class="border border-slate-300 px-2 py-1 text-left">Event</th>
            <th class="border border-slate-300 px-2 py-1 text-left">Detail</th>
            <th class="border border-slate-300 px-2 py-1 w-40">Received</th>
          </tr></thead>
          <tbody>
            @for (e of unmatched(); track e.id) {
              <tr>
                <td class="border border-slate-300 px-2 py-1 text-xs font-mono">{{ e.providerEventId }}</td>
                <td class="border border-slate-300 px-2 py-1 text-xs">{{ e.payloadJson | json }}</td>
                <td class="border border-slate-300 px-2 py-1 text-xs">{{ e.receivedAt | date: 'dd-MM-yy HH:mm' }}</td>
              </tr>
            } @empty { <tr><td colspan="3" class="border border-slate-300 px-2 py-4 text-center text-slate-400">Nothing unmatched — reconciliation is clean.</td></tr> }
          </tbody>
        </table>
      }

      <!-- SETUP -->
      @if (tab() === 'setup') {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 text-sm">
          <div class="border rounded-lg p-4">
            <h2 class="font-semibold mb-2">Collection methods (Mode A — ₹0 fees, money hits your bank directly)</h2>
            @for (m of methods(); track m.id) {
              <div class="flex items-center gap-2 border-b border-slate-100 py-1.5 text-xs">
                <span class="uppercase font-mono w-10">{{ m.type }}</span>
                <span class="flex-1 truncate">
                  {{ m.label || '' }}
                  @if (m.vpa) { <b>{{ m.vpa }}</b> }
                  @if (m.accountNo) { {{ m.bankName }} · {{ m.accountNo }} · {{ m.ifsc }} }
                </span>
                @if (m.isDefault) { <span class="text-emerald-700">default</span> }
                @else { <button (click)="setDefault(m)" class="text-blue-700 hover:underline">make default</button> }
                <label class="flex items-center gap-1"><input type="checkbox" [checked]="m.isActive" (change)="toggleActive(m)" /> active</label>
              </div>
            } @empty { <p class="text-xs text-slate-400 py-2">No methods yet — add your UPI ID below to start collecting today.</p> }

            <div class="mt-3 border-t pt-3 grid grid-cols-2 gap-2">
              <select [(ngModel)]="nm.type" class="border rounded px-2 py-1.5">
                <option value="upi">UPI ID</option><option value="bank">Bank account</option>
              </select>
              <input [(ngModel)]="nm.label" placeholder="Label (e.g. HDFC current)" class="border rounded px-2 py-1.5" autocomplete="off" />
              @if (nm.type === 'upi') {
                <input [(ngModel)]="nm.vpa" placeholder="business@okhdfcbank" class="border rounded px-2 py-1.5 col-span-2 font-mono" autocomplete="off" />
                <input [(ngModel)]="nm.holderName" placeholder="Display name on QR" class="border rounded px-2 py-1.5 col-span-2" autocomplete="off" />
              } @else {
                <input [(ngModel)]="nm.holderName" placeholder="Account holder" class="border rounded px-2 py-1.5" autocomplete="off" />
                <input [(ngModel)]="nm.bankName" placeholder="Bank" class="border rounded px-2 py-1.5" autocomplete="off" />
                <input [(ngModel)]="nm.accountNo" placeholder="Account no." class="border rounded px-2 py-1.5 font-mono" autocomplete="off" />
                <input [(ngModel)]="nm.ifsc" placeholder="IFSC" class="border rounded px-2 py-1.5 font-mono uppercase" autocomplete="off" />
              }
              <label class="flex items-center gap-1 text-xs"><input type="checkbox" [(ngModel)]="nm.isDefault" /> default</label>
              <button (click)="addMethod()" class="px-3 py-1.5 rounded bg-slate-800 text-white">Add method</button>
            </div>
          </div>

          <div class="border rounded-lg p-4">
            <h2 class="font-semibold mb-2">Mode &amp; gateway</h2>
            <label class="block mb-2">Collection mode
              <select [(ngModel)]="cfgMode" class="mt-1 w-full border rounded px-2 py-1.5">
                <option value="A">A — Manual (your QR/UPI/bank, admin confirms) · ₹0</option>
                <option value="B">B — Auto-reconciled UPI (virtual UPI per invoice) · ₹0 on UPI</option>
                <option value="C">C — Payment gateway (link: UPI/cards/netbanking) · ~2%</option>
              </select>
            </label>
            @if (cfgMode !== 'A') {
              <p class="text-xs text-slate-500 mb-2">Razorpay keys are stored <b>server-side, encrypted</b> — never in the app. Register the webhook URL below in the Razorpay dashboard with the same webhook secret.</p>
              <input [(ngModel)]="cfgKeyId" placeholder="Key ID (rzp_live_…)" class="w-full border rounded px-2 py-1.5 mb-2 font-mono" autocomplete="off" />
              <input [(ngModel)]="cfgKeySecret" type="password" [placeholder]="cfg()?.hasSecret ? 'Key secret (saved — enter to rotate)' : 'Key secret'" class="w-full border rounded px-2 py-1.5 mb-2 font-mono" autocomplete="off" />
              <input [(ngModel)]="cfgWebhookSecret" type="password" [placeholder]="cfg()?.hasWebhook ? 'Webhook secret (saved — enter to rotate)' : 'Webhook secret'" class="w-full border rounded px-2 py-1.5 mb-2 font-mono" autocomplete="off" />
              <p class="text-xs text-slate-500 mb-2">Webhook URL: <code class="bg-slate-100 px-1">{{ webhookUrl() }}</code></p>
            } @else {
              <p class="text-xs text-slate-500 mb-2">Manual mode: zero fees, works today. When you cross ~30 manual confirmations a week, switch to Mode B — auto-reconciled UPI, still 0% fees, no clicking "Received".</p>
            }
            <button (click)="saveConfig()" class="px-3 py-1.5 rounded bg-emerald-600 text-white">Save configuration</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class CollectComponent {
  private readonly entry = inject(EntryService);

  readonly tabs = ['queue', 'feed', 'reconcile', 'setup'] as const;
  readonly tab = signal<(typeof this.tabs)[number]>('queue');
  readonly cfg = signal<any | null>(null);
  readonly methods = signal<any[]>([]);
  readonly pending = signal<any[]>([]);
  readonly confirmed = signal<any[]>([]);
  readonly unmatched = signal<any[]>([]);
  readonly sel = signal<Set<string>>(new Set());
  readonly msg = signal<string | null>(null);
  readonly err = signal<string | null>(null);

  cfgMode = 'A';
  cfgKeyId = '';
  cfgKeySecret = '';
  cfgWebhookSecret = '';
  nm: any = { type: 'upi', isDefault: false };

  constructor() { this.reload(); }

  reload(): void {
    this.entry.payConfig().subscribe((c) => { this.cfg.set(c); this.cfgMode = c?.mode || 'A'; this.cfgKeyId = c?.keyId || ''; });
    this.entry.payMethods().subscribe((m) => this.methods.set(m || []));
    this.entry.payCollections('PENDING,CLAIMED').subscribe((r) => this.pending.set(r || []));
    this.entry.payCollections('CONFIRMED,REFUNDED,PARTIALLY_REFUNDED').subscribe((r) => this.confirmed.set(r || []));
    this.entry.payUnmatched().subscribe((r) => this.unmatched.set(r || []));
    this.sel.set(new Set());
  }

  webhookUrl(): string { return `${location.origin}/api/pay/webhook/<tenant-schema>`; }

  toggleSel(id: string): void {
    const s = new Set(this.sel());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.sel.set(s);
  }
  toggleAll(on: boolean): void {
    this.sel.set(on ? new Set(this.pending().map((c) => c.id)) : new Set());
  }

  confirm(c: any): void {
    if (!window.confirm(`Confirm ₹${this.fmt(c.amount)} received against ${c.referenceId}? Verify your bank/UPI app first.`)) return;
    this.entry.payConfirm(c.id).subscribe({
      next: () => { this.msg.set(`${c.referenceId} confirmed — invoice paid & receipt posted`); this.reload(); },
      error: (e) => this.err.set(e?.error?.message || 'Confirm failed'),
    });
  }

  bulkConfirm(): void {
    const ids = [...this.sel()];
    if (!ids.length || !window.confirm(`Confirm ${ids.length} payments as received?`)) return;
    let done = 0;
    ids.forEach((id) => this.entry.payConfirm(id).subscribe({
      next: () => { if (++done === ids.length) { this.msg.set(`${done} payments confirmed`); this.reload(); } },
      error: () => { if (++done === ids.length) this.reload(); },
    }));
  }

  refund(c: any): void {
    const amt = Number(window.prompt(`Refund amount for ${c.referenceId} (max ${c.amount})`, String(c.amount)));
    if (!amt) return;
    const reason = window.prompt('Reason (optional)') || '';
    this.entry.payRefund(c.id, amt, reason).subscribe({
      next: (r: any) => { this.msg.set(`Refund ${r?.status || 'recorded'} — UPI refunds take 3–5 days`); this.reload(); },
      error: (e) => this.err.set(e?.error?.message || 'Refund failed'),
    });
  }

  addMethod(): void {
    this.entry.payAddMethod(this.nm).subscribe({
      next: () => { this.msg.set('Method added'); this.nm = { type: 'upi', isDefault: false }; this.reload(); },
      error: (e) => this.err.set(e?.error?.error?.message || e?.error?.message || 'Failed to add method'),
    });
  }
  setDefault(m: any): void { this.entry.payUpdateMethod(m.id, { isDefault: true }).subscribe(() => this.reload()); }
  toggleActive(m: any): void { this.entry.payUpdateMethod(m.id, { isActive: !m.isActive }).subscribe(() => this.reload()); }

  saveConfig(): void {
    this.entry.paySetConfig({
      mode: this.cfgMode,
      keyId: this.cfgKeyId,
      keySecret: this.cfgKeySecret || undefined,
      webhookSecret: this.cfgWebhookSecret || undefined,
    }).subscribe({
      next: () => { this.msg.set('Configuration saved (secrets encrypted server-side)'); this.cfgKeySecret = ''; this.cfgWebhookSecret = ''; this.reload(); },
      error: (e) => this.err.set(e?.error?.message || 'Save failed'),
    });
  }

  @HostListener('document:keydown.control.enter', ['$event'])
  onRefresh(e: Event): void { e.preventDefault(); this.reload(); }

  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }
}
