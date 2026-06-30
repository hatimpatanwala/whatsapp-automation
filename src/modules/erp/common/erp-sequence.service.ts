import { Injectable } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';

export interface NextNumberOptions {
  /** Calendar year the sequence is scoped to (default: derived by caller). */
  year: number;
  /** Prefix for the formatted number, e.g. 'INV' -> 'INV-2026-0001'. */
  prefix?: string;
  /** Zero-padding width for the numeric part (default 4). */
  pad?: number;
}

export interface NextNumberResult {
  /** Raw incremented counter (1, 2, 3 …) for this doc_type + year. */
  seq: number;
  /** Year the sequence belongs to. */
  year: number;
  /** Human-facing formatted number, e.g. 'INV-2026-0007'. */
  formatted: string;
}

/**
 * Per-tenant, per-(doc_type, year) document numbering for ERP documents
 * (invoices, quotes, offers, supplier orders, payment receipts).
 *
 * The increment is atomic via `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so
 * concurrent document creation never yields duplicate or skipped numbers.
 *
 * Pass an existing QueryRunner (from executeInTransaction) to allocate the number
 * in the SAME transaction as the document insert — that way a rolled-back document
 * does not consume a number.
 */
@Injectable()
export class ErpSequenceService {
  constructor(private readonly cm: TenantConnectionManager) {}

  async next(schema: string, docType: string, opts: NextNumberOptions, qr?: QueryRunner): Promise<NextNumberResult> {
    const run = async (q: QueryRunner): Promise<NextNumberResult> => {
      const rows = await q.query(
        `INSERT INTO "${schema}".erp_sequences (doc_type, year, last_number)
         VALUES ($1, $2, 1)
         ON CONFLICT (doc_type, year)
         DO UPDATE SET last_number = "${schema}".erp_sequences.last_number + 1,
                       updated_at = NOW()
         RETURNING last_number`,
        [docType, opts.year],
      );
      const seq: number = rows[0].last_number;
      const pad = opts.pad ?? 4;
      const num = String(seq).padStart(pad, '0');
      const formatted = opts.prefix
        ? `${opts.prefix}-${opts.year}-${num}`
        : `${opts.year}-${num}`;
      return { seq, year: opts.year, formatted };
    };

    return qr ? run(qr) : this.cm.executeInTransaction(schema, run);
  }
}
