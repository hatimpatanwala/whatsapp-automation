import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class CustomerService {
  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async findAll(schema: string, pagination: PaginationDto, search?: string): Promise<PaginatedResponse<any>> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let whereClause = '1=1';
      const params: any[] = [];

      if (search) {
        params.push(`%${search}%`);
        whereClause += ` AND (phone LIKE $${params.length} OR name ILIKE $${params.length})`;
      }

      const countResult = await qr.query(`SELECT COUNT(*) as total FROM customers WHERE ${whereClause}`, params);
      const total = parseInt(countResult[0].total);

      params.push(pagination.limit, pagination.skip);
      const customers = await qr.query(
        `SELECT * FROM customers WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return new PaginatedResponse(customers, total, pagination.page, pagination.limit);
    });
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(`SELECT * FROM customers WHERE id = $1`, [id]);
      if (!result[0]) throw new NotFoundException('Customer not found');
      return result[0];
    });
  }

  async findByPhone(schema: string, phone: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(`SELECT * FROM customers WHERE phone = $1`, [phone]);
      return result[0] || null;
    });
  }

  async updateTags(schema: string, customerId: string, tags: string[]): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `UPDATE customers SET tags = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [tags, customerId],
      );
      return result[0];
    });
  }

  async getCustomerOrders(schema: string, customerId: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT * FROM orders WHERE customer_id = $1 ORDER BY placed_at DESC`, [customerId],
      );
    });
  }

  async getSegmentedCustomers(schema: string, rules: any): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let whereClause = 'opted_in = true';
      const params: any[] = [];

      if (rules.tags && rules.tags.length > 0) {
        params.push(rules.tags);
        whereClause += ` AND tags && $${params.length}`;
      }
      if (rules.minOrders) {
        params.push(rules.minOrders);
        whereClause += ` AND total_orders >= $${params.length}`;
      }
      if (rules.minSpent) {
        params.push(rules.minSpent);
        whereClause += ` AND total_spent >= $${params.length}`;
      }
      if (rules.lastOrderAfter) {
        params.push(rules.lastOrderAfter);
        whereClause += ` AND last_order_at >= $${params.length}`;
      }

      return qr.query(`SELECT * FROM customers WHERE ${whereClause}`, params);
    });
  }
}
