import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { PlanFeatureService } from '../erp/common/plan-feature.service';
import { ErpReminderService } from './erp-reminder.service';

/**
 * Automatic WhatsApp payment reminders (the Vyapar auto-reminder feature).
 *
 * Once a day, for each active tenant that (a) has the `erp` plan feature and
 * (b) has turned on the `erp_auto_reminders` setting, sends a reminder for every
 * outstanding invoice that hasn't been reminded in the last 3 days. Manual
 * reminders (button / WhatsApp command) remain available regardless of the toggle.
 */
@Injectable()
export class ErpReminderCron {
  private readonly logger = new Logger(ErpReminderCron.name);

  constructor(
    private readonly cm: TenantConnectionManager,
    @Optional() private readonly planFeatures?: PlanFeatureService,
    @Optional() private readonly reminders?: ErpReminderService,
  ) {}

  // 10:00 every day — a reasonable hour to nudge customers.
  @Cron('0 0 10 * * *')
  async run(): Promise<void> {
    if (!this.reminders || !this.planFeatures) return;
    let tenants: any[] = [];
    try {
      tenants = await this.cm.executeGlobal((qr) =>
        qr.query(`SELECT id, schema_name FROM tenants WHERE status = 'active'`));
    } catch (err: any) {
      this.logger.warn(`auto-reminder: tenant list failed: ${err.message}`);
      return;
    }
    for (const t of tenants) {
      try {
        if (!(await this.planFeatures.isErpEnabled(t.id))) continue;
        const on = await this.cm.executeInTenantContext(t.schema_name, (qr) =>
          qr.query(`SELECT value FROM "${t.schema_name}".settings WHERE key = 'erp_auto_reminders'`)
            .then((r) => r[0]?.value === true));
        if (!on) continue;

        // Only invoices not reminded in the last 3 days (avoid spamming).
        const due = await this.cm.executeInTenantContext(t.schema_name, (qr) =>
          qr.query(
            `SELECT COUNT(*)::int AS n FROM "${t.schema_name}".invoices
             WHERE year IS NOT NULL AND payment_status <> 'paid' AND customer_phone IS NOT NULL
               AND (last_reminder_at IS NULL OR last_reminder_at < NOW() - INTERVAL '3 days')`)
            .then((r) => r[0]?.n ?? 0));
        if (due === 0) continue;

        const res = await this.reminders.remindOverdue(t.id, t.schema_name, undefined, undefined, true);
        if (res.sent) this.logger.log(`auto-reminder: sent ${res.sent} for ${t.schema_name}`);
      } catch (err: any) {
        this.logger.warn(`auto-reminder failed for ${t.schema_name}: ${err.message}`);
      }
    }
  }
}
