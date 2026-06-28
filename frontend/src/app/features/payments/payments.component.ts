import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { ImageModule } from 'primeng/image';
import { PaymentService } from '../../core/services/payment.service';

interface PaymentRow {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  amount: number;
  method: string;
  reference: string;
  proofImageUrl: string;
  status: 'pending' | 'verified' | 'rejected';
  submittedAt: string;
}

@Component({
  selector: 'wa-payments',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    TagModule,
    DialogModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    SelectModule,
    ToastModule,
    TextareaModule,
    ConfirmDialogModule,
    FormsModule,
    ImageModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />
      <p-confirmDialog />

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Payments</h1>
          <p class="text-gray-500 text-sm">Verify and manage payment proofs</p>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-amber-50 text-amber-600"><i class="pi pi-clock" style="font-size:1.1rem"></i></div>
          <div class="min-w-0"><p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ pendingCount() }}</p><p class="text-xs text-gray-500 mt-1 truncate">Pending Verification</p></div>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-green-50 text-green-600"><i class="pi pi-check-circle" style="font-size:1.1rem"></i></div>
          <div class="min-w-0"><p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ verifiedCount() }}</p><p class="text-xs text-gray-500 mt-1 truncate">Verified Today</p></div>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-red-50 text-red-600"><i class="pi pi-times-circle" style="font-size:1.1rem"></i></div>
          <div class="min-w-0"><p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ rejectedCount() }}</p><p class="text-xs text-gray-500 mt-1 truncate">Rejected</p></div>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-3">
        <p-iconfield class="flex-1 min-w-48">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText [(ngModel)]="searchQuery" placeholder="Search by order or customer..." class="w-full" (input)="filter()" />
        </p-iconfield>
        <p-select [(ngModel)]="statusFilter" [options]="statusOptions" optionLabel="label" optionValue="value"
          placeholder="All statuses" styleClass="min-w-40" (onChange)="filter()" />
        <p-select [(ngModel)]="methodFilter" [options]="methodOptions" optionLabel="label" optionValue="value"
          placeholder="All methods" styleClass="min-w-40" (onChange)="filter()" />
      </div>

      <!-- Table -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <p-table [value]="filteredPayments()" [loading]="loading()" dataKey="id" styleClass="text-sm"
          [paginator]="filteredPayments().length > 10" [rows]="10" [rowsPerPageOptions]="[10, 25, 50]"
          [showCurrentPageReport]="true" currentPageReportTemplate="Showing {first}–{last} of {totalRecords}">
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="orderNumber" class="text-xs text-gray-500 font-medium">Order <p-sortIcon field="orderNumber" /></th>
              <th pSortableColumn="customer" class="text-xs text-gray-500 font-medium">Customer <p-sortIcon field="customer" /></th>
              <th pSortableColumn="amount" class="text-xs text-gray-500 font-medium">Amount <p-sortIcon field="amount" /></th>
              <th pSortableColumn="method" class="text-xs text-gray-500 font-medium">Method <p-sortIcon field="method" /></th>
              <th class="text-xs text-gray-500 font-medium">Reference</th>
              <th class="text-xs text-gray-500 font-medium">Proof</th>
              <th pSortableColumn="status" class="text-xs text-gray-500 font-medium">Status <p-sortIcon field="status" /></th>
              <th class="text-xs text-gray-500 font-medium">Submitted</th>
              <th class="text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-payment>
            <tr class="hover:bg-gray-50" [class.bg-orange-50]="payment.status === 'pending'">
              <td class="font-semibold text-primary-600">{{ payment.orderNumber }}</td>
              <td class="text-gray-700 font-medium">{{ payment.customer }}</td>
              <td class="font-bold text-gray-900">\u20B9{{ payment.amount | number }}</td>
              <td class="text-gray-600">{{ payment.method }}</td>
              <td>
                <span class="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{{ payment.reference }}</span>
              </td>
              <td>
                @if (payment.proofImageUrl) {
                  <button
                    pButton
                    icon="pi pi-image"
                    label="View Proof"
                    class="p-button-text p-button-sm"
                    (click)="viewProof(payment)"
                  ></button>
                } @else {
                  <span class="text-xs text-gray-400">No proof</span>
                }
              </td>
              <td>
                <p-tag [value]="payment.status" [severity]="getStatusSeverity(payment.status)" styleClass="text-xs capitalize" />
              </td>
              <td class="text-gray-500 text-xs">{{ payment.submittedAt }}</td>
              <td>
                @if (payment.status === 'pending') {
                  <div class="flex gap-1">
                    <button
                      pButton
                      icon="pi pi-check"
                      class="p-button-sm p-button-rounded"
                      severity="success"
                      pTooltip="Verify"
                      (click)="verifyPayment(payment)"
                    ></button>
                    <button
                      pButton
                      icon="pi pi-times"
                      class="p-button-sm p-button-rounded p-button-danger"
                      pTooltip="Reject"
                      (click)="openRejectDialog(payment)"
                    ></button>
                  </div>
                } @else {
                  <span class="text-xs text-gray-400">\u2014</span>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="9" class="text-center py-12 text-gray-400">
                <i class="pi pi-credit-card" style="font-size:2.5rem"></i>
                <p class="mt-3">No payments found</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <!-- Proof viewer dialog -->
      <p-dialog [(visible)]="proofDialog" header="Payment Proof" [modal]="true" [style]="{width:'500px'}">
        @if (selectedPayment()) {
          <div class="space-y-4">
            <div class="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">Order</span>
                <span class="font-semibold">{{ selectedPayment()!.orderNumber }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">Amount</span>
                <span class="font-bold text-green-600">\u20B9{{ selectedPayment()!.amount | number }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">Reference</span>
                <span class="font-mono text-xs">{{ selectedPayment()!.reference }}</span>
              </div>
            </div>
            <div class="rounded-lg overflow-hidden border border-gray-200">
              <img [src]="selectedPayment()!.proofImageUrl" alt="Payment proof" class="w-full max-h-80 object-contain bg-gray-100" />
            </div>
          </div>
        }
        <ng-template pTemplate="footer">
          @if (selectedPayment()?.status === 'pending') {
            <button pButton label="Reject" class="p-button-outlined p-button-danger" (click)="proofDialog = false; openRejectDialog(selectedPayment()!)"></button>
            <button pButton label="Verify Payment" severity="success" icon="pi pi-check" (click)="verifyPayment(selectedPayment()!); proofDialog = false"></button>
          } @else {
            <button pButton label="Close" class="p-button-outlined" (click)="proofDialog = false"></button>
          }
        </ng-template>
      </p-dialog>

      <!-- Reject dialog -->
      <p-dialog [(visible)]="rejectDialog" header="Reject Payment" [modal]="true" [style]="{width:'400px'}">
        <div class="space-y-3 py-2">
          <p class="text-sm text-gray-600">Please provide a reason for rejecting this payment. The customer will be notified.</p>
          <textarea pTextarea [(ngModel)]="rejectReason" rows="3" class="w-full" placeholder="e.g. Reference number does not match, amount is incorrect..."></textarea>
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="rejectDialog = false"></button>
          <button pButton label="Reject Payment" severity="danger" icon="pi pi-times" (click)="confirmReject()"></button>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class PaymentsComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly paymentService = inject(PaymentService);

  loading = signal(true);
  proofDialog = false;
  rejectDialog = false;
  selectedPayment = signal<PaymentRow | null>(null);
  searchQuery = '';
  statusFilter = '';
  methodFilter = '';
  rejectReason = '';

  filteredPayments = signal<PaymentRow[]>([]);
  private allPayments = signal<PaymentRow[]>([]);

  pendingCount = () => this.allPayments().filter(p => p.status === 'pending').length;
  verifiedCount = () => this.allPayments().filter(p => p.status === 'verified').length;
  rejectedCount = () => this.allPayments().filter(p => p.status === 'rejected').length;

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Verified', value: 'verified' },
    { label: 'Rejected', value: 'rejected' },
  ];

  methodOptions = [
    { label: 'All Methods', value: '' },
    { label: 'Bank Transfer', value: 'bank_transfer' },
    { label: 'Cash on Delivery', value: 'cash_on_delivery' },
    { label: 'Mobile Money', value: 'mobile_money' },
    { label: 'UPI QR', value: 'upi_qr' },
    { label: 'Card', value: 'card' },
  ];

  ngOnInit() {
    this.loadPayments();
  }

  private loadPayments() {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.statusFilter) {
      params['verificationStatus'] = this.statusFilter;
    }
    this.paymentService.getAll(params as any).subscribe({
      next: (res) => {
        const rows: PaymentRow[] = (res.data ?? res as any).map((p: any) => this.mapToRow(p));
        this.allPayments.set(rows);
        this.filter();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load payments' });
      },
    });
  }

  private mapToRow(p: any): PaymentRow {
    return {
      id: p.id,
      orderId: p.order_id ?? p.orderId ?? '',
      orderNumber: p.order_number ?? p.orderNumber ?? p.order?.orderNumber ?? '',
      customer: p.customer_name ?? p.customerName ?? '',
      amount: p.amount ?? 0,
      method: p.method ?? '',
      reference: p.transaction_ref ?? p.transactionRef ?? p.reference ?? '',
      proofImageUrl: p.qr_code_url ?? p.qrCodeUrl ?? p.proofImageUrl ?? p.proof_image_url ?? '',
      status: p.status ?? p.verificationStatus ?? p.verification_status ?? 'pending',
      submittedAt: p.created_at ?? p.createdAt ?? '',
    };
  }

  filter() {
    let result = [...this.allPayments()];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(p => p.orderNumber.toLowerCase().includes(q) || p.customer.toLowerCase().includes(q));
    }
    if (this.statusFilter) result = result.filter(p => p.status === this.statusFilter);
    if (this.methodFilter) result = result.filter(p => p.method === this.methodFilter);
    this.filteredPayments.set(result);
  }

  viewProof(payment: PaymentRow) {
    this.selectedPayment.set(payment);
    this.proofDialog = true;
  }

  verifyPayment(payment: PaymentRow) {
    this.paymentService.verify(payment.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Payment Verified', detail: `Payment for ${payment.orderNumber} has been verified` });
        this.loadPayments();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to verify payment' });
      },
    });
  }

  openRejectDialog(payment: PaymentRow) {
    this.selectedPayment.set(payment);
    this.rejectReason = '';
    this.rejectDialog = true;
  }

  confirmReject() {
    const payment = this.selectedPayment();
    if (!payment) return;
    this.paymentService.reject(payment.id, { reason: this.rejectReason }).subscribe({
      next: () => {
        this.rejectDialog = false;
        this.messageService.add({ severity: 'warn', summary: 'Payment Rejected', detail: `Payment for ${payment.orderNumber} has been rejected` });
        this.loadPayments();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to reject payment' });
      },
    });
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = { pending: 'warn', verified: 'success', rejected: 'danger' };
    return map[status] ?? 'secondary';
  }
}
