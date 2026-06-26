# WhatsApp Billing & Partner Model

How WhatsApp messaging is billed, who can be the payer, and the realistic routes
for a startup that wants to bill its own customers — plus how this codebase maps
to each route.

> TL;DR: Every WhatsApp number lives under a **WABA**, and whoever's funding
> source is attached to that WABA gets billed by Meta. To bill *on your behalf*
> (customer pays you, you pay Meta) you must either (a) put numbers under **your
> own WABA**, or (b) be an approved **Meta Solution Partner** who can share a
> credit line. A brand-new startup can do (a) today; (b) comes later.

---

## 1. The hard rules (Meta platform, not our code)

1. A WhatsApp number must belong to a **WABA**; a WABA belongs to a **Business
   Portfolio**. There is no "no-WABA" option.
2. The **funding source attached to the sending WABA** is what Meta charges.
3. Pricing is **per message** for template categories (2024–2025 model):
   - **Marketing** — always charged.
   - **Utility** — charged, but **free** inside an open 24h customer-service window.
   - **Authentication** — charged.
   - **Service** (user-initiated, within 24h) — free.
4. **Deregister ≠ delete.** `POST /{phone_number_id}/deregister` un-hosts a number
   from the Cloud API; Meta has **no API** to delete a number from a WABA
   (manual removal in WhatsApp Manager; unverified numbers auto-expire).

---

## 2. Who can be the payer

| Model | Number lives under | Who Meta bills | Requires |
|---|---|---|---|
| **Own-WABA (BSP-style)** | **Your** WABA | **You** (automatic) | Just your business + a payment method on your WABA |
| **Embedded Signup (Tech Provider)** | **Customer's** WABA | **Customer** | Business Verification + app Live + Advanced Access |
| **Credit-line sharing** | Customer's WABA | **You** (you re-bill customer) | **Solution Partner** approval |

The third row is how Twilio / Wati bill you: they are approved **Solution
Partners** and attach their credit line to the customer's WABA, so Meta charges
them and they charge you. A new startup does **not** have this yet.

---

## 3. How Twilio & Wati actually do it

- Both are **approved Meta Solution Partners (BSPs)**.
- Customer connects a number via **Embedded Signup**; the WABA is the customer's,
  but the partner **attaches its line of credit** → Meta bills the partner, the
  partner bills the customer through its own billing.
- **Wati started by building on top of another BSP (360dialog)** rather than
  becoming a partner from day one — a common shortcut.

---

## 4. The three realistic routes for a new startup

### Route A — Build on an existing BSP (fastest)
Integrate **360dialog**, **Twilio**, or another BSP's API. They own the Meta
partnership + billing rails; you resell. 360dialog gives each client their own
WABA, charges a flat monthly hosting fee, and passes Meta's conversation costs
through (no per-message markup). This is how most early WhatsApp SaaS launched.

- **Pros:** live in days; billing handled; no Meta partner bureaucracy.
- **Cons:** dependency on the BSP; their pricing/limits.

### Route B — Direct on Meta Cloud API, own-WABA billing (what this repo does today)
Put customer numbers under **your own WABA** via **direct registration /
migration**. Your WABA, your payment method → **you're billed automatically**, no
partner status needed.

- **Pros:** platform-billed today; customer needs no Meta account.
- **Cons:** customer can't use the green WhatsApp Business App on that number;
  ~20 numbers per WABA (add more WABAs as you grow); a gray area at large scale.
- **Do this:** enable **direct registration** (super-admin toggle) and complete
  **Business Verification** to raise your number cap + messaging tier.

### Route C — Become a Solution Partner (later)
Once you have traction, apply for **Tech Provider → Solution Partner** status.
On approval, credit-line sharing turns on and you can platform-bill Embedded
Signup customers exactly like Twilio/Wati — no rework.

---

## 5. How the code maps to these routes

| Capability | Code | Notes |
|---|---|---|
| Direct registration (Route B) | `onboarding.service.ts` (`registerNumber` / `request-code` / `verify-code`), `direct-number-registration.component.ts` | Registers under the platform WABA; OTP-verified. Cloud-API only (warns the user not to install the Business App). |
| Embedded Signup + coexistence | `waba/embedded-signup/*`, `embedded-signup-button.component.ts` | Customer-owned WABA; coexistence keeps the Business App working. |
| Auto-seed templates on signup | `waba/template/template.service.ts` (`seedDefaultTemplates`), `waba/template/default-templates.ts` | Full default library created on the tenant's WABA automatically — no Meta login. |
| Credit-line sharing (Route C) | `waba/embedded-signup/credit-line.service.ts` | **Gated OFF**; no-ops until you're a Solution Partner. No reseller markup → customer is never charged by Meta; the platform pays. |
| Super-admin toggles | `platform-config.service.ts`, `/admin/settings` | `directRegistrationEnabled`, `creditLineSharingEnabled` + `metaCreditLineId` + `metaBillingCurrency`. |

---

## 6. Recommendation

- **Now:** Route B (direct registration, own-WABA billing) for paying customers,
  + keep Embedded Signup available for customers who want their Business App
  (knowing they're billed directly until you're a partner). Or start on **Route A**
  (360dialog/Twilio) if you'd rather not run the Meta plumbing yourself.
- **Required regardless:** Business Verification + take the Meta app **Live** with
  **Advanced Access** on `whatsapp_business_management`, `whatsapp_business_messaging`,
  `business_management`.
- **Later:** apply for Solution Partner → flip `creditLineSharingEnabled` on.
