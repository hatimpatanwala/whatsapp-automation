import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { returnToWhatsApp } from './webview-return';

interface OnbField {
  fieldKey: string; label: string; fieldType: string; options: string[];
  placeholder?: string; helpText?: string; isRequired?: boolean; value?: any;
}

/**
 * Token-authenticated customer ONBOARDING webview (/m/onboarding). Collects the
 * required/collectable customer custom fields and saves them — unblocking gated
 * workflows. Bare HttpClient so app interceptors/session aren't involved.
 */
@Component({
  selector: 'wa-onboarding-webview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-32">
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-green-600 text-white flex items-center justify-center shrink-0 shadow-sm"><i class="pi pi-id-card" style="font-size:1.05rem"></i></div>
          <div class="min-w-0">
            <h1 class="text-[15px] font-bold text-gray-900 truncate leading-tight">A few quick details</h1>
            <p class="text-[11px] text-gray-400 leading-tight truncate">{{ store()?.name || 'Store' }}</p>
          </div>
        </div>
      </header>

      @if (!token() || loadError()) {
        <div class="max-w-md mx-auto p-6"><div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
          <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
          <p class="text-sm font-semibold text-red-800">{{ loadError() || 'Missing or invalid link.' }}</p>
        </div></div>
      } @else if (loading()) {
        <p class="text-center text-sm text-gray-400 py-16"><i class="pi pi-spin pi-spinner mr-1"></i>Loading…</p>
      } @else if (done()) {
        <div class="max-w-md mx-auto p-6"><div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p class="text-5xl mb-2">🎉</p>
          <p class="text-lg font-bold text-gray-900">All set, thank you!</p>
          <p class="text-sm text-gray-500 mt-1">Your details are saved. Head back to the chat to continue.</p>
          <button class="mt-5 w-full bg-green-600 text-white font-semibold rounded-xl py-3 text-sm" (click)="back()"><i class="pi pi-whatsapp mr-1"></i>Back to chat</button>
        </div></div>
      } @else {
        <main class="max-w-2xl mx-auto p-3 space-y-3">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3.5">
            @if (customer()?.name) { <p class="text-sm text-gray-500">Hi <span class="font-semibold text-gray-800">{{ customer()!.name }}</span> 👋 please fill in the details below.</p> }
            @for (f of fields(); track f.fieldKey) {
              <div>
                <label class="text-xs font-semibold text-gray-500">{{ f.label }}@if (f.isRequired) { <span class="text-red-500"> *</span> }</label>
                @switch (f.fieldType) {
                  @case ('textarea') {
                    <textarea [(ngModel)]="values[f.fieldKey]" rows="2" [placeholder]="f.placeholder || ''" class="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none"></textarea>
                  }
                  @case ('select') {
                    <select [(ngModel)]="values[f.fieldKey]" class="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
                      <option value="">Select…</option>
                      @for (o of f.options; track o) { <option [value]="o">{{ o }}</option> }
                    </select>
                  }
                  @case ('boolean') {
                    <label class="flex items-center gap-2 mt-1.5"><input type="checkbox" [(ngModel)]="values[f.fieldKey]" class="w-5 h-5 accent-green-600" /> <span class="text-sm text-gray-600">Yes</span></label>
                  }
                  @case ('number') {
                    <input type="number" [(ngModel)]="values[f.fieldKey]" [placeholder]="f.placeholder || ''" class="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none" />
                  }
                  @case ('date') {
                    <input type="date" [(ngModel)]="values[f.fieldKey]" class="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none" />
                  }
                  @default {
                    <input [type]="f.fieldType === 'email' ? 'email' : (f.fieldType === 'phone' ? 'tel' : 'text')" [(ngModel)]="values[f.fieldKey]" [placeholder]="f.placeholder || ''" class="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none" />
                  }
                }
                @if (f.helpText) { <p class="text-[11px] text-gray-400 mt-1">{{ f.helpText }}</p> }
              </div>
            }
            @if (!fields().length) { <p class="text-sm text-gray-400 text-center py-6">Nothing to fill right now 🎉</p> }
          </div>
        </main>

        <div class="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div class="max-w-2xl mx-auto">
            @if (submitError()) { <p class="text-xs text-red-600 mb-2"><i class="pi pi-exclamation-circle mr-1"></i>{{ submitError() }}</p> }
            <button class="w-full bg-green-600 text-white font-bold rounded-xl py-3.5 text-sm shadow-sm disabled:opacity-40 flex items-center justify-center gap-2"
              [disabled]="!canSubmit() || submitting()" (click)="submit()">
              @if (submitting()) { <i class="pi pi-spin pi-spinner"></i> Saving… } @else { <i class="pi pi-check-circle"></i> Save & continue }
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class OnboardingWebviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = environment.apiUrl;

  token = signal('');
  loading = signal(true);
  loadError = signal<string | null>(null);
  submitting = signal(false);
  submitError = signal<string | null>(null);
  done = signal(false);

  store = signal<{ name: string } | null>(null);
  customer = signal<{ name?: string; phone?: string } | null>(null);
  fields = signal<OnbField[]>([]);
  values: Record<string, any> = {};
  private waPhone = '';

  // A method (not computed): `values` is a plain object, so a computed wouldn't
  // re-run as the customer types — the button would stay stuck disabled.
  canSubmit(): boolean {
    return this.fields().every(f => !f.isRequired || (this.values[f.fieldKey] !== undefined && this.values[f.fieldKey] !== null && String(this.values[f.fieldKey]).trim() !== ''));
  }

  constructor() { this.http = new HttpClient(inject(HttpBackend)); }
  private unwrap<T>(r: any): T { return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T; }
  private opts() { return { headers: { 'X-Builder-Token': this.token() } }; }

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token') || '';
    this.token.set(t);
    if (!t) { this.loading.set(false); return; }
    this.http.get<any>(`${this.base}/m/onboarding/bootstrap`, this.opts()).subscribe({
      next: (r) => {
        const d = this.unwrap<any>(r) || {};
        this.store.set(d.store || { name: 'Store' });
        this.customer.set(d.customer || null);
        this.waPhone = d.customer?.phone || '';
        const fs: OnbField[] = d.fields || [];
        this.fields.set(fs);
        for (const f of fs) if (f.value !== undefined && f.value !== null) this.values[f.fieldKey] = f.value;
        this.loading.set(false);
      },
      error: (e) => { this.loading.set(false); this.loadError.set(e?.error?.message || 'This link is invalid or has expired.'); },
    });
  }

  submit() {
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true); this.submitError.set(null);
    this.http.post<any>(`${this.base}/m/onboarding/submit`, { values: this.values }, this.opts()).subscribe({
      next: () => { this.submitting.set(false); this.done.set(true); },
      error: (e) => { this.submitting.set(false); this.submitError.set(e?.error?.message || 'Could not save. Please try again.'); },
    });
  }
  back() { returnToWhatsApp(this.waPhone); }
}
