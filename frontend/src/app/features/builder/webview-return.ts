/**
 * Closes the WhatsApp in-app browser and returns the user to the chat once a
 * task is done (e.g. an order is placed).
 *
 * WhatsApp's in-app browser exposes NO official "close" API for a CTA-URL page,
 * and behaviour differs across platforms, so we use a layered best-effort:
 *   1) window.close()        — honoured by many Android WhatsApp webviews.
 *   2) history.back()        — if the page has somewhere to go back to.
 *   3) wa.me deep-link       — re-foregrounds WhatsApp on the business chat
 *                              (reliable cross-platform fallback when the above
 *                              are ignored, e.g. iOS).
 * Each step is guarded; if one actually closes the page the later ones never run.
 */
export function returnToWhatsApp(phone?: string | null): void {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  try { window.close(); } catch { /* not opened by script — ignore */ }
  setTimeout(() => {
    try {
      if (digits) {
        window.location.href = `https://wa.me/${digits}`;
      } else {
        // No number to deep-link to — try the app scheme, then a plain history back.
        window.location.href = 'whatsapp://';
        setTimeout(() => { try { history.back(); } catch { /* noop */ } }, 200);
      }
    } catch { /* noop */ }
  }, 350);
}
