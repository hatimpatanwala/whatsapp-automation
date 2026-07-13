import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { onboardingGuard } from './core/guards/onboarding.guard';
import { featureGuard } from './core/guards/feature.guard';
import { erpAccessGuard } from './core/guards/erp-access.guard';
import { writeGuard } from './core/guards/write.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () => import('./features/onboarding/onboarding.component').then(m => m.OnboardingComponent),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/super-admin/admin-layout.component').then(m => m.AdminLayoutComponent),
    loadChildren: () => import('./features/super-admin/admin.routes').then(m => m.ADMIN_ROUTES),
  },
  {
    // GST tax-invoice print format — chrome-free (PgUp/PgDn browse, ?print=1 auto-print).
    path: 'print/invoice/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/entry/print-invoice.component').then(m => m.PrintInvoiceComponent),
  },
  {
    // Tally-style keyboard ERP (desktop-first): full-screen chrome with F-key rail.
    // Sits OUTSIDE the web portal's sidebar layout — the web portal stays untouched.
    path: '',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./features/entry/tally-layout.component').then(m => m.TallyLayoutComponent),
    children: [
      {
        // ERP Home — the admin's business-overview dashboard (desktop landing page).
        path: 'home',
        loadComponent: () => import('./features/entry/erp-home.component').then(m => m.ErpHomeComponent),
      },
      {
        path: 'gateway',
        loadComponent: () => import('./features/entry/gateway.component').then(m => m.GatewayComponent),
      },
      {
        path: 'entry/sales',
        canActivate: [writeGuard],
        data: { feature: 'invoices' },
        loadComponent: () => import('./features/entry/sales-invoice-entry.component').then(m => m.SalesInvoiceEntryComponent),
      },
      {
        path: 'entry/purchase',
        canActivate: [writeGuard],
        data: { feature: 'purchases' },
        loadComponent: () => import('./features/entry/purchase-entry.component').then(m => m.PurchaseEntryComponent),
      },
      {
        path: 'entry/receipt',
        canActivate: [writeGuard],
        data: { feature: 'payments' },
        loadComponent: () => import('./features/entry/receipt-entry.component').then(m => m.ReceiptEntryComponent),
      },
      {
        path: 'entry/payment',
        canActivate: [writeGuard],
        data: { feature: 'payments' },
        loadComponent: () => import('./features/entry/payment-entry.component').then(m => m.PaymentEntryComponent),
      },
      {
        path: 'entry/quote',
        canActivate: [writeGuard],
        data: { feature: 'quotes' },
        loadComponent: () => import('./features/entry/quote-entry.component').then(m => m.QuoteEntryComponent),
      },
      {
        path: 'entry/order',
        canActivate: [writeGuard],
        data: { feature: 'orders' },
        loadComponent: () => import('./features/entry/order-entry.component').then(m => m.OrderEntryComponent),
      },
      {
        path: 'entry/returns',
        canActivate: [writeGuard],
        data: { feature: 'invoices' },
        loadComponent: () => import('./features/entry/returns-entry.component').then(m => m.ReturnsEntryComponent),
      },
      {
        path: 'entry/stock',
        canActivate: [writeGuard],
        data: { feature: 'inventory' },
        loadComponent: () => import('./features/entry/stock-journal.component').then(m => m.StockJournalComponent),
      },
      {
        path: 'entry/masters',
        loadComponent: () => import('./features/entry/pricing-masters.component').then(m => m.PricingMastersComponent),
      },
      {
        // Payments & Collections — queue / feed / reconciliation / setup.
        path: 'entry/collect',
        loadComponent: () => import('./features/entry/collect.component').then(m => m.CollectComponent),
      },
      {
        // Party Master — unified GST ledger-party (PARTY_MASTER_README.md).
        path: 'entry/party',
        loadComponent: () => import('./features/entry/party-master.component').then(m => m.PartyMasterComponent),
      },
      {
        // SFA admin consolidated into the portal Field Sales console (single point
        // to register salesmen, share links, targets, beats, visits, follow-ups).
        path: 'entry/salesmen',
        redirectTo: '/field-sales',
        pathMatch: 'full',
      },
      {
        // Item master — Miracle Add Item / Add Stock (dual units, HSN, rates, min stock).
        path: 'entry/items',
        loadComponent: () => import('./features/entry/item-master.component').then(m => m.ItemMasterComponent),
      },
      {
        // Document registers — Sales / Purchase / Quotation / Order (Miracle report style).
        path: 'entry/registers/:kind',
        loadComponent: () => import('./features/entry/registers.component').then(m => m.RegistersComponent),
      },
      {
        path: 'accounting',
        loadChildren: () => import('./features/accounting/accounting.routes').then(m => m.ACCOUNTING_ROUTES),
      },
      {
        path: 'gst',
        loadComponent: () => import('./features/gst/gst-returns.component').then(m => m.GstReturnsComponent),
      },
    ],
  },
  {
    path: '',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        // Legacy salesman-admin path — consolidated into the Field Sales console
        // (single registration point). Redirect so old links/bookmarks still work.
        path: 'salesmen',
        redirectTo: 'field-sales',
        pathMatch: 'full',
      },
      {
        // Field Sales (SFA) manager console — the ONE place to register salesmen +
        // team performance, beats, targets, visits, follow-ups. Gated by `sfa`.
        path: 'field-sales',
        canActivate: [featureGuard('sfa')],
        loadComponent: () => import('./features/field-sales/field-sales.component').then(m => m.FieldSalesComponent),
      },
      {
        // The signed-in salesman's own field workspace (beat, visits, orders,
        // collections, my performance) — the email/password counterpart to the
        // WhatsApp /m/sales webview.
        path: 'my-sales',
        canActivate: [featureGuard('sfa')],
        loadComponent: () => import('./features/field-sales/my-sales.component').then(m => m.MySalesComponent),
      },
      {
        // Offline desktop app info + download (portal only advertises it when the
        // tenant's plan includes erpOffline).
        path: 'desktop-app',
        loadComponent: () => import('./features/desktop-app/desktop-app.component').then(m => m.DesktopAppComponent),
      },
      {
        // Team & Roles — employees + RBAC permission matrix.
        path: 'team',
        loadComponent: () => import('./features/team/team.component').then(m => m.TeamComponent),
      },
      {
        // Notification preferences (which events push to the app + bell).
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notification-settings.component').then(m => m.NotificationSettingsComponent),
      },
      {
        path: 'products',
        loadChildren: () => import('./features/products/products.routes').then(m => m.PRODUCTS_ROUTES),
      },
      {
        path: 'catalog-taxonomy',
        loadComponent: () => import('./features/catalog-taxonomy/catalog-taxonomy.component').then(m => m.CatalogTaxonomyComponent),
      },
      {
        // Tax Rates — available to every tenant (ERP or not).
        path: 'tax-rates',
        loadComponent: () => import('./features/tax-rates/tax-rates.component').then(m => m.TaxRatesComponent),
      },
      {
        path: 'schemes',
        loadComponent: () => import('./features/schemes/schemes.component').then(m => m.SchemesComponent),
      },
      {
        path: 'orders',
        loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES),
      },
      {
        path: 'invoices',
        loadComponent: () => import('./features/invoices/invoices.component').then(m => m.InvoicesComponent),
      },
      {
        // Ledgers / accounts-receivable overview (ERP).
        path: 'ledgers',
        loadComponent: () => import('./features/ledgers/ledgers.component').then(m => m.LedgersComponent),
      },
      {
        path: 'inventory',
        loadComponent: () => import('./features/inventory/inventory.component').then(m => m.InventoryComponent),
      },
      {
        path: 'payments',
        loadComponent: () => import('./features/payments/payments.component').then(m => m.PaymentsComponent),
      },
      {
        path: 'deliveries',
        canActivate: [featureGuard('deliveries')],
        loadComponent: () => import('./features/deliveries/deliveries.component').then(m => m.DeliveriesComponent),
      },
      {
        path: 'customers',
        canActivate: [featureGuard('customers')],
        loadChildren: () => import('./features/customers/customers.routes').then(m => m.CUSTOMERS_ROUTES),
      },
      {
        path: 'campaigns',
        canActivate: [featureGuard('campaigns')],
        loadChildren: () => import('./features/campaigns/campaigns.routes').then(m => m.CAMPAIGNS_ROUTES),
      },
      {
        path: 'conversations',
        canActivate: [featureGuard('conversations')],
        loadComponent: () => import('./features/conversations/conversations.component').then(m => m.ConversationsComponent),
      },
      {
        path: 'catalog-management',
        canActivate: [featureGuard('whatsappCatalog')],
        loadComponent: () => import('./features/catalog-management/catalog-management.component').then(m => m.CatalogManagementComponent),
      },
      {
        path: 'quotes',
        canActivate: [featureGuard('quotes')],
        loadChildren: () => import('./features/quotes/quotes.routes').then(m => m.QUOTES_ROUTES),
      },
      {
        path: 'erp',
        canActivate: [erpAccessGuard],
        loadChildren: () => import('./features/erp/erp.routes').then(m => m.ERP_ROUTES),
      },
      {
        path: 'workflow-builder',
        canActivate: [featureGuard('workflowBuilder')],
        loadComponent: () => import('./features/workflow-builder/workflow-builder.component').then(m => m.WorkflowBuilderComponent),
      },
      {
        path: 'workflow-simulator',
        canActivate: [featureGuard('workflowBuilder')],
        loadComponent: () => import('./features/workflow-builder/components/tenant-chat-simulator.component').then(m => m.TenantChatSimulatorComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
      },
      {
        path: 'settings/usage',
        loadComponent: () => import('./features/settings/usage-dashboard.component').then(m => m.UsageDashboardComponent),
      },
      {
        path: 'settings/billing',
        loadComponent: () => import('./features/settings/billing-dashboard.component').then(m => m.BillingDashboardComponent),
      },
      {
        path: 'settings/upgrade',
        loadComponent: () => import('./features/settings/upgrade.component').then(m => m.UpgradeComponent),
      },
    ],
  },
  {
    // Token-secured Builder webview — opened inside WhatsApp's in-app browser (or
    // the panel). No auth guard: the ?token= query param is the only credential,
    // validated server-side. Useless without a valid token.
    path: 'm/builder',
    loadComponent: () => import('./features/builder/mobile-builder.component').then(m => m.MobileBuilderComponent),
  },
  {
    // Token-secured read-only order/quote view ("Check the order" button).
    path: 'm/view',
    loadComponent: () => import('./features/builder/order-view.component').then(m => m.OrderViewComponent),
  },
  {
    // Token-secured bulk product editor (opened from WhatsApp admin).
    path: 'm/bulk',
    loadComponent: () => import('./features/builder/bulk-webview.component').then(m => m.BulkWebviewComponent),
  },
  {
    // Token-secured single-product add page (opened from WhatsApp admin).
    path: 'm/product',
    loadComponent: () => import('./features/builder/product-add.component').then(m => m.ProductAddComponent),
  },
  {
    // Token-secured schemes/coupons editor (opened from WhatsApp admin).
    path: 'm/promotions',
    loadComponent: () => import('./features/builder/promo-webview.component').then(m => m.PromoWebviewComponent),
  },
  {
    // Token-secured customer storefront (opened from WhatsApp — browse → cart → checkout).
    path: 'm/shop',
    loadComponent: () => import('./features/builder/shop-webview.component').then(m => m.ShopWebviewComponent),
  },
  {
    // Token-secured customer-insights webview (opened from WhatsApp admin).
    path: 'm/customers',
    loadComponent: () => import('./features/builder/customers-webview.component').then(m => m.CustomersWebviewComponent),
  },
  {
    // Token-secured invoice builder webview (admin bills a customer from WhatsApp).
    path: 'm/invoice-builder',
    loadComponent: () => import('./features/builder/invoice-builder.component').then(m => m.InvoiceBuilderComponent),
  },
  {
    // Token-secured customer onboarding webview (collect required custom fields).
    path: 'm/onboarding',
    loadComponent: () => import('./features/builder/onboarding-webview.component').then(m => m.OnboardingWebviewComponent),
  },
  {
    // Token-secured ERP Console webview — admin manages orders, invoices, catalog
    // & customers from inside WhatsApp (opened from the admin menu).
    path: 'm/erp',
    loadComponent: () => import('./features/builder/mobile-erp.component').then(m => m.MobileErpComponent),
  },
  {
    // Token-secured salesman field app — orders on behalf, collections, promises.
    path: 'm/sales',
    loadComponent: () => import('./features/builder/sales-webview.component').then(m => m.SalesWebviewComponent),
  },
  { path: '**', redirectTo: '' },
];
