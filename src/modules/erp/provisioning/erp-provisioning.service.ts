import { Injectable, Logger } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { PlanFeatureService } from '../common/plan-feature.service';

export interface ErpStatus {
  /** True when the tenant's active plan includes the `erp` feature. */
  enabled: boolean;
  /** The full plan feature map (erp, erpInvoicing, erpCrm, …). */
  features: Record<string, boolean>;
  /** True once one-time ERP seeding/backfill has run for this tenant. */
  provisioned: boolean;
  /** True when the tenant HAD ERP (provisioned) but their plan no longer includes
   *  it — they keep read-only access to their data until they re-upgrade. */
  readOnly: boolean;
}

/**
 * Owns the lifecycle of a tenant's ERP layer under the "unify & extend" model:
 *
 *  - enable(): idempotent. Runs the one-time setup the first time a tenant lands
 *    on an ERP plan — seed reference data, backfill document numbers — and marks
 *    the schema `erp_provisioned`. Safe to call repeatedly; re-enabling after a
 *    downgrade is effectively a no-op because provisioning already happened.
 *  - archive(): on downgrade. Deletes nothing — ERP-only data is preserved and
 *    simply becomes inaccessible (the plan no longer carries `features.erp`, so
 *    ErpFeatureGuard blocks ERP routes). Records when archiving happened.
 *
 * Because data is unified (ERP enriches existing invoices/customers/products and
 * adds new tables in the same schema), a plan change copies zero rows. The only
 * state is the provisioning marker + the plan feature flag.
 */
@Injectable()
export class ErpProvisioningService {
  private readonly logger = new Logger(ErpProvisioningService.name);

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly planFeatures: PlanFeatureService,
  ) {}

  async getStatus(tenantId: string, schema: string): Promise<ErpStatus> {
    const features = await this.planFeatures.getFeatures(tenantId);
    const provisioned = (await this.getSetting<boolean>(schema, 'erp_provisioned')) === true;
    const enabled = features['erp'] === true;
    return { enabled, features, provisioned, readOnly: provisioned && !enabled };
  }

  /**
   * Idempotently provision the ERP for a tenant. Call when a tenant moves onto an
   * ERP plan (plan-change hook) or via the owner-triggered provision endpoint.
   */
  async enable(schema: string): Promise<{ provisioned: boolean; alreadyProvisioned: boolean }> {
    return this.cm.executeInTransaction(schema, async (qr) => {
      const already = (await this.getSettingTx<boolean>(qr, schema, 'erp_provisioned')) === true;

      // Reference-data seeds are each guarded by `WHERE NOT EXISTS`, so they are
      // safe to run on every enable() — this also back-fills tenants provisioned
      // before a given seed (e.g. warehouses/tax added in a later phase) without
      // re-seeding what's already there.
      await this.seedPaymentModes(qr, schema);
      await this.seedWarehouseAndTax(qr, schema);

      if (!already) {
        // Truly one-time work (document-number backfill + marker).
        await this.backfillDocumentNumbers(qr, schema);
        await this.setSettingTx(qr, schema, 'erp_provisioned', true);
        await this.setSettingTx(qr, schema, 'erp_provisioned_at', new Date().toISOString());
        this.logger.log(`ERP provisioned for schema ${schema}`);
      }
      return { provisioned: true, alreadyProvisioned: already };
    });
  }

  /**
   * Mark the ERP as archived on downgrade. Non-destructive: no ERP data is
   * removed. Access control is handled by the plan feature flag; this only
   * records the archival for UI/audit purposes.
   */
  async archive(schema: string): Promise<{ archived: boolean }> {
    await this.cm.executeInTenantContext(schema, async (qr) => {
      await this.setSettingTx(qr, schema, 'erp_archived_at', new Date().toISOString());
    });
    this.logger.log(`ERP archived (data preserved) for schema ${schema}`);
    return { archived: true };
  }

  /**
   * Backfill year-scoped document numbers onto documents that predate the ERP.
   * Phase 0 placeholder: existing invoices/quotes already receive their own
   * numbers at creation time, so there is nothing to backfill yet. Kept as the
   * single, idempotent extension point so later phases (year-based ERP numbering)
   * plug in here and remain covered by the `erp_provisioned` once-only guard.
   */
  private async backfillDocumentNumbers(_qr: QueryRunner, _schema: string): Promise<void> {
    // intentionally empty for Phase 0
  }

  /** Seed a default warehouse + a default (0%) tax rate, only if none exist. */
  private async seedWarehouseAndTax(qr: QueryRunner, schema: string): Promise<void> {
    await qr.query(
      `INSERT INTO "${schema}".erp_warehouses (name, code, is_default, enabled)
       SELECT 'Main Warehouse', 'MAIN', true, true
       WHERE NOT EXISTS (SELECT 1 FROM "${schema}".erp_warehouses)`,
    );
    await qr.query(
      `INSERT INTO "${schema}".erp_tax_rates (name, rate, is_default, enabled)
       SELECT * FROM (VALUES ('No Tax', 0::numeric, true, true), ('GST 18%', 18, false, true), ('GST 12%', 12, false, true), ('GST 5%', 5, false, true), ('GST 28%', 28, false, true)) AS t(name, rate, is_default, enabled)
       WHERE NOT EXISTS (SELECT 1 FROM "${schema}".erp_tax_rates)`,
    );
  }

  /** Seed the default payment modes once, only if the tenant has none. */
  private async seedPaymentModes(qr: QueryRunner, schema: string): Promise<void> {
    await qr.query(
      `INSERT INTO "${schema}".payment_modes (name, description, is_default, enabled)
       SELECT * FROM (VALUES
         ('Cash', 'Cash payment', true, true),
         ('UPI', 'UPI / QR payment', false, true),
         ('Bank Transfer', 'NEFT / IMPS / RTGS', false, true)
       ) AS defaults(name, description, is_default, enabled)
       WHERE NOT EXISTS (SELECT 1 FROM "${schema}".payment_modes)`,
    );
  }

  // ── settings KV helpers (the tenant `settings` table stores JSONB values) ──

  private async getSetting<T>(schema: string, key: string): Promise<T | undefined> {
    return this.cm.executeInTenantContext(schema, (qr) => this.getSettingTx<T>(qr, schema, key));
  }

  private async getSettingTx<T>(qr: QueryRunner, schema: string, key: string): Promise<T | undefined> {
    const rows = await qr.query(`SELECT value FROM "${schema}".settings WHERE key = $1`, [key]);
    return rows[0] ? (rows[0].value as T) : undefined;
  }

  private async setSettingTx(qr: QueryRunner, schema: string, key: string, value: unknown): Promise<void> {
    await qr.query(
      `INSERT INTO "${schema}".settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    );
  }
}
