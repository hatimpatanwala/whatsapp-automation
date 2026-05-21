import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'wa-quote-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    ButtonModule, TagModule, DividerModule, ToastModule, ConfirmDialogModule,
    TooltipModule, CardModule, TableModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-4 max-w-5xl mx-auto">
      <p-toast />
      <p-confirmDialog />

      @if (loading()) {
        <div class="flex items-center justify-center py-20">
          <i class="pi pi-spin pi-spinner text-4xl text-gray-400"></i>
        </div>
      } @else if (quote()) {
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/quotes"></button>
            <div>
              <div class="flex items-center gap-3">
                <h2 class="text-2xl font-bold text-gray-900">{{ quote()!.quote_number }}</h2>
                <p-tag [value]="quote()!.status | titlecase" [severity]="getStatusSeverity(quote()!.status)" />
              </div>
              <p class="text-sm text-gray-500 mt-0.5">{{ quote()!.title }}</p>
            </div>
          </div>
          <div class="flex gap-2">
            @if (quote()!.status === 'draft') {
              <p-button label="Send" icon="pi pi-send" severity="success" (onClick)="updateStatus('sent')" />
              <p-button label="Edit" icon="pi pi-pencil" [outlined]="true" [routerLink]="['/quotes', quoteId, 'edit']" />
            }
            @if (quote()!.status === 'sent') {
              <p-button label="Accept" icon="pi pi-check" severity="success" (onClick)="updateStatus('accepted')" />
              <p-button label="Reject" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="updateStatus('rejected')" />
            }
            @if (quote()!.status === 'accepted') {
              <p-button label="Convert to Order" icon="pi pi-shopping-cart" severity="info" (onClick)="updateStatus('converted')" />
            }
            <p-button label="Duplicate" icon="pi pi-copy" severity="secondary" [outlined]="true" (onClick)="duplicate()" />
            <p-button icon="pi pi-trash" severity="danger" [outlined]="true" (onClick)="confirmDelete()" />
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main content -->
          <div class="lg:col-span-2 space-y-6">

            <!-- Line Items -->
            <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div class="p-4 border-b border-gray-100">
                <h3 class="text-lg font-semibold">Line Items</h3>
              </div>
              <p-table [value]="quote()!.items || []" styleClass="p-datatable-sm">
                <ng-template pTemplate="header">
                  <tr>
                    <th>#</th>
                    <th>Description</th>
                    <th>Product</th>
                    <th class="text-right">Qty</th>
                    <th class="text-right">Unit Price</th>
                    <th class="text-right">Total</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-item let-i="rowIndex">
                  <tr>
                    <td class="text-gray-400">{{ i + 1 }}</td>
                    <td class="font-medium">{{ item.description }}</td>
                    <td class="text-sm text-gray-500">{{ item.product_name || '-' }}</td>
                    <td class="text-right">{{ item.quantity }}</td>
                    <td class="text-right">\u20B9{{ formatAmount(item.unit_price) }}</td>
                    <td class="text-right font-semibold">\u20B9{{ formatAmount(item.line_total) }}</td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="footer">
                  <tr>
                    <td colspan="5" class="text-right font-medium text-gray-500">Subtotal</td>
                    <td class="text-right font-semibold">\u20B9{{ formatAmount(quote()!.subtotal) }}</td>
                  </tr>
                  @if (parseFloat(quote()!.tax_amount) > 0) {
                    <tr>
                      <td colspan="5" class="text-right font-medium text-gray-500">Tax</td>
                      <td class="text-right">\u20B9{{ formatAmount(quote()!.tax_amount) }}</td>
                    </tr>
                  }
                  <tr>
                    <td colspan="5" class="text-right font-bold text-lg">Total</td>
                    <td class="text-right font-bold text-lg text-primary-600">\u20B9{{ formatAmount(quote()!.total_amount) }}</td>
                  </tr>
                </ng-template>
              </p-table>
            </div>

            <!-- Notes -->
            @if (quote()!.notes) {
              <div class="bg-white rounded-xl border border-gray-200 p-6">
                <h3 class="text-lg font-semibold mb-2">Notes</h3>
                <p class="text-sm text-gray-600 whitespace-pre-wrap">{{ quote()!.notes }}</p>
              </div>
            }
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Customer -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <h3 class="text-sm font-semibold text-gray-400 uppercase mb-3">Customer</h3>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
                  {{ getInitials(quote()!.customer_name) }}
                </div>
                <div>
                  <p class="font-medium text-gray-900">{{ quote()!.customer_name || 'N/A' }}</p>
                  <p class="text-sm text-gray-500">{{ quote()!.customer_phone }}</p>
                </div>
              </div>
            </div>

            <!-- Timeline -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <h3 class="text-sm font-semibold text-gray-400 uppercase mb-3">Timeline</h3>
              <div class="space-y-3">
                <div class="flex items-center gap-3 text-sm">
                  <i class="pi pi-plus-circle text-gray-400"></i>
                  <div>
                    <p class="font-medium">Created</p>
                    <p class="text-gray-400">{{ quote()!.created_at | date:'medium' }}</p>
                  </div>
                </div>
                @if (quote()!.sent_at) {
                  <div class="flex items-center gap-3 text-sm">
                    <i class="pi pi-send text-blue-500"></i>
                    <div>
                      <p class="font-medium">Sent</p>
                      <p class="text-gray-400">{{ quote()!.sent_at | date:'medium' }}</p>
                    </div>
                  </div>
                }
                @if (quote()!.accepted_at) {
                  <div class="flex items-center gap-3 text-sm">
                    <i class="pi pi-check-circle text-green-500"></i>
                    <div>
                      <p class="font-medium">Accepted</p>
                      <p class="text-gray-400">{{ quote()!.accepted_at | date:'medium' }}</p>
                    </div>
                  </div>
                }
                @if (quote()!.converted_at) {
                  <div class="flex items-center gap-3 text-sm">
                    <i class="pi pi-shopping-cart text-purple-500"></i>
                    <div>
                      <p class="font-medium">Converted to Order</p>
                      <p class="text-gray-400">{{ quote()!.converted_at | date:'medium' }}</p>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Valid until -->
            @if (quote()!.valid_until) {
              <div class="bg-white rounded-xl border border-gray-200 p-6">
                <h3 class="text-sm font-semibold text-gray-400 uppercase mb-2">Valid Until</h3>
                <p class="text-lg font-semibold" [class.text-red-500]="isExpired()">
                  {{ quote()!.valid_until | date:'mediumDate' }}
                </p>
                @if (isExpired()) {
                  <p class="text-sm text-red-500 mt-1">This quote has expired</p>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class QuoteDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  quoteId = '';
  loading = signal(true);
  quote = signal<any>(null);

  isExpired = computed(() => {
    const q = this.quote();
    if (!q?.valid_until) return false;
    return new Date(q.valid_until) < new Date();
  });

  parseFloat = parseFloat;

  ngOnInit() {
    this.quoteId = this.route.snapshot.params['id'];
    this.loadQuote();
  }

  loadQuote() {
    this.loading.set(true);
    this.api.get<any>(`/quotes/${this.quoteId}`).subscribe({
      next: (q) => {
        this.quote.set(q);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.router.navigate(['/quotes']);
      },
    });
  }

  updateStatus(status: string) {
    this.api.patch<any>(`/quotes/${this.quoteId}/status`, { status }).subscribe({
      next: (q) => {
        this.quote.set(q);
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: `Quote marked as ${status}` });
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update' }),
    });
  }

  duplicate() {
    this.api.post<any>(`/quotes/${this.quoteId}/duplicate`, {}).subscribe({
      next: (newQuote) => {
        this.messageService.add({ severity: 'success', summary: 'Duplicated', detail: 'Quote duplicated' });
        this.router.navigate(['/quotes', newQuote.id]);
      },
    });
  }

  confirmDelete() {
    this.confirmationService.confirm({
      message: 'Are you sure you want to delete this quote?',
      header: 'Delete Quote',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.delete(`/quotes/${this.quoteId}`).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Quote deleted' });
            this.router.navigate(['/quotes']);
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
      draft: 'secondary', sent: 'info', accepted: 'success',
      rejected: 'danger', expired: 'warn', converted: 'contrast',
    };
    return map[status] || 'secondary';
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name[0].toUpperCase();
  }
}
