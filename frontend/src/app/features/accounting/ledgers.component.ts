import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountingService, Ledger, LedgerGroup } from '../../core/services/accounting.service';
import { PermissionService } from '../../core/services/permission.service';

@Component({
  selector: 'wa-ledgers',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-4 md:p-6">
      <h1 class="text-xl font-semibold mb-4">Ledgers (Chart of Accounts)</h1>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 border rounded-lg overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-600">
              <tr><th class="text-left p-2">Ledger</th><th class="text-left p-2">Group</th><th class="text-left p-2">Nature</th></tr>
            </thead>
            <tbody>
              @for (l of ledgers(); track l.id) {
                <tr class="border-t">
                  <td class="p-2 font-medium">{{ l.name }}</td>
                  <td class="p-2">{{ l.groupName }}</td>
                  <td class="p-2 capitalize text-slate-500">{{ l.nature }}</td>
                </tr>
              } @empty {
                <tr><td colspan="3" class="p-3 text-slate-500">No ledgers.</td></tr>
              }
            </tbody>
          </table>
        </div>

        @if (perms.canWrite('accounting')) {
        <div class="border rounded-lg p-4 h-fit">
          <h2 class="font-semibold mb-3">New Ledger</h2>
          <label class="text-sm block mb-2">Name
            <input [(ngModel)]="name" class="mt-1 w-full border rounded px-2 py-1.5" />
          </label>
          <label class="text-sm block mb-2">Group
            <select [(ngModel)]="groupId" class="mt-1 w-full border rounded px-2 py-1.5">
              <option value="">— select —</option>
              @for (g of groups(); track g.id) { <option [value]="g.id">{{ g.name }} ({{ g.nature }})</option> }
            </select>
          </label>
          <div class="grid grid-cols-2 gap-2 mb-3">
            <label class="text-sm">Opening
              <input type="number" [(ngModel)]="openingBalance" class="mt-1 w-full border rounded px-2 py-1.5" />
            </label>
            <label class="text-sm">Dr/Cr
              <select [(ngModel)]="openingType" class="mt-1 w-full border rounded px-2 py-1.5">
                <option value="dr">Dr</option><option value="cr">Cr</option>
              </select>
            </label>
          </div>
          @if (error()) { <p class="text-red-600 text-sm mb-2">{{ error() }}</p> }
          <button (click)="create()" [disabled]="!name || !groupId || saving()"
                  class="w-full px-3 py-2 rounded-md bg-emerald-600 text-white disabled:opacity-50">
            {{ saving() ? 'Saving…' : 'Create Ledger' }}
          </button>
        </div>
        }
      </div>
    </div>
  `,
})
export class LedgersComponent {
  private readonly acc = inject(AccountingService);
  readonly perms = inject(PermissionService);
  readonly ledgers = signal<Ledger[]>([]);
  readonly groups = signal<LedgerGroup[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  name = '';
  groupId = '';
  openingBalance: number | undefined;
  openingType: 'dr' | 'cr' = 'dr';

  constructor() {
    this.reload();
    this.acc.groups().subscribe((g) => this.groups.set(g || []));
  }

  reload(): void {
    this.acc.ledgers().subscribe((l) => this.ledgers.set(l || []));
  }

  create(): void {
    if (!this.perms.canWrite('accounting')) return;
    this.saving.set(true);
    this.error.set(null);
    this.acc
      .createLedger({ name: this.name, groupId: this.groupId, openingBalance: this.openingBalance ?? 0, openingType: this.openingType })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.name = '';
          this.groupId = '';
          this.openingBalance = undefined;
          this.reload();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || 'Failed to create ledger');
        },
      });
  }
}
