import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { onboardingGuard } from './core/guards/onboarding.guard';

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
        path: 'orders',
        loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES),
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
        loadComponent: () => import('./features/deliveries/deliveries.component').then(m => m.DeliveriesComponent),
      },
      {
        path: 'customers',
        loadChildren: () => import('./features/customers/customers.routes').then(m => m.CUSTOMERS_ROUTES),
      },
      {
        path: 'campaigns',
        loadChildren: () => import('./features/campaigns/campaigns.routes').then(m => m.CAMPAIGNS_ROUTES),
      },
      {
        path: 'conversations',
        loadComponent: () => import('./features/conversations/conversations.component').then(m => m.ConversationsComponent),
      },
      {
        path: 'workflow-builder',
        loadComponent: () => import('./features/workflow-builder/workflow-builder.component').then(m => m.WorkflowBuilderComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
