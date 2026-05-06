import { DeliveryProvider } from './delivery-provider.interface';

export class SelfManagedProvider implements DeliveryProvider {
  name = 'self_managed';

  async createShipment(orderDetails: any): Promise<{ trackingId: string; trackingUrl?: string }> {
    // Self-managed doesn't need external tracking
    return { trackingId: `SELF-${Date.now()}` };
  }

  async getStatus(trackingId: string): Promise<string> {
    // Status is managed manually through the dashboard
    return 'pending';
  }

  async cancelShipment(trackingId: string): Promise<boolean> {
    return true;
  }
}
