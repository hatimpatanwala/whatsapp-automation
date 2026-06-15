import { Component, input, output, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { InputNumberModule } from 'primeng/inputnumber';
import { DividerModule } from 'primeng/divider';
import { TooltipModule } from 'primeng/tooltip';
import {
  WorkflowNodeData,
  NodeTypeDefinition,
  ConfigField,
  NODE_TYPE_DEFINITIONS,
  NODE_HELP,
  EntityType,
} from '../models/workflow.models';
import { WorkflowService } from '../services/workflow.service';

@Component({
  selector: 'wa-node-config-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    ToggleSwitchModule,
    InputNumberModule,
    DividerModule,
    TooltipModule,
  ],
  template: `
    <div class="flex flex-col h-full bg-white border-l border-gray-200">
      @if (node(); as n) {
        <!-- Header -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            [style.background-color]="(nodeDef()?.color || '#94a3b8') + '20'"
          >
            <i [class]="'pi ' + (nodeDef()?.icon || 'pi-circle')" [style.color]="nodeDef()?.color" style="font-size:0.85rem"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-gray-800 truncate">{{ n.label }}</p>
            <p class="text-xs text-gray-400">{{ nodeDef()?.category | titlecase }} Node</p>
          </div>
          <button
            pButton
            icon="pi pi-times"
            class="p-button-text p-button-sm p-button-rounded"
            (click)="panelClosed.emit()"
            pTooltip="Close panel"
          ></button>
        </div>

        <!-- Form -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- What this node does -->
          <div class="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p class="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
              <i class="pi pi-info-circle"></i> {{ nodeDef()?.label }}
            </p>
            <p class="text-xs text-blue-700 mt-1 leading-snug">{{ nodeHelp() }}</p>
            <p class="text-[11px] text-blue-500 mt-1.5">
              <i class="pi pi-sitemap mr-1" style="font-size:0.65rem"></i>
              {{ outputsHint() }}
            </p>
          </div>

          <!-- Label & Description -->
          <div class="space-y-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-semibold text-gray-600">Node Label</label>
              <input
                pInputText
                [ngModel]="n.label"
                (ngModelChange)="updateField('label', $event)"
                class="w-full text-sm"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-semibold text-gray-600">Description</label>
              <input
                pInputText
                [ngModel]="n.description"
                (ngModelChange)="updateField('description', $event)"
                class="w-full text-sm"
              />
            </div>
          </div>

          @if (nodeDef()?.configFields?.length) {
            <p-divider />
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Configuration</h4>

            @for (field of nodeDef()!.configFields; track $index) {
              @if (isFieldVisible(field, n)) {
              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold text-gray-600">
                  {{ field.label }}
                  @if (field.required) {
                    <span class="text-red-400">*</span>
                  }
                </label>

                @switch (field.type) {
                  @case ('text') {
                    <input
                      pInputText
                      [ngModel]="n.config[field.key] || ''"
                      (ngModelChange)="updateConfig(field.key, $event)"
                      [placeholder]="field.placeholder || ''"
                      class="w-full text-sm"
                    />
                  }
                  @case ('textarea') {
                    <textarea
                      pTextarea
                      [ngModel]="n.config[field.key] || ''"
                      (ngModelChange)="updateConfig(field.key, $event)"
                      [placeholder]="field.placeholder || ''"
                      rows="3"
                      class="w-full text-sm"
                      [autoResize]="true"
                    ></textarea>
                  }
                  @case ('select') {
                    <p-select
                      [ngModel]="n.config[field.key] || ''"
                      (ngModelChange)="updateConfig(field.key, $event)"
                      [options]="field.options || []"
                      optionLabel="label"
                      optionValue="value"
                      [placeholder]="field.placeholder || 'Select...'"
                      styleClass="w-full"
                    />
                  }
                  @case ('entity-select') {
                    <p-select
                      [ngModel]="n.config[field.key] || ''"
                      (ngModelChange)="updateConfig(field.key, $event)"
                      [options]="entityOptions()[field.entityType!] || []"
                      optionLabel="label"
                      optionValue="value"
                      [placeholder]="field.placeholder || 'Select...'"
                      [filter]="true"
                      filterPlaceholder="Search..."
                      [showClear]="true"
                      styleClass="w-full"
                      [loading]="entityLoading()[field.entityType!] || false"
                    />
                  }
                  @case ('number') {
                    <p-inputNumber
                      [ngModel]="n.config[field.key] ?? field.defaultValue ?? 0"
                      (ngModelChange)="updateConfig(field.key, $event)"
                      styleClass="w-full"
                      [showButtons]="true"
                      [min]="0"
                    />
                  }
                  @case ('boolean') {
                    <div class="flex items-center gap-2">
                      <p-toggleSwitch
                        [ngModel]="n.config[field.key] ?? field.defaultValue ?? false"
                        (ngModelChange)="updateConfig(field.key, $event)"
                      />
                      <span class="text-xs text-gray-500">{{ n.config[field.key] ? 'Enabled' : 'Disabled' }}</span>
                    </div>
                  }
                  @case ('buttons') {
                    <div class="space-y-2">
                      @for (btn of asButtons(n.config[field.key]); track $index) {
                        <div class="flex items-center gap-2">
                          <span class="text-[10px] text-gray-400 w-4 text-center">{{ $index + 1 }}</span>
                          <input
                            pInputText
                            [ngModel]="btn.title"
                            (ngModelChange)="updateButton(field.key, $index, $event)"
                            placeholder="Button label"
                            maxlength="20"
                            class="flex-1 text-sm"
                          />
                          <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger"
                            (click)="removeButton(field.key, $index)" pTooltip="Remove"></button>
                        </div>
                      }
                      @if (asButtons(n.config[field.key]).length < 3) {
                        <button pButton label="Add Button" icon="pi pi-plus" class="p-button-text p-button-sm"
                          (click)="addButton(field.key)"></button>
                      }
                      <p class="text-[11px] text-gray-400 leading-snug">
                        Up to 3 buttons, max 20 chars each. Connect an arrow from this node for each button (top→bottom = button order),
                        or route them with a Switch node.
                      </p>
                    </div>
                  }
                  @case ('keywords') {
                    <div class="space-y-1.5">
                      @if (asKeywords(n.config[field.key]).length) {
                        <div class="flex flex-wrap gap-1.5">
                          @for (kw of asKeywords(n.config[field.key]); track $index) {
                            <span class="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                              {{ kw }}
                              <i class="pi pi-times cursor-pointer text-[10px]" (click)="removeKeyword(field.key, $index)"></i>
                            </span>
                          }
                        </div>
                      }
                      <input
                        pInputText
                        [(ngModel)]="keywordDraft"
                        (keydown.enter)="addKeyword(field.key); $event.preventDefault()"
                        [placeholder]="field.placeholder || 'Type a word and press Enter'"
                        class="w-full text-sm"
                      />
                    </div>
                  }
                  @case ('list-items') {
                    <div class="space-y-2">
                      @for (item of asListItems(n.config[field.key]); track $index) {
                        <div class="border border-gray-200 rounded-lg p-2 space-y-1">
                          <div class="flex items-center gap-2">
                            <span class="text-[10px] text-gray-400 w-4 text-center">{{ $index + 1 }}</span>
                            <input pInputText [ngModel]="item.title" (ngModelChange)="updateListItem(field.key, $index, 'title', $event)" placeholder="Item title" maxlength="24" class="flex-1 text-sm" />
                            <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" (click)="removeListItem(field.key, $index)"></button>
                          </div>
                          <input pInputText [ngModel]="item.description" (ngModelChange)="updateListItem(field.key, $index, 'description', $event)" placeholder="Description (optional)" maxlength="72" class="w-full text-xs" />
                        </div>
                      }
                      @if (asListItems(n.config[field.key]).length < 10) {
                        <button pButton label="Add Item" icon="pi pi-plus" class="p-button-text p-button-sm" (click)="addListItem(field.key)"></button>
                      }
                    </div>
                  }
                  @default {
                    <input
                      pInputText
                      [ngModel]="n.config[field.key] || ''"
                      (ngModelChange)="updateConfig(field.key, $event)"
                      [placeholder]="field.placeholder || ''"
                      class="w-full text-sm"
                    />
                  }
                }

                <!-- Quick variable-insert chips -->
                @if (field.variables) {
                  <div class="flex flex-wrap gap-1 mt-0.5">
                    @for (v of quickVars; track v) {
                      <button type="button"
                        class="text-[10px] bg-gray-100 hover:bg-primary-50 text-gray-500 hover:text-primary-700 px-1.5 py-0.5 rounded border border-gray-200 transition-colors"
                        (click)="insertVariable(field.key, v)"
                      >+ {{ '{{' + v + '}}' }}</button>
                    }
                  </div>
                }

                <!-- Field help -->
                @if (field.help) {
                  <p class="text-[11px] text-gray-400 leading-snug">{{ field.help }}</p>
                }
              </div>
              }
            }
          }

          <!-- Node info -->
          <p-divider />
          <div class="space-y-2">
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Type</span>
              <span class="text-gray-600 font-mono">{{ n.type }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">ID</span>
              <span class="text-gray-600 font-mono truncate max-w-32">{{ n.id }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Max Outputs</span>
              <span class="text-gray-600">{{ nodeDef()?.maxOutputs }}</span>
            </div>
          </div>
        </div>

        <!-- Footer actions -->
        <div class="p-3 border-t border-gray-100 flex gap-2">
          <button
            pButton
            label="Duplicate"
            icon="pi pi-copy"
            class="p-button-outlined p-button-sm flex-1"
            (click)="duplicateNode.emit(n)"
          ></button>
          <button
            pButton
            label="Delete"
            icon="pi pi-trash"
            severity="danger"
            class="p-button-outlined p-button-sm flex-1"
            (click)="deleteNode.emit(n.id)"
          ></button>
        </div>
      } @else {
        <!-- No selection -->
        <div class="flex flex-col items-center justify-center h-full text-center px-6">
          <div class="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
            <i class="pi pi-sliders-h text-gray-300" style="font-size:1.5rem"></i>
          </div>
          <p class="text-sm font-medium text-gray-500">No node selected</p>
          <p class="text-xs text-gray-400 mt-1">Click a node on the canvas to configure it</p>
        </div>
      }
    </div>
  `,
})
export class NodeConfigPanelComponent {
  private readonly workflowService = inject(WorkflowService);

  node = input<WorkflowNodeData | null>(null);

  nodeUpdated = output<WorkflowNodeData>();
  deleteNode = output<string>();
  duplicateNode = output<WorkflowNodeData>();
  panelClosed = output<void>();

  entityOptions = signal<Record<string, { label: string; value: string }[]>>({});
  entityLoading = signal<Record<string, boolean>>({});

  private nodeDefCache = new Map<string, NodeTypeDefinition>();
  private loadedEntities = new Set<string>();

  constructor() {
    NODE_TYPE_DEFINITIONS.forEach(d => this.nodeDefCache.set(d.type, d));

    effect(() => {
      const def = this.nodeDef();
      if (!def) return;
      const entityFields = def.configFields.filter(f => f.type === 'entity-select' && f.entityType);
      for (const field of entityFields) {
        this.loadEntityOptions(field.entityType!);
      }
    });
  }

  nodeDef = computed(() => {
    const n = this.node();
    return n ? this.nodeDefCache.get(n.type) : undefined;
  });

  nodeHelp = computed(() => {
    const n = this.node();
    if (!n) return '';
    return NODE_HELP[n.type] || this.nodeDef()?.description || '';
  });

  outputsHint = computed(() => {
    const max = this.nodeDef()?.maxOutputs ?? 1;
    if (max === 0) return 'This node ends the flow — it has no outgoing connections.';
    if (max === 1) return 'Connect 1 arrow to the next step.';
    return `Connect up to ${max} arrows to branch the flow.`;
  });

  isFieldVisible(field: ConfigField, node: WorkflowNodeData): boolean {
    if (!field.showWhen) return true;
    return node.config[field.showWhen.field] === field.showWhen.value;
  }

  updateField(field: 'label' | 'description', value: string) {
    const n = this.node();
    if (!n) return;
    this.nodeUpdated.emit({ ...n, [field]: value });
  }

  updateConfig(key: string, value: any) {
    const n = this.node();
    if (!n) return;
    this.nodeUpdated.emit({ ...n, config: { ...n.config, [key]: value } });
  }

  // ─── Structured buttons editor ─────────────────────────────────────────────
  asButtons(val: any): { id: string; title: string }[] {
    if (Array.isArray(val)) {
      return val.map((b: any) =>
        typeof b === 'string'
          ? { id: this.slug(b), title: b }
          : { id: b?.id || this.slug(b?.title || b?.text || b?.label || ''), title: b?.title ?? b?.text ?? b?.label ?? b?.value ?? '' },
      );
    }
    if (typeof val === 'string' && val.trim()) {
      return val.split('\n').filter((l) => l.trim()).map((t) => ({ id: this.slug(t), title: t.trim() }));
    }
    return [];
  }

  private slug(s: string): string {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 30) || 'btn';
  }

  private commitButtons(key: string, buttons: { id: string; title: string }[]) {
    const withIds = buttons.map((b, i) => ({ id: b.id || this.slug(b.title) || `btn_${i + 1}`, title: b.title }));
    this.updateConfig(key, withIds);
  }

  addButton(key: string) {
    const n = this.node();
    if (!n) return;
    const buttons = this.asButtons(n.config[key]);
    if (buttons.length >= 3) return;
    buttons.push({ id: '', title: '' });
    this.commitButtons(key, buttons);
  }

  updateButton(key: string, idx: number, title: string) {
    const n = this.node();
    if (!n) return;
    const buttons = this.asButtons(n.config[key]);
    buttons[idx] = { id: this.slug(title), title };
    this.commitButtons(key, buttons);
  }

  removeButton(key: string, idx: number) {
    const n = this.node();
    if (!n) return;
    const buttons = this.asButtons(n.config[key]).filter((_, i) => i !== idx);
    this.commitButtons(key, buttons);
  }

  // ─── Keywords (chips) editor ───────────────────────────────────────────────
  keywordDraft = '';

  asKeywords(val: any): string[] {
    if (Array.isArray(val)) return val.map((k) => String(k)).filter((k) => k.trim());
    if (typeof val === 'string' && val.trim()) return val.split(',').map((k) => k.trim()).filter(Boolean);
    return [];
  }

  addKeyword(key: string) {
    const kw = this.keywordDraft.trim().replace(/,/g, '');
    if (!kw) return;
    const n = this.node();
    if (!n) return;
    const list = this.asKeywords(n.config[key]);
    if (!list.includes(kw)) list.push(kw);
    this.keywordDraft = '';
    this.updateConfig(key, list);
  }

  removeKeyword(key: string, idx: number) {
    const n = this.node();
    if (!n) return;
    const list = this.asKeywords(n.config[key]).filter((_, i) => i !== idx);
    this.updateConfig(key, list);
  }

  // ─── List items editor ─────────────────────────────────────────────────────
  asListItems(val: any): { id: string; title: string; description: string }[] {
    if (Array.isArray(val)) {
      // Sections format: [{ title, rows: [...] }] → flatten the rows.
      if (val.length && val[0]?.rows) {
        return val.flatMap((s: any) =>
          (s.rows || []).map((r: any) => ({ id: r.id || this.slug(r.title || ''), title: r.title || '', description: r.description || '' })),
        );
      }
      return val.map((r: any) =>
        typeof r === 'string'
          ? { id: this.slug(r), title: r, description: '' }
          : { id: r?.id || this.slug(r?.title || r?.label || ''), title: r?.title ?? r?.label ?? '', description: r?.description ?? '' },
      );
    }
    return [];
  }

  private commitListItems(key: string, items: { id: string; title: string; description: string }[]) {
    const withIds = items.map((it, i) => ({
      id: it.id || this.slug(it.title) || `item_${i + 1}`,
      title: it.title,
      description: it.description || '',
    }));
    this.updateConfig(key, withIds);
  }

  addListItem(key: string) {
    const n = this.node();
    if (!n) return;
    const items = this.asListItems(n.config[key]);
    if (items.length >= 10) return;
    items.push({ id: '', title: '', description: '' });
    this.commitListItems(key, items);
  }

  updateListItem(key: string, idx: number, prop: 'title' | 'description', value: string) {
    const n = this.node();
    if (!n) return;
    const items = this.asListItems(n.config[key]);
    items[idx] = { ...items[idx], [prop]: value };
    if (prop === 'title') items[idx].id = this.slug(value);
    this.commitListItems(key, items);
  }

  removeListItem(key: string, idx: number) {
    const n = this.node();
    if (!n) return;
    const items = this.asListItems(n.config[key]).filter((_, i) => i !== idx);
    this.commitListItems(key, items);
  }

  // ─── Variable insertion ────────────────────────────────────────────────────
  quickVars = ['customer_name', 'customer_phone', 'last_input', 'order_number'];

  insertVariable(key: string, varName: string) {
    const n = this.node();
    if (!n) return;
    const cur = n.config[key] != null ? String(n.config[key]) : '';
    const sep = cur && !cur.endsWith(' ') && !cur.endsWith('\n') ? ' ' : '';
    this.updateConfig(key, `${cur}${sep}{{${varName}}}`);
  }

  private loadEntityOptions(entityType: EntityType) {
    if (this.loadedEntities.has(entityType)) return;
    this.loadedEntities.add(entityType);

    this.entityLoading.update(l => ({ ...l, [entityType]: true }));

    this.workflowService.getEntityOptions(entityType).subscribe({
      next: (options) => {
        this.entityOptions.update(o => ({ ...o, [entityType]: options }));
        this.entityLoading.update(l => ({ ...l, [entityType]: false }));
      },
      error: () => {
        this.entityLoading.update(l => ({ ...l, [entityType]: false }));
      },
    });
  }
}
