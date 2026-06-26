/**
 * The default e-commerce workflow set, auto-created per tenant.
 *
 * Modular / loosely-coupled hub-and-spoke design:
 *  - A tiny SYSTEM "Welcome" hub (undeletable, editable): greeting → a DYNAMIC
 *    menu built from whichever sub-workflows are active → starts the chosen one.
 *  - Each feature (Browse, Cart, My Orders, Track, Quote, Support) is its OWN
 *    workflow with its own trigger keyword AND a `menuItem` registration, so it
 *    works standalone and appears in the Welcome menu while it's active.
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
    description: 'Greets customers and shows a menu of whatever is active (browse, cart, orders, quotes, support).',
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

/** The modular e-commerce spoke workflows (each standalone + a Welcome menu item). */
export function buildDefaultSpokes(): DefaultWorkflowDef[] {
  return [
    {
      name: 'Browse Products',
      description: 'Show the catalog so customers can browse and add to cart.',
      menuItem: { label: '🛍️ Browse Products', order: 1 },
      trigger: { type: 'trigger_message', keywords: 'browse,catalog,products,shop now', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Browse', x: 300, y: 40, config: { keywords: 'browse,catalog,products,shop now', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'show_catalog', label: 'Show Catalog', x: 300, y: 200, config: { maxProducts: 10, sortBy: 'newest' }, outputs: ['n3'] },
        { id: 'n3', type: 'product_card', label: 'Product Card', x: 300, y: 360, config: {}, outputs: [] },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
      ],
    },
    {
      name: 'View Cart',
      description: 'Show the customer’s cart with checkout.',
      menuItem: { label: '🛒 View Cart & Checkout', order: 2 },
      trigger: { type: 'trigger_message', keywords: 'cart,my cart,view cart,checkout', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Cart', x: 300, y: 40, config: { keywords: 'cart,my cart,view cart,checkout', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'view_cart', label: 'View Cart', x: 300, y: 200, config: { showCheckout: true, showClear: true }, outputs: [] },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    },
    {
      name: 'My Orders',
      description: 'List the customer’s recent orders.',
      menuItem: { label: '📦 My Orders', order: 3 },
      trigger: { type: 'trigger_message', keywords: 'orders,my orders', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'My Orders', x: 300, y: 40, config: { keywords: 'orders,my orders', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'my_orders', label: 'My Orders', x: 300, y: 200, config: { header: '📦 Your Orders', maxOrders: 5, emptyMessage: 'You have no orders yet. Send *menu* to browse!' }, outputs: [] },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    },
    {
      name: 'Track Order',
      description: 'Look up an order’s status by order number.',
      menuItem: { label: '🚚 Track Order', order: 4 },
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
    {
      name: 'Get a Quote',
      description: 'Let customers request a price quote.',
      menuItem: { label: '🧾 Get a Quote', order: 5 },
      trigger: { type: 'trigger_message', keywords: 'quote,quotation,get a quote', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Quote', x: 300, y: 40, config: { keywords: 'quote,quotation,get a quote', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'send_text', label: 'Quote Request', x: 300, y: 200, config: { message: '🧾 Happy to help with a quote!\nReply with the *products and quantities* you need, and our team will prepare a price quote for you.' }, outputs: [] },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    },
    {
      name: 'Talk to us',
      description: 'Hand the conversation to a human.',
      menuItem: { label: '💬 Talk to us', order: 6 },
      trigger: { type: 'trigger_message', keywords: 'support,help,agent,human', matchType: 'contains' },
      nodes: [
        { id: 'n1', type: 'trigger_message', label: 'Support', x: 300, y: 40, config: { keywords: 'support,help,agent,human', matchType: 'contains' }, outputs: ['n2'] },
        { id: 'n2', type: 'send_text', label: 'Support', x: 300, y: 200, config: { message: '💬 We’re here to help! Reply with your question and our team will get back to you shortly.' }, outputs: [] },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    },
  ];
}
