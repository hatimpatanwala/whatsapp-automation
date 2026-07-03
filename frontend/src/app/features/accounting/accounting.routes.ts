import { Routes } from '@angular/router';

export const ACCOUNTING_ROUTES: Routes = [
  { path: '', redirectTo: 'vouchers', pathMatch: 'full' },
  {
    path: 'vouchers',
    loadComponent: () => import('./vouchers.component').then((m) => m.VouchersComponent),
  },
  {
    path: 'vouchers/new',
    loadComponent: () => import('./voucher-entry.component').then((m) => m.VoucherEntryComponent),
  },
  {
    path: 'ledgers',
    loadComponent: () => import('./ledgers.component').then((m) => m.LedgersComponent),
  },
  {
    path: 'reports/:report',
    loadComponent: () => import('./reports.component').then((m) => m.ReportsComponent),
  },
];
