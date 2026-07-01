import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

/**
 * Ledgers / Accounts Receivable — one row per customer with billed / paid /
 * outstanding, from AR invoices. Clicking a row opens that customer's full
 * profile (where the detailed statement-of-account Ledger tab lives). ERP feature.
 */
@Component({
  selector: 'wa-ledgers',
  standalone: true,
  imports: [CommonModule, TableModule, InputTextModule, FormsModule],
  template: `
    <div class="p-6 max-w-6xl mx-auto">
      <div class="mb-5">
        <h1 class="text-2xl font-bold text-gray-900">Ledgers</h1>
        <p class="text-sm text-gray-500 mt-1">Accounts receivable — what each customer owes you. Click a customer to open their full statement.</p>
      </div>

      <div class="grid grid-cols-3 gap-4 mb-5">
        <div class="bg-white rounded-2xl border border-gray-100 p-4">
          <p class="text-[11px] font-semibold text-gray-400 uppercase">Total billed</p>
          <p class="text-xl font-bold text-gray-900 mt-1 tabular-nums">{{ cur }}{{ totals().billed | number:'1.0-2' }}</p>
        </div>
        <div class="bg-white rounded-2xl border border-gray-100 p-4">
          <p class="text-[11px] font-semibold text-gray-400 uppercase">Collected</p>
          <p class="text-xl font-bold text-green-600 mt-1 tabular-nums">{{ cur }}{{ totals().paid | number:'1.0-2' }}</p>
        </div>
        <div class="bg-white rounded-2xl border border-gray-100 p-4">
          <p class="text-[11px] font-semibold text-gray-400 uppercase">Outstanding</p>
          <p class="text-xl font-bold text-red-600 mt-1 tabular-nums">{{ cur }}{{ totals().outstanding | number:'1.0-2' }}</p>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <input pInputText type="text" placeholder="Search customer…" [(ngModel)]="search" class="w-full max-w-sm" />
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="filtered()" [paginator]="filtered().length > 20" [rows]="20" [loading]="loading()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th class="text-right">Billed</th>
              <th class="text-right">Paid</th>
              <th class="text-right">Outstanding</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="open(r)">
              <td class="font-semibold text-gray-800">{{ r.name || '—' }}</td>
              <td class="text-gray-500 text-sm">{{ r.phone }}</td>
              <td class="text-right tabular-nums">{{ cur }}{{ r.billed | number:'1.0-2' }}</td>
              <td class="text-right tabular-nums text-green-600">{{ cur }}{{ r.paid | number:'1.0-2' }}</td>
              <td class="text-right tabular-nums font-semibold" [class.text-red-600]="r.outstanding > 0">{{ cur }}{{ r.outstanding | number:'1.0-2' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="5" class="text-center py-10 text-gray-400">
              <i class="pi pi-book text-4xl mb-3 block"></i>
              <p class="text-lg font-medium">No ledgers yet</p>
              <p class="text-sm">Raise an invoice for a customer and it will appear here.</p>
            </td></tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class LedgersComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly cur = '₹';

  rows = signal<any[]>([]);
  loading = signal(true);
  search = '';

  filtered = computed(() => {
    const t = this.search.toLowerCase().trim();
    if (!t) return this.rows();
    return this.rows().filter((r) => `${r.name ?? ''} ${r.phone ?? ''}`.toLowerCase().includes(t));
  });
  totals = computed(() =>
    this.rows().reduce(
      (a, r) => ({ billed: a.billed + Number(r.billed || 0), paid: a.paid + Number(r.paid || 0), outstanding: a.outstanding + Number(r.outstanding || 0) }),
      { billed: 0, paid: 0, outstanding: 0 },
    ),
  );

  ngOnInit() {
    this.api.get<any>('/customers/ledgers').subscribe({
      next: (r) => { this.rows.set(Array.isArray(r) ? r : (r?.data ?? r?.items ?? [])); this.loading.set(false); },
      error: () => { this.rows.set([]); this.loading.set(false); },
    });
  }

  open(r: any) { this.router.navigate(['/customers', r.customerId ?? r.customer_id]); }
}
