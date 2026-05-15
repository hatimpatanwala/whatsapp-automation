import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from '../../database/entities/public/subscription-plan.entity';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class SubscriptionPlanService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionPlanService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  async onModuleInit() {
    try {
      // Ensure the table exists (handles both synchronize=true and false cases)
      await this.ensureTable();
      await this.seedDefaultPlans();
    } catch (err) {
      this.logger.warn(`Could not seed default plans: ${(err as Error).message}`);
    }
  }

  private async ensureTable() {
    const ds = this.planRepository.manager.connection;
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const tableExists = await qr.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_plans')`,
      );
      if (!tableExists[0]?.exists) {
        this.logger.log('Creating subscription_plans table...');
        await qr.query(`
          CREATE TABLE IF NOT EXISTS public.subscription_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            tier VARCHAR(30) NOT NULL,
            description TEXT,
            monthly_price INT DEFAULT 0,
            yearly_price INT DEFAULT 0,
            price_per_conversation INT DEFAULT 0,
            limits JSONB DEFAULT '{}',
            features JSONB DEFAULT '{}',
            is_active BOOLEAN DEFAULT true,
            sort_order INT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        // Also add plan_id to subscriptions if not exists
        await qr.query(`
          ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.subscription_plans(id)
        `);
      }
    } finally {
      await qr.release();
    }
  }

  private async seedDefaultPlans() {
    const count = await this.planRepository.count();
    if (count > 0) return;

    this.logger.log('No subscription plans found. Seeding defaults...');

    const defaults: Partial<SubscriptionPlan>[] = [
      {
        name: 'Trial', tier: 'trial',
        description: 'Free trial with limited features for 30 days',
        monthlyPrice: 0, yearlyPrice: 0, pricePerConversation: 0,
        limits: { conversationLimit: 100, messageLimit: 500, productLimit: 20, campaignLimit: 2, userLimit: 1 },
        features: { deliveries: false, customers: true, campaigns: false, conversations: true, whatsappCatalog: false, workflowBuilder: false, aiFeatures: false, advancedAnalytics: false, multiCatalog: false },
        isActive: true, sortOrder: 0,
      },
      {
        name: 'Starter', tier: 'starter',
        description: 'Perfect for small businesses getting started with WhatsApp commerce',
        monthlyPrice: 4900, yearlyPrice: 49900, pricePerConversation: 5,
        limits: { conversationLimit: 500, messageLimit: 2000, productLimit: 100, campaignLimit: 5, userLimit: 3 },
        features: { deliveries: true, customers: true, campaigns: false, conversations: true, whatsappCatalog: false, workflowBuilder: false, aiFeatures: false, advancedAnalytics: false, multiCatalog: false },
        isActive: true, sortOrder: 1,
      },
      {
        name: 'Growth', tier: 'growth',
        description: 'For growing businesses that need more power and automation',
        monthlyPrice: 19000, yearlyPrice: 190000, pricePerConversation: 3,
        limits: { conversationLimit: 2000, messageLimit: 10000, productLimit: 500, campaignLimit: 20, userLimit: 10 },
        features: { deliveries: true, customers: true, campaigns: true, conversations: true, whatsappCatalog: true, workflowBuilder: true, aiFeatures: false, advancedAnalytics: true, multiCatalog: false },
        isActive: true, sortOrder: 2,
      },
      {
        name: 'Professional', tier: 'professional',
        description: 'Advanced features for scaling your business operations',
        monthlyPrice: 39000, yearlyPrice: 390000, pricePerConversation: 2,
        limits: { conversationLimit: 5000, messageLimit: 30000, productLimit: 2000, campaignLimit: null, userLimit: 25 },
        features: { deliveries: true, customers: true, campaigns: true, conversations: true, whatsappCatalog: true, workflowBuilder: true, aiFeatures: true, advancedAnalytics: true, multiCatalog: true },
        isActive: true, sortOrder: 3,
      },
      {
        name: 'Enterprise', tier: 'enterprise',
        description: 'Unlimited access for large-scale operations with dedicated support',
        monthlyPrice: 79000, yearlyPrice: 790000, pricePerConversation: 1,
        limits: { conversationLimit: null, messageLimit: null, productLimit: null, campaignLimit: null, userLimit: null },
        features: { deliveries: true, customers: true, campaigns: true, conversations: true, whatsappCatalog: true, workflowBuilder: true, aiFeatures: true, advancedAnalytics: true, multiCatalog: true },
        isActive: true, sortOrder: 4,
      },
    ];

    for (const plan of defaults) {
      await this.planRepository.save(this.planRepository.create(plan));
    }
    this.logger.log(`Seeded ${defaults.length} default subscription plans`);
  }

  async findAll(includeInactive = true): Promise<any[]> {
    const where = includeInactive ? {} : { isActive: true };
    const plans = await this.planRepository.find({
      where,
      order: { sortOrder: 'ASC' },
    });

    // Attach tenant count for each plan
    const plansWithCount = await Promise.all(
      plans.map(async (plan) => {
        const tenantCount = await this.subscriptionRepository.count({
          where: { planId: plan.id, status: 'active' },
        });
        return { ...plan, tenantCount };
      }),
    );

    return plansWithCount;
  }

  async findById(id: string): Promise<any> {
    const plan = await this.planRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);

    const tenantCount = await this.subscriptionRepository.count({
      where: { planId: id, status: 'active' },
    });

    return { ...plan, tenantCount };
  }

  async findByTier(tier: string): Promise<SubscriptionPlan | null> {
    return this.planRepository.findOne({ where: { tier, isActive: true } });
  }

  async create(dto: CreatePlanDto): Promise<SubscriptionPlan> {
    const plan = this.planRepository.create({
      name: dto.name,
      tier: dto.tier,
      description: dto.description,
      monthlyPrice: dto.monthlyPrice,
      yearlyPrice: dto.yearlyPrice,
      pricePerConversation: dto.pricePerConversation ?? 0,
      limits: dto.limits ?? {},
      features: dto.features ?? {},
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.planRepository.save(plan);
  }

  async update(id: string, dto: UpdatePlanDto): Promise<SubscriptionPlan> {
    const plan = await this.planRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);

    Object.assign(plan, dto);
    return this.planRepository.save(plan);
  }

  async delete(id: string): Promise<{ message: string }> {
    const plan = await this.planRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);

    const activeCount = await this.subscriptionRepository.count({
      where: { planId: id, status: 'active' },
    });

    if (activeCount > 0) {
      // Soft delete: deactivate if tenants are using it
      plan.isActive = false;
      await this.planRepository.save(plan);
      return { message: `Plan deactivated (${activeCount} active tenants)` };
    }

    await this.planRepository.remove(plan);
    return { message: 'Plan deleted' };
  }

  async toggleActive(id: string, isActive: boolean): Promise<SubscriptionPlan> {
    const plan = await this.planRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);
    plan.isActive = isActive;
    return this.planRepository.save(plan);
  }

  async getPublicPlans(): Promise<SubscriptionPlan[]> {
    return this.planRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }
}
