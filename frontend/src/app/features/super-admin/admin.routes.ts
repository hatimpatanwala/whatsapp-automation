import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./stats/admin-dashboard.component').then(m => m.AdminDashboardComponent),
  },
  {
    path: 'tenants',
    loadComponent: () => import('./tenants/tenant-list.component').then(m => m.TenantListComponent),
  },
  {
    path: 'tenants/new',
    loadComponent: () => import('./tenants/tenant-form.component').then(m => m.TenantFormComponent),
  },
  {
    path: 'tenants/:id/edit',
    loadComponent: () => import('./tenants/tenant-form.component').then(m => m.TenantFormComponent),
  },
  {
    path: 'tenants/:id/view',
    loadComponent: () => import('./tenants/tenant-detail.component').then(m => m.TenantDetailComponent),
  },
  {
    path: 'subscriptions',
    loadComponent: () => import('./subscriptions/plan-list.component').then(m => m.PlanListComponent),
  },
  {
    path: 'subscriptions/new',
    loadComponent: () => import('./subscriptions/plan-form.component').then(m => m.PlanFormComponent),
  },
  {
    path: 'subscriptions/:id/edit',
    loadComponent: () => import('./subscriptions/plan-form.component').then(m => m.PlanFormComponent),
  },
  {
    path: 'tenants/:id/quotes',
    loadComponent: () => import('./quotes/admin-quote-list.component').then(m => m.AdminQuoteListComponent),
  },
  {
    path: 'tenants/:id/workflows',
    loadComponent: () => import('./workflows/admin-workflow-builder.component').then(m => m.AdminWorkflowBuilderComponent),
  },
  {
    path: 'tenants/:id/simulator',
    loadComponent: () => import('./workflows/chat-simulator.component').then(m => m.ChatSimulatorComponent),
  },
  {
    path: 'waba',
    loadComponent: () => import('./waba/waba-dashboard.component').then(m => m.WabaDashboardComponent),
  },
  {
    path: 'billing',
    loadComponent: () => import('./billing/admin-billing.component').then(m => m.AdminBillingComponent),
  },
];
