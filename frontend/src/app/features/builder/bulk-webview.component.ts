import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

interface BulkStatus {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  succeeded: number;
  created: number;
  updated: number;
  failed: number;
  errors: { row: number; name: string; error: string }[];
}

/**
 * Token-secured bulk product editor, opened from WhatsApp. Download all products
 * (or a blank template), edit in Excel, and re-upload to add/update in one go.
 */
@Component({
  selector: 'wa-bulk-webview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900">
      <header class="bg-green-600 text-white shadow">
        <div class="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <i class="pi pi-box" style="font-size:1.1rem"></i>
          <h1 class="text-base font-semibold">Bulk Products</h1>
        </div>
      </header>

      @if (!token()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">Missing or invalid link.</p>
          </div>
        </div>
      } @else {
        <main class="max-w-2xl mx-auto p-4 space-y-4">
          <section class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs font-semibold text-gray-500 uppercase mb-1">Step 1 — Download</p>
            <p class="text-sm text-gray-600 mb-3">Get your products as an Excel file. Edit prices, stock, names — or add new rows (leave the ID empty for new products).</p>
            <div class="flex flex-col sm:flex-row gap-2">
              <a [href]="exportUrl()" class="flex-1 text-center bg-green-600 text-white text-sm font-semibold rounded-lg py-2.5 hover:bg-green-700">
                <i class="pi pi-file-export mr-1"></i>Download all products
              </a>
              <a [href]="templateUrl()" class="flex-1 text-center border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg py-2.5 hover:bg-gray-50">
                <i class="pi pi-download mr-1"></i>Blank template
              </a>
            </div>
          </section>

          <section class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs font-semibold text-gray-500 uppercase mb-1">Step 2 — Upload</p>
            <p class="text-sm text-gray-600 mb-3">Upload the edited .xlsx. Existing products update; new rows are added.</p>
            <input #file type="file" accept=".xlsx" class="hidden" (change)="upload($event)" />
            <button class="w-full bg-blue-600 text-white text-sm font-semibold rounded-lg py-2.5 hover:bg-blue-700 disabled:opacity-50"
              [disabled]="busy()" (click)="file.click()">
              <i class="pi pi-upload mr-1"></i>{{ busy() ? 'Uploading…' : 'Upload edited file' }}
            </button>
            @if (error()) { <p class="text-xs text-red-600 mt-2">{{ error() }}</p> }
          </section>

          @if (status(); as s) {
            <section class="bg-white rounded-xl border border-gray-200 p-4">
              <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Result</p>
              @if (s.status === 'processing') {
                <p class="text-sm text-blue-600"><i class="pi pi-spin pi-spinner mr-1"></i>Processing {{ s.processed }} / {{ s.total }}…</p>
              } @else if (s.status === 'completed') {
                <p class="text-sm font-semibold text-green-700">✅ {{ s.created }} added · {{ s.updated }} updated · {{ s.failed }} failed</p>
              } @else if (s.status === 'failed') {
                <p class="text-sm font-semibold text-red-700">❌ {{ s.errors[0]?.error || 'Upload failed' }}</p>
              }
              @if (s.errors?.length) {
                <ul class="mt-2 text-xs text-red-600 list-disc pl-4 max-h-40 overflow-auto">
                  @for (e of s.errors; track e.row) { <li>Row {{ e.row }} ({{ e.name }}): {{ e.error }}</li> }
                </ul>
              }
            </section>
          }
        </main>
      }
    </div>
  `,
})
export class BulkWebviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = environment.apiUrl;

  token = signal('');
  busy = signal(false);
  error = signal<string | null>(null);
  status = signal<BulkStatus | null>(null);
  private poll: any = null;

  exportUrl = computed(() => `${this.base}/m/products/export?token=${this.token()}`);
  templateUrl = computed(() => `${this.base}/m/products/template?token=${this.token()}`);

  constructor() {
    this.http = new HttpClient(inject(HttpBackend));
  }

  ngOnInit(): void {
    this.token.set(this.route.snapshot.queryParamMap.get('token') || '');
  }

  upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.xlsx')) {
      this.error.set('Please upload an .xlsx file.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const form = new FormData();
    form.append('file', f);
    this.http.post(`${this.base}/m/products/upload?token=${this.token()}`, form).subscribe({
      next: () => {
        this.busy.set(false);
        input.value = '';
        this.startPolling();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(e?.error?.message || 'Upload failed.');
      },
    });
  }

  private startPolling(): void {
    if (this.poll) clearInterval(this.poll);
    const tick = () => {
      this.http.get<BulkStatus>(`${this.base}/m/products/status?token=${this.token()}`).subscribe({
        next: (s) => {
          this.status.set(s);
          if (s.status !== 'processing' && this.poll) {
            clearInterval(this.poll);
            this.poll = null;
          }
        },
        error: () => {},
      });
    };
    tick();
    this.poll = setInterval(tick, 1500);
  }
}
