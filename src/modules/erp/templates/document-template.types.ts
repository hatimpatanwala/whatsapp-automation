/**
 * User-customizable document templates (invoices, quotations, POs, receipts, notes…).
 *
 * A template is a branding + layout CONFIG (not free-form canvas): the user picks a base
 * layout and customizes logo, colours, font, which header fields / item columns show, and
 * the text blocks (terms, bank details, declaration, footer, signature). The PDF builders
 * read this config and render accordingly. Stored per-tenant in `document_templates` and
 * assigned per document type via `applies_to`.
 */

/** Document types a template can be applied to. */
export const DOC_TYPES = [
  'invoice',
  'quote',
  'purchase_order',
  'receipt',
  'credit_note',
  'debit_note',
  'offer',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  invoice: 'Tax Invoice',
  quote: 'Quotation',
  purchase_order: 'Purchase Order',
  receipt: 'Payment Receipt',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
  offer: 'Offer / Estimate',
};

export type LayoutKind = 'classic' | 'modern' | 'tally' | 'compact';
export type FontKind = 'helvetica' | 'times' | 'courier';

export interface DocTemplateConfig {
  /** Base layout — affects header alignment + accent usage in the PDF. */
  layout: LayoutKind;
  /** Brand accent (header rule, table-header fill, totals highlight). Hex. */
  accentColor: string;
  /** Primary body text colour. Hex. */
  textColor: string;
  font: FontKind;
  /** Company logo as a data URL (base64). Null = no logo. Kept small (≤ ~200 KB). */
  logo: string | null;
  showLogo: boolean;
  /** Which company fields appear in the header. */
  header: {
    showGstin: boolean;
    showAddress: boolean;
    showEmail: boolean;
    showPhone: boolean;
    showWebsite: boolean;
  };
  /** Which columns the line-item table shows. */
  columns: {
    sno: boolean;
    hsn: boolean;
    qty: boolean;
    rate: boolean;
    discount: boolean;
    tax: boolean;
    amount: boolean;
  };
  totals: {
    showDiscount: boolean;
    showTaxBreakup: boolean;
    showRoundoff: boolean;
  };
  /** Free-text blocks printed below the totals. Empty string = hidden. */
  blocks: {
    terms: string;
    notes: string;
    declaration: string;
    bankDetails: string;
    footer: string;
    signatureLabel: string;
  };
}

/** The built-in "Classic" config — the fallback when a tenant has no template yet. */
export const DEFAULT_TEMPLATE_CONFIG: DocTemplateConfig = {
  layout: 'classic',
  accentColor: '#1f4e79',
  textColor: '#111111',
  font: 'helvetica',
  logo: null,
  showLogo: true,
  header: { showGstin: true, showAddress: true, showEmail: true, showPhone: true, showWebsite: false },
  columns: { sno: true, hsn: true, qty: true, rate: true, discount: false, tax: true, amount: true },
  totals: { showDiscount: true, showTaxBreakup: true, showRoundoff: true },
  blocks: {
    terms: '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged on overdue bills.\n3. Subject to local jurisdiction.',
    notes: '',
    declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
    bankDetails: '',
    footer: 'Thank you for your business!',
    signatureLabel: 'Authorised Signatory',
  },
};

/**
 * Merge a stored (possibly partial / older-schema) config over the defaults so the PDF
 * builders always receive a fully-populated, valid config.
 */
export function normalizeTemplateConfig(input: unknown): DocTemplateConfig {
  const c = (input && typeof input === 'object' ? input : {}) as Partial<DocTemplateConfig>;
  const d = DEFAULT_TEMPLATE_CONFIG;
  const hex = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  return {
    layout: (['classic', 'modern', 'tally', 'compact'] as const).includes(c.layout as LayoutKind)
      ? (c.layout as LayoutKind)
      : d.layout,
    accentColor: hex(c.accentColor, d.accentColor),
    textColor: hex(c.textColor, d.textColor),
    font: (['helvetica', 'times', 'courier'] as const).includes(c.font as FontKind) ? (c.font as FontKind) : d.font,
    logo: typeof c.logo === 'string' && c.logo.startsWith('data:image/') ? c.logo : null,
    showLogo: c.showLogo ?? d.showLogo,
    header: { ...d.header, ...(c.header || {}) },
    columns: { ...d.columns, ...(c.columns || {}) },
    totals: { ...d.totals, ...(c.totals || {}) },
    blocks: { ...d.blocks, ...(c.blocks || {}) },
  };
}
