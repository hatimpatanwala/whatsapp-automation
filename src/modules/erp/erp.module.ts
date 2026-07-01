import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { SubscriptionPlan } from '../../database/entities/public/subscription-plan.entity';
import { ErpController } from './erp.controller';
import { PlanFeatureService } from './common/plan-feature.service';
import { ErpSequenceService } from './common/erp-sequence.service';
import { ErpProvisioningService } from './provisioning/erp-provisioning.service';
import { ErpFeatureGuard } from '../../common/guards/erp-feature.guard';
import { PaymentModeController } from './invoicing/payment-mode.controller';
import { PaymentModeService } from './invoicing/payment-mode.service';
import { ErpInvoiceController } from './invoicing/erp-invoice.controller';
import { ErpInvoiceService } from './invoicing/erp-invoice.service';
import { ErpDocumentService } from './invoicing/erp-document.service';
import { LeadController, LeadService } from './crm/lead';
import { ClientController, ClientService } from './crm/client';
import { OfferController, OfferService } from './crm/offer';
import { SupplierController, SupplierService } from './procurement/supplier';
import { ExpenseCategoryController, ExpenseCategoryService } from './procurement/expense-category';
import { ExpenseController, ExpenseService } from './procurement/expense';
import { SupplierOrderController, SupplierOrderService } from './procurement/supplier-order';
import { EmployeeController, EmployeeService } from './hr/employee';
import { CurrencyController, CurrencyService } from './enterprise/currency';
import { TaxRateController, TaxRatePublicController, TaxRateService } from './enterprise/tax-rate';
import { WarehouseController, WarehouseService } from './enterprise/warehouse';
import { StockController, StockService } from './enterprise/stock';
import { ErpSettingsController, ErpSettingsService } from './enterprise/erp-settings';
import { CompanyController, CompanyService } from './enterprise2/company';
import { PersonController, PersonService } from './enterprise2/person';
import { BranchController, BranchService } from './enterprise2/branch';
import { ApiKeyController, ApiKeyService } from './enterprise2/api-key';
import { ReportsController, ReportsService } from './enterprise2/reports';
import { BankAccountController, BankAccountService } from './vyapar/bank-account';
import { CreditNoteController, CreditNoteService, DebitNoteController, DebitNoteService } from './vyapar/return-note';
import { BatchController, BatchService } from './advanced/batch';
import { RecurringInvoiceController, RecurringInvoiceService, RecurringInvoiceCron } from './advanced/recurring-invoice';
import { PosController, PosService } from './pos/pos';
import { EwayBillController, EwayBillService } from './compliance/eway-bill';
import { ErpExportController } from './export/erp-export.controller';
import { ErpExportService } from './export/erp-export.service';

/**
 * Premium ERP/CRM layer (IDURAR feature parity), gated by the subscription plan's
 * `features.erp` flag (+ per-area sub-flags erpInvoicing / erpCrm / erpProcurement
 * / erpHr). All tenant data access goes through TenantConnectionManager so the
 * schema-per-tenant isolation is preserved.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Subscription, SubscriptionPlan])],
  controllers: [
    ErpController,
    // invoicing
    PaymentModeController,
    ErpInvoiceController,
    // crm
    LeadController,
    ClientController,
    OfferController,
    // procurement
    SupplierController,
    ExpenseCategoryController,
    ExpenseController,
    SupplierOrderController,
    // hr
    EmployeeController,
    // enterprise
    CurrencyController,
    TaxRateController,
    TaxRatePublicController,
    WarehouseController,
    StockController,
    ErpSettingsController,
    // enterprise CRM + admin
    CompanyController,
    PersonController,
    BranchController,
    ApiKeyController,
    ReportsController,
    // vyapar parity
    BankAccountController,
    CreditNoteController,
    DebitNoteController,
    // advanced
    BatchController,
    RecurringInvoiceController,
    // pos + compliance
    PosController,
    EwayBillController,
    // data export
    ErpExportController,
  ],
  providers: [
    PlanFeatureService,
    ErpSequenceService,
    ErpProvisioningService,
    ErpFeatureGuard,
    PaymentModeService,
    ErpInvoiceService,
    ErpDocumentService,
    LeadService,
    ClientService,
    OfferService,
    SupplierService,
    ExpenseCategoryService,
    ExpenseService,
    SupplierOrderService,
    EmployeeService,
    CurrencyService,
    TaxRateService,
    WarehouseService,
    StockService,
    ErpSettingsService,
    CompanyService,
    PersonService,
    BranchService,
    ApiKeyService,
    ReportsService,
    BankAccountService,
    CreditNoteService,
    DebitNoteService,
    BatchService,
    RecurringInvoiceService,
    RecurringInvoiceCron,
    PosService,
    EwayBillService,
    ErpExportService,
  ],
  exports: [
    PlanFeatureService,
    ErpSequenceService,
    ErpProvisioningService,
    PaymentModeService,
    ErpInvoiceService,
    ErpDocumentService,
    LeadService,
  ],
})
export class ErpModule {}
