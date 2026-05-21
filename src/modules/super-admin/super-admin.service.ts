import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { SuperAdmin } from '../../database/entities/public/super-admin.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { Subscription } from '../../database/entities/public/subscription.entity';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectRepository(SuperAdmin)
    private readonly adminRepository: Repository<SuperAdmin>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  async login(email: string, password: string): Promise<any> {
    const admin = await this.adminRepository.findOne({ where: { email } });
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const { passwordHash, ...result } = admin;
    return result;
  }

  async findById(id: string): Promise<any> {
    const admin = await this.adminRepository.findOne({ where: { id } });
    if (!admin) return null;
    const { passwordHash, ...result } = admin;
    return result;
  }

  async getPlatformStats(): Promise<any> {
    const totalTenants = await this.tenantRepository.count();
    const activeTenants = await this.tenantRepository.count({ where: { status: 'active' } });
    const suspendedTenants = await this.tenantRepository.count({ where: { status: 'suspended' } });

    return {
      totalTenants,
      activeTenants,
      suspendedTenants,
    };
  }

  async getTenantUsage(tenantId: string): Promise<any> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId, status: 'active' },
    });

    return {
      subscription,
      conversationsUsed: subscription?.conversationsUsed || 0,
      conversationsLimit: subscription?.maxConversations || 0,
      productsLimit: subscription?.maxProducts || 0,
    };
  }

  async updateSubscription(subscriptionId: string, data: Partial<Subscription>): Promise<Subscription> {
    await this.subscriptionRepository.update(subscriptionId, data);
    return this.subscriptionRepository.findOne({ where: { id: subscriptionId } });
  }

  async getTenantSchema(tenantId: string): Promise<string> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    return tenant.schemaName;
  }
}
