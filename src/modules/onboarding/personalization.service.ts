import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowService } from '../workflow/workflow.service';
import { Tenant } from '../../database/entities/public/tenant.entity';
import {
  BUSINESS_CATEGORIES,
  FEATURE_OPTIONS,
  getWorkflowTemplates,
} from './business-categories';

export interface PersonalizeDto {
  category: string;
  subcategory: string;
  selectedFeatures: string[]; // feature keys from FEATURE_OPTIONS
}

/**
 * Event/schedule-triggered features (sent automatically) → "Notifications".
 * Everything else is customer-initiated → "Workflows".
 */
export const NOTIFICATION_FEATURE_KEYS = new Set<string>([
  'order_confirmation', 'order_shipped', 'delivery_tracking', 'order_cancellation', 'abandoned_cart',
  'payment_confirmation', 'payment_reminder', 'cod_confirmation',
  'quote_followup', 'quote_accepted', 'back_in_stock', 'appointment_reminder',
  'feedback_after_delivery', 'loyalty_reengagement', 'birthday_wishes', 'referral_program',
  'promotional_broadcast', 'new_customer_welcome',
]);

@Injectable()
export class PersonalizationService {
  private readonly logger = new Logger(PersonalizationService.name);

  constructor(
    private readonly workflowService: WorkflowService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  /** Return all categories with their subcategories and feature options */
  getCategories() {
    return {
      categories: BUSINESS_CATEGORIES.map(c => ({
        value: c.value,
        label: c.label,
        icon: c.icon,
        subcategories: c.subcategories,
        recommendedFeatures: c.recommendedFeatures,
      })),
      features: FEATURE_OPTIONS.map(f => ({
        key: f.key,
        label: f.label,
        description: f.description,
        icon: f.icon,
        group: f.group,
        kind: NOTIFICATION_FEATURE_KEYS.has(f.key) ? 'notification' : 'workflow',
      })),
    };
  }

  /** Create workflows based on user's category, subcategory, and selected features */
  async personalize(tenantId: string, dto: PersonalizeDto) {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const schema = tenant.schemaName;
    const templates = getWorkflowTemplates(dto.category, dto.subcategory);
    const createdWorkflows: { name: string; id: string }[] = [];
    const errors: string[] = [];

    for (const featureKey of dto.selectedFeatures) {
      const feature = FEATURE_OPTIONS.find(f => f.key === featureKey);
      if (!feature) continue;

      const template = templates[feature.workflowTemplateKey];
      if (!template) continue;

      // Event-driven notifications (order/payment/quote) are provided by the
      // shared INTERACTIVE default set (ensureDefaultWorkflows, called below) —
      // skip the per-feature templates so we don't create duplicate/simpler
      // notifications on the same trigger. Customer-initiated (trigger_message)
      // workflows are still created from their templates.
      const trigType = String(template.trigger?.type || '');
      if (trigType === 'trigger_order' || trigType === 'trigger_payment' || trigType === 'trigger_quote') {
        continue;
      }

      try {
        const workflow = await this.workflowService.create(schema, {
          name: template.name,
          description: template.description,
          trigger: template.trigger,
          nodes: template.nodes,
          edges: template.edges,
        });

        // Activate the workflow
        await this.workflowService.activate(schema, workflow.id);

        createdWorkflows.push({ name: template.name, id: workflow.id });
        this.logger.log(`Created workflow "${template.name}" for tenant ${tenantId}`);
      } catch (err: any) {
        this.logger.error(`Failed to create workflow "${template.name}": ${err?.message}`);
        errors.push(template.name);
      }
    }

    // Always ensure the undeletable Welcome hub + its menu spokes exist so the
    // customer has a working entry point regardless of which features were picked.
    try {
      await this.workflowService.ensureDefaultWorkflows(schema);
    } catch (err: any) {
      this.logger.error(`Failed to ensure default workflows: ${err?.message}`);
    }

    return {
      success: true,
      created: createdWorkflows,
      errors,
      message: `${createdWorkflows.length} workflow(s) created and activated`,
    };
  }
}
