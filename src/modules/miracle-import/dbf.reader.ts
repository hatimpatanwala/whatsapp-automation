/**
 * Visual FoxPro DBF (+ FPT memo) reader.
 *
 * Miracle (RKIT) stores every company as a folder of FoxPro `.DBF` tables with
 * sibling `.FPT` memo files. This reader parses the header, field descriptors
 * and records, resolves memo (`M`) fields from the `.FPT`, and returns plain
 * JS objects keyed by the raw Miracle field name (FIELD01, M01F05, T52F18, …).
 *
 * Only the subset of the DBF spec that Miracle emits (version 0x30/0x31 VFP,
 * types C N F D L M I T Y B) is handled — enough to migrate the data.
 */
import { readFileSync, existsSync } from 'fs';

export type DbfValue = string | number | boolean | Date | null;
export interface DbfField {
  name: string;
  type: string;
  length: number;
  decimals: number;
}
export interface DbfRecord {
  [field: string]: DbfValue;
}
export interface DbfTable {
  fields: DbfField[];
  records: DbfRecord[];
}

/** Parse the FPT block-size (big-endian uint16 at offset 6; 0 ⇒ 512 default). */
function fptBlockSize(fpt: Buffer): number {
  const bs = fpt.readUInt16BE(6);
  return bs > 0 ? bs : 512;
}

/** Resolve one VFP memo block (4-byte type + 4-byte length header, big-endian). */
function readMemo(fpt: Buffer | null, block: number): string {
  if (!fpt || block <= 0) return '';
  const bs = fptBlockSize(fpt);
  const start = block * bs;
  if (start + 8 > fpt.length) return '';
  const len = fpt.readUInt32BE(start + 4);
  if (len <= 0 || start + 8 + len > fpt.length) return '';
  return fpt.slice(start + 8, start + 8 + len).toString('latin1').replace(/\0+$/, '').trim();
}

function parseHeaderFields(buf: Buffer): { fields: DbfField[]; headerLen: number; recordLen: number; count: number } {
  const count = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields: DbfField[] = [];
  let pos = 32;
  while (pos < buf.length && buf[pos] !== 0x0d) {
    const raw = buf.slice(pos, pos + 32);
    const nul = raw.indexOf(0x00);
    const name = raw.slice(0, nul === -1 || nul > 11 ? 11 : nul).toString('latin1').trim();
    fields.push({
      name,
      type: String.fromCharCode(raw[11]),
      length: raw[16],
      decimals: raw[17],
    });
    pos += 32;
  }
  return { fields, headerLen, recordLen, count };
}

function decodeField(f: DbfField, cell: Buffer, fpt: Buffer | null): DbfValue {
  switch (f.type) {
    case 'C': // character
      return cell.toString('latin1').replace(/\0/g, '').trim();
    case 'N': // numeric (ASCII)
    case 'F': {
      const s = cell.toString('latin1').trim();
      if (!s || s === '.' || /^[.\s]*$/.test(s)) return f.decimals > 0 ? 0 : 0;
      const n = Number(s);
      return Number.isNaN(n) ? 0 : n;
    }
    case 'D': { // date YYYYMMDD
      const s = cell.toString('latin1').trim();
      if (!/^\d{8}$/.test(s) || s === '00000000') return null;
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
    case 'L': { // logical
      const c = cell.toString('latin1').trim().toUpperCase();
      return c === 'T' || c === 'Y' ? true : c === 'F' || c === 'N' ? false : null;
    }
    case 'I': // 4-byte little-endian int
      return cell.length >= 4 ? cell.readInt32LE(0) : 0;
    case 'Y': // currency: 8-byte int scaled by 10000
      return cell.length >= 8 ? Number(cell.readBigInt64LE(0)) / 10000 : 0;
    case 'B': // double
      return cell.length >= 8 ? cell.readDoubleLE(0) : 0;
    case 'M': { // memo → FPT block number (4-byte LE binary in VFP)
      if (f.length === 4) return readMemo(fpt, cell.readUInt32LE(0));
      const s = cell.toString('latin1').trim();
      return s ? readMemo(fpt, parseInt(s, 10) || 0) : '';
    }
    case 'T': { // datetime: 4-byte julian date + 4-byte ms
      if (cell.length < 8) return null;
      const jd = cell.readInt32LE(0);
      if (jd === 0) return null;
      const ms = cell.readInt32LE(4);
      // Julian day 2440588 = 1970-01-01
      return new Date((jd - 2440588) * 86400000 + ms);
    }
    default:
      return cell.toString('latin1').trim();
  }
}

/**
 * Read a whole DBF table into memory. Skips deleted records (0x2A flag).
 * Automatically resolves the sibling `.FPT` for memo fields when present.
 */
export function readDbf(path: string): DbfTable {
  const buf = readFileSync(path);
  const { fields, headerLen, recordLen, count } = parseHeaderFields(buf);
  const hasMemo = fields.some((f) => f.type === 'M');
  let fpt: Buffer | null = null;
  if (hasMemo) {
    const fptPath = path.replace(/\.dbf$/i, (m) => (m === '.DBF' ? '.FPT' : '.fpt'));
    if (existsSync(fptPath)) fpt = readFileSync(fptPath);
  }
  // Precompute field offsets within a record (byte 0 is the deletion flag).
  const offsets: number[] = [];
  let acc = 1;
  for (const f of fields) {
    offsets.push(acc);
    acc += f.length;
  }
  const records: DbfRecord[] = [];
  for (let i = 0; i < count; i++) {
    const off = headerLen + i * recordLen;
    if (off + recordLen > buf.length) break;
    if (buf[off] === 0x2a) continue; // '*' deleted
    const rec: DbfRecord = {};
    for (let fi = 0; fi < fields.length; fi++) {
      const f = fields[fi];
      const c = off + offsets[fi];
      rec[f.name] = decodeField(f, buf.slice(c, c + f.length), fpt);
    }
    records.push(rec);
  }
  return { fields, records };
}

/** Read a DBF if it exists, else return an empty table (many Miracle tables are optional/empty). */
export function readDbfSafe(path: string): DbfTable {
  try {
    if (!existsSync(path)) return { fields: [], records: [] };
    return readDbf(path);
  } catch {
    return { fields: [], records: [] };
  }
}

/** Trim a Miracle string cell (values are space-padded fixed-width). */
export function s(v: DbfValue): string {
  return v == null ? '' : String(v).trim();
}

/** Coerce a Miracle numeric cell to a JS number. */
export function num(v: DbfValue): number {
  if (typeof v === 'number') return v;
  const n = Number(s(v));
  return Number.isNaN(n) ? 0 : n;
}
