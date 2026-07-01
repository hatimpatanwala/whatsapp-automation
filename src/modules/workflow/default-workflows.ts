/**
 * The default e-commerce workflow set, auto-created per tenant.
 *
 * Modular / loosely-coupled hub-and-spoke design:
 *  - A tiny SYSTEM "Welcome" hub (undeletable, editable): greeting → a DYNAMIC
 *    menu built from whichever sub-workflows are active → starts the chosen one.
 *  - Each customer journey (Browse, Search, Cart→Checkout, My Orders, Track,
 *    Quote, Support) is its OWN workflow with its own trigger keyword AND a
 *    `menuItem` registration, so it works standalone and appears in the Welcome
 *    menu while it's active. Spokes connect to each other by name via
 *    `start_workflow` (e.g. a product card → View Cart → Browse again).
 *  - Event-driven NOTIFICATIONS (order/payment/quote updates) are their own
 *    workflows too — no menu item, triggered automatically by domain events.
 *    They render with placeholders ({{order_number}}, {{order_total}},
 *    {{currency}}, {{customer_name}}, …) and are fully admin-editable.
 *
 * Adding/activating/pausing a spoke automatically changes the Welcome menu —
 * no edits to the hub needed.
 */
export interface DefaultWorkflowDef {
  name: string;
  description: string;
  trigger: Record<string, any>;
  nodes: any[];
  edges: any[];
  /** When set, this workflow shows up in the Welcome hub's dynamic menu. */
  menuItem?: { label: string; order: number };
}

/** The SYSTEM Welcome hub — greeting + dynamic menu that routes to active spokes. */
export function buildWelcomeHub(storeName: string): DefaultWorkflowDef {
  const store = (storeName || 'our store').trim() || 'our store';
  return {
    name: 'Welcome',
    description: 'Greets customers and shows a menu of whatever is active (browse, search, cart, orders, quotes, support).',
    trigger: { type: 'trigger_message', keywords: 'hi,hello,hey,menu,start,shop,hii,helo', matchType: 'contains' },
    nodes: [
      { id: 'n1', type: 'trigger_message', label: 'Customer Says Hi', x: 340, y: 40, config: { keywords: 'hi,hello,hey,menu,start,shop,hii,helo', matchType: 'contains' }, outputs: ['n2'] },
      { id: 'n2', type: 'send_text', label: 'Welcome Message', x: 340, y: 190, config: { message: `👋 Welcome to *${store}*!\nHi {{customer_name}}, great to see you. How can we help you today?` }, outputs: ['n3'] },
      { id: 'n3', type: 'send_list', label: 'Main Menu', x: 340, y: 340, config: { message: 'Pick an option to get started:', buttonText: 'Open Menu', source: 'menu_workflows' }, outputs: ['n4'] },
      { id: 'n4', type: 'start_workflow', label: 'Open Selected', x: 340, y: 520, config: { useReply: true, passVariables: true }, outputs: [] },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3' },
      { id: 'e3', from: 'n3', to: 'n4' },
    ],
  };
}

/** The modular customer-facing spoke workflows (each standalone + a Welcome menu item). */
export function buildDefaultSpokes(): DefaultWorkflowDef[] {
  return [
    // ── 1. Browse Products — pick All / By Category / By Brand, then open the
    //      storefront webview pre-filtered to the chosen category/brand. ──
    {
      name: 'Browse Products',
      description: 'Choose All Products, By Category or By Brand, then open the storefront webview with that filter applied.',
      menuItem: { label: '🛍️ Browse Products', order: 1 },
      trigger: { type: 'trigger_message', keywords: 'browse,catalog,products,shop now,shop,store', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Browse', x: 300, y: 40, config: { keywords: 'browse,catalog,products,shop now,shop,store', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'send_buttons', label: 'How to Browse', x: 300, y: 180, config: { message: '🛍️ How would you like to browse?', buttons: [{ id: 'br_all', title: '🛍️ All Products' }, { id: 'br_cat', title: '📂 By Category' }, { id: 'br_brand', title: '🏷️ By Brand' }] }, outputs: ['n3', 'n4', 'n6'] },
        { id: 'n3', type: 'open_shop', label: 'All Products', x: 80, y: 340, config: { message: '🛍️ Tap below to browse all our products, add to your cart and checkout.', buttonLabel: '🛒 Open Store' }, outputs: [] },
        { id: 'n4', type: 'send_list', label: 'Pick Category', x: 300, y: 340, config: { message: '📂 Pick a category:', buttonText: 'Categories', source: 'categories' }, outputs: ['n5'] },
        { id: 'n5', type: 'open_shop', label: 'Category Store', x: 300, y: 480, config: { filterFrom: 'category', message: '🛍️ Tap below to browse this category.', buttonLabel: '🛒 Open Store' }, outputs: [] },
        { id: 'n6', type: 'send_list', label: 'Pick Brand', x: 520, y: 340, config: { message: '🏷️ Pick a brand:', buttonText: 'Brands', source: 'brands' }, outputs: ['n7'] },
        { id: 'n7', type: 'open_shop', label: 'Brand Store', x: 520, y: 480, config: { filterFrom: 'brand', message: '🛍️ Tap below to browse this brand.', buttonLabel: '🛒 Open Store' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },   // br_all
        { id: 'e3', from: 'n2', to: 'n4' },   // br_cat
        { id: 'e4', from: 'n2', to: 'n6' },   // br_brand
        { id: 'e5', from: 'n4', to: 'n5' },
        { id: 'e6', from: 'n6', to: 'n7' },
      ],
    },

    // ── 2. Search Products — type a name → results → product card → cart ──
    {
      name: 'Search Products',
      description: 'Type what you are looking for, then open the storefront webview filtered to your search.',
      menuItem: { label: '🔎 Search Products', order: 2 },
      trigger: { type: 'trigger_message', keywords: 'search,find,looking for', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Search', x: 300, y: 40, config: { keywords: 'search,find,looking for', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'send_text', label: 'Ask Query', x: 300, y: 180, config: { message: '🔎 What are you looking for? Type a product name to search.' }, outputs: ['n3'] },
        { id: 'n3', type: 'wait_for_reply', label: 'Wait', x: 300, y: 320, config: { timeoutMinutes: 10, timeoutMessage: 'No problem — send *menu* whenever you’re ready.' }, outputs: ['n4'] },
        { id: 'n4', type: 'open_shop', label: 'Open Search', x: 300, y: 460, config: { searchFromInput: true, message: '🔎 Tap below to see matching products in our store.', buttonLabel: '🛒 Open Store' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
      ],
    },

    // ── 3. View Cart & Checkout — opens the storefront webview at the cart ──
    {
      name: 'View Cart',
      description: 'Opens the storefront webview at the cart to review items and checkout.',
      menuItem: { label: '🛒 View Cart & Checkout', order: 3 },
      trigger: { type: 'trigger_message', keywords: 'cart,my cart,view cart,checkout', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Cart', x: 300, y: 40, config: { keywords: 'cart,my cart,view cart,checkout', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'open_shop', label: 'Open Cart', x: 300, y: 200, config: { startView: 'cart', message: '🛒 Tap below to review your cart and checkout.', buttonLabel: '🛒 View Cart' }, outputs: [] },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    },

    // ── 4. My Orders ──
    {
      name: 'My Orders',
      description: 'List the customer’s recent orders.',
      menuItem: { label: '📦 My Orders', order: 4 },
      trigger: { type: 'trigger_message', keywords: 'orders,my orders', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'My Orders', x: 300, y: 40, config: { keywords: 'orders,my orders', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'my_orders', label: 'My Orders', x: 300, y: 200, config: { header: '📦 Your Orders', maxOrders: 5, emptyMessage: 'You have no orders yet. Send *browse* to shop!' }, outputs: [] },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    },

    // ── 5. Track Order ──
    {
      name: 'Track Order',
      description: 'Look up an order’s status by order number.',
      menuItem: { label: '🚚 Track Order', order: 5 },
      trigger: { type: 'trigger_message', keywords: 'track,track order', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Track', x: 300, y: 40, config: { keywords: 'track,track order', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'send_text', label: 'Ask Order No.', x: 300, y: 200, config: { message: '🚚 Please send your *order number* (e.g. ORD-ABC123).' }, outputs: ['n3'] },
        { id: 'n3', type: 'wait_for_reply', label: 'Wait', x: 300, y: 360, config: { timeoutMinutes: 10, timeoutMessage: 'No problem — send *menu* whenever you’re ready.' }, outputs: ['n4'] },
        { id: 'n4', type: 'track_order', label: 'Track Order', x: 300, y: 520, config: {}, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
      ],
    },

    // ── 6. Get a Quote — capture the request (admin builds + sends the quote) ──
    {
      name: 'Get a Quote',
      description: 'Capture a price-quote request; the team prepares and sends the quote.',
      menuItem: { label: '🧾 Get a Quote', order: 6 },
      trigger: { type: 'trigger_message', keywords: 'quote,quotation,get a quote', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Quote', x: 300, y: 40, config: { keywords: 'quote,quotation,get a quote', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'send_text', label: 'Ask Items', x: 300, y: 200, config: { message: '🧾 Happy to help with a quote!\nReply with the *products and quantities* you need.' }, outputs: ['n3'] },
        { id: 'n3', type: 'wait_for_reply', label: 'Wait', x: 300, y: 360, config: { timeoutMinutes: 60, timeoutMessage: 'No rush — send your request whenever you’re ready.' }, outputs: ['n4'] },
        { id: 'n4', type: 'send_text', label: 'Confirm', x: 300, y: 520, config: { message: '✅ Thanks, {{customer_name}}! Our team is preparing your quote and will send it here shortly.' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
      ],
    },

    // ── 7. Talk to us ──
    {
      name: 'Talk to us',
      description: 'Hand the conversation to a human.',
      menuItem: { label: '💬 Talk to us', order: 7 },
      trigger: { type: 'trigger_message', keywords: 'support,help,agent,human', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Support', x: 300, y: 40, config: { keywords: 'support,help,agent,human', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'send_text', label: 'Support', x: 300, y: 200, config: { message: '💬 We’re here to help! Reply with your question and our team will get back to you shortly.' }, outputs: [] },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    },

    // ── 8. Offers & Deals ──
    {
      name: 'Offers',
      description: 'Show current offers, schemes and coupons to the customer.',
      menuItem: { label: '🎉 Offers & Deals', order: 8 },
      trigger: { type: 'trigger_message', keywords: 'offers,offer,deals,deal,discount,coupon,scheme,sale', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Offers', x: 300, y: 40, config: { keywords: 'offers,offer,deals,deal,discount,coupon,scheme,sale', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'show_offers', label: 'Show Offers', x: 300, y: 200, config: { header: '🎉 *Today’s Offers*' }, outputs: [] },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    },
  ];
}

// ─── Reusable interactive NOTIFICATION builders ─────────────────────────────
// Shared by the default seeded set AND the personalization / template-chooser
// templates (business-categories.ts) so notifications behave identically
// everywhere: each fires on a domain event and sends action buttons whose taps
// return the relevant details (order details, payment receipt, resend quote).

/** Order notification: message + "📦 Order Details" button (→ order_details), and an optional second spoke button. */
export function buildInteractiveOrderNote(
  name: string, description: string, event: string, message: string,
  extra?: { title: string; workflow: string },
): DefaultWorkflowDef {
  const buttons: { id: string; title: string }[] = [{ id: 'od', title: '📦 Order Details' }];
  const nodes: any[] = [
    { id: 'n1', type: 'trigger_order', label: 'Order Event', x: 300, y: 40, config: { event }, outputs: ['n2'] },
    { id: 'n2', type: 'send_buttons', label: 'Notify', x: 300, y: 190, config: { message, buttons }, outputs: ['n3'] },
    { id: 'n3', type: 'order_details', label: 'Order Details', x: 200, y: 340, config: {}, outputs: [] },
  ];
  const edges: any[] = [
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3' },
  ];
  if (extra) {
    buttons.push({ id: 'x', title: extra.title });
    nodes[1].outputs = ['n3', 'n4'];
    nodes.push({ id: 'n4', type: 'start_workflow', label: extra.title, x: 420, y: 340, config: { workflowName: extra.workflow, passVariables: true }, outputs: [] });
    edges.push({ id: 'e3', from: 'n2', to: 'n4' });
  }
  return { name, description, trigger: { type: 'trigger_order', event }, nodes, edges };
}

/** Payment notification: message + receipt button (→ payment_receipt) + order details. */
export function buildInteractivePayNote(
  name: string, description: string, event: string, message: string, receiptLabel: string,
): DefaultWorkflowDef {
  return {
    name,
    description,
    trigger: { type: 'trigger_payment', event },
    nodes: [
      { id: 'n1', type: 'trigger_payment', label: 'Payment Event', x: 300, y: 40, config: { event }, outputs: ['n2'] },
      { id: 'n2', type: 'send_buttons', label: 'Notify', x: 300, y: 190, config: { message, buttons: [{ id: 'rcpt', title: receiptLabel }, { id: 'od', title: '📦 Order Details' }] }, outputs: ['n3', 'n4'] },
      { id: 'n3', type: 'payment_receipt', label: 'Payment Receipt', x: 200, y: 340, config: {}, outputs: [] },
      { id: 'n4', type: 'order_details', label: 'Order Details', x: 420, y: 340, config: {}, outputs: [] },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3' },
      { id: 'e3', from: 'n2', to: 'n4' },
    ],
  };
}

/** Quote ready: send the full quote, then offer to resend it or get help. */
export function buildQuoteReadyNote(name: string, description: string, event = 'created'): DefaultWorkflowDef {
  return {
    name,
    description,
    trigger: { type: 'trigger_quote', event },
    nodes: [
      { id: 'n1', type: 'trigger_quote', label: 'Quote Event', x: 300, y: 40, config: { event }, outputs: ['n2'] },
      { id: 'n2', type: 'send_quote', label: 'Send Quote', x: 300, y: 180, config: { headerMessage: '📋 Hi {{customer_name}}, here’s your quote:', footerMessage: 'Tap below if you need anything 👇' }, outputs: ['n3'] },
      { id: 'n3', type: 'send_buttons', label: 'Options', x: 300, y: 330, config: { message: 'What would you like to do?', buttons: [{ id: 'rq', title: '📋 Resend Quote' }, { id: 'help', title: '💬 Talk to us' }] }, outputs: ['n4', 'n5'] },
      { id: 'n4', type: 'send_quote', label: 'Resend Quote', x: 200, y: 480, config: { headerMessage: '📋 Here’s your quote again:' }, outputs: [] },
      { id: 'n5', type: 'start_workflow', label: 'Talk to us', x: 420, y: 480, config: { workflowName: 'Talk to us', passVariables: true }, outputs: [] },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3' },
      { id: 'e3', from: 'n3', to: 'n4' },
      { id: 'e4', from: 'n3', to: 'n5' },
    ],
  };
}

/** Quote accepted: thank, then resend the quote for reference (button). */
export function buildQuoteAcceptedNote(name: string, description: string, event = 'accepted'): DefaultWorkflowDef {
  return {
    name,
    description,
    trigger: { type: 'trigger_quote', event },
    nodes: [
      { id: 'n1', type: 'trigger_quote', label: 'Quote Event', x: 300, y: 40, config: { event }, outputs: ['n2'] },
      { id: 'n2', type: 'send_text', label: 'Thanks', x: 300, y: 180, config: { message: '🎉 Thanks for accepting quote *{{quote_number}}*, {{customer_name}}! We’ll get started right away.' }, outputs: ['n3'] },
      { id: 'n3', type: 'send_buttons', label: 'Options', x: 300, y: 330, config: { message: 'Here for your reference 👇', buttons: [{ id: 'vq', title: '📋 View Quote' }] }, outputs: ['n4'] },
      { id: 'n4', type: 'send_quote', label: 'Resend Quote', x: 300, y: 480, config: { headerMessage: '📋 Your accepted quote:' }, outputs: [] },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3' },
      { id: 'e3', from: 'n3', to: 'n4' },
    ],
  };
}

/**
 * Event-driven NOTIFICATION workflows. No menu item — each fires automatically
 * when the matching domain event happens (order/payment/quote), and renders an
 * admin-editable message with live placeholders. These populate the
 * "Notifications" tab and keep the customer updated end-to-end.
 */
export function buildDefaultNotifications(): DefaultWorkflowDef[] {
  return [
    buildInteractiveOrderNote(
      'Order Received', 'Confirms a new order with an Order Details button.', 'created',
      '🧾 Hi {{customer_name}}, we’ve received your order *#{{order_number}}* — total {{currency}}{{order_total}}.\nWe’ll keep you posted!',
    ),
    buildInteractiveOrderNote(
      'Order Confirmed', 'Confirms the order, with an Order Details button.', 'confirmed',
      '✅ Your order *#{{order_number}}* is confirmed and is being prepared. We’ll let you know when it ships.',
    ),
    buildInteractiveOrderNote(
      'Order Out for Delivery', 'Out-for-delivery update with order details.', 'out_for_delivery',
      '🚚 Your order *#{{order_number}}* is out for delivery — arriving soon!',
    ),
    buildInteractiveOrderNote(
      'Order Delivered', 'Delivered update with details + shop again.', 'delivered',
      '🎉 Your order *#{{order_number}}* has been delivered. We hope you love it!',
      { title: '🛍️ Shop Again', workflow: 'Browse Products' },
    ),
    buildInteractiveOrderNote(
      'Order Cancelled', 'Cancellation update with details + support.', 'cancelled',
      '❌ Your order *#{{order_number}}* has been cancelled. Reply here if you need any help.',
      { title: '💬 Talk to us', workflow: 'Talk to us' },
    ),
    buildInteractivePayNote(
      'Payment Received', 'Confirms payment with a View Receipt button.', 'verified',
      '✅ Payment of {{currency}}{{payment_amount}} received for order *#{{order_number}}*. Thank you, {{customer_name}}!',
      '🧾 View Receipt',
    ),
    buildInteractivePayNote(
      'Payment Pending', 'Pending-payment reminder with payment details.', 'expired',
      '⏰ Your payment for order *#{{order_number}}* is still pending. Reply here to complete it.',
      '💳 Payment Details',
    ),
    // Fires when the admin SENDS the quote (status → sent), not on the customer's
    // initial request — so the customer only gets the finalised, priced quote.
    buildQuoteReadyNote('Quote Ready', 'Sends the finalised quote when the admin sends it — with buttons to view/accept.', 'sent'),
    buildQuoteAcceptedNote('Quote Accepted', 'Thanks the customer and resends the accepted quote.'),
  ];
}
