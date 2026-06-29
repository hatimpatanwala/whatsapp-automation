import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

export type CustomFieldEntity = 'customer' | 'product';

export interface CustomFieldDefinitionInput {
  entity: CustomFieldEntity;
  fieldKey?: string;
  label: string;
  fieldType?: string;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  isRequired?: boolean;
  collectFromCustomer?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'boolean', 'phone', 'email'];

/**
 * Admin-defined custom fields for customers and products. Definitions live in
 * `custom_field_definitions`; the actual values are stored in a `custom_fields`
 * JSONB on each customer/product row (keyed by field_key). Customer fields can
 * be marked required (gate workflows) and/or collected on the onboarding webview.
 */
@Injectable()
export class CustomFieldService {
  constructor(private readonly conn: TenantConnectionManager) {}

  private slugify(s: string): string {
    return (s || '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'field';
  }

  async list(schema: string, entity?: CustomFieldEntity): Promise<any[]> {
    return this.conn.executeInTenantContext(schema, (qr) =>
      entity
        ? qr.query(`SELECT * FROM custom_field_definitions WHERE entity = $1 ORDER BY sort_order, created_at`, [entity])
        : qr.query(`SELECT * FROM custom_field_definitions ORDER BY entity, sort_order, created_at`));
  }

  /** Active definitions only — used by the product form, onboarding webview, etc. */
  async listActive(schema: string, entity: CustomFieldEntity): Promise<any[]> {
    return this.conn.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT * FROM custom_field_definitions WHERE entity = $1 AND is_active = true ORDER BY sort_order, created_at`, [entity]));
  }

  /** Required + active customer fields — used to gate workflows / drive onboarding. */
  async requiredCustomerFields(schema: string): Promise<any[]> {
    return this.conn.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT * FROM custom_field_definitions WHERE entity = 'customer' AND is_active = true AND is_required = true ORDER BY sort_order, created_at`));
  }

  async create(schema: string, input: CustomFieldDefinitionInput): Promise<any> {
    if (input.entity !== 'customer' && input.entity !== 'product') throw new BadRequestException('entity must be customer or product.');
    if (!input.label?.trim()) throw new BadRequestException('A label is required.');
    const fieldType = FIELD_TYPES.includes(input.fieldType || '') ? input.fieldType : 'text';
    const key = this.slugify(input.fieldKey || input.label);

    return this.conn.executeInTenantContext(schema, async (qr) => {
      const dup = (await qr.query(`SELECT 1 FROM custom_field_definitions WHERE entity = $1 AND field_key = $2`, [input.entity, key]))[0];
      if (dup) throw new BadRequestException(`A "${input.entity}" field with key "${key}" already exists.`);
      const rows = await qr.query(
        `INSERT INTO custom_field_definitions
           (entity, field_key, label, field_type, options, placeholder, help_text, is_required, collect_from_customer, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          input.entity, key, input.label.trim(), fieldType, JSON.stringify(input.options || []),
          input.placeholder || null, input.helpText || null,
          !!input.isRequired, !!input.collectFromCustomer, Number(input.sortOrder) || 0,
          input.isActive === undefined ? true : !!input.isActive,
        ],
      );
      return rows[0];
    });
  }

  async update(schema: string, id: string, input: Partial<CustomFieldDefinitionInput>): Promise<any> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      const sets: string[] = [];
      const params: any[] = [];
      let i = 1;
      const push = (col: string, val: any) => { sets.push(`${col} = $${i++}`); params.push(val); };
      if (input.label !== undefined) push('label', input.label.trim());
      if (input.fieldType !== undefined) push('field_type', FIELD_TYPES.includes(input.fieldType) ? input.fieldType : 'text');
      if (input.options !== undefined) push('options', JSON.stringify(input.options || []));
      if (input.placeholder !== undefined) push('placeholder', input.placeholder || null);
      if (input.helpText !== undefined) push('help_text', input.helpText || null);
      if (input.isRequired !== undefined) push('is_required', !!input.isRequired);
      if (input.collectFromCustomer !== undefined) push('collect_from_customer', !!input.collectFromCustomer);
      if (input.sortOrder !== undefined) push('sort_order', Number(input.sortOrder) || 0);
      if (input.isActive !== undefined) push('is_active', !!input.isActive);
      if (!sets.length) return (await qr.query(`SELECT * FROM custom_field_definitions WHERE id = $1`, [id]))[0];
      sets.push(`updated_at = NOW()`);
      params.push(id);
      const rows = await qr.query(`UPDATE custom_field_definitions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
      return rows[0];
    });
  }

  async remove(schema: string, id: string): Promise<{ deleted: boolean }> {
    await this.conn.executeInTenantContext(schema, (qr) =>
      qr.query(`DELETE FROM custom_field_definitions WHERE id = $1`, [id]));
    return { deleted: true };
  }
}
