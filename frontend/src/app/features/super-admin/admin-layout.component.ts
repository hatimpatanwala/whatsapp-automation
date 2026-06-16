import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/services/auth.service';

interface AdminNavGroup {
  title: string;
  items: { label: string; icon: string; route: string; badge?: string }[];
}

@Component({
  selector: 'wa-admin-layout',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    ButtonModule, AvatarModule, TooltipModule,
  ],
  template: `
    <div class="flex h-screen overflow-hidden bg-gray-50">

      <!-- Sidebar -->
      <aside class="w-60 flex-shrink-0 flex flex-col bg-white border-r border-gray-200">

        <!-- Logo -->
        <div class="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-600">
            <i class="pi pi-shield text-white" style="font-size:1.1rem"></i>
          </div>
          <div>
            <p class="text-sm font-bold text-gray-900 tracking-wide">WA Commerce</p>
            <p class="text-[10px] uppercase tracking-widest text-emerald-600 font-semibold">Super Admin</p>
          </div>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 overflow-y-auto py-3 px-3">
          @for (group of navGroups; track group.title) {
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mt-4 mb-2 first:mt-1">{{ group.title }}</p>
            @for (item of group.items; track item.route) {
              <a
                [routerLink]="item.route"
                routerLinkActive="!bg-emerald-50 !text-emerald-700 !border-l-2 !border-emerald-600"
                [routerLinkActiveOptions]="{ exact: item.route === '/admin/dashboard' }"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-colors duration-150 no-underline text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                <i [class]="'pi ' + item.icon" style="font-size:0.9rem"></i>
                <span class="font-medium flex-1">{{ item.label }}</span>
                @if (item.badge) {
                  <span class="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">{{ item.badge }}</span>
                }
              </a>
            }
          }
        </nav>

        <!-- Bottom Profile -->
        <div class="p-3 border-t border-gray-100">
          <div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br from-emerald-500 to-emerald-600">
              {{ getInitials() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-gray-900 truncate">{{ authService.currentAdmin()?.name ?? 'Super Admin' }}</p>
              <p class="text-[10px] text-gray-400 truncate">{{ authService.currentAdmin()?.email ?? '' }}</p>
            </div>
            <button pButton icon="pi pi-sign-out" class="p-button-text p-button-sm p-button-rounded text-gray-400 hover:text-red-500" pTooltip="Logout" (click)="logout()"></button>
          </div>
        </div>
      </aside>

      <!-- Main content -->
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">

        <!-- Top bar -->
        <header class="flex items-center justify-between px-6 py-2.5 shrink-0 bg-white border-b border-gray-200">
          <div class="flex items-center gap-2 text-xs text-gray-400">
            <i class="pi pi-shield" style="font-size:0.7rem"></i>
            <span class="font-semibold uppercase tracking-wider">Admin Portal</span>
          </div>
          <div class="flex items-center gap-3">
            <a routerLink="/" class="text-xs text-gray-500 hover:text-emerald-600 transition-colors no-underline flex items-center gap-1">
              <i class="pi pi-external-link" style="font-size:0.7rem"></i>Back to Platform
            </a>
            <div class="w-px h-4 bg-gray-200"></div>
            <button pButton icon="pi pi-bell" class="p-button-text p-button-sm p-button-rounded text-gray-400"></button>
          </div>
        </header>

        <!-- Page content -->
        <main class="flex-1 overflow-y-auto bg-gray-50">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AdminLayoutComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  navGroups: AdminNavGroup[] = [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', icon: 'pi-chart-bar', route: '/admin/dashboard' },
      ],
    },
    {
      title: 'Management',
      items: [
        { label: 'Tenants', icon: 'pi-building', route: '/admin/tenants' },
        { label: 'Subscription Plans', icon: 'pi-star', route: '/admin/subscriptions' },
      ],
    },
    {
      title: 'WhatsApp',
      items: [
        { label: 'WABA Accounts', icon: 'pi-whatsapp', route: '/admin/waba' },
        { label: 'Message Templates', icon: 'pi-comments', route: '/admin/templates' },
      ],
    },
    {
      title: 'Finance',
      items: [
        { label: 'Billing', icon: 'pi-credit-card', route: '/admin/billing' },
      ],
    },
  ];

  ngOnInit() {}

  getInitials(): string {
    const name = this.authService.currentAdmin()?.name ?? 'SA';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  logout() {
    this.authService.logout().subscribe();
  }
}
