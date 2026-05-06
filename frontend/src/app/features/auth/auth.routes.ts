import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./register.component').then(m => m.RegisterComponent),
  },
];
