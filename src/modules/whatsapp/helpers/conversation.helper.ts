import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { Tenant } from '../../../database/entities/public/tenant.entity';
import { Subscription } from '../../../database/entities/public/subscription.entity';

@Injectable()
export class ConversationHelper {
  private readonly logger = new Logger(ConversationHelper.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async getOrCreateCustomer(schema: string, phone: string, name?: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let customer = await qr.query(
        `SELECT * FROM customers WHERE phone = $1`,
        [phone],
      );

      if (customer.length === 0) {
        customer = await qr.query(
          `INSERT INTO customers (phone, name) VALUES ($1, $2) RETURNING *`,
          [phone, name || phone],
        );
      }

      return customer[0];
    });
  }

  async getOrCreateConversation(schema: string, customerId: string, phone: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let convo = await qr.query(
        `SELECT * FROM conversations WHERE customer_id = $1 AND status = 'open'`,
        [customerId],
      );

      if (convo.length === 0) {
        convo = await qr.query(
          `INSERT INTO conversations (customer_id, phone, status) VALUES ($1, $2, 'open') RETURNING *`,
          [customerId, phone],
        );

        // New conversation created — increment the tenant's conversation counter
        await this.incrementConversationCount(schema);
      }

      return convo[0];
    });
  }

  /**
   * Increment conversations_used on the tenant's active subscription.
   * A WhatsApp "conversation" = one 24-hour messaging window with a customer.
   */
  private async incrementConversationCount(schema: string): Promise<void> {
    try {
      const tenant = await this.tenantRepository.findOne({
        where: { schemaName: schema },
      });
      if (!tenant) return;

      await this.subscriptionRepository
        .createQueryBuilder()
        .update(Subscription)
        .set({ conversationsUsed: () => 'conversations_used + 1' })
        .where('tenant_id = :tenantId AND status = :status', {
          tenantId: tenant.id,
          status: 'active',
        })
        .execute();
    } catch (err: any) {
      this.logger.error(`Failed to increment conversation count: ${err.message}`);
    }
  }

  /**
   * Check if the tenant can start a new conversation (within limits).
   */
  async canStartConversation(schema: string): Promise<{ allowed: boolean; reason?: string }> {
    const tenant = await this.tenantRepository.findOne({
      where: { schemaName: schema },
    });
    if (!tenant) return { allowed: false, reason: 'Tenant not found' };

    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId: tenant.id, status: 'active' },
    });
    if (!subscription) return { allowed: false, reason: 'No active subscription' };

    if (subscription.validUntil && new Date() > new Date(subscription.validUntil)) {
      return { allowed: false, reason: 'Trial expired' };
    }

    if (subscription.conversationsUsed >= subscription.maxConversations) {
      return { allowed: false, reason: 'Conversation limit reached' };
    }

    return { allowed: true };
  }
}
