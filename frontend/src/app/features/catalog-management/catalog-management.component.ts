import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { FormsModule } from '@angular/forms';
import { MessageService, ConfirmationService } from 'primeng/api';
import {
  CatalogManagementService,
  CatalogStatus,
  SyncJob,
} from '../../core/services/catalog-management.service';

@Component({
  selector: 'wa-catalog-management',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    TagModule,
    DialogModule,
    ToastModule,
    ConfirmDialogModule,
    ProgressBarModule,
    TableModule,
    ToggleSwitchModule,
    InputTextModule,
    CardModule,
    FormsModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />
      <p-confirmDialog />

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">WhatsApp Catalog</h1>
          <p class="text-gray-500 text-sm">Manage your Meta Commerce catalog for WhatsApp</p>
        </div>
        <div class="flex gap-2">
          @if (catalogStatus()?.status === 'active') {
            <button pButton label="Sync Now" icon="pi pi-sync" class="p-button-sm"
              [loading]="syncing()" (click)="triggerSync()"></button>
          }
        </div>
      </div>

      <!-- Not Provisioned State -->
      @if (catalogStatus()?.status === 'not_provisioned') {
        <div class="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
          <i class="pi pi-shopping-bag text-5xl text-gray-300 mb-4"></i>
          <h2 class="text-xl font-semibold text-gray-900 mb-2">No Catalog Provisioned</h2>
          <p class="text-gray-500 mb-6 max-w-md mx-auto">
            Create a WhatsApp Commerce catalog to showcase your products directly in WhatsApp.
            Each catalog is linked to your phone number for isolated commerce.
          </p>
          <div class="flex justify-center gap-3">
            <input pInputText [(ngModel)]="newCatalogName" placeholder="Catalog name (optional)"
              class="max-w-xs" />
            <button pButton label="Provision Catalog" icon="pi pi-plus" [loading]="provisioning()"
              (click)="provision()"></button>
          </div>
        </div>
      }

      <!-- Active Catalog -->
      @if (catalogStatus()?.status === 'active' && catalogStatus()?.catalog) {
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-xs text-gray-500 font-medium">Status</p>
            <p-tag class="mt-2" [value]="catalogStatus()!.catalog!.isLinkedToPhone ? 'Linked' : 'Not Linked'"
              [severity]="catalogStatus()!.catalog!.isLinkedToPhone ? 'success' : 'warn'" />
          </div>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-xs text-gray-500 font-medium">Products Synced</p>
            <p class="text-2xl font-bold text-gray-900 mt-1">{{ catalogStatus()!.catalog!.productCount }}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-xs text-gray-500 font-medium">Last Sync</p>
            <p class="text-sm font-medium text-gray-900 mt-1">
              {{ catalogStatus()!.catalog!.lastSyncAt ? (catalogStatus()!.catalog!.lastSyncAt | date:'medium') : 'Never' }}
            </p>
          </div>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-xs text-gray-500 font-medium">Sync Status</p>
            <p-tag class="mt-2"
              [value]="catalogStatus()!.catalog!.lastSyncStatus || 'pending'"
              [severity]="getSyncSeverity(catalogStatus()!.catalog!.lastSyncStatus)" />
          </div>
        </div>

        <!-- Catalog Details -->
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900">Catalog Details</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p class="text-xs text-gray-500">Catalog Name</p>
              <p class="font-medium">{{ catalogStatus()!.catalog!.catalogName }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500">Meta Catalog ID</p>
              <p class="font-mono text-sm">{{ catalogStatus()!.catalog!.metaCatalogId }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500">Phone Number ID</p>
              <p class="font-mono text-sm">{{ catalogStatus()!.catalog!.phoneNumberId || 'Not assigned' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500">Created</p>
              <p class="text-sm">{{ catalogStatus()!.catalog!.createdAt | date:'mediumDate' }}</p>
            </div>
          </div>

          <!-- Visibility Controls -->
          <div class="flex gap-6 pt-4 border-t border-gray-100">
            <div class="flex items-center gap-3">
              <p-toggleSwitch [(ngModel)]="catalogVisible" (onChange)="updateVisibility()" />
              <span class="text-sm text-gray-700">Catalog Visible</span>
            </div>
            <div class="flex items-center gap-3">
              <p-toggleSwitch [(ngModel)]="cartEnabled" (onChange)="updateVisibility()" />
              <span class="text-sm text-gray-700">Cart Enabled</span>
            </div>
          </div>

          <!-- Danger Zone -->
          <div class="pt-4 border-t border-gray-100">
            <button pButton label="Deprovision Catalog" icon="pi pi-trash"
              class="p-button-sm p-button-danger p-button-outlined"
              (click)="confirmDeprovision()"></button>
          </div>
        </div>

        <!-- Product Sync Stats -->
        @if (catalogStatus()!.productSyncStats?.length) {
          <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Product Sync Breakdown</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              @for (stat of catalogStatus()!.productSyncStats; track stat.sync_status) {
                <div class="bg-gray-50 rounded-lg p-3 text-center">
                  <p class="text-xs text-gray-500">{{ stat.sync_status }}</p>
                  <p class="text-xl font-bold" [class]="getSyncStatColor(stat.sync_status)">{{ stat.count }}</p>
                </div>
              }
            </div>
          </div>
        }

        <!-- Recent Sync Jobs -->
        @if (catalogStatus()!.syncJobs?.length) {
          <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Recent Sync Jobs</h3>
            <p-table [value]="catalogStatus()!.syncJobs" [rows]="10" [paginator]="catalogStatus()!.syncJobs.length > 10" styleClass="p-datatable-sm">
              <ng-template #header>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Products</th>
                  <th>Synced</th>
                  <th>Failed</th>
                  <th>Started</th>
                  <th>Completed</th>
                </tr>
              </ng-template>
              <ng-template #body let-job>
                <tr>
                  <td>{{ job.jobType }}</td>
                  <td><p-tag [value]="job.status" [severity]="getSyncSeverity(job.status)" /></td>
                  <td>{{ job.totalProducts }}</td>
                  <td class="text-green-600 font-medium">{{ job.syncedCount }}</td>
                  <td class="text-red-600 font-medium">{{ job.failedCount }}</td>
                  <td>{{ job.startedAt | date:'short' }}</td>
                  <td>{{ job.completedAt | date:'short' }}</td>
                </tr>
              </ng-template>
            </p-table>
          </div>
        }
      }

      <!-- Loading State -->
      @if (loading()) {
        <div class="flex justify-center py-12">
          <i class="pi pi-spin pi-spinner text-3xl text-gray-400"></i>
        </div>
      }
    </div>
  `,
})
export class CatalogManagementComponent implements OnInit {
  private readonly catalogService = inject(CatalogManagementService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  catalogStatus = signal<CatalogStatus | null>(null);
  loading = signal(true);
  provisioning = signal(false);
  syncing = signal(false);

  newCatalogName = '';
  catalogVisible = false;
  cartEnabled = false;

  ngOnInit() {
    this.loadStatus();
  }

  loadStatus() {
    this.loading.set(true);
    this.catalogService.getCatalogStatus().subscribe({
      next: (status) => {
        this.catalogStatus.set(status);
        if (status.catalog) {
          this.catalogVisible = status.catalog.isCatalogVisible;
          this.cartEnabled = status.catalog.isCartEnabled;
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load catalog status' });
        this.loading.set(false);
      },
    });
  }

  provision() {
    this.provisioning.set(true);
    this.catalogService.provisionCatalog(this.newCatalogName || undefined).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Catalog provisioned successfully' });
        this.provisioning.set(false);
        this.loadStatus();
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error', summary: 'Provisioning Failed',
          detail: err.error?.message || 'Failed to provision catalog',
        });
        this.provisioning.set(false);
      },
    });
  }

  triggerSync() {
    this.syncing.set(true);
    this.catalogService.triggerFullSync().subscribe({
      next: (res) => {
        this.messageService.add({ severity: 'info', summary: 'Sync Queued', detail: `Job ${res.syncJobId} queued` });
        this.syncing.set(false);
        // Reload status after a delay to show updated sync job
        setTimeout(() => this.loadStatus(), 3000);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to trigger sync' });
        this.syncing.set(false);
      },
    });
  }

  updateVisibility() {
    this.catalogService.updateVisibility(this.catalogVisible, this.cartEnabled).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Visibility settings updated' });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update visibility' });
        this.loadStatus(); // Reset to server state
      },
    });
  }

  confirmDeprovision() {
    this.confirmationService.confirm({
      message: 'This will delete your Meta catalog and unlink it from your phone number. Products will no longer be visible on WhatsApp. This action cannot be undone.',
      header: 'Deprovision Catalog',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Deprovision',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.catalogService.deprovisionCatalog().subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Done', detail: 'Catalog deprovisioned' });
            this.loadStatus();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to deprovision' });
          },
        });
      },
    });
  }

  getSyncSeverity(status: string | null): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'success':
      case 'synced':
      case 'completed': return 'success';
      case 'running':
      case 'pending': return 'info';
      case 'partial': return 'warn';
      case 'failed': return 'danger';
      default: return 'secondary';
    }
  }

  getSyncStatColor(status: string): string {
    switch (status) {
      case 'synced': return 'text-green-600';
      case 'pending': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      case 'deleted': return 'text-gray-400';
      default: return 'text-gray-600';
    }
  }
}
