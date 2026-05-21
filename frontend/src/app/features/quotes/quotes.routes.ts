import { Routes } from '@angular/router';

export const QUOTES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./quote-list.component').then(m => m.QuoteListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./quote-form.component').then(m => m.QuoteFormComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./quote-detail.component').then(m => m.QuoteDetailComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./quote-form.component').then(m => m.QuoteFormComponent),
  },
];
