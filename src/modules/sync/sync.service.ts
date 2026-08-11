import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { SYNCABLE_TABLES } from './sync.constants';

export interface SyncChange {
  table: string;
  op: string; // 'I' | 'U' | 'D'
  row: Record<string, any>;
}

export interface SyncReadResult {
  changes: SyncChange[];
  cursor: number;
}

/**
 * Delta-sync engine (Phase 2, master-data slice). Runs identically on the cloud and on
 * each local (embedded-Postgres) node — the desktop relays batches between them:
 *   - push:  read LOCAL outbox changes  → apply on CLOUD
 *   - pull:  read CLOUD version changes  → apply on LOCAL
 *
 * `applyChanges` sets the `sync.apply` GUC so the DB triggers preserve the incoming
 * updated_at/origin_node and do NOT re-enqueue applied rows (no echo). Conflicts resolve
 * last-writer-wins by updated_at (strict `<`, so identical rows never loop).
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly colCache = new Map<string, string[]>();
  private readonly existCache = new Map<string, string[]>();

  constructor(
    private readonly cm: TenantConnectionManager,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  /**
   * The local desktop node's tenant schema. With an imported multi-tenant dump the
   * "first active tenant" is arbitrary — SYNC_TENANT_SLUG pins which tenant syncs.
   */
  async singleTenantSchema(): Promise<string> {
    const slug = process.env.SYNC_TENANT_SLUG;
    const t = slug
      ? await this.tenants.findOne({ where: { slug } })
      : await this.tenants.findOne({ where: { status: 'active' } });
    if (!t) throw new BadRequestException(slug ? `No tenant with slug '${slug}' to sync` : 'No active tenant to sync');
    return t.schemaName;
  }

  /** Mint a long-lived sync token for a tenant (called once per device after login). */
  async issueToken(tenantId: string, label?: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.cm.executeGlobal((qr) =>
      qr.query(`INSERT INTO public.sync_tokens (token, tenant_id, label) VALUES ($1, $2, $3)`, [
        token,
        tenantId,
        label ?? 'desktop',
      ]),
    );
    return token;
  }

  /** Resolve a tenant schema from a sync token (cloud-side token auth). */
  async tenantSchemaByToken(token: string): Promise<string | null> {
    const rows = await this.cm.executeGlobal((qr) =>
      qr.query(`SELECT tenant_id FROM public.sync_tokens WHERE token = $1`, [token]),
    );
    const tenantId = rows[0]?.tenant_id;
    if (!tenantId) return null;
    await this.cm
      .executeGlobal((qr) =>
        qr.query(`UPDATE public.sync_tokens SET last_used_at = NOW() WHERE token = $1`, [token]),
      )
      .catch(() => undefined);
    const t = await this.tenants.findOne({ where: { id: tenantId, status: 'active' } });
    return t?.schemaName ?? null;
  }

  private async existingTables(schema: string): Promise<string[]> {
    const cached = this.existCache.get(schema);
    if (cached) return cached;
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2)`,
        [schema, SYNCABLE_TABLES as unknown as string[]],
      ),
    );
    const list = rows.map((r: any) => r.table_name);
    this.existCache.set(schema, list);
    return list;
  }

  private async columns(schema: string, table: string): Promise<string[]> {
    const key = `${schema}.${table}`;
    const cached = this.colCache.get(key);
    if (cached) return cached;
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
        [schema, table],
      ),
    );
    const cols = rows.map((r: any) => r.column_name);
    this.colCache.set(key, cols);
    return cols;
  }

  /** Changes ordered by the schema-global sync_version (used for cloud → local pull). */
  async readByVersion(schema: string, since: number, limit: number): Promise<SyncReadResult> {
    const tables = await this.existingTables(schema);
    if (!tables.length) return { changes: [], cursor: since };

    // Top-N merge: push ORDER BY sync_version + LIMIT into EACH branch so every table
    // returns at most `limit` rows via an index scan on idx_<t>_sync_version — instead
    // of scanning ALL rows > since in every table and sorting the union globally. On a
    // large tenant the old query re-scanned ~90k voucher_entries rows on every batch
    // (~3s each); this reads ~limit rows per table (a few ms).
    const union = tables
      .map(
        (t) =>
          `(SELECT '${t}'::text AS table_name, sync_version, to_jsonb(x) AS row ` +
          `FROM "${schema}".${t} x WHERE sync_version > $1 ORDER BY sync_version ASC LIMIT $2)`,
      )
      .join(' UNION ALL ');

    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT table_name, sync_version, row FROM (${union}) s ORDER BY sync_version ASC LIMIT $2`,
        [since, limit],
      ),
    );

    const cursor = rows.length ? Number(rows[rows.length - 1].sync_version) : since;
    return {
      changes: rows.map((r: any) => ({ table: r.table_name, op: 'U', row: r.row })),
      cursor,
    };
  }

  /** Local-origin changes from the outbox (used for local → cloud push). */
  async readFromOutbox(schema: string, since: number, limit: number): Promise<SyncReadResult> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const entries = await qr.query(
        `SELECT id, table_name, row_id, op FROM "${schema}".sync_outbox WHERE id > $1 ORDER BY id ASC LIMIT $2`,
        [since, limit],
      );
      if (!entries.length) return { changes: [], cursor: since };

      const cursor = Number(entries[entries.length - 1].id);
      // Collapse multiple edits of the same row to its latest state.
      const latest = new Map<string, any>();
      for (const e of entries) latest.set(`${e.table_name}:${e.row_id}`, e);

      const changes: SyncChange[] = [];
      for (const e of latest.values()) {
        if (!(SYNCABLE_TABLES as readonly string[]).includes(e.table_name)) continue;
        if (e.op === 'D') {
          changes.push({ table: e.table_name, op: 'D', row: { id: e.row_id } });
          continue;
        }
        const r = await qr.query(
          `SELECT to_jsonb(x) AS row FROM "${schema}".${e.table_name} x WHERE id = $1`,
          [e.row_id],
        );
        if (r[0]?.row) changes.push({ table: e.table_name, op: e.op, row: r[0].row });
      }
      return { changes, cursor };
    });
  }

  /** Apply a batch of remote changes with LWW. Runs in apply-mode (no echo). */
  async applyChanges(
    schema: string,
    nodeId: string | undefined,
    changes: SyncChange[],
  ): Promise<{ applied: string[]; skipped: string[]; count: number }> {
    const applied: string[] = [];
    const skipped: string[] = [];
    if (!changes?.length) return { applied, skipped, count: 0 };

    await this.cm.executeInTransaction(schema, async (qr) => {
      await qr.query(`SELECT set_config('sync.apply', 'on', true)`);
      if (nodeId) await qr.query(`SELECT set_config('sync.node', $1, true)`, [nodeId]);

      for (const ch of changes) {
        if (!(SYNCABLE_TABLES as readonly string[]).includes(ch.table)) {
          skipped.push(`${ch.table}?`);
          continue;
        }
        const row = ch.row;
        if (!row || !row.id) {
          skipped.push(`${ch.table}:?`);
          continue;
        }

        // Isolate every row in a savepoint: one bad row (FK violation, constraint,
        // type mismatch) must NOT abort the whole batch. Without this a single
        // "poison" row wedges sync forever — the batch 500s, the cursor never
        // advances, and the client retries the same failing batch every tick.
        await qr.query(`SAVEPOINT sync_row`);
        try {
          if (ch.op === 'D') {
            await qr.query(
              `UPDATE "${schema}".${ch.table} SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
              [row.id],
            );
            await qr.query(`RELEASE SAVEPOINT sync_row`);
            applied.push(row.id);
            continue;
          }

          const payload = { ...row };
          delete payload.sync_version; // the local trigger assigns version in this node's space

          const cols = await this.columns(schema, ch.table);
          const setCols = cols.filter((c) => c !== 'id' && c !== 'sync_version');
          const setClause = setCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');

          const res = await qr.query(
            `INSERT INTO "${schema}".${ch.table}
             SELECT * FROM jsonb_populate_record(NULL::"${schema}".${ch.table}, $1::jsonb)
             ON CONFLICT (id) DO UPDATE SET ${setClause}
             WHERE "${schema}".${ch.table}.updated_at IS NULL
                OR "${schema}".${ch.table}.updated_at < EXCLUDED.updated_at
             RETURNING id`,
            [JSON.stringify(payload)],
          );
          await qr.query(`RELEASE SAVEPOINT sync_row`);
          if (res.length) applied.push(row.id);
          else skipped.push(row.id); // older than local copy — LWW kept local
        } catch (e) {
          // Skip the offending row and keep going so the batch commits and the
          // cursor advances. Logged so we can see WHAT failed (e.g. a missing FK).
          await qr.query(`ROLLBACK TO SAVEPOINT sync_row`);
          const reason = (e as Error).message?.split('\n')[0] ?? 'error';
          skipped.push(`${ch.table}:${row.id}`);
          this.logger.warn(`[sync.apply] skipped ${ch.table}:${row.id} — ${reason}`);
        }
      }
    });

    if (skipped.length) {
      this.logger.warn(`[sync.apply] ${schema}: applied ${applied.length}, skipped ${skipped.length}`);
    }
    return { applied, skipped, count: applied.length };
  }

  /**
   * Wipe every synced table (+ the outbox) in the local mirror. Runs with triggers and
   * FK checks disabled (session_replication_role = replica) so it's a fast, order-free
   * clean slate — used when a different company's user signs in on a shared desktop so
   * their data replaces, never merges with, the previous company's.
   */
  async resetLocalData(schema: string): Promise<{ cleared: string[] }> {
    const tables = await this.existingTables(schema);
    const cleared: string[] = [];
    await this.cm.executeInTransaction(schema, async (qr) => {
      await qr.query(`SET LOCAL session_replication_role = 'replica'`);
      for (const t of tables) {
        await qr.query(`DELETE FROM "${schema}".${t}`);
        cleared.push(t);
      }
      // Drop any pending local changes + peer cursors so nothing from the old company
      // is pushed or re-applied after the switch.
      await qr.query(`TRUNCATE "${schema}".sync_outbox`).catch(() => undefined);
      await qr.query(`DELETE FROM "${schema}".sync_state WHERE peer <> '_self'`).catch(() => undefined);
    });
    return { cleared };
  }

  /** Lightweight status for debugging / the desktop sync indicator. */
  async status(schema: string): Promise<Record<string, any>> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const [{ node_id } = {}] =
        (await qr.query(`SELECT node_id FROM "${schema}".sync_state WHERE peer = '_self'`)) || [];
      const [{ outbox } = {}] = await qr.query(
        `SELECT COUNT(*)::int AS outbox FROM "${schema}".sync_outbox`,
      );
      const [{ max_version } = {}] = await qr.query(
        `SELECT COALESCE(last_value, 0) AS max_version FROM "${schema}".sync_seq`,
      );
      return { nodeId: node_id, outboxCount: outbox, maxVersion: Number(max_version) };
    });
  }
}
