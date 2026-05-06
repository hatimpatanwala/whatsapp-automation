import { Routes } from '@angular/router';

export const CAMPAIGNS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./campaign-list.component').then(m => m.CampaignListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./campaign-form.component').then(m => m.CampaignFormComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./campaign-form.component').then(m => m.CampaignFormComponent),
  },
];
