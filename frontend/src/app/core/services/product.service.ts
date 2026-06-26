import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import { Product, Category, PaginatedResponse, ProductVariant } from '../models';

export interface ProductListParams extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  lowStock?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateProductPayload {
  name: string;
  description?: string;
  shortDescription?: string;
  categoryId?: string;
  brandId?: string;
  hsnCode?: string;
  gstRate?: number;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  barcode?: string;
  status?: string;
  trackInventory?: boolean;
  stockQuantity?: number;
  lowStockThreshold?: number;
  weight?: number;
  imageUrls?: string[];
  variants?: Omit<ProductVariant, 'id'>[];
  tags?: string[];
}

export interface UpdateProductPayload extends Partial<CreateProductPayload> {}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly api = inject(ApiService);

  // ─── Products ──────────────────────────────────────────────────────────────

  getAll(params?: ProductListParams): Observable<PaginatedResponse<Product>> {
    return this.api.get<PaginatedResponse<Product>>('/products', params);
  }

  getById(id: string): Observable<Product> {
    return this.api.get<Product>(`/products/${id}`);
  }

  getBySlug(slug: string): Observable<Product> {
    return this.api.get<Product>(`/products/slug/${slug}`);
  }

  create(payload: CreateProductPayload): Observable<Product> {
    return this.api.post<Product>('/products', payload);
  }

  update(id: string, payload: UpdateProductPayload): Observable<Product> {
    return this.api.patch<Product>(`/products/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/products/${id}`);
  }

  archive(id: string): Observable<Product> {
    return this.api.patch<Product>(`/products/${id}`, { status: 'archived' });
  }

  /**
   * Bulk update product statuses.
   */
  bulkUpdateStatus(ids: string[], status: string): Observable<{ updated: number }> {
    return this.api.post<{ updated: number }>('/products/bulk/status', { ids, status });
  }

  /**
   * Upload product images. Returns signed URLs or stored paths.
   */
  uploadImages(productId: string, files: FormData): Observable<{ urls: string[] }> {
    return this.api.http.post<{ urls: string[] }>(
      this.api.url(`/products/${productId}/images`),
      files,
    );
  }

  /**
   * Sync products to the WhatsApp Business Catalog.
   */
  syncCatalog(productIds?: string[]): Observable<{ synced: number; errors: number }> {
    return this.api.post('/products/sync-catalog', { productIds });
  }

  // ─── Bulk Upload ───────────────────────────────────────────────────────────

  downloadBulkTemplate(): Observable<Blob> {
    return this.api.http.get(this.api.url('/products/bulk-upload/template'), {
      responseType: 'blob',
      withCredentials: true,
    });
  }

  /** Download ALL products as an editable .xlsx (re-upload to bulk-update). */
  exportProducts(): Observable<Blob> {
    return this.api.http.get(this.api.url('/products/bulk-upload/export'), {
      responseType: 'blob',
      withCredentials: true,
    });
  }

  bulkUpload(file: File): Observable<{ message: string; status: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.http.post<{ message: string; status: string }>(
      this.api.url('/products/bulk-upload'),
      formData,
      { withCredentials: true },
    );
  }

  getBulkUploadStatus(): Observable<{
    status: 'idle' | 'processing' | 'completed' | 'failed';
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    errors: { row: number; name: string; error: string }[];
  }> {
    return this.api.get('/products/bulk-upload/status');
  }

  clearBulkUploadStatus(): Observable<any> {
    return this.api.post('/products/bulk-upload/clear', {});
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  getCategories(params?: QueryParams): Observable<Category[]> {
    return this.api.get<Category[]>('/products/categories', params);
  }

  getBrands(): Observable<{ id: string; name: string }[]> {
    return this.api.get<{ id: string; name: string }[]>('/brands');
  }

  getCategoryById(id: string): Observable<Category> {
    return this.api.get<Category>(`/products/categories/${id}`);
  }

  createCategory(payload: Partial<Category>): Observable<Category> {
    return this.api.post<Category>('/products/categories', payload);
  }

  updateCategory(id: string, payload: Partial<Category>): Observable<Category> {
    return this.api.patch<Category>(`/products/categories/${id}`, payload);
  }

  deleteCategory(id: string): Observable<void> {
    return this.api.delete<void>(`/products/categories/${id}`);
  }
}
