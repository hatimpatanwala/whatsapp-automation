// ─── Business Categories, Subcategories, Features & Workflow Templates ─────
// Used by PersonalizationService to auto-create workflows during onboarding

export interface SubCategory {
  value: string;
  label: string;
}

export interface BusinessCategory {
  value: string;
  label: string;
  icon: string;
  subcategories: SubCategory[];
  recommendedFeatures: string[];
}

export interface FeatureOption {
  key: string;
  label: string;
  description: string;
  icon: string;
  group: string;
  workflowTemplateKey: string;
}

// ─── Categories & Subcategories ────────────────────────────────────────────

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  {
    value: 'retail',
    label: 'Retail / E-Commerce',
    icon: 'pi-shopping-cart',
    subcategories: [
      { value: 'fashion', label: 'Fashion & Apparel' },
      { value: 'electronics', label: 'Electronics & Gadgets' },
      { value: 'home_decor', label: 'Home & Decor' },
      { value: 'general_store', label: 'General Store' },
      { value: 'jewelry', label: 'Jewelry & Accessories' },
      { value: 'kids_toys', label: 'Kids & Toys' },
    ],
    recommendedFeatures: [
      'welcome_greeting', 'order_placement', 'order_confirmation', 'order_shipped',
      'abandoned_cart', 'payment_confirmation', 'cod_confirmation',
      'product_inquiry', 'feedback_after_delivery', 'back_in_stock',
    ],
  },
  {
    value: 'food_beverage',
    label: 'Food & Beverages',
    icon: 'pi-star',
    subcategories: [
      { value: 'restaurant', label: 'Restaurant' },
      { value: 'cafe', label: 'Cafe & Coffee Shop' },
      { value: 'cloud_kitchen', label: 'Cloud Kitchen' },
      { value: 'bakery', label: 'Bakery & Sweets' },
      { value: 'catering', label: 'Catering Service' },
      { value: 'food_delivery', label: 'Food Delivery' },
    ],
    recommendedFeatures: [
      'welcome_greeting', 'order_placement', 'order_confirmation',
      'delivery_tracking', 'payment_confirmation', 'cod_confirmation',
      'feedback_after_delivery', 'customer_support', 'loyalty_reengagement',
    ],
  },
  {
    value: 'health_beauty',
    label: 'Health & Beauty',
    icon: 'pi-heart',
    subcategories: [
      { value: 'salon', label: 'Salon & Barbershop' },
      { value: 'spa', label: 'Spa & Wellness' },
      { value: 'clinic', label: 'Clinic & Healthcare' },
      { value: 'pharmacy', label: 'Pharmacy & Medical' },
      { value: 'fitness', label: 'Gym & Fitness' },
      { value: 'cosmetics', label: 'Cosmetics & Skincare' },
    ],
    recommendedFeatures: [
      'welcome_greeting', 'appointment_booking', 'appointment_reminder',
      'payment_reminder', 'feedback_after_delivery', 'customer_support',
      'loyalty_reengagement', 'birthday_wishes', 'faq_bot',
    ],
  },
  {
    value: 'education',
    label: 'Education',
    icon: 'pi-book',
    subcategories: [
      { value: 'coaching', label: 'Coaching Institute' },
      { value: 'school', label: 'School & College' },
      { value: 'online_courses', label: 'Online Courses' },
      { value: 'tutoring', label: 'Tutoring & Mentoring' },
      { value: 'training', label: 'Professional Training' },
    ],
    recommendedFeatures: [
      'welcome_greeting', 'appointment_booking', 'payment_reminder',
      'customer_support', 'faq_bot', 'feedback_after_delivery',
      'promotional_broadcast', 'referral_program',
    ],
  },
  {
    value: 'services',
    label: 'Professional Services',
    icon: 'pi-briefcase',
    subcategories: [
      { value: 'consulting', label: 'Consulting' },
      { value: 'agency', label: 'Marketing / Digital Agency' },
      { value: 'freelancer', label: 'Freelancer' },
      { value: 'real_estate', label: 'Real Estate' },
      { value: 'legal', label: 'Legal Services' },
      { value: 'accounting', label: 'Accounting & Finance' },
    ],
    recommendedFeatures: [
      'welcome_greeting', 'quote_creation', 'quote_followup',
      'appointment_booking', 'payment_reminder', 'customer_support',
      'faq_bot', 'feedback_after_delivery',
    ],
  },
  {
    value: 'grocery',
    label: 'Grocery',
    icon: 'pi-box',
    subcategories: [
      { value: 'supermarket', label: 'Supermarket' },
      { value: 'organic', label: 'Organic & Health Store' },
      { value: 'wholesale', label: 'Wholesale / Bulk' },
      { value: 'dairy', label: 'Dairy & Fresh Produce' },
    ],
    recommendedFeatures: [
      'welcome_greeting', 'order_placement', 'order_confirmation',
      'delivery_tracking', 'payment_confirmation', 'cod_confirmation',
      'product_inquiry', 'loyalty_reengagement', 'back_in_stock',
    ],
  },
  {
    value: 'automotive',
    label: 'Automotive',
    icon: 'pi-car',
    subcategories: [
      { value: 'dealership', label: 'Vehicle Dealership' },
      { value: 'workshop', label: 'Service / Workshop' },
      { value: 'spare_parts', label: 'Spare Parts' },
      { value: 'rental', label: 'Car Rental' },
    ],
    recommendedFeatures: [
      'welcome_greeting', 'appointment_booking', 'appointment_reminder',
      'quote_creation', 'payment_reminder', 'customer_support',
      'feedback_after_delivery', 'warranty_service',
    ],
  },
  {
    value: 'travel',
    label: 'Travel & Hospitality',
    icon: 'pi-globe',
    subcategories: [
      { value: 'hotel', label: 'Hotel & Resort' },
      { value: 'travel_agency', label: 'Travel Agency' },
      { value: 'tour_operator', label: 'Tour Operator' },
      { value: 'homestay', label: 'Homestay / B&B' },
    ],
    recommendedFeatures: [
      'welcome_greeting', 'appointment_booking', 'quote_creation',
      'payment_confirmation', 'customer_support', 'feedback_after_delivery',
      'faq_bot', 'promotional_broadcast',
    ],
  },
  {
    value: 'other',
    label: 'Other',
    icon: 'pi-th-large',
    subcategories: [
      { value: 'ngo', label: 'NGO / Non-Profit' },
      { value: 'events', label: 'Events & Entertainment' },
      { value: 'manufacturing', label: 'Manufacturing' },
      { value: 'other', label: 'Other' },
    ],
    recommendedFeatures: [
      'welcome_greeting', 'customer_support', 'faq_bot',
      'feedback_after_delivery', 'payment_reminder',
    ],
  },
];

// ─── Feature Options (grouped) ─────────────────────────────────────────────

export const FEATURE_OPTIONS: FeatureOption[] = [
  // ── Sales & Orders ──
  {
    key: 'welcome_greeting',
    label: 'Welcome & Main Menu',
    description: 'Auto-greet customers and show interactive main menu with options',
    icon: 'pi-comment',
    group: 'Sales & Orders',
    workflowTemplateKey: 'welcome_greeting',
  },
  {
    key: 'order_placement',
    label: 'Order Placement Flow',
    description: 'Complete WhatsApp ordering: browse catalog, add to cart, checkout',
    icon: 'pi-shopping-cart',
    group: 'Sales & Orders',
    workflowTemplateKey: 'order_placement',
  },
  {
    key: 'order_confirmation',
    label: 'Order Confirmation',
    description: 'Auto-send order confirmation with details when order is placed',
    icon: 'pi-check-circle',
    group: 'Sales & Orders',
    workflowTemplateKey: 'order_confirmation',
  },
  {
    key: 'order_shipped',
    label: 'Order Shipped / Out for Delivery',
    description: 'Notify customer when order is shipped or out for delivery',
    icon: 'pi-truck',
    group: 'Sales & Orders',
    workflowTemplateKey: 'order_shipped',
  },
  {
    key: 'delivery_tracking',
    label: 'Delivery Tracking Updates',
    description: 'Send delivery status updates and estimated arrival time',
    icon: 'pi-map-marker',
    group: 'Sales & Orders',
    workflowTemplateKey: 'delivery_tracking',
  },
  {
    key: 'order_cancellation',
    label: 'Order Cancellation Handler',
    description: 'Handle order cancellation requests with reason collection',
    icon: 'pi-times-circle',
    group: 'Sales & Orders',
    workflowTemplateKey: 'order_cancellation',
  },
  {
    key: 'abandoned_cart',
    label: 'Abandoned Cart Recovery',
    description: 'Remind customers about items left in their cart after 1 hour',
    icon: 'pi-replay',
    group: 'Sales & Orders',
    workflowTemplateKey: 'abandoned_cart',
  },

  // ── Payments ──
  {
    key: 'payment_confirmation',
    label: 'Payment Confirmation',
    description: 'Auto-confirm payment received and update order status',
    icon: 'pi-check-square',
    group: 'Payments',
    workflowTemplateKey: 'payment_confirmation',
  },
  {
    key: 'payment_reminder',
    label: 'Payment Reminder',
    description: 'Send payment reminders for pending/unpaid orders',
    icon: 'pi-wallet',
    group: 'Payments',
    workflowTemplateKey: 'payment_reminder',
  },
  {
    key: 'cod_confirmation',
    label: 'COD Order Confirmation',
    description: 'Confirm Cash on Delivery orders with delivery details',
    icon: 'pi-money-bill',
    group: 'Payments',
    workflowTemplateKey: 'cod_confirmation',
  },

  // ── Quotes & Invoices ──
  {
    key: 'quote_creation',
    label: 'Quote Creation & Sending',
    description: 'Auto-send quotes to customers with accept/reject options',
    icon: 'pi-file-edit',
    group: 'Quotes & Invoices',
    workflowTemplateKey: 'quote_creation',
  },
  {
    key: 'quote_followup',
    label: 'Quote Follow-up',
    description: 'Auto-follow up on pending quotes after 24 hours',
    icon: 'pi-clock',
    group: 'Quotes & Invoices',
    workflowTemplateKey: 'quote_followup',
  },
  {
    key: 'quote_accepted',
    label: 'Quote Accepted → Order',
    description: 'When quote is accepted, confirm and convert to order',
    icon: 'pi-check',
    group: 'Quotes & Invoices',
    workflowTemplateKey: 'quote_accepted',
  },

  // ── Products & Catalog ──
  {
    key: 'product_inquiry',
    label: 'Product Inquiry Handler',
    description: 'Handle product questions: show catalog, search, and share details',
    icon: 'pi-search',
    group: 'Products & Catalog',
    workflowTemplateKey: 'product_inquiry',
  },
  {
    key: 'back_in_stock',
    label: 'Back in Stock Notification',
    description: 'Notify customers when out-of-stock items are available again',
    icon: 'pi-bell',
    group: 'Products & Catalog',
    workflowTemplateKey: 'back_in_stock',
  },
  {
    key: 'price_list',
    label: 'Price List / Menu Sharing',
    description: 'Share product price list or menu on request',
    icon: 'pi-list',
    group: 'Products & Catalog',
    workflowTemplateKey: 'price_list',
  },

  // ── Appointments & Bookings ──
  {
    key: 'appointment_booking',
    label: 'Appointment Booking',
    description: 'Let customers book appointments with service and time selection',
    icon: 'pi-calendar',
    group: 'Appointments',
    workflowTemplateKey: 'appointment_booking',
  },
  {
    key: 'appointment_reminder',
    label: 'Appointment Reminder',
    description: 'Send reminders 24h and 1h before scheduled appointments',
    icon: 'pi-clock',
    group: 'Appointments',
    workflowTemplateKey: 'appointment_reminder',
  },

  // ── Customer Support ──
  {
    key: 'customer_support',
    label: 'Customer Support Bot',
    description: 'Route support inquiries with categories and agent handoff',
    icon: 'pi-headphones',
    group: 'Customer Support',
    workflowTemplateKey: 'customer_support',
  },
  {
    key: 'complaint_resolution',
    label: 'Complaint Resolution',
    description: 'Handle complaints with priority routing and follow-up',
    icon: 'pi-exclamation-triangle',
    group: 'Customer Support',
    workflowTemplateKey: 'complaint_resolution',
  },
  {
    key: 'return_refund',
    label: 'Return & Refund Processing',
    description: 'Handle return requests with reason collection and refund status',
    icon: 'pi-undo',
    group: 'Customer Support',
    workflowTemplateKey: 'return_refund',
  },
  {
    key: 'warranty_service',
    label: 'Warranty / Service Request',
    description: 'Process warranty claims and service requests',
    icon: 'pi-shield',
    group: 'Customer Support',
    workflowTemplateKey: 'warranty_service',
  },
  {
    key: 'faq_bot',
    label: 'FAQ Bot',
    description: 'Auto-answer common questions: hours, location, policies',
    icon: 'pi-question-circle',
    group: 'Customer Support',
    workflowTemplateKey: 'faq_bot',
  },

  // ── Customer Engagement ──
  {
    key: 'feedback_after_delivery',
    label: 'Feedback After Delivery',
    description: 'Auto-request ratings and reviews after order delivery',
    icon: 'pi-star-fill',
    group: 'Engagement',
    workflowTemplateKey: 'feedback_after_delivery',
  },
  {
    key: 'loyalty_reengagement',
    label: 'Loyalty & Re-engagement',
    description: 'Re-engage inactive customers with personalized offers',
    icon: 'pi-gift',
    group: 'Engagement',
    workflowTemplateKey: 'loyalty_reengagement',
  },
  {
    key: 'birthday_wishes',
    label: 'Birthday / Anniversary Wishes',
    description: 'Send personalized wishes with special discount offers',
    icon: 'pi-sparkles',
    group: 'Engagement',
    workflowTemplateKey: 'birthday_wishes',
  },
  {
    key: 'referral_program',
    label: 'Referral Program',
    description: 'Encourage referrals with shareable links and rewards tracking',
    icon: 'pi-users',
    group: 'Engagement',
    workflowTemplateKey: 'referral_program',
  },
  {
    key: 'promotional_broadcast',
    label: 'Promotional Broadcast',
    description: 'Send promotional messages, flash sales, and announcements',
    icon: 'pi-megaphone',
    group: 'Engagement',
    workflowTemplateKey: 'promotional_broadcast',
  },
  {
    key: 'new_customer_welcome',
    label: 'New Customer Onboarding',
    description: 'Multi-step welcome series for new customers with store tour',
    icon: 'pi-user-plus',
    group: 'Engagement',
    workflowTemplateKey: 'new_customer_welcome',
  },
];

// ─── Workflow Templates ────────────────────────────────────────────────────

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  trigger: Record<string, any>;
  nodes: any[];
  edges: any[];
}

export function getWorkflowTemplates(category: string, subcategory: string): Record<string, WorkflowTemplate> {
  const cat = BUSINESS_CATEGORIES.find(c => c.value === category);
  const subLabel = cat?.subcategories.find(s => s.value === subcategory)?.label || subcategory;

  return {

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SALES & ORDERS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    welcome_greeting: {
      key: 'welcome_greeting',
      name: 'Welcome & Main Menu',
      description: `Welcome greeting and main menu for ${subLabel}`,
      trigger: { type: 'trigger_message', keywords: 'hi,hello,hey,start,menu,hii,helo', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Customer Says Hi',
          x: 300, y: 50,
          config: { keywords: 'hi,hello,hey,start,menu,hii,helo', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Welcome Menu',
          x: 300, y: 200,
          config: {
            message: `Welcome to *${subLabel}*! 👋\n\nWe're glad to have you here. How can we help you today?`,
            buttons: [
              { id: 'browse', title: '🛍️ Browse Products' },
              { id: 'orders', title: '📦 My Orders' },
              { id: 'support', title: '💬 Support' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'switch', label: 'Route Choice',
          x: 300, y: 380,
          config: { variable: 'button_reply' },
          outputs: ['n4', 'n5', 'n6'],
        },
        {
          id: 'n4', type: 'show_catalog', label: 'Show Catalog',
          x: 80, y: 550,
          config: { categoryFilter: '', maxProducts: 10, sortBy: 'popular' },
          outputs: [],
        },
        {
          id: 'n5', type: 'send_text', label: 'Order Status',
          x: 300, y: 550,
          config: { message: '📦 To check your order status, please share your *order number* or the *phone number* used during ordering.\n\nExample: #ORD-12345' },
          outputs: [],
        },
        {
          id: 'n6', type: 'send_list', label: 'Support Menu',
          x: 520, y: 550,
          config: {
            message: '💬 How can we help?',
            buttonText: 'Select Topic',
            sections: [{ title: 'Support', rows: [
              { id: 'product_q', title: 'Product Question', description: 'Ask about products' },
              { id: 'order_issue', title: 'Order Issue', description: 'Problem with order' },
              { id: 'payment_q', title: 'Payment Help', description: 'Payment questions' },
              { id: 'other', title: 'Other', description: 'Something else' },
            ]}],
          },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Browse', condition: 'browse' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Orders', condition: 'orders' },
        { id: 'e5', from: 'n3', to: 'n6', label: 'Support', condition: 'support' },
      ],
    },

    customer_storefront: {
      key: 'customer_storefront',
      name: 'Customer Storefront Menu',
      description: `Full shopping menu for ${subLabel}: browse, cart, checkout, my orders & order tracking`,
      trigger: { type: 'trigger_message', keywords: 'hi,hello,hey,menu,start,shop,hii,helo', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Customer Says Hi', x: 340, y: 40,
          config: { keywords: 'hi,hello,hey,menu,start,shop,hii,helo', matchType: 'contains' }, outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_list', label: 'Main Menu', x: 340, y: 200,
          config: {
            message: `👋 Welcome to *${subLabel}*!\nHow can we help you today?`,
            buttonText: 'Open Menu',
            source: 'custom',
            sections: [
              { title: 'Shop', rows: [
                { id: 'browse', title: '🛍️ Browse Products', description: 'See our catalog' },
                { id: 'cart', title: '🛒 View Cart', description: 'Your selected items' },
              ]},
              { title: 'Orders', rows: [
                { id: 'myorders', title: '📦 My Orders', description: 'Your recent orders' },
                { id: 'track', title: '🚚 Track Order', description: 'Check an order’s status' },
              ]},
              { title: 'Help', rows: [
                { id: 'support', title: '💬 Talk to us', description: 'Get help' },
              ]},
            ],
          }, outputs: ['n3'],
        },
        { id: 'n3', type: 'switch', label: 'Route Choice', x: 340, y: 380, config: { variable: 'list_reply' }, outputs: ['n4', 'n5', 'n6', 'n7', 'n10'] },
        { id: 'n4', type: 'show_catalog', label: 'Browse Products', x: 40, y: 560, config: { maxProducts: 10, sortBy: 'newest' }, outputs: ['n11'] },
        { id: 'n11', type: 'product_card', label: 'Product Card', x: 40, y: 740, config: {}, outputs: ['n5', 'n4'] },
        { id: 'n5', type: 'view_cart', label: 'View Cart', x: 230, y: 560, config: { showCheckout: true, showClear: true }, outputs: [] },
        { id: 'n6', type: 'my_orders', label: 'My Orders', x: 420, y: 560, config: { header: '📦 Your Orders', maxOrders: 5, emptyMessage: 'You have no orders yet. Send *menu* to browse!' }, outputs: [] },
        { id: 'n7', type: 'send_text', label: 'Ask Order No.', x: 610, y: 560, config: { message: '🚚 Please send your *order number* (e.g. ORD-ABC123).' }, outputs: ['n8'] },
        { id: 'n8', type: 'wait_for_reply', label: 'Wait for Order No.', x: 610, y: 720, config: { timeoutMinutes: 10, timeoutMessage: 'No problem — send *menu* whenever you’re ready.' }, outputs: ['n9'] },
        { id: 'n9', type: 'track_order', label: 'Track Order', x: 610, y: 880, config: {}, outputs: [] },
        { id: 'n10', type: 'send_text', label: 'Support', x: 800, y: 560, config: { message: '💬 We’re here to help! Reply with your question and our team will get back to you shortly.' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Browse', condition: 'browse' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Cart', condition: 'cart' },
        { id: 'e5', from: 'n3', to: 'n6', label: 'My Orders', condition: 'myorders' },
        { id: 'e6', from: 'n3', to: 'n7', label: 'Track', condition: 'track' },
        { id: 'e7', from: 'n3', to: 'n10', label: 'Support', condition: 'support' },
        { id: 'e8', from: 'n7', to: 'n8' },
        { id: 'e9', from: 'n8', to: 'n9', label: 'Reply' },
        { id: 'e10', from: 'n4', to: 'n11' },
        { id: 'e11', from: 'n11', to: 'n5', label: 'view', condition: 'view' },
        { id: 'e12', from: 'n11', to: 'n4', label: 'back', condition: 'back' },
      ],
    },

    order_placement: {
      key: 'order_placement',
      name: 'Order Placement Flow',
      description: 'Complete ordering flow: browse → cart → checkout',
      trigger: { type: 'trigger_message', keywords: 'order,buy,purchase,shop,want to buy', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Order Intent',
          x: 300, y: 50,
          config: { keywords: 'order,buy,purchase,shop,want to buy', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'How to Browse',
          x: 300, y: 200,
          config: {
            message: '🛍️ *Let\'s place your order!*\n\nHow would you like to browse?',
            buttons: [
              { id: 'catalog', title: '📋 Full Catalog' },
              { id: 'search', title: '🔍 Search Product' },
              { id: 'popular', title: '🔥 Popular Items' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'condition', label: 'Search or Browse?',
          x: 300, y: 380,
          config: { variable: 'button_reply', operator: 'eq', value: 'search' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'send_text', label: 'Ask Search Query',
          x: 120, y: 530,
          config: { message: '🔍 What product are you looking for?\n\nType the product name or keyword:' },
          outputs: ['n6'],
        },
        {
          id: 'n5', type: 'show_catalog', label: 'Show Catalog',
          x: 480, y: 530,
          config: { categoryFilter: '', maxProducts: 10, sortBy: 'popular' },
          outputs: ['n7'],
        },
        {
          id: 'n6', type: 'search_products', label: 'Search Results',
          x: 120, y: 700,
          config: { noResultsMessage: 'No products found. Try different keywords or browse our catalog.', maxResults: 5 },
          outputs: ['n7'],
        },
        {
          id: 'n7', type: 'add_to_cart', label: 'Add to Cart',
          x: 300, y: 870,
          config: { quantityPrompt: true, confirmMessage: '✅ Added to cart! Reply with another product or type *cart* to view your cart.' },
          outputs: ['n8'],
        },
        {
          id: 'n8', type: 'view_cart', label: 'View Cart',
          x: 300, y: 1040,
          config: { showCheckout: true, showClear: true },
          outputs: ['n9'],
        },
        {
          id: 'n9', type: 'checkout', label: 'Checkout',
          x: 300, y: 1210,
          config: { requireAddress: true, paymentMethod: 'choice' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Search', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Catalog', condition: 'false' },
        { id: 'e5', from: 'n4', to: 'n6' },
        { id: 'e6', from: 'n5', to: 'n7' },
        { id: 'e7', from: 'n6', to: 'n7' },
        { id: 'e8', from: 'n7', to: 'n8' },
        { id: 'e9', from: 'n8', to: 'n9' },
      ],
    },

    order_confirmation: {
      key: 'order_confirmation',
      name: 'Order Confirmation',
      description: 'Auto-confirm new orders with details',
      trigger: { type: 'trigger_order', event: 'created' },
      nodes: [
        {
          id: 'n1', type: 'trigger_order', label: 'New Order',
          x: 300, y: 50,
          config: { event: 'created' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_text', label: 'Confirmation Message',
          x: 300, y: 200,
          config: { message: '✅ *Order Confirmed!*\n\n📋 Order: #{{order_number}}\n💰 Total: ₹{{order_total}}\n📅 Date: {{order_date}}\n\nYour order is being processed. We\'ll notify you when it ships!\n\n📦 Track: Reply *track {{order_number}}*\n❌ Cancel: Reply *cancel {{order_number}}*' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'tag_customer', label: 'Tag as Buyer',
          x: 300, y: 380,
          config: { action: 'add', tag: 'buyer' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
      ],
    },

    order_shipped: {
      key: 'order_shipped',
      name: 'Order Shipped Notification',
      description: 'Notify customer when order is shipped',
      trigger: { type: 'trigger_order', event: 'confirmed' },
      nodes: [
        {
          id: 'n1', type: 'trigger_order', label: 'Order Confirmed/Shipped',
          x: 300, y: 50,
          config: { event: 'confirmed' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Shipping Notification',
          x: 300, y: 200,
          config: {
            message: '🚚 *Your order is on the way!*\n\nOrder: #{{order_number}}\nExpected delivery: 2-5 business days\n\nWe\'ll send updates as your order progresses.',
            buttons: [
              { id: 'track', title: '📍 Track Order' },
              { id: 'help', title: '💬 Need Help' },
            ],
          },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
      ],
    },

    delivery_tracking: {
      key: 'delivery_tracking',
      name: 'Delivery Tracking Updates',
      description: 'Send delivery status updates',
      trigger: { type: 'trigger_message', keywords: 'track,tracking,where is my order,status,delivery', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Track Request',
          x: 300, y: 50,
          config: { keywords: 'track,tracking,where is my order,status,delivery', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_text', label: 'Ask Order Number',
          x: 300, y: 200,
          config: { message: '📦 *Order Tracking*\n\nPlease share your order number to check the status.\n\nExample: *ORD-12345*\n\nOr type *my orders* to see all your recent orders.' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'wait_for_reply', label: 'Wait for Order #',
          x: 300, y: 370,
          config: { timeoutMinutes: 5, timeoutMessage: 'No worries! Type *track* anytime to check your order.' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'send_text', label: 'Order Status',
          x: 150, y: 540,
          config: { message: '📍 *Order Status Update*\n\nWe\'re looking up your order... A team member will share the latest status shortly.\n\nYou\'ll receive automatic updates as your order progresses!' },
          outputs: [],
        },
        {
          id: 'n5', type: 'send_text', label: 'Timeout',
          x: 450, y: 540,
          config: { message: 'No worries! You can check your order status anytime by typing *track* followed by your order number.' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Replied', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Timeout', condition: 'false' },
      ],
    },

    order_cancellation: {
      key: 'order_cancellation',
      name: 'Order Cancellation Handler',
      description: 'Handle order cancellation with reason collection',
      trigger: { type: 'trigger_message', keywords: 'cancel,cancel order,cancellation', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Cancel Request',
          x: 300, y: 50,
          config: { keywords: 'cancel,cancel order,cancellation', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_list', label: 'Cancel Reason',
          x: 300, y: 200,
          config: {
            message: '😔 *Order Cancellation*\n\nWe\'re sorry to see you cancel. Could you tell us why?',
            buttonText: 'Select Reason',
            sections: [{ title: 'Cancellation Reason', rows: [
              { id: 'wrong_item', title: 'Ordered Wrong Item', description: 'I ordered the wrong product' },
              { id: 'found_cheaper', title: 'Found Cheaper', description: 'Found better price elsewhere' },
              { id: 'too_late', title: 'Delivery Too Late', description: 'Delivery time is too long' },
              { id: 'changed_mind', title: 'Changed My Mind', description: 'No longer need the item' },
              { id: 'other', title: 'Other Reason', description: 'Different reason' },
            ]}],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'update_order', label: 'Cancel Order',
          x: 300, y: 400,
          config: { status: 'cancelled' },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'send_text', label: 'Confirm Cancel',
          x: 300, y: 560,
          config: { message: '✅ *Order Cancelled*\n\nYour order has been cancelled. If you paid online, the refund will be processed within 5-7 business days.\n\nWe hope to serve you again! Type *menu* to browse our products.' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
      ],
    },

    abandoned_cart: {
      key: 'abandoned_cart',
      name: 'Abandoned Cart Recovery',
      description: 'Recover abandoned carts with timed reminder',
      trigger: { type: 'trigger_message', keywords: 'cart,checkout', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Cart Activity',
          x: 300, y: 50,
          config: { keywords: 'cart,checkout', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'delay', label: 'Wait 1 Hour',
          x: 300, y: 200,
          config: { duration: 1, unit: 'hours' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'send_buttons', label: 'Cart Reminder',
          x: 300, y: 360,
          config: {
            message: '🛒 *Your cart is waiting!*\n\nYou left some items in your cart. Complete your purchase before they sell out!',
            buttons: [
              { id: 'checkout_now', title: '✅ Checkout Now' },
              { id: 'view_cart', title: '👀 View Cart' },
              { id: 'clear', title: '🗑️ Clear Cart' },
            ],
          },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'condition', label: 'Wants Checkout?',
          x: 300, y: 540,
          config: { variable: 'button_reply', operator: 'eq', value: 'checkout_now' },
          outputs: ['n5', 'n6'],
        },
        {
          id: 'n5', type: 'checkout', label: 'Quick Checkout',
          x: 120, y: 710,
          config: { requireAddress: true, paymentMethod: 'choice' },
          outputs: [],
        },
        {
          id: 'n6', type: 'send_text', label: 'Cart Saved',
          x: 480, y: 710,
          config: { message: 'No worries! Your cart is saved. Type *cart* anytime to come back to it. 😊' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5', label: 'Checkout', condition: 'true' },
        { id: 'e5', from: 'n4', to: 'n6', label: 'Other', condition: 'false' },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PAYMENTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    payment_confirmation: {
      key: 'payment_confirmation',
      name: 'Payment Confirmation',
      description: 'Confirm payment received and update order',
      trigger: { type: 'trigger_payment', event: 'verified' },
      nodes: [
        {
          id: 'n1', type: 'trigger_payment', label: 'Payment Verified',
          x: 300, y: 50,
          config: { event: 'verified' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_text', label: 'Payment Confirmed',
          x: 300, y: 200,
          config: { message: '✅ *Payment Received!*\n\n💰 Amount: ₹{{payment_amount}}\n📋 Order: #{{order_number}}\n🔖 Transaction ID: {{transaction_id}}\n\nYour order is now being prepared. We\'ll notify you when it ships! 📦' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'update_order', label: 'Confirm Order',
          x: 300, y: 380,
          config: { status: 'confirmed' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
      ],
    },

    payment_reminder: {
      key: 'payment_reminder',
      name: 'Payment Reminder',
      description: 'Remind about pending payments',
      trigger: { type: 'trigger_payment', event: 'expired' },
      nodes: [
        {
          id: 'n1', type: 'trigger_payment', label: 'Payment Pending',
          x: 300, y: 50,
          config: { event: 'expired' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Payment Reminder',
          x: 300, y: 200,
          config: {
            message: '💳 *Payment Reminder*\n\nYour payment of ₹{{order_total}} for order #{{order_number}} is pending.\n\nPlease complete payment to avoid cancellation.',
            buttons: [
              { id: 'pay_now', title: '💰 Pay Now' },
              { id: 'need_help', title: '❓ Need Help' },
              { id: 'cancel', title: '❌ Cancel Order' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'condition', label: 'Wants to Pay?',
          x: 300, y: 400,
          config: { variable: 'button_reply', operator: 'eq', value: 'pay_now' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'payment_qr', label: 'Send QR',
          x: 120, y: 570,
          config: { expiryMinutes: 30, reminderEnabled: true },
          outputs: [],
        },
        {
          id: 'n5', type: 'assign_agent', label: 'Route to Agent',
          x: 480, y: 570,
          config: { assignTo: 'any', message: 'Connecting you with our team to assist with your payment...' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Pay', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Help/Cancel', condition: 'false' },
      ],
    },

    cod_confirmation: {
      key: 'cod_confirmation',
      name: 'COD Order Confirmation',
      description: 'Confirm Cash on Delivery orders',
      trigger: { type: 'trigger_order', event: 'created' },
      nodes: [
        {
          id: 'n1', type: 'trigger_order', label: 'COD Order Created',
          x: 300, y: 50,
          config: { event: 'created' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'COD Confirmation',
          x: 300, y: 200,
          config: {
            message: '📦 *Cash on Delivery Order*\n\nOrder: #{{order_number}}\nTotal: ₹{{order_total}}\nPayment: Cash on Delivery 💵\n\nPlease keep exact change ready at the time of delivery.\n\n*Do you confirm this order?*',
            buttons: [
              { id: 'confirm', title: '✅ Confirm Order' },
              { id: 'cancel', title: '❌ Cancel' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'condition', label: 'Confirmed?',
          x: 300, y: 400,
          config: { variable: 'button_reply', operator: 'eq', value: 'confirm' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'send_text', label: 'Order Confirmed',
          x: 120, y: 570,
          config: { message: '✅ *COD Order Confirmed!*\n\nYour order #{{order_number}} will be delivered soon. Keep ₹{{order_total}} ready.\n\nTrack: type *track {{order_number}}*' },
          outputs: [],
        },
        {
          id: 'n5', type: 'update_order', label: 'Cancel Order',
          x: 480, y: 570,
          config: { status: 'cancelled' },
          outputs: ['n6'],
        },
        {
          id: 'n6', type: 'send_text', label: 'Cancelled',
          x: 480, y: 730,
          config: { message: '❌ Order cancelled. Type *menu* to browse again.' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Yes', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'No', condition: 'false' },
        { id: 'e5', from: 'n5', to: 'n6' },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // E-COMMERCE JOURNEY — full lifecycle, event-triggered, modern nodes
    // Each step fires automatically on the matching order/payment event:
    //   created → preparing(processing) → ready/out_for_delivery → delivered
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    ecom_order_received: {
      key: 'ecom_order_received',
      name: '🧾 Order Received (Auto)',
      description: 'Fires the moment an order is placed — sends a polished receipt with Track & Keep Shopping buttons and tags the buyer.',
      trigger: { type: 'trigger_order', event: 'created' },
      nodes: [
        { id: 'n1', type: 'trigger_order', label: 'Order Placed', x: 340, y: 40, config: { event: 'created' }, outputs: ['n2'] },
        {
          id: 'n2', type: 'send_buttons', label: 'Receipt', x: 340, y: 200,
          config: {
            message: 'Thank you for your order, {{customer_name}}! 🎉\n\n🧾 *Order #{{order_number}}*\n💰 Total: {{currency}}{{order_total}}\n\nWe’ve received it and will start preparing it right away. You’ll get live updates here. 👇',
            buttons: [
              { id: 'track', title: '🚚 Track Order' },
              { id: 'shop', title: '🛍️ Keep Shopping' },
            ],
          },
          outputs: ['n3', 'n4', 'n5'],
        },
        { id: 'n3', type: 'switch', label: 'Route', x: 340, y: 400, config: { variable: 'button_reply' }, outputs: ['n4', 'n5'] },
        { id: 'n4', type: 'send_text', label: 'How to Track', x: 160, y: 580, config: { message: '🚚 Just send *track {{order_number}}* anytime — or type *my orders* to see everything in one place.' }, outputs: [] },
        { id: 'n5', type: 'send_text', label: 'Keep Shopping', x: 520, y: 580, config: { message: '🛍️ Type *menu* anytime to browse our catalog, manage your cart and checkout in one place!' }, outputs: [] },
        { id: 'n6', type: 'tag_customer', label: 'Tag Buyer', x: 340, y: 580, config: { action: 'add', tag: 'buyer' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n6' },
        { id: 'e3', from: 'n2', to: 'n3' },
        { id: 'e4', from: 'n3', to: 'n4', label: 'Track', condition: 'track' },
        { id: 'e5', from: 'n3', to: 'n5', label: 'Shop', condition: 'shop' },
      ],
    },

    ecom_payment_success: {
      key: 'ecom_payment_success',
      name: '✅ Payment Success → Preparing (Auto)',
      description: 'Fires when a payment is verified — confirms receipt and automatically moves the order into “preparing”.',
      trigger: { type: 'trigger_payment', event: 'verified' },
      nodes: [
        { id: 'n1', type: 'trigger_payment', label: 'Payment Verified', x: 300, y: 40, config: { event: 'verified' }, outputs: ['n2'] },
        {
          id: 'n2', type: 'send_text', label: 'Payment Confirmed', x: 300, y: 200,
          config: { message: '✅ *Payment received!* 🎉\n\n💰 Amount: {{currency}}{{payment_amount}}\n🧾 Order #{{order_number}}\n\nYour order is now being prepared. We’ll let you know the moment it’s on the way. 🚚' },
          outputs: ['n3'],
        },
        { id: 'n3', type: 'update_order', label: 'Mark Preparing', x: 300, y: 380, config: { status: 'processing' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
      ],
    },

    ecom_being_prepared: {
      key: 'ecom_being_prepared',
      name: '👨‍🍳 Order Being Prepared (Auto)',
      description: 'Fires when an order moves to “processing” — reassures the customer that their order is being packed.',
      trigger: { type: 'trigger_order', event: 'processing' },
      nodes: [
        { id: 'n1', type: 'trigger_order', label: 'Status → Processing', x: 300, y: 40, config: { event: 'processing' }, outputs: ['n2'] },
        {
          id: 'n2', type: 'send_text', label: 'Being Prepared', x: 300, y: 200,
          config: { message: '👨‍🍳 *Good news!* Order #{{order_number}} is now being prepared and packed with care. 📦\n\nWe’ll message you the moment it’s out for delivery.' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
      ],
    },

    ecom_out_for_delivery: {
      key: 'ecom_out_for_delivery',
      name: '🚚 Out for Delivery (Auto)',
      description: 'Fires when an order is out for delivery — notifies the customer with a Track button.',
      trigger: { type: 'trigger_order', event: 'out_for_delivery' },
      nodes: [
        { id: 'n1', type: 'trigger_order', label: 'Out for Delivery', x: 300, y: 40, config: { event: 'out_for_delivery' }, outputs: ['n2'] },
        {
          id: 'n2', type: 'send_buttons', label: 'On the Way', x: 300, y: 200,
          config: {
            message: '🚚 *Your order is on the way!*\n\n🧾 Order #{{order_number}} is out for delivery and will reach you shortly.\n\nPlease keep your phone handy. 📱',
            buttons: [
              { id: 'track', title: '📍 Track' },
              { id: 'help', title: '💬 Need Help' },
            ],
          },
          outputs: ['n3'],
        },
        { id: 'n3', type: 'switch', label: 'Route', x: 300, y: 400, config: { variable: 'button_reply' }, outputs: ['n4', 'n5'] },
        { id: 'n4', type: 'send_text', label: 'Tracking Info', x: 140, y: 580, config: { message: '📍 Your order is out for delivery now and arriving soon. Sit tight! 🙌' }, outputs: [] },
        { id: 'n5', type: 'send_text', label: 'Help', x: 460, y: 580, config: { message: '💬 No problem — reply here with your question and our team will assist you right away.' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Track', condition: 'track' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Help', condition: 'help' },
      ],
    },

    ecom_delivered_feedback: {
      key: 'ecom_delivered_feedback',
      name: '🎉 Delivered + Rating (Auto)',
      description: 'Fires on delivery — thanks the customer, asks for a quick rating, then tags happy/unhappy and routes unhappy customers to support.',
      trigger: { type: 'trigger_order', event: 'delivered' },
      nodes: [
        { id: 'n1', type: 'trigger_order', label: 'Order Delivered', x: 340, y: 40, config: { event: 'delivered' }, outputs: ['n2'] },
        {
          id: 'n2', type: 'send_buttons', label: 'Ask Rating', x: 340, y: 200,
          config: {
            message: '🎉 *Delivered!* Order #{{order_number}} has reached you.\n\nWe’d love your feedback — how was your experience? 🙏',
            buttons: [
              { id: 'rate_good', title: '😍 Loved it' },
              { id: 'rate_ok', title: '🙂 It was ok' },
              { id: 'rate_bad', title: '😞 Not great' },
            ],
          },
          outputs: ['n3'],
        },
        { id: 'n3', type: 'switch', label: 'Route Rating', x: 340, y: 400, config: { variable: 'button_reply' }, outputs: ['n4', 'n5', 'n6'] },
        { id: 'n4', type: 'send_text', label: 'Thank (Happy)', x: 120, y: 580, config: { message: '🌟 That makes our day! Thank you so much.\n\nIf you have a minute, a quick review really helps us. ❤️\n\nType *menu* to shop again!' }, outputs: ['n7'] },
        { id: 'n7', type: 'tag_customer', label: 'Tag Happy', x: 120, y: 740, config: { action: 'add', tag: 'happy_customer' }, outputs: [] },
        { id: 'n5', type: 'send_text', label: 'Thank (Neutral)', x: 340, y: 580, config: { message: '🙏 Thanks for the honest feedback! We’re always improving.\n\nType *menu* whenever you’d like to order again.' }, outputs: [] },
        { id: 'n6', type: 'send_text', label: 'Apologise', x: 560, y: 580, config: { message: '😔 We’re sorry it wasn’t great. Please tell us what went wrong — our team will make it right.' }, outputs: ['n8', 'n9'] },
        { id: 'n8', type: 'assign_agent', label: 'Route to Support', x: 560, y: 740, config: { assignTo: 'any', message: 'Connecting you with our team to resolve this…' }, outputs: [] },
        { id: 'n9', type: 'tag_customer', label: 'Tag Needs Care', x: 760, y: 740, config: { action: 'add', tag: 'needs_followup' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Loved', condition: 'rate_good' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Ok', condition: 'rate_ok' },
        { id: 'e5', from: 'n3', to: 'n6', label: 'Not great', condition: 'rate_bad' },
        { id: 'e6', from: 'n4', to: 'n7' },
        { id: 'e7', from: 'n6', to: 'n8' },
        { id: 'e8', from: 'n6', to: 'n9' },
      ],
    },

    ecom_order_cancelled: {
      key: 'ecom_order_cancelled',
      name: '❌ Order Cancelled (Auto)',
      description: 'Fires when an order is cancelled — sends an empathetic note and offers to shop again or talk to the team.',
      trigger: { type: 'trigger_order', event: 'cancelled' },
      nodes: [
        { id: 'n1', type: 'trigger_order', label: 'Order Cancelled', x: 300, y: 40, config: { event: 'cancelled' }, outputs: ['n2'] },
        {
          id: 'n2', type: 'send_buttons', label: 'Cancellation Note', x: 300, y: 200,
          config: {
            message: 'Your order #{{order_number}} has been cancelled. ❌\n\nIf this wasn’t expected or you paid online, our team will help sort out any refund. We’re here for you. 🙏',
            buttons: [
              { id: 'shop', title: '🛍️ Shop Again' },
              { id: 'support', title: '💬 Talk to Us' },
            ],
          },
          outputs: ['n3'],
        },
        { id: 'n3', type: 'switch', label: 'Route', x: 300, y: 400, config: { variable: 'button_reply' }, outputs: ['n4', 'n5'] },
        { id: 'n4', type: 'send_text', label: 'Shop Again', x: 140, y: 580, config: { message: '🛍️ Type *menu* to browse again — we’d love to have you back!' }, outputs: [] },
        { id: 'n5', type: 'assign_agent', label: 'Support', x: 460, y: 580, config: { assignTo: 'any', message: 'Connecting you with our team about your cancelled order…' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Shop', condition: 'shop' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Support', condition: 'support' },
      ],
    },

    ecom_track_my_order: {
      key: 'ecom_track_my_order',
      name: '📍 Track My Order',
      description: 'Customer types “track / where is my order” → asks for the order number → shows a live status progress bar.',
      trigger: { type: 'trigger_message', keywords: 'track,tracking,where is my order,order status,status', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Track Request', x: 300, y: 40, config: { keywords: 'track,tracking,where is my order,order status,status', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'send_text', label: 'Ask Order No.', x: 300, y: 200, config: { message: '📍 *Track your order*\n\nPlease send your *order number* (e.g. ORD-AB12CD).\n\nOr type *my orders* to pick from your recent orders.' }, outputs: ['n3'] },
        { id: 'n3', type: 'wait_for_reply', label: 'Wait for Order No.', x: 300, y: 360, config: { timeoutMinutes: 10, timeoutMessage: 'No problem — type *track* anytime to check your order. 🙂' }, outputs: ['n4'] },
        { id: 'n4', type: 'track_order', label: 'Show Status', x: 300, y: 520, config: {}, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Reply' },
      ],
    },

    ecom_my_orders: {
      key: 'ecom_my_orders',
      name: '📦 My Orders',
      description: 'Customer types “my orders / orders” → lists their recent orders with status, then offers to track or shop more.',
      trigger: { type: 'trigger_message', keywords: 'my orders,orders,order history,my order', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'My Orders Request', x: 300, y: 40, config: { keywords: 'my orders,orders,order history,my order', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'my_orders', label: 'List Orders', x: 300, y: 200, config: { header: '📦 *Your Recent Orders*', maxOrders: 5, emptyMessage: 'You have no orders yet. 🛍️ Send *menu* to start shopping!' }, outputs: ['n3'] },
        {
          id: 'n3', type: 'send_buttons', label: 'Next Step', x: 300, y: 380,
          config: {
            message: 'What would you like to do next?',
            buttons: [
              { id: 'track', title: '📍 Track an Order' },
              { id: 'shop', title: '🛍️ Shop More' },
            ],
          },
          outputs: ['n4', 'n5'],
        },
        { id: 'n4', type: 'send_text', label: 'How to Track', x: 140, y: 560, config: { message: '📍 Send *track* followed by your order number to see its live status.' }, outputs: [] },
        { id: 'n5', type: 'send_text', label: 'Shop More', x: 460, y: 560, config: { message: '🛍️ Type *menu* to open the full store — browse, add to cart and checkout!' }, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Track', condition: 'track' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Shop', condition: 'shop' },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // QUOTES & INVOICES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    quote_creation: {
      key: 'quote_creation',
      name: 'Quote Creation & Sending',
      description: 'Auto-send quotes with accept/reject via WhatsApp',
      trigger: { type: 'trigger_quote', event: 'created' },
      nodes: [
        {
          id: 'n1', type: 'trigger_quote', label: 'Quote Created',
          x: 300, y: 50,
          config: { event: 'created' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_quote', label: 'Send Quote',
          x: 300, y: 200,
          config: {
            quoteId: '',
            headerMessage: 'Hi {{customer_name}}, here\'s your quotation:',
            footerMessage: 'This quote is valid for 7 days.\n\nReply *accept* to confirm or *reject* to decline.',
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'update_quote', label: 'Mark as Sent',
          x: 300, y: 380,
          config: { quoteId: '', status: 'sent' },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'send_text', label: 'Sent Confirmation',
          x: 300, y: 530,
          config: { message: '📩 Quote #{{quote_number}} has been sent to the customer.\n\nYou\'ll be notified when they respond.' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
      ],
    },

    quote_followup: {
      key: 'quote_followup',
      name: 'Quote Follow-up',
      description: 'Follow up on pending quotes after 24h',
      trigger: { type: 'trigger_quote', event: 'sent' },
      nodes: [
        {
          id: 'n1', type: 'trigger_quote', label: 'Quote Sent',
          x: 300, y: 50,
          config: { event: 'sent' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'delay', label: 'Wait 24 Hours',
          x: 300, y: 200,
          config: { duration: 24, unit: 'hours' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'send_buttons', label: 'Follow-up Message',
          x: 300, y: 370,
          config: {
            message: '👋 Hi {{customer_name}},\n\nJust checking in on Quote #{{quote_number}} we sent yesterday.\n\nDo you have any questions or would you like to proceed?',
            buttons: [
              { id: 'accept', title: '✅ Accept Quote' },
              { id: 'questions', title: '❓ I Have Questions' },
              { id: 'decline', title: '❌ Decline' },
            ],
          },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'condition', label: 'Check Response',
          x: 300, y: 560,
          config: { variable: 'button_reply', operator: 'eq', value: 'accept' },
          outputs: ['n5', 'n6'],
        },
        {
          id: 'n5', type: 'update_quote', label: 'Accept Quote',
          x: 120, y: 730,
          config: { quoteId: '', status: 'accepted' },
          outputs: ['n7'],
        },
        {
          id: 'n6', type: 'assign_agent', label: 'Route to Sales',
          x: 480, y: 730,
          config: { assignTo: 'any', message: 'Connecting you with our sales team to help...' },
          outputs: [],
        },
        {
          id: 'n7', type: 'send_text', label: 'Accepted!',
          x: 120, y: 900,
          config: { message: '🎉 *Quote Accepted!*\n\nWe\'ll process this right away and convert it to an order. You\'ll receive a confirmation shortly!' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5', label: 'Accepted', condition: 'true' },
        { id: 'e5', from: 'n4', to: 'n6', label: 'Other', condition: 'false' },
        { id: 'e6', from: 'n5', to: 'n7' },
      ],
    },

    quote_accepted: {
      key: 'quote_accepted',
      name: 'Quote Accepted → Order',
      description: 'Convert accepted quote to order',
      trigger: { type: 'trigger_quote', event: 'accepted' },
      nodes: [
        {
          id: 'n1', type: 'trigger_quote', label: 'Quote Accepted',
          x: 300, y: 50,
          config: { event: 'accepted' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_text', label: 'Confirmation',
          x: 300, y: 200,
          config: { message: '🎉 *Quote #{{quote_number}} Accepted!*\n\nThank you, {{customer_name}}!\n\nTotal: ₹{{quote_total}}\n\nWe\'re converting this to an order. You\'ll receive payment details shortly.' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'update_quote', label: 'Convert to Order',
          x: 300, y: 380,
          config: { quoteId: '', status: 'converted' },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'payment_qr', label: 'Send Payment',
          x: 300, y: 540,
          config: { expiryMinutes: 60, reminderEnabled: true },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PRODUCTS & CATALOG
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    product_inquiry: {
      key: 'product_inquiry',
      name: 'Product Inquiry Handler',
      description: 'Handle product questions and catalog browsing',
      trigger: { type: 'trigger_message', keywords: 'product,products,catalog,price,available,stock,details', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Product Question',
          x: 300, y: 50,
          config: { keywords: 'product,products,catalog,price,available,stock,details', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Browse Options',
          x: 300, y: 200,
          config: {
            message: '🛍️ *Our Products*\n\nHow would you like to explore?',
            buttons: [
              { id: 'browse_all', title: '📋 Browse All' },
              { id: 'search', title: '🔍 Search' },
              { id: 'popular', title: '🔥 Best Sellers' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'condition', label: 'Search?',
          x: 300, y: 380,
          config: { variable: 'button_reply', operator: 'eq', value: 'search' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'send_text', label: 'Search Prompt',
          x: 120, y: 540,
          config: { message: '🔍 Type the product name you\'re looking for:' },
          outputs: ['n6'],
        },
        {
          id: 'n5', type: 'show_catalog', label: 'Show All',
          x: 480, y: 540,
          config: { categoryFilter: '', maxProducts: 10, sortBy: 'popular' },
          outputs: [],
        },
        {
          id: 'n6', type: 'search_products', label: 'Search',
          x: 120, y: 700,
          config: { noResultsMessage: 'No products found. Try a different keyword or browse our full catalog!', maxResults: 5 },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Search', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Browse', condition: 'false' },
        { id: 'e5', from: 'n4', to: 'n6' },
      ],
    },

    back_in_stock: {
      key: 'back_in_stock',
      name: 'Back in Stock Notification',
      description: 'Notify when out-of-stock items are available',
      trigger: { type: 'trigger_schedule', cron: '0 9 * * *' },
      nodes: [
        {
          id: 'n1', type: 'trigger_schedule', label: 'Daily Check',
          x: 300, y: 50,
          config: { schedule: 'daily', time: '09:00' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Back in Stock Alert',
          x: 300, y: 200,
          config: {
            message: '🔔 *Back in Stock!*\n\nGreat news! Items you were interested in are back in stock. Get them before they sell out again!',
            buttons: [
              { id: 'view', title: '👀 View Items' },
              { id: 'buy', title: '🛒 Buy Now' },
              { id: 'later', title: '⏰ Remind Later' },
            ],
          },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
      ],
    },

    price_list: {
      key: 'price_list',
      name: 'Price List / Menu Sharing',
      description: 'Share product price list or menu',
      trigger: { type: 'trigger_message', keywords: 'price,prices,price list,menu,rate,rates,charges', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Price Request',
          x: 300, y: 50,
          config: { keywords: 'price,prices,price list,menu,rate,rates,charges', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'show_catalog', label: 'Show Price List',
          x: 300, y: 200,
          config: { categoryFilter: '', maxProducts: 20, sortBy: 'price_asc' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'send_buttons', label: 'Next Steps',
          x: 300, y: 380,
          config: {
            message: '💰 Here\'s our latest pricing! Would you like to:',
            buttons: [
              { id: 'order', title: '🛒 Place Order' },
              { id: 'quote', title: '📝 Get Quote' },
              { id: 'more', title: '📞 Contact Us' },
            ],
          },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // APPOINTMENTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    appointment_booking: {
      key: 'appointment_booking',
      name: 'Appointment Booking',
      description: 'Book appointments via WhatsApp',
      trigger: { type: 'trigger_message', keywords: 'book,appointment,schedule,reserve,slot,booking', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Booking Request',
          x: 300, y: 50,
          config: { keywords: 'book,appointment,schedule,reserve,slot,booking', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_list', label: 'Select Service',
          x: 300, y: 200,
          config: {
            message: '📅 *Book an Appointment*\n\nSelect the service you\'d like to book:',
            buttonText: 'View Services',
            sections: [{ title: 'Our Services', rows: [
              { id: 'consultation', title: 'Consultation', description: 'Initial consultation / meeting' },
              { id: 'service', title: 'Regular Service', description: 'Standard service appointment' },
              { id: 'premium', title: 'Premium Service', description: 'Premium / extended service' },
              { id: 'followup', title: 'Follow-up Visit', description: 'Follow-up on previous visit' },
            ]}],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'send_text', label: 'Collect Details',
          x: 300, y: 400,
          config: { message: '📝 Please share the following details:\n\n1️⃣ *Your Name*\n2️⃣ *Preferred Date* (e.g., Monday, 15th Jan)\n3️⃣ *Preferred Time* (e.g., 10 AM, 3:30 PM)\n\nFormat: Name, Date, Time' },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'wait_for_reply', label: 'Wait for Details',
          x: 300, y: 570,
          config: { timeoutMinutes: 10, timeoutMessage: 'Still there? Send your booking details or type *book* to restart.' },
          outputs: ['n5', 'n6'],
        },
        {
          id: 'n5', type: 'send_buttons', label: 'Confirm Booking',
          x: 150, y: 740,
          config: {
            message: '✅ *Booking Summary*\n\nWe\'ve noted your appointment request. Please confirm:',
            buttons: [
              { id: 'confirm', title: '✅ Confirm Booking' },
              { id: 'change', title: '✏️ Change Details' },
              { id: 'cancel', title: '❌ Cancel' },
            ],
          },
          outputs: ['n7'],
        },
        {
          id: 'n6', type: 'send_text', label: 'Timeout',
          x: 450, y: 740,
          config: { message: 'No worries! Type *book* whenever you\'re ready to schedule your appointment.' },
          outputs: [],
        },
        {
          id: 'n7', type: 'send_text', label: 'Booking Confirmed',
          x: 150, y: 920,
          config: { message: '🎉 *Appointment Booked!*\n\nYou\'ll receive a reminder before your appointment.\n\nTo reschedule: type *reschedule*\nTo cancel: type *cancel appointment*' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5', label: 'Replied', condition: 'true' },
        { id: 'e5', from: 'n4', to: 'n6', label: 'Timeout', condition: 'false' },
        { id: 'e6', from: 'n5', to: 'n7' },
      ],
    },

    appointment_reminder: {
      key: 'appointment_reminder',
      name: 'Appointment Reminder',
      description: 'Send reminders before scheduled appointments',
      trigger: { type: 'trigger_schedule', cron: '0 8 * * *' },
      nodes: [
        {
          id: 'n1', type: 'trigger_schedule', label: 'Daily at 8 AM',
          x: 300, y: 50,
          config: { schedule: 'daily', time: '08:00' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Reminder',
          x: 300, y: 200,
          config: {
            message: '⏰ *Appointment Reminder*\n\nHi {{customer_name}}, you have an appointment scheduled for today.\n\nPlease confirm your attendance:',
            buttons: [
              { id: 'confirm', title: '✅ I\'ll Be There' },
              { id: 'reschedule', title: '📅 Reschedule' },
              { id: 'cancel', title: '❌ Cancel' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'condition', label: 'Confirmed?',
          x: 300, y: 400,
          config: { variable: 'button_reply', operator: 'eq', value: 'confirm' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'send_text', label: 'Confirmed',
          x: 120, y: 560,
          config: { message: '✅ Great! We\'ll see you at your scheduled time. If anything changes, just let us know.' },
          outputs: [],
        },
        {
          id: 'n5', type: 'send_text', label: 'Reschedule/Cancel',
          x: 480, y: 560,
          config: { message: 'No problem! Please share your preferred new date and time, or a team member will assist you shortly.' },
          outputs: ['n6'],
        },
        {
          id: 'n6', type: 'assign_agent', label: 'Assign Agent',
          x: 480, y: 720,
          config: { assignTo: 'any', message: 'Connecting you with our team...' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Yes', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'No', condition: 'false' },
        { id: 'e5', from: 'n5', to: 'n6' },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CUSTOMER SUPPORT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    customer_support: {
      key: 'customer_support',
      name: 'Customer Support Bot',
      description: 'Route support inquiries with agent handoff',
      trigger: { type: 'trigger_message', keywords: 'help,support,issue,problem,complaint,talk,agent,human', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Support Request',
          x: 300, y: 50,
          config: { keywords: 'help,support,issue,problem,complaint,talk,agent,human', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_list', label: 'Support Menu',
          x: 300, y: 200,
          config: {
            message: '🤝 *Customer Support*\n\nHow can we help you today?',
            buttonText: 'Select Issue',
            sections: [{ title: 'Support Categories', rows: [
              { id: 'order_issue', title: 'Order Issue', description: 'Problem with existing order' },
              { id: 'product_q', title: 'Product Question', description: 'Questions about products' },
              { id: 'payment_issue', title: 'Payment Issue', description: 'Payment related problem' },
              { id: 'return', title: 'Return / Refund', description: 'Return or refund request' },
              { id: 'other', title: 'Other', description: 'Something else' },
            ]}],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'send_text', label: 'Describe Issue',
          x: 300, y: 400,
          config: { message: 'Thanks! Please describe your issue in detail so we can help you better.\n\nInclude any relevant order numbers or product names.' },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'wait_for_reply', label: 'Wait for Description',
          x: 300, y: 570,
          config: { timeoutMinutes: 15, timeoutMessage: 'Still need help? Send your question anytime!' },
          outputs: ['n5', 'n6'],
        },
        {
          id: 'n5', type: 'assign_agent', label: 'Assign Agent',
          x: 150, y: 740,
          config: { assignTo: 'any', message: '✅ Got it! Connecting you with a support agent who can help...\n\nPlease hold on for a moment.' },
          outputs: ['n7'],
        },
        {
          id: 'n6', type: 'send_text', label: 'Timeout',
          x: 450, y: 740,
          config: { message: 'If you still need help, type *support* anytime. We\'re here for you!' },
          outputs: [],
        },
        {
          id: 'n7', type: 'tag_customer', label: 'Tag Support',
          x: 150, y: 900,
          config: { action: 'add', tag: 'needs-support' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5', label: 'Replied', condition: 'true' },
        { id: 'e5', from: 'n4', to: 'n6', label: 'Timeout', condition: 'false' },
        { id: 'e6', from: 'n5', to: 'n7' },
      ],
    },

    complaint_resolution: {
      key: 'complaint_resolution',
      name: 'Complaint Resolution',
      description: 'Handle complaints with priority routing',
      trigger: { type: 'trigger_message', keywords: 'complaint,unhappy,disappointed,terrible,worst,bad experience,not satisfied', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Complaint Detected',
          x: 300, y: 50,
          config: { keywords: 'complaint,unhappy,disappointed,terrible,worst,bad experience,not satisfied', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_text', label: 'Acknowledge',
          x: 300, y: 200,
          config: { message: '😔 We\'re really sorry to hear about your experience. Your satisfaction matters to us.\n\nPlease describe what happened and we\'ll prioritize resolving this for you right away.' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'wait_for_reply', label: 'Wait for Details',
          x: 300, y: 370,
          config: { timeoutMinutes: 30, timeoutMessage: 'We\'re here whenever you\'re ready to share. Type your concern and we\'ll address it.' },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'tag_customer', label: 'Tag Complaint',
          x: 300, y: 540,
          config: { action: 'add', tag: 'complaint-priority' },
          outputs: ['n5'],
        },
        {
          id: 'n5', type: 'assign_agent', label: 'Priority Assignment',
          x: 300, y: 700,
          config: { assignTo: 'any', message: '🚨 Your complaint has been escalated to our senior team. Someone will respond within the next 30 minutes.\n\nComplaint ref: #CMP-{{timestamp}}' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5' },
      ],
    },

    return_refund: {
      key: 'return_refund',
      name: 'Return & Refund Processing',
      description: 'Handle return requests with reason collection',
      trigger: { type: 'trigger_message', keywords: 'return,refund,exchange,replace,damaged,wrong item,broken', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Return Request',
          x: 300, y: 50,
          config: { keywords: 'return,refund,exchange,replace,damaged,wrong item,broken', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_list', label: 'Return Reason',
          x: 300, y: 200,
          config: {
            message: '📦 *Return / Refund Request*\n\nPlease share your order number and select the reason:',
            buttonText: 'Select Reason',
            sections: [{ title: 'Return Reason', rows: [
              { id: 'damaged', title: 'Damaged / Defective', description: 'Product arrived damaged' },
              { id: 'wrong_item', title: 'Wrong Item Received', description: 'Got a different product' },
              { id: 'not_as_desc', title: 'Not as Described', description: 'Product differs from listing' },
              { id: 'size_issue', title: 'Size / Fit Issue', description: 'Wrong size or doesn\'t fit' },
              { id: 'changed_mind', title: 'Changed My Mind', description: 'No longer want the item' },
            ]}],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'send_text', label: 'Collect Evidence',
          x: 300, y: 400,
          config: { message: '📸 Please send a photo of the product and your order number so we can process your request quickly.\n\nOur return policy:\n• Returns within 7 days of delivery\n• Item must be in original condition\n• Refund processed in 5-7 business days' },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'wait_for_reply', label: 'Wait for Photo',
          x: 300, y: 570,
          config: { timeoutMinutes: 60, timeoutMessage: 'Please share a photo when ready. Type *return* to restart.' },
          outputs: ['n5'],
        },
        {
          id: 'n5', type: 'send_text', label: 'Request Acknowledged',
          x: 300, y: 740,
          config: { message: '✅ *Return Request Received*\n\nWe\'ve logged your return request. Our team will review it and respond within 24 hours with next steps.\n\nYou\'ll receive pickup details or refund confirmation shortly.' },
          outputs: ['n6'],
        },
        {
          id: 'n6', type: 'assign_agent', label: 'Assign to Returns',
          x: 300, y: 900,
          config: { assignTo: 'any', message: 'Your request has been assigned to our returns team.' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5' },
        { id: 'e5', from: 'n5', to: 'n6' },
      ],
    },

    warranty_service: {
      key: 'warranty_service',
      name: 'Warranty / Service Request',
      description: 'Process warranty claims and service requests',
      trigger: { type: 'trigger_message', keywords: 'warranty,service request,repair,maintenance,claim', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Warranty Request',
          x: 300, y: 50,
          config: { keywords: 'warranty,service request,repair,maintenance,claim', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Service Type',
          x: 300, y: 200,
          config: {
            message: '🔧 *Warranty & Service*\n\nWhat do you need help with?',
            buttons: [
              { id: 'warranty', title: '🛡️ Warranty Claim' },
              { id: 'repair', title: '🔧 Repair/Service' },
              { id: 'status', title: '📋 Check Status' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'send_text', label: 'Collect Info',
          x: 300, y: 380,
          config: { message: 'Please share:\n\n1️⃣ *Product name / model*\n2️⃣ *Purchase date*\n3️⃣ *Issue description*\n4️⃣ *Invoice / receipt photo* (if available)\n\nThis helps us process your request faster.' },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'wait_for_reply', label: 'Wait for Info',
          x: 300, y: 550,
          config: { timeoutMinutes: 30, timeoutMessage: 'Send the details when ready. Type *warranty* to restart.' },
          outputs: ['n5'],
        },
        {
          id: 'n5', type: 'send_text', label: 'Ticket Created',
          x: 300, y: 720,
          config: { message: '✅ *Service Ticket Created*\n\nRef: #SVC-{{timestamp}}\n\nOur service team will review your request and contact you within 24-48 hours with a solution.\n\nType *status* anytime to check progress.' },
          outputs: ['n6'],
        },
        {
          id: 'n6', type: 'assign_agent', label: 'Assign Service',
          x: 300, y: 890,
          config: { assignTo: 'any', message: 'Assigned to service team.' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5' },
        { id: 'e5', from: 'n5', to: 'n6' },
      ],
    },

    faq_bot: {
      key: 'faq_bot',
      name: 'FAQ Bot',
      description: 'Auto-answer common questions',
      trigger: { type: 'trigger_message', keywords: 'faq,hours,location,contact,timing,address,open,close,shipping,return policy,refund policy', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'FAQ Question',
          x: 300, y: 50,
          config: { keywords: 'faq,hours,location,contact,timing,address,open,close,shipping,return policy,refund policy', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_list', label: 'FAQ Topics',
          x: 300, y: 200,
          config: {
            message: '❓ *Frequently Asked Questions*\n\nSelect a topic:',
            buttonText: 'Browse FAQs',
            sections: [{ title: 'Common Questions', rows: [
              { id: 'hours', title: '🕐 Business Hours', description: 'Opening & closing times' },
              { id: 'location', title: '📍 Location & Contact', description: 'Address & phone number' },
              { id: 'shipping', title: '🚚 Shipping & Delivery', description: 'Delivery times & charges' },
              { id: 'returns', title: '↩️ Returns & Refunds', description: 'Return & refund policy' },
              { id: 'payment', title: '💳 Payment Methods', description: 'Accepted payment options' },
              { id: 'other', title: '💬 Ask Something Else', description: 'Talk to our team' },
            ]}],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'condition', label: 'Need Agent?',
          x: 300, y: 400,
          config: { variable: 'list_reply', operator: 'eq', value: 'other' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'assign_agent', label: 'Connect Agent',
          x: 120, y: 570,
          config: { assignTo: 'any', message: 'Sure! Connecting you with our team...' },
          outputs: [],
        },
        {
          id: 'n5', type: 'send_text', label: 'FAQ Answer',
          x: 480, y: 570,
          config: { message: '📋 *Quick Answers*\n\n🕐 *Hours*: Mon-Sat 9 AM - 8 PM\n📍 *Location*: [Your Address]\n📞 *Contact*: [Your Phone]\n🚚 *Delivery*: 2-5 business days\n💳 *Payment*: UPI, Cards, COD, Net Banking\n↩️ *Returns*: 7-day return policy\n\nNeed more help? Type *support* to talk to us!' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Agent', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Auto Answer', condition: 'false' },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CUSTOMER ENGAGEMENT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    feedback_after_delivery: {
      key: 'feedback_after_delivery',
      name: 'Feedback After Delivery',
      description: 'Auto-request ratings after order delivery',
      trigger: { type: 'trigger_order', event: 'delivered' },
      nodes: [
        {
          id: 'n1', type: 'trigger_order', label: 'Order Delivered',
          x: 300, y: 50,
          config: { event: 'delivered' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'delay', label: 'Wait 3 Hours',
          x: 300, y: 200,
          config: { duration: 3, unit: 'hours' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'send_buttons', label: 'Ask Rating',
          x: 300, y: 360,
          config: {
            message: '⭐ *How was your experience?*\n\nWe\'d love to hear about your order #{{order_number}}!',
            buttons: [
              { id: 'amazing', title: '😍 Amazing!' },
              { id: 'good', title: '😊 Good' },
              { id: 'bad', title: '😞 Not Good' },
            ],
          },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'condition', label: 'Negative?',
          x: 300, y: 540,
          config: { variable: 'button_reply', operator: 'eq', value: 'bad' },
          outputs: ['n5', 'n6'],
        },
        {
          id: 'n5', type: 'send_text', label: 'Apologize',
          x: 120, y: 710,
          config: { message: 'We\'re really sorry to hear that! 😔\n\nPlease share what went wrong so we can make it right. A team member will personally follow up with you.' },
          outputs: ['n7'],
        },
        {
          id: 'n6', type: 'send_text', label: 'Thank You!',
          x: 480, y: 710,
          config: { message: 'Thank you so much for your feedback! 🎉💛\n\nYour support means the world to us. We hope to serve you again soon!\n\nShare your experience with friends and help them discover us! 😊' },
          outputs: ['n8'],
        },
        {
          id: 'n7', type: 'assign_agent', label: 'Escalate',
          x: 120, y: 880,
          config: { assignTo: 'any', message: 'Connecting you with our team...' },
          outputs: [],
        },
        {
          id: 'n8', type: 'tag_customer', label: 'Tag Happy',
          x: 480, y: 880,
          config: { action: 'add', tag: 'satisfied-customer' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5', label: 'Bad', condition: 'true' },
        { id: 'e5', from: 'n4', to: 'n6', label: 'Good/Great', condition: 'false' },
        { id: 'e6', from: 'n5', to: 'n7' },
        { id: 'e7', from: 'n6', to: 'n8' },
      ],
    },

    loyalty_reengagement: {
      key: 'loyalty_reengagement',
      name: 'Loyalty & Re-engagement',
      description: 'Re-engage inactive customers with offers',
      trigger: { type: 'trigger_schedule', cron: '0 10 * * 1' },
      nodes: [
        {
          id: 'n1', type: 'trigger_schedule', label: 'Weekly Monday',
          x: 300, y: 50,
          config: { schedule: 'weekly', time: '10:00' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Re-engage',
          x: 300, y: 200,
          config: {
            message: '👋 *We miss you, {{customer_name}}!*\n\nIt\'s been a while since your last visit. Here\'s a special offer just for you! 🎁\n\nUse code *COMEBACK10* for 10% off your next order.',
            buttons: [
              { id: 'shop', title: '🛍️ Shop Now' },
              { id: 'offers', title: '🏷️ View Offers' },
              { id: 'later', title: '⏰ Maybe Later' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'condition', label: 'Interested?',
          x: 300, y: 400,
          config: { variable: 'button_reply', operator: 'not_equals', value: 'later' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'show_catalog', label: 'Show Products',
          x: 120, y: 570,
          config: { categoryFilter: '', maxProducts: 10, sortBy: 'popular' },
          outputs: [],
        },
        {
          id: 'n5', type: 'send_text', label: 'Acknowledge',
          x: 480, y: 570,
          config: { message: 'No worries! The offer code *COMEBACK10* is valid for 7 days. Come back anytime! 😊' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Yes', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Later', condition: 'false' },
      ],
    },

    birthday_wishes: {
      key: 'birthday_wishes',
      name: 'Birthday / Anniversary Wishes',
      description: 'Send personalized wishes with special offers',
      trigger: { type: 'trigger_schedule', cron: '0 9 * * *' },
      nodes: [
        {
          id: 'n1', type: 'trigger_schedule', label: 'Daily at 9 AM',
          x: 300, y: 50,
          config: { schedule: 'daily', time: '09:00' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Birthday Message',
          x: 300, y: 200,
          config: {
            message: '🎂🎉 *Happy Birthday, {{customer_name}}!*\n\nWishing you a wonderful day filled with joy!\n\nHere\'s a special birthday gift from us:\n\n🎁 *20% OFF* on your next order!\nUse code: *BDAY20*\nValid for 7 days.',
            buttons: [
              { id: 'redeem', title: '🎁 Redeem Now' },
              { id: 'thanks', title: '🙏 Thank You!' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'condition', label: 'Wants to Redeem?',
          x: 300, y: 400,
          config: { variable: 'button_reply', operator: 'eq', value: 'redeem' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'show_catalog', label: 'Show Products',
          x: 120, y: 560,
          config: { categoryFilter: '', maxProducts: 10, sortBy: 'popular' },
          outputs: [],
        },
        {
          id: 'n5', type: 'send_text', label: 'Warm Wishes',
          x: 480, y: 560,
          config: { message: 'Have an amazing birthday! 🎂✨ The code *BDAY20* is saved and valid for 7 days. Use it whenever you\'re ready!' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Redeem', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Thanks', condition: 'false' },
      ],
    },

    referral_program: {
      key: 'referral_program',
      name: 'Referral Program',
      description: 'Encourage referrals with rewards',
      trigger: { type: 'trigger_message', keywords: 'refer,referral,share,invite,friend', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'Referral Interest',
          x: 300, y: 50,
          config: { keywords: 'refer,referral,share,invite,friend', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Referral Program',
          x: 300, y: 200,
          config: {
            message: '🤝 *Refer & Earn!*\n\nShare the love and earn rewards!\n\n🎁 *You get*: ₹100 off your next order\n🎁 *Your friend gets*: 15% off their first order\n\n*How it works:*\n1. Share your referral link\n2. Friend places an order\n3. Both of you get rewarded! 🎉',
            buttons: [
              { id: 'share', title: '📤 Get My Link' },
              { id: 'history', title: '📊 My Referrals' },
              { id: 'terms', title: '📋 Terms' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'send_text', label: 'Share Link',
          x: 300, y: 420,
          config: { message: '🔗 *Your Referral Link:*\n\nShare this message with friends:\n\n"Hey! I\'ve been shopping at *${subLabel}* and love it! Use my referral link to get 15% off your first order: [referral-link]"\n\nThe more friends you refer, the more you earn! 🚀' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
      ],
    },

    promotional_broadcast: {
      key: 'promotional_broadcast',
      name: 'Promotional Broadcast',
      description: 'Send promotional messages and flash sales',
      trigger: { type: 'trigger_schedule', cron: '0 10 * * 5' },
      nodes: [
        {
          id: 'n1', type: 'trigger_schedule', label: 'Friday at 10 AM',
          x: 300, y: 50,
          config: { schedule: 'weekly', time: '10:00' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_buttons', label: 'Promo Message',
          x: 300, y: 200,
          config: {
            message: '🔥 *Special Offer Alert!*\n\nExclusive deals just for you this week!\n\n💥 Up to 30% OFF on selected items\n⏰ Limited time only!\n\nDon\'t miss out!',
            buttons: [
              { id: 'shop', title: '🛍️ Shop Deals' },
              { id: 'catalog', title: '📋 Full Catalog' },
              { id: 'unsubscribe', title: '🔕 Unsubscribe' },
            ],
          },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'condition', label: 'Unsubscribe?',
          x: 300, y: 400,
          config: { variable: 'button_reply', operator: 'eq', value: 'unsubscribe' },
          outputs: ['n4', 'n5'],
        },
        {
          id: 'n4', type: 'send_text', label: 'Unsubscribed',
          x: 120, y: 560,
          config: { message: '✅ You\'ve been unsubscribed from promotional messages. You\'ll still receive order updates.\n\nType *subscribe* anytime to opt back in.' },
          outputs: ['n6'],
        },
        {
          id: 'n5', type: 'show_catalog', label: 'Show Deals',
          x: 480, y: 560,
          config: { categoryFilter: '', maxProducts: 10, sortBy: 'popular' },
          outputs: [],
        },
        {
          id: 'n6', type: 'tag_customer', label: 'Remove Promo Tag',
          x: 120, y: 730,
          config: { action: 'remove', tag: 'promo-subscriber' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Unsub', condition: 'true' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'Shop', condition: 'false' },
        { id: 'e5', from: 'n4', to: 'n6' },
      ],
    },

    new_customer_welcome: {
      key: 'new_customer_welcome',
      name: 'New Customer Onboarding',
      description: 'Multi-step welcome series for new customers',
      trigger: { type: 'trigger_message', keywords: 'new,first time,just joined,getting started', matchType: 'contains' },
      nodes: [
        {
          id: 'n1', type: 'trigger_message', label: 'New Customer',
          x: 300, y: 50,
          config: { keywords: 'new,first time,just joined,getting started', matchType: 'contains' },
          outputs: ['n2'],
        },
        {
          id: 'n2', type: 'send_text', label: 'Welcome Message',
          x: 300, y: 200,
          config: { message: '🎉 *Welcome to ${subLabel}!*\n\nWe\'re thrilled to have you here! Let us give you a quick tour of what we offer.\n\n✨ Here\'s a *10% OFF* welcome gift!\nCode: *WELCOME10*' },
          outputs: ['n3'],
        },
        {
          id: 'n3', type: 'tag_customer', label: 'Tag New',
          x: 300, y: 370,
          config: { action: 'add', tag: 'new-customer' },
          outputs: ['n4'],
        },
        {
          id: 'n4', type: 'delay', label: 'Wait 2 min',
          x: 300, y: 520,
          config: { duration: 2, unit: 'minutes' },
          outputs: ['n5'],
        },
        {
          id: 'n5', type: 'send_buttons', label: 'Quick Start',
          x: 300, y: 680,
          config: {
            message: '🚀 *Quick Start Guide*\n\nWhat would you like to do first?',
            buttons: [
              { id: 'browse', title: '🛍️ Browse Products' },
              { id: 'deals', title: '🏷️ Today\'s Deals' },
              { id: 'help', title: '❓ How It Works' },
            ],
          },
          outputs: ['n6'],
        },
        {
          id: 'n6', type: 'condition', label: 'Needs Help?',
          x: 300, y: 870,
          config: { variable: 'button_reply', operator: 'eq', value: 'help' },
          outputs: ['n7', 'n8'],
        },
        {
          id: 'n7', type: 'send_text', label: 'How It Works',
          x: 120, y: 1040,
          config: { message: '📖 *How to Order:*\n\n1️⃣ Type *menu* to see products\n2️⃣ Select items to add to cart\n3️⃣ Type *cart* to review\n4️⃣ Type *checkout* to place order\n5️⃣ Pay via UPI/COD\n6️⃣ Track with *track [order#]*\n\nNeed help? Type *support* anytime!' },
          outputs: [],
        },
        {
          id: 'n8', type: 'show_catalog', label: 'Show Products',
          x: 480, y: 1040,
          config: { categoryFilter: '', maxProducts: 10, sortBy: 'popular' },
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5' },
        { id: 'e5', from: 'n5', to: 'n6' },
        { id: 'e6', from: 'n6', to: 'n7', label: 'Help', condition: 'true' },
        { id: 'e7', from: 'n6', to: 'n8', label: 'Browse', condition: 'false' },
      ],
    },

  };
}
