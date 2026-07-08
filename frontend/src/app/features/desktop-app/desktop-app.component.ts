import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ErpAccessService } from '../../core/services/erp-access.service';

/**
 * Offline desktop-app landing page. Advertised in the portal nav ONLY when the
 * tenant's plan includes the `erpOffline` entitlement (main-layout gates the
 * item). If someone deep-links here without the entitlement we bounce them back
 * — the offline app is a paid add-on and the online version is always available.
 */
@Component({
  selector: 'wa-desktop-app',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-3xl mx-auto p-6">
      @if (!entitled()) {
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <i class="pi pi-lock text-amber-500 mb-2" style="font-size:1.6rem"></i>
          <h1 class="text-lg font-bold text-amber-900">Offline desktop app not in your plan</h1>
          <p class="text-sm text-amber-700 mt-1">
            Your plan includes the online version, which is always available in this browser.
            Upgrade to add the installable offline desktop app (works without internet, syncs when back online).
          </p>
          <button (click)="goUpgrade()" class="mt-4 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold">See plans</button>
        </div>
      } @else {
        <div class="flex items-center gap-3 mb-5">
          <div class="w-11 h-11 rounded-xl bg-slate-800 text-white flex items-center justify-center">
            <i class="pi pi-desktop" style="font-size:1.3rem"></i>
          </div>
          <div>
            <h1 class="text-xl font-bold text-gray-900">Desktop App (Offline)</h1>
            <p class="text-sm text-gray-500">Included in your plan — the full ERP on your Windows PC, working offline.</p>
          </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-4 mb-6">
          <div class="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <i class="pi pi-bolt text-emerald-600"></i>
            <p class="text-sm font-semibold mt-1">Works offline</p>
            <p class="text-xs text-gray-500">Bill, purchase and manage stock with no internet. It runs a local database on your PC.</p>
          </div>
          <div class="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <i class="pi pi-sync text-indigo-600"></i>
            <p class="text-sm font-semibold mt-1">Two-way sync</p>
            <p class="text-xs text-gray-500">Everything reconciles with the cloud automatically when you reconnect.</p>
          </div>
          <div class="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <i class="pi pi-bolt text-amber-600"></i>
            <p class="text-sm font-semibold mt-1">Keyboard-first</p>
            <p class="text-xs text-gray-500">The full Miracle/Tally-style keyboard workflow, native speed.</p>
          </div>
          <div class="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <i class="pi pi-shield text-slate-600"></i>
            <p class="text-sm font-semibold mt-1">Same login</p>
            <p class="text-xs text-gray-500">Sign in with the same account. The app checks your plan before letting you in.</p>
          </div>
        </div>

        <div class="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <h2 class="text-sm font-bold text-gray-800 mb-2">Download for Windows</h2>
          <p class="text-xs text-gray-500 mb-3">Install the app, then sign in with your usual email and password.</p>
          @if (downloadUrl) {
            <a [href]="downloadUrl" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold no-underline">
              <i class="pi pi-download"></i> Download installer
            </a>
          } @else {
            <p class="text-xs text-gray-400 italic">Your installer link will appear here once your admin publishes the current build.</p>
          }
        </div>
      }
    </div>
  `,
})
export class DesktopAppComponent implements OnInit {
  private readonly erpAccess = inject(ErpAccessService);
  private readonly router = inject(Router);
  readonly entitled = signal(false);
  /** Set when a signed installer is hosted (env/config-driven later). */
  readonly downloadUrl = '';

  async ngOnInit() {
    await this.erpAccess.ensure();
    this.entitled.set(this.erpAccess.has('erpOffline'));
  }

  goUpgrade() { this.router.navigate(['/settings/upgrade']).catch(() => this.router.navigate(['/settings'])); }
}
