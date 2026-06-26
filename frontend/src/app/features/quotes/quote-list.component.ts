import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { CardModule } from 'primeng/card';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ApiService } from '../../core/services/api.service';

interface Quote {
  id: string;
  quote_number: string;
  title: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  total_amount: string;
  valid_until: string;
  created_at: string;
  sent_at: string;
  accepted_at: string;
}

@Component({
  selector: 'wa-quote-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule,
    ButtonModule, TableModule, TagModule, SelectModule,
    InputTextModule, ToastModule, ConfirmDialogModule, TooltipModule, CardModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <p-toast />
      <p-confirmDialog />

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Quotes</h2>
          <p class="text-sm text-gray-500 mt-1">Create and manage customer quotes</p>
        </div>
        <p-button label="Create Quote" icon="pi pi-plus" (onClick)="openBuilder()" />
      </div>

      <!-- Stats cards -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        @for (stat of statsCards(); track stat.label) {
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs font-semibold text-gray-400 uppercase">{{ stat.label }}</p>
            <p class="text-2xl font-bold mt-1" [style.color]="stat.color">{{ stat.value }}</p>
          </div>
        }
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div class="flex flex-wrap gap-3 items-center">
          <span class="p-input-icon-left">
            <i class="pi pi-search"></i>
            <input
              pInputText
              type="text"
              placeholder="Search quotes..."
              [(ngModel)]="searchTerm"
              (input)="onSearch()"
              class="w-64"
            />
          </span>
          <p-select
            [options]="statusOptions"
            [(ngModel)]="selectedStatus"
            placeholder="All Statuses"
            [showClear]="true"
            (onChange)="loadQuotes()"
            styleClass="w-48"
          />
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table
          [value]="filteredQuotes()"
          [rows]="15"
          [paginator]="true"
          [rowsPerPageOptions]="[10, 15, 25, 50]"
          [loading]="loading()"
          styleClass="p-datatable-sm"
          [globalFilterFields]="['quote_number', 'title', 'customer_name']"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Quote #</th>
              <th>Title</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Valid Until</th>
              <th>Created</th>
              <th class="text-right">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-quote>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="viewQuote(quote)">
              <td class="font-mono text-sm font-semibold text-primary-600">{{ quote.quote_number }}</td>
              <td>{{ quote.title }}</td>
              <td>
                <div class="text-sm font-medium">{{ quote.customer_name || 'N/A' }}</div>
                <div class="text-xs text-gray-400">{{ quote.customer_phone }}</div>
              </td>
              <td class="font-semibold">\u20B9{{ formatAmount(quote.total_amount) }}</td>
              <td><p-tag [value]="quote.status | titlecase" [severity]="getStatusSeverity(quote.status)" /></td>
              <td class="text-sm text-gray-500">{{ quote.valid_until ? (quote.valid_until | date:'mediumDate') : '-' }}</td>
              <td class="text-sm text-gray-500">{{ quote.created_at | date:'mediumDate' }}</td>
              <td class="text-right" (click)="$event.stopPropagation()">
                <div class="flex gap-1 justify-end">
                  @if (quote.status === 'draft') {
                    <button pButton icon="pi pi-send" class="p-button-text p-button-sm p-button-success" pTooltip="Mark as Sent" (click)="updateStatus(quote, 'sent')"></button>
                    <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm" pTooltip="Edit" [routerLink]="['/quotes', quote.id, 'edit']"></button>
                  }
                  @if (quote.status === 'sent') {
                    <button pButton icon="pi pi-check" class="p-button-text p-button-sm p-button-success" pTooltip="Accept" (click)="updateStatus(quote, 'accepted')"></button>
                    <button pButton icon="pi pi-times" class="p-button-text p-button-sm p-button-danger" pTooltip="Reject" (click)="updateStatus(quote, 'rejected')"></button>
                  }
                  @if (quote.status === 'accepted') {
                    <button pButton icon="pi pi-shopping-cart" class="p-button-text p-button-sm p-button-info" pTooltip="Convert to Order" (click)="updateStatus(quote, 'converted')"></button>
                  }
                  <button pButton icon="pi pi-copy" class="p-button-text p-button-sm" pTooltip="Duplicate" (click)="duplicateQuote(quote)"></button>
                  <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" pTooltip="Delete" (click)="confirmDelete(quote)"></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="8" class="text-center py-10 text-gray-400">
                <i class="pi pi-file text-4xl mb-3 block"></i>
                <p class="text-lg font-medium">No quotes yet</p>
                <p class="text-sm">Create your first quote to get started</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class QuoteListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  loading = signal(true);
  quotes = signal<Quote[]>([]);
  stats = signal<any>({});
  searchTerm = '';
  selectedStatus: string | null = null;

  statusOptions = [
    { label: 'Draft', value: 'draft' },
    { label: 'Sent', value: 'sent' },
    { label: 'Accepted', value: 'accepted' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Expired', value: 'expired' },
    { label: 'Converted', value: 'converted' },
  ];

  filteredQuotes = computed(() => {
    let result = this.quotes();
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(q =>
        q.quote_number?.toLowerCase().includes(term) ||
        q.title?.toLowerCase().includes(term) ||
        q.customer_name?.toLowerCase().includes(term),
      );
    }
    return result;
  });

  statsCards = computed(() => {
    const s = this.stats();
    return [
      { label: 'Total', value: s.total || 0, color: '#374151' },
      { label: 'Draft', value: s.draft || 0, color: '#6b7280' },
      { label: 'Sent', value: s.sent || 0, color: '#3b82f6' },
      { label: 'Accepted', value: s.accepted || 0, color: '#22c55e' },
      { label: 'Converted Value', value: '\u20B9' + this.formatAmount(s.converted_value || 0), color: '#8b5cf6' },
    ];
  });

  /** Mint a token-secured Builder session and open the quote builder. */
  openBuilder() {
    this.api.post<{ token: string }>('/builder/sessions', { type: 'quote' }).subscribe({
      next: (r) => this.router.navigate(['/m/builder'], { queryParams: { token: r.token } }),
      error: () => this.messageService.add({ severity: 'error', summary: 'Could not open builder' }),
    });
  }

  ngOnInit() {
    this.loadQuotes();
    this.loadStats();
  }

  loadQuotes() {
    this.loading.set(true);
    const params: any = {};
    if (this.selectedStatus) params.status = this.selectedStatus;

    this.api.get<any>('/quotes', params).subscribe({
      next: (res) => {
        this.quotes.set(res.data || []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadStats() {
    this.api.get<any>('/quotes/stats').subscribe({
      next: (s) => this.stats.set(s),
    });
  }

  onSearch() {
    // filtering is done via computed signal
    this.quotes.update(q => [...q]);
  }

  viewQuote(quote: Quote) {
    this.router.navigate(['/quotes', quote.id]);
  }

  updateStatus(quote: Quote, status: string) {
    this.api.patch<any>(`/quotes/${quote.id}/status`, { status }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: `Quote marked as ${status}` });
        this.loadQuotes();
        this.loadStats();
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update quote' }),
    });
  }

  duplicateQuote(quote: Quote) {
    this.api.post<any>(`/quotes/${quote.id}/duplicate`, {}).subscribe({
      next: (newQuote) => {
        this.messageService.add({ severity: 'success', summary: 'Duplicated', detail: 'Quote duplicated successfully' });
        this.loadQuotes();
        this.loadStats();
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to duplicate quote' }),
    });
  }

  confirmDelete(quote: Quote) {
    this.confirmationService.confirm({
      message: `Delete quote ${quote.quote_number}?`,
      header: 'Confirm Delete',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.delete(`/quotes/${quote.id}`).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Quote deleted' });
            this.loadQuotes();
            this.loadStats();
          },
        });
      },
    });
  }

  formatAmount(amount: any): string {
    return parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  getStatusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    const map: Record<string, any> = {
      draft: 'secondary',
      sent: 'info',
      accepted: 'success',
      rejected: 'danger',
      expired: 'warn',
      converted: 'contrast',
    };
    return map[status] || 'secondary';
  }
}
