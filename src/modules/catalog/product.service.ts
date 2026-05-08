import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { MetaCatalogSyncService } from './meta-catalog-sync.service';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    @Optional() private readonly catalogSync?: MetaCatalogSyncService,
  ) {}

  private mapProductResponse(row: any): any {
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    const tags = metadata.tags || [];

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      shortDescription: metadata.shortDescription || '',
      categoryId: row.category_id,
      category: row.category
        ? (typeof row.category === 'string' ? JSON.parse(row.category) : row.category)
        : row.category_name ? { id: row.category_id, name: row.category_name } : undefined,
      price: parseFloat(row.base_price) || 0,
      compareAtPrice: row.sale_price ? parseFloat(row.sale_price) : null,
      sku: metadata.sku || row.slug || '',
      barcode: metadata.barcode || '',
      imageUrls: row.images || [],
      thumbnail: row.thumbnail,
      status: row.is_active ? 'active' : 'draft',
      trackInventory: row.has_variants === false,
      stockQuantity: parseInt(row.stock_quantity) || 0,
      lowStockThreshold: parseInt(row.low_stock_threshold) || 5,
      weight: metadata.weight || null,
      tags,
      variants: row.variants || [],
      sortOrder: row.sort_order,
      metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findAll(schema: string, pagination: PaginationDto, categoryId?: string): Promise<PaginatedResponse<any>> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let whereClause = 'WHERE p.is_active = true';
      const params: any[] = [];

      if (categoryId) {
        params.push(categoryId);
        whereClause += ` AND p.category_id = $${params.length}`;
      }

      const countResult = await qr.query(
        `SELECT COUNT(*) as total FROM products p ${whereClause}`,
        params,
      );
      const total = parseInt(countResult[0].total);

      params.push(pagination.limit);
      params.push(pagination.skip);
      const products = await qr.query(
        `SELECT p.*,
                COALESCE(i.stock_quantity, 0) as stock_quantity,
                COALESCE(i.low_stock_threshold, 5) as low_stock_threshold,
                json_build_object('id', c.id, 'name', c.name) as category
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
         ${whereClause}
         ORDER BY p.sort_order, p.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      const mappedProducts = products.map((p: any) => this.mapProductResponse(p));
      return new PaginatedResponse(mappedProducts, total, pagination.page, pagination.limit);
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `SELECT p.*, c.name as category_name,
                COALESCE(i.stock_quantity, 0) as stock_quantity,
                COALESCE(i.reserved_quantity, 0) as reserved_quantity,
                COALESCE(i.low_stock_threshold, 5) as low_stock_threshold
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
         WHERE p.id = $1`,
        [id],
      );

      if (!result[0]) throw new NotFoundException('Product not found');

      // Get variants
      const variants = await qr.query(
        `SELECT pv.*, i.stock_quantity, i.reserved_quantity
         FROM product_variants pv
         LEFT JOIN inventory i ON i.variant_id = pv.id
         WHERE pv.product_id = $1 AND pv.is_active = true`,
        [id],
      );

      return this.mapProductResponse({ ...result[0], variants });
    });
  }

  private normalizeDto(dto: CreateProductDto) {
    // Map frontend field names to internal names
    const basePrice = dto.basePrice ?? dto.price ?? 0;
    const salePrice = dto.salePrice ?? dto.compareAtPrice;
    const images = dto.images || dto.imageUrls || [];
    const stock = dto.initialStock ?? dto.stockQuantity ?? 0;
    const isActive = !dto.status || dto.status === 'active';
    const tags = dto.tags || [];
    const metadata = { ...(dto.metadata || {}), tags, shortDescription: dto.shortDescription, sku: dto.sku, barcode: dto.barcode, weight: dto.weight };

    return { basePrice, salePrice, images, stock, isActive, metadata };
  }

  async create(schema: string, dto: CreateProductDto): Promise<any> {
    const norm = this.normalizeDto(dto);

    const result = await this.connectionManager.executeInTransaction(schema, async (qr) => {
      const slug = dto.sku || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const product = await qr.query(
        `INSERT INTO products (name, slug, description, category_id, base_price, sale_price, currency, images, thumbnail, has_variants, is_active, translations, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          dto.name, slug, dto.description, dto.categoryId,
          norm.basePrice, norm.salePrice, dto.currency || 'INR',
          norm.images, dto.thumbnail, dto.hasVariants || false,
          norm.isActive,
          JSON.stringify(dto.translations || {}), JSON.stringify(norm.metadata),
        ],
      );

      // Create inventory record
      if (!dto.hasVariants) {
        await qr.query(
          `INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold)
           VALUES ($1, $2, $3)`,
          [product[0].id, norm.stock, dto.lowStockThreshold || 5],
        );
      }

      return product[0];
    });

    // Sync to Meta catalog (fire-and-forget)
    this.catalogSync?.syncProduct(schema, result.id).catch((err) =>
      this.logger.warn(`Meta catalog sync failed for new product ${result.id}: ${err.message}`),
    );

    // Return the full product with inventory for consistent response
    return this.findById(schema, result.id);
  }

  async update(schema: string, id: string, dto: Partial<CreateProductDto>): Promise<any> {
    const updated = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const fields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (dto.name) { fields.push(`name = $${paramIndex++}`); params.push(dto.name); }
      if (dto.description !== undefined) { fields.push(`description = $${paramIndex++}`); params.push(dto.description); }

      const basePrice = dto.basePrice ?? dto.price;
      if (basePrice !== undefined) { fields.push(`base_price = $${paramIndex++}`); params.push(basePrice); }

      const salePrice = dto.salePrice ?? dto.compareAtPrice;
      if (salePrice !== undefined) { fields.push(`sale_price = $${paramIndex++}`); params.push(salePrice); }

      if (dto.categoryId) { fields.push(`category_id = $${paramIndex++}`); params.push(dto.categoryId); }

      const images = dto.images || dto.imageUrls;
      if (images) { fields.push(`images = $${paramIndex++}`); params.push(images); }

      if (dto.status) {
        fields.push(`is_active = $${paramIndex++}`);
        params.push(dto.status === 'active');
      }

      if (dto.translations) { fields.push(`translations = $${paramIndex++}`); params.push(JSON.stringify(dto.translations)); }

      // Store extra fields in metadata
      if (dto.tags || dto.shortDescription || dto.sku || dto.barcode || dto.weight) {
        fields.push(`metadata = metadata || $${paramIndex++}`);
        const metaPatch: Record<string, any> = {};
        if (dto.tags) metaPatch.tags = dto.tags;
        if (dto.shortDescription !== undefined) metaPatch.shortDescription = dto.shortDescription;
        if (dto.sku !== undefined) metaPatch.sku = dto.sku;
        if (dto.barcode !== undefined) metaPatch.barcode = dto.barcode;
        if (dto.weight !== undefined) metaPatch.weight = dto.weight;
        params.push(JSON.stringify(metaPatch));
      }

      // Update inventory if stock fields changed
      const stockQty = dto.stockQuantity ?? dto.initialStock;
      if (stockQty !== undefined || dto.lowStockThreshold !== undefined) {
        const invFields: string[] = [];
        const invParams: any[] = [id];
        let invIdx = 2;
        if (stockQty !== undefined) { invFields.push(`stock_quantity = $${invIdx++}`); invParams.push(stockQty); }
        if (dto.lowStockThreshold !== undefined) { invFields.push(`low_stock_threshold = $${invIdx++}`); invParams.push(dto.lowStockThreshold); }
        if (invFields.length > 0) {
          await qr.query(
            `UPDATE inventory SET ${invFields.join(', ')} WHERE product_id = $1 AND variant_id IS NULL`,
            invParams,
          );
        }
      }

      fields.push(`updated_at = NOW()`);
      params.push(id);

      const result = await qr.query(
        `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params,
      );

      if (!result[0]) throw new NotFoundException('Product not found');
      return result[0];
    });

    // Sync updated product to Meta catalog (fire-and-forget)
    this.catalogSync?.syncProduct(schema, id).catch((err) =>
      this.logger.warn(`Meta catalog sync failed for updated product ${id}: ${err.message}`),
    );

    // Return the full product with inventory for consistent response
    return this.findById(schema, id);
  }

  async delete(schema: string, id: string): Promise<void> {
    // Get slug before soft-deleting so we can remove from Meta catalog
    let slug: string | undefined;
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(`SELECT slug FROM products WHERE id = $1`, [id]);
      slug = rows[0]?.slug;
      await qr.query(`UPDATE products SET is_active = false WHERE id = $1`, [id]);
    });

    // Remove from Meta catalog (fire-and-forget)
    this.catalogSync?.removeProduct(schema, id, slug || '').catch((err) =>
      this.logger.warn(`Meta catalog removal failed for product ${id}: ${err.message}`),
    );
  }
}
