import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

@Injectable()
export class BrandService {
  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async findAll(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(`SELECT * FROM brands WHERE is_active = true ORDER BY sort_order, name`);
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const r = await qr.query(`SELECT * FROM brands WHERE id = $1`, [id]);
      if (!r[0]) throw new NotFoundException('Brand not found');
      return r[0];
    });
  }

  async create(
    schema: string,
    data: { name: string; description?: string; logoUrl?: string; sortOrder?: number },
  ): Promise<any> {
    const base = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      // Keep slug unique within the tenant.
      const dup = await qr.query(`SELECT 1 FROM brands WHERE slug = $1 LIMIT 1`, [base]);
      const slug = dup.length ? `${base}-${Date.now().toString(36)}` : base;
      const r = await qr.query(
        `INSERT INTO brands (name, slug, description, logo_url, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [data.name, slug, data.description || null, data.logoUrl || null, data.sortOrder || 0],
      );
      return r[0];
    });
  }

  async update(
    schema: string,
    id: string,
    data: Partial<{ name: string; description: string; logoUrl: string; sortOrder: number; isActive: boolean }>,
  ): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const fields: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
      if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
      if (data.logoUrl !== undefined) { fields.push(`logo_url = $${idx++}`); params.push(data.logoUrl); }
      if (data.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); params.push(data.sortOrder); }
      if (data.isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.isActive); }
      if (!fields.length) return this.findById(schema, id);
      fields.push(`updated_at = NOW()`);
      params.push(id);
      const r = await qr.query(`UPDATE brands SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, params);
      if (!r[0]) throw new NotFoundException('Brand not found');
      return r[0];
    });
  }

  /** Soft-delete (products may still reference it). */
  async delete(schema: string, id: string): Promise<{ deleted: boolean }> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(`UPDATE brands SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
      return { deleted: true };
    });
  }
}
