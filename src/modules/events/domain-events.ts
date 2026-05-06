export abstract class DomainEvent {
  readonly occurredAt: Date = new Date();
  abstract readonly eventName: string;

  constructor(public readonly tenantSchema: string) {}
}

// Order Events
export class OrderCreatedEvent extends DomainEvent {
  readonly eventName = 'order.created';
  constructor(
    schema: string,
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly orderNumber: string,
    public readonly total: number,
  ) {
    super(schema);
  }
}

export class OrderStatusChangedEvent extends DomainEvent {
  readonly eventName = 'order.status_changed';
  constructor(
    schema: string,
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly oldStatus: string,
    public readonly newStatus: string,
  ) {
    super(schema);
  }
}

// Payment Events
export class PaymentVerifiedEvent extends DomainEvent {
  readonly eventName = 'payment.verified';
  constructor(
    schema: string,
    public readonly paymentId: string,
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly amount: number,
  ) {
    super(schema);
  }
}

export class PaymentRejectedEvent extends DomainEvent {
  readonly eventName = 'payment.rejected';
  constructor(
    schema: string,
    public readonly paymentId: string,
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly reason: string,
  ) {
    super(schema);
  }
}

export class PaymentExpiredEvent extends DomainEvent {
  readonly eventName = 'payment.expired';
  constructor(
    schema: string,
    public readonly paymentId: string,
    public readonly orderId: string,
    public readonly customerId: string,
  ) {
    super(schema);
  }
}

// Inventory Events
export class StockReservedEvent extends DomainEvent {
  readonly eventName = 'inventory.stock_reserved';
  constructor(
    schema: string,
    public readonly inventoryId: string,
    public readonly reservationId: string,
    public readonly quantity: number,
  ) {
    super(schema);
  }
}

export class StockLowEvent extends DomainEvent {
  readonly eventName = 'inventory.stock_low';
  constructor(
    schema: string,
    public readonly productId: string,
    public readonly productName: string,
    public readonly currentStock: number,
    public readonly threshold: number,
  ) {
    super(schema);
  }
}

export class ReservationExpiredEvent extends DomainEvent {
  readonly eventName = 'inventory.reservation_expired';
  constructor(
    schema: string,
    public readonly reservationId: string,
    public readonly inventoryId: string,
    public readonly quantity: number,
  ) {
    super(schema);
  }
}

// Customer Events
export class CustomerCreatedEvent extends DomainEvent {
  readonly eventName = 'customer.created';
  constructor(
    schema: string,
    public readonly customerId: string,
    public readonly phone: string,
  ) {
    super(schema);
  }
}

// WhatsApp Events
export class WhatsAppMessageReceivedEvent extends DomainEvent {
  readonly eventName = 'whatsapp.message_received';
  constructor(
    schema: string,
    public readonly messageId: string,
    public readonly from: string,
    public readonly type: string,
    public readonly content: any,
  ) {
    super(schema);
  }
}

export class WhatsAppMessageSentEvent extends DomainEvent {
  readonly eventName = 'whatsapp.message_sent';
  constructor(
    schema: string,
    public readonly messageId: string,
    public readonly to: string,
  ) {
    super(schema);
  }
}

// Campaign Events
export class CampaignStartedEvent extends DomainEvent {
  readonly eventName = 'campaign.started';
  constructor(
    schema: string,
    public readonly campaignId: string,
    public readonly totalRecipients: number,
  ) {
    super(schema);
  }
}

export class CampaignCompletedEvent extends DomainEvent {
  readonly eventName = 'campaign.completed';
  constructor(
    schema: string,
    public readonly campaignId: string,
    public readonly sentCount: number,
    public readonly failedCount: number,
  ) {
    super(schema);
  }
}

// Delivery Events
export class DeliveryStatusChangedEvent extends DomainEvent {
  readonly eventName = 'delivery.status_changed';
  constructor(
    schema: string,
    public readonly deliveryId: string,
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly oldStatus: string,
    public readonly newStatus: string,
  ) {
    super(schema);
  }
}
