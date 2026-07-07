import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntryService } from '../../core/services/entry.service';

/**
 * SFA admin — register salesmen by WhatsApp number and hand each a tokenized
 * /m/sales webview link (share straight to their WhatsApp via wa.me). Also the
 * back-office view of promise-to-pay follow-ups recorded from the field.
 */
@Component({
  selector: 'wa-salesmen',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="p-3 md:p-5 select-none">
      <div class="flex items-center gap-4 mb-3 border-b pb-2 flex-wrap">
        <h1 class="text-lg font-semibold">Salesmen (Field App)</h1>
        <div class="flex rounded overflow-hidden border text-sm">
          @for (t of tabs; track t) {
            <button (click)="tab.set(t)" class="px-3 py-1 capitalize"
                    [class.bg-slate-800]="tab() === t" [class.text-white]="tab() === t">{{ t }}</button>
          }
        </div>
        @if (msg()) { <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">✓ {{ msg() }}</span> }
        @if (err()) { <span class="text-sm text-red-600">{{ err() }}</span> }
      </div>

      @if (tab() === 'salesmen') {
        <!-- Add form -->
        <div class="flex flex-wrap items-end gap-2 mb-4 bg-slate-50 border border-slate-200 rounded p-3">
          <label class="text-xs text-slate-500">Name<br/>
            <input #nameEl [(ngModel)]="fName" class="border rounded px-2 py-1 text-sm w-44" placeholder="Ramesh Kumar" /></label>
          <label class="text-xs text-slate-500">WhatsApp number<br/>
            <input [(ngModel)]="fPhone" class="border rounded px-2 py-1 text-sm w-40" placeholder="9198xxxxxx" /></label>
          <label class="text-xs text-slate-500">Route<br/>
            <input [(ngModel)]="fRoute" class="border rounded px-2 py-1 text-sm w-32" placeholder="optional" /></label>
          <label class="text-xs text-slate-500">Area<br/>
            <input [(ngModel)]="fArea" class="border rounded px-2 py-1 text-sm w-32" placeholder="optional" /></label>
          <button (click)="add()" [disabled]="busy()" class="px-3 py-1.5 rounded bg-slate-800 text-white text-sm disabled:opacity-50">+ Add salesman</button>
        </div>

        <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
          <thead><tr class="bg-slate-100 text-slate-600">
            <th class="border border-slate-300 px-2 py-1 text-left">Name</th>
            <th class="border border-slate-300 px-2 py-1 text-left w-32">WhatsApp</th>
            <th class="border border-slate-300 px-2 py-1 text-left w-28">Route / Area</th>
            <th class="border border-slate-300 px-2 py-1 w-20">Status</th>
            <th class="border border-slate-300 px-2 py-1 text-left">Field-app link</th>
            <th class="border border-slate-300 px-2 py-1 w-56"></th>
          </tr></thead>
          <tbody>
            @for (s of salesmen(); track s.id) {
              <tr [class.opacity-50]="!s.isActive">
                <td class="border border-slate-300 px-2 py-1 font-medium">{{ s.name }}</td>
                <td class="border border-slate-300 px-2 py-1 font-mono text-xs">{{ s.phone }}</td>
                <td class="border border-slate-300 px-2 py-1 text-xs">{{ s.route || '—' }} {{ s.area ? '/ ' + s.area : '' }}</td>
                <td class="border border-slate-300 px-2 py-1 text-center text-xs">
                  <span [class.text-emerald-700]="s.isActive" [class.text-red-600]="!s.isActive">{{ s.isActive ? 'Active' : 'Off' }}</span>
                </td>
                <td class="border border-slate-300 px-2 py-1">
                  <code class="text-[11px] text-slate-500 break-all">{{ link(s) }}</code>
                </td>
                <td class="border border-slate-300 px-2 py-1 text-center whitespace-nowrap">
                  <button (click)="copy(s)" class="text-xs px-2 py-1 rounded border mr-1">Copy link</button>
                  <a [href]="waShare(s)" target="_blank" class="text-xs px-2 py-1 rounded bg-emerald-600 text-white mr-1 inline-block">Send on WhatsApp</a>
                  <button (click)="rotate(s)" class="text-xs px-2 py-1 rounded border mr-1" title="Old link stops working">↻ New link</button>
                  <button (click)="toggle(s)" class="text-xs px-2 py-1 rounded border" [class.text-red-600]="s.isActive">
                    {{ s.isActive ? 'Deactivate' : 'Activate' }}
                  </button>
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="border border-slate-300 px-2 py-4 text-center text-slate-400">No salesmen yet — add one above and share the link on WhatsApp.</td></tr> }
          </tbody>
        </table>
        <p class="text-xs text-slate-400 mt-2">The link opens the salesman field app inside WhatsApp: take orders on a customer's behalf, see pending bills, collect payment (cash / cheque / UPI / online with instrument details) and record promise-to-pay dates.</p>
      }

      @if (tab() === 'follow-ups') {
        <div class="flex gap-1 mb-2">
          @for (s of ['due','open','all']; track s) {
            <button (click)="scope.set(s); loadPromises()" class="px-3 py-1 text-xs rounded-full border capitalize"
              [class.bg-slate-800]="scope() === s" [class.text-white]="scope() === s">{{ s }}</button>
          }
        </div>
        <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
          <thead><tr class="bg-slate-100 text-slate-600">
            <th class="border border-slate-300 px-2 py-1 text-left">Party</th>
            <th class="border border-slate-300 px-2 py-1 text-left w-28">Invoice</th>
            <th class="border border-slate-300 px-2 py-1 w-24 text-right">Amount</th>
            <th class="border border-slate-300 px-2 py-1 w-24">Promised</th>
            <th class="border border-slate-300 px-2 py-1 w-20">Status</th>
            <th class="border border-slate-300 px-2 py-1 text-left">Note</th>
          </tr></thead>
          <tbody>
            @for (p of promises(); track p.id) {
              <tr [class.bg-amber-50]="p.status === 'open' && isDue(p)">
                <td class="border border-slate-300 px-2 py-1">{{ p.customerName }} <span class="text-xs text-slate-400">{{ p.customerPhone }}</span></td>
                <td class="border border-slate-300 px-2 py-1 font-mono text-xs">{{ p.invoiceNumber || 'On a/c' }}</td>
                <td class="border border-slate-300 px-2 py-1 text-right font-medium">{{ fmt(p.amount) }}</td>
                <td class="border border-slate-300 px-2 py-1 text-center text-xs">{{ p.promiseDate | date: 'dd-MM-yy' }}</td>
                <td class="border border-slate-300 px-2 py-1 text-center text-xs capitalize"
                    [class.text-amber-700]="p.status === 'open'" [class.text-emerald-700]="p.status === 'kept'"
                    [class.text-red-600]="p.status === 'broken'">{{ p.status }}</td>
                <td class="border border-slate-300 px-2 py-1 text-xs text-slate-500">{{ p.note || '' }}</td>
              </tr>
            } @empty { <tr><td colspan="6" class="border border-slate-300 px-2 py-4 text-center text-slate-400">No promises recorded.</td></tr> }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class SalesmenComponent implements OnInit {
  private readonly entry = inject(EntryService);

  readonly tabs = ['salesmen', 'follow-ups'];
  readonly tab = signal('salesmen');
  readonly salesmen = signal<any[]>([]);
  readonly promises = signal<any[]>([]);
  readonly scope = signal('all');
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly err = signal('');
  fName = ''; fPhone = ''; fRoute = ''; fArea = '';

  ngOnInit() { this.load(); this.loadPromises(); }

  load() { this.entry.sfaSalesmen().subscribe((r) => this.salesmen.set(r || [])); }
  loadPromises() { this.entry.sfaPromises(this.scope() as any).subscribe((r) => this.promises.set(r || [])); }

  link(s: any) { return `${location.origin}${s.webviewPath}`; }
  waShare(s: any) {
    const text = `Hi ${s.name}, your sales field app link: ${this.link(s)}`;
    const phone = String(s.phone || '').replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  add() {
    if (!this.fName.trim() || !this.fPhone.trim()) { this.flashErr('Name and WhatsApp number are required'); return; }
    this.busy.set(true);
    this.entry.sfaAddSalesman({ name: this.fName.trim(), phone: this.fPhone.trim(), route: this.fRoute.trim() || undefined, area: this.fArea.trim() || undefined })
      .subscribe({
        next: () => { this.busy.set(false); this.fName = this.fPhone = this.fRoute = this.fArea = ''; this.flash('Salesman added'); this.load(); },
        error: (e) => { this.busy.set(false); this.flashErr(e?.error?.message || 'Could not add'); },
      });
  }
  rotate(s: any) {
    this.entry.sfaUpdateSalesman(s.id, { rotateToken: true }).subscribe({
      next: () => { this.flash('New link generated — the old one no longer works'); this.load(); },
      error: () => this.flashErr('Could not rotate'),
    });
  }
  toggle(s: any) {
    this.entry.sfaUpdateSalesman(s.id, { isActive: !s.isActive }).subscribe({
      next: () => { this.flash(s.isActive ? 'Deactivated' : 'Activated'); this.load(); },
      error: () => this.flashErr('Could not update'),
    });
  }
  copy(s: any) {
    navigator.clipboard?.writeText(this.link(s)).then(() => this.flash('Link copied'));
  }

  isDue(p: any) { return p.promiseDate && new Date(p.promiseDate) <= new Date(); }
  fmt(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
  private flash(m: string) { this.msg.set(m); this.err.set(''); setTimeout(() => this.msg.set(''), 3000); }
  private flashErr(m: string) { this.err.set(m); this.msg.set(''); setTimeout(() => this.err.set(''), 4000); }
}
