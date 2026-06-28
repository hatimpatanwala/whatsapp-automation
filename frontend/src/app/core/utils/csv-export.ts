/**
 * Minimal, dependency-free CSV export. Builds a CSV from an array of objects
 * and triggers a browser download. Values are escaped per RFC 4180 and a UTF-8
 * BOM is prepended so Excel opens unicode (₹, accented names) correctly.
 */
export interface CsvColumn {
  key: string;
  header: string;
}

export function exportToCsv(
  filename: string,
  rows: Record<string, any>[],
  columns?: CsvColumn[],
): boolean {
  if (!rows || rows.length === 0) return false;

  const cols: CsvColumn[] =
    columns ?? Object.keys(rows[0]).map((k) => ({ key: k, header: k }));

  const escape = (value: any): string => {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const headerLine = cols.map((c) => escape(c.header)).join(',');
  const bodyLines = rows.map((row) =>
    cols.map((c) => escape(row[c.key])).join(','),
  );
  const csv = '﻿' + [headerLine, ...bodyLines].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
