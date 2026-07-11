import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

interface RunState {
  runId: string;
  status: 'running' | 'success' | 'error';
  phase: string;
  message: string;
  tenant?: { schema: string; created: boolean; email: string };
  counts: Record<string, number>;
  error?: string;
}

/**
 * Super-admin Miracle → WA Commerce data migration.
 * Upload a Miracle CMP `.zip`, target an email/password (auto-creates the user
 * if missing), and the whole company is migrated with a live progress report.
 */
@Component({
  selector: 'wa-miracle-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Migrate from Miracle</h1>
        <p class="text-sm mt-1 text-gray-500">
          Upload a Miracle company export (<code>.zip</code>, e.g. <code>CMP0003.zip</code>). If no user exists for
          the email, a new tenant + owner is created automatically. Re-running the same export updates instead of
          duplicating.
        </p>
      </div>

      <form (ngSubmit)="submit()" class="rounded-xl p-6 bg-white border border-gray-200 shadow-sm space-y-5">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Miracle export (.zip)</label>
          <input type="file" accept=".zip" (change)="onFile($event)"
                 class="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-semibold hover:file:bg-primary-100" />
          @if (file) { <p class="text-xs text-gray-500 mt-1">{{ file.name }} — {{ (file.size / 1048576).toFixed(1) }} MB</p> }
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Owner email</label>
            <input type="email" [(ngModel)]="email" name="email" placeholder="fitnflow@gmail.com" required
                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Password <span class="font-normal text-gray-400">(new users only)</span></label>
            <input type="text" [(ngModel)]="password" name="password" placeholder="FitNFlow@123" required
                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Business name <span class="font-normal text-gray-400">(optional)</span></label>
            <input type="text" [(ngModel)]="businessName" name="businessName" placeholder="Auto-detected from export"
                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div class="flex items-end">
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" [(ngModel)]="importInvoices" name="importInvoices" class="rounded" />
              Import full transaction history (invoices, purchases, payments)
            </label>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Company GSTIN <span class="font-normal text-gray-400">(for GST invoices)</span></label>
            <input type="text" [(ngModel)]="sellerGstin" name="sellerGstin" maxlength="15" placeholder="27ABCDE1234F1Z5"
                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            <p class="text-xs text-gray-400 mt-1">Miracle's export doesn't include the seller's own GSTIN — enter it here.</p>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Company address <span class="font-normal text-gray-400">(optional)</span></label>
            <input type="text" [(ngModel)]="sellerAddress" name="sellerAddress" placeholder="Shop / street, city"
                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button type="submit" [disabled]="!file || !email || running()"
                  class="px-5 py-2.5 rounded-lg bg-primary-600 text-white font-semibold text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
            @if (running()) { <span class="pi pi-spin pi-spinner mr-2"></span> } Start migration
          </button>
          @if (error()) { <span class="text-sm text-red-600">{{ error() }}</span> }
        </div>
      </form>

      @if (run(); as r) {
        <div class="rounded-xl p-6 bg-white border border-gray-200 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">Migration progress</h2>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full"
                  [class]="r.status === 'success' ? 'bg-green-100 text-green-700' : r.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'">
              {{ r.status }}
            </span>
          </div>

          <div class="flex items-center gap-2 text-sm text-gray-600">
            @if (r.status === 'running') { <span class="pi pi-spin pi-spinner"></span> }
            <span class="font-medium capitalize">{{ r.phase }}</span> — {{ r.message }}
          </div>

          @if (r.tenant) {
            <div class="text-sm rounded-lg bg-gray-50 border border-gray-200 px-4 py-2">
              {{ r.tenant.created ? '✅ Created new tenant + user' : '↪ Using existing tenant' }} for
              <strong>{{ r.tenant.email }}</strong> <span class="text-gray-400">({{ r.tenant.schema }})</span>
            </div>
          }

          @if (countRows().length) {
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              @for (row of countRows(); track row.label) {
                <div class="rounded-lg border border-gray-200 p-3">
                  <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ row.label }}</p>
                  <p class="text-2xl font-bold text-gray-900 mt-1">{{ row.value }}</p>
                </div>
              }
            </div>
          }

          @if (r.error) { <div class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{{ r.error }}</div> }
          @if (r.status === 'success') {
            <div class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              Migration complete. The owner can now log in at the portal with the email above.
            </div>
          }
        </div>
      }

      <!-- ── Stock-take: set current on-hand quantities ─────────────────────── -->
      <div class="rounded-xl p-6 bg-white border border-gray-200 shadow-sm space-y-5">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Update stock levels (stock-take)</h2>
          <p class="text-sm mt-1 text-gray-500">
            Miracle's item catalogue was renumbered over the years, so historical stock can't be reconstructed
            exactly. Upload a current count sheet (<code>.xlsx</code> / <code>.csv</code> — an <b>item name</b> column
            and a <b>closing / quantity</b> column; an item-code column is used first if present) to set exact
            on-hand quantities. Export it from Miracle's Stock report.
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Stock sheet (.xlsx / .csv)</label>
            <input type="file" accept=".xlsx,.csv" (change)="onStockFile($event)"
                   class="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-semibold hover:file:bg-primary-100" />
            @if (stockFile) { <p class="text-xs text-gray-500 mt-1">{{ stockFile.name }}</p> }
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Owner email (target tenant)</label>
            <input type="email" [(ngModel)]="stockEmail" name="stockEmail" placeholder="fitnflow@gmail.com"
                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button type="button" (click)="submitStock()" [disabled]="!stockFile || !stockEmail || stockRunning()"
                  class="px-5 py-2.5 rounded-lg bg-gray-800 text-white font-semibold text-sm hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
            @if (stockRunning()) { <span class="pi pi-spin pi-spinner mr-2"></span> } Apply stock levels
          </button>
          @if (stockError()) { <span class="text-sm text-red-600">{{ stockError() }}</span> }
        </div>
        @if (stockReport(); as sr) {
          <div class="text-sm rounded-lg bg-green-50 border border-green-200 px-4 py-3 space-y-1">
            <div>✅ Updated <b>{{ sr.matched }}</b> of {{ sr.rows }} rows.
              @if (sr.unmatchedCount) { <span class="text-amber-700">{{ sr.unmatchedCount }} unmatched.</span> }
            </div>
            @if (sr.unmatched?.length) {
              <details class="text-xs text-gray-500"><summary class="cursor-pointer">Unmatched items</summary>
                <div class="mt-1">{{ sr.unmatched.join(', ') }}</div>
              </details>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class MiracleImportComponent implements OnDestroy {
  private readonly api = inject(ApiService);

  file: File | null = null;
  email = '';
  password = '';
  businessName = '';
  importInvoices = true;
  sellerGstin = '';
  sellerAddress = '';

  running = signal(false);
  error = signal('');
  run = signal<RunState | null>(null);
  private timer: any = null;

  // Stock-take
  stockFile: File | null = null;
  stockEmail = '';
  stockRunning = signal(false);
  stockError = signal('');
  stockReport = signal<{ rows: number; matched: number; unmatchedCount: number; unmatched: string[] } | null>(null);

  private readonly LABELS: Record<string, string> = {
    customer: 'Customers', supplier: 'Suppliers', product: 'Products', ledger: 'Ledgers',
    invoices: 'Invoices', purchases: 'Purchases', receipts: 'Receipts', payments: 'Payments',
    salesReturns: 'Sales returns', customerUpdated: 'Customers updated', supplierUpdated: 'Suppliers updated',
    productUpdated: 'Products updated', txnErrors: 'Skipped (errors)',
  };

  countRows = computed(() => {
    const c = this.run()?.counts || {};
    return Object.keys(this.LABELS)
      .filter((k) => c[k])
      .map((k) => ({ label: this.LABELS[k], value: c[k] }));
  });

  onFile(e: Event) {
    this.file = (e.target as HTMLInputElement).files?.[0] || null;
  }

  onStockFile(e: Event) {
    this.stockFile = (e.target as HTMLInputElement).files?.[0] || null;
  }

  submitStock() {
    if (!this.stockFile || this.stockRunning()) return;
    this.stockError.set('');
    this.stockReport.set(null);
    this.stockRunning.set(true);
    const fd = new FormData();
    fd.append('file', this.stockFile);
    fd.append('email', this.stockEmail.trim());
    this.api.http.post<any>(this.api.url('/admin/miracle-import/stock-take'), fd, { withCredentials: true }).subscribe({
      next: (res) => {
        this.stockRunning.set(false);
        this.stockReport.set(res?.data ?? res);
      },
      error: (err) => {
        this.stockRunning.set(false);
        this.stockError.set(err?.error?.message || err?.error?.error?.message || 'Failed to apply stock levels');
      },
    });
  }

  submit() {
    if (!this.file || this.running()) return;
    this.error.set('');
    this.running.set(true);
    this.run.set(null);
    const fd = new FormData();
    fd.append('file', this.file);
    fd.append('email', this.email.trim());
    fd.append('password', this.password);
    if (this.businessName.trim()) fd.append('businessName', this.businessName.trim());
    if (this.sellerGstin.trim()) fd.append('sellerGstin', this.sellerGstin.trim().toUpperCase());
    if (this.sellerAddress.trim()) fd.append('sellerAddress', this.sellerAddress.trim());
    fd.append('importInvoices', String(this.importInvoices));
    this.api.http.post<{ runId: string }>(this.api.url('/admin/miracle-import'), fd, { withCredentials: true }).subscribe({
      next: (res) => this.poll(res.runId),
      error: (err) => {
        this.running.set(false);
        this.error.set(err?.error?.message || 'Failed to start migration');
      },
    });
  }

  private poll(runId: string) {
    const tick = () => {
      this.api.http.get<RunState>(this.api.url(`/admin/miracle-import/runs/${runId}`), { withCredentials: true }).subscribe({
        next: (r) => {
          this.run.set(r);
          if (r.status === 'running') this.timer = setTimeout(tick, 1500);
          else this.running.set(false);
        },
        error: () => {
          this.timer = setTimeout(tick, 2500);
        },
      });
    };
    tick();
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }
}
