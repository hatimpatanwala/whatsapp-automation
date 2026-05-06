import { Routes } from '@angular/router';

export const PRODUCTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./product-list.component').then(m => m.ProductListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./product-form.component').then(m => m.ProductFormComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./product-form.component').then(m => m.ProductFormComponent),
  },
];
