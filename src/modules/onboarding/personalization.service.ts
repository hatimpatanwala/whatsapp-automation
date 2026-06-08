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

    return {
      success: true,
      created: createdWorkflows,
      errors,
      message: `${createdWorkflows.length} workflow(s) created and activated`,
    };
  }
}
