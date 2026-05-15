import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, Logger } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { SubscriptionPlan } from '../../database/entities/public/subscription-plan.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';

@Controller('admin/tenants')
export class TenantController {
  private readonly logger = new Logger(TenantController.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly provisioningService: TenantProvisioningService,
    private readonly tenantConn: TenantConnectionManager,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumberRepo: Repository<PhoneNumber>,
  ) {}

  @Get()
  @Roles('admin', 'support')
  async findAll() {
    const tenants = await this.tenantService.findAll();
    // Attach subscription info for each tenant
    const tenantsWithSubs = await Promise.all(
      tenants.map(async (t) => {
        const subscriptions = await this.subscriptionRepo.find({
          where: { tenantId: t.id },
          order: { createdAt: 'DESC' },
          take: 1,
        });
        return { ...t, subscriptions };
      }),
    );
    return tenantsWithSubs;
  }

  @Get(':id')
  @Roles('admin', 'support')
  async findOne(@Param('id') id: string) {
    const tenant = await this.tenantService.findById(id);
    const subscriptions = await this.subscriptionRepo.find({
      where: { tenantId: id },
      order: { createdAt: 'DESC' },
    });
    const phones = await this.phoneNumberRepo.find({
      where: { tenantId: id },
    });
    return { ...tenant, subscriptions, phoneNumbers: phones };
  }

  @Post()
  @Roles('admin')
  async create(@Body() dto: CreateTenantDto) {
    return this.provisioningService.provisionTenant(dto);
  }

  @Patch(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: Record<string, any>) {
    // Only allow updating safe fields
    const allowed = ['name', 'slug', 'status', 'onboardingStatus', 'businessName', 'businessCategory', 'businessDescription', 'businessAddress', 'logoUrl', 'whatsappPhone'];
    const data: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    return this.tenantService.update(id, data);
  }

  @Put(':id/suspend')
  @Roles('admin')
  async suspend(@Param('id') id: string) {
    await this.tenantService.suspend(id);
    return { message: 'Tenant suspended' };
  }

  @Put(':id/activate')
  @Roles('admin')
  async activate(@Param('id') id: string) {
    await this.tenantService.activate(id);
    return { message: 'Tenant activated' };
  }

  @Post(':id/suspend')
  @Roles('admin')
  async suspendPost(@Param('id') id: string) {
    await this.tenantService.suspend(id);
    return { message: 'Tenant suspended' };
  }

  @Post(':id/activate')
  @Roles('admin')
  async activatePost(@Param('id') id: string) {
    await this.tenantService.activate(id);
    return { message: 'Tenant activated' };
  }

  /**
   * Get tenant's schema settings (workflow, business config etc.)
   * Does NOT return customer/order data.
   */
  @Get(':id/settings')
  @Roles('admin', 'support')
  async getSettings(@Param('id') id: string) {
    const tenant = await this.tenantService.findById(id);
    if (!tenant.schemaName) {
      return {};
    }
    try {
      return await this.tenantConn.executeInTenantContext(tenant.schemaName, async (qr) => {
        const rows = await qr.query(`SELECT key, value FROM "${tenant.schemaName}".settings`);
        const settings: Record<string, any> = {};
        rows.forEach((r: any) => {
          try {
            settings[r.key] = JSON.parse(r.value);
          } catch {
            settings[r.key] = r.value;
          }
        });
        return settings;
      });
    } catch (err) {
      this.logger.warn(`Could not read settings for tenant ${id}: ${(err as any).message}`);
      return {};
    }
  }

  /**
   * Update tenant's schema settings from super admin.
   * Only updates the settings table within the tenant schema.
   */
  @Put(':id/settings')
  @Roles('admin')
  async updateSettings(@Param('id') id: string, @Body() body: Record<string, any>) {
    const tenant = await this.tenantService.findById(id);
    if (!tenant.schemaName) {
      return { message: 'Tenant has no schema' };
    }
    return this.tenantConn.executeInTenantContext(tenant.schemaName, async (qr) => {
      for (const [key, value] of Object.entries(body)) {
        await qr.query(
          `INSERT INTO "${tenant.schemaName}".settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, JSON.stringify(value)],
        );
      }
      return { message: 'Settings updated' };
    });
  }

  /**
   * Get subscription for a specific tenant, including plan details.
   */
  @Get(':id/subscription')
  @Roles('admin', 'support')
  async getSubscription(@Param('id') id: string) {
    const sub = await this.subscriptionRepo.findOne({
      where: { tenantId: id, status: 'active' },
      relations: ['subscriptionPlan'],
    });
    if (!sub) return { message: 'No active subscription' };
    return {
      ...sub,
      planName: sub.subscriptionPlan?.name,
      planTier: sub.subscriptionPlan?.tier,
      enabledFeatures: sub.subscriptionPlan?.getEnabledFeatures() ?? [],
      planFeatures: sub.subscriptionPlan?.features ?? {},
      planLimits: sub.subscriptionPlan?.limits ?? {},
    };
  }

  /**
   * Assign or change a tenant's subscription plan.
   * Supports setting expiry date and feature overrides.
   */
  @Post(':id/subscription')
  @Roles('admin')
  async assignPlan(
    @Param('id') id: string,
    @Body() body: {
      planId: string;
      validUntil?: string;
      featureOverrides?: Record<string, boolean>;
    },
  ) {
    const tenant = await this.tenantService.findById(id);
    const plan = await this.planRepo.findOne({ where: { id: body.planId } });
    if (!plan) {
      return { error: 'Plan not found' };
    }

    // Deactivate any current active subscription
    await this.subscriptionRepo.update(
      { tenantId: id, status: 'active' },
      { status: 'canceled' },
    );

    // Merge feature overrides into plan features if provided
    const features = { ...(plan.features || {}) };
    if (body.featureOverrides) {
      Object.assign(features, body.featureOverrides);
    }

    // Create new subscription
    const now = new Date();
    const sub = this.subscriptionRepo.create({
      tenantId: id,
      planId: plan.id,
      plan: plan.tier,
      maxProducts: plan.limits?.productLimit ?? 9999,
      maxConversations: plan.limits?.conversationLimit ?? 9999,
      maxCampaignsPerMonth: plan.limits?.campaignLimit ?? 9999,
      conversationsUsed: 0,
      validFrom: now,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      status: 'active',
      allowExceed: false,
    });
    const saved = await this.subscriptionRepo.save(sub);

    // If feature overrides were provided, store them on the plan or subscription
    // For now, we update the plan features directly for custom plans
    this.logger.log(`Assigned plan ${plan.name} to tenant ${id}, validUntil=${body.validUntil || 'unlimited'}`);

    return {
      ...saved,
      planName: plan.name,
      planTier: plan.tier,
      enabledFeatures: Object.entries(features)
        .filter(([, v]) => v === true)
        .map(([k]) => k),
    };
  }

  /**
   * Update feature overrides for a tenant's active subscription.
   * This allows enabling/disabling individual features without changing the plan.
   */
  @Patch(':id/features')
  @Roles('admin')
  async updateFeatures(
    @Param('id') id: string,
    @Body() body: { features: Record<string, boolean> },
  ) {
    const sub = await this.subscriptionRepo.findOne({
      where: { tenantId: id, status: 'active' },
      relations: ['subscriptionPlan'],
    });
    if (!sub || !sub.subscriptionPlan) {
      return { error: 'No active subscription with a plan' };
    }

    // Create a custom copy of the plan for this tenant if needed
    // For simplicity, we update the plan's features directly if it's a custom plan,
    // or create a new custom plan for this tenant
    const currentPlan = sub.subscriptionPlan;

    if (currentPlan.tier === 'custom') {
      // Update the custom plan directly
      const merged = { ...(currentPlan.features || {}), ...body.features };
      await this.planRepo.update(currentPlan.id, { features: merged });
    } else {
      // Create a new custom plan based on the current one
      const customPlan = this.planRepo.create({
        name: `${currentPlan.name} (Custom - ${id.substring(0, 8)})`,
        tier: 'custom',
        description: `Custom plan based on ${currentPlan.name}`,
        monthlyPrice: currentPlan.monthlyPrice,
        yearlyPrice: currentPlan.yearlyPrice,
        pricePerConversation: currentPlan.pricePerConversation,
        limits: { ...currentPlan.limits },
        features: { ...(currentPlan.features || {}), ...body.features },
        isActive: false, // Don't show in public plan list
        sortOrder: 99,
      });
      const savedPlan = await this.planRepo.save(customPlan);

      // Point the subscription to the new custom plan
      await this.subscriptionRepo.update(sub.id, { planId: savedPlan.id });
    }

    return { message: 'Features updated', features: body.features };
  }

  /**
   * Get phone numbers assigned to a tenant.
   */
  @Get(':id/phones')
  @Roles('admin', 'support')
  async getPhones(@Param('id') id: string) {
    return this.phoneNumberRepo.find({
      where: { tenantId: id },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Workflow management for tenant ──────────────────────────────────

  /**
   * List all workflows for a tenant (reads from tenant schema).
   */
  @Get(':id/workflows')
  @Roles('admin', 'support')
  async getWorkflows(@Param('id') id: string) {
    const tenant = await this.tenantService.findById(id);
    if (!tenant.schemaName) return [];
    try {
      return await this.tenantConn.executeInTenantContext(tenant.schemaName, async (qr) => {
        return qr.query(
          `SELECT id, name, description, status, trigger, execution_count, last_executed_at, created_at, updated_at
           FROM "${tenant.schemaName}".workflows ORDER BY updated_at DESC`,
        );
      });
    } catch {
      return [];
    }
  }

  /**
   * Get a single workflow with full definition (nodes/edges).
   */
  @Get(':id/workflows/:workflowId')
  @Roles('admin', 'support')
  async getWorkflow(@Param('id') id: string, @Param('workflowId') workflowId: string) {
    const tenant = await this.tenantService.findById(id);
    if (!tenant.schemaName) return null;
    return this.tenantConn.executeInTenantContext(tenant.schemaName, async (qr) => {
      const rows = await qr.query(
        `SELECT * FROM "${tenant.schemaName}".workflows WHERE id = $1`,
        [workflowId],
      );
      return rows[0] || null;
    });
  }

  /**
   * Create a new workflow for a tenant.
   */
  @Post(':id/workflows')
  @Roles('admin')
  async createWorkflow(
    @Param('id') id: string,
    @Body() body: { name: string; description?: string; trigger?: any; nodes?: any[]; edges?: any[] },
  ) {
    const tenant = await this.tenantService.findById(id);
    if (!tenant.schemaName) return { error: 'Tenant has no schema' };
    return this.tenantConn.executeInTenantContext(tenant.schemaName, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${tenant.schemaName}".workflows (name, description, trigger, nodes, edges, status)
         VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING *`,
        [
          body.name,
          body.description || '',
          JSON.stringify(body.trigger || { type: 'message_received' }),
          JSON.stringify(body.nodes || []),
          JSON.stringify(body.edges || []),
        ],
      );
      return rows[0];
    });
  }

  /**
   * Save workflow definition (nodes/edges) for a tenant.
   */
  @Put(':id/workflows/:workflowId')
  @Roles('admin')
  async updateWorkflow(
    @Param('id') id: string,
    @Param('workflowId') workflowId: string,
    @Body() body: { nodes?: any[]; edges?: any[]; name?: string; description?: string; status?: string },
  ) {
    const tenant = await this.tenantService.findById(id);
    if (!tenant.schemaName) return { error: 'Tenant has no schema' };
    return this.tenantConn.executeInTenantContext(tenant.schemaName, async (qr) => {
      const sets: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (body.nodes !== undefined) { sets.push(`nodes = $${idx++}`); params.push(JSON.stringify(body.nodes)); }
      if (body.edges !== undefined) { sets.push(`edges = $${idx++}`); params.push(JSON.stringify(body.edges)); }
      if (body.name) { sets.push(`name = $${idx++}`); params.push(body.name); }
      if (body.description !== undefined) { sets.push(`description = $${idx++}`); params.push(body.description); }
      if (body.status) { sets.push(`status = $${idx++}`); params.push(body.status); }
      sets.push('updated_at = NOW()');
      params.push(workflowId);

      const rows = await qr.query(
        `UPDATE "${tenant.schemaName}".workflows SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
      return rows[0] || null;
    });
  }

  /**
   * Delete a workflow for a tenant.
   */
  @Delete(':id/workflows/:workflowId')
  @Roles('admin')
  async deleteWorkflow(@Param('id') id: string, @Param('workflowId') workflowId: string) {
    const tenant = await this.tenantService.findById(id);
    if (!tenant.schemaName) return { error: 'Tenant has no schema' };
    await this.tenantConn.executeInTenantContext(tenant.schemaName, async (qr) => {
      await qr.query(`DELETE FROM "${tenant.schemaName}".workflows WHERE id = $1`, [workflowId]);
    });
    return { message: 'Workflow deleted' };
  }
}
