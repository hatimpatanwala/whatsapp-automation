export interface DeliveryProvider {
  name: string;
  createShipment(orderDetails: any): Promise<{ trackingId: string; trackingUrl?: string }>;
  getStatus(trackingId: string): Promise<string>;
  cancelShipment(trackingId: string): Promise<boolean>;
}
