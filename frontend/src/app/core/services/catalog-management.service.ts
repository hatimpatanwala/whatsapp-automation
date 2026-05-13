import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface TenantCatalog {
  id: string;
  metaCatalogId: string;
  catalogName: string;
  phoneNumberId: string;
  isLinkedToPhone: boolean;
  isCatalogVisible: boolean;
  isCartEnabled: boolean;
  productCount: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  createdAt: string;
}

export interface CatalogStatus {
  status: string;
  catalog: TenantCatalog | null;
  syncJobs: SyncJob[];
  productSyncStats: ProductSyncStat[] | null;
}

export interface SyncJob {
  id: string;
  jobType: string;
  status: string;
  totalProducts: number;
  syncedCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ProductSyncStat {
  sync_status: string;
  count: number;
}

export interface CatalogCollection {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  product_count: number;
  products?: any[];
  created_at: string;
  updated_at: string;
}

export interface AssignmentHistoryEntry {
  id: string;
  tenant_id: string;
  meta_catalog_id: string;
  phone_number_id: string;
  action: string;
  created_at: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CatalogManagementService {
  private readonly api = inject(ApiService);

  // ─── Catalog Lifecycle ─────────────────────────────────────────────────

  getCatalogStatus(): Observable<CatalogStatus> {
    return this.api.get<CatalogStatus>('/commerce/catalog/status');
  }

  provisionCatalog(catalogName?: string): Observable<TenantCatalog> {
    return this.api.post<TenantCatalog>('/commerce/catalog/provision', { catalogName });
  }

  deprovisionCatalog(): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/commerce/catalog/deprovision', {});
  }

  updateVisibility(isCatalogVisible: boolean, isCartEnabled: boolean): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/commerce/catalog/visibility', {
      isCatalogVisible,
      isCartEnabled,
    });
  }

  getAssignmentHistory(): Observable<AssignmentHistoryEntry[]> {
    return this.api.get<AssignmentHistoryEntry[]>('/commerce/catalog/history');
  }

  // ─── Sync ──────────────────────────────────────────────────────────────

  triggerFullSync(): Observable<{ syncJobId: string; type: string; message: string }> {
    return this.api.post('/commerce/sync', { forceFullSync: true });
  }

  triggerProductSync(productIds: string[]): Observable<{ syncJobId: string; type: string; message: string }> {
    return this.api.post('/commerce/sync', { productIds });
  }

  getSyncJobStatus(jobId: string): Observable<SyncJob> {
    return this.api.get<SyncJob>(`/commerce/sync/${jobId}`);
  }

  // ─── Collections ───────────────────────────────────────────────────────

  getCollections(): Observable<CatalogCollection[]> {
    return this.api.get<CatalogCollection[]>('/commerce/collections');
  }

  getCollection(id: string): Observable<CatalogCollection> {
    return this.api.get<CatalogCollection>(`/commerce/collections/${id}`);
  }

  createCollection(data: { name: string; description?: string; imageUrl?: string; productIds?: string[] }): Observable<CatalogCollection> {
    return this.api.post<CatalogCollection>('/commerce/collections', data);
  }

  updateCollection(id: string, data: Partial<CatalogCollection>): Observable<CatalogCollection> {
    return this.api.put<CatalogCollection>(`/commerce/collections/${id}`, data);
  }

  deleteCollection(id: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/commerce/collections/${id}`);
  }

  addCollectionProducts(collectionId: string, productIds: string[]): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/commerce/collections/${collectionId}/products`, { productIds });
  }

  removeCollectionProducts(collectionId: string, productIds: string[]): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/commerce/collections/${collectionId}/products`);
  }

  // ─── Product Messages ──────────────────────────────────────────────────

  sendProductMessage(to: string, productId: string, bodyText?: string): Observable<any> {
    return this.api.post('/commerce/messages/product', { to, productId, bodyText });
  }

  sendMultiProductMessage(to: string, productIds: string[], headerText?: string, bodyText?: string): Observable<any> {
    return this.api.post('/commerce/messages/multi-product', { to, productIds, headerText, bodyText });
  }

  sendCatalogMessage(to: string, bodyText?: string): Observable<any> {
    return this.api.post('/commerce/messages/catalog', { to, bodyText });
  }
}
