/**
 * Normalizes a TypeORM `QueryRunner.query()` result to its rows array.
 *
 * The postgres driver returns different shapes depending on the statement:
 *   - SELECT / INSERT … RETURNING  → rows[]
 *   - UPDATE / DELETE … RETURNING  → [rows[], affectedRowCount]
 *
 * Using `result[0]` blindly therefore yields the first ROW for an INSERT but the
 * whole ROWS ARRAY for an UPDATE. These helpers paper over that difference so
 * `firstRow(qr.query(...))` always gives the first row regardless of statement.
 */
export function resultRows(res: any): any[] {
  if (Array.isArray(res) && Array.isArray(res[0]) && typeof res[1] === 'number') {
    return res[0]; // [rows, affectedCount] from UPDATE/DELETE … RETURNING
  }
  return Array.isArray(res) ? res : [];
}

export function firstRow(res: any): any {
  return resultRows(res)[0];
}
