import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

@Injectable()
export class SegmentService {
  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async findAll(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(`SELECT * FROM campaign_segments ORDER BY created_at DESC`);
    });
  }

  async create(schema: string, data: { name: string; rules: any }): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      // Count matching customers
      const customers = await this.getCustomersForSegment(schema, data.rules);

      const result = await qr.query(
        `INSERT INTO campaign_segments (name, rules, customer_count) VALUES ($1, $2, $3) RETURNING *`,
        [data.name, JSON.stringify(data.rules), customers.length],
      );
      return result[0];
    });
  }

  async getCustomersForSegment(schema: string, rules: any): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let whereClause = 'opted_in = true';
      const params: any[] = [];

      if (rules.tags && rules.tags.length > 0) {
        params.push(rules.tags);
        whereClause += ` AND tags && $${params.length}::text[]`;
      }
      if (rules.minOrders) {
        params.push(rules.minOrders);
        whereClause += ` AND total_orders >= $${params.length}`;
      }
      if (rules.minSpent) {
        params.push(rules.minSpent);
        whereClause += ` AND total_spent >= $${params.length}`;
      }
      if (rules.language) {
        params.push(rules.language);
        whereClause += ` AND language = $${params.length}`;
      }

      return qr.query(`SELECT id, phone, name, language FROM customers WHERE ${whereClause}`, params);
    });
  }
}
