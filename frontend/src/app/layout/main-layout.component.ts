import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import { AuthService } from '../core/services/auth.service';
import { ApiService } from '../core/services/api.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
}

@Component({
  selector: 'wa-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    AvatarModule,
    BadgeModule,
    TooltipModule,
    DividerModule,
  ],
  template: `
    <div class="flex h-screen overflow-hidden bg-gray-50">

      <!-- Mobile overlay -->
      @if (sidebarOpen() && isMobile()) {
        <div
          class="fixed inset-0 bg-black/50 z-20 lg:hidden"
          (click)="closeSidebar()"
        ></div>
      }

      <!-- Sidebar -->
      <aside
        class="fixed lg:relative z-30 h-full flex flex-col bg-white border-r border-gray-200 transition-all duration-300 ease-in-out"
        [class.w-64]="sidebarOpen()"
        [class.w-0]="!sidebarOpen() && isMobile()"
        [class.w-16]="!sidebarOpen() && !isMobile()"
        [class.-translate-x-full]="!sidebarOpen() && isMobile()"
        [class.translate-x-0]="sidebarOpen() || !isMobile()"
      >
        <!-- Logo area -->
        <div class="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
          <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-500 flex-shrink-0">
            <i class="pi pi-whatsapp text-white" style="font-size:1.25rem"></i>
          </div>
          @if (sidebarOpen()) {
            <div class="overflow-hidden">
              <div class="text-sm font-bold text-gray-900 truncate">WA Commerce</div>
              <div class="text-xs text-gray-400 truncate">{{ tenantName() }}</div>
            </div>
          }
        </div>

        <!-- Navigation -->
        <nav class="flex-1 overflow-y-auto py-4 px-2">
          @for (item of navItems; track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="bg-primary-50 text-primary-700"
              [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-gray-600 hover:bg-gray-100 transition-colors duration-150 no-underline group"
              [pTooltip]="!sidebarOpen() ? item.label : ''"
              tooltipPosition="right"
              (click)="onNavClick()"
            >
              <i [class]="'pi ' + item.icon + ' flex-shrink-0'" style="font-size:1.1rem"></i>
              @if (sidebarOpen()) {
                <span class="text-sm font-medium truncate">{{ item.label }}</span>
                @if (item.badge) {
                  <span class="ml-auto bg-primary-500 text-white text-xs rounded-full px-2 py-0.5">{{ item.badge }}</span>
                }
              }
            </a>
          }
        </nav>

        <!-- User profile -->
        <div class="border-t border-gray-100 p-3">
          <div class="flex items-center gap-3">
            <p-avatar
              [label]="userInitials()"
              styleClass="bg-primary-100 text-primary-700 font-semibold flex-shrink-0"
              size="normal"
              shape="circle"
            />
            @if (sidebarOpen()) {
              <div class="flex-1 overflow-hidden">
                <div class="text-sm font-medium text-gray-900 truncate">{{ userName() }}</div>
                <div class="text-xs text-gray-400 truncate">{{ userRole() }}</div>
              </div>
              <button
                pButton
                icon="pi pi-sign-out"
                class="p-button-text p-button-sm p-button-rounded text-gray-400 hover:text-red-500"
                pTooltip="Sign out"
                tooltipPosition="top"
                (click)="logout()"
              ></button>
            }
          </div>
        </div>
      </aside>

      <!-- Main content -->
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">

        <!-- Top header -->
        <header class="flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
          <button
            pButton
            [icon]="sidebarOpen() ? 'pi pi-times' : 'pi pi-bars'"
            class="p-button-text p-button-sm p-button-rounded text-gray-600"
            (click)="toggleSidebar()"
          ></button>

          <div class="flex-1">
            <h1 class="text-base font-semibold text-gray-900">{{ currentPageTitle() }}</h1>
          </div>

          <!-- Header actions -->
          <div class="flex items-center gap-2">
            <button
              pButton
              icon="pi pi-bell"
              class="p-button-text p-button-sm p-button-rounded text-gray-600 relative"
              pBadge
              value="3"
              pTooltip="Notifications"
            ></button>
            <button
              pButton
              icon="pi pi-cog"
              class="p-button-text p-button-sm p-button-rounded text-gray-600"
              routerLink="/settings"
              pTooltip="Settings"
            ></button>
            <p-avatar
              [label]="userInitials()"
              styleClass="bg-primary-500 text-white font-semibold cursor-pointer"
              size="normal"
              shape="circle"
              pTooltip="{{ userName() }}"
            />
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
export class MainLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly apiService = inject(ApiService);

  sidebarOpen = signal(true);
  isMobile = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'pi-home', route: '/dashboard' },
    { label: 'Products', icon: 'pi-box', route: '/products' },
    { label: 'Orders', icon: 'pi-shopping-cart', route: '/orders' },
    { label: 'Inventory', icon: 'pi-warehouse', route: '/inventory' },
    { label: 'Payments', icon: 'pi-credit-card', route: '/payments' },
    { label: 'Deliveries', icon: 'pi-truck', route: '/deliveries' },
    { label: 'Customers', icon: 'pi-users', route: '/customers' },
    { label: 'Campaigns', icon: 'pi-megaphone', route: '/campaigns' },
    { label: 'Conversations', icon: 'pi-comments', route: '/conversations' },
    { label: 'WhatsApp Catalog', icon: 'pi-shopping-bag', route: '/catalog-management' },
    { label: 'Workflow Builder', icon: 'pi-sitemap', route: '/workflow-builder' },
    { label: 'Settings', icon: 'pi-cog', route: '/settings' },
  ];

  readonly currentUser = this.authService.currentUser;

  userName = computed(() => {
    const u = this.currentUser();
    return u?.name ?? 'User';
  });

  userInitials = computed(() => {
    const u = this.currentUser();
    if (!u?.name) return 'U';
    const parts = u.name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return u.name[0].toUpperCase();
  });

  userRole = computed(() => {
    const roles: Record<string, string> = {
      owner: 'Owner',
      seller: 'Seller',
      staff: 'Staff',
      admin: 'Admin',
      support: 'Support',
    };
    return roles[this.currentUser()?.role ?? ''] ?? 'User';
  });

  tenantName = signal('My Store');

  currentPageTitle = computed(() => {
    const url = this.router.url;
    const item = this.navItems.find(n => url.startsWith(n.route));
    return item?.label ?? 'Dashboard';
  });

  ngOnInit() {
    this.checkMobile();
    window.addEventListener('resize', () => this.checkMobile());
    this.apiService.get<any>('/orders/dashboard/counts').subscribe({
      next: (counts) => {
        this.navItems = this.navItems.map(item => {
          if (item.route === '/payments') return { ...item, badge: counts.pendingPayments || undefined };
          if (item.route === '/conversations') return { ...item, badge: counts.openConversations || undefined };
          if (item.route === '/orders') return { ...item, badge: counts.pendingOrders || undefined };
          if (item.route === '/deliveries') return { ...item, badge: counts.pendingDeliveries || undefined };
          return item;
        });
      },
    });
  }

  private checkMobile() {
    this.isMobile.set(window.innerWidth < 1024);
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    } else {
      this.sidebarOpen.set(true);
    }
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }

  onNavClick() {
    if (this.isMobile()) this.closeSidebar();
  }

  logout() {
    this.authService.logout().subscribe();
  }
}
