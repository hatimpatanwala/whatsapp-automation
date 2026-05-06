import { Routes } from '@angular/router';

export const CUSTOMERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./customer-list.component').then(m => m.CustomerListComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./customer-detail.component').then(m => m.CustomerDetailComponent),
  },
];
