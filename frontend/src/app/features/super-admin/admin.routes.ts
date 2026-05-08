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
    path: 'waba',
    loadComponent: () => import('./waba/waba-dashboard.component').then(m => m.WabaDashboardComponent),
  },
];
