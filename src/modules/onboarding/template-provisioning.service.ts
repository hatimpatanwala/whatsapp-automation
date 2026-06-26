import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { MetaTokenService } from '../waba/meta-token.service';
import { DEFAULT_TEMPLATES, DefaultTemplateDefinition } from '../waba/template/default-templates';

type TemplateDefinition = DefaultTemplateDefinition;

export interface ProvisionResult {
  name: string;
  status: 'created' | 'already_exists' | 'failed';
  id?: string;
  error?: string;
}

export interface TemplateButtonInput {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

export interface CreateTemplateInput {
  name: string;
  category: 'AUTHENTICATION' | 'UTILITY' | 'MARKETING';
  language?: string;
  body: string;
  examples?: string[];
  footer?: string;
  header?: string;
  buttons?: TemplateButtonInput[];
}

export interface TemplateSummary {
  name: string;
  status: string; // APPROVED | PENDING | REJECTED | ...
  category: string;
  language: string;
  body: string;
  rejectedReason?: string;
}

@Injectable()
export class TemplateProvisioningService {
  private readonly logger = new Logger(TemplateProvisioningService.name);
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(WabaAccount)
    private readonly wabaAccountRepo: Repository<WabaAccount>,
    private readonly metaTokenService: MetaTokenService,
    private readonly configService: ConfigService,
  ) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  /**
   * Provision all platform message templates on the WABA.
   */
  /** Resolve the active platform WABA and its live access token. */
  private async resolveWabaToken(): Promise<{ wabaId: string; accessToken: string }> {
    const waba = await this.wabaAccountRepo.findOne({
      where: { status: 'active' },
      order: { createdAt: 'ASC' },
    });
    if (!waba) {
      throw new BadRequestException('No active WABA found. Please configure a WhatsApp Business Account first.');
    }
    const accessToken = await this.metaTokenService.getActiveToken(waba.id);
    if (!accessToken) {
      throw new BadRequestException('No active access token for the WABA.');
    }
    return { wabaId: waba.wabaId, accessToken };
  }

  /** List all message templates on the WABA with their Meta approval status. */
  async listTemplates(): Promise<TemplateSummary[]> {
    const { wabaId, accessToken } = await this.resolveWabaToken();
    const res = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/message_templates?fields=name,status,category,language,components,quality_score&limit=250`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json() as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || 'Failed to list templates');
    return (data.data || []).map((t: any) => ({
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      body: (t.components || []).find((c: any) => c.type === 'BODY')?.text || '',
      rejectedReason: t.status === 'REJECTED' ? (t.rejected_reason || 'Rejected by Meta — see WhatsApp Manager') : undefined,
    }));
  }

  /** Create a single custom template from super-admin input. */
  async createCustomTemplate(input: CreateTemplateInput): Promise<ProvisionResult> {
    const name = (input.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 512);
    if (!name) throw new BadRequestException('Template name is required.');
    if (!input.body || !input.body.trim()) throw new BadRequestException('Template body is required.');
    if (!['AUTHENTICATION', 'UTILITY', 'MARKETING'].includes(input.category)) {
      throw new BadRequestException('Category must be AUTHENTICATION, UTILITY or MARKETING.');
    }
    // Meta rejects templates whose body ends with (or starts with) a variable.
    const trimmed = input.body.trim();
    if (/\{\{\s*\d+\s*\}\}\s*$/.test(trimmed)) {
      throw new BadRequestException('Body cannot end with a variable — add some text after the last {{n}}.');
    }
    if (/^\s*\{\{\s*\d+\s*\}\}/.test(trimmed)) {
      throw new BadRequestException('Body cannot start with a variable — add some text before the first {{n}}.');
    }

    const components: any[] = [];
    if (input.header && input.header.trim()) {
      components.push({ type: 'HEADER', format: 'TEXT', text: input.header.trim() });
    }

    const varCount = (input.body.match(/\{\{\s*\d+\s*\}\}/g) || []).length;
    const body: any = { type: 'BODY', text: input.body };
    if (varCount > 0) {
      const ex = (input.examples || []).map((e) => String(e || '')).slice(0, varCount);
      while (ex.length < varCount) ex.push('sample');
      body.example = { body_text: [ex] };
    }
    components.push(body);

    if (input.footer && input.footer.trim()) {
      components.push({ type: 'FOOTER', text: input.footer.trim() });
    }

    if (input.buttons && input.buttons.length) {
      components.push({
        type: 'BUTTONS',
        buttons: input.buttons.slice(0, 10).map((b) => {
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
          if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
          return { type: 'QUICK_REPLY', text: b.text };
        }),
      });
    }

    const { wabaId, accessToken } = await this.resolveWabaToken();
    return this.createTemplate(wabaId, accessToken, {
      name,
      category: input.category,
      language: input.language || 'en',
      components,
    });
  }

  /** Delete a template by name. */
  async deleteTemplate(name: string): Promise<{ success: boolean }> {
    const { wabaId, accessToken } = await this.resolveWabaToken();
    const res = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json() as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || 'Failed to delete template');
    return { success: true };
  }

  async provisionAll(): Promise<{ results: ProvisionResult[]; summary: { created: number; existing: number; failed: number } }> {
    const { wabaId, accessToken } = await this.resolveWabaToken();

    // Fetch existing template names up front so re-syncing reliably reports
    // "already_exists" instead of Meta's generic re-create error.
    const existingNames = new Set<string>();
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/message_templates?fields=name&limit=250`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json() as any;
      (data.data || []).forEach((t: any) => existingNames.add(t.name));
    } catch { /* fall back to create-and-detect */ }

    const templates = this.getAllTemplates();
    const results: ProvisionResult[] = [];

    for (const template of templates) {
      if (existingNames.has(template.name)) {
        results.push({ name: template.name, status: 'already_exists' });
        continue;
      }
      const result = await this.createTemplate(wabaId, accessToken, template);
      results.push(result);
      // Small delay between API calls to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    const summary = {
      created: results.filter(r => r.status === 'created').length,
      existing: results.filter(r => r.status === 'already_exists').length,
      failed: results.filter(r => r.status === 'failed').length,
    };

    this.logger.log(`Template provisioning complete: ${summary.created} created, ${summary.existing} existing, ${summary.failed} failed`);
    return { results, summary };
  }

  private async createTemplate(wabaId: string, accessToken: string, template: TemplateDefinition): Promise<ProvisionResult> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/message_templates`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name: template.name,
            language: template.language,
            category: template.category,
            components: template.components,
          }),
        },
      );

      const data = await response.json() as any;

      if (response.ok && data.id) {
        this.logger.log(`Template "${template.name}" created with ID ${data.id}`);
        return { name: template.name, status: 'created', id: data.id };
      }

      const errorMsg = data.error?.message || '';
      // If template already exists, that's fine
      if (errorMsg.toLowerCase().includes('already exists') || data.error?.code === 2388047) {
        return { name: template.name, status: 'already_exists' };
      }

      this.logger.warn(`Failed to create template "${template.name}": ${errorMsg}`);
      return { name: template.name, status: 'failed', error: errorMsg };
    } catch (err: any) {
      this.logger.error(`Network error creating template "${template.name}": ${err.message}`);
      return { name: template.name, status: 'failed', error: err.message };
    }
  }

  private getAllTemplates(): TemplateDefinition[] {
    // One source of truth — shared with the Embedded Signup auto-seeder.
    return DEFAULT_TEMPLATES;
  }
}
