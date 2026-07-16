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
import { PermissionService } from '../core/services/permission.service';
import { PushRegistrationService } from '../core/services/push-registration.service';
import { environment } from '../../environments/environment';

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
  /** Gated by a LIVE plan feature from /erp/status, independent of the ERP master
   *  switch (e.g. `sfa` salesman app works with ERP off; `erpOffline` desktop app). */
  featureLive?: string;
  /** RBAC feature key — item is hidden when the user's role has no `read` on it. */
  perm?: string;
  /** WhatsApp-only item — hidden in the "ERP" (no-WhatsApp) mobile build variant. */
  wa?: boolean;
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
              [value]="unread().toString()"
              [badgeDisabled]="unread() === 0"
              (click)="notifPanel.toggle($event); loadFeed()"
              pTooltip="Notifications"
              tooltipPosition="bottom"
            ></button>
            <p-popover #notifPanel>
              <div class="w-80 max-h-[70vh] overflow-y-auto">
                <div class="flex items-center justify-between px-1 pb-2 mb-1 border-b border-gray-100">
                  <span class="text-sm font-semibold text-gray-900">Notifications</span>
                  @if (unread() > 0) {
                    <button class="text-xs text-primary-600 font-semibold hover:underline" (click)="markAllRead()">Mark all read</button>
                  }
                </div>
                @if (feed().length) {
                  @for (n of feed(); track n.id) {
                    <a
                      [routerLink]="n.route"
                      (click)="onNotifClick(n); notifPanel.hide()"
                      class="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 no-underline transition-colors"
                      [class.bg-primary-50]="!n.is_read"
                    >
                      <span class="flex items-center justify-center w-9 h-9 rounded-lg shrink-0" [class]="notifIconClass(n.type)">
                        <i [class]="'pi ' + notifIcon(n.type)"></i>
                      </span>
                      <span class="flex-1 min-w-0">
                        <span class="block text-sm font-medium text-gray-800 truncate">{{ n.title }}</span>
                        @if (n.body) { <span class="block text-xs text-gray-500 truncate">{{ n.body }}</span> }
                        <span class="block text-[11px] text-gray-400">{{ n.created_at | date:'short' }}</span>
                      </span>
                      @if (!n.is_read) { <span class="w-2 h-2 rounded-full bg-primary-500 shrink-0 mt-1.5"></span> }
                    </a>
                  }
                } @else {
                  <div class="py-8 text-center">
                    <i class="pi pi-check-circle text-green-400" style="font-size:1.75rem"></i>
                    <p class="text-sm text-gray-500 mt-2">No notifications yet</p>
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
  readonly permissions = inject(PermissionService);
  private readonly push = inject(PushRegistrationService);

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
        // Back into the keyboard-first ERP chrome (Miracle view) — the reverse of
        // the ERP status bar's "Web Portal ⤴" link.
        { label: 'ERP (Keyboard view)', icon: 'pi-table', route: '/home', featureKey: 'erp' },
        { label: 'Business Overview', icon: 'pi-chart-bar', route: '/erp/dashboard', featureKey: 'erp', perm: 'business_overview' },
        { label: 'Reports & Analytics', icon: 'pi-chart-line', route: '/erp/reports', featureKey: 'erp', perm: 'reports' },
        // Premium BI — visible to every ERP tenant; the page shows the upgrade
        // lock until the `premiumInsights` plan feature is enabled.
        { label: 'AI Insights Pro', icon: 'pi-sparkles', route: '/erp/intel', featureKey: 'erp', perm: 'reports' },
        // Downgraded tenants: a single entry to view & download their preserved ERP data.
        { label: 'Download My Data', icon: 'pi-download', route: '/erp/export', erpReadOnlyEntry: true },
        { label: 'Unlock Business Suite', icon: 'pi-star', route: '/settings/upgrade', erpTeaser: true },
      ],
    },
    {
      title: 'Sales',
      items: [
        { label: 'Point of Sale', icon: 'pi-shopping-cart', route: '/erp/pos', featureKey: 'erp', perm: 'invoices' },
        { label: 'Orders', icon: 'pi-shopping-cart', route: '/orders', perm: 'orders' },
        // Salesman field app (SFA) — a standalone module: works even with ERP off.
        // Field Sales = the single manager hub (register salesmen + reports, beats,
        // targets, visits, follow-ups); My Field App = the salesman's own workspace.
        { label: 'Field Sales', icon: 'pi-chart-bar', route: '/field-sales', featureLive: 'sfa', perm: 'salesmen' },
        { label: 'My Field App', icon: 'pi-briefcase', route: '/my-sales', featureLive: 'sfa', perm: 'salesmen' },
        // Base Invoices (GST/order docs) — superseded by ERP Invoices (same `invoices` table).
        { label: 'Invoices', icon: 'pi-receipt', route: '/invoices', hideWhenErp: true, perm: 'invoices' },
        { label: 'Invoices', icon: 'pi-receipt', route: '/erp/invoices', featureKey: 'erp', perm: 'invoices' },
        { label: 'Recurring Invoices', icon: 'pi-replay', route: '/erp/recurring', featureKey: 'erp', perm: 'invoices' },
        { label: 'Quotes', icon: 'pi-file-edit', route: '/quotes', featureKey: 'quotes', perm: 'quotes' },
        { label: 'Offers', icon: 'pi-tags', route: '/erp/offers', featureKey: 'erp', perm: 'schemes' },
        { label: 'Credit Notes', icon: 'pi-reply', route: '/erp/credit-notes', featureKey: 'erp', perm: 'invoices' },
        { label: 'E-Way Bills', icon: 'pi-truck', route: '/erp/eway-bills', featureKey: 'erp', perm: 'invoices' },
      ],
    },
    {
      title: 'Purchases',
      items: [
        { label: 'Purchase Orders', icon: 'pi-shopping-bag', route: '/erp/purchase-orders', featureKey: 'erp', perm: 'purchases' },
        { label: 'Suppliers', icon: 'pi-building', route: '/erp/suppliers', featureKey: 'erp', perm: 'suppliers' },
        { label: 'Expenses', icon: 'pi-wallet', route: '/erp/expenses', featureKey: 'erp', perm: 'purchases' },
        { label: 'Debit Notes', icon: 'pi-undo', route: '/erp/debit-notes', featureKey: 'erp', perm: 'purchases' },
      ],
    },
    {
      title: 'Customers & CRM',
      items: [
        // Base Customers — superseded by ERP Clients (same `customers` table).
        { label: 'Customers', icon: 'pi-users', route: '/customers', featureKey: 'customers', hideWhenErp: true, perm: 'customers' },
        { label: 'Customers', icon: 'pi-users', route: '/erp/clients', featureKey: 'erp', perm: 'customers' },
        { label: 'Companies', icon: 'pi-building', route: '/erp/companies', featureKey: 'erp', perm: 'customers' },
        { label: 'People', icon: 'pi-user', route: '/erp/people', featureKey: 'erp', perm: 'customers' },
        { label: 'Leads', icon: 'pi-filter', route: '/erp/leads', featureKey: 'erp', perm: 'customers' },
      ],
    },
    {
      title: 'Catalog & Inventory',
      items: [
        { label: 'Products', icon: 'pi-box', route: '/products', perm: 'products' },
        { label: 'Categories & Brands', icon: 'pi-tags', route: '/catalog-taxonomy', perm: 'products' },
        { label: 'Tax Rates', icon: 'pi-percentage', route: '/tax-rates', perm: 'products' },
        { label: 'Inventory', icon: 'pi-warehouse', route: '/inventory', perm: 'inventory' },
        { label: 'Warehouse Stock', icon: 'pi-building-columns', route: '/erp/stock', featureKey: 'erp', perm: 'inventory' },
        { label: 'Batch & Serial', icon: 'pi-qrcode', route: '/erp/batches', featureKey: 'erp', perm: 'inventory' },
        { label: 'Schemes & Offers', icon: 'pi-percentage', route: '/schemes', perm: 'schemes' },
      ],
    },
    {
      title: 'Accounting',
      items: [
        { label: 'Ledgers', icon: 'pi-book', route: '/ledgers', featureKey: 'erp', perm: 'accounting' },
        { label: 'Profit & Loss', icon: 'pi-chart-line', route: '/accounting/reports/pnl', featureKey: 'erp', perm: 'accounting' },
        { label: 'Trial Balance', icon: 'pi-list', route: '/accounting/reports/trial-balance', featureKey: 'erp', perm: 'accounting' },
        { label: 'Balance Sheet', icon: 'pi-book', route: '/accounting/reports/balance-sheet', featureKey: 'erp', perm: 'accounting' },
        { label: 'Payments', icon: 'pi-credit-card', route: '/payments', perm: 'payments' },
        { label: 'Cash & Bank', icon: 'pi-wallet', route: '/erp/bank-accounts', featureKey: 'erp', perm: 'payments' },
        { label: 'Payment Modes', icon: 'pi-money-bill', route: '/erp/payment-modes', featureKey: 'erp', perm: 'payments' },
        { label: 'Currencies', icon: 'pi-dollar', route: '/erp/currencies', featureKey: 'erp', perm: 'accounting' },
      ],
    },
    {
      title: 'Marketing & WhatsApp',
      items: [
        { label: 'Campaigns', icon: 'pi-megaphone', route: '/campaigns', featureKey: 'campaigns', wa: true },
        { label: 'Conversations', icon: 'pi-comments', route: '/conversations', featureKey: 'conversations', wa: true },
        { label: 'WhatsApp Catalog', icon: 'pi-shopping-bag', route: '/catalog-management', featureKey: 'whatsappCatalog', wa: true },
        { label: 'WhatsApp Connect', icon: 'pi-qrcode', route: '/whatsapp-connect', featureKey: 'whatsappSuite', wa: true },
        { label: 'Workflow Builder', icon: 'pi-sitemap', route: '/workflow-builder', featureKey: 'workflowBuilder', wa: true },
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
        // Team & Roles (RBAC) — employees + per-feature permissions.
        { label: 'Team & Roles', icon: 'pi-users', route: '/team', perm: 'employees' },
        { label: 'Notifications', icon: 'pi-bell', route: '/notifications' },
        // Offline desktop app — shown ONLY to tenants licensed for it (erpOffline).
        // Online-only plans never see this entry.
        { label: 'Desktop App (Offline)', icon: 'pi-desktop', route: '/desktop-app', featureLive: 'erpOffline' },
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
    const planErp = ready && this.erpAccess.enabled();      // plan includes ERP
    const erpReadOnly = ready && this.erpAccess.readOnly(); // downgraded but data preserved → read-only
    // The ERP suite is shown only when the PLAN has ERP AND the user's ROLE has
    // ERP access. A field-sales/SFA role (erp:'none') falls back to the base
    // commerce views instead — no ERP screens. (Assume access until permissions
    // resolve to avoid a flash for the common owner case.)
    const roleErp = !this.permissions.ready() || this.permissions.can('erp', 'read');
    const erpFull = planErp && roleErp;
    // Master gate for the WhatsApp suite: the entire 'Marketing & WhatsApp'
    // section is dropped when the tenant lacks `whatsappSuite`. (Per-item
    // featureKey gating still applies when the suite IS enabled.)
    const hasWaSuite = this.featureService.hasFeature('whatsappSuite');
    return this.navSections
      .map((s) => ({
        title: s.title,
        items: s.items.filter((it) => {
          // WhatsApp suite master gate: drop the whole 'Marketing & WhatsApp'
          // section when the tenant is not entitled (empty section is then
          // filtered out below, so no orphan header renders).
          if (s.title === 'Marketing & WhatsApp' && !hasWaSuite) return false;
          // "Without WhatsApp" app variant (ERP build): hide WhatsApp-only items.
          if (it.wa && !environment.whatsapp) return false;
          // Single "ERP Data (read-only)" entry, only when downgraded.
          if (it.erpReadOnlyEntry) return erpReadOnly;
          // Upsell teaser only when status is known AND the tenant has no ERP at all.
          if (it.erpTeaser) return ready && !planErp && !erpReadOnly;
          // Base item is superseded by its ERP version only when the USER sees ERP.
          if (it.hideWhenErp && erpFull) return false;
          // Individual ERP items show only when the user has ERP (plan + role).
          if (it.featureKey === 'erp') return erpFull;
          // Live-feature items (salesman app, offline desktop) — shown only when the
          // tenant is actually entitled, independent of the ERP master switch.
          if (it.featureLive) return ready && this.erpAccess.has(it.featureLive);
          // RBAC: hide anything the user's role can't even read. Until permissions
          // resolve, don't hide (avoids a flash); owner passes everything.
          if (it.perm && this.permissions.ready() && !this.permissions.can(it.perm, 'read')) return false;
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

  // Event-driven notification feed (new orders / quotes / customers / …).
  feed = signal<any[]>([]);
  unread = signal(0);
  private feedTimer: any = null;

  loadFeed(): void {
    this.apiService.get<any>('/notifications').subscribe({
      next: (r) => { const d = r?.data ?? r; this.feed.set(d?.items ?? []); this.unread.set(d?.unread ?? 0); },
      error: () => {},
    });
  }
  markAllRead(): void {
    this.apiService.post<any>('/notifications/read', {}).subscribe({
      next: () => { this.feed.update((f) => f.map((n) => ({ ...n, is_read: true }))); this.unread.set(0); },
    });
  }
  onNotifClick(n: any): void {
    if (n.is_read) return;
    this.apiService.post<any>('/notifications/read', { id: n.id }).subscribe({ next: () => {} });
    n.is_read = true;
    this.unread.update((u) => Math.max(0, u - 1));
  }
  notifIcon(type: string): string {
    return ({ order: 'pi-shopping-cart', quote: 'pi-file-edit', customer: 'pi-user-plus', payment: 'pi-credit-card', invoice: 'pi-receipt' } as any)[type] || 'pi-bell';
  }
  notifIconClass(type: string): string {
    return ({ order: 'bg-blue-50 text-blue-600', quote: 'bg-purple-50 text-purple-600', customer: 'bg-green-50 text-green-600', payment: 'bg-emerald-50 text-emerald-600', invoice: 'bg-amber-50 text-amber-600' } as any)[type] || 'bg-gray-100 text-gray-600';
  }

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
    this.permissions.load();
    // Register for push on the native app (no-op on the web).
    void this.push.init();
    this.currentUrl.set(this.router.url);
    this.router.events.subscribe((e) => { if (e instanceof NavigationEnd) this.currentUrl.set(e.urlAfterRedirects); });
    this.loadFeed();
    this.feedTimer = setInterval(() => this.loadFeed(), 45000);
    this.apiService.get<any>('/orders/dashboard/counts').subscribe({
      next: (counts) => {
        this.badges.set({
          '/payments': counts.pendingPayments || 0,
          '/conversations': counts.openConversations || 0,
          '/orders': counts.pendingOrders || 0,
          '/deliveries': counts.pendingDeliveries || 0,
        });
        this.notifications.set([
          { label: 'Pending orders', icon: 'pi-shopping-cart', route: '/orders', count: counts.pendingOrders || 0, perm: 'orders' },
          { label: 'Open conversations', icon: 'pi-comments', route: '/conversations', count: counts.openConversations || 0, wa: true },
          { label: 'Payments to verify', icon: 'pi-credit-card', route: '/payments', count: counts.pendingPayments || 0, perm: 'payments' },
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
