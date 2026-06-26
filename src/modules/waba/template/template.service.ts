import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateRegistry } from '../../../database/entities/public/template-registry.entity';
import { MetaCloudApiClient } from '../meta-cloud-api.client';
import { MetaTokenService } from '../meta-token.service';
import { AuditLogService } from '../audit-log.service';
import { DEFAULT_TEMPLATES } from './default-templates';

export interface CreateTemplateInput {
  wabaAccountId: string;
  tenantId?: string;
  templateName: string;
  language: string;
  category: string;
  components: any[];
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectRepository(TemplateRegistry)
    private readonly templateRepo: Repository<TemplateRegistry>,
    private readonly metaApi: MetaCloudApiClient,
    private readonly tokenService: MetaTokenService,
    private readonly auditService: AuditLogService,
  ) {}

  async findAll(wabaAccountId?: string, tenantId?: string): Promise<TemplateRegistry[]> {
    const where: any = {};
    if (wabaAccountId) where.wabaAccountId = wabaAccountId;
    if (tenantId) where.tenantId = tenantId;
    return this.templateRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<TemplateRegistry> {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async findByName(wabaAccountId: string, name: string, language: string): Promise<TemplateRegistry | null> {
    return this.templateRepo.findOne({
      where: { wabaAccountId, templateName: name, language },
    });
  }

  /**
   * Submit a new template to Meta for approval.
   */
  async createAndSubmit(input: CreateTemplateInput): Promise<TemplateRegistry> {
    // Check for duplicate
    const existing = await this.findByName(input.wabaAccountId, input.templateName, input.language);
    if (existing) throw new ConflictException('Template with this name and language already exists');

    // Get access token for this WABA
    const accessToken = await this.tokenService.getActiveToken(input.wabaAccountId);

    // Get WABA's waba_id
    const wabaAccount = await this.templateRepo.manager.findOne('WabaAccount', {
      where: { id: input.wabaAccountId },
    }) as any;

    // Submit to Meta
    const metaResult = await this.metaApi.createTemplate(wabaAccount.wabaId, accessToken, {
      name: input.templateName,
      language: input.language,
      category: input.category.toUpperCase(),
      components: input.components,
    });

    // Store in registry
    const template = this.templateRepo.create({
      wabaAccountId: input.wabaAccountId,
      tenantId: input.tenantId,
      templateName: input.templateName,
      metaTemplateId: metaResult.id,
      language: input.language,
      category: input.category,
      components: input.components,
      status: 'PENDING',
    });
    const saved = await this.templateRepo.save(template);

    await this.auditService.log({
      tenantId: input.tenantId,
      actorType: input.tenantId ? 'tenant_user' : 'admin',
      actorId: 'system',
      action: 'template.submit',
      resourceType: 'template',
      resourceId: saved.id,
      details: { templateName: input.templateName, category: input.category },
    });

    return saved;
  }

  /**
   * Seed the platform's default template library onto a WABA.
   *
   * Used right after a tenant connects via Embedded Signup so their (own) WABA
   * gets the full template set automatically — the tenant never logs into Meta
   * or creates templates by hand. Fully tolerant: skips templates that already
   * exist, records each failure, and NEVER throws (a seeding hiccup must not
   * break an otherwise-successful connection). Approval is async — Meta returns
   * each template as PENDING and the status webhook updates it later.
   */
  async seedDefaultTemplates(
    wabaAccountId: string,
    tenantId?: string,
  ): Promise<{ created: number; existing: number; failed: number }> {
    let accessToken: string;
    try {
      accessToken = await this.tokenService.getActiveToken(wabaAccountId);
    } catch (err: any) {
      this.logger.warn(`seedDefaultTemplates: no token for WABA ${wabaAccountId}: ${err.message}`);
      return { created: 0, existing: 0, failed: 0 };
    }

    const wabaAccount = await this.templateRepo.manager.findOne('WabaAccount', {
      where: { id: wabaAccountId },
    }) as any;
    if (!wabaAccount?.wabaId) {
      this.logger.warn(`seedDefaultTemplates: WABA ${wabaAccountId} not found`);
      return { created: 0, existing: 0, failed: 0 };
    }

    let created = 0, existing = 0, failed = 0;
    for (const tpl of DEFAULT_TEMPLATES) {
      try {
        const already = await this.findByName(wabaAccountId, tpl.name, tpl.language);
        if (already) { existing++; continue; }

        const metaResult = await this.metaApi.createTemplate(wabaAccount.wabaId, accessToken, {
          name: tpl.name,
          language: tpl.language,
          category: tpl.category,
          components: tpl.components,
        });

        const template = this.templateRepo.create({
          wabaAccountId,
          tenantId,
          templateName: tpl.name,
          metaTemplateId: metaResult.id,
          language: tpl.language,
          category: tpl.category,
          components: tpl.components,
          status: 'PENDING',
        });
        await this.templateRepo.save(template);
        created++;
        // Gentle pacing so we don't trip Meta's template-create rate limit.
        await new Promise((r) => setTimeout(r, 400));
      } catch (err: any) {
        const msg = err?.message || '';
        if (/already exists/i.test(msg) || err?.code === 2388047) { existing++; continue; }
        this.logger.warn(`seedDefaultTemplates: "${tpl.name}" failed: ${msg}`);
        failed++;
      }
    }

    this.logger.log(
      `Seeded default templates on WABA ${wabaAccountId}: ${created} created, ${existing} existing, ${failed} failed`,
    );
    return { created, existing, failed };
  }

  /**
   * Sync all templates from Meta for a WABA account.
   */
  async syncFromMeta(wabaAccountId: string): Promise<{ synced: number; added: number; updated: number }> {
    const accessToken = await this.tokenService.getActiveToken(wabaAccountId);
    const wabaAccount = await this.templateRepo.manager.findOne('WabaAccount', {
      where: { id: wabaAccountId },
    }) as any;

    const metaTemplates = await this.metaApi.getTemplates(wabaAccount.wabaId, accessToken);
    let added = 0, updated = 0;

    for (const mt of metaTemplates) {
      const existing = await this.findByName(wabaAccountId, mt.name, mt.language);

      const data: Partial<TemplateRegistry> = {
        wabaAccountId,
        templateName: mt.name,
        metaTemplateId: mt.id,
        language: mt.language,
        category: mt.category,
        status: mt.status,
        components: mt.components,
        qualityScore: mt.quality_score?.score,
      };

      if (existing) {
        await this.templateRepo.update(existing.id, data);
        updated++;
      } else {
        const template = this.templateRepo.create(data);
        await this.templateRepo.save(template);
        added++;
      }
    }

    this.logger.log(`Template sync for WABA ${wabaAccountId}: ${added} added, ${updated} updated`);
    return { synced: metaTemplates.length, added, updated };
  }

  /**
   * Delete a template from both Meta and our registry.
   */
  async delete(id: string): Promise<void> {
    const template = await this.findById(id);
    const accessToken = await this.tokenService.getActiveToken(template.wabaAccountId);
    const wabaAccount = await this.templateRepo.manager.findOne('WabaAccount', {
      where: { id: template.wabaAccountId },
    }) as any;

    await this.metaApi.deleteTemplate(wabaAccount.wabaId, accessToken, template.templateName);
    await this.templateRepo.delete(id);

    await this.auditService.log({
      tenantId: template.tenantId,
      actorType: 'admin',
      actorId: 'system',
      action: 'template.delete',
      resourceType: 'template',
      resourceId: id,
      details: { templateName: template.templateName },
    });
  }

  /**
   * Handle template status webhook callback from Meta.
   */
  async handleStatusUpdate(templateId: string, event: string, reason?: string): Promise<void> {
    const template = await this.templateRepo.findOne({ where: { metaTemplateId: templateId } });
    if (!template) {
      this.logger.warn(`Template status update for unknown template: ${templateId}`);
      return;
    }

    const statusMap: Record<string, string> = {
      'APPROVED': 'APPROVED',
      'REJECTED': 'REJECTED',
      'PENDING_DELETION': 'PENDING_DELETION',
      'DELETED': 'DELETED',
      'DISABLED': 'DISABLED',
      'PAUSED': 'PAUSED',
    };

    const newStatus = statusMap[event] || event;
    await this.templateRepo.update(template.id, {
      status: newStatus,
      rejectionReason: reason || template.rejectionReason,
    });

    this.logger.log(`Template ${template.templateName} status updated to ${newStatus}`);
  }
}
