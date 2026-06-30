import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
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
import { ErpAccessService } from '../core/services/erp-access.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
  featureKey?: string;
  /** Base item that the ERP version supersedes — hidden when the `erp` feature is on. */
  hideWhenErp?: boolean;
  /** Upsell teaser shown only when the `erp` feature is OFF. */
  erpTeaser?: boolean;
  /** Single read-only-archive entry shown only when the tenant is downgraded. */
  erpReadOnlyEntry?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
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

        <!-- Navigation (grouped into sections) -->
        <nav class="flex-1 overflow-y-auto py-3 px-2">
          @for (section of visibleSections(); track section.title) {
            @if (sidebarOpen()) {
              <p class="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{{ section.title }}</p>
            } @else {
              <div class="my-2 mx-3 border-t border-gray-100"></div>
            }
            @for (item of section.items; track item.route) {
              @if (item.erpTeaser) {
                <!-- ERP upsell teaser -->
                <a
                  [routerLink]="item.route"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-amber-700 bg-amber-50 font-medium hover:bg-amber-100 transition-colors no-underline"
                  [pTooltip]="!sidebarOpen() ? item.label : ''" tooltipPosition="right" (click)="onNavClick()"
                >
                  <i [class]="'pi ' + item.icon + ' flex-shrink-0'" style="font-size:1.1rem"></i>
                  @if (sidebarOpen()) { <span class="text-sm font-medium truncate">{{ item.label }}</span> }
                </a>
              } @else if (!item.featureKey || item.featureKey === 'erp' || featureService.hasFeature(item.featureKey)) {
                <!-- Unlocked feature (ERP items only reach the template once erpAccess says they're accessible, so they are never shown locked) -->
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
                    @if (badges()[item.route]) {
                      <span class="ml-auto bg-primary-500 text-white text-xs rounded-full px-2 py-0.5">{{ badges()[item.route] }}</span>
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
              (click)="userMenu.toggle($event)"
              pTooltip="{{ userName() }}"
              tooltipPosition="bottom"
            />
            <p-popover #userMenu>
              <div class="w-56">
                <div class="flex items-center gap-3 px-1 pb-3 mb-2 border-b border-gray-100">
                  <p-avatar [label]="userInitials()" styleClass="bg-primary-100 text-primary-700 font-semibold" shape="circle" />
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-gray-900 truncate">{{ userName() }}</div>
                    <div class="text-xs text-gray-400 truncate">{{ userRole() }}</div>
                  </div>
                </div>
                <a
                  routerLink="/settings"
                  (click)="userMenu.hide()"
                  class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 no-underline text-gray-700 transition-colors"
                >
                  <i class="pi pi-cog text-gray-400"></i><span class="text-sm">Settings</span>
                </a>
                <button
                  (click)="userMenu.hide(); logout()"
                  class="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors border-0 bg-transparent cursor-pointer"
                >
                  <i class="pi pi-sign-out"></i><span class="text-sm">Sign out</span>
                </button>
              </div>
            </p-popover>
          </div>
        </header>

        <!-- Page content (block flow; scrolls with the document) -->
        <main class="bg-gray-50">
          @if (erpReadOnlyBanner()) {
            <div class="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
              <i class="pi pi-lock"></i>
              <span><b>Read-only.</b> Your plan no longer includes ERP — your data is preserved for viewing &amp; export.</span>
              <a routerLink="/settings/upgrade" class="ml-auto font-semibold text-amber-900 underline">Upgrade to edit</a>
            </div>
          }
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
  readonly erpAccess = inject(ErpAccessService);

  sidebarOpen = signal(true);
  isMobile = signal(false);

  /**
   * Sectioned navigation. Visibility rules (see `visibleSections`):
   *  - `hideWhenErp` base items are hidden when the `erp` feature is on (the ERP
   *    version supersedes them and reads the same tenant table — e.g. Invoices,
   *    Customers), so the user never sees two tabs for one concept.
   *  - ERP items (featureKey starts with `erp`) are hidden entirely when ERP is
   *    off; a single "Unlock Business Suite" teaser is shown instead.
   *  - Non-ERP premium items render as locked upsells when their feature is off.
   */
  navSections: NavSection[] = [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', icon: 'pi-home', route: '/dashboard' },
        { label: 'Business Overview', icon: 'pi-chart-bar', route: '/erp/dashboard', featureKey: 'erp' },
        { label: 'Reports & Analytics', icon: 'pi-chart-line', route: '/erp/reports', featureKey: 'erp' },
        // Downgraded tenants: a single entry to view & download their preserved ERP data.
        { label: 'Download My Data', icon: 'pi-download', route: '/erp/export', erpReadOnlyEntry: true },
        { label: 'Unlock Business Suite', icon: 'pi-star', route: '/settings/upgrade', erpTeaser: true },
      ],
    },
    {
      title: 'Sales',
      items: [
        { label: 'Point of Sale', icon: 'pi-shopping-cart', route: '/erp/pos', featureKey: 'erp' },
        { label: 'Orders', icon: 'pi-shopping-cart', route: '/orders' },
        // Base Invoices (GST/order docs) — superseded by ERP Invoices (same `invoices` table).
        { label: 'Invoices', icon: 'pi-receipt', route: '/invoices', hideWhenErp: true },
        { label: 'Invoices', icon: 'pi-receipt', route: '/erp/invoices', featureKey: 'erp' },
        { label: 'Recurring Invoices', icon: 'pi-replay', route: '/erp/recurring', featureKey: 'erp' },
        { label: 'Quotes', icon: 'pi-file-edit', route: '/quotes', featureKey: 'quotes' },
        { label: 'Offers', icon: 'pi-tags', route: '/erp/offers', featureKey: 'erp' },
        { label: 'Credit Notes', icon: 'pi-reply', route: '/erp/credit-notes', featureKey: 'erp' },
        { label: 'E-Way Bills', icon: 'pi-truck', route: '/erp/eway-bills', featureKey: 'erp' },
      ],
    },
    {
      title: 'Purchases',
      items: [
        { label: 'Purchase Orders', icon: 'pi-shopping-bag', route: '/erp/purchase-orders', featureKey: 'erp' },
        { label: 'Suppliers', icon: 'pi-building', route: '/erp/suppliers', featureKey: 'erp' },
        { label: 'Expenses', icon: 'pi-wallet', route: '/erp/expenses', featureKey: 'erp' },
        { label: 'Debit Notes', icon: 'pi-undo', route: '/erp/debit-notes', featureKey: 'erp' },
      ],
    },
    {
      title: 'Customers & CRM',
      items: [
        // Base Customers — superseded by ERP Clients (same `customers` table).
        { label: 'Customers', icon: 'pi-users', route: '/customers', featureKey: 'customers', hideWhenErp: true },
        { label: 'Customers', icon: 'pi-users', route: '/erp/clients', featureKey: 'erp' },
        { label: 'Companies', icon: 'pi-building', route: '/erp/companies', featureKey: 'erp' },
        { label: 'People', icon: 'pi-user', route: '/erp/people', featureKey: 'erp' },
        { label: 'Leads', icon: 'pi-filter', route: '/erp/leads', featureKey: 'erp' },
      ],
    },
    {
      title: 'Catalog & Inventory',
      items: [
        { label: 'Products', icon: 'pi-box', route: '/products' },
        { label: 'Categories & Brands', icon: 'pi-tags', route: '/catalog-taxonomy' },
        { label: 'Inventory', icon: 'pi-warehouse', route: '/inventory' },
        { label: 'Warehouse Stock', icon: 'pi-building-columns', route: '/erp/stock', featureKey: 'erp' },
        { label: 'Batch & Serial', icon: 'pi-qrcode', route: '/erp/batches', featureKey: 'erp' },
        { label: 'Schemes & Offers', icon: 'pi-percentage', route: '/schemes' },
      ],
    },
    {
      title: 'Accounting',
      items: [
        { label: 'Payments', icon: 'pi-credit-card', route: '/payments' },
        { label: 'Cash & Bank', icon: 'pi-wallet', route: '/erp/bank-accounts', featureKey: 'erp' },
        { label: 'Payment Modes', icon: 'pi-money-bill', route: '/erp/payment-modes', featureKey: 'erp' },
        { label: 'Tax Rates', icon: 'pi-percentage', route: '/erp/tax-rates', featureKey: 'erp' },
        { label: 'Currencies', icon: 'pi-dollar', route: '/erp/currencies', featureKey: 'erp' },
      ],
    },
    {
      title: 'Marketing & WhatsApp',
      items: [
        { label: 'Campaigns', icon: 'pi-megaphone', route: '/campaigns', featureKey: 'campaigns' },
        { label: 'Conversations', icon: 'pi-comments', route: '/conversations', featureKey: 'conversations' },
        { label: 'WhatsApp Catalog', icon: 'pi-shopping-bag', route: '/catalog-management', featureKey: 'whatsappCatalog' },
        { label: 'Workflow Builder', icon: 'pi-sitemap', route: '/workflow-builder', featureKey: 'workflowBuilder' },
      ],
    },
    {
      title: 'Operations & HR',
      items: [
        { label: 'Deliveries', icon: 'pi-truck', route: '/deliveries', featureKey: 'deliveries' },
        { label: 'Employees', icon: 'pi-id-card', route: '/erp/employees', featureKey: 'erp' },
        { label: 'Branches', icon: 'pi-sitemap', route: '/erp/branches', featureKey: 'erp' },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'API Keys', icon: 'pi-key', route: '/erp/api-keys', featureKey: 'erp' },
        { label: 'Export Data', icon: 'pi-download', route: '/erp/export', featureKey: 'erp' },
        { label: 'Business Settings', icon: 'pi-sliders-h', route: '/erp/settings', featureKey: 'erp' },
        { label: 'App Settings', icon: 'pi-cog', route: '/settings' },
      ],
    },
  ];

  /** Badge counts keyed by route (set from the order counts endpoint). */
  badges = signal<Record<string, number>>({});

  /** Sections with per-item visibility applied; empty sections dropped. */
  visibleSections = computed<NavSection[]>(() => {
    // Until live /erp/status has resolved, treat ERP as "unknown" and render NO
    // ERP-conditional item. This prevents the first-paint flash where ERP items
    // briefly appeared (locked/teaser) before status loaded and then vanished on
    // refresh. Base items stay visible throughout (erpFull is false while loading).
    const ready = this.erpAccess.ready();
    const erpFull = ready && this.erpAccess.enabled();      // plan includes ERP → full access
    const erpReadOnly = ready && this.erpAccess.readOnly(); // downgraded but data preserved → read-only
    return this.navSections
      .map((s) => ({
        title: s.title,
        items: s.items.filter((it) => {
          // Single "ERP Data (read-only)" entry, only when downgraded.
          if (it.erpReadOnlyEntry) return erpReadOnly;
          // Upsell teaser only when status is known AND the tenant has no ERP at all.
          if (it.erpTeaser) return ready && !erpFull && !erpReadOnly;
          // Base item is superseded by its ERP version only when ERP is FULLY enabled.
          if (it.hideWhenErp && erpFull) return false;
          // Individual ERP items show only with full ERP (hidden — not locked — otherwise).
          if (it.featureKey === 'erp') return erpFull;
          return true; // non-ERP items: featureKey gating handled in template
        }),
      }))
      .filter((s) => s.items.length > 0);
  });

  /** Current URL, kept reactive via router events (see ngOnInit). */
  currentUrl = signal('');
  /** Show a read-only banner across ERP screens when the tenant is downgraded. */
  erpReadOnlyBanner = computed(() => this.erpAccess.readOnly() && this.currentUrl().startsWith('/erp'));

  private get allItems(): NavItem[] {
    return this.navSections.flatMap((s) => s.items);
  }

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
    // Most-specific (longest) matching route wins, so /erp/invoices beats /erp.
    const match = this.allItems
      .filter((n) => url.startsWith(n.route))
      .sort((a, b) => b.route.length - a.route.length)[0];
    return match?.label ?? 'Dashboard';
  });

  ngOnInit() {
    this.checkMobile();
    window.addEventListener('resize', () => this.checkMobile());
    this.erpAccess.load();
    this.currentUrl.set(this.router.url);
    this.router.events.subscribe((e) => { if (e instanceof NavigationEnd) this.currentUrl.set(e.urlAfterRedirects); });
    this.apiService.get<any>('/orders/dashboard/counts').subscribe({
      next: (counts) => {
        this.badges.set({
          '/payments': counts.pendingPayments || 0,
          '/conversations': counts.openConversations || 0,
          '/orders': counts.pendingOrders || 0,
          '/deliveries': counts.pendingDeliveries || 0,
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
