# WhatsApp Message Templates - Setup Guide

This document lists all WhatsApp Message Templates required for the WA Commerce platform.
You need to create these templates in your Meta Business Manager (Business Settings > WhatsApp > Message Templates).

**Alternative:** Use the API endpoint `POST /api/admin/templates/provision` to create all templates automatically via the Meta Graph API (requires `whatsapp_business_management` permission on your system user token).

---

## Template Categories

Meta classifies templates into:
- **AUTHENTICATION** — OTP/verification codes (auto-approved, cheapest)
- **UTILITY** — Order updates, delivery notifications, payment confirmations (usually approved within minutes)
- **MARKETING** — Promotional messages, campaigns (requires review, can be rejected)

---

## 1. AUTHENTICATION TEMPLATES

### `admin_otp_verification`
- **Category:** AUTHENTICATION
- **Language:** en
- **Body:** `Your WA Commerce admin verification code is {{1}}. It expires in 5 minutes. Do not share this code.`
- **Buttons:** None
- **Usage:** Admin WhatsApp number OTP verification during onboarding/settings

---

## 2. UTILITY TEMPLATES (Order & Payment)

### `order_confirmation`
- **Category:** UTILITY
- **Language:** en
- **Header:** None
- **Body:** `Hi {{1}}, your order #{{2}} has been confirmed! {{3}} items totalling {{4}}. We'll notify you when it ships. Thank you for shopping with us!`
- **Footer:** `Powered by WA Commerce`
- **Buttons:** None
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Order ID
  - `{{3}}` — Item count
  - `{{4}}` — Total amount (e.g. "Rs. 1,299")

---

### `order_shipped`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, great news! Your order #{{2}} has been shipped. {{3}} Track your delivery or reply here for updates.`
- **Footer:** `Powered by WA Commerce`
- **Buttons:**
  - Quick Reply: `Track Order`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Order ID
  - `{{3}}` — Shipping details or estimated delivery

---

### `order_delivered`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, your order #{{2}} has been delivered! We hope you love it. Reply "HELP" if you have any issues or "REORDER" to place a new order.`
- **Footer:** `Powered by WA Commerce`
- **Buttons:**
  - Quick Reply: `Rate Us`
  - Quick Reply: `Reorder`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Order ID

---

### `order_cancelled`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, your order #{{2}} has been cancelled. {{3}} If you have any questions, reply to this message.`
- **Footer:** `Powered by WA Commerce`
- **Buttons:** None
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Order ID
  - `{{3}}` — Cancellation reason

---

### `payment_received`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, we've received your payment of {{2}} for order #{{3}}. Your order is now being processed. Thank you!`
- **Footer:** `Powered by WA Commerce`
- **Buttons:** None
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Amount paid
  - `{{3}}` — Order ID

---

### `payment_verified`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, your payment of {{2}} for order #{{3}} has been verified. Your order will be shipped soon!`
- **Footer:** `Powered by WA Commerce`
- **Buttons:** None
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Amount
  - `{{3}}` — Order ID

---

### `payment_reminder`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, a friendly reminder that payment of {{2}} is pending for your order #{{3}}. Please complete the payment to avoid cancellation. Reply "PAY" for payment options.`
- **Footer:** `Powered by WA Commerce`
- **Buttons:**
  - Quick Reply: `Pay Now`
  - Quick Reply: `Cancel Order`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Amount due
  - `{{3}}` — Order ID

---

### `payment_refunded`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, your refund of {{2}} for order #{{3}} has been processed. It may take 3-5 business days to reflect in your account. Reply if you need any help.`
- **Footer:** `Powered by WA Commerce`
- **Buttons:** None
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Refund amount
  - `{{3}}` — Order ID

---

### `delivery_update`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, delivery update for order #{{2}}: {{3}}. {{4}}`
- **Footer:** `Powered by WA Commerce`
- **Buttons:**
  - Quick Reply: `Track`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Order ID
  - `{{3}}` — Status (e.g. "Out for delivery", "Delivery attempted")
  - `{{4}}` — Additional info (e.g. "Expected by 6 PM today")

---

### `delivery_failed`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, we were unable to deliver your order #{{2}}. Reason: {{3}}. We'll retry delivery tomorrow. Reply "RESCHEDULE" to pick a new time or "PICKUP" for self-collection.`
- **Footer:** `Powered by WA Commerce`
- **Buttons:**
  - Quick Reply: `Reschedule`
  - Quick Reply: `Pickup`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Order ID
  - `{{3}}` — Failure reason

---

## 3. ADMIN NOTIFICATION TEMPLATES (Sent to Admin's Personal Number)

### `admin_new_order`
- **Category:** UTILITY
- **Language:** en
- **Body:** `New order received! Order #{{1}} from {{2}} for {{3}}. Items: {{4}}. Reply "CONFIRM" to confirm or "VIEW" for details.`
- **Buttons:**
  - Quick Reply: `Confirm`
  - Quick Reply: `View`
- **Variables:**
  - `{{1}}` — Order ID
  - `{{2}}` — Customer name
  - `{{3}}` — Total amount
  - `{{4}}` — Item summary (e.g. "2x Blue T-Shirt, 1x Jeans")

---

### `admin_payment_received`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Payment received! {{1}} paid {{2}} for order #{{3}} via {{4}}. Reply "VERIFY" to verify or "REJECT" if suspicious.`
- **Buttons:**
  - Quick Reply: `Verify`
  - Quick Reply: `Reject`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Amount
  - `{{3}}` — Order ID
  - `{{4}}` — Payment method

---

### `admin_low_stock`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Low stock alert! {{1}} has only {{2}} units remaining. Current threshold: {{3}}. Reply "RESTOCK" to update inventory.`
- **Buttons:**
  - Quick Reply: `Restock`
- **Variables:**
  - `{{1}}` — Product name
  - `{{2}}` — Current quantity
  - `{{3}}` — Threshold value

---

### `admin_new_customer`
- **Category:** UTILITY
- **Language:** en
- **Body:** `New customer! {{1}} ({{2}}) just opted in to your store. Total customers: {{3}}.`
- **Buttons:** None
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Phone number
  - `{{3}}` — Total customer count

---

### `admin_daily_summary`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Daily Summary for {{1}}:\n- Orders: {{2}}\n- Revenue: {{3}}\n- New Customers: {{4}}\n- Messages: {{5}}\n\nReply "DETAILS" for full report.`
- **Buttons:**
  - Quick Reply: `Details`
- **Variables:**
  - `{{1}}` — Date
  - `{{2}}` — Order count
  - `{{3}}` — Revenue total
  - `{{4}}` — New customer count
  - `{{5}}` — Message count

---

## 4. MARKETING TEMPLATES

### `campaign_promotional`
- **Category:** MARKETING
- **Language:** en
- **Header:** IMAGE (dynamic URL)
- **Body:** `Hi {{1}}, {{2}}`
- **Footer:** `Reply STOP to unsubscribe`
- **Buttons:**
  - Quick Reply: `Shop Now`
  - Quick Reply: `Unsubscribe`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Campaign message body
- **Note:** This is a generic marketing template. The actual promotional content goes in `{{2}}`.

---

### `campaign_discount`
- **Category:** MARKETING
- **Language:** en
- **Body:** `Hi {{1}}, exclusive offer just for you! Get {{2}} off on {{3}}. Use code: {{4}}. Valid until {{5}}. Reply "ORDER" to shop now!`
- **Footer:** `Reply STOP to unsubscribe`
- **Buttons:**
  - Quick Reply: `Order Now`
  - Quick Reply: `Unsubscribe`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Discount (e.g. "20%", "Rs. 200")
  - `{{3}}` — Product/category
  - `{{4}}` — Coupon code
  - `{{5}}` — Expiry date

---

### `abandoned_cart_reminder`
- **Category:** MARKETING
- **Language:** en
- **Body:** `Hi {{1}}, you left {{2}} in your cart! Your items are still available. Complete your order before they sell out. Reply "CHECKOUT" to place your order.`
- **Footer:** `Reply STOP to unsubscribe`
- **Buttons:**
  - Quick Reply: `Checkout`
  - Quick Reply: `Remove`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Cart summary (e.g. "2 items worth Rs. 999")

---

### `back_in_stock`
- **Category:** MARKETING
- **Language:** en
- **Body:** `Hi {{1}}, great news! {{2}} is back in stock. Only {{3}} units available — grab yours before it's gone! Reply "ORDER" to buy now.`
- **Footer:** `Reply STOP to unsubscribe`
- **Buttons:**
  - Quick Reply: `Order`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Product name
  - `{{3}}` — Available quantity

---

## 5. CUSTOMER SERVICE TEMPLATES

### `welcome_message`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Welcome to {{1}}! We're happy to have you here. Browse our catalog by replying "MENU" or ask us anything. We're here to help!`
- **Buttons:**
  - Quick Reply: `Menu`
  - Quick Reply: `Support`
- **Variables:**
  - `{{1}}` — Business name

---

### `order_feedback`
- **Category:** UTILITY
- **Language:** en
- **Body:** `Hi {{1}}, we hope you're enjoying your order #{{2}}! How would you rate your experience? Reply with a number 1-5 (5 being excellent).`
- **Buttons:**
  - Quick Reply: `5 - Excellent`
  - Quick Reply: `3 - Average`
  - Quick Reply: `1 - Poor`
- **Variables:**
  - `{{1}}` — Customer name
  - `{{2}}` — Order ID

---

## How to Create Templates

### Option A: Meta Business Manager (Manual)

1. Go to [Meta Business Suite](https://business.facebook.com) > WhatsApp > Message Templates
2. Click "Create Template"
3. Select the **Category** (Authentication/Utility/Marketing)
4. Enter the **Template Name** (exactly as listed above, e.g. `order_confirmation`)
5. Select **Language** (English)
6. Fill in Header, Body, Footer, and Buttons as specified above
7. Use `{{1}}`, `{{2}}`, etc. for variables in the body
8. Submit for review

**Approval times:**
- Authentication: Usually instant (auto-approved)
- Utility: Minutes to a few hours
- Marketing: 1-24 hours (can be rejected)

### Option B: API (Automated)

Use the Meta Graph API to create templates programmatically:

```
POST https://graph.facebook.com/v21.0/{waba_id}/message_templates
Authorization: Bearer {system_user_token}

{
  "name": "order_confirmation",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, your order #{{2}} has been confirmed! {{3}} items totalling {{4}}. We'll notify you when it ships. Thank you for shopping with us!",
      "example": { "body_text": [["John", "ORD-001", "3", "Rs. 1,299"]] }
    },
    {
      "type": "FOOTER",
      "text": "Powered by WA Commerce"
    }
  ]
}
```

**API endpoint provided in the platform:** `POST /api/admin/templates/provision`
This will create ALL templates listed above automatically.

---

## Template Variable Reference

| Variable | Description | Example |
|----------|-------------|---------|
| Customer Name | `customer.name` | "Rahul" |
| Order ID | `order.displayId` | "ORD-0042" |
| Total Amount | `order.total` (formatted) | "Rs. 1,299" |
| Item Count | `order.items.length` | "3" |
| Item Summary | First 2-3 items | "2x T-Shirt, 1x Jeans" |
| Payment Amount | `payment.amount` (formatted) | "Rs. 999" |
| Payment Method | `payment.method` | "UPI" |
| Product Name | `product.name` | "Blue Cotton T-Shirt" |
| Business Name | `tenant.businessName` | "Fresh Mart" |
| Date | formatted date | "17 May 2026" |

---

## Notes

- All templates use **English (en)** by default. Add Hindi (`hi`) versions if targeting Indian market.
- Marketing templates MUST include an unsubscribe option (Quick Reply: "Unsubscribe" or footer "Reply STOP").
- Authentication templates have the cheapest conversation rates.
- You can have max 250 templates per WABA.
- Template names must be lowercase with underscores, no spaces.
- Once approved, templates cannot be edited — you must delete and recreate.
