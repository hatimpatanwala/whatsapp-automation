# Item Master — Field Parity Spec (Vyapar × Miracle → Our ERP)

> **Purpose of this file:** This is a build brief for you (Claude / Claude Code). It contains the
> complete, merged list of Item Master fields found in **Vyapar** and **Miracle Accounting Software**,
> prioritised. Your job is to bring our ERP's Item Master up to parity by adding **only the fields that
> are currently missing**, without breaking or redesigning the existing UI. Use the **Playwright**
> plugin to audit the current screen and verify every change.

---

## 0. Read this first — how to use this brief

**Do not start coding by adding every field below.** Follow this order:

1. **Audit what already exists.**
   - Read the codebase: locate the Item Master model/schema, the create/edit form component, the
     API/controller, and the DB migration/table.
   - Then drive the *running* app with Playwright: open the "Add Item" / "Edit Item" screen, screenshot
     it, and enumerate every field currently rendered (label, input type, whether required).
2. **Diff against the Master Field List (Section 3).** Produce a short table of: fields present,
   fields missing, and fields present-but-incomplete (e.g. exists but no validation / not saved to DB).
3. **Confirm scope with the user** before writing code — show them the diff and which priorities you
   plan to implement (suggest: all `Required` + `High`, then `Medium`, leaving `Low` optional).
4. **Implement missing fields** in vertical slices (schema → migration → API → form UI → validation),
   one logical group at a time (Section 3 is already grouped for this).
5. **Verify each slice with Playwright** (Section 4) before moving to the next.

**UI preservation is a hard requirement — see Section 2.**

---

## 1. What each source is

- **Vyapar** — India-focused GST billing/inventory app for small businesses. Item Master leans toward
  retail convenience: batch/expiry, MRP, serial/IMEI, model no., size, item image, online-store flags,
  and tax-inclusive-vs-exclusive pricing toggles. Many optional fields are hidden behind Item Settings
  toggles rather than always shown.
- **Miracle (RKIT Software)** — general accounting/ERP popular with traders, distributors and
  manufacturers. Product Master leans toward structural depth: product classification (brand/colour/
  size/material), dual stock units with UQC, GST commodity mapping, location-wise stock, multi-level
  price lists, and user-defined fields/masters.

The Master Field List below is the **union** of both, so our ERP ends up a superset.

---

## 2. UI preservation rules (do not violate)

1. **Match existing conventions.** Reuse the ERP's existing form components, input wrappers, spacing
   tokens, label style, validation-error pattern, and grid/column layout. Do **not** introduce a new
   design system, CSS framework, or component library.
2. **No visual regressions.** Before touching anything, capture a baseline Playwright screenshot of the
   Item Master form. After each change, capture a new screenshot and confirm existing fields keep their
   position, styling, and behaviour.
3. **Additive, not destructive.** Add new fields into logical existing sections (or add new collapsible
   sections that follow the same styling). Never remove, rename, or reorder existing fields unless the
   user explicitly asks.
4. **Progressive disclosure for low-priority fields.** Fields marked `Low` (and batch/serial groups)
   should sit behind a toggle, "Advanced", or collapsible panel — mirroring how Vyapar hides them behind
   Item Settings — so the default form stays clean.
5. **Responsive parity.** New fields must behave on the same breakpoints as existing ones.
6. **Preserve keyboard/tab order and any autosave/draft behaviour** already present.

---

## 3. Master Field List (merged & prioritised)

**Priority key:** `Required` = cannot save without it · `High` = needed for GST/billing correctness ·
`Medium` = commonly used, adds real value · `Low` = niche/nice-to-have, hide behind advanced/toggle.

**Present-in key:** V = Vyapar · M = Miracle · V+M = both.

### Group A — Identification & Classification
| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| Item / Product Name | V+M | text | Required | Primary label. Enforce uniqueness or warn on duplicates. |
| Item Type | V | select (Product / Service) | High | Service items skip stock fields. |
| Item Code / SKU | V | text | High | In Vyapar this doubles as the barcode value. |
| Barcode | V+M | text + scan | High | Support scanner input; optional auto-generate. |
| HSN / SAC Code | V+M | text (4/6/8 digit) | High | GST compliance; validate length. Link to an HSN master if one exists. |
| Category / Item Group | V+M | select + "add new" | Medium | For grouped reporting. |
| Product Classification — Brand | M | select/text | Medium | Miracle classification axis. |
| Product Classification — Colour | M | select/text | Low | |
| Product Classification — Size | M | select/text | Low | Distinct from batch "size". |
| Product Classification — Material | M | select/text | Low | |
| Description / Narration | V+M | textarea | Low | Prints on invoice/challan; renameable in Vyapar. |
| Item Image | V | image upload | Low | Single image; used in online store. |

### Group B — Units of Measure
| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| Base Unit | V+M | select ("add new") | Required | e.g. Pcs, Box, Kg. |
| Secondary / Alternate Unit | V+M | select | Medium | Miracle "dual stock units". |
| Unit Conversion Rate | V+M | number | Medium | e.g. 1 Box = 12 Pcs. Required if secondary unit set. |
| UQC (GST Unit Quantity Code) | M (V implicit) | select | Medium | Needed for GST returns; map unit → UQC. |

### Group C — Pricing
| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| Sale Price | V+M | number | Required | |
| Sale Price tax type | V | toggle (incl. / excl. tax) | High | Drives billing math — implement carefully. |
| Sale Discount | V | number + unit (% / ₹) | Medium | Default discount on sale. |
| Purchase Price | V+M | number | High | Default cost for purchase entries & valuation. |
| Wholesale Price | V | number + min qty | Medium | Optional tier. |
| MRP | V (batch) | number | Medium | Retail cap; often per-batch. |
| Multi-level Price List | M | table (level → rate/discount) | Low | Distributor pricing tiers. |
| Min / Max Sale Price | — | number | Low | Guardrails; optional. |

### Group D — Taxation (GST)
| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| GST Tax Rate / Slab | V+M | select (0/5/12/18/28 + custom) | Required | |
| GST Commodity mapping | M | select | Medium | Miracle links product → commodity → slab. Optional if slab set directly. |
| Cess % / Cess amount | — | number | Low | For cess-applicable goods. |
| Tax exempt / Nil-rated flag | V+M | checkbox | Low | |

### Group E — Stock & Inventory
| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| Opening Stock Quantity | V+M | number | High | Skip for Service items. |
| Opening Stock Rate ("At Price") | V+M | number | High | Valuation of opening qty. |
| Opening Stock As-of Date | V | date | Medium | Beginning of accounting period. |
| Minimum Stock / Reorder Level | V+M | number | Medium | Drives low-stock alerts. |
| Maximum Stock Level | M | number | Low | |
| Item Location (rack / shelf / box) | V+M | text | Low/Medium | |
| Location-wise Stock | M | table (location → qty) | Medium | Multi-warehouse. **Fully specified in Group H (Multi-Stock).** Needs a Location/Godown master first. |

### Group F — Batch & Serial Tracking (put behind a toggle)
| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| Tracking mode | V+M | radio (None / Batch / Serial) | Medium | Vyapar allows only one mode per item — enforce this. |
| Batch No. | V+M | text | Medium | Per-lot. |
| Mfg. Date | V+M | date | Medium | |
| Expiry Date | V+M | date | Medium | Drives FIFO & expiry reports. |
| Batch MRP | V | number | Medium | Per-batch MRP. Core to the MRP-change-on-restock flow (see 3F.1). |
| Batch Selling Price | V | number | Medium | Per-batch sale price — old and new stock can sell at different prices. |
| Batch Purchase Cost | V+M | number | Medium | Per-batch cost, for correct FIFO valuation across lots. |
| Batch Opening Qty | V+M | number | Medium | |
| Serial No. / IMEI | V+M | repeatable text | Medium | One per unit. |
| Model No. | V | text | Low | |
| Size (batch attribute) | V | text | Low | |

### 3F.1 — Restocking the same item with a changed MRP / selling price (MRP-wise batches)

> **Problem this solves:** the client already has stock of an item and buys more of the *same* item, but
> the new lot has a different MRP and selling price. They need both the old-MRP stock and the new-MRP
> stock to exist at once, be visible separately, and bill at their correct prices. (In India this is
> mandatory — old-MRP stock can't be sold above its printed MRP, so the two lots must coexist.)

**The rule: one item, many batches — never a duplicate item.** Do **not** let users solve this by
creating "Item – MRP 100" and "Item – MRP 120" as separate item master records. That breaks reporting,
stock valuation and the item list. The correct model is a single item whose stock is split into batches,
each batch carrying its own MRP, selling price, cost and quantity.

**Data-entry flow to implement:**
1. Item has batch tracking ON (`Tracking mode = Batch`). Existing stock is **Batch 1** (old MRP, old
   selling price, current qty).
2. When a **purchase / restock** is recorded for that item, let the user add a **new batch (Batch 2)** in
   the same purchase line: new Batch No. (auto-suggest e.g. by date), new Qty, new **Batch MRP**, new
   **Batch Selling Price**, new **Batch Purchase Cost**. Do not overwrite Batch 1.
3. Both batches are now live under the same item.

**How the user sees both (report / view requirement):**
- A **batch-wise stock view** groups by item and lists each batch as its own row: Batch No., MRP,
  Selling Price, Qty (and location, if Group H multi-stock is on). One item therefore shows two rows —
  old-MRP qty and new-MRP qty — with a total-qty summary.
- Surface this both in the item's own detail screen (a "Batches" tab/panel) and in the stock report.

**Billing behaviour:**
- On a sale, selecting the batch **auto-fills that batch's MRP and selling price**. Deduct quantity from
  the chosen batch only.
- **Default to FIFO:** suggest the oldest batch (old MRP) first and deplete it before offering the newer
  one. This keeps both pricing correct and stock valuation accurate when lot costs differ.
- Prevent selling a batch above its own MRP.

**Edge cases to handle:**
- Same MRP re-purchased → allow merging into the existing batch *or* keep a new batch (make it a setting;
  default: new batch, so cost layers stay clean for FIFO).
- Batch running to zero → keep the record (don't delete) so history and reports stay intact; hide
  zero-qty batches from the billing picker by default.
- If multi-stock (Group H) is on, **a batch's quantity is per-location** — batch nests under location, so
  Batch 2 might exist in Godown A but not Godown B.

**Playwright checks for 3F.1:** create an item with an opening batch; record a restock purchase adding a
second batch with a different MRP/price; assert both batches show in the item's Batches panel and the
stock report with correct qty/MRP/price; make a sale and assert FIFO suggests the older batch first and
that selecting a batch auto-fills its price; assert item total qty = sum of batch qtys.

### Group G — Extensibility & Channels
| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| User Defined Fields | M | dynamic key/value | Low | Miracle "user defined fields & masters". Big value for custom verticals. |
| Show in Online Store | V | checkbox | Low | + online category. |
| Active / Inactive flag | — | toggle | Low | Soft-disable without deleting. |
| Notes / Remarks (internal) | — | textarea | Low | Not printed. |

---

## 3H. Group H — Multi-Stock / Location-wise Stock

> **Read this whole subsection before building.** "Multi-stock" (multiple godowns / warehouses /
> branches / stores) is **not** a set of extra columns on the item. It is a small feature area made of
> **three connected pieces**. Build them in this order.

### How both source apps do it (for reference)
- **Vyapar** — "Godown Management & Stock Transfer" is toggled on in Settings. You create **Godowns**
  (each with Type, Name, Phone, Email, GSTIN, Pin Code, Address). Stock is then held **per godown per
  item**, opening stock can be entered godown-wise, and a **Stock Transfer** screen moves quantity From
  → To with an audit trail. A godown dropdown on Sale/Purchase picks the location. Reports filter by
  godown. (Note: Vyapar godowns can't be deleted once created — we should prefer *deactivate*.)
- **Miracle** — "Location wise Stock" is enabled in Advance Setup. There's a **Location List** with a
  default **Primary Location**; more are added via the master. Stock is tracked branch/location/godown-
  wise, and combines with double-unit, batch, serial and expiry per location.

### Piece 1 — Global toggle (config, not per item)
| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| Enable Multi-Stock / Location-wise Stock | V+M | global setting (on/off) | High | When OFF, the item form shows the existing single Opening Stock (Group E) and Group H stays hidden. When ON, Group E's single opening-stock inputs are replaced by the per-location table below. Never show both at once. |

### Piece 2 — Location / Godown Master (separate entity, defined once, referenced by items)
> This master must exist **before** the item-level table works. If our ERP has no location/warehouse
> master, build this first. Do **not** free-type location names on the item.

| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| Location / Godown Name | V+M | text | Required | e.g. "Main Warehouse", "Retail Store", "Godown-A". |
| Location / Godown Code | M | text | High | Short unique code for pickers, imports & reports. |
| Is Primary / Default Location | M | flag | High | Exactly one primary (Miracle "Primary Location"). Used as the default for sales/opening stock. |
| Location Type | V | select (Shop / Warehouse / Godown / Cold Storage / Branch) | Medium | Vyapar "Godown Type". |
| GSTIN | V | text | Medium | Needed if a branch bills under its own GSTIN / for e-invoicing & stock transfer as branch transfer. |
| Address | V | textarea | Medium | |
| City / Pin Code | V | text | Low | |
| Phone No. | V | text | Low | |
| Email | V | text | Low | |
| Active / Inactive | — | toggle | High | Prefer deactivation over deletion (matches Vyapar's no-delete behaviour and preserves history). |
| Racks / Shelves / Bins (sub-locations) | V | child list | Low | Optional nesting inside a godown for bin-level picking. |

### Piece 3 — Per-item stock allocation (this is what sits INSIDE the Item Master, under "Multi-Stock")
> Renders as an editable table on the item form when the global toggle (Piece 1) is ON. One row per
> location the item is stocked in.

| Field | In | Type | Priority | Notes |
|---|---|---|---|---|
| Location / Godown | V+M | select (from Piece 2 master) | Required (per row) | Cannot repeat a location within one item. |
| Opening Qty @ location | V+M | number | High | Replaces the single Group-E opening qty when multi-stock is ON. |
| Opening Rate / Value @ location | V+M | number | High | For location-wise valuation. |
| Current / Available Qty @ location | V+M | number (read-only) | High | Derived from transactions; not manually edited after opening. |
| Min Stock / Reorder Level @ location | V+M | number | Medium | Per-location low-stock alerts. |
| Max Stock Level @ location | M | number | Low | |
| Rack / Shelf / Bin @ location | V | text/select | Low | Ties to Piece 2 sub-locations if used. |
| Default pick location for this item | V | flag / select | Medium | Which godown to default to when selling this item. |
| Batch / Serial rows @ location | V+M | nested (see Group F) | Medium | If the item is batch/serial tracked, those rows attach **per location**, not globally. |
| **Total stock (all locations)** | V+M | number (read-only) | High | Computed sum across rows — show as a summary on the item header. |

### Piece 4 — Stock Transfer (transactional — NOT part of item master, but a required dependency)
> Flag this to the user as related scope. Without it, per-location quantities can only change via
> location-tagged purchases/sales. Minimum fields: Transfer No., Date, **From Location**, **To Location**,
> line items (Item, Qty, optional Batch/Serial), Remarks, and it must write a two-sided stock movement
> with an audit trail. Enforce: From ≠ To, and can't transfer more than available at the source.

### Multi-stock behaviour rules (enforce these)
1. **Single source of truth for quantity.** When multi-stock is ON, an item's total stock is *always* the
   sum of its per-location rows — never a separately editable number.
2. **Toggle swaps, doesn't duplicate.** Turning multi-stock ON hides Group E's single opening-stock inputs
   and shows the Piece 3 table (pre-seed one row = existing qty at the Primary Location so no data is lost).
3. **Locations come from the master only** — always a picker, never free text.
4. **No hard deletes** of a location that holds stock or has history; deactivate instead.
5. **Batch/serial nests under location**, so a serial number belongs to exactly one location at a time
   (a transfer moves it).
6. **Every stock-moving transaction carries a location** (purchase in, sale out, transfer, adjustment).

---

## 4. Playwright verification workflow

For **each** field group you implement, run this loop:

1. **Baseline** — before edits: `page.goto()` the Add-Item screen, `page.screenshot()` → save as
   `baseline-<group>.png`. Enumerate existing fields (`page.getByLabel` / role queries) and log them.
2. **Post-change render check** — after edits: reload, confirm the new field(s) render with the correct
   label, input type, and default state; confirm required-marking where specified.
3. **Regression check** — diff the new screenshot against baseline for the *existing* fields' region;
   confirm no shifts in layout/style.
4. **Round-trip (save) test** — fill the new field(s), save the item, reopen in Edit mode, and assert the
   value persisted (UI **and**, if you have DB/API access, verify the stored record).
5. **Validation test** — submit invalid/empty values for `Required`/`High` fields and assert the correct
   inline error appears in the existing error style.
6. **Conditional-logic test** — e.g. selecting Item Type = Service hides stock fields; tracking mode =
   Serial hides batch fields; setting a secondary unit forces a conversion rate.
7. **Responsive check** — repeat render check at mobile + desktop viewports.

**Extra checks for Group H (Multi-Stock):**
- Toggle the global multi-stock setting and confirm the item form swaps between the single Group-E
  opening-stock inputs and the Piece-3 per-location table (never both visible).
- Add two location rows, save, reopen, and assert both persisted with correct per-location quantities.
- Assert the item header **Total stock** equals the sum of the location rows, and updates live when a
  row changes.
- Assert a location can't be picked twice for the same item, and that location options come only from the
  master (no free text).
- If Stock Transfer (Piece 4) is in scope: transfer qty A→B, then confirm A decreased and B increased by
  the same amount and totals are unchanged.

Keep screenshots per group in a `/playwright-artifacts/` folder and reference them in your summary.

---

## 5. Suggested implementation order

1. Group A (identification) + Group D (GST) + Group B base unit + Group C sale/purchase price + Group E
   opening stock — this is the `Required`/`High` core.
2. Remaining `Medium` fields (secondary units, discounts, reorder level, category, opening date,
   location-wise stock, GST commodity).
3. Group F (batch/serial) behind a toggle.
4. **Group H (Multi-Stock)** — build in its piece-order: Location/Godown master (Piece 2) → global toggle
   (Piece 1) → per-item location table (Piece 3) → Stock Transfer (Piece 4, if in scope). Only start this
   once the single-location stock in Group E is working, since multi-stock builds on it.
5. `Low` fields and Group G (UDFs, online store, classification axes) behind Advanced/collapsible panels.

---

## 6. Acceptance criteria (definition of done)

- [ ] Audit diff (present / missing / incomplete) produced and confirmed with the user before coding.
- [ ] All `Required` and `High` fields exist, validate, save, and reload correctly.
- [ ] No visual or behavioural regression on any pre-existing field (Playwright screenshots attached).
- [ ] New fields follow the existing component, styling, and validation conventions exactly.
- [ ] Conditional logic (service vs product, tracking modes, unit conversion) works.
- [ ] Low-priority/batch fields are hidden behind toggles/advanced panels, keeping the default form clean.
- [ ] Playwright round-trip + validation tests pass for every added field.
- [ ] **MRP-wise restock (3F.1):** restocking the same item with a new MRP/price creates a new batch (not
      a duplicate item); old- and new-MRP batches are both visible with separate qty/MRP/price; billing
      auto-fills the selected batch's price and defaults to FIFO; item total qty = sum of batch qtys.
- [ ] **Multi-stock:** Location/Godown master exists; item total = sum of per-location rows; toggle swaps
      (never duplicates) the stock inputs; locations are picked from the master only; no data lost when
      multi-stock is enabled on an item that already had single-location stock.

---

### Notes / open questions to raise with the user
- Do we already have supporting masters (HSN list, Unit/UQC, Category, Location/Warehouse, Brand)? Some
  fields above (location-wise stock, GST commodity, classification) need these to exist first.
- **Multi-stock scope:** How many locations does the client actually run, and do they need *inter-location
  Stock Transfer* (Piece 4) now or later? Do any branches bill under their own GSTIN (affects whether
  transfers are treated as branch/stock transfers for GST)?
- Should tracking be one-mode-per-item (Vyapar behaviour) or allow batch **and** serial together?
- Is multi-warehouse (location-wise stock) in scope, or single-location for now?
