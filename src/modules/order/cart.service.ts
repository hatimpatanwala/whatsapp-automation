import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

@Injectable()
export class CartService {
  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async getActiveCart(schema: string, customerId: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const cart = await qr.query(
        `SELECT c.id, c.status FROM carts c WHERE c.customer_id = $1 AND c.status = 'active'`,
        [customerId],
      );
      if (!cart[0]) return { items: [], total: 0 };

      const items = await qr.query(
        `SELECT ci.*, p.name as product_name, p.thumbnail
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.cart_id = $1`,
        [cart[0].id],
      );

      const total = items.reduce((sum: number, item: any) => sum + item.quantity * parseFloat(item.unit_price), 0);

      return { cartId: cart[0].id, items, total };
    });
  }

  async addItem(schema: string, customerId: string, productId: string, variantId: string | null, quantity: number): Promise<any> {
    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      // Get or create cart
      let cart = await qr.query(
        `SELECT id FROM carts WHERE customer_id = $1 AND status = 'active'`, [customerId],
      );
      if (!cart[0]) {
        cart = await qr.query(
          `INSERT INTO carts (customer_id, status) VALUES ($1, 'active') RETURNING id`, [customerId],
        );
      }

      // Get product price
      let price: number;
      if (variantId) {
        const variant = await qr.query(`SELECT price FROM product_variants WHERE id = $1`, [variantId]);
        price = parseFloat(variant[0].price);
      } else {
        const product = await qr.query(`SELECT COALESCE(sale_price, base_price) as price FROM products WHERE id = $1`, [productId]);
        price = parseFloat(product[0].price);
      }

      // Check if item exists
      const existing = await qr.query(
        `SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2 AND (variant_id = $3 OR ($3 IS NULL AND variant_id IS NULL))`,
        [cart[0].id, productId, variantId],
      );

      if (existing[0]) {
        await qr.query(
          `UPDATE cart_items SET quantity = quantity + $1 WHERE id = $2`,
          [quantity, existing[0].id],
        );
      } else {
        await qr.query(
          `INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)`,
          [cart[0].id, productId, variantId, quantity, price],
        );
      }

      return this.getActiveCart(schema, customerId);
    });
  }

  async updateItemQuantity(schema: string, customerId: string, itemId: string, quantity: number): Promise<any> {
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      if (quantity <= 0) {
        await qr.query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);
      } else {
        await qr.query(`UPDATE cart_items SET quantity = $1 WHERE id = $2`, [quantity, itemId]);
      }
    });
    return this.getActiveCart(schema, customerId);
  }

  async removeItem(schema: string, customerId: string, itemId: string): Promise<any> {
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);
    });
    return this.getActiveCart(schema, customerId);
  }

  async clearCart(schema: string, customerId: string): Promise<void> {
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `UPDATE carts SET status = 'abandoned', updated_at = NOW() WHERE customer_id = $1 AND status = 'active'`,
        [customerId],
      );
    });
  }
}
