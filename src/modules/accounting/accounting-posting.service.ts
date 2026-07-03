import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AccountingService } from './accounting.service';
import {
  InvoiceCreatedEvent,
  PaymentVerifiedEvent,
  PurchaseRecordedEvent,
  SupplierPaymentRecordedEvent,
  CreditNoteCreatedEvent,
  DebitNoteCreatedEvent,
} from '../events/domain-events';

/**
 * Auto-posts accounting vouchers from commerce events, so the books fill themselves:
 *   - invoice.created  → Sales voucher (Dr Debtor, Cr Sales + GST)
 *   - payment.verified → Receipt voucher (Dr Cash/Bank, Cr Debtor)
 *
 * Both posts are idempotent (deduped by vouchers.source_id) and best-effort — a posting
 * failure never breaks the originating commerce flow.
 */
@Injectable()
export class AccountingPostingService {
  private readonly logger = new Logger(AccountingPostingService.name);

  constructor(private readonly accounting: AccountingService) {}

  @OnEvent('invoice.created')
  async onInvoiceCreated(event: InvoiceCreatedEvent): Promise<void> {
    try {
      await this.accounting.postSalesInvoice(event.tenantSchema, event.invoiceId);
    } catch (err) {
      this.logger.error(`Auto-post invoice ${event.invoiceId} failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('payment.verified')
  async onPaymentVerified(event: PaymentVerifiedEvent): Promise<void> {
    try {
      await this.accounting.postReceipt(event.tenantSchema, event.paymentId, event.customerId, event.amount);
    } catch (err) {
      this.logger.error(`Auto-post payment ${event.paymentId} failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('purchase.recorded')
  async onPurchaseRecorded(event: PurchaseRecordedEvent): Promise<void> {
    try {
      await this.accounting.postPurchase(event.tenantSchema, event.supplierOrderId);
    } catch (err) {
      this.logger.error(`Auto-post purchase ${event.supplierOrderId} failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('supplier_payment.recorded')
  async onSupplierPayment(event: SupplierPaymentRecordedEvent): Promise<void> {
    try {
      await this.accounting.postSupplierPayment(event.tenantSchema, event.paymentId);
    } catch (err) {
      this.logger.error(`Auto-post supplier payment ${event.paymentId} failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('credit_note.created')
  async onCreditNote(event: CreditNoteCreatedEvent): Promise<void> {
    try {
      await this.accounting.postCreditNote(event.tenantSchema, event.creditNoteId);
    } catch (err) {
      this.logger.error(`Auto-post credit note ${event.creditNoteId} failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('debit_note.created')
  async onDebitNote(event: DebitNoteCreatedEvent): Promise<void> {
    try {
      await this.accounting.postDebitNote(event.tenantSchema, event.debitNoteId);
    } catch (err) {
      this.logger.error(`Auto-post debit note ${event.debitNoteId} failed: ${(err as Error).message}`);
    }
  }
}
