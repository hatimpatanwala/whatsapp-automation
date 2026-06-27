import { SendTextNodeHandler } from './send-text.handler';
import { SendButtonsNodeHandler } from './send-buttons.handler';
import { SendListNodeHandler } from './send-list.handler';
import { SendImageNodeHandler } from './send-image.handler';
import { SendTemplateNodeHandler } from './send-template.handler';
import { ConditionNodeHandler } from './condition.handler';
import { SwitchNodeHandler } from './switch.handler';
import { WaitForReplyNodeHandler } from './wait-for-reply.handler';
import { DelayNodeHandler } from './delay.handler';
import { EndNodeHandler } from './end.handler';
import { ShowCatalogNodeHandler } from './show-catalog.handler';
import { AddToCartNodeHandler } from './add-to-cart.handler';
import { ViewCartNodeHandler } from './view-cart.handler';
import { CheckoutNodeHandler } from './checkout.handler';
import { InventoryCheckNodeHandler } from './inventory-check.handler';
import { SearchProductsNodeHandler } from './search-products.handler';
import { FilterProductsNodeHandler } from './filter-products.handler';
import { PaymentQrNodeHandler } from './payment-qr.handler';
import { TagCustomerNodeHandler } from './tag-customer.handler';
import { UpdateOrderNodeHandler } from './update-order.handler';
import { AssignAgentNodeHandler } from './assign-agent.handler';
import { HttpRequestNodeHandler } from './http-request.handler';
import { SetLanguageNodeHandler } from './set-language.handler';
import { FallbackNodeHandler } from './fallback.handler';
import { StartWorkflowNodeHandler } from './start-workflow.handler';
import { SendQuoteNodeHandler } from './send-quote.handler';
import { UpdateQuoteNodeHandler } from './update-quote.handler';
import { MyOrdersNodeHandler } from './my-orders.handler';
import { TrackOrderNodeHandler } from './track-order.handler';
import { ProductCardNodeHandler } from './product-card.handler';
import { OrderDetailsNodeHandler } from './order-details.handler';
import { PaymentReceiptNodeHandler } from './payment-receipt.handler';

// Re-export all
export {
  SendTextNodeHandler,
  SendButtonsNodeHandler,
  SendListNodeHandler,
  SendImageNodeHandler,
  SendTemplateNodeHandler,
  ConditionNodeHandler,
  SwitchNodeHandler,
  WaitForReplyNodeHandler,
  DelayNodeHandler,
  EndNodeHandler,
  ShowCatalogNodeHandler,
  AddToCartNodeHandler,
  ViewCartNodeHandler,
  CheckoutNodeHandler,
  InventoryCheckNodeHandler,
  SearchProductsNodeHandler,
  FilterProductsNodeHandler,
  PaymentQrNodeHandler,
  TagCustomerNodeHandler,
  UpdateOrderNodeHandler,
  AssignAgentNodeHandler,
  HttpRequestNodeHandler,
  SetLanguageNodeHandler,
  FallbackNodeHandler,
  StartWorkflowNodeHandler,
  SendQuoteNodeHandler,
  UpdateQuoteNodeHandler,
  MyOrdersNodeHandler,
  TrackOrderNodeHandler,
  ProductCardNodeHandler,
  OrderDetailsNodeHandler,
  PaymentReceiptNodeHandler,
};

/** All node handler classes for DI registration */
export const ALL_NODE_HANDLERS = [
  SendTextNodeHandler,
  SendButtonsNodeHandler,
  SendListNodeHandler,
  SendImageNodeHandler,
  SendTemplateNodeHandler,
  ConditionNodeHandler,
  SwitchNodeHandler,
  WaitForReplyNodeHandler,
  DelayNodeHandler,
  EndNodeHandler,
  ShowCatalogNodeHandler,
  AddToCartNodeHandler,
  ViewCartNodeHandler,
  CheckoutNodeHandler,
  InventoryCheckNodeHandler,
  SearchProductsNodeHandler,
  FilterProductsNodeHandler,
  PaymentQrNodeHandler,
  TagCustomerNodeHandler,
  UpdateOrderNodeHandler,
  AssignAgentNodeHandler,
  HttpRequestNodeHandler,
  SetLanguageNodeHandler,
  FallbackNodeHandler,
  StartWorkflowNodeHandler,
  SendQuoteNodeHandler,
  UpdateQuoteNodeHandler,
  MyOrdersNodeHandler,
  TrackOrderNodeHandler,
  ProductCardNodeHandler,
  OrderDetailsNodeHandler,
  PaymentReceiptNodeHandler,
];
