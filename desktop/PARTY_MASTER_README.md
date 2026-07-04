# Party Master — Module Specification & Build Guide

> Reference specification for the **Party Master** module of the ERP system.
> Modeled on the GST-compliant party/ledger pattern used by Miracle, Marg, and Tally,
> reconstructed from documented features + standard Indian GST ERP practice.
> *(Vendors do not publish internal schemas; conditional-validation rules below are the standard model, not a copied spec.)*

---

## 1. Core Architectural Principle

**A "party" is NOT a separate customer/supplier entity — it is a ledger account.**

Whether a party behaves as a **sale party** or a **purchase party** is determined by its **account group**, not by a type flag:

| Role | Account Group | Accounting Nature |
|------|---------------|-------------------|
| Sale party (customer) | Sundry Debtors | Asset / Receivable |
| Purchase party (supplier) | Sundry Creditors | Liability / Payable |
| Both (vendor you also sell to) | Same single record | Double-entry stays correct |

> ⚠️ **Do NOT build separate `customers` and `suppliers` tables.**
> Model **one** `party` (ledger) entity that can play either role. This keeps
> reconciliation, contra entries, and outstanding reports clean.

**Master switch:** `gst_registration_type` drives which other fields become mandatory.

---

## 2. Field Specification (ALL fields — every priority)

Legend — **Priority**: `P0` critical / `P1` important / `P2` nice-to-have / `P3` low.
**Req**: ✅ always · ⚠️ conditional · ⬜ optional.

### 2.1 Identity & Grouping

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `party_name` | ✅ | P0 | Ledger name; must be **unique** |
| `account_group` | ✅ | P0 | Debtor / Creditor — drives sale vs purchase behavior |
| `alias / short_name` | ⬜ | P2 | Quick search / billing shortcut |
| `display_name` | ⬜ | P3 | Print name if different from legal name |
| `party_code` | ⬜ | P2 | Auto or manual unique code |
| `is_active` | ⬜ | P1 | Soft-disable without deleting |

### 2.2 GST & Statutory

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `gst_registration_type` | ✅ (GST) | P0 | Regular / Composition / Unregistered / Consumer / SEZ / Overseas — **master switch** |
| `gstin_uin` | ⚠️ | P0 | Mandatory if Regular/Composition. 15 chars, validate format + checksum |
| `pan` | ⚠️ | P1 | Chars 3–12 of GSTIN; independently needed for TDS/TCS |
| `state` + `state_code` | ✅ (GST) | P0 | Decides CGST+SGST (intra) vs IGST (inter-state) |
| `place_of_supply` | ⚠️ | P1 | Defaults from state; overridable at voucher |
| `reverse_charge_applicable` | ⬜ | P2 | Flag for unregistered / RCM suppliers |
| `tds_applicable` + `tds_section` | ⬜ | P2 | For payments attracting TDS |
| `tcs_applicable` | ⬜ | P3 | Rare; goods-specific |
| `aadhaar` | ⬜ | P3 | Only if business flow needs it |

### 2.3 Addresses

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `billing_address` | ✅ (invoicing) | P0 | Line 1/2, city, state, country |
| `pincode` | ✅ (invoicing) | P1 | Needed for e-way bill distance |
| `shipping_addresses[]` | ⬜ (many) | P1 | **One party → many ship-to addresses** (bill-to/ship-to, e-way) |
| `landmark` | ⬜ | P3 | Delivery convenience |

### 2.4 Contact

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `contact_person` | ⬜ | P2 | Primary contact name |
| `mobile` | ⬜* | P1 | *Effectively required for WhatsApp/SMS invoice sending |
| `email` | ⬜* | P1 | *Required for email invoice sending |
| `phone_landline` | ⬜ | P3 | Legacy |
| `website` | ⬜ | P3 | B2B nicety |
| `additional_contacts[]` | ⬜ | P3 | Multiple contacts per party |

### 2.5 Financial & Credit Control

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `opening_balance` + `dr_cr` | ⬜ | P1 | Set at creation |
| `credit_limit` | ⬜ | P1 | Powers aging & block-on-overlimit |
| `credit_days` | ⬜ | P1 | Drives outstanding/aging reports |
| `bill_by_bill_tracking` | ⬜ | P1 | Bill-wise outstanding (Tally-style discipline) |
| `interest_on_overdue` | ⬜ | P3 | Optional interest calc |

### 2.6 Pricing & Discounts

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `price_list_id` | ⬜ | P1 | Party-wise rate list — **link, not a column** |
| `default_discount_pct` | ⬜ | P2 | Party-wise default discount |
| `default_sales_ledger` | ⬜ | P2 | Auto-select on voucher |
| `default_payment_terms` | ⬜ | P3 | Text/template |

### 2.7 Banking

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `bank_name` | ⬜ | P2 | For payments + invoice footer |
| `account_number` | ⬜ | P2 | Validate length |
| `ifsc` | ⬜ | P2 | Validate format |
| `upi_id` | ⬜ | P3 | Faster recovery |

### 2.8 Classification & Custom (Marg-style flexibility)

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `salesman_id` | ⬜ | P2 | Distributor workflows |
| `route` / `area` / `zone` | ⬜ | P2 | Beat/route planning |
| `party_category` / `tags[]` | ⬜ | P3 | Segmentation |
| `user_defined_fields{}` | ⬜ | P2 | Add attributes without schema change (JSON column) |

### 2.9 Attachments & Media

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `documents[]` | ⬜ | P3 | GST cert, PAN copy, agreements (image/doc type field) |
| `party_image / logo` | ⬜ | P3 | Optional avatar |

### 2.10 Audit (system-managed)

| Field | Req | Priority | Notes |
|-------|-----|----------|-------|
| `created_at` / `created_by` | ✅ | P1 | Audit log |
| `updated_at` / `updated_by` | ✅ | P1 | Activity audit |
| `deleted_at` (soft delete) | ⬜ | P1 | Never hard-delete parties with transactions |

---

## 3. "Required to Create" — quick answer by use case

| Scenario | Minimum required fields |
|----------|------------------------|
| **Bare minimum (save any party)** | `party_name` + `account_group` + `state` |
| **Sale party** (valid B2B tax invoice / e-invoice) | Name, Group=Debtor, `gst_registration_type`, `gstin_uin`, state/code, billing address + pincode, place of supply |
| **Purchase party** (to claim Input Tax Credit) | Name, Group=Creditor, reg type = **Regular**, `gstin_uin`, state, PAN (+ bank details if paying from system) |
| **Walk-in / Cash / Consumer** | Name, Group=Debtor, reg type=Consumer — **no GSTIN** |

> **Recurring rule:** `gst_registration_type` is the master switch. Make GSTIN /
> state / place-of-supply **conditionally** mandatory based on it — never
> hard-required for everyone (consumer/cash parties have no GSTIN).

---

## 4. Validation Rules

- `gstin_uin`: 15 chars, regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`, verify checksum digit.
- First 2 chars of GSTIN **must equal** the party's `state_code`.
- `pan`: 10 chars `^[A-Z]{5}[0-9]{4}[A-Z]$`; if GSTIN present, PAN = GSTIN[2:12].
- `ifsc`: `^[A-Z]{4}0[A-Z0-9]{6}$`.
- `email`: RFC-basic; `mobile`: 10 digits (configurable country).
- Reg type = Regular/Composition ⇒ GSTIN **required**.
- Reg type = Consumer/Unregistered ⇒ GSTIN **must be empty**.
- Block save if `credit_limit` set but negative; warn (not block) on duplicate GSTIN.
- Prevent delete if any voucher references the party → force soft-delete/inactive.

---

## 5. Suggested Data Model (illustrative)

```sql
CREATE TABLE party (
  id                    BIGSERIAL PRIMARY KEY,
  party_name            VARCHAR(200) NOT NULL,
  party_code            VARCHAR(50) UNIQUE,
  account_group         VARCHAR(30) NOT NULL,          -- 'SUNDRY_DEBTOR' | 'SUNDRY_CREDITOR' | ...
  gst_registration_type VARCHAR(20) NOT NULL,          -- master switch
  gstin_uin             VARCHAR(15),
  pan                   VARCHAR(10),
  state                 VARCHAR(50),
  state_code            VARCHAR(2),
  place_of_supply       VARCHAR(50),
  reverse_charge        BOOLEAN DEFAULT FALSE,
  billing_address       JSONB,
  pincode               VARCHAR(10),
  contact_person        VARCHAR(120),
  mobile                VARCHAR(15),
  email                 VARCHAR(120),
  opening_balance       NUMERIC(15,2) DEFAULT 0,
  opening_dr_cr         CHAR(2),                        -- 'DR' | 'CR'
  credit_limit          NUMERIC(15,2),
  credit_days           INT,
  bill_by_bill          BOOLEAN DEFAULT FALSE,
  price_list_id         BIGINT REFERENCES price_list(id),
  default_discount_pct  NUMERIC(5,2),
  bank_name             VARCHAR(120),
  account_number        VARCHAR(34),
  ifsc                  VARCHAR(11),
  upi_id                VARCHAR(80),
  salesman_id           BIGINT,
  route                 VARCHAR(80),
  area                  VARCHAR(80),
  tags                  JSONB,
  user_defined_fields   JSONB,                          -- Marg-style flexibility
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT now(),
  created_by            BIGINT,
  updated_at            TIMESTAMPTZ DEFAULT now(),
  updated_by            BIGINT,
  deleted_at            TIMESTAMPTZ
);

CREATE TABLE party_shipping_address (
  id            BIGSERIAL PRIMARY KEY,
  party_id      BIGINT NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  label         VARCHAR(80),
  address       JSONB,
  pincode       VARCHAR(10),
  gstin_uin     VARCHAR(15),        -- ship-to may have its own GSTIN
  is_default    BOOLEAN DEFAULT FALSE
);
```

---

## 6. Feature Comparison — what to borrow

| Capability | Miracle | Marg | Tally | Borrow because… |
|-----------|:-------:|:----:|:-----:|-----------------|
| Ledger-as-party core | ✅ | ✅ | ✅ | Non-negotiable foundation |
| Party-wise rate list | ✅ | ✅ | ⬜ | Distributor/wholesale pricing |
| Bill-to / Ship-to (e-way) | ✅ | ✅ | ✅ | Multi-address from day one |
| WhatsApp/Email/SMS send | ✅ | ✅ | ⬜ | Design contacts as reachable |
| User-defined fields | ✅ | ✅ | limited | Add attrs without migrations |
| Bill-by-bill outstanding | ✅ | ✅ | ✅ | Clean aging reports |

---

## 7. Build Checklist

- [ ] Single `party` table (no split customer/supplier)
- [ ] `account_group` drives role
- [ ] Conditional validation keyed off `gst_registration_type`
- [ ] GSTIN + state-code cross-check
- [ ] Shipping addresses as child table (1→many)
- [ ] Price list as FK link
- [ ] `user_defined_fields` JSON column
- [ ] Soft-delete + audit columns
- [ ] Duplicate-GSTIN warning
- [ ] UI: progressive disclosure (hide GST fields for Consumer type)

---

## 8. Master Prompt for Claude — Build the Party Master

> Copy-paste this into Claude (Claude Code or chat) to start implementation.
> It instructs Claude to build the module **and** analyze/fix the UI as it goes.

```
You are a senior full-stack developer working on my ERP system. Your task is to
implement the PARTY MASTER module, and to simultaneously analyze the UI for it and
resolve any issues or errors you encounter.

CONTEXT
- A "party" is a ledger account, not a separate customer/supplier. One party table
  serves both roles; the account_group (Sundry Debtor vs Sundry Creditor) decides
  whether it behaves as a sale or purchase party. Do NOT create separate customer
  and supplier tables.
- This is a GST-compliant Indian ERP. gst_registration_type is the master switch
  that decides which fields are mandatory.
- Full field list, priorities, validation rules, and the reference SQL schema are in
  PARTY_MASTER_README.md (sections 2–5). Follow them.

WHAT TO BUILD
1. Data layer: create the party and party_shipping_address tables/models per the
   README schema. Include audit columns and soft-delete.
2. Validation layer: implement all rules in README section 4 — GSTIN format +
   checksum, GSTIN-first-2-chars == state_code, PAN, IFSC, conditional-required
   logic keyed off gst_registration_type. Return field-level errors.
3. API/service layer: create, read, update, soft-delete, list (with search by name/
   GSTIN/mobile), and a duplicate-GSTIN check.
4. UI: a Party Master create/edit form with:
   - Progressive disclosure: hide GST fields when registration type is
     Consumer/Unregistered; show them for Regular/Composition.
   - Sections matching README 2.1–2.9 (identity, GST, addresses, contact,
     financial, pricing, banking, classification, attachments).
   - Repeatable shipping-address sub-form (1 party -> many).
   - Inline validation messages mirroring the backend rules.
   - Save disabled until required fields for the chosen role are valid.

WORKING METHOD (important)
- First inspect the existing codebase and tell me the stack, folder structure, and
  where this module should live BEFORE writing code. Ask me only if something is
  genuinely ambiguous; otherwise state your assumption and proceed.
- Reuse existing components, styling, and conventions — match the current UI, do not
  introduce a new design language.
- As you build the UI, actively analyze it: check for layout breakage, misaligned
  fields, missing states (loading/error/empty), accessibility issues, console errors,
  and validation mismatches between front and back end. When you find an issue, fix
  it and briefly note what was wrong and how you resolved it.
- After each meaningful chunk, run/build the project (or the relevant tests) to catch
  errors, and resolve any that appear before moving on.
- Work incrementally: schema -> validation -> API -> UI -> polish. Show me a short
  summary and a diff at the end of each stage; don't dump everything at once.

CONSTRAINTS
- Conditional-required, never hard-required-for-all (cash/consumer parties have no
  GSTIN).
- Never hard-delete a party that has transactions; soft-delete only.
- Keep pricing (price_list) as a linked reference, not columns on party.
- Use user_defined_fields (JSON) for custom attributes instead of adding columns.

Start now by inspecting the codebase and proposing where the module fits, then
implement stage 1 (schema).
```

---

*End of specification.*
