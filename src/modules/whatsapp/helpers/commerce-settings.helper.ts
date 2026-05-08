import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../config/redis.module';

export interface CommerceSettings {
  catalogEnabled: boolean;
  cartEnabled: boolean;
  orderEnabled: boolean;
  catalogId: string;
  autoCheckout: boolean;
  orderNotification: boolean;
}

const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class CommerceSettingsHelper {
  constructor(
    private readonly connectionManager: TenantConnectionManager,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getCommerceSettings(schema: string): Promise<CommerceSettings> {
    const cacheKey = `commerce:settings:${schema}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fallthrough */ }
    }

    // Load from DB
    const rows = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT key, value FROM settings WHERE key LIKE 'commerce_%'`,
      );
    });

    const raw: Record<string, any> = {};
    (rows || []).forEach((r: any) => {
      try { raw[r.key] = JSON.parse(r.value); } catch { raw[r.key] = r.value; }
    });

    const settings: CommerceSettings = {
      catalogEnabled: raw['commerce_catalog_enabled'] === true,
      cartEnabled: raw['commerce_cart_enabled'] === true,
      orderEnabled: raw['commerce_order_enabled'] === true,
      catalogId: raw['commerce_catalog_id'] || '',
      autoCheckout: raw['commerce_auto_checkout'] === true,
      orderNotification: raw['commerce_order_notification'] !== false,
    };

    await this.redis.set(cacheKey, JSON.stringify(settings), 'EX', CACHE_TTL);
    return settings;
  }

  async invalidateCache(schema: string): Promise<void> {
    await this.redis.del(`commerce:settings:${schema}`);
  }
}
