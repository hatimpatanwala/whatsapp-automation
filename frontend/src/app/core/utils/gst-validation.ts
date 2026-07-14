/**
 * Shared GSTIN / PAN validation — the single source of truth for every party entry
 * point (Party Master, portal Customers, quick-create, suppliers, invoice Bill-To).
 * Mirrors the backend `validateParty` rules (src/modules/entry/party.service.ts).
 */

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** GSTIN check digit (char 15) — base-36 mod-36 checksum over the first 14 chars. */
export function gstinChecksumOk(g: string): boolean {
  const val = (c: string) => (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 55);
  const chr = (v: number) => (v < 10 ? String.fromCharCode(48 + v) : String.fromCharCode(55 + v));
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = val(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return chr((36 - (sum % 36)) % 36) === g[14];
}

/** PAN 4th character → holder type (shown as a helper hint, not an error). */
export function panHolderType(pan: string): string {
  const map: Record<string, string> = {
    P: 'Individual', C: 'Company', H: 'HUF', F: 'Firm / LLP', A: 'AOP',
    T: 'Trust', B: 'Body of Individuals', L: 'Local Authority', J: 'Artificial Juridical Person', G: 'Government',
  };
  return map[(pan[3] || '').toUpperCase()] || '';
}

/**
 * Validate a GSTIN. Returns '' when valid/empty, else a human-readable error.
 * `stateCode` (optional) cross-checks the GSTIN's first two digits.
 */
export function validateGstin(gstinRaw: string, stateCode?: string): string {
  const gstin = (gstinRaw || '').trim().toUpperCase();
  if (!gstin) return '';
  if (!GSTIN_RE.test(gstin)) return 'GSTIN format is invalid (e.g. 27AAKFF1458R1ZQ)';
  if (!gstinChecksumOk(gstin)) return 'GSTIN check digit is wrong — please re-check the number';
  if (stateCode && gstin.slice(0, 2) !== stateCode.padStart(2, '0')) {
    return `GSTIN state (${gstin.slice(0, 2)}) doesn't match the selected state (${stateCode})`;
  }
  return '';
}

/**
 * Validate a PAN. Returns '' when valid/empty, else an error. When a valid GSTIN is
 * also present, the PAN must equal the GSTIN's embedded PAN (chars 3–12).
 */
export function validatePan(panRaw: string, gstinRaw?: string): string {
  const pan = (panRaw || '').trim().toUpperCase();
  if (!pan) return '';
  if (!PAN_RE.test(pan)) return 'PAN format is invalid (e.g. AAACW1234F)';
  const gstin = (gstinRaw || '').trim().toUpperCase();
  if (gstin && GSTIN_RE.test(gstin) && gstin.slice(2, 12) !== pan) {
    return `PAN must match the GSTIN's embedded PAN (${gstin.slice(2, 12)})`;
  }
  return '';
}

/** PAN derived from a (format-valid) GSTIN, or ''. */
export function panFromGstin(gstinRaw: string): string {
  const gstin = (gstinRaw || '').trim().toUpperCase();
  return GSTIN_RE.test(gstin) ? gstin.slice(2, 12) : '';
}
