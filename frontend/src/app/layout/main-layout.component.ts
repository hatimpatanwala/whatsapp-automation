import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import { PopoverModule } from 'primeng/popover';
import { AuthService } from '../core/services/auth.service';
import { ApiService } from '../core/services/api.service';
import { FeatureService } from '../core/services/feature.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
  featureKey?: string;
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
    PopoverModule,
  ],
  template: `
    <div class="flex min-h-screen bg-gray-50">

      <!-- Mobile overlay -->
      @if (sidebarOpen() && isMobile()) {
        <div
          class="fixed inset-0 bg-black/50 z-20 lg:hidden"
          (click)="closeSidebar()"
        ></div>
      }

      <!-- Sidebar (sticky on desktop so content scrolls at the document level) -->
      <aside
        class="fixed lg:sticky lg:top-0 self-start z-30 h-screen flex flex-col overflow-hidden bg-white border-r border-gray-200 transition-all duration-300 ease-in-out"
        [class.w-64]="sidebarOpen() || isMobile()"
        [class.w-16]="!sidebarOpen() && !isMobile()"
        [class.-translate-x-full]="!sidebarOpen() && isMobile()"
        [class.translate-x-0]="sidebarOpen() || !isMobile()"
        [class.shadow-2xl]="sidebarOpen() && isMobile()"
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
            @if (!item.featureKey || featureService.hasFeature(item.featureKey)) {
              <!-- Unlocked feature -->
              <a
                [routerLink]="item.route"
                routerLinkActive="bg-primary-50 text-primary-700 font-semibold shadow-sm"
                [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-gray-500 font-medium hover:bg-gray-100 hover:text-gray-900 transition-all duration-150 no-underline group"
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
            } @else {
              <!-- Locked feature -->
              <a
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-gray-400 opacity-60 hover:bg-gray-50 transition-colors duration-150 no-underline cursor-pointer"
                [pTooltip]="(!sidebarOpen() ? item.label + ' — ' : '') + 'Upgrade to unlock'"
                tooltipPosition="right"
                (click)="onLockedFeatureClick(item)"
              >
                <i [class]="'pi ' + item.icon + ' flex-shrink-0'" style="font-size:1.1rem"></i>
                @if (sidebarOpen()) {
                  <span class="text-sm font-medium truncate">{{ item.label }}</span>
                  <i class="pi pi-lock ml-auto text-xs text-gray-400"></i>
                }
              </a>
            }
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

      <!-- Main content column (plain block flow so the document grows with the
           page content and scrolls fully — no inner flex height constraint) -->
      <div class="flex-1 min-w-0">

        <!-- Top header (sticky) -->
        <header class="sticky top-0 z-20 flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
          <button
            pButton
            icon="pi pi-bars"
            class="p-button-text p-button-sm p-button-rounded text-gray-500"
            (click)="toggleSidebar()"
            pTooltip="Toggle menu"
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
              [value]="notifTotal().toString()"
              [badgeDisabled]="notifTotal() === 0"
              (click)="notifPanel.toggle($event)"
              pTooltip="Notifications"
              tooltipPosition="bottom"
            ></button>
            <p-popover #notifPanel>
              <div class="w-72">
                <div class="flex items-center justify-between px-1 pb-2 mb-1 border-b border-gray-100">
                  <span class="text-sm font-semibold text-gray-900">Notifications</span>
                  @if (notifTotal() > 0) {
                    <span class="text-xs text-gray-400">{{ notifTotal() }} pending</span>
                  }
                </div>
                @if (notifications().length) {
                  @for (n of notifications(); track n.route) {
                    <a
                      [routerLink]="n.route"
                      (click)="notifPanel.hide()"
                      class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 no-underline transition-colors"
                    >
                      <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 text-primary-600 shrink-0">
                        <i [class]="'pi ' + n.icon"></i>
                      </span>
                      <span class="flex-1 text-sm text-gray-700">{{ n.label }}</span>
                      <span class="text-xs font-semibold bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 tabular-nums">{{ n.count }}</span>
                    </a>
                  }
                } @else {
                  <div class="py-8 text-center">
                    <i class="pi pi-check-circle text-green-400" style="font-size:1.75rem"></i>
                    <p class="text-sm text-gray-500 mt-2">You're all caught up</p>
                  </div>
                }
              </div>
            </p-popover>
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

        <!-- Page content (block flow; scrolls with the document) -->
        <main class="bg-gray-50">
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
  readonly featureService = inject(FeatureService);

  sidebarOpen = signal(true);
  isMobile = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'pi-home', route: '/dashboard' },
    { label: 'Products', icon: 'pi-box', route: '/products' },
    { label: 'Categories & Brands', icon: 'pi-tags', route: '/catalog-taxonomy' },
    { label: 'Orders', icon: 'pi-shopping-cart', route: '/orders' },
    { label: 'Inventory', icon: 'pi-warehouse', route: '/inventory' },
    { label: 'Payments', icon: 'pi-credit-card', route: '/payments' },
    { label: 'Deliveries', icon: 'pi-truck', route: '/deliveries', featureKey: 'deliveries' },
    { label: 'Customers', icon: 'pi-users', route: '/customers', featureKey: 'customers' },
    { label: 'Schemes & Offers', icon: 'pi-percentage', route: '/schemes' },
    { label: 'Campaigns', icon: 'pi-megaphone', route: '/campaigns', featureKey: 'campaigns' },
    { label: 'Conversations', icon: 'pi-comments', route: '/conversations', featureKey: 'conversations' },
    { label: 'Quotes', icon: 'pi-file-edit', route: '/quotes', featureKey: 'quotes' },
    { label: 'WhatsApp Catalog', icon: 'pi-shopping-bag', route: '/catalog-management', featureKey: 'whatsappCatalog' },
    { label: 'Workflow Builder', icon: 'pi-sitemap', route: '/workflow-builder', featureKey: 'workflowBuilder' },
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

  notifications = signal<{ label: string; icon: string; route: string; count: number }[]>([]);
  notifTotal = computed(() => this.notifications().reduce((sum, n) => sum + n.count, 0));

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
        this.notifications.set([
          { label: 'Pending orders', icon: 'pi-shopping-cart', route: '/orders', count: counts.pendingOrders || 0 },
          { label: 'Open conversations', icon: 'pi-comments', route: '/conversations', count: counts.openConversations || 0 },
          { label: 'Payments to verify', icon: 'pi-credit-card', route: '/payments', count: counts.pendingPayments || 0 },
          { label: 'Pending deliveries', icon: 'pi-truck', route: '/deliveries', count: counts.pendingDeliveries || 0 },
        ].filter(n => n.count > 0));
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

  onLockedFeatureClick(item: NavItem) {
    if (this.isMobile()) this.closeSidebar();
    this.router.navigate(['/settings/upgrade'], {
      queryParams: { feature: item.featureKey },
    });
  }

  logout() {
    this.authService.logout().subscribe();
  }
}
