/**
 * The platform's default WhatsApp message template library.
 *
 * Single source of truth shared by:
 *  - onboarding/TemplateProvisioningService (super-admin "provision all" on the
 *    platform WABA), and
 *  - waba/TemplateService.seedDefaultTemplates() (auto-seeded on a tenant's own
 *    WABA right after Embedded Signup, so the tenant never logs into Meta).
 *
 * Keep this as plain data (no DI) so both modules can import it without creating
 * a circular module dependency.
 */
export interface DefaultTemplateDefinition {
  name: string;
  category: 'AUTHENTICATION' | 'UTILITY' | 'MARKETING';
  language: string;
  components: any[];
}

export const DEFAULT_TEMPLATES: DefaultTemplateDefinition[] = [
  // ─── AUTHENTICATION ─────────────────────────────────────────────
  {
    // AUTHENTICATION templates use Meta's fixed OTP format (body is auto-generated).
    name: 'admin_otp_verification',
    category: 'AUTHENTICATION',
    language: 'en',
    components: [
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 5 },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }] },
    ],
  },

  // ─── UTILITY: Order ─────────────────────────────────────────────
  {
    name: 'order_confirmation',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your order #{{2}} has been confirmed! {{3}} items totalling {{4}}. We\'ll notify you when it ships. Thank you for shopping with us!',
        example: { body_text: [['Rahul', 'ORD-0042', '3', 'Rs. 1,299']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
    ],
  },
  {
    name: 'order_shipped',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, great news! Your order #{{2}} has been shipped. {{3}} Track your delivery or reply here for updates.',
        example: { body_text: [['Rahul', 'ORD-0042', 'Expected delivery: 20 May 2026']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: 'Track Order' }],
      },
    ],
  },
  {
    name: 'order_delivered',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your order #{{2}} has been delivered! We hope you love it. Reply "HELP" if you have any issues or "REORDER" to place a new order.',
        example: { body_text: [['Rahul', 'ORD-0042']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Rate Us' },
          { type: 'QUICK_REPLY', text: 'Reorder' },
        ],
      },
    ],
  },
  {
    name: 'order_cancelled',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your order #{{2}} has been cancelled. {{3}} If you have any questions, reply to this message.',
        example: { body_text: [['Rahul', 'ORD-0042', 'Reason: Out of stock']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
    ],
  },

  // ─── UTILITY: Payment ───────────────────────────────────────────
  {
    name: 'payment_received',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, we\'ve received your payment of {{2}} for order #{{3}}. Your order is now being processed. Thank you!',
        example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
    ],
  },
  {
    name: 'payment_verified',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your payment of {{2}} for order #{{3}} has been verified. Your order will be shipped soon!',
        example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
    ],
  },
  {
    name: 'payment_reminder',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, a friendly reminder that payment of {{2}} is pending for your order #{{3}}. Please complete the payment to avoid cancellation. Reply "PAY" for payment options.',
        example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Pay Now' },
          { type: 'QUICK_REPLY', text: 'Cancel Order' },
        ],
      },
    ],
  },
  {
    name: 'payment_refunded',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your refund of {{2}} for order #{{3}} has been processed. It may take 3-5 business days to reflect in your account. Reply if you need any help.',
        example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
    ],
  },

  // ─── UTILITY: Delivery ──────────────────────────────────────────
  {
    name: 'delivery_update',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, delivery update for order #{{2}}: {{3}}. {{4}} — reply here if you need any help.',
        example: { body_text: [['Rahul', 'ORD-0042', 'Out for delivery', 'Expected by 6 PM today']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: 'Track' }],
      },
    ],
  },
  {
    name: 'delivery_failed',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, we were unable to deliver your order #{{2}}. Reason: {{3}}. We\'ll retry delivery tomorrow. Reply "RESCHEDULE" to pick a new time or "PICKUP" for self-collection.',
        example: { body_text: [['Rahul', 'ORD-0042', 'No one at home']] },
      },
      { type: 'FOOTER', text: 'Powered by WA Commerce' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Reschedule' },
          { type: 'QUICK_REPLY', text: 'Pickup' },
        ],
      },
    ],
  },

  // ─── UTILITY: Admin Notifications ───────────────────────────────
  {
    name: 'admin_new_order',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'New order received! Order #{{1}} from {{2}} for {{3}}. Items: {{4}}. Reply "CONFIRM" to confirm or "VIEW" for details.',
        example: { body_text: [['ORD-0042', 'Rahul', 'Rs. 1,299', '2x T-Shirt, 1x Jeans']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Confirm' },
          { type: 'QUICK_REPLY', text: 'View' },
        ],
      },
    ],
  },
  {
    name: 'admin_payment_received',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Payment received! {{1}} paid {{2}} for order #{{3}} via {{4}}. Reply "VERIFY" to verify or "REJECT" if suspicious.',
        example: { body_text: [['Rahul', 'Rs. 999', 'ORD-0042', 'UPI']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Verify' },
          { type: 'QUICK_REPLY', text: 'Reject' },
        ],
      },
    ],
  },
  {
    name: 'admin_low_stock',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Low stock alert! {{1}} has only {{2}} units remaining. Current threshold: {{3}}. Reply "RESTOCK" to update inventory.',
        example: { body_text: [['Blue Cotton T-Shirt', '3', '5']] },
      },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: 'Restock' }],
      },
    ],
  },
  {
    name: 'admin_new_customer',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'New customer! {{1}} ({{2}}) just opted in to your store. You now have {{3}} customers in total. Reply VIEW for details.',
        example: { body_text: [['Rahul', '+919876543210', '156']] },
      },
    ],
  },
  {
    name: 'admin_daily_summary',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Daily Summary for {{1}}:\n- Orders: {{2}}\n- Revenue: {{3}}\n- New Customers: {{4}}\n- Messages: {{5}}\n\nReply "DETAILS" for full report.',
        example: { body_text: [['17 May 2026', '12', 'Rs. 15,400', '5', '87']] },
      },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: 'Details' }],
      },
    ],
  },

  // ─── MARKETING ──────────────────────────────────────────────────
  {
    name: 'campaign_promotional',
    category: 'MARKETING',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, {{2}} Reply SHOP to browse or STOP to unsubscribe.',
        example: { body_text: [['Rahul', 'Check out our latest summer collection! Up to 50% off on all items this weekend.']] },
      },
      { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Shop Now' },
          { type: 'QUICK_REPLY', text: 'Unsubscribe' },
        ],
      },
    ],
  },
  {
    name: 'campaign_discount',
    category: 'MARKETING',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, exclusive offer just for you! Get {{2}} off on {{3}}. Use code: {{4}}. Valid until {{5}}. Reply "ORDER" to shop now!',
        example: { body_text: [['Rahul', '20%', 'all T-Shirts', 'SUMMER20', '25 May 2026']] },
      },
      { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Order Now' },
          { type: 'QUICK_REPLY', text: 'Unsubscribe' },
        ],
      },
    ],
  },
  {
    name: 'abandoned_cart_reminder',
    category: 'MARKETING',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, you left {{2}} in your cart! Your items are still available. Complete your order before they sell out. Reply "CHECKOUT" to place your order.',
        example: { body_text: [['Rahul', '2 items worth Rs. 999']] },
      },
      { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Checkout' },
          { type: 'QUICK_REPLY', text: 'Remove' },
        ],
      },
    ],
  },
  {
    name: 'back_in_stock',
    category: 'MARKETING',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, great news! {{2}} is back in stock. Only {{3}} units available — grab yours before it\'s gone! Reply "ORDER" to buy now.',
        example: { body_text: [['Rahul', 'Blue Cotton T-Shirt', '10']] },
      },
      { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: 'Order' }],
      },
    ],
  },

  // ─── UTILITY: Customer Service ──────────────────────────────────
  {
    name: 'welcome_message',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Welcome to {{1}}! We\'re happy to have you here. Browse our catalog by replying "MENU" or ask us anything. We\'re here to help!',
        example: { body_text: [['Fresh Mart']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Menu' },
          { type: 'QUICK_REPLY', text: 'Support' },
        ],
      },
    ],
  },
  {
    name: 'order_feedback',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, we hope you\'re enjoying your order #{{2}}! How would you rate your experience? Reply with a number 1-5 (5 being excellent).',
        example: { body_text: [['Rahul', 'ORD-0042']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: '5 - Excellent' },
          { type: 'QUICK_REPLY', text: '3 - Average' },
          { type: 'QUICK_REPLY', text: '1 - Poor' },
        ],
      },
    ],
  },

  // ─── GENERIC STATUS UPDATES (sent out-of-window, interactive) ───
  {
    name: 'order_status_update',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, update on your order #{{2}}: {{3}}. Tap below to track your order anytime.',
        example: { body_text: [['Rahul', 'ORD-0042', 'Out for delivery']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Track Order' }] },
    ],
  },
  {
    name: 'payment_update',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, payment update for your order #{{2}}: {{3}}. Tap below to view your orders.',
        example: { body_text: [['Rahul', 'ORD-0042', 'Payment received']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'My Orders' }] },
    ],
  },

  // ─── BUILDER NOTIFICATIONS (sent when an admin builds an order/quote) ───
  {
    name: 'order_created_notify',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, a new order *{{2}}* is being created for you. Tap below to view it, and reply here with any changes.',
        example: { body_text: [['Rahul', 'ORD-0042']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Check the order' }] },
    ],
  },
  {
    name: 'quote_ready_notify',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your quote *{{2}}* is ready. Tap below to review it, and reply here if you have any questions.',
        example: { body_text: [['Rahul', 'QT-00042']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Check the quote' }] },
    ],
  },

  // ─── SMART TEASERS ──────────────────────────────────────────────
  // Sent (batched) when the recipient is OUTSIDE their 24h service window.
  // A single tap opens the window so the real, detailed updates can be
  // delivered free-form for free.
  {
    name: 'customer_updates_teaser',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, you have {{2}} new update(s) waiting on your orders. Tap below to view them now.',
        example: { body_text: [['Rahul', '3']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'View Updates' }] },
    ],
  },
  {
    name: 'customer_offers_teaser',
    category: 'MARKETING',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, we have {{2}} exciting offer(s) just for you! 🎁 Tap below to see what\'s waiting.',
        example: { body_text: [['Rahul', '2']] },
      },
      { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Show Offers' }] },
    ],
  },
  {
    name: 'admin_updates_teaser',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: 'You have {{1}} new store update(s) — orders, payments and alerts. Tap below to view them now.',
        example: { body_text: [['5']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'View Updates' }] },
    ],
  },
];
