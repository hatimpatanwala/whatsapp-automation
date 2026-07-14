/**
 * Shared GSTIN / PAN validation (backend) — mirrors the Party Master rules
 * (src/modules/entry/party.service.ts) and the frontend util
 * (frontend/src/app/core/utils/gst-validation.ts). Keep the three in lock-step.
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

/** '' when valid or empty; else a human-readable error. */
export function validateGstin(gstinRaw: string | null | undefined): string {
  const gstin = (gstinRaw || '').trim().toUpperCase();
  if (!gstin) return '';
  if (!GSTIN_RE.test(gstin)) return 'GSTIN format is invalid (e.g. 27AAKFF1458R1ZQ)';
  if (!gstinChecksumOk(gstin)) return 'GSTIN check digit is wrong — please re-check the number';
  return '';
}

/** '' when valid or empty; else an error. Cross-checks against a valid GSTIN when given. */
export function validatePan(panRaw: string | null | undefined, gstinRaw?: string | null): string {
  const pan = (panRaw || '').trim().toUpperCase();
  if (!pan) return '';
  if (!PAN_RE.test(pan)) return 'PAN format is invalid (e.g. AAACW1234F)';
  const gstin = (gstinRaw || '').trim().toUpperCase();
  if (gstin && GSTIN_RE.test(gstin) && gstin.slice(2, 12) !== pan) {
    return `PAN must match the GSTIN's embedded PAN (${gstin.slice(2, 12)})`;
  }
  return '';
}
