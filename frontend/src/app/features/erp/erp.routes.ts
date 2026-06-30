import { Routes } from '@angular/router';

/**
 * Premium ERP/CRM area. Mounted at `/erp` and gated by the `erp` plan feature
 * (see app.routes.ts → featureGuard('erp')).
 */
export const ERP_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./dashboard/erp-dashboard.component').then((m) => m.ErpDashboardComponent) },
  // Data export centre (download all ERP data; also the landing for read-only/downgraded tenants)
  { path: 'export', loadComponent: () => import('./export/erp-export.component').then((m) => m.ErpExportComponent) },
  // Invoicing
  { path: 'invoices', loadComponent: () => import('./invoices/erp-invoice-list.component').then((m) => m.ErpInvoiceListComponent) },
  { path: 'payment-modes', loadComponent: () => import('./payment-modes/erp-payment-modes.component').then((m) => m.ErpPaymentModesComponent) },
  // CRM
  { path: 'leads', loadComponent: () => import('./crm/erp-leads.component').then((m) => m.ErpLeadsComponent) },
  { path: 'clients', loadComponent: () => import('./crm/erp-clients.component').then((m) => m.ErpClientsComponent) },
  { path: 'offers', loadComponent: () => import('./crm/erp-offers.component').then((m) => m.ErpOffersComponent) },
  // Procurement
  { path: 'suppliers', loadComponent: () => import('./procurement/erp-suppliers.component').then((m) => m.ErpSuppliersComponent) },
  { path: 'purchase-orders', loadComponent: () => import('./procurement/erp-supplier-orders.component').then((m) => m.ErpSupplierOrdersComponent) },
  { path: 'expense-categories', loadComponent: () => import('./procurement/erp-expense-categories.component').then((m) => m.ErpExpenseCategoriesComponent) },
  { path: 'expenses', loadComponent: () => import('./procurement/erp-expenses.component').then((m) => m.ErpExpensesComponent) },
  // HR
  { path: 'employees', loadComponent: () => import('./hr/erp-employees.component').then((m) => m.ErpEmployeesComponent) },
  // Enterprise
  { path: 'stock', loadComponent: () => import('./enterprise/erp-stock.component').then((m) => m.ErpStockComponent) },
  { path: 'warehouses', loadComponent: () => import('./enterprise/erp-warehouses.component').then((m) => m.ErpWarehousesComponent) },
  { path: 'currencies', loadComponent: () => import('./enterprise/erp-currencies.component').then((m) => m.ErpCurrenciesComponent) },
  { path: 'tax-rates', loadComponent: () => import('./enterprise/erp-tax-rates.component').then((m) => m.ErpTaxRatesComponent) },
  { path: 'settings', loadComponent: () => import('./enterprise/erp-settings.component').then((m) => m.ErpSettingsComponent) },
  // Enterprise CRM + admin + analytics
  { path: 'reports', loadComponent: () => import('./enterprise2/erp-reports.component').then((m) => m.ErpReportsComponent) },
  { path: 'companies', loadComponent: () => import('./enterprise2/erp-companies.component').then((m) => m.ErpCompaniesComponent) },
  { path: 'people', loadComponent: () => import('./enterprise2/erp-people.component').then((m) => m.ErpPeopleComponent) },
  { path: 'branches', loadComponent: () => import('./enterprise2/erp-branches.component').then((m) => m.ErpBranchesComponent) },
  { path: 'api-keys', loadComponent: () => import('./enterprise2/erp-api-keys.component').then((m) => m.ErpApiKeysComponent) },
  // Vyapar parity: returns + cash/bank
  { path: 'credit-notes', loadComponent: () => import('./vyapar/erp-credit-notes.component').then((m) => m.ErpCreditNotesComponent) },
  { path: 'debit-notes', loadComponent: () => import('./vyapar/erp-debit-notes.component').then((m) => m.ErpDebitNotesComponent) },
  { path: 'bank-accounts', loadComponent: () => import('./vyapar/erp-bank-accounts.component').then((m) => m.ErpBankAccountsComponent) },
  // Advanced: batch/serial + recurring
  { path: 'batches', loadComponent: () => import('./advanced/erp-batches.component').then((m) => m.ErpBatchesComponent) },
  { path: 'recurring', loadComponent: () => import('./advanced/erp-recurring.component').then((m) => m.ErpRecurringComponent) },
  // POS + compliance
  { path: 'pos', loadComponent: () => import('./pos/erp-pos.component').then((m) => m.ErpPosComponent) },
  { path: 'eway-bills', loadComponent: () => import('./compliance/erp-eway-bills.component').then((m) => m.ErpEwayBillsComponent) },
];
