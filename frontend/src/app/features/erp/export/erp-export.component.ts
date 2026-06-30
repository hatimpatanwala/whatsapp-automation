import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';
import { ErpAccessService } from '../../../core/services/erp-access.service';

interface DatasetSummary { key: string; label: string; group: string; count: number; }
interface DatasetGroup { group: string; datasets: DatasetSummary[]; }

/**
 * ERP data export centre. Lets a tenant download ALL of their ERP data — company
 * profile, customers, sales, purchases, inventory, accounting — as one Excel
 * workbook or as per-dataset CSV files. This is the landing screen for a
 * downgraded (read-only) tenant: their data is preserved and fully exportable
 * even though they can no longer create or edit it.
 */
@Component({
  selector: 'wa-erp-export',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule, ToastModule, TooltipModule, ProgressSpinnerModule],
  providers: [MessageService],
  template: `
    <div class="p-4 max-w-6xl mx-auto">
      <p-toast />

      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Export My Data</h2>
          <p class="text-sm text-gray-500 mt-1">
            Download a complete copy of your business data — company profile, customers, sales, purchases and inventory.
          </p>
        </div>
        <p-button
          label="Download Everything (Excel)"
          icon="pi pi-file-excel"
          [loading]="downloadingAll()"
          [disabled]="loading() || totalRecords() === 0"
          (onClick)="downloadAll()"
        />
      </div>

      @if (access.readOnly()) {
        <div class="flex items-start gap-3 px-4 py-3 mb-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <i class="pi pi-info-circle mt-0.5"></i>
          <span>
            Your plan no longer includes the Business Suite, so your ERP data is now <b>read-only</b>.
            It is fully preserved — download it here any time, or
            <a routerLink="/settings/upgrade" class="font-semibold underline">upgrade</a> to edit again.
          </span>
        </div>
      }

      <!-- Loading -->
      @if (loading()) {
        <div class="flex flex-col items-center justify-center py-20 text-gray-400">
          <p-progressSpinner styleClass="w-10 h-10" strokeWidth="4" />
          <p class="mt-3 text-sm">Gathering your data…</p>
        </div>
      } @else if (totalRecords() === 0) {
        <div class="text-center py-20 text-gray-400">
          <i class="pi pi-inbox text-4xl mb-3 block"></i>
          <p class="text-lg font-medium">No data to export yet</p>
          <p class="text-sm">Once you have invoices, customers or products they'll appear here.</p>
        </div>
      } @else {
        <!-- Summary bar -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ totalRecords() | number }}</p>
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-1">Total records</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ datasetCount() }}</p>
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-1">Datasets</p>
          </div>
          <p class="text-sm text-gray-500 ml-auto">
            <i class="pi pi-file-excel text-green-600 mr-1"></i>
            The Excel file has one sheet per dataset. Use the CSV buttons to pull a single table.
          </p>
        </div>

        <!-- Groups -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          @for (g of groups(); track g.group) {
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div class="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wide">{{ g.group }}</h3>
              </div>
              <div class="divide-y divide-gray-50">
                @for (d of g.datasets; track d.key) {
                  <div class="flex items-center gap-3 px-5 py-3">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium text-gray-800 truncate">{{ d.label }}</p>
                      <p class="text-xs text-gray-400 tabular-nums">{{ d.count | number }} record{{ d.count === 1 ? '' : 's' }}</p>
                    </div>
                    <button
                      pButton
                      label="CSV"
                      icon="pi pi-download"
                      class="p-button-text p-button-sm"
                      [disabled]="d.count === 0"
                      pTooltip="Download {{ d.label }} as CSV"
                      tooltipPosition="left"
                      (click)="downloadCsv(d)"
                    ></button>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ErpExportComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  readonly access = inject(ErpAccessService);

  loading = signal(true);
  downloadingAll = signal(false);
  groups = signal<DatasetGroup[]>([]);

  totalRecords = computed(() =>
    this.groups().reduce((sum, g) => sum + g.datasets.reduce((s, d) => s + d.count, 0), 0),
  );
  datasetCount = computed(() =>
    this.groups().reduce((sum, g) => sum + g.datasets.filter((d) => d.count > 0).length, 0),
  );

  ngOnInit() {
    this.api.get<DatasetGroup[]>('/erp/export/datasets').subscribe({
      next: (g) => { this.groups.set(g || []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Failed to load datasets' }); },
    });
  }

  downloadAll() {
    this.downloadingAll.set(true);
    // The browser handles the file download from the same-origin, cookie-authed URL.
    window.open(this.api.url('/erp/export/all.xlsx'), '_blank');
    // We can't observe the download stream; clear the spinner shortly after kickoff.
    setTimeout(() => this.downloadingAll.set(false), 2500);
  }

  downloadCsv(d: DatasetSummary) {
    if (d.count === 0) return;
    window.open(this.api.url(`/erp/export/csv/${d.key}`), '_blank');
  }
}
