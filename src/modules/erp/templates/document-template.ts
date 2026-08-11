import {
  Injectable,
  Controller,
  UseGuards,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import {
  DOC_TYPES,
  DocType,
  DocTemplateConfig,
  DEFAULT_TEMPLATE_CONFIG,
  normalizeTemplateConfig,
} from './document-template.types';

interface TemplateRow {
  id: string;
  name: string;
  config: any;
  applies_to: string[];
  is_default: boolean;
  updated_at: string;
}

@Injectable()
export class DocumentTemplateService {
  constructor(private readonly cm: TenantConnectionManager) {}

  async list(schema: string): Promise<TemplateRow[]> {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, name, config, applies_to, is_default, updated_at
           FROM "${schema}".document_templates
          WHERE deleted_at IS NULL
          ORDER BY is_default DESC, name ASC`,
      ),
    );
  }

  async get(schema: string, id: string): Promise<TemplateRow> {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, name, config, applies_to, is_default, updated_at
           FROM "${schema}".document_templates WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      ),
    );
    if (!rows.length) throw new NotFoundException('Template not found');
    return rows[0];
  }

  async create(
    schema: string,
    body: { name?: string; config?: Partial<DocTemplateConfig>; appliesTo?: string[] },
  ): Promise<TemplateRow> {
    const name = (body.name || '').trim();
    if (!name) throw new BadRequestException('Template name is required');
    const config = normalizeTemplateConfig(body.config);
    const appliesTo = sanitizeDocTypes(body.appliesTo);
    return this.cm.executeInTransaction(schema, async (qr) => {
      if (appliesTo.length) await clearAssignments(qr, schema, appliesTo);
      const rows = await qr.query(
        `INSERT INTO "${schema}".document_templates (name, config, applies_to)
         VALUES ($1, $2::jsonb, $3) RETURNING id, name, config, applies_to, is_default, updated_at`,
        [name, JSON.stringify(config), appliesTo],
      );
      return rows[0];
    });
  }

  async update(
    schema: string,
    id: string,
    body: { name?: string; config?: Partial<DocTemplateConfig> },
  ): Promise<TemplateRow> {
    const existing = await this.get(schema, id);
    const name = body.name != null ? String(body.name).trim() : existing.name;
    if (!name) throw new BadRequestException('Template name is required');
    // Merge over the existing stored config so partial saves keep other fields.
    const merged = normalizeTemplateConfig({ ...(existing.config || {}), ...(body.config || {}) });
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `UPDATE "${schema}".document_templates
            SET name = $2, config = $3::jsonb, updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id, name, config, applies_to, is_default, updated_at`,
        [id, name, JSON.stringify(merged)],
      ),
    );
    if (!rows.length) throw new NotFoundException('Template not found');
    return rows[0];
  }

  /** Assign this template to a set of document types (exclusive — clears them elsewhere). */
  async assign(schema: string, id: string, docTypes: string[]): Promise<TemplateRow> {
    const appliesTo = sanitizeDocTypes(docTypes);
    return this.cm.executeInTransaction(schema, async (qr) => {
      const found = await qr.query(
        `SELECT 1 FROM "${schema}".document_templates WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      if (!found.length) throw new NotFoundException('Template not found');
      if (appliesTo.length) await clearAssignments(qr, schema, appliesTo, id);
      const rows = await qr.query(
        `UPDATE "${schema}".document_templates SET applies_to = $2, updated_at = NOW()
          WHERE id = $1 RETURNING id, name, config, applies_to, is_default, updated_at`,
        [id, appliesTo],
      );
      return rows[0];
    });
  }

  async remove(schema: string, id: string): Promise<{ success: true }> {
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `UPDATE "${schema}".document_templates SET deleted_at = NOW(), applies_to = '{}', updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      ),
    );
    return { success: true };
  }

  /**
   * The fully-resolved config to render a given document type: the assigned template,
   * else the tenant default, else the built-in Classic. Always a complete config.
   */
  async resolveForDocType(schema: string, docType: string): Promise<DocTemplateConfig> {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT config FROM "${schema}".document_templates
          WHERE deleted_at IS NULL AND ($1 = ANY(applies_to) OR is_default)
          ORDER BY ($1 = ANY(applies_to)) DESC, is_default DESC, updated_at DESC
          LIMIT 1`,
        [docType],
      ),
    );
    return rows.length ? normalizeTemplateConfig(rows[0].config) : DEFAULT_TEMPLATE_CONFIG;
  }
}

function sanitizeDocTypes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set<string>(DOC_TYPES as unknown as string[]);
  return [...new Set(input.map(String).filter((t) => valid.has(t)))];
}

/** Remove the given doc types from every template's applies_to (except `keepId`). */
async function clearAssignments(qr: any, schema: string, docTypes: string[], keepId?: string): Promise<void> {
  await qr.query(
    `UPDATE "${schema}".document_templates
        SET applies_to = ARRAY(SELECT unnest(applies_to) EXCEPT SELECT unnest($1::text[])),
            updated_at = NOW()
      WHERE applies_to && $1::text[] ${keepId ? 'AND id <> $2' : ''}`,
    keepId ? [docTypes, keepId] : [docTypes],
  );
}

@Controller('erp/document-templates')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class DocumentTemplateController {
  constructor(private readonly service: DocumentTemplateService) {}

  @Get()
  @Roles('owner', 'seller')
  list(@Req() req: Request) {
    return this.service.list(req.tenantContext.schemaName);
  }

  /** Resolve the active config for a doc type — used by the live preview + rendering. */
  @Get('resolve')
  @Roles('owner', 'seller')
  resolve(@Req() req: Request, @Query('docType') docType: string) {
    return this.service.resolveForDocType(req.tenantContext.schemaName, docType as DocType);
  }

  @Get(':id')
  @Roles('owner', 'seller')
  getOne(@Req() req: Request, @Param('id') id: string) {
    return this.service.get(req.tenantContext.schemaName, id);
  }

  @Post()
  @Roles('owner')
  create(@Req() req: Request, @Body() body: any) {
    return this.service.create(req.tenantContext.schemaName, body);
  }

  @Patch(':id')
  @Roles('owner')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.service.update(req.tenantContext.schemaName, id, body);
  }

  @Put(':id/assign')
  @Roles('owner')
  assign(@Req() req: Request, @Param('id') id: string, @Body() body: { docTypes?: string[] }) {
    return this.service.assign(req.tenantContext.schemaName, id, body?.docTypes || []);
  }

  @Delete(':id')
  @Roles('owner')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.remove(req.tenantContext.schemaName, id);
  }
}
