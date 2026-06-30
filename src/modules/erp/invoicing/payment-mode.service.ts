import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { BaseTenantCrudService, CrudConfig } from '../common/base-tenant-crud.service';

export interface PaymentModeDto {
  name?: string;
  description?: string;
  ref?: string;
  is_default?: boolean;
  enabled?: boolean;
}

/**
 * Payment methods (Cash / UPI / Bank Transfer / …) — IDURAR `PaymentMode`.
 * A thin CRUD module built on BaseTenantCrudService, with one business rule:
 * at most one mode is the default (setting a new default clears the others).
 */
@Injectable()
export class PaymentModeService extends BaseTenantCrudService {
  protected readonly config: CrudConfig = {
    table: 'payment_modes',
    insertable: ['name', 'description', 'ref', 'is_default', 'enabled'],
    updatable: ['name', 'description', 'ref', 'is_default', 'enabled'],
    searchable: ['name', 'description'],
    filterable: ['enabled', 'is_default'],
    defaultOrderBy: 'created_at',
    softDelete: true,
  };

  constructor(cm: TenantConnectionManager) {
    super(cm);
  }

  async create(schema: string, dto: PaymentModeDto) {
    const created = await super.create(schema, dto);
    if (dto.is_default) await this.clearOtherDefaults(schema, created.id);
    return created;
  }

  async update(schema: string, id: string, dto: PaymentModeDto) {
    const updated = await super.update(schema, id, dto);
    if (dto.is_default) await this.clearOtherDefaults(schema, id);
    return updated;
  }

  /** Ensure only `keepId` carries is_default = true. */
  private async clearOtherDefaults(schema: string, keepId: string): Promise<void> {
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `UPDATE "${schema}".payment_modes
         SET is_default = false, updated_at = NOW()
         WHERE id <> $1 AND is_default = true`,
        [keepId],
      ),
    );
  }
}
