# Tally / Miracle Feature Map → Desktop ERP

## AUDIT vs desktop/Miracle_behaviour.md (full published behaviour) — 2026-07-04

### §1 Shortcut keys

| Miracle key | Spec action | Ours | Status |
|---|---|---|---|
| F2 (menu level) | Change financial year | F2 = Sales Invoice (Tally-style voucher keys) | ⚠️ deviation — FY shown in title bar; period change = date fields/PgUp-PgDn in registers |
| F3 / F4 (menu) | Add / edit company | F3 = Gateway; company = tenant (portal onboarding); Business Settings edits it | ⚠️ deviation — multi-company is multi-tenant, not a desktop concern |
| Ctrl+I / Ctrl+M / Ctrl+G | company index/combine/group | — | ⬜ N/A (multi-company) |
| Ctrl+U | Utility menu | **Ctrl+U opens Utility** | ✅ added |
| Alt+M/T/G/R/S | module menus | Alt+M/T/G/R/U/S | ✅ |
| Alt+E | Exit menu | **Exit menu (Web Portal / Logout / Quit) + Alt+E** | ✅ added |
| Enter | commit + auto-advance | ✅ everywhere | ✅ |
| Tab | exit grid to header/footer | Tab = next field; Enter on blank row exits grid | ⚠️ deviation (documented) |
| **Ctrl+Enter** | save from anywhere | **added on all 10 entry screens** (Ctrl+A also kept) | ✅ added |
| Esc | cancel field/popup, keep lines | ✅ | ✅ |
| **Shift+F1** | narration recall list | **added (sales narration field, last 10 saved)** | ✅ added |
| **Ctrl+R** | repeat previous narration | **added (sales narration field)** | ✅ added |
| **F9** | inline calculator in numeric fields | **added — F9 in any field opens calculator; Enter writes result; % aware (250-5%)** | ✅ added |
| F1 | context help | **F1 now opens the shortcut-help overlay** (was Gateway; F3 covers Gateway) | ✅ added |

### §2 Sales-invoice walkthrough (steps 1–13)

| Step | Status |
|---|---|
| Alt+T → voucher list → cursor on Party | ✅ (auto-focus) |
| Party picker auto-fills GSTIN/address/state/credit/outstanding | ✅ |
| Date defaults / override | ✅ |
| Invoice number: automatic series **or manual** | ✅ manual "No." field added (duplicate rejected) |
| Item picker auto-fills HSN/UOM/last-rate/GST; Enter walk; auto new row | ✅ |
| **GST auto CGST/SGST vs IGST from PoS vs company state** | ✅ added (seller state from invoice settings/GSTIN; override stays manual) |
| Footer charges + round-off | ✅ |
| Narration recall/repeat | ✅ added |
| Ctrl+Enter save | ✅ added |
| **Post-save tray**: Print / e-Invoice IRN / e-Way / Share | ⚠️ partial — Print ✅, **e-Invoice button added** (IRP payload/IRN via /gst/einvoice); e-Way = portal module; WhatsApp share = portal |
| Stock deducted on save | ✅ |

### §4 Field reference gaps

| Field | Status |
|---|---|
| Order/reference no. (quote → invoice) | ✅ **Quotation Register Enter = Convert to Invoice** (carries party+lines+ref) |
| Salesman/agent | ✅ (broker + commission) |
| Godown/branch per voucher & per line | ⬜ pending (single-godown billing; stock journal is godown-aware) |
| Batch/serial per line | ⬜ pending |
| TCS on footer | ⬜ pending (TDS/TCS batch) |
| Bank details + T&C on print | ⬜ pending (needs settings keys) |
| Quote validity/status/convert | ✅ (validity, status chip, convert) |
| e-Invoice schema (buyer URP, ShipDtls, doc types) | ✅ payload builder (IRP push needs GSP creds) |
| e-Way bill fields | ⚠️ module exists (portal UI); not in desktop entry tray |
| Item master: code/name/alias-barcode/category/brand | ✅ **barcode/alias added (searchable in billing grids)**; category/brand via portal Products |
| Dual units + factor | ✅ |
| Opening stock/rate, reorder level | ✅ (opening stock, min stock; opening *rate* ⬜) |
| Rate tiers (MRP/wholesale/retail) | ✅ (MRP + price levels per party) |
| Batch/expiry, serial/IMEI flags | ⬜ pending |
| Item image/specs | ✅ portal Products page |

## MIRACLE FIELD/BEHAVIOUR PARITY (sales/purchase entry) — status after 2026-07-03

| Miracle field / behaviour | Ours | Status |
|---|---|---|
| Cash Memo / Debit Memo toggle (Dr Cash, auto-settled) | memo select; posting verified Dr Cash | ✅ |
| Voucher date (back/forward dating) | date field → issued_at → books/GST | ✅ |
| Due days → due date (prefills from party credit terms) | ✅ | ✅ |
| Line: Qty + **Free qty** (scheme) | free column, ₹0, strip shows it | ✅ (stock deduction pending) |
| Line: cascading **Disc-1 % + Disc-2 %** | d1/d2 columns, gross→−D1→−D2 | ✅ |
| Bill-level discount (% and ₹ together) | both fields, proportional taxable math | ✅ |
| **Add/Less charges** (freight/packing/other, each with GST) | 3 charge rows; taxable at own rate | ✅ (sales; purchase pending) |
| Auto **round-off** (± to rupee, shown) | round_off column + panel line | ✅ |
| **Received now** (instant part/full settlement) | recordPayment chained after save | ✅ |
| Broker + commission % | stored on invoice | ✅ (payout tracking pending) |
| Transport / LR no. / vehicle no. | transport JSONB | ✅ |
| **Bill To / Ship To** (+ saved-address picker; ShipTo → Place of Supply; e-invoice ShipDtls) | bill_to/ship_to JSONB | ✅ |
| On-the-fly master creation (party/item/supplier) | quick-create modal everywhere | ✅ |
| Party-wise last rate ("rate memory") + purchase-rate memory + margin | context APIs | ✅ |
| Outstanding + credit limit/days warning at party pick | ✅ | ✅ |
| Keymap: F2 Sales · F8 Purchase · F5 Receipt · F6 Payment · F7 Journal · F4 Contra · F3 Masters · F9 Day Book · F10 T.B. · F11 Setup · F12 Config · Ctrl+P print · Alt-menus · Ins/Ctrl+Del rows · Enter-first | ✅ all | ✅ |
| Dual/compound units (bags↔kg) | — | ⬜ |
| Batch/expiry + godown columns in entry grids | masters exist | ⬜ |
| Multiple voucher series per type | single series | ⬜ |
| PgUp/PgDn browse prev/next voucher in entry | register drill-down only | ⬜ |
| Voucher edit / cancel from register | read-only register | ⬜ |
| Invoice PRINT FORMAT (GST layout on Ctrl+P) | raw screen print | ⬜ next |
| Charges → dedicated income ledgers | folded into Sales credit | ⬜ |
| Interest on overdue, cheque printing, TDS/TCS | — | ⬜ |


Analysis of Tally Prime and Miracle (RKIT) feature sets, mapped to this codebase.
Drives the "Excel-like keyboard ERP" rollout. Status: ✅ built · 🟡 partial · ⬜ planned.
The web portal stays as-is; the keyboard-first screens are additive (`/entry/*`).

## 1. The entry UX (what makes Tally/Miracle feel fast)

| Behaviour | Tally/Miracle | Ours | Status |
|---|---|---|---|
| Enter/Tab = next field; at row end → next row | Yes (Enter-driven) | Grid keymap in entry screens | ✅ sales invoice |
| Esc = back / close popup | Yes | Global + per-popup | ✅ |
| F-key voucher jumps (F4–F9) | Yes | KeyboardShortcutsService + Electron menu | ✅ |
| Ctrl+A = accept/save | Yes | Save hotkey on entry screens | ✅ sales invoice |
| Typeahead popups navigated by arrows+Enter | Yes | Party + item cells | ✅ sales invoice |
| No-mouse full flow | Yes | Entry screens designed keyboard-first | ✅ sales invoice → ⬜ rest |

## 2. Billing intelligence (Miracle's signature)

| Feature | Miracle/Tally | Ours | Status |
|---|---|---|---|
| Party selected → balance/outstanding shown | Both | customer + supplier context APIs (outstanding, open bills, recent, top items w/ last rate) | ✅ |
| Item selected → **current stock** shown | Both | inventory (stock−reserved) + erp_stock warehouse sum | ✅ |
| Item selected → **last rate to this party + date** | Miracle (party-wise rate memory) | orders + ERP invoice JSONB, latest wins | ✅ |
| Purchase-rate memory (last cost from this supplier) | Miracle | supplier_order_items history, prefills purchase grid | ✅ |
| Last rate overall / standard rate fallback | Both | sale_price → base_price fallback chain | ✅ |
| HSN + GST% auto-fill from item master | Both | products.hsn_code / gst_rate | ✅ |
| **Margin vs purchase rate while billing** | Miracle | purchase grid shows sale rate + live margin % | ✅ |
| Supplier bill no./date on purchase (2B matching) | Tally mandatory fields | supplier_invoice_no/date captured in grid | ✅ |
| Bill-wise outstanding + ageing buckets | Both | `/accounting/reports/ageing` (receivables + payables, 30/60/90) | ✅ |
| **Credit limit / days warning** | Both | per-party credit_limit + credit_days; red banner at billing when outstanding + bill > limit; amber overdue banner | ✅ |
| **Price levels (wholesale/retail A/B/C)** | Miracle rate structures, Tally price levels | price_levels + price_list_items masters at `/entry/masters`; assigned per party; **wins as billing rate** (level → party memory → standard) | ✅ |
| Batch/expiry pick at billing | Both | product_batches exists; not in entry grid yet | 🟡 |
| Godown (warehouse) pick per line | Both | erp_warehouses/erp_stock exist; not in grid | 🟡 |

## 3. Masters

| Master | Tally | Ours | Status |
|---|---|---|---|
| Account groups (17 primary) | Yes | ledger_groups seeded (migration 061) | ✅ |
| Ledgers / chart of accounts | Yes | ledger_accounts + auto party-ledgers | ✅ |
| Stock items | Stock item master | products (+hsn/gst/uom) | ✅ |
| Stock groups/categories | Yes | categories/brands | ✅ |
| Godowns | Yes | erp_warehouses | ✅ |
| Units (simple) / compound units | Yes / compound | products.uom / no compound | 🟡 |
| Parties (debtors/creditors) | Ledgers | customers / suppliers (+auto ledger) | ✅ |
| Cost centres | Yes | branches (partial analogue) | 🟡 |

## 4. Vouchers / transactions

| Voucher | Tally key | Ours | Status |
|---|---|---|---|
| Sales invoice (item-wise) | F8 | `/entry/sales` Excel grid → ERP invoice + auto voucher | ✅ |
| Purchase (item-wise, supplier bill no/date) | F9 | `/entry/purchase` grid → supplier order + auto Purchase voucher (Dr Purchase + Input Tax, Cr Supplier) | ✅ |
| Receipt with bill-wise allocation | F6 | `/entry/receipt` — open bills oldest-first w/ ageing, FIFO auto-allocate, per-bill edit | ✅ |
| Payment to supplier, bill-wise | F5 | `/entry/payment` — open purchase bills, FIFO allocation, Cash/Bank toggle → Payment voucher | ✅ |
| Credit / Debit note (returns) | Alt+F6 etc. | `/entry/returns` grid — CN: Dr Sales Returns+Output Tax Cr Customer; DN: Dr Supplier Cr Purchase Returns+Input Tax | ✅ |
| Quotation | Yes | `/entry/quote` grid (stock + party-rate memory while quoting) → draft quote, sendable from web | ✅ |
| Stock journal | Yes | `/entry/stock` — godown-wise ± adjustments w/ live new-qty + movement audit trail | ✅ |
| Contra / Journal | F4/F7 | `/accounting/vouchers/new` (ledger rows) | ✅ basic |
| Sales order | Yes | `/entry/order` grid (billing intelligence + delivery fee) → pending order, fulfilled via web/WhatsApp | ✅ |
| Stock transfer (godown→godown) | Yes | `/entry/stock` Transfer mode → erp_stock movements | ✅ |
| Delivery note | Yes | deliveries module (web) | 🟡 |
| POS | Yes | pos module | 🟡 |

## 5. GST compliance

| Feature | Ours | Status |
|---|---|---|
| GSTR-1 (B2B/B2CS) + portal JSON | GstModule | ✅ |
| GSTR-3B 3.1(a) | GstModule | ✅ |
| HSN summary | from items JSONB | ✅ |
| GSTR-2B import + reconcile vs purchases | gstr2b_records + reconcile | ✅ |
| E-invoice IRN (NIC v1.1) | einvoice service (needs GSP creds) | ✅/🟡 |
| E-way bill | EWB-01 PDF exists; link into GST screen | 🟡 |
| CGST/SGST/IGST split on ERP invoices | per-line GST + interstate split | ✅ (this iteration) |

## 6. Reports

| Report | Ours | Status |
|---|---|---|
| Day Book / Trial Balance / P&L / Balance Sheet | accounting reports | ✅ |
| Ledger statement (running balance) | `/accounting/reports/ledger` — picker + opening/lines/closing | ✅ UI |
| Bill-wise outstanding + ageing | `/accounting/reports/ageing` | ✅ |
| Stock summary (qty + value) | `/accounting/reports/stock-summary` | ✅ |
| Voucher register w/ drill-down to entries | `/accounting/vouchers` expandable rows | ✅ |
| Cash/Bank book | via Cash/Bank ledger statement | ✅ |
| **Gateway hub (F1)** | `/gateway` — keyboard menu over all transactions/reports/masters | ✅ |

## 7. Utilities

| Feature | Ours | Status |
|---|---|---|
| Works offline, syncs when online | embedded PG + sync engine | ✅ |
| Multi-company | companies/branches modules | 🟡 |
| Backup | pgdata folder copy; needs one-click | ⬜ |
| Users/security | roles (owner/seller) | 🟡 |
| Financial-year handling | year-scoped sequences | ✅ |

## Rollout order for the Excel-grid pattern

1. ✅ **Sales invoice** (`/entry/sales`) — flagship, F8
2. ✅ Purchase entry (`/entry/purchase`) — F9, supplier bill no/date, purchase-rate memory, margin, Input-Tax posting
3. ✅ Receipt with bill-wise FIFO allocation (`/entry/receipt`) — F6
4. ✅ Ageing report (`/accounting/reports/ageing`) — receivables + payables, 30/60/90 buckets
5. ✅ Payment to suppliers (`/entry/payment`) — F5, bill-wise allocation, Cash/Bank, Payment-voucher posting
6. ✅ Quotation grid (`/entry/quote`) — draft quotes with billing intelligence
7. ✅ Credit/debit note grid (`/entry/returns`) — both auto-post with return ledgers
8. ✅ Stock journal (`/entry/stock`) — godown ± adjustments, audit trail
9. ✅ Price levels + credit limits (`/entry/masters` + billing-time warnings + rate priority)
10. ✅ Sales-order grid (`/entry/order`); stock transfer (Transfer mode in `/entry/stock`)
11. ✅ Voucher register drill-down; Ledger-statement UI; Stock Summary; **Gateway (F1)**
12. ⬜ Batch/expiry + godown columns in the sales/purchase grids
13. ⬜ Delivery-note flow from orders; POS keyboard mode
14. ⬜ **Full runtime test** (non-elevated shell) → then Phase 6 signed installer
