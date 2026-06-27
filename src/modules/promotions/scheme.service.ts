import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

export interface SchemeInput {
  name: string;
  description?: string;
  type?: 'instant' | 'cumulative';
  action?: string;          // 'discount' | 'buy_x_get_y_free' | 'buy_x_get_x_free' | 'qty_discount' | 'gift'
  scope?: 'all' | 'category' | 'brand' | 'product';
  scopeIds?: string[];
  conditions?: Record<string, any>;
  reward?: Record<string, any>;
  weight?: number;
  combinable?: boolean;
  audience?: 'all' | 'specific';
  customerIds?: string[];
  validFrom?: string | null;
  validUntil?: string | null;
  status?: string;
}

@Injectable()
export class SchemeService {
  constructor(private readonly conn: TenantConnectionManager) {}

  async findAll(schema: string, params?: { status?: string; type?: string }): Promise<any[]> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      const where: string[] = ['1=1'];
      const p: any[] = [];
      if (params?.status) { p.push(params.status); where.push(`status = $${p.length}`); }
      if (params?.type) { p.push(params.type); where.push(`type = $${p.length}`); }
      return qr.query(
        `SELECT *, (SELECT COUNT(*)::int FROM scheme_customers sc WHERE sc.scheme_id = s.id) AS targeted_count
           FROM schemes s WHERE ${where.join(' AND ')} ORDER BY weight DESC, created_at DESC`,
        p,
      );
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      const r = await qr.query(`SELECT * FROM schemes WHERE id = $1`, [id]);
      if (!r[0]) throw new NotFoundException('Scheme not found');
      const customers = await qr.query(`SELECT customer_id FROM scheme_customers WHERE scheme_id = $1`, [id]);
      return { ...r[0], customerIds: customers.map((c: any) => c.customer_id) };
    });
  }

  async create(schema: string, data: SchemeInput, userId?: string): Promise<any> {
    return this.conn.executeInTransaction(schema, async (qr) => {
      const r = await qr.query(
        `INSERT INTO schemes
           (name, description, type, action, scope, scope_ids, conditions, reward, weight, combinable, audience, valid_from, valid_until, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [
          data.name, data.description || null, data.type || 'instant', data.action || 'discount',
          data.scope || 'all', data.scopeIds || [], JSON.stringify(data.conditions || {}),
          JSON.stringify(data.reward || {}), Number(data.weight) || 0, !!data.combinable,
          data.audience || 'all', data.validFrom || null, data.validUntil || null,
          data.status || 'active', userId || null,
        ],
      );
      const scheme = r[0];
      if (data.audience === 'specific' && Array.isArray(data.customerIds)) {
        for (const cid of data.customerIds) {
          await qr.query(
            `INSERT INTO scheme_customers (scheme_id, customer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [scheme.id, cid],
          );
        }
      }
      return scheme;
    });
  }

  async update(schema: string, id: string, data: Partial<SchemeInput>): Promise<any> {
    await this.conn.executeInTransaction(schema, async (qr) => {
      const map: Record<string, any> = {
        name: data.name, description: data.description, type: data.type, action: data.action,
        scope: data.scope, scope_ids: data.scopeIds,
        conditions: data.conditions !== undefined ? JSON.stringify(data.conditions) : undefined,
        reward: data.reward !== undefined ? JSON.stringify(data.reward) : undefined,
        weight: data.weight, combinable: data.combinable, audience: data.audience,
        valid_from: data.validFrom, valid_until: data.validUntil, status: data.status,
      };
      const fields: string[] = [];
      const p: any[] = [];
      for (const [col, val] of Object.entries(map)) {
        if (val !== undefined) { p.push(val); fields.push(`${col} = $${p.length}`); }
      }
      if (fields.length) {
        fields.push(`updated_at = NOW()`);
        p.push(id);
        const r = await qr.query(`UPDATE schemes SET ${fields.join(', ')} WHERE id = $${p.length} RETURNING id`, p);
        if (!r[0]) throw new NotFoundException('Scheme not found');
      }
      if (data.audience === 'specific' && Array.isArray(data.customerIds)) {
        await qr.query(`DELETE FROM scheme_customers WHERE scheme_id = $1`, [id]);
        for (const cid of data.customerIds) {
          await qr.query(`INSERT INTO scheme_customers (scheme_id, customer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, cid]);
        }
      }
    });
    return this.findById(schema, id);
  }

  async setStatus(schema: string, id: string, status: string): Promise<any> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      const r = await qr.query(`UPDATE schemes SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [status, id]);
      if (!r[0]) throw new NotFoundException('Scheme not found');
      return r[0];
    });
  }

  async delete(schema: string, id: string): Promise<{ deleted: boolean }> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      await qr.query(`DELETE FROM schemes WHERE id = $1`, [id]);
      return { deleted: true };
    });
  }
}
