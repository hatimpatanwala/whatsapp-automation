import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductService {
  constructor(private readonly connectionManager: TenantConnectionManager) {}

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
        `SELECT p.id, p.name, p.slug, p.description, p.category_id,
                p.base_price as price, p.sale_price as compare_at_price,
                p.slug as sku, p.images as image_urls, p.thumbnail,
                p.is_active, p.sort_order, p.has_variants as track_inventory,
                p.created_at, p.updated_at,
                CASE WHEN p.is_active THEN 'active' ELSE 'draft' END as status,
                COALESCE(i.stock_quantity, 0) as stock_quantity,
                COALESCE(i.low_stock_threshold, 5) as low_stock_threshold,
                COALESCE(p.metadata->>'tags', '[]')::text as tags_json,
                json_build_object('id', c.id, 'name', c.name) as category
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
         ${whereClause}
         ORDER BY p.sort_order, p.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      const mappedProducts = products.map((p: any) => ({
        ...p,
        category: typeof p.category === 'string' ? JSON.parse(p.category) : p.category,
        tags: p.tags_json ? (typeof p.tags_json === 'string' ? JSON.parse(p.tags_json) : p.tags_json) : [],
        variants: [],
      }));

      return new PaginatedResponse(mappedProducts, total, pagination.page, pagination.limit);
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `SELECT p.*, c.name as category_name,
                i.stock_quantity, i.reserved_quantity, i.low_stock_threshold
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

      return { ...result[0], variants };
    });
  }

  async create(schema: string, dto: CreateProductDto): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      const slug = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const product = await qr.query(
        `INSERT INTO products (name, slug, description, category_id, base_price, sale_price, currency, images, thumbnail, has_variants, translations, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          dto.name, slug, dto.description, dto.categoryId,
          dto.basePrice, dto.salePrice, dto.currency || 'INR',
          dto.images || [], dto.thumbnail, dto.hasVariants || false,
          JSON.stringify(dto.translations || {}), JSON.stringify(dto.metadata || {}),
        ],
      );

      // Create inventory record
      if (!dto.hasVariants) {
        await qr.query(
          `INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold)
           VALUES ($1, $2, $3)`,
          [product[0].id, dto.initialStock || 0, dto.lowStockThreshold || 5],
        );
      }

      return product[0];
    });
  }

  async update(schema: string, id: string, dto: Partial<CreateProductDto>): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const fields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (dto.name) { fields.push(`name = $${paramIndex++}`); params.push(dto.name); }
      if (dto.description !== undefined) { fields.push(`description = $${paramIndex++}`); params.push(dto.description); }
      if (dto.basePrice) { fields.push(`base_price = $${paramIndex++}`); params.push(dto.basePrice); }
      if (dto.salePrice !== undefined) { fields.push(`sale_price = $${paramIndex++}`); params.push(dto.salePrice); }
      if (dto.categoryId) { fields.push(`category_id = $${paramIndex++}`); params.push(dto.categoryId); }
      if (dto.images) { fields.push(`images = $${paramIndex++}`); params.push(dto.images); }
      if (dto.translations) { fields.push(`translations = $${paramIndex++}`); params.push(JSON.stringify(dto.translations)); }

      fields.push(`updated_at = NOW()`);
      params.push(id);

      const result = await qr.query(
        `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params,
      );

      if (!result[0]) throw new NotFoundException('Product not found');
      return result[0];
    });
  }

  async delete(schema: string, id: string): Promise<void> {
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(`UPDATE products SET is_active = false WHERE id = $1`, [id]);
    });
  }
}
