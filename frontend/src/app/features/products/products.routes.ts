import { Routes } from '@angular/router';
import { writeGuard } from '../../core/guards/write.guard';

export const PRODUCTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./product-list.component').then(m => m.ProductListComponent),
  },
  {
    path: 'new',
    canActivate: [writeGuard],
    loadComponent: () => import('./product-form.component').then(m => m.ProductFormComponent),
  },
  {
    path: ':id/edit',
    canActivate: [writeGuard],
    loadComponent: () => import('./product-form.component').then(m => m.ProductFormComponent),
  },
];
