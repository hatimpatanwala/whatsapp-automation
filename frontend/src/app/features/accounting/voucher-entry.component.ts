import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountingService, Ledger, VoucherEntry } from '../../core/services/accounting.service';
import { PermissionService } from '../../core/services/permission.service';

@Component({
  selector: 'wa-voucher-entry',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="p-4 md:p-6 max-w-4xl">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold capitalize">{{ type }} Voucher</h1>
        <a routerLink="/accounting/vouchers" class="text-sm text-slate-500 hover:underline">← Back</a>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <label class="text-sm">Date
          <input type="date" [(ngModel)]="date" class="mt-1 w-full border rounded px-2 py-1.5" />
        </label>
        <label class="text-sm">Reference
          <input [(ngModel)]="reference" class="mt-1 w-full border rounded px-2 py-1.5" placeholder="optional" />
        </label>
        <label class="text-sm">Type
          <select [(ngModel)]="type" class="mt-1 w-full border rounded px-2 py-1.5">
            @for (t of voucherTypes; track t) { <option [value]="t">{{ t }}</option> }
          </select>
        </label>
      </div>

      <div class="border rounded-lg overflow-hidden mb-3">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600">
            <tr>
              <th class="text-left p-2">Ledger</th>
              <th class="text-right p-2 w-40">Debit</th>
              <th class="text-right p-2 w-40">Credit</th>
              <th class="w-10"></th>
            </tr>
          </thead>
          <tbody>
            @for (row of entries; track $index) {
              <tr class="border-t">
                <td class="p-2">
                  <select [(ngModel)]="row.ledgerId" class="w-full border rounded px-2 py-1.5">
                    <option value="">— select ledger —</option>
                    @for (l of ledgers(); track l.id) { <option [value]="l.id">{{ l.name }}</option> }
                  </select>
                </td>
                <td class="p-2"><input type="number" [(ngModel)]="row.debit" class="w-full border rounded px-2 py-1.5 text-right" /></td>
                <td class="p-2"><input type="number" [(ngModel)]="row.credit" class="w-full border rounded px-2 py-1.5 text-right" /></td>
                <td class="p-2 text-center">
                  <button (click)="removeRow($index)" class="text-slate-400 hover:text-red-500">✕</button>
                </td>
              </tr>
            }
          </tbody>
          <tfoot class="bg-slate-50 font-medium">
            <tr class="border-t">
              <td class="p-2 text-right">Totals</td>
              <td class="p-2 text-right">{{ fmt(totalDebit()) }}</td>
              <td class="p-2 text-right">{{ fmt(totalCredit()) }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="flex items-center gap-3 mb-4">
        <button (click)="addRow()" class="text-sm text-slate-600 hover:underline">+ Add row</button>
        <span class="text-sm" [class.text-green-600]="balanced()" [class.text-amber-600]="!balanced()">
          {{ balanced() ? 'Balanced' : 'Debit and credit must be equal and > 0' }}
        </span>
      </div>

      <label class="text-sm block mb-4">Narration
        <textarea [(ngModel)]="narration" rows="2" class="mt-1 w-full border rounded px-2 py-1.5"></textarea>
      </label>

      @if (error()) { <p class="text-red-600 text-sm mb-3">{{ error() }}</p> }

      @if (perms.canWrite('accounting')) {
        <button (click)="save()" [disabled]="!balanced() || saving()"
                class="px-4 py-2 rounded-md bg-emerald-600 text-white disabled:opacity-50">
          {{ saving() ? 'Saving…' : 'Save Voucher (Ctrl+A)' }}
        </button>
      }
    </div>
  `,
})
export class VoucherEntryComponent {
  private readonly acc = inject(AccountingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly perms = inject(PermissionService);

  readonly ledgers = signal<Ledger[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly voucherTypes = ['sales', 'purchase', 'payment', 'receipt', 'contra', 'journal', 'debit_note', 'credit_note'];
  type = 'journal';
  date = new Date().toISOString().slice(0, 10);
  narration = '';
  reference = '';
  entries: VoucherEntry[] = [
    { ledgerId: '', debit: undefined, credit: undefined },
    { ledgerId: '', debit: undefined, credit: undefined },
  ];

  constructor() {
    this.type = this.route.snapshot.queryParamMap.get('type') || 'journal';
    this.acc.ledgers().subscribe((l) => this.ledgers.set(l || []));
  }

  addRow(): void { this.entries.push({ ledgerId: '', debit: undefined, credit: undefined }); }
  removeRow(i: number): void { if (this.entries.length > 2) this.entries.splice(i, 1); }

  totalDebit(): number { return this.entries.reduce((s, e) => s + (Number(e.debit) || 0), 0); }
  totalCredit(): number { return this.entries.reduce((s, e) => s + (Number(e.credit) || 0), 0); }
  balanced(): boolean { return this.totalDebit() > 0 && Math.abs(this.totalDebit() - this.totalCredit()) < 0.005; }
  fmt(n: number): string { return n.toFixed(2); }

  save(): void {
    if (!this.perms.canWrite('accounting')) return;
    if (!this.balanced()) { this.error.set('Debit and credit must be equal and greater than zero'); return; }
    this.saving.set(true);
    this.error.set(null);
    const entries = this.entries
      .filter((e) => e.ledgerId && ((Number(e.debit) || 0) > 0 || (Number(e.credit) || 0) > 0))
      .map((e) => ({ ledgerId: e.ledgerId, debit: Number(e.debit) || 0, credit: Number(e.credit) || 0 }));
    this.acc
      .createVoucher({ type: this.type, date: this.date, narration: this.narration, reference: this.reference, entries })
      .subscribe({
        next: () => this.router.navigate(['/accounting/vouchers']),
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || 'Failed to save voucher');
        },
      });
  }
}
