import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { onboardingGuard } from './core/guards/onboarding.guard';
import { featureGuard } from './core/guards/feature.guard';

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
        path: 'products',
        loadChildren: () => import('./features/products/products.routes').then(m => m.PRODUCTS_ROUTES),
      },
      {
        path: 'catalog-taxonomy',
        loadComponent: () => import('./features/catalog-taxonomy/catalog-taxonomy.component').then(m => m.CatalogTaxonomyComponent),
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
  { path: '**', redirectTo: '' },
];
