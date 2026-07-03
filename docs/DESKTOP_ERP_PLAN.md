# Desktop ERP — Offline-First Plan (Electron / Windows)

Turn the WhatsApp-Commerce SaaS into a **Tally/Vyapar-class offline-first desktop ERP**
for distributors, without rewriting the Angular app or abandoning the cloud portal.

## Goals (from product owner)

- Windows desktop app (Electron), distributed to distributors.
- **Offline-first**: local master data (SKUs, customers, ledgers, vouchers) on each PC.
- Online → use cloud; offline → use local; on reconnect → **full two-way sync**.
- Full **Tally-style keyboard shortcuts** and complete ERP UI/UX.
- Full **double-entry accounting** (ledgers, vouchers, Trial Balance, P&L, Balance Sheet)
  **+** billing **+** GST returns / e-invoice / e-way bill.
- **Keep the existing portal** (WhatsApp automation, webviews, campaigns) as-is.

## Core architectural insight

Every data call in the Angular app goes through **one** chokepoint:
`frontend/src/app/core/services/api.service.ts` (`baseUrl = environment.apiUrl`).

So the Angular app does **not** need offline logic. We run a **local copy of the NestJS
backend inside Electron**, bound to `http://127.0.0.1:<port>`, backed by a **local
embedded PostgreSQL**. Angular always talks to localhost. A **sync engine** reconciles
the local DB with the cloud EC2 backend when internet is available.

```
Electron main process
 ├─ BrowserWindow → loads Angular from http://127.0.0.1:PORT  (same-origin, cookies work)
 ├─ Embedded NestJS backend (reused from src/) on 127.0.0.1:PORT
 │    └─ Local PostgreSQL  (embedded-postgres) — SAME entities & raw SQL as cloud
 └─ Sync engine
      • online detector
      • outbox: local writes queued as change-log rows
      • push: send unsynced local changes → cloud
      • pull: fetch cloud changes since last cursor → apply locally
      • conflict resolution: last-writer-wins + per-entity rules; tombstones for deletes
```

Why embedded **PostgreSQL** (not SQLite): the ERP code uses Postgres-specific raw SQL
(`RETURNING`, casts, `sql-result.util.ts`). Keeping Postgres on both sides = zero query
rewrites and identical migrations run locally and in cloud.

## Sync model (per tenant / per company)

- Every syncable table gets: `updated_at timestamptz`, `sync_version bigint`,
  `origin_node uuid`, and a soft-delete `deleted_at`.
- A `sync_outbox` table records local mutations (entity, pk, op, payload, ts).
- A `sync_state` table stores the last pulled cursor per table.
- Push loop drains the outbox to `POST /sync/push` on the cloud; pull loop calls
  `GET /sync/pull?since=<cursor>` and upserts.
- Conflicts: default **last-writer-wins** by `updated_at`; documents that are already
  filed with GST (invoices with an IRN, e-way bills) are **immutable once synced** —
  cloud wins, local is rejected and flagged for the user.
- Identity: local rows use UUID PKs so two offline nodes never collide.

## Phases

- **Phase 0 — Electron shell (DONE in `desktop/`)**
  Runnable Windows app that loads the existing portal (cloud URL). NSIS installer,
  auto-update wiring, secure preload bridge, single-instance, external-link handling.
  Ships something to distributors immediately while the rest is built.

- **Phase 1 — Embed the backend + local Postgres (DONE, dev-runnable)**
  Electron boots `embedded-postgres` (PG 17) → first-run provisioning (`migration:public`
  + `tenant:create`) → forks the compiled NestJS backend pointed at local Postgres with
  `SERVE_STATIC_DIR` = Angular build → loads `http://127.0.0.1:43110`. Boot splash +
  cloud fallback on failure. Files: `desktop/src/{localdb,provision,backend,main,paths}.ts`
  and a guarded `SERVE_STATIC_DIR` block in `src/main.ts`.
  Verified: both projects compile; embedded initdb succeeds on Windows. Note: Postgres on
  Windows refuses to run **as Administrator** — launch the app normally.
  Remaining for packaging (folded into Phase 6): bundle backend+PG via extraResources,
  rebuild native modules for Electron ABI, precompile provisioning (drop the ts-node path).

- **Phase 2 — Sync engine (Slice 1 DONE, master data; compile-verified)**
  - Tenant migration `059_sync_infrastructure`: sync columns + shared `sync_seq` +
    `sync_stamp`/`sync_enqueue` triggers + `sync_outbox`/`sync_state`, on customers,
    categories, brands, products, product_variants, suppliers, erp_tax_rates,
    erp_warehouses. Enqueue gated to `sync.role='node'` so the cloud skips the outbox.
  - Backend `SyncModule` (`GET /api/sync/changes`, `POST /api/sync/apply`, `/sync/status`):
    tenant-scoped (cloud=session, local=X-Sync-Key), returns `{success,data}` so raw rows
    aren't camelCased. LWW by updated_at (strict `<`), apply-mode prevents echo.
  - Desktop relay `desktop/src/sync.ts`: push (local outbox→cloud) + pull
    (cloud version→local), cursor persistence, cloud login. Gated by `DESKTOP_SYNC=1`
    (default OFF until cloud is deployed + a real account exists).
  - `desktop/test/sync-smoke.mjs`: end-to-end test (two schemas) of capture/echo/LWW.
  - **Runtime-verify pending**: Postgres won't run under an elevated shell, so the SQL
    hasn't been executed here — run the smoke test + app on a normal shell.
  - Next slices: transactional tables + hard-delete tombstones; onboarding-issued cloud
    sync token (replace shared login); sync status UI + outbox pruning on cloud.

- **Phase 2 finish (DONE):** transactional tables synced (migration `060`: orders,
  order_items, invoices, quotes, quote_items, payments, deliveries); per-tenant cloud
  **sync token** (public migration `008_sync_tokens` + `POST /sync/token` + `X-Sync-Token`
  auth path) so the desktop stops reusing the password; a preload-injected **sync-status
  badge** (green Synced / amber Offline / blue Syncing / red error).

- **Phase 3 — Tally keyboard layer (DONE, compile-verified)**
  `frontend/src/app/core/services/keyboard-shortcuts.service.ts` — global keydown +
  `window.desktop.onMenuCommand`, mapping F1 Gateway, F4 Contra … F9 Purchase, F11
  Features, Esc back → routes. Registered via `provideAppInitializer` in app.config.ts.
  Voucher/report routes land on the Phase-4 accounting screens.

- **Phase 4 — Accounting core (DONE, compile-verified)**
  - Tenant migration `061_accounting_core`: ledger_groups (17 Tally primary groups seeded
    with `nature`), ledger_accounts (chart of accounts + default ledgers), vouchers,
    voucher_entries.
  - Backend `AccountingModule` (`/api/accounting/*`): balanced voucher posting
    (Σdebit=Σcredit), ledgers/groups CRUD, and reports — Trial Balance, P&L, Balance
    Sheet, Day Book, ledger statement (all derived from entries + opening balances).
  - Angular `features/accounting/`: vouchers list, keyboard-driven voucher entry form
    (balance indicator), ledgers list+create, and a reports screen for all 4 statements.
    Routed under `/accounting/*` inside the main layout.
  - **Auto-posting (DONE):** migration `062_accounting_links` (source_type/source_id on
    ledger_accounts + vouchers, unique for idempotency). `AccountingPostingService`
    `@OnEvent('invoice.created')` → Sales voucher, `@OnEvent('payment.verified')` →
    Receipt voucher — idempotent, best-effort. Both invoice paths emit (WhatsApp already
    did; ERP `erp-invoice.service` now emits on create + recordPayment). Customer→ledger
    auto-mapped under Sundry Debtors; 'Output Tax' ledger absorbs ERP combined total_tax;
    Round Off balances the voucher.
  - Follow-ups: bill-wise outstanding + ageing; cash/bank books; sync accounting tables.

- **Phase 5 — GST compliance (first cut DONE, compile-verified)**
  - Migration `063_einvoice_fields` (irn/ack_no/ack_date/einvoice_qr/einvoice_status).
  - `GstModule` (`/api/gst/*`): GSTR-1 (B2B/B2CS), GSTR-3B (3.1(a)), HSN summary, GSTR-1
    **portal JSON** export; e-invoice **IRN** — `buildPayload` (NIC/IRP v1.1) +
    `generateIrn` gated on `EINVOICE_API_URL`/`EINVOICE_AUTH_TOKEN` (else returns payload
    for manual upload). Invoice-level cgst/sgst/igst exact; rate/HSN detail best-effort.
  - Angular `features/gst/gst-returns.component` at `/gst` (GSTR-1/3B/HSN tabs + JSON
    download); `GstService`; F-key GST shortcut → `/gst`.
  - **GSTR-2B reconciliation (DONE):** migration `064_gstr2b` (`gstr2b_records` +
    `supplier_orders.supplier_invoice_no`). `Gstr2bService` imports portal 2B JSON and
    reconciles against the purchase register (supplier_orders + supplier GSTIN): matched /
    mismatch / only-in-2B / only-in-books + ITC totals. `/api/gst/gstr-2b/{import,reconcile}`;
    GSTR-2B tab in the UI (file upload + reconciliation tables).
  - **Seller master (DONE):** `SellerProfileService` reads `invoice_*` settings; feeds the
    e-invoice SellerDtls and the GSTR-1 JSON GSTIN.
  - Follow-ups: e-way bill link into the GST screen; real IRP/GSP credentials.

- **Phase 7 — Excel-like keyboard ERP UX (STARTED; flagship screen DONE)**
  Feature analysis: `docs/TALLY_MIRACLE_FEATURE_MAP.md` (Tally Prime + Miracle mapped to
  this codebase, with the rollout order). Web portal untouched; new screens live at `/entry/*`.
  - Backend `EntryModule` (`/api/entry/*`): customer/product typeahead; party context
    (outstanding, open bills, recent invoices, top items w/ last rate); item context
    (stock-in-hand from inventory + erp_stock, **party-wise last rate + date** from
    orders + ERP invoice JSONB — Miracle "rate memory").
  - ERP invoice engine: per-line `gstRate` + `hsn` (auto-enriched from the product
    master), proportional-discount taxable base, **CGST/SGST/IGST split** +
    is_interstate/buyer_gstin/place_of_supply persisted → correct auto-posted vouchers
    and GSTR-1 for ERP invoices. Legacy whole-invoice taxRate path preserved.
  - `/entry/sales` (**F8**): Excel-grid sales invoice — Enter/Tab cell walk, Shift+Tab
    back, ↑↓ rows/popup, Esc closes, **Ctrl+A saves**; party panel with outstanding &
    history; per-row strip: Stock · Last to this party ₹X on date · Last overall; GST
    auto-fill; live CGST/SGST or IGST totals; saves ERP invoice → auto-posts to books.
  - Desktop local tenant now provisions on the **enterprise** plan (ERP endpoints are
    plan-gated).
  - **Purchase grid (F9) DONE:** migration `065` (supplier bill no/date, per-line GST +
    interstate split on supplier_orders, Input Tax ledger); `PurchaseRecordedEvent` →
    `postPurchase` (Dr Purchase + Input Tax, Cr Supplier via ensurePartyLedger);
    supplier context APIs (payables, purchase history, purchase-rate memory);
    `/entry/purchase` grid with rate-memory prefill + live margin % vs sale price.
  - **Receipt with bill-wise allocation (F6) DONE:** `/entry/receipt` — open bills
    oldest-first with age, FIFO auto-allocate, per-bill edit, sequential recordPayment
    (each auto-posts a Receipt voucher). `openBills` context API.
  - **Ageing report DONE:** `/accounting/reports/ageing` — receivables + payables,
    0-30/31-60/61-90/90+ buckets per party.
  - Next in rollout: payment-to-supplier grid (F5, needs supplier-order payments),
    quote/order grids, credit/debit-note grids, stock journal grid, price levels,
    credit limits, batch/godown columns.

- **Phase 6 — Distribution / packaging (config DONE, compile-verified)**
  - Compiled provisioning: `src/provision-cli.ts` (+ shared `src/database/public-migrations.ts`)
    runs public+tenant migrations and creates the local tenant with no ts-node/npm.
    `desktop/src/provision.ts` now forks `dist/provision-cli.js`.
  - `electron-builder.yml`: bundles the backend (`../dist` + `node_modules`), Angular build,
    and embedded-Postgres binaries under `resources/backend` (asarUnpack for the PG binaries);
    `desktop` script `pack:full` builds all three then packages.
  - **Remaining before shipping** (needs their machine/cert, can't verify here): rebuild the
    backend's native modules (sharp/bcrypt) for Electron's ABI or bundle a Node runtime;
    Windows code-signing (`CSC_LINK`/`CSC_KEY_PASSWORD`); shrink the installer (bundle/prune
    node_modules); licensing/activation; crash reporting; hosted auto-update feed.

## Open decisions (defaults chosen, change if needed)

- Local DB: **embedded PostgreSQL** (default) — alternative pglite/pg-mem if binary size matters.
- Conflict policy: **last-writer-wins + immutable filed GST docs** (default).
- Update feed: **generic HTTPS (S3/your server)** default; GitHub Releases alternative.
- Auth offline: local backend issues its own session; first login must be online, then a
  cached credential/refresh token allows offline unlock.
```
