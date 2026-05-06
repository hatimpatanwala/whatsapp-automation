import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

@Injectable()
export class AddressService {
  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async findByCustomer(schema: string, customerId: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(`SELECT * FROM addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC`, [customerId]);
    });
  }

  async create(schema: string, customerId: string, data: any): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      // If this is the first or marked as default, unset others
      if (data.isDefault) {
        await qr.query(`UPDATE addresses SET is_default = false WHERE customer_id = $1`, [customerId]);
      }

      const result = await qr.query(
        `INSERT INTO addresses (customer_id, label, full_address, city, state, pincode, landmark, latitude, longitude, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [customerId, data.label || 'home', data.fullAddress, data.city, data.state, data.pincode, data.landmark, data.latitude, data.longitude, data.isDefault || false],
      );
      return result[0];
    });
  }

  async delete(schema: string, addressId: string): Promise<void> {
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(`DELETE FROM addresses WHERE id = $1`, [addressId]);
    });
  }
}
