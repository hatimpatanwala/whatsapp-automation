import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async findAll(schema: string, filters?: { status?: string; customerId?: string; page?: number; limit?: number }) {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const page = filters?.page || 1;
      const limit = filters?.limit || 50;
      const offset = (page - 1) * limit;
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (filters?.status) {
        conditions.push(`q.status = $${paramIdx++}`);
        params.push(filters.status);
      }
      if (filters?.customerId) {
        conditions.push(`q.customer_id = $${paramIdx++}`);
        params.push(filters.customerId);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await qr.query(
        `SELECT COUNT(*) as total FROM quotes q ${where}`,
        params,
      );
      const total = parseInt(countResult[0].total);

      const quotes = await qr.query(
        `SELECT q.*, c.name as customer_name, c.phone as customer_phone
         FROM quotes q
         LEFT JOIN customers c ON c.id = q.customer_id
         ${where}
         ORDER BY q.created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset],
      );

      return { data: quotes, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }

  async findById(schema: string, id: string) {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `SELECT q.*, c.name as customer_name, c.phone as customer_phone
         FROM quotes q
         LEFT JOIN customers c ON c.id = q.customer_id
         WHERE q.id = $1`,
        [id],
      );
      if (!result[0]) return null;

      const items = await qr.query(
        `SELECT qi.*, p.name as product_name, p.image_url as product_image
         FROM quote_items qi
         LEFT JOIN products p ON p.id = qi.product_id
         WHERE qi.quote_id = $1
         ORDER BY qi.sort_order ASC`,
        [id],
      );

      return { ...result[0], items };
    });
  }

  async create(schema: string, data: {
    customerId: string;
    title?: string;
    notes?: string;
    validUntil?: string;
    items: { productId?: string; description: string; quantity: number; unitPrice: number }[];
  }) {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const taxRate = 0;
      const taxAmount = subtotal * taxRate;
      const totalAmount = subtotal + taxAmount;

      // Generate quote number
      const seqResult = await qr.query(
        `SELECT COALESCE(MAX(quote_number_seq), 0) + 1 as next_seq FROM quotes`,
      );
      const nextSeq = seqResult[0].next_seq;
      const quoteNumber = `QT-${String(nextSeq).padStart(5, '0')}`;

      const quoteResult = await qr.query(
        `INSERT INTO quotes (quote_number, quote_number_seq, customer_id, title, notes, valid_until, subtotal, tax_rate, tax_amount, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft')
         RETURNING *`,
        [quoteNumber, nextSeq, data.customerId, data.title || quoteNumber, data.notes, data.validUntil, subtotal, taxRate, taxAmount, totalAmount],
      );
      const quote = quoteResult[0];

      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const lineTotal = item.quantity * item.unitPrice;
        await qr.query(
          `INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, line_total, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [quote.id, item.productId || null, item.description, item.quantity, item.unitPrice, lineTotal, i],
        );
      }

      return this.findById(schema, quote.id);
    });
  }

  async update(schema: string, id: string, data: {
    title?: string;
    notes?: string;
    validUntil?: string;
    customerId?: string;
    items?: { productId?: string; description: string; quantity: number; unitPrice: number }[];
    taxRate?: number;
  }) {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const existing = await qr.query(`SELECT * FROM quotes WHERE id = $1`, [id]);
      if (!existing[0]) return null;

      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (data.title !== undefined) { updates.push(`title = $${idx++}`); params.push(data.title); }
      if (data.notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(data.notes); }
      if (data.validUntil !== undefined) { updates.push(`valid_until = $${idx++}`); params.push(data.validUntil); }
      if (data.customerId !== undefined) { updates.push(`customer_id = $${idx++}`); params.push(data.customerId); }

      if (data.items) {
        const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        const taxRate = data.taxRate ?? existing[0].tax_rate ?? 0;
        const taxAmount = subtotal * taxRate;
        const totalAmount = subtotal + taxAmount;

        updates.push(`subtotal = $${idx++}`); params.push(subtotal);
        updates.push(`tax_rate = $${idx++}`); params.push(taxRate);
        updates.push(`tax_amount = $${idx++}`); params.push(taxAmount);
        updates.push(`total_amount = $${idx++}`); params.push(totalAmount);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        params.push(id);
        await qr.query(`UPDATE quotes SET ${updates.join(', ')} WHERE id = $${idx}`, params);
      }

      if (data.items) {
        await qr.query(`DELETE FROM quote_items WHERE quote_id = $1`, [id]);
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          const lineTotal = item.quantity * item.unitPrice;
          await qr.query(
            `INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, line_total, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, item.productId || null, item.description, item.quantity, item.unitPrice, lineTotal, i],
          );
        }
      }

      return this.findById(schema, id);
    });
  }

  async updateStatus(schema: string, id: string, status: string) {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      const extra: string[] = [];
      if (status === 'sent') extra.push(`sent_at = NOW()`);
      if (status === 'accepted') extra.push(`accepted_at = NOW()`);
      if (status === 'converted') extra.push(`converted_at = NOW()`);

      const setClauses = [`status = $1`, `updated_at = NOW()`, ...extra];

      await qr.query(
        `UPDATE quotes SET ${setClauses.join(', ')} WHERE id = $2`,
        [status, id],
      );

      return this.findById(schema, id);
    });
  }

  async delete(schema: string, id: string) {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(`DELETE FROM quote_items WHERE quote_id = $1`, [id]);
      await qr.query(`DELETE FROM quotes WHERE id = $1`, [id]);
      return { deleted: true };
    });
  }

  async getStats(schema: string) {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const stats = await qr.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'draft') as draft,
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
          COUNT(*) FILTER (WHERE status = 'converted') as converted,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'accepted'), 0) as accepted_value,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'converted'), 0) as converted_value,
          COALESCE(SUM(total_amount), 0) as total_value
        FROM quotes
      `);
      return stats[0];
    });
  }

  async duplicate(schema: string, id: string) {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const original = await this.findById(schema, id);
      if (!original) return null;

      return this.create(schema, {
        customerId: original.customer_id,
        title: `${original.title} (Copy)`,
        notes: original.notes,
        items: original.items.map((item: any) => ({
          productId: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unit_price),
        })),
      });
    });
  }
}
