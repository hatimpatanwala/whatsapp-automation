import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/services/auth.service';

interface AdminNavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'wa-admin-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    AvatarModule,
    TooltipModule,
  ],
  template: `
    <div class="flex h-screen overflow-hidden bg-gray-950">

      <!-- Admin sidebar -->
      <aside class="w-60 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">

        <!-- Logo -->
        <div class="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
          <div class="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
            <i class="pi pi-shield text-white" style="font-size:1rem"></i>
          </div>
          <div>
            <p class="text-sm font-bold text-white">WA Commerce</p>
            <p class="text-xs text-gray-400">Super Admin</p>
          </div>
        </div>

        <!-- Nav -->
        <nav class="flex-1 overflow-y-auto py-4 px-3">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">Platform</p>
          @for (item of navItems; track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="bg-gray-800 text-white"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors no-underline"
            >
              <i [class]="'pi ' + item.icon" style="font-size:1rem"></i>
              <span class="text-sm font-medium">{{ item.label }}</span>
            </a>
          }
        </nav>

        <!-- Bottom -->
        <div class="border-t border-gray-800 p-3">
          <div class="flex items-center gap-3 p-2">
            <div class="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold">SA</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-white truncate">{{ authService.currentAdmin()?.name ?? 'Super Admin' }}</p>
              <p class="text-xs text-gray-400">{{ authService.currentAdmin()?.email ?? '' }}</p>
            </div>
            <button pButton icon="pi pi-sign-out" class="p-button-text p-button-sm p-button-rounded text-gray-400 hover:text-white" (click)="logout()"></button>
          </div>
        </div>
      </aside>

      <!-- Main content -->
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">

        <!-- Top bar -->
        <header class="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin Portal</span>
          </div>
          <div class="flex items-center gap-3">
            <a routerLink="/" class="text-xs text-gray-400 hover:text-primary-400 transition-colors no-underline">
              <i class="pi pi-external-link mr-1"></i>Back to Platform
            </a>
            <div class="w-px h-4 bg-gray-700"></div>
            <button pButton icon="pi pi-bell" class="p-button-text p-button-sm p-button-rounded text-gray-400"></button>
          </div>
        </header>

        <!-- Page content -->
        <main class="flex-1 overflow-y-auto bg-gray-950">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AdminLayoutComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  navItems: AdminNavItem[] = [
    { label: 'Dashboard', icon: 'pi-chart-bar', route: '/admin/dashboard' },
    { label: 'Tenants', icon: 'pi-building', route: '/admin/tenants' },
    { label: 'Subscription Plans', icon: 'pi-star', route: '/admin/subscriptions' },
    { label: 'Billing', icon: 'pi-credit-card', route: '/admin/billing' },
  ];

  ngOnInit() {}

  logout() {
    this.authService.logout().subscribe();
  }
}
