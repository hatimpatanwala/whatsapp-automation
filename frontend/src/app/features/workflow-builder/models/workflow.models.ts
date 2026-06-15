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
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean' | 'buttons' | 'products' | 'template' | 'entity-select';
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
  defaultValue?: any;
  entityType?: EntityType;
  showWhen?: { field: string; value: string };
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
      { key: 'keywords', label: 'Keyword Match (comma separated)', type: 'text', placeholder: 'hi, hello, menu' },
      { key: 'matchType', label: 'Match Type', type: 'select', options: [{ label: 'Contains', value: 'contains' }, { label: 'Exact', value: 'exact' }, { label: 'Starts With', value: 'starts_with' }] },
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
      { key: 'event', label: 'Event', type: 'select', options: [{ label: 'Order Created', value: 'created' }, { label: 'Order Confirmed', value: 'confirmed' }, { label: 'Order Delivered', value: 'delivered' }, { label: 'Order Cancelled', value: 'cancelled' }] },
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
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Hello {{customer_name}}! ...' },
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
      { key: 'message', label: 'Message Body', type: 'textarea', placeholder: 'What would you like to do?', required: true },
      { key: 'buttons', label: 'Buttons', type: 'buttons', required: true },
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
      { key: 'body', label: 'Message', type: 'textarea' },
      { key: 'buttonText', label: 'Button Text', type: 'text', placeholder: 'View Options', defaultValue: 'View Options' },
      { key: 'source', label: 'List Source', type: 'select', options: [{ label: 'Categories', value: 'categories' }, { label: 'Products', value: 'products' }, { label: 'Custom Items', value: 'custom' }] },
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
      { key: 'imageUrl', label: 'Image URL', type: 'text', placeholder: 'https://...' },
      { key: 'caption', label: 'Caption', type: 'text' },
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
      { key: 'variable', label: 'Check Variable', type: 'select', options: [{ label: 'Cart Items Count', value: 'cart_items' }, { label: 'Order Status', value: 'order_status' }, { label: 'Payment Status', value: 'payment_status' }, { label: 'Quote Status', value: 'quote_status' }, { label: 'Customer Tag', value: 'customer_tag' }, { label: 'Message Contains', value: 'message_contains' }, { label: 'Time of Day', value: 'time_of_day' }] },
      { key: 'operator', label: 'Operator', type: 'select', options: [{ label: 'Equals', value: 'eq' }, { label: 'Not Equals', value: 'neq' }, { label: 'Greater Than', value: 'gt' }, { label: 'Less Than', value: 'lt' }, { label: 'Contains', value: 'contains' }] },
      { key: 'value', label: 'Value', type: 'text' },
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
      { key: 'variable', label: 'Route By', type: 'select', options: [{ label: 'Button Reply ID', value: 'button_reply' }, { label: 'List Reply ID', value: 'list_reply' }, { label: 'Message Text', value: 'message_text' }, { label: 'Customer Language', value: 'language' }, { label: 'Quote Status', value: 'quote_status' }] },
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
