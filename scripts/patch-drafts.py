import io, sys

CONFIGS = {
    'purchase-entry': {
        'key': 'purchase', 'cls': 'PurchaseEntryComponent',
        'capture': """{
      supplierQuery: this.supplierQuery, supplier: this.supplier(), rows: this.rows,
      supplierInvoiceNo: this.supplierInvoiceNo, supplierInvoiceDate: this.supplierInvoiceDate,
      isInterstate: this.isInterstate, note: this.note, chargeRows: this.chargeRows,
    }""",
        'restore': """    this.supplierQuery = d.supplierQuery ?? ''; this.supplier.set(d.supplier ?? null);
    if (Array.isArray(d.rows) && d.rows.length) this.rows = d.rows;
    this.supplierInvoiceNo = d.supplierInvoiceNo ?? ''; this.supplierInvoiceDate = d.supplierInvoiceDate ?? this.supplierInvoiceDate;
    this.isInterstate = !!d.isInterstate; this.note = d.note ?? '';
    if (Array.isArray(d.chargeRows) && d.chargeRows.length) this.chargeRows = d.chargeRows;""",
        'dirty': "!!(this.supplierQuery.trim() || this.supplier() || this.note || this.rows.some((r) => r.name || r.qty || r.rate))",
        'reset': """    this.supplierQuery = ''; this.supplier.set(null); this.supplierHits.set([]);
    this.rows = [this.blankRow(), this.blankRow()];
    this.supplierInvoiceNo = ''; this.isInterstate = false; this.note = '';
    this.chargeRows = [
      { label: 'Freight', amount: null, gstRate: null },
      { label: 'Other', amount: null, gstRate: null },
    ];
    this.error.set(null);""",
    },
    'quote-entry': {
        'key': 'quote', 'cls': 'QuoteEntryComponent',
        'capture': """{
      customerQuery: this.customerQuery, customer: this.customer(), rows: this.rows,
      validUntil: this.validUntil, notes: this.notes,
    }""",
        'restore': """    this.customerQuery = d.customerQuery ?? ''; this.customer.set(d.customer ?? null);
    if (Array.isArray(d.rows) && d.rows.length) this.rows = d.rows;
    this.validUntil = d.validUntil ?? this.validUntil; this.notes = d.notes ?? '';""",
        'dirty': "!!(this.customerQuery.trim() || this.customer() || this.notes || this.rows.some((r) => r.name || r.qty || r.rate))",
        'reset': """    this.customerQuery = ''; this.customer.set(null); this.customerHits.set([]);
    this.rows = [this.blankRow(), this.blankRow()];
    this.notes = '';
    this.error.set(null);""",
    },
    'order-entry': {
        'key': 'order', 'cls': 'OrderEntryComponent',
        'capture': """{
      customerQuery: this.customerQuery, customer: this.customer(), rows: this.rows,
      deliveryFee: this.deliveryFee, notes: this.notes,
    }""",
        'restore': """    this.customerQuery = d.customerQuery ?? ''; this.customer.set(d.customer ?? null);
    if (Array.isArray(d.rows) && d.rows.length) this.rows = d.rows;
    this.deliveryFee = d.deliveryFee ?? null; this.notes = d.notes ?? '';""",
        'dirty': "!!(this.customerQuery.trim() || this.customer() || this.notes || this.rows.some((r) => r.name || r.qty || r.rate))",
        'reset': """    this.customerQuery = ''; this.customer.set(null); this.customerHits.set([]);
    this.rows = [this.blankRow(), this.blankRow()];
    this.deliveryFee = null; this.notes = '';
    this.error.set(null);""",
    },
    'returns-entry': {
        'key': 'returns', 'cls': 'ReturnsEntryComponent',
        'capture': """{
      mode: this.mode(), partyQuery: this.partyQuery, party: this.party(), rows: this.rows,
      gstPct: this.gstPct, reason: this.reason,
    }""",
        'restore': """    if (d.mode) this.mode.set(d.mode);
    this.partyQuery = d.partyQuery ?? ''; this.party.set(d.party ?? null);
    if (Array.isArray(d.rows) && d.rows.length) this.rows = d.rows;
    this.gstPct = d.gstPct ?? null; this.reason = d.reason ?? '';""",
        'dirty': "!!(this.partyQuery.trim() || this.party() || this.reason || this.rows.some((r) => r.name || r.qty || r.rate))",
        'reset': """    this.partyQuery = ''; this.party.set(null); this.partyHits.set([]);
    this.rows = [this.blankRow(), this.blankRow()];
    this.gstPct = null; this.reason = '';
    this.error.set(null);""",
    },
    'stock-journal': {
        'key': 'stock', 'cls': 'StockJournalComponent',
        'capture': """{
      mode: this.mode(), warehouseId: this.warehouseId, toWarehouseId: this.toWarehouseId,
      rows: this.rows, note: this.note,
    }""",
        'restore': """    if (d.mode) this.mode.set(d.mode);
    this.warehouseId = d.warehouseId ?? ''; this.toWarehouseId = d.toWarehouseId ?? '';
    if (Array.isArray(d.rows) && d.rows.length) this.rows = d.rows;
    this.note = d.note ?? '';""",
        'dirty': "!!(this.note || this.rows.some((r) => r.name || r.qty))",
        'reset': """    this.rows = [this.blankRow(), this.blankRow()];
    this.note = '';
    this.error.set(null);""",
    },
}

BLOCK_TMPL = """  private readonly drafts = inject(EntryDraftService);

  // ─── Draft retention: navigating away mid-entry keeps everything typed ──────
  ngOnInit(): void {{
    const d = this.drafts.load<any>('{key}');
    if (!d) return;
{restore}
    this.tick.update((t) => t + 1);
    this.drafts.note('✎ Draft restored — Alt+X to start fresh');
  }}

  ngOnDestroy(): void {{
    if (!this.entryDirty()) {{ this.drafts.clear('{key}'); return; }}
    this.drafts.save('{key}', {capture});
    this.drafts.note('✎ Draft kept — it will be waiting when you return');
  }}

  private entryDirty(): boolean {{
    return {dirty};
  }}

  /** Alt+X — wipe the entry and its draft (start fresh). */
  @HostListener('document:wa-clear-entry')
  clearEntry(): void {{
    this.drafts.clear('{key}');
{reset}
    this.tick.update((t) => t + 1);
    this.drafts.note('✕ Entry cleared');
    setTimeout(() => (this.host.nativeElement.querySelector('[data-cell="party"], input') as HTMLInputElement | null)?.focus());
  }}

"""

for name, cfg in CONFIGS.items():
    p = f"frontend/src/app/features/entry/{name}.component.ts"
    s = io.open(p, encoding='utf-8').read()
    s = s.replace(
        "import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';",
        "import { Component, ElementRef, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';\n"
        "import { EntryDraftService } from '../../core/services/entry-draft.service';")
    s = s.replace(f"export class {cfg['cls']} {{", f"export class {cfg['cls']} implements OnInit, OnDestroy {{")
    block = BLOCK_TMPL.format(key=cfg['key'], restore=cfg['restore'], capture=cfg['capture'],
                              dirty=cfg['dirty'], reset=cfg['reset'])
    anchor = "  private readonly host = inject(ElementRef<HTMLElement>);\n"
    assert anchor in s, name + ' anchor missing'
    s = s.replace(anchor, anchor + "\n" + block, 1)

    reset_line = "this.rows = [this.blankRow(), this.blankRow()];"
    idx = s.rfind(reset_line)
    block_idx = s.find("clearEntry(): void")
    assert idx > block_idx, name + ' reset occurrence order unexpected'
    s = s[:idx] + f"this.drafts.clear('{cfg['key']}');\n          " + s[idx:]
    io.open(p, 'w', encoding='utf-8').write(s)
    print('patched', name)
