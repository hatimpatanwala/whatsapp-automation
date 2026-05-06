import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import { InventoryItem, InventoryMovement, InventoryMovementType, PaginatedResponse } from '../models';

export interface InventoryListParams extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
  categoryId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AdjustStockPayload {
  type: InventoryMovementType;
  quantity: number;         // absolute delta (positive = add, negative = remove)
  notes?: string;
  referenceId?: string;
  referenceType?: string;
}

export interface SetStockPayload {
  quantity: number;         // new absolute stock level
  notes?: string;
}

export interface BulkAdjustPayload {
  adjustments: Array<{
    inventoryItemId: string;
    quantity: number;
    type: InventoryMovementType;
    notes?: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly api = inject(ApiService);

  getAll(params?: InventoryListParams): Observable<PaginatedResponse<InventoryItem>> {
    return this.api.get<PaginatedResponse<InventoryItem>>('/inventory', params);
  }

  getById(id: string): Observable<InventoryItem> {
    return this.api.get<InventoryItem>(`/inventory/${id}`);
  }

  getByProductId(productId: string): Observable<InventoryItem[]> {
    return this.api.get<InventoryItem[]>(`/inventory/product/${productId}`);
  }

  /**
   * Adjust stock by a relative delta. Positive adds stock, negative removes it.
   */
  adjustStock(id: string, payload: AdjustStockPayload): Observable<InventoryItem> {
    return this.api.post<InventoryItem>(`/inventory/${id}/adjust`, payload);
  }

  /**
   * Set stock to an exact absolute value (useful for stock-take reconciliation).
   */
  setStock(id: string, payload: SetStockPayload): Observable<InventoryItem> {
    return this.api.post<InventoryItem>(`/inventory/${id}/set`, payload);
  }

  /**
   * Adjust stock for multiple items in a single transaction.
   */
  bulkAdjust(payload: BulkAdjustPayload): Observable<{ updated: number }> {
    return this.api.post<{ updated: number }>('/inventory/bulk-adjust', payload);
  }

  /**
   * Get the movement history for a specific inventory item.
   */
  getMovements(inventoryItemId: string, params?: QueryParams): Observable<PaginatedResponse<InventoryMovement>> {
    return this.api.get<PaginatedResponse<InventoryMovement>>(
      `/inventory/${inventoryItemId}/movements`,
      params,
    );
  }

  /**
   * Get all items currently below their low-stock threshold.
   */
  getLowStockItems(): Observable<InventoryItem[]> {
    return this.api.get<InventoryItem[]>('/inventory/alerts/low-stock');
  }

  /**
   * Update reorder settings for an inventory item.
   */
  updateReorderSettings(
    id: string,
    settings: { lowStockThreshold?: number; reorderPoint?: number; reorderQuantity?: number },
  ): Observable<InventoryItem> {
    return this.api.patch<InventoryItem>(`/inventory/${id}/reorder-settings`, settings);
  }
}
