/**
 * Build a wa.me click-to-chat link — the no-login fallback used when Smart
 * Connect isn't linked. Normalises the phone to digits and prefixes the India
 * country code (91) for bare 10-digit numbers.
 *
 *   waMeLink('98765 43210', 'Hi') → 'https://wa.me/919876543210?text=Hi'
 */
export function waMeLink(phone: string, text: string): string {
  let digits = String(phone ?? '').replace(/\D/g, '');
  // A local 10-digit Indian mobile → add the 91 country code.
  if (digits.length === 10) digits = '91' + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text ?? '')}`;
}
