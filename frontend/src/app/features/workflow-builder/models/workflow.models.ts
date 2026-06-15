export type NodeCategory = 'trigger' | 'message' | 'commerce' | 'logic' | 'action' | 'utility';

export interface NodeTypeDefinition {
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
  icon: string;
  color: string;
  maxOutputs: number;
  configFields: ConfigField[];
}

export type EntityType = 'workflows' | 'templates' | 'categories';

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean' | 'buttons' | 'list-items' | 'keywords' | 'products' | 'template' | 'entity-select';
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
  defaultValue?: any;
  entityType?: EntityType;
  showWhen?: { field: string; value: string };
  help?: string;
  /** Show quick variable-insert chips under a text/textarea field. */
  variables?: boolean;
}

export interface WorkflowNodeData {
  id: string;
  type: string;
  label: string;
  description: string;
  x: number;
  y: number;
  config: Record<string, any>;
  outputs: string[]; // connected node IDs
}

export interface WorkflowEdgeData {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'archived' | 'preview';
  audience: 'customer' | 'admin';
  trigger: string;
  nodes: WorkflowNodeData[];
  edges: WorkflowEdgeData[];
  createdAt: string;
  updatedAt: string;
  executionCount: number;
  lastExecutedAt?: string;
}

// All available node types for the palette
export const NODE_TYPE_DEFINITIONS: NodeTypeDefinition[] = [
  // Triggers
  {
    type: 'trigger_message',
    label: 'Message Received',
    description: 'Starts when customer sends a message',
    category: 'trigger',
    icon: 'pi-envelope',
    color: '#f59e0b',
    maxOutputs: 1,
    configFields: [
      { key: 'keywords', label: 'Trigger Keywords', type: 'keywords', placeholder: 'Type a word and press Enter', help: 'The flow starts when the customer message matches any of these.' },
      { key: 'matchType', label: 'Match Type', type: 'select', options: [{ label: 'Contains', value: 'contains' }, { label: 'Exact', value: 'exact' }, { label: 'Starts With', value: 'starts_with' }], help: 'Contains = keyword anywhere in the message. Exact = whole message equals the keyword.' },
    ],
  },
  {
    type: 'trigger_order',
    label: 'Order Event',
    description: 'Triggers on order status changes',
    category: 'trigger',
    icon: 'pi-shopping-bag',
    color: '#f59e0b',
    maxOutputs: 1,
    configFields: [
      { key: 'event', label: 'Event', type: 'select', options: [{ label: 'Order Created', value: 'created' }, { label: 'Order Confirmed', value: 'confirmed' }, { label: 'Being Prepared (Processing)', value: 'processing' }, { label: 'Ready for Delivery', value: 'ready_for_delivery' }, { label: 'Out for Delivery', value: 'out_for_delivery' }, { label: 'Order Delivered', value: 'delivered' }, { label: 'Order Cancelled', value: 'cancelled' }] },
    ],
  },
  {
    type: 'trigger_payment',
    label: 'Payment Event',
    description: 'Triggers on payment updates',
    category: 'trigger',
    icon: 'pi-wallet',
    color: '#f59e0b',
    maxOutputs: 1,
    configFields: [
      { key: 'event', label: 'Event', type: 'select', options: [{ label: 'Payment Received', value: 'received' }, { label: 'Payment Verified', value: 'verified' }, { label: 'Payment Expired', value: 'expired' }] },
    ],
  },
  {
    type: 'trigger_schedule',
    label: 'Scheduled',
    description: 'Runs on a schedule',
    category: 'trigger',
    icon: 'pi-calendar',
    color: '#f59e0b',
    maxOutputs: 1,
    configFields: [
      { key: 'schedule', label: 'Schedule', type: 'select', options: [{ label: 'Every Hour', value: 'hourly' }, { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }] },
      { key: 'time', label: 'At Time', type: 'text', placeholder: '09:00' },
    ],
  },
  {
    type: 'trigger_quote',
    label: 'Quote Event',
    description: 'Triggers on quote status changes',
    category: 'trigger',
    icon: 'pi-file-edit',
    color: '#f59e0b',
    maxOutputs: 1,
    configFields: [
      { key: 'event', label: 'Event', type: 'select', options: [{ label: 'Quote Created', value: 'created' }, { label: 'Quote Sent', value: 'sent' }, { label: 'Quote Accepted', value: 'accepted' }, { label: 'Quote Rejected', value: 'rejected' }, { label: 'Quote Converted', value: 'converted' }] },
    ],
  },

  // Messages
  {
    type: 'send_text',
    label: 'Send Text',
    description: 'Send a text message to customer',
    category: 'message',
    icon: 'pi-comment',
    color: '#25D366',
    maxOutputs: 1,
    configFields: [
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Hello {{customer_name}}! ...', required: true, variables: true, help: 'Plain text sent to the customer. Tap a chip below to insert a variable.' },
    ],
  },
  {
    type: 'send_buttons',
    label: 'Send Buttons',
    description: 'Send interactive button message',
    category: 'message',
    icon: 'pi-th-large',
    color: '#25D366',
    maxOutputs: 3,
    configFields: [
      { key: 'message', label: 'Message Body', type: 'textarea', placeholder: 'What would you like to do?', required: true, variables: true, help: 'The question shown above the buttons.' },
      { key: 'buttons', label: 'Buttons', type: 'buttons', required: true, help: 'Up to 3. Connect one arrow per button (or route with a Switch node).' },
    ],
  },
  {
    type: 'send_list',
    label: 'Send List Menu',
    description: 'Send interactive list to customer',
    category: 'message',
    icon: 'pi-list',
    color: '#25D366',
    maxOutputs: 1,
    configFields: [
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Please select an option:', variables: true, help: 'Text shown above the list.' },
      { key: 'buttonText', label: 'List Button Text', type: 'text', placeholder: 'View Options', defaultValue: 'View Options', help: 'The label on the button that opens the list.' },
      { key: 'source', label: 'List Source', type: 'select', options: [{ label: 'Custom Items', value: 'custom' }, { label: 'Product Categories', value: 'categories' }, { label: 'Products', value: 'products' }], help: 'Custom = the items you define below. Categories/Products = pulled from your catalog automatically.' },
      { key: 'items', label: 'List Items', type: 'list-items', showWhen: { field: 'source', value: 'custom' }, help: 'Up to 10 rows. Route each choice with a Switch node using the item id.' },
    ],
  },
  {
    type: 'send_image',
    label: 'Send Image',
    description: 'Send image with caption',
    category: 'message',
    icon: 'pi-image',
    color: '#25D366',
    maxOutputs: 1,
    configFields: [
      { key: 'imageUrl', label: 'Image URL', type: 'text', placeholder: 'https://...', required: true, help: 'A public URL to the image (jpg/png).' },
      { key: 'caption', label: 'Caption', type: 'text', variables: true, help: 'Optional text shown under the image.' },
    ],
  },
  {
    type: 'send_template',
    label: 'Send Template',
    description: 'Send approved WhatsApp template',
    category: 'message',
    icon: 'pi-file',
    color: '#25D366',
    maxOutputs: 1,
    configFields: [
      { key: 'templateName', label: 'Template', type: 'entity-select', entityType: 'templates', placeholder: 'Select a template' },
      { key: 'language', label: 'Language', type: 'select', options: [{ label: 'English', value: 'en' }, { label: 'Hindi', value: 'hi' }], defaultValue: 'en' },
    ],
  },

  // Commerce nodes
  {
    type: 'show_catalog',
    label: 'Show Catalog',
    description: 'Display product catalog to customer',
    category: 'commerce',
    icon: 'pi-shopping-cart',
    color: '#8b5cf6',
    maxOutputs: 1,
    configFields: [
      { key: 'categoryFilter', label: 'Category Filter', type: 'select', options: [{ label: 'All Categories', value: '' }, { label: 'Specific Category', value: 'specific' }] },
      { key: 'categoryId', label: 'Category', type: 'entity-select', entityType: 'categories', placeholder: 'Select a category', showWhen: { field: 'categoryFilter', value: 'specific' } },
      { key: 'maxProducts', label: 'Max Products', type: 'number', defaultValue: 10 },
      { key: 'sortBy', label: 'Sort By', type: 'select', options: [{ label: 'Popular', value: 'popular' }, { label: 'Price Low→High', value: 'price_asc' }, { label: 'Price High→Low', value: 'price_desc' }, { label: 'Newest', value: 'newest' }] },
    ],
  },
  {
    type: 'add_to_cart',
    label: 'Add to Cart',
    description: 'Add selected product to cart',
    category: 'commerce',
    icon: 'pi-cart-plus',
    color: '#8b5cf6',
    maxOutputs: 2,
    configFields: [
      { key: 'quantityPrompt', label: 'Ask Quantity?', type: 'boolean', defaultValue: false },
      { key: 'confirmMessage', label: 'Confirm Message', type: 'text', defaultValue: 'Added to cart!' },
    ],
  },
  {
    type: 'view_cart',
    label: 'View Cart',
    description: 'Show cart summary to customer',
    category: 'commerce',
    icon: 'pi-shopping-cart',
    color: '#8b5cf6',
    maxOutputs: 2,
    configFields: [
      { key: 'showCheckout', label: 'Show Checkout Button', type: 'boolean', defaultValue: true },
      { key: 'showClear', label: 'Show Clear Cart Button', type: 'boolean', defaultValue: true },
    ],
  },
  {
    type: 'checkout',
    label: 'Checkout',
    description: 'Initiate checkout process',
    category: 'commerce',
    icon: 'pi-credit-card',
    color: '#8b5cf6',
    maxOutputs: 2,
    configFields: [
      { key: 'requireAddress', label: 'Require Address', type: 'boolean', defaultValue: true },
      { key: 'paymentMethod', label: 'Payment Method', type: 'select', options: [{ label: 'UPI QR', value: 'upi_qr' }, { label: 'Manual UPI', value: 'upi_manual' }, { label: 'COD', value: 'cod' }, { label: 'Let Customer Choose', value: 'choice' }] },
    ],
  },
  {
    type: 'inventory_check',
    label: 'Check Inventory',
    description: 'Check if product is in stock',
    category: 'commerce',
    icon: 'pi-box',
    color: '#8b5cf6',
    maxOutputs: 2,
    configFields: [
      { key: 'outOfStockMessage', label: 'Out of Stock Message', type: 'text', defaultValue: 'Sorry, this item is currently out of stock.' },
    ],
  },
  {
    type: 'search_products',
    label: 'Search Products',
    description: 'Search catalog by customer query',
    category: 'commerce',
    icon: 'pi-search',
    color: '#8b5cf6',
    maxOutputs: 2,
    configFields: [
      { key: 'noResultsMessage', label: 'No Results Message', type: 'text', defaultValue: 'No products found. Try different keywords.' },
      { key: 'maxResults', label: 'Max Results', type: 'number', defaultValue: 5 },
    ],
  },
  {
    type: 'filter_products',
    label: 'Filter Products',
    description: 'Filter products by criteria',
    category: 'commerce',
    icon: 'pi-filter',
    color: '#8b5cf6',
    maxOutputs: 1,
    configFields: [
      { key: 'filterBy', label: 'Filter By', type: 'select', options: [{ label: 'Category', value: 'category' }, { label: 'Price Range', value: 'price' }, { label: 'In Stock Only', value: 'in_stock' }, { label: 'On Sale', value: 'on_sale' }] },
      { key: 'filterCategory', label: 'Category', type: 'entity-select', entityType: 'categories', placeholder: 'Select a category', showWhen: { field: 'filterBy', value: 'category' } },
      { key: 'value', label: 'Value', type: 'text', showWhen: { field: 'filterBy', value: 'price' } },
    ],
  },
  {
    type: 'payment_qr',
    label: 'Send Payment QR',
    description: 'Generate and send UPI QR code',
    category: 'commerce',
    icon: 'pi-qrcode',
    color: '#8b5cf6',
    maxOutputs: 2,
    configFields: [
      { key: 'expiryMinutes', label: 'Expiry (minutes)', type: 'number', defaultValue: 30 },
      { key: 'reminderEnabled', label: 'Auto Reminder', type: 'boolean', defaultValue: true },
    ],
  },

  // Quote nodes
  {
    type: 'send_quote',
    label: 'Send Quote',
    description: 'Send a quote to customer via WhatsApp',
    category: 'commerce',
    icon: 'pi-file-edit',
    color: '#8b5cf6',
    maxOutputs: 1,
    configFields: [
      { key: 'quoteId', label: 'Quote ID (or leave empty to use context)', type: 'text', placeholder: 'Auto from context' },
      { key: 'headerMessage', label: 'Header Message', type: 'textarea', placeholder: 'Hi {{customer_name}}, here is your quote:' },
      { key: 'footerMessage', label: 'Footer Message', type: 'textarea', placeholder: 'Reply YES to accept or NO to decline.' },
    ],
  },
  {
    type: 'update_quote',
    label: 'Update Quote Status',
    description: 'Change quote status in the system',
    category: 'action',
    icon: 'pi-file-edit',
    color: '#3b82f6',
    maxOutputs: 1,
    configFields: [
      { key: 'quoteId', label: 'Quote ID (or leave empty to use context)', type: 'text', placeholder: 'Auto from context' },
      { key: 'status', label: 'New Status', type: 'select', options: [{ label: 'Sent', value: 'sent' }, { label: 'Accepted', value: 'accepted' }, { label: 'Rejected', value: 'rejected' }, { label: 'Converted', value: 'converted' }] },
    ],
  },
  {
    type: 'product_card',
    label: 'Product Card',
    description: 'Show selected product (image + price) with Add to Cart / qty controls',
    category: 'commerce',
    icon: 'pi-id-card',
    color: '#8b5cf6',
    maxOutputs: 2,
    configFields: [],
  },
  {
    type: 'my_orders',
    label: 'My Orders',
    description: "Show the customer's recent orders & status",
    category: 'commerce',
    icon: 'pi-list-check',
    color: '#8b5cf6',
    maxOutputs: 1,
    configFields: [
      { key: 'header', label: 'Header', type: 'text', defaultValue: '📦 Your Orders', variables: true, help: 'Shown above the list of orders.' },
      { key: 'maxOrders', label: 'Max Orders', type: 'number', defaultValue: 5 },
      { key: 'emptyMessage', label: 'If no orders', type: 'text', defaultValue: 'You have no orders yet. Send menu to browse!', variables: true, help: 'Sent when the customer has no orders.' },
    ],
  },
  {
    type: 'track_order',
    label: 'Track Order',
    description: 'Look up an order by number and show its status',
    category: 'commerce',
    icon: 'pi-map-marker',
    color: '#8b5cf6',
    maxOutputs: 1,
    configFields: [],
  },

  // Logic nodes
  {
    type: 'condition',
    label: 'Condition / If-Else',
    description: 'Branch based on a condition',
    category: 'logic',
    icon: 'pi-directions',
    color: '#ec4899',
    maxOutputs: 2,
    configFields: [
      { key: 'variable', label: 'Check Variable', type: 'select', options: [{ label: 'Cart Items Count', value: 'cart_items' }, { label: 'Order Status', value: 'order_status' }, { label: 'Payment Status', value: 'payment_status' }, { label: 'Quote Status', value: 'quote_status' }, { label: 'Customer Tag', value: 'customer_tag' }, { label: 'Message Contains', value: 'message_contains' }, { label: 'Time of Day', value: 'time_of_day' }], help: 'The value to test.' },
      { key: 'operator', label: 'Operator', type: 'select', options: [{ label: 'Equals', value: 'eq' }, { label: 'Not Equals', value: 'neq' }, { label: 'Greater Than', value: 'gt' }, { label: 'Less Than', value: 'lt' }, { label: 'Contains', value: 'contains' }] },
      { key: 'value', label: 'Value', type: 'text', help: 'Connect a "Yes" arrow (condition true) and a "No" arrow (false).' },
    ],
  },
  {
    type: 'switch',
    label: 'Switch / Router',
    description: 'Route to different paths by value',
    category: 'logic',
    icon: 'pi-sitemap',
    color: '#ec4899',
    maxOutputs: 5,
    configFields: [
      { key: 'variable', label: 'Route By', type: 'select', options: [{ label: 'Button Reply', value: 'button_reply' }, { label: 'List Reply', value: 'list_reply' }, { label: 'Message Text', value: 'message_text' }, { label: 'Customer Language', value: 'language' }, { label: 'Quote Status', value: 'quote_status' }], help: 'Label each outgoing arrow with the button/list item id it should match (e.g. "browse").' },
    ],
  },
  {
    type: 'wait_for_reply',
    label: 'Wait for Reply',
    description: 'Pause workflow until customer responds',
    category: 'logic',
    icon: 'pi-hourglass',
    color: '#ec4899',
    maxOutputs: 2,
    configFields: [
      { key: 'timeoutMinutes', label: 'Timeout (minutes)', type: 'number', defaultValue: 60 },
      { key: 'timeoutMessage', label: 'Timeout Message', type: 'text', placeholder: 'Are you still there?' },
    ],
  },

  // Actions
  {
    type: 'tag_customer',
    label: 'Tag Customer',
    description: 'Add/remove tags on customer',
    category: 'action',
    icon: 'pi-tag',
    color: '#3b82f6',
    maxOutputs: 1,
    configFields: [
      { key: 'action', label: 'Action', type: 'select', options: [{ label: 'Add Tag', value: 'add' }, { label: 'Remove Tag', value: 'remove' }] },
      { key: 'tag', label: 'Tag Name', type: 'text', placeholder: 'vip, new, returning' },
    ],
  },
  {
    type: 'update_order',
    label: 'Update Order',
    description: 'Change order status',
    category: 'action',
    icon: 'pi-pencil',
    color: '#3b82f6',
    maxOutputs: 1,
    configFields: [
      { key: 'status', label: 'New Status', type: 'select', options: [{ label: 'Confirmed', value: 'confirmed' }, { label: 'Processing', value: 'processing' }, { label: 'Ready', value: 'ready_for_delivery' }, { label: 'Cancelled', value: 'cancelled' }] },
    ],
  },
  {
    type: 'assign_agent',
    label: 'Assign to Agent',
    description: 'Hand off to human agent',
    category: 'action',
    icon: 'pi-user',
    color: '#3b82f6',
    maxOutputs: 1,
    configFields: [
      { key: 'assignTo', label: 'Assign To', type: 'select', options: [{ label: 'Any Available', value: 'any' }, { label: 'Specific User', value: 'specific' }] },
      { key: 'message', label: 'Handoff Message', type: 'text', defaultValue: 'Connecting you with our team...' },
    ],
  },
  {
    type: 'http_request',
    label: 'HTTP Request',
    description: 'Call external API',
    category: 'action',
    icon: 'pi-globe',
    color: '#3b82f6',
    maxOutputs: 2,
    configFields: [
      { key: 'method', label: 'Method', type: 'select', options: [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }] },
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/...' },
    ],
  },

  // Utility
  {
    type: 'delay',
    label: 'Delay / Wait',
    description: 'Wait before next step',
    category: 'utility',
    icon: 'pi-clock',
    color: '#64748b',
    maxOutputs: 1,
    configFields: [
      { key: 'duration', label: 'Duration', type: 'number', defaultValue: 5 },
      { key: 'unit', label: 'Unit', type: 'select', options: [{ label: 'Seconds', value: 'seconds' }, { label: 'Minutes', value: 'minutes' }, { label: 'Hours', value: 'hours' }], defaultValue: 'minutes' },
    ],
  },
  {
    type: 'set_language',
    label: 'Set Language',
    description: 'Change conversation language',
    category: 'utility',
    icon: 'pi-globe',
    color: '#64748b',
    maxOutputs: 1,
    configFields: [
      { key: 'language', label: 'Language', type: 'select', options: [{ label: 'English', value: 'en' }, { label: 'Hindi', value: 'hi' }, { label: 'Auto Detect', value: 'auto' }] },
    ],
  },
  {
    type: 'fallback',
    label: 'Fallback Handler',
    description: 'Handle unexpected input during workflow',
    category: 'logic',
    icon: 'pi-exclamation-triangle',
    color: '#f97316',
    maxOutputs: 3,
    configFields: [
      { key: 'message', label: 'Fallback Message', type: 'textarea', placeholder: "Sorry, I didn't understand that. What would you like to do?", defaultValue: "Sorry, I didn't understand that. What would you like to do?" },
      { key: 'mode', label: 'Fallback Mode', type: 'select', options: [{ label: 'Show Buttons', value: 'buttons' }, { label: 'Send Text & Continue', value: 'text' }, { label: 'Restart Workflow', value: 'restart' }], defaultValue: 'buttons' },
      { key: 'buttons', label: 'Button Options', type: 'buttons', showWhen: { field: 'mode', value: 'buttons' } },
    ],
  },
  {
    type: 'start_workflow',
    label: 'Start Workflow',
    description: 'Start another workflow from this one',
    category: 'action',
    icon: 'pi-external-link',
    color: '#0ea5e9',
    maxOutputs: 0,
    configFields: [
      { key: 'workflowId', label: 'Target Workflow', type: 'entity-select', entityType: 'workflows', placeholder: 'Select a workflow', required: true },
      { key: 'passVariables', label: 'Pass Variables to Target', type: 'boolean', defaultValue: true },
    ],
  },
  {
    type: 'end',
    label: 'End Flow',
    description: 'End the workflow',
    category: 'utility',
    icon: 'pi-stop-circle',
    color: '#ef4444',
    maxOutputs: 0,
    configFields: [],
  },
];

export const NODE_CATEGORIES: { key: NodeCategory; label: string; icon: string }[] = [
  { key: 'trigger', label: 'Triggers', icon: 'pi-bolt' },
  { key: 'message', label: 'Messages', icon: 'pi-comment' },
  { key: 'commerce', label: 'Commerce', icon: 'pi-shopping-cart' },
  { key: 'logic', label: 'Logic', icon: 'pi-sitemap' },
  { key: 'action', label: 'Actions', icon: 'pi-cog' },
  { key: 'utility', label: 'Utility', icon: 'pi-wrench' },
];

// Variables available inside message templates ({{name}}) and Switch/Condition
// nodes. Surfaced in the builder header so users know what they can reference.
export interface WorkflowVariable {
  name: string;
  description: string;
  example: string;
  group: 'Customer' | 'Conversation' | 'Commerce' | 'Integration';
}

export const WORKFLOW_VARIABLES: WorkflowVariable[] = [
  { name: 'customer_name', description: "The customer's name (or 'Customer' if unknown).", example: 'Hi {{customer_name}}!', group: 'Customer' },
  { name: 'customer_phone', description: "The customer's WhatsApp number.", example: '{{customer_phone}}', group: 'Customer' },
  { name: 'last_input', description: "The customer's most recent typed message.", example: 'You said: {{last_input}}', group: 'Conversation' },
  { name: 'button_reply', description: 'The button the customer last tapped. Use as the Switch variable to branch.', example: 'Switch → variable: button_reply', group: 'Conversation' },
  { name: 'list_reply', description: 'The list item the customer last selected. Use as the Switch variable to branch.', example: 'Switch → variable: list_reply', group: 'Conversation' },
  { name: 'selected_product_id', description: 'The product the customer picked from a catalog/list.', example: 'Used by Add to Cart', group: 'Commerce' },
  { name: 'selected_category_id', description: 'The category the customer picked.', example: 'Used by Show Catalog', group: 'Commerce' },
  { name: 'order_number', description: 'Order number — available in order- & payment-triggered flows.', example: 'Order #{{order_number}}', group: 'Commerce' },
  { name: 'order_total', description: 'Order total amount — available in order-triggered flows.', example: '{{currency}}{{order_total}}', group: 'Commerce' },
  { name: 'order_status', description: 'Current order status — available in order status-change flows.', example: 'Status: {{order_status}}', group: 'Commerce' },
  { name: 'currency', description: 'Currency symbol for the order/payment (e.g. ₹).', example: '{{currency}}{{order_total}}', group: 'Commerce' },
  { name: 'payment_amount', description: 'Amount paid — available in payment-triggered flows.', example: 'Paid {{currency}}{{payment_amount}}', group: 'Commerce' },
  { name: 'transaction_id', description: 'Payment transaction reference — available in payment-triggered flows.', example: 'Txn: {{transaction_id}}', group: 'Commerce' },
  { name: 'http_status', description: 'HTTP status code returned by an HTTP Request node.', example: '{{http_status}}', group: 'Integration' },
  { name: 'http_response', description: 'Response body returned by an HTTP Request node.', example: '{{http_response}}', group: 'Integration' },
];

// Plain-language "what this node does / what happens next" help, shown in the
// config panel so every node is self-explanatory.
export const NODE_HELP: Record<string, string> = {
  trigger_message: 'Starts the flow when a customer sends a message matching your keywords. Connect its single output to the first step.',
  trigger_order: 'Starts the flow automatically when an order reaches the selected status.',
  trigger_payment: 'Starts the flow when a payment reaches the selected status.',
  trigger_schedule: 'Runs the flow automatically on the schedule you set.',
  trigger_quote: 'Starts the flow when a quote reaches the selected status.',
  send_text: 'Sends a plain text message. Use {{variables}} to personalize it.',
  send_buttons: 'Sends up to 3 tappable buttons. Connect one arrow per button (top→bottom matches button order), or send to a Switch node to branch on the choice.',
  send_list: 'Sends a tappable list menu (categories, products, or custom items).',
  send_image: 'Sends an image with an optional caption.',
  send_template: 'Sends a pre-approved WhatsApp template — works even outside the 24-hour window.',
  show_catalog: 'Shows products from your catalog as a list the customer can browse and pick.',
  add_to_cart: 'Adds the selected product to the customer’s cart. Has Success and Failure outputs.',
  view_cart: 'Shows the current cart with optional Checkout / Clear buttons.',
  checkout: 'Starts checkout (address + payment). Has Success and Failure outputs.',
  inventory_check: 'Checks stock for the selected product. Branches In-Stock / Out-of-Stock.',
  search_products: 'Searches products by the customer’s text. Branches Found / Not-Found.',
  filter_products: 'Filters products (category, price, in-stock, on-sale) for the next step.',
  payment_qr: 'Generates a UPI payment QR/link. Branches on payment result.',
  send_quote: 'Sends a quote/estimate to the customer.',
  update_quote: 'Updates a quote’s status.',
  my_orders: 'Lists the customer’s recent orders with their status. No input needed.',
  track_order: 'Looks up an order by number and shows a status progress bar. Put a "Wait for Reply" node before it so the customer can type their order number.',
  product_card: 'Shows the product the customer tapped (image + price + description) with Add to Cart, or ➕/➖ quantity controls if it’s already in the cart (only when the cart feature is on). Connect a "view" edge to View Cart and a "back" edge to the catalog.',
  condition: 'Checks a variable against a value. Connect a "Yes" arrow and a "No" arrow to branch.',
  switch: 'Routes to different steps based on a variable (usually button_reply). Label each outgoing arrow with the button id/value to match.',
  wait_for_reply: 'Pauses the flow until the customer replies (or a timeout). Branches Reply / Timeout.',
  fallback: 'Handles unexpected input — re-prompt with buttons, send text, or restart.',
  tag_customer: 'Adds or removes a tag on the customer for segmentation.',
  update_order: 'Updates the current order’s status.',
  assign_agent: 'Hands the conversation to a human agent and notifies them.',
  http_request: 'Calls an external API. Sets {{http_status}} and {{http_response}}. Branches Success / Failure.',
  start_workflow: 'Jumps into another workflow, optionally passing variables along.',
  delay: 'Waits for a set time before continuing.',
  set_language: 'Sets the conversation language for following messages.',
  end: 'Ends the workflow. Nothing runs after this node.',
};
