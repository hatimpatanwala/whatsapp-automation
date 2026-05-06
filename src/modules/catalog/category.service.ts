import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

@Injectable()
export class CategoryService {
  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async findAll(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, name`,
      );
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(`SELECT * FROM categories WHERE id = $1`, [id]);
      if (!result[0]) throw new NotFoundException('Category not found');
      return result[0];
    });
  }

  async create(schema: string, data: { name: string; parentId?: string; sortOrder?: number; translations?: any }): Promise<any> {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `INSERT INTO categories (name, slug, parent_id, sort_order, translations)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [data.name, slug, data.parentId, data.sortOrder || 0, JSON.stringify(data.translations || {})],
      );
      return result[0];
    });
  }

  async update(schema: string, id: string, data: Partial<{ name: string; sortOrder: number; isActive: boolean; translations: any }>): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const fields: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (data.name) { fields.push(`name = $${idx++}`); params.push(data.name); }
      if (data.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); params.push(data.sortOrder); }
      if (data.isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.isActive); }
      if (data.translations) { fields.push(`translations = $${idx++}`); params.push(JSON.stringify(data.translations)); }

      params.push(id);
      const result = await qr.query(
        `UPDATE categories SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
      if (!result[0]) throw new NotFoundException('Category not found');
      return result[0];
    });
  }
}
