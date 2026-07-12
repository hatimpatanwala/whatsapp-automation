import { Routes } from '@angular/router';
import { writeGuard } from '../../core/guards/write.guard';

export const ORDERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./order-list.component').then(m => m.OrderListComponent),
  },
  {
    path: 'new',
    canActivate: [writeGuard],
    data: { feature: 'orders' },
    loadComponent: () => import('./order-form.component').then(m => m.OrderFormComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./order-detail.component').then(m => m.OrderDetailComponent),
  },
];
