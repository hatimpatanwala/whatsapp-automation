// ─────────────────────────────────────────────
// Shared / Utility types
// ─────────────────────────────────────────────

export type UUID = string;
export type ISODateString = string;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ─────────────────────────────────────────────
// Address
// ─────────────────────────────────────────────

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

// ─────────────────────────────────────────────
// Subscription Plans
// ─────────────────────────────────────────────

export type BillingCycle = 'monthly' | 'yearly';
export type PlanTier = 'starter' | 'growth' | 'professional' | 'enterprise';

export interface SubscriptionPlan {
  id: UUID;
  name: string;
  tier: PlanTier;
  description: string;

  /** Price in USD cents per month */
  monthlyPrice: number;
  /** Price in USD cents per year (typically discounted) */
  yearlyPrice: number;

  /** Cost in USD cents charged per WhatsApp conversation */
  pricePerConversation: number;

  /** Max WhatsApp conversations included per billing period (null = unlimited) */
  conversationLimit: number | null;
  /** Max messages that can be sent per billing period (null = unlimited) */
  messageLimit: number | null;
  /** Max products the tenant can list (null = unlimited) */
  productLimit: number | null;
  /** Max marketing campaigns per billing period (null = unlimited) */
  campaignLimit: number | null;
  /** Max team members / users (null = unlimited) */
  userLimit: number | null;

  /** Feature flags included in this plan */
  features: string[];

  /** Whether AI-powered features are included */
  aiFeatures: boolean;
  /** Whether workflow automation builder is included */
  workflowBuilder: boolean;
  /** Whether advanced analytics are included */
  advancedAnalytics: boolean;
  /** Whether multi-catalog support is included */
  multiCatalog: boolean;

  isActive: boolean;
  sortOrder: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─────────────────────────────────────────────
// Subscription (tenant-level)
// ─────────────────────────────────────────────

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'paused'
  | 'unpaid';

export interface Subscription {
  id: UUID;
  tenantId: UUID;
  planId: UUID;
  plan?: SubscriptionPlan;

  status: SubscriptionStatus;
  billingCycle: BillingCycle;

  currentPeriodStart: ISODateString;
  currentPeriodEnd: ISODateString;
  trialEnd?: ISODateString;
  canceledAt?: ISODateString;
  cancelAtPeriodEnd: boolean;

  /** Running count of conversations consumed this billing period */
  conversationsUsed: number;
  messagesUsed: number;

  /** Overage charges accrued (in USD cents) for conversations beyond limit */
  overageAmount: number;

  externalSubscriptionId?: string; // e.g. Stripe subscription ID
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─────────────────────────────────────────────
// Tenant
// ─────────────────────────────────────────────

export type TenantStatus = 'active' | 'suspended' | 'pending' | 'deactivated';

export interface Tenant {
  id: UUID;
  name: string;
  slug: string;
  domain?: string;
  logoUrl?: string;

  whatsappPhoneNumber?: string;
  whatsappBusinessAccountId?: string;
  whatsappAccessToken?: string;

  status: TenantStatus;
  subscriptionId?: UUID;
  subscription?: Subscription;

  settings?: TenantSettings;

  ownerEmail: string;
  ownerName: string;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface TenantSettings {
  currency: string;         // e.g. 'USD', 'NGN'
  timezone: string;         // e.g. 'Africa/Lagos'
  language: string;         // e.g. 'en'
  orderPrefix: string;      // e.g. 'ORD-'
  autoConfirmOrders: boolean;
  enableDelivery: boolean;
  enablePickup: boolean;
  catalogVisibility: 'public' | 'whatsapp_only';
  notificationEmail?: string;
}

// ─────────────────────────────────────────────
// User
// ─────────────────────────────────────────────

export type UserRole = 'owner' | 'seller' | 'staff' | 'admin' | 'support';

export interface User {
  id: UUID;
  tenantId?: UUID;
  phone: string;
  name: string;
  email?: string;
  role: UserRole;
  language?: string;
  is_active?: boolean;
  lastLoginAt?: ISODateString;
  createdAt?: ISODateString;
}

/** Super admin user from /admin/auth/login */
export interface SuperAdminUser {
  id: UUID;
  email: string;
  name: string;
  role: 'admin' | 'support';
  createdAt: ISODateString;
}

// ─────────────────────────────────────────────
// Customer
// ─────────────────────────────────────────────

export type CustomerStatus = 'active' | 'blocked' | 'unsubscribed';

export interface Customer {
  id: UUID;
  tenantId: UUID;
  whatsappPhone: string;
  whatsappName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
  status: CustomerStatus;
  address?: Address;
  tags: string[];
  segmentIds: UUID[];
  totalOrders: number;
  totalSpent: number;       // in smallest currency unit
  lastOrderAt?: ISODateString;
  lastSeenAt?: ISODateString;
  optedInAt?: ISODateString;
  optedOutAt?: ISODateString;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─────────────────────────────────────────────
// Category
// ─────────────────────────────────────────────

export interface Category {
  id: UUID;
  tenantId: UUID;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  parentId?: UUID;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─────────────────────────────────────────────
// Product
// ─────────────────────────────────────────────

export type ProductStatus = 'active' | 'draft' | 'archived' | 'out_of_stock';

export interface ProductVariant {
  id: UUID;
  name: string;             // e.g. 'Red / L'
  sku?: string;
  price: number;            // in smallest currency unit
  compareAtPrice?: number;
  stockQuantity: number;
  attributes: Record<string, string>; // e.g. { color: 'Red', size: 'L' }
  imageUrl?: string;
}

export interface Product {
  id: UUID;
  tenantId: UUID;
  categoryId?: UUID;
  category?: Category;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  imageUrls: string[];
  price: number;            // base price in smallest currency unit
  compareAtPrice?: number;
  sku?: string;
  barcode?: string;
  status: ProductStatus;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold?: number;
  weight?: number;          // in grams
  variants: ProductVariant[];
  tags: string[];
  whatsappCatalogId?: string;
  metadata?: Record<string, unknown>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─────────────────────────────────────────────
// Order
// ─────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'canceled'
  | 'refunded';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';

export interface OrderItem {
  id: UUID;
  orderId: UUID;
  productId: UUID;
  product?: Pick<Product, 'id' | 'name' | 'imageUrls' | 'sku'>;
  variantId?: UUID;
  variantName?: string;
  quantity: number;
  unitPrice: number;        // price at time of order
  totalPrice: number;
  notes?: string;
}

export interface Order {
  id: UUID;
  tenantId: UUID;
  customerId: UUID;
  customer?: Pick<Customer, 'id' | 'whatsappPhone' | 'whatsappName' | 'firstName' | 'lastName'>;
  orderNumber: string;      // human-readable, e.g. 'ORD-0042'
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  shippingAddress?: Address;
  notes?: string;
  conversationId?: UUID;
  deliveryId?: UUID;
  paymentId?: UUID;
  cancelReason?: string;
  confirmedAt?: ISODateString;
  shippedAt?: ISODateString;
  deliveredAt?: ISODateString;
  canceledAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface OrderStats {
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  completedOrders: number;
  canceledOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  revenueToday: number;
  ordersToday: number;
}

// ─────────────────────────────────────────────
// Payment
// ─────────────────────────────────────────────

export type PaymentMethod =
  | 'bank_transfer'
  | 'cash_on_delivery'
  | 'card'
  | 'mobile_money'
  | 'crypto'
  | 'other';

export type PaymentVerificationStatus = 'pending' | 'verified' | 'rejected' | 'disputed';

export interface Payment {
  id: UUID;
  tenantId: UUID;
  orderId: UUID;
  order?: Pick<Order, 'id' | 'orderNumber' | 'totalAmount' | 'currency'>;
  customerId: UUID;
  amount: number;
  currency: string;
  method: PaymentMethod;
  verificationStatus: PaymentVerificationStatus;
  reference?: string;       // customer-provided reference / bank ref
  proofImageUrl?: string;   // uploaded payment proof
  verifiedBy?: UUID;        // user who verified
  verifiedAt?: ISODateString;
  rejectedReason?: string;
  notes?: string;
  externalTransactionId?: string;
  metadata?: Record<string, unknown>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─────────────────────────────────────────────
// Delivery
// ─────────────────────────────────────────────

export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'returned';

export interface Delivery {
  id: UUID;
  tenantId: UUID;
  orderId: UUID;
  order?: Pick<Order, 'id' | 'orderNumber' | 'shippingAddress'>;
  customerId: UUID;
  status: DeliveryStatus;
  trackingNumber?: string;
  courierName?: string;
  courierPhone?: string;
  estimatedDeliveryAt?: ISODateString;
  actualDeliveryAt?: ISODateString;
  deliveryAddress: Address;
  deliveryNotes?: string;
  failureReason?: string;
  proofImageUrl?: string;   // proof of delivery image
  assignedAt?: ISODateString;
  pickedUpAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─────────────────────────────────────────────
// Inventory
// ─────────────────────────────────────────────

export type InventoryMovementType =
  | 'purchase'
  | 'sale'
  | 'return'
  | 'adjustment'
  | 'write_off'
  | 'transfer';

export interface InventoryItem {
  id: UUID;
  tenantId: UUID;
  productId: UUID;
  product?: Pick<Product, 'id' | 'name' | 'sku' | 'imageUrls'>;
  variantId?: UUID;
  variantName?: string;
  currentStock: number;
  reservedStock: number;     // units committed to unfulfilled orders
  availableStock: number;    // currentStock - reservedStock
  lowStockThreshold: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  isLowStock: boolean;
  warehouseLocation?: string;
  lastMovementAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface InventoryMovement {
  id: UUID;
  tenantId: UUID;
  inventoryItemId: UUID;
  productId: UUID;
  variantId?: UUID;
  type: InventoryMovementType;
  quantity: number;          // positive = in, negative = out
  previousStock: number;
  newStock: number;
  referenceId?: UUID;        // e.g. orderId or purchaseOrderId
  referenceType?: string;
  notes?: string;
  createdBy?: UUID;
  createdAt: ISODateString;
}

// ─────────────────────────────────────────────
// Segment
// ─────────────────────────────────────────────

export type SegmentRuleOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'in'
  | 'not_in'
  | 'is_set'
  | 'is_not_set';

export interface SegmentRule {
  field: string;            // e.g. 'totalSpent', 'lastOrderAt', 'tags'
  operator: SegmentRuleOperator;
  value: unknown;
  valueEnd?: unknown;       // for 'between' operator
}

export type SegmentConditionLogic = 'AND' | 'OR';

export interface Segment {
  id: UUID;
  tenantId: UUID;
  name: string;
  description?: string;
  conditionLogic: SegmentConditionLogic;
  rules: SegmentRule[];
  isDynamic: boolean;       // recalculated automatically vs manual
  customerCount: number;
  lastCalculatedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─────────────────────────────────────────────
// Campaign
// ─────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'completed' | 'paused' | 'failed' | 'canceled';
export type CampaignType = 'broadcast' | 'drip' | 'triggered';
export type CampaignMessageType = 'text' | 'image' | 'video' | 'document' | 'template' | 'interactive';

export interface CampaignMessage {
  type: CampaignMessageType;
  content: string;
  mediaUrl?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  buttons?: Array<{ type: 'reply' | 'url' | 'phone'; text: string; value: string }>;
  delayMinutes?: number;    // for drip campaigns
}

export interface Campaign {
  id: UUID;
  tenantId: UUID;
  name: string;
  description?: string;
  type: CampaignType;
  status: CampaignStatus;
  targetSegmentIds: UUID[];
  segments?: Pick<Segment, 'id' | 'name' | 'customerCount'>[];
  messages: CampaignMessage[];
  scheduledAt?: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  stats?: CampaignStats;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CampaignStats {
  totalRecipients: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  optOuts: number;
  deliveryRate: number;     // percentage
  readRate: number;
  replyRate: number;
}

// ─────────────────────────────────────────────
// Conversation & Message
// ─────────────────────────────────────────────

export type ConversationStatus = 'open' | 'pending' | 'resolved' | 'bot_handling';
export type ConversationChannel = 'whatsapp';

export interface Conversation {
  id: UUID;
  tenantId: UUID;
  customerId: UUID;
  customer?: Pick<Customer, 'id' | 'whatsappPhone' | 'whatsappName' | 'firstName' | 'lastName' | 'avatarUrl'>;
  assignedTo?: UUID;
  assignedUser?: Pick<User, 'id' | 'name'>;
  channel: ConversationChannel;
  status: ConversationStatus;
  subject?: string;
  lastMessageAt?: ISODateString;
  lastMessagePreview?: string;
  unreadCount: number;
  tags: string[];
  orderId?: UUID;
  campaignId?: UUID;
  /** WhatsApp 24-hour window: whether agent can still send free-form messages */
  withinServiceWindow: boolean;
  serviceWindowExpiresAt?: ISODateString;
  resolvedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contacts' | 'template' | 'interactive' | 'reaction' | 'system';

export interface Message {
  id: UUID;
  tenantId: UUID;
  conversationId: UUID;
  customerId: UUID;
  senderId?: UUID;          // user ID for outbound messages
  direction: MessageDirection;
  type: MessageType;
  status: MessageStatus;
  content?: string;         // text content
  mediaUrl?: string;
  mediaType?: string;
  mediaSizeBytes?: number;
  mediaCaption?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  reactionEmoji?: string;
  replyToMessageId?: UUID;
  whatsappMessageId?: string; // external WA message ID
  failureReason?: string;
  metadata?: Record<string, unknown>;
  sentAt?: ISODateString;
  deliveredAt?: ISODateString;
  readAt?: ISODateString;
  createdAt: ISODateString;
}

// ─────────────────────────────────────────────
// Workflow Builder
// ─────────────────────────────────────────────

export type WorkflowNodeType =
  | 'trigger'
  | 'message'
  | 'condition'
  | 'action'
  | 'delay'
  | 'assign'
  | 'tag'
  | 'api_call'
  | 'end';

export interface WorkflowNodeData {
  label: string;
  description?: string;
  [key: string]: unknown;
}

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;           // node ID
  target: string;           // node ID
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  condition?: string;       // expression evaluated at runtime
}

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';
export type WorkflowTriggerType =
  | 'message_received'
  | 'keyword_match'
  | 'order_created'
  | 'order_status_changed'
  | 'payment_received'
  | 'customer_created'
  | 'campaign_reply'
  | 'scheduled'
  | 'manual';

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  config?: Record<string, unknown>; // trigger-specific configuration
}

export interface Workflow {
  id: UUID;
  tenantId: UUID;
  name: string;
  description?: string;
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  version: number;
  executionCount: number;
  lastExecutedAt?: ISODateString;
  createdBy?: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
