# WhatsApp Cloud API — Pricing, Windows & Subscription Strategy

## Complete Business Guide for WA Commerce Platform

---

## Table of Contents

1. [Conversation-Based Pricing Model](#1-conversation-based-pricing-model)
2. [The 24-Hour Window System](#2-the-24-hour-window-system)
3. [Template Categories & Rules](#3-template-categories--rules)
4. [Window Interactions & Edge Cases](#4-window-interactions--edge-cases)
5. [Cost Calculation — Real Scenario](#5-cost-calculation--real-scenario)
6. [Smart Sending Strategy](#6-smart-sending-strategy)
7. [Subscription Plans & Pricing](#7-subscription-plans--pricing)
8. [Template Compliance Rules](#8-template-compliance-rules)
9. [Quick Reference Tables](#9-quick-reference-tables)

---

## 1. Conversation-Based Pricing Model

### How Meta Charges

WhatsApp Cloud API charges per **conversation** (a 24-hour messaging session), NOT per message. Once a conversation window opens, all messages of that same category within that 24 hours are free.

### Conversation Categories

| Category | Who Initiates | India Price (INR) | US Price (USD) | When Used |
|----------|--------------|-------------------|----------------|-----------|
| **Service** | Customer messages first | FREE (₹0) | FREE ($0) | Customer inquiries, browsing, ordering |
| **Utility** | Business sends template | ₹0.30 | $0.005 | Order updates, payment confirmations, delivery |
| **Authentication** | Business sends OTP template | ₹0.25 | $0.004 | OTP verification, login codes |
| **Marketing** | Business sends promo template | ₹0.80 | $0.015 | Campaigns, offers, abandoned cart reminders |

### Key Principle

> You pay ONCE when a conversation window opens. All subsequent messages of the SAME category within that 24-hour window are FREE.

---

## 2. The 24-Hour Window System

### How Windows Open & Close

```
WINDOW LIFECYCLE:
  Message sent/received → Window OPENS → 24 hours pass → Window CLOSES

  ┌──────────────────────── 24 Hours ────────────────────────┐
  │                                                           │
  OPEN                        All messages FREE              CLOSED
  (charged once)              (same category)               (need new window)
```

### Service Window (Customer-Initiated)

**Opens when:** Customer sends ANY message to your business number
**Duration:** Exactly 24 hours from when the conversation session was created
**Cost:** FREE (₹0)
**What you can send:** ANYTHING — free-form text, buttons, lists, images, videos, documents
**Resets on new message?** NO — the window does not extend when customer sends more messages

```
Example:
  10:00 AM Mon — Customer sends "Hi"
    → Service window opens (expires 10:00 AM Tue)
  10:05 AM Mon — You reply with catalog (FREE)
  11:00 AM Mon — Customer sends "I want to order"
    → Window does NOT reset (still expires 10:00 AM Tue)
   2:00 PM Mon — You send order confirmation text (FREE)
   5:00 PM Mon — You send payment QR buttons (FREE)
  10:01 AM Tue — Window EXPIRED
  10:02 AM Tue — You send text message → ❌ FAILS (error 131047)
```

### Utility Window (Business-Initiated)

**Opens when:** You send a UTILITY category template
**Duration:** Exactly 24 hours
**Cost:** ₹0.30 (charged once when window opens)
**What you can send:** Only more UTILITY templates (within same window = free)
**Cannot send:** Free-form text, buttons, lists, marketing templates

```
Example:
  2:00 PM Tue — You send "order_shipped" template
    → Utility window opens (₹0.30 charged, expires 2:00 PM Wed)
  4:00 PM Tue — You send "delivery_update" template (FREE — same utility window)
  2:01 PM Wed — Utility window EXPIRED
  2:02 PM Wed — You send "order_delivered" template
    → NEW utility window opens (₹0.30 charged again)
```

### Marketing Window (Business-Initiated)

**Opens when:** You send a MARKETING category template
**Duration:** Exactly 24 hours
**Cost:** ₹0.80 (charged once)
**What you can send:** Only more MARKETING templates
**Cannot send:** Free-form text, utility templates

### Authentication Window (Business-Initiated)

**Opens when:** You send an AUTHENTICATION template (OTP)
**Duration:** Exactly 24 hours
**Cost:** ₹0.25 (charged once)
**What you can send:** Only more AUTH templates
**Typical use:** OTP verification, login codes

---

## 3. Template Categories & Rules

### What Qualifies as Each Category

#### Utility Templates (₹0.30)

Must reference a **specific, existing transaction** initiated by the customer.

| Allowed (Utility) | NOT Allowed (will be rejected) |
|-------------------|-------------------------------|
| "Your order #123 shipped" | "Check out new products" |
| "Payment received for order #456" | "Your exclusive deal awaits" |
| "Delivery arriving at 5 PM" | "We miss you, come back" |
| "Your refund processed" | "Flash sale starting now" |
| "Appointment reminder for tomorrow" | "Book an appointment today" |

#### Marketing Templates (₹0.80)

Promotional content, re-engagement, campaigns.

| Allowed (Marketing) | Notes |
|--------------------|-------|
| "20% off this weekend!" | Must include unsubscribe option |
| "New collection just dropped" | Requires customer opt-in |
| "Your cart is waiting" | Abandoned cart reminders |
| "We miss you! Here's a coupon" | Win-back campaigns |

#### Authentication Templates (₹0.25)

OTP and verification codes ONLY.

| Allowed (Authentication) | NOT Allowed |
|--------------------------|-------------|
| "Your code is 123456" | "Your code is 123456. Also check our sale!" |
| "Verify with code: {{1}}" | Any additional promotional content |

### Template Submission Rules

- Template names: lowercase, underscores only (e.g., `order_confirmation`)
- Maximum: 250 templates per WABA
- Variables: `{{1}}`, `{{2}}`, etc. — must provide examples during submission
- Buttons: Max 3 quick-reply buttons OR 2 URL/call buttons
- Review time: Auth (instant) → Utility (minutes-hours) → Marketing (hours-days)
- Once approved: CANNOT be edited (must delete and recreate)

---

## 4. Window Interactions & Edge Cases

### Each Category is Independent

All four window types operate independently. Opening one does NOT affect others.

```
INDEPENDENT WINDOWS (can all be open simultaneously):

Customer sends "Hi"            → [Service Window: 24h] FREE
You send utility template      → [Utility Window: 24h] ₹0.30
You send marketing template    → [Marketing Window: 24h] ₹0.80
You send auth template         → [Auth Window: 24h] ₹0.25

Total charge: ₹0.30 + ₹0.80 + ₹0.25 = ₹1.35
(Service is always free)
```

### Critical Edge Cases

#### Case 1: Template within Service Window

```
Customer sends "Hi"                     → Service window opens (FREE)
You send "order_confirmation" TEMPLATE  → ❌ STILL CHARGED ₹0.30
                                          (opens separate utility window)
You send free-form "Order confirmed!"   → ✅ FREE (uses service window)
```

**Lesson:** Within a service window, always use free-form text instead of templates to save money.

#### Case 2: Customer Replies to Template

```
You send utility template              → Utility window opens (₹0.30)
Customer replies "OK"                  → Service window NOW opens (FREE)
You send free-form text                → ✅ FREE (service window active)
You send buttons with options          → ✅ FREE (service window active)
```

**Lesson:** Once customer replies, you get a free service window. Batch your messages after the reply.

#### Case 3: Multiple Utility Templates Same Day

```
2:00 PM — You send "order_shipped"     → Utility window opens (₹0.30)
3:00 PM — You send "delivery_update"   → ✅ FREE (same utility window)
4:00 PM — You send "payment_verified"  → ✅ FREE (same utility window)
```

**Lesson:** Batch utility notifications close together to share one utility window.

#### Case 4: Utility Template After Window Expires

```
Day 1, 2:00 PM — You send template    → Utility window opens (₹0.30)
Day 2, 2:01 PM — Window expired
Day 2, 3:00 PM — You send template    → NEW utility window (₹0.30 again)
```

#### Case 5: Free-form After Template (Without Customer Reply)

```
You send utility template              → Utility window opens
You send free-form text immediately    → ❌ FAILS (no service window)
```

**Lesson:** Template windows do NOT allow free-form messages. Only service windows do.

---

## 5. Cost Calculation — Real Scenario

### Assumptions

- **1,000 active customers**
- **2,000 orders per month**
- **2 marketing campaigns per month**
- **Admin receives notifications via personal WhatsApp**

### Order Lifecycle Cost Breakdown

#### Single Order Journey:

| Event | Timing | Window Status | Method | Cost |
|-------|--------|---------------|--------|------|
| Customer orders via chat | Day 1, 10:00 AM | Service window opens | — | ₹0 |
| Order confirmation | Day 1, 10:01 AM | Service window active | Free-form text | ₹0 |
| Payment confirmation | Day 1, 10:30 AM | Service window active | Free-form + button | ₹0 |
| Shipping notification | Day 2, 2:00 PM | Service window EXPIRED | Utility template | ₹0.30 |
| Delivery update | Day 2, 6:00 PM | Utility window active | Utility template | ₹0 |
| Delivery confirmation | Day 3, 11:00 AM | Utility window EXPIRED | Utility template | ₹0.30 |
| Feedback request | Day 3, 11:01 AM | New utility window active | Utility template | ₹0 |
| **TOTAL PER ORDER** | | | | **₹0.60** |

#### Worst Case (Customer didn't initiate via chat):

| Event | Method | Cost |
|-------|--------|------|
| Order confirmation | Utility template | ₹0.30 |
| Shipping notification | Utility template (new day) | ₹0.30 |
| Delivery confirmation | Utility template (new day) | ₹0.30 |
| **TOTAL PER ORDER** | | **₹0.90** |

### Monthly Cost Calculation

#### Customer-Facing Messages:

| Scenario | Orders | Cost/Order | Monthly Cost |
|----------|--------|------------|--------------|
| 70% orders via chat (smart sending) | 1,400 | ₹0.60 | ₹840 |
| 30% orders not via chat (all templates) | 600 | ₹0.90 | ₹540 |
| **Subtotal — Order notifications** | **2,000** | | **₹1,380** |

#### Marketing Campaigns:

| Campaign Type | Recipients | Cost/Recipient | Monthly Cost |
|---------------|-----------|----------------|--------------|
| Broadcast campaign (2/month) | 1,000 × 2 | ₹0.80 | ₹1,600 |
| Abandoned cart reminders | ~200 | ₹0.80 | ₹160 |
| **Subtotal — Marketing** | | | **₹1,760** |

#### Admin Notifications:

| Type | Method | Cost |
|------|--------|------|
| First notification of the day (template) | ~30/month | 30 × ₹0.30 = ₹9 |
| Rest of day (free-form after admin replies) | ~1,970/month | ₹0 |
| **Subtotal — Admin** | | **₹9** |

#### Authentication:

| Type | Sends/month | Cost |
|------|-------------|------|
| Admin OTP | ~5 | 5 × ₹0.25 = ₹1.25 |
| **Subtotal — Auth** | | **₹1.25** |

### TOTAL MONTHLY COST SUMMARY

| Category | Conversations | Cost (INR) |
|----------|--------------|------------|
| Service (customer-initiated) | ~3,500 | ₹0 (FREE) |
| Utility (order/payment/delivery) | ~3,600 | ₹1,389 |
| Marketing (campaigns) | ~2,200 | ₹1,760 |
| Authentication (OTP) | ~5 | ₹1.25 |
| Admin notifications (utility) | ~30 | ₹9 |
| **GRAND TOTAL** | **~9,335** | **₹3,159/month** |

### With Smart Sending Optimization

| Optimization | Savings |
|-------------|---------|
| Free-form within service window (order confirmations) | -₹420 |
| Admin free-form after reply (daily) | -₹591 |
| Batch utility templates same day | -₹150 |
| **Optimized Total** | **~₹2,000-2,500/month** |

---

## 6. Smart Sending Strategy

### Decision Logic (Implemented in Code)

```
WHEN sending a notification to customer/admin:

  1. CHECK: Is there an active SERVICE window?
     ├─ YES → Send FREE-FORM text/buttons/lists (₹0 FREE)
     └─ NO  → 2. CHECK: Is there an active UTILITY window?
               ├─ YES → Send utility template (₹0 FREE, same window)
               └─ NO  → Send utility template (₹0.30, opens new window)
```

### Implementation in Platform

The `MessageOrchestratorService.sendSmartMessage()` method handles this automatically:

```typescript
// Automatically chooses cheapest delivery method:
await orchestrator.sendSmartMessage(
  tenantId, phoneNumberId, accessToken, customerPhone,
  "Your order #ORD-042 is confirmed! 3 items, Rs. 1,299",  // Free-form (if window open)
  { name: 'order_confirmation', language: 'en', components: [...] }  // Template (if no window)
);
```

### Admin Notification Strategy

```
DAILY ADMIN FLOW:

  9:00 AM  — First order of the day
             No service window → Send template (₹0.30)
  9:01 AM  — Admin sees notification, replies "CONFIRM"
             → Service window opens!
  9:15 AM  — Second order → Free-form + buttons (₹0)
  10:00 AM — Payment received → Free-form + buttons (₹0)
  11:30 AM — Low stock alert → Free-form + button (₹0)
   2:00 PM — Another order → Free-form + buttons (₹0)
   5:00 PM — Daily summary → Free-form + button (₹0)
  
  TOTAL COST FOR THE DAY: ₹0.30 (just one template!)
```

### Tips to Maximize Free Messaging

| Tip | How It Saves |
|-----|-------------|
| Reply to customer within their service window | All replies FREE |
| Use free-form text for order confirmations | Saves ₹0.30/order when customer just chatted |
| Encourage admin to reply to first notification | Opens free service window for entire day |
| Batch shipping + delivery notifications same day | Share one utility window (₹0.30 instead of ₹0.60) |
| Use interactive buttons in service window | Rich UX for FREE (vs. template with buttons costs ₹0.30) |

---

## 7. Subscription Plans & Pricing

### Platform Operating Costs (Per Tenant)

| Cost Item | Monthly (INR) |
|-----------|---------------|
| Server/DB/Redis (shared) | ₹200-500 |
| WhatsApp API costs (passed through) | Varies by usage |
| Maintenance & support | ₹200 |
| **Base platform cost** | **₹400-700** |

### Recommended Plans

#### Starter Plan — ₹1,499/month

| Feature | Limit |
|---------|-------|
| Customers | 200 |
| Orders/month | 500 |
| Conversations (utility + marketing) | 1,000 |
| Campaigns/month | 2 |
| Workflow builder | Basic (5 workflows) |
| Admin WhatsApp notifications | Included |
| Overage rate | ₹0.50/conversation |

**Your cost:** ~₹600 | **Your profit:** ~₹900 (60%)

---

#### Growth Plan — ₹3,499/month

| Feature | Limit |
|---------|-------|
| Customers | 1,000 |
| Orders/month | 2,000 |
| Conversations (utility + marketing) | 5,000 |
| Campaigns/month | 5 |
| Workflow builder | Advanced (20 workflows) |
| Admin WhatsApp notifications | Included |
| Analytics dashboard | Included |
| Overage rate | ₹0.40/conversation |

**Your cost:** ~₹2,000 | **Your profit:** ~₹1,500 (43%)

---

#### Pro Plan — ₹6,999/month

| Feature | Limit |
|---------|-------|
| Customers | 5,000 |
| Orders/month | 10,000 |
| Conversations (utility + marketing) | 20,000 |
| Campaigns/month | 15 |
| Workflow builder | Unlimited |
| Admin WhatsApp notifications | Included |
| AI features | Included |
| Multi-user access | 5 users |
| Overage rate | ₹0.35/conversation |

**Your cost:** ~₹5,500 | **Your profit:** ~₹1,500 (21%)

---

#### Enterprise Plan — ₹14,999/month

| Feature | Limit |
|---------|-------|
| Customers | Unlimited |
| Orders/month | Unlimited |
| Conversations | 50,000 |
| Campaigns/month | Unlimited |
| Workflow builder | Unlimited |
| All features | Included |
| Dedicated support | Priority |
| Custom integrations | Available |
| Overage rate | ₹0.30/conversation |

**Your cost:** ~₹10,000 | **Your profit:** ~₹5,000 (33%)

---

#### Free Trial — 14 Days

| Feature | Limit |
|---------|-------|
| Customers | 20 |
| Orders | 50 |
| Conversations | 100 |
| Campaigns | 1 |

**Your max cost:** ~₹50 per trial user

---

### Profit Margin Analysis

| Plan | Revenue | Your Cost | Profit | Margin |
|------|---------|-----------|--------|--------|
| Starter | ₹1,499 | ₹600 | ₹899 | 60% |
| Growth | ₹3,499 | ₹2,000 | ₹1,499 | 43% |
| Pro | ₹6,999 | ₹5,500 | ₹1,499 | 21% |
| Enterprise | ₹14,999 | ₹10,000 | ₹4,999 | 33% |

### Revenue Projections (50 Tenants)

| Mix | Tenants | Monthly Revenue | Monthly Cost | Monthly Profit |
|-----|---------|-----------------|--------------|----------------|
| 25 Starter | 25 | ₹37,475 | ₹15,000 | ₹22,475 |
| 15 Growth | 15 | ₹52,485 | ₹30,000 | ₹22,485 |
| 8 Pro | 8 | ₹55,992 | ₹44,000 | ₹11,992 |
| 2 Enterprise | 2 | ₹29,998 | ₹20,000 | ₹9,998 |
| **TOTAL** | **50** | **₹1,75,950** | **₹1,09,000** | **₹66,950** |

---

## 8. Template Compliance Rules

### What Meta Checks

| Rule | Violation Consequence |
|------|----------------------|
| Utility must reference specific transaction | Template rejected |
| Marketing must have unsubscribe option | Template rejected |
| Auth must contain ONLY the OTP | Template rejected |
| No misleading category (promo as utility) | Template reclassified + possible ban |
| Must match declared category | Auto-reclassification |
| Repeated violations | Messaging limits reduced |
| Severe violations | Account restricted/banned |

### Category Enforcement

```
CAN YOU SEND PROMO CONTENT AS UTILITY?

  ❌ NO — Meta will:
  1. Reject the template during review
  2. Or reclassify it to Marketing (you pay ₹0.80 instead of ₹0.30)
  3. Or ban the template after reports
  4. Or reduce your messaging tier

WHAT YOU CAN DO INSTEAD:
  ✅ Send promos as FREE-FORM within a service window (₹0 — totally legal)
  ✅ Use marketing templates honestly (₹0.80 — proper channel)
```

### Messaging Tier Limits

Meta assigns quality tiers based on your behavior:

| Tier | Daily Message Limit | How to Reach |
|------|--------------------|--------------| 
| Unverified | 250 unique customers/day | New accounts |
| Tier 1 | 1,000 unique customers/day | Verify business |
| Tier 2 | 10,000 unique customers/day | Good quality + volume |
| Tier 3 | 100,000 unique customers/day | Sustained good quality |
| Unlimited | No limit | Excellent quality rating |

Quality is affected by:
- Customer blocks/reports
- Template rejection rate
- Spam complaints

---

## 9. Quick Reference Tables

### Decision Matrix — What to Send When

| Situation | Send What | Cost |
|-----------|-----------|------|
| Customer just messaged (within 24h) | Free-form text / buttons / lists | ₹0 |
| Customer messaged, you want to confirm order | Free-form "Order confirmed!" | ₹0 |
| No service window, need to notify | Utility template | ₹0.30 |
| Already sent utility template today | Another utility template | ₹0 |
| Want to send campaign to inactive users | Marketing template | ₹0.80 |
| Need to verify phone number | Auth template | ₹0.25 |
| Admin hasn't messaged today, new order | Utility template to admin | ₹0.30 |
| Admin replied earlier today | Free-form + buttons to admin | ₹0 |

### Message Type vs. Window Compatibility

| Message Type | Service Window | Utility Window | Marketing Window | Auth Window | No Window |
|-------------|:-:|:-:|:-:|:-:|:-:|
| Free-form text | ✅ FREE | ❌ Fails | ❌ Fails | ❌ Fails | ❌ Fails |
| Interactive buttons | ✅ FREE | ❌ Fails | ❌ Fails | ❌ Fails | ❌ Fails |
| Interactive lists | ✅ FREE | ❌ Fails | ❌ Fails | ❌ Fails | ❌ Fails |
| Images/Videos | ✅ FREE | ❌ Fails | ❌ Fails | ❌ Fails | ❌ Fails |
| Utility template | ✅* (₹0.30) | ✅ FREE | ❌ (₹0.30) | ❌ (₹0.30) | ✅ (₹0.30) |
| Marketing template | ✅* (₹0.80) | ❌ (₹0.80) | ✅ FREE | ❌ (₹0.80) | ✅ (₹0.80) |
| Auth template | ✅* (₹0.25) | ❌ (₹0.25) | ❌ (₹0.25) | ✅ FREE | ✅ (₹0.25) |

*Templates ALWAYS charge for their own category, even within a service window.

### Monthly Cost by Business Size

| Business Size | Customers | Orders/mo | Smart Cost | Without Optimization |
|--------------|-----------|-----------|------------|---------------------|
| Micro | 100 | 200 | ₹200-400 | ₹600 |
| Small | 500 | 1,000 | ₹800-1,200 | ₹2,000 |
| Medium | 1,000 | 2,000 | ₹1,500-2,500 | ₹3,200 |
| Large | 5,000 | 10,000 | ₹6,000-9,000 | ₹15,000 |
| Enterprise | 10,000+ | 20,000+ | ₹12,000-18,000 | ₹30,000+ |

---

## Summary

1. **Service window (customer messages first) = FREE** — send anything
2. **Templates ALWAYS open their own paid window** — even within service window
3. **Smart strategy:** Free-form within service window, templates only when necessary
4. **Admin notifications:** First one costs ₹0.30/day, rest are free after admin replies
5. **Never disguise marketing as utility** — Meta will catch it
6. **Subscription pricing:** Cover WhatsApp costs + infrastructure + 40-60% margin

---

*Document generated for WA Commerce Platform — Last updated: May 2026*
