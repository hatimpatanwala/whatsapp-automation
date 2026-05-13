import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

/**
 * Manages product collections (groupings) for WhatsApp multi-product messages.
 * Collections allow tenants to curate product sets that can be sent as
 * multi-product messages in WhatsApp conversations.
 */
@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async findAll(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const collections = await qr.query(`
        SELECT cc.*,
               COUNT(ccp.id) as product_count
        FROM catalog_collections cc
        LEFT JOIN catalog_collection_products ccp ON ccp.collection_id = cc.id
        WHERE cc.is_active = true
        GROUP BY cc.id
        ORDER BY cc.sort_order, cc.name
      `);
      return collections;
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(`SELECT * FROM catalog_collections WHERE id = $1`, [id]);
      if (!rows[0]) throw new NotFoundException('Collection not found');

      const products = await qr.query(`
        SELECT p.id, p.name, p.slug, p.base_price, p.sale_price, p.thumbnail, p.images,
               ccp.sort_order as collection_sort_order
        FROM catalog_collection_products ccp
        JOIN products p ON p.id = ccp.product_id
        WHERE ccp.collection_id = $1 AND p.is_active = true
        ORDER BY ccp.sort_order, p.name
      `, [id]);

      return { ...rows[0], products };
    });
  }

  async create(schema: string, data: { name: string; description?: string; imageUrl?: string; productIds?: string[] }): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      const result = await qr.query(
        `INSERT INTO catalog_collections (name, description, image_url)
         VALUES ($1, $2, $3) RETURNING *`,
        [data.name, data.description, data.imageUrl],
      );
      const collection = result[0];

      if (data.productIds?.length) {
        for (let i = 0; i < data.productIds.length; i++) {
          await qr.query(
            `INSERT INTO catalog_collection_products (collection_id, product_id, sort_order)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [collection.id, data.productIds[i], i],
          );
        }
      }

      return collection;
    });
  }

  async update(schema: string, id: string, data: { name?: string; description?: string; imageUrl?: string; sortOrder?: number; isActive?: boolean }): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const fields: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (data.name) { fields.push(`name = $${idx++}`); params.push(data.name); }
      if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
      if (data.imageUrl !== undefined) { fields.push(`image_url = $${idx++}`); params.push(data.imageUrl); }
      if (data.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); params.push(data.sortOrder); }
      if (data.isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.isActive); }

      if (fields.length === 0) throw new Error('No fields to update');

      fields.push(`updated_at = NOW()`);
      params.push(id);

      const result = await qr.query(
        `UPDATE catalog_collections SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
      if (!result[0]) throw new NotFoundException('Collection not found');
      return result[0];
    });
  }

  async delete(schema: string, id: string): Promise<void> {
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(`UPDATE catalog_collections SET is_active = false WHERE id = $1`, [id]);
    });
  }

  async addProducts(schema: string, collectionId: string, productIds: string[]): Promise<void> {
    await this.connectionManager.executeInTransaction(schema, async (qr) => {
      const maxOrder = await qr.query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM catalog_collection_products WHERE collection_id = $1`,
        [collectionId],
      );
      let order = maxOrder[0].next_order;

      for (const productId of productIds) {
        await qr.query(
          `INSERT INTO catalog_collection_products (collection_id, product_id, sort_order)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [collectionId, productId, order++],
        );
      }
    });
  }

  async removeProducts(schema: string, collectionId: string, productIds: string[]): Promise<void> {
    const placeholders = productIds.map((_, i) => `$${i + 2}`).join(',');
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `DELETE FROM catalog_collection_products WHERE collection_id = $1 AND product_id IN (${placeholders})`,
        [collectionId, ...productIds],
      );
    });
  }
}
