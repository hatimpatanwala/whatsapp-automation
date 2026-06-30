import { NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { firstRow } from './sql-result.util';

export interface CrudListOptions {
  page?: number;
  limit?: number;
  search?: string;
  /** Equality filters: { column: value }. Columns must be listed in config.filterable. */
  filters?: Record<string, unknown>;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CrudConfig {
  /** Unqualified table name inside the tenant schema (e.g. 'suppliers'). */
  table: string;
  /** Columns accepted on create (maps dto key -> column; pass column names). */
  insertable: string[];
  /** Columns accepted on update. */
  updatable: string[];
  /** Columns usable with ILIKE search. */
  searchable?: string[];
  /** Columns usable as equality filters. */
  filterable?: string[];
  /** Default ORDER BY column (default 'created_at'). */
  defaultOrderBy?: string;
  /** Whether the table has a `removed` soft-delete column (default true). */
  softDelete?: boolean;
}

/**
 * Tenant-aware generic CRUD over a single table using raw parameterized SQL,
 * matching the codebase convention (see QuoteService). This is the NestJS/Postgres
 * analogue of IDURAR's `createCRUDController` factory: simple ERP modules
 * (suppliers, payment modes, expense categories, employees, leads, …) extend this
 * and only add their own business logic on top.
 *
 * Conventions assumed for tables driven by this base:
 *   - `id UUID PRIMARY KEY`
 *   - `removed BOOLEAN DEFAULT false` (soft delete) unless softDelete=false
 *   - `created_at` / `updated_at TIMESTAMPTZ`
 *
 * Identifiers (table/column names) come only from the subclass's static CrudConfig
 * — never from request input — so they are safe to interpolate. All VALUES are
 * passed as bound parameters.
 */
export abstract class BaseTenantCrudService<T = Record<string, any>> {
  protected abstract readonly config: CrudConfig;

  constructor(protected readonly cm: TenantConnectionManager) {}

  private get softDelete(): boolean {
    return this.config.softDelete !== false;
  }

  private notRemoved(alias = ''): string {
    if (!this.softDelete) return 'TRUE';
    const col = alias ? `${alias}.removed` : 'removed';
    return `${col} = false`;
  }

  async list(schema: string, opts: CrudListOptions = {}): Promise<PaginatedResult<T>> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = [this.notRemoved()];
    const params: unknown[] = [];
    let p = 1;

    if (opts.search && this.config.searchable?.length) {
      const ors = this.config.searchable.map((c) => `${c} ILIKE $${p}`);
      params.push(`%${opts.search}%`);
      p++;
      conditions.push(`(${ors.join(' OR ')})`);
    }

    if (opts.filters && this.config.filterable?.length) {
      for (const [key, value] of Object.entries(opts.filters)) {
        if (value === undefined || value === null) continue;
        if (!this.config.filterable.includes(key)) continue;
        conditions.push(`${key} = $${p++}`);
        params.push(value);
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const orderBy = this.config.defaultOrderBy ?? 'created_at';
    const orderDir = opts.orderDir === 'ASC' ? 'ASC' : 'DESC';

    return this.cm.executeInTenantContext(schema, async (qr) => {
      const countRows = await qr.query(
        `SELECT COUNT(*)::int AS total FROM "${schema}".${this.config.table} ${where}`,
        params,
      );
      const total: number = countRows[0]?.total ?? 0;

      const rows = await qr.query(
        `SELECT * FROM "${schema}".${this.config.table}
         ${where}
         ORDER BY ${orderBy} ${orderDir}
         LIMIT $${p++} OFFSET $${p++}`,
        [...params, limit, offset],
      );

      return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }

  async findById(schema: string, id: string): Promise<T> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `SELECT * FROM "${schema}".${this.config.table}
         WHERE id = $1 AND ${this.notRemoved()} LIMIT 1`,
        [id],
      );
      if (!rows[0]) {
        throw new NotFoundException(`${this.config.table} ${id} not found`);
      }
      return rows[0];
    });
  }

  async create(schema: string, dto: Record<string, any>, qr?: QueryRunner): Promise<T> {
    const cols = this.config.insertable.filter((c) => dto[c] !== undefined);
    if (cols.length === 0) {
      throw new Error(`No insertable fields provided for ${this.config.table}`);
    }
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const values = cols.map((c) => dto[c]);
    const sql = `INSERT INTO "${schema}".${this.config.table} (${cols.join(', ')})
                 VALUES (${placeholders.join(', ')}) RETURNING *`;

    const run = (q: QueryRunner) => q.query(sql, values).then((r) => r[0]);
    return qr ? run(qr) : this.cm.executeInTenantContext(schema, run);
  }

  async update(schema: string, id: string, dto: Record<string, any>): Promise<T> {
    const cols = this.config.updatable.filter((c) => dto[c] !== undefined);
    if (cols.length === 0) return this.findById(schema, id);

    const set = cols.map((c, i) => `${c} = $${i + 1}`);
    const values = cols.map((c) => dto[c]);
    const hasUpdatedAt = true; // all ERP tables carry updated_at
    if (hasUpdatedAt) set.push(`updated_at = NOW()`);

    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".${this.config.table}
         SET ${set.join(', ')}
         WHERE id = $${cols.length + 1} AND ${this.notRemoved()}
         RETURNING *`,
        [...values, id],
      ));
      if (!row) {
        throw new NotFoundException(`${this.config.table} ${id} not found`);
      }
      return row;
    });
  }

  async remove(schema: string, id: string): Promise<{ id: string; removed: boolean }> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      if (this.softDelete) {
        const row = firstRow(await qr.query(
          `UPDATE "${schema}".${this.config.table}
           SET removed = true, updated_at = NOW()
           WHERE id = $1 AND removed = false RETURNING id`,
          [id],
        ));
        if (!row) throw new NotFoundException(`${this.config.table} ${id} not found`);
      } else {
        const row = firstRow(await qr.query(
          `DELETE FROM "${schema}".${this.config.table} WHERE id = $1 RETURNING id`,
          [id],
        ));
        if (!row) throw new NotFoundException(`${this.config.table} ${id} not found`);
      }
      return { id, removed: true };
    });
  }
}
