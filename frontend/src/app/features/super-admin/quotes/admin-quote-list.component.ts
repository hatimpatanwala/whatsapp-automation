import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'wa-admin-quote-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule,
    ButtonModule, TableModule, TagModule, SelectModule, CardModule, ToastModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6">
      <p-toast />

      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" [routerLink]="['/admin/tenants', tenantId, 'view']"></button>
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Tenant Quotes</h2>
            <p class="text-sm text-gray-500">View quotes for this tenant</p>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        @for (stat of statsCards(); track stat.label) {
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs font-semibold text-gray-400 uppercase">{{ stat.label }}</p>
            <p class="text-2xl font-bold mt-1" [style.color]="stat.color">{{ stat.value }}</p>
          </div>
        }
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="quotes()" [rows]="15" [paginator]="true" [loading]="loading()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th>Quote #</th>
              <th>Title</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-q>
            <tr>
              <td class="font-mono text-sm font-semibold">{{ q.quote_number }}</td>
              <td>{{ q.title }}</td>
              <td>{{ q.customer_name || 'N/A' }}</td>
              <td class="font-semibold">\u20B9{{ formatAmount(q.total_amount) }}</td>
              <td><p-tag [value]="q.status | titlecase" [severity]="getStatusSeverity(q.status)" /></td>
              <td class="text-sm text-gray-500">{{ q.created_at | date:'mediumDate' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="6" class="text-center py-8 text-gray-400">No quotes found for this tenant</td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class AdminQuoteListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  tenantId = '';
  loading = signal(true);
  quotes = signal<any[]>([]);
  stats = signal<any>({});

  statsCards = computed(() => {
    const s = this.stats();
    return [
      { label: 'Total', value: s.total || 0, color: '#374151' },
      { label: 'Accepted', value: s.accepted || 0, color: '#22c55e' },
      { label: 'Accepted Value', value: '\u20B9' + this.formatAmount(s.accepted_value || 0), color: '#22c55e' },
      { label: 'Converted Value', value: '\u20B9' + this.formatAmount(s.converted_value || 0), color: '#8b5cf6' },
    ];
  });

  ngOnInit() {
    this.tenantId = this.route.snapshot.params['id'];
    this.loadQuotes();
    this.loadStats();
  }

  loadQuotes() {
    this.loading.set(true);
    this.api.get<any>(`/admin/tenants/${this.tenantId}/quotes`).subscribe({
      next: (res) => { this.quotes.set(res.data || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadStats() {
    this.api.get<any>(`/admin/tenants/${this.tenantId}/quotes/stats`).subscribe({
      next: (s) => this.stats.set(s),
    });
  }

  formatAmount(amount: any): string {
    return parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      draft: 'secondary', sent: 'info', accepted: 'success',
      rejected: 'danger', expired: 'warn', converted: 'contrast',
    };
    return map[status] || 'secondary';
  }
}
