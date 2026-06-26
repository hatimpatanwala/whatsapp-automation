/**
 * The default, system "Welcome" hub workflow auto-created for every tenant.
 * Editable but not deletable. A trigger greeting → welcome message (store name
 * baked in at seed time, {{customer_name}} resolved per customer) → an
 * interactive list that routes into the e-commerce sub-flows.
 */
export interface DefaultWorkflowDef {
  name: string;
  description: string;
  trigger: Record<string, any>;
  nodes: any[];
  edges: any[];
}

export function buildWelcomeHub(storeName: string): DefaultWorkflowDef {
  const store = (storeName || 'our store').trim() || 'our store';
  return {
    name: 'Welcome',
    description: 'Default welcome menu — greet customers and route them to shop, orders, quotes & support.',
    trigger: { type: 'trigger_message', keywords: 'hi,hello,hey,menu,start,shop,hii,helo', matchType: 'contains' },
    nodes: [
      {
        id: 'n1', type: 'trigger_message', label: 'Customer Says Hi', x: 340, y: 40,
        config: { keywords: 'hi,hello,hey,menu,start,shop,hii,helo', matchType: 'contains' }, outputs: ['n2'],
      },
      {
        id: 'n2', type: 'send_text', label: 'Welcome Message', x: 340, y: 190,
        config: { message: `👋 Welcome to *${store}*!\nHi {{customer_name}}, great to see you. How can we help you today?` },
        outputs: ['n3'],
      },
      {
        id: 'n3', type: 'send_list', label: 'Main Menu', x: 340, y: 340,
        config: {
          message: 'Pick an option to get started:',
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
            { title: 'More', rows: [
              { id: 'quote', title: '🧾 Get a Quote', description: 'Request a price quote' },
              { id: 'support', title: '💬 Talk to us', description: 'Get help' },
            ]},
          ],
        },
        outputs: ['n4'],
      },
      { id: 'n4', type: 'switch', label: 'Route Choice', x: 340, y: 520, config: { variable: 'list_reply' }, outputs: ['n5', 'n6', 'n7', 'n8', 'n11', 'n12'] },
      { id: 'n5', type: 'show_catalog', label: 'Browse Products', x: 20, y: 700, config: { maxProducts: 10, sortBy: 'newest' }, outputs: ['n5b'] },
      { id: 'n5b', type: 'product_card', label: 'Product Card', x: 20, y: 860, config: {}, outputs: ['n6', 'n5'] },
      { id: 'n6', type: 'view_cart', label: 'View Cart', x: 200, y: 700, config: { showCheckout: true, showClear: true }, outputs: [] },
      { id: 'n7', type: 'my_orders', label: 'My Orders', x: 380, y: 700, config: { header: '📦 Your Orders', maxOrders: 5, emptyMessage: 'You have no orders yet. Send *menu* to browse!' }, outputs: [] },
      { id: 'n8', type: 'send_text', label: 'Ask Order No.', x: 560, y: 700, config: { message: '🚚 Please send your *order number* (e.g. ORD-ABC123).' }, outputs: ['n8b'] },
      { id: 'n8b', type: 'wait_for_reply', label: 'Wait for Order No.', x: 560, y: 860, config: { timeoutMinutes: 10, timeoutMessage: 'No problem — send *menu* whenever you’re ready.' }, outputs: ['n8c'] },
      { id: 'n8c', type: 'track_order', label: 'Track Order', x: 560, y: 1020, config: {}, outputs: [] },
      { id: 'n11', type: 'send_text', label: 'Quote Request', x: 740, y: 700, config: { message: '🧾 Happy to help with a quote!\nReply with the *products and quantities* you need, and our team will prepare a price quote for you.' }, outputs: [] },
      { id: 'n12', type: 'send_text', label: 'Support', x: 920, y: 700, config: { message: '💬 We’re here to help! Reply with your question and our team will get back to you shortly.' }, outputs: [] },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3' },
      { id: 'e3', from: 'n3', to: 'n4' },
      { id: 'e4', from: 'n4', to: 'n5', label: 'Browse', condition: 'browse' },
      { id: 'e5', from: 'n4', to: 'n6', label: 'Cart', condition: 'cart' },
      { id: 'e6', from: 'n4', to: 'n7', label: 'My Orders', condition: 'myorders' },
      { id: 'e7', from: 'n4', to: 'n8', label: 'Track', condition: 'track' },
      { id: 'e8', from: 'n4', to: 'n11', label: 'Quote', condition: 'quote' },
      { id: 'e9', from: 'n4', to: 'n12', label: 'Support', condition: 'support' },
      { id: 'e10', from: 'n5', to: 'n5b' },
      { id: 'e11', from: 'n8', to: 'n8b' },
      { id: 'e12', from: 'n8b', to: 'n8c' },
    ],
  };
}
