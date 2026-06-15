import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';
import { NodePaletteComponent } from '../../workflow-builder/components/node-palette.component';
import { WorkflowCanvasComponent } from '../../workflow-builder/components/workflow-canvas.component';
import { NodeConfigPanelComponent } from '../../workflow-builder/components/node-config-panel.component';
import { WorkflowPreviewComponent } from '../../workflow-builder/components/workflow-preview.component';
import { WorkflowService } from '../../workflow-builder/services/workflow.service';
import {
  WorkflowDefinition,
  WorkflowNodeData,
  WorkflowEdgeData,
  NODE_TYPE_DEFINITIONS,
} from '../../workflow-builder/models/workflow.models';

@Component({
  selector: 'wa-admin-workflow-builder',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    ButtonModule, TagModule, SelectModule, InputTextModule, DialogModule,
    ToastModule, TooltipModule, DividerModule, ConfirmDialogModule,
    NodePaletteComponent, WorkflowCanvasComponent, NodeConfigPanelComponent, WorkflowPreviewComponent,
  ],
  providers: [MessageService, ConfirmationService, WorkflowService],
  template: `
    <p-toast />
    <p-confirmDialog />

    @if (!editingWorkflow()) {
      <!-- ═══ WORKFLOW LIST VIEW ═══ -->
      <div class="p-6 space-y-5">
        <!-- Breadcrumb -->
        <div class="flex items-center gap-2 text-xs text-[#94a3b8]">
          <a routerLink="/admin/tenants" class="hover:text-[#cbd5e1] no-underline">Tenants</a>
          <i class="pi pi-chevron-right" style="font-size:0.5rem"></i>
          <a [routerLink]="['/admin/tenants', tenantId, 'view']" class="hover:text-[#cbd5e1] no-underline">{{ tenantName() }}</a>
          <i class="pi pi-chevron-right" style="font-size:0.5rem"></i>
          <span class="text-[#cbd5e1]">Workflows</span>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded text-[#a8b5c7]" [routerLink]="['/admin/tenants', tenantId, 'view']"></button>
            <div>
              <h1 class="text-2xl font-bold text-white">Workflow Builder</h1>
              <p class="text-[#94a3b8] text-sm">Manage workflows for {{ tenantName() }}</p>
            </div>
          </div>
          <button pButton label="New Workflow" icon="pi pi-plus" severity="success" (click)="showNewDialog = true"></button>
        </div>

        @if (loading()) {
          <div class="text-center py-20 text-[#94a3b8]">
            <i class="pi pi-spinner pi-spin" style="font-size:2rem"></i>
            <p class="mt-3">Loading workflows...</p>
          </div>
        } @else if (!workflows().length) {
          <div class="text-center py-20">
            <div class="w-20 h-20 bg-[#1c2640] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <i class="pi pi-sitemap text-[#94a3b8]" style="font-size:2.5rem"></i>
            </div>
            <h3 class="text-lg font-semibold text-white">No Workflows</h3>
            <p class="text-[#94a3b8] text-sm mt-1 mb-4">Create the first workflow for this tenant</p>
            <button pButton label="Create Workflow" icon="pi pi-plus" severity="success" (click)="showNewDialog = true"></button>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            @for (wf of workflows(); track wf.id) {
              <div class="bg-[#131a2b] rounded-xl p-5 border border-[#1c2640] hover:border-gray-700 transition-all cursor-pointer" (click)="openWorkflow(wf)">
                <div class="flex items-start justify-between mb-3">
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-white truncate">{{ wf.name }}</h3>
                    <p class="text-xs text-[#94a3b8] mt-0.5">{{ wf.description || 'No description' }}</p>
                  </div>
                  <p-tag [value]="wf.status" [severity]="getSeverity(wf.status)" styleClass="text-xs capitalize ml-2" />
                </div>
                <div class="flex items-center gap-4 text-xs text-[#94a3b8] border-t border-[#1c2640] pt-3">
                  <span><i class="pi pi-box mr-1" style="font-size:0.6rem"></i>{{ wf.nodes?.length || 0 }} nodes</span>
                  <span><i class="pi pi-play mr-1" style="font-size:0.6rem"></i>{{ wf.execution_count || 0 }} runs</span>
                </div>
                <div class="flex gap-2 mt-3">
                  <button pButton [icon]="wf.status==='active'?'pi pi-pause':'pi pi-play'" [label]="wf.status==='active'?'Pause':'Activate'" class="p-button-sm p-button-outlined flex-1" [severity]="wf.status==='active'?'warn':'success'" (click)="toggleStatus($event, wf)"></button>
                  <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm p-button-rounded text-[#a8b5c7]" pTooltip="Edit" (click)="openWorkflow(wf); $event.stopPropagation()"></button>
                  <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded text-red-400" pTooltip="Delete" (click)="deleteWorkflow($event, wf)"></button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    } @else {
      <!-- ═══ WORKFLOW EDITOR VIEW ═══ -->
      <div class="flex flex-col h-screen" style="max-height:calc(100vh - 44px)">
        <div class="flex items-center gap-3 px-4 py-2 border-b border-[#1c2640] bg-[#131a2b] shrink-0">
          <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-sm p-button-rounded text-[#a8b5c7]" pTooltip="Back to list" (click)="closeEditor()"></button>
          <p-divider layout="vertical" styleClass="h-6 mx-0" />
          <input pInputText [ngModel]="editingWorkflow()!.name" (ngModelChange)="updateName($event)" class="text-sm font-semibold border-0 bg-transparent text-white p-1 hover:bg-[#1c2640] focus:bg-[#1c2640] rounded" style="max-width:300px" />
          <p-select
            [ngModel]="editingWorkflow()!.status"
            (ngModelChange)="updateStatus($event)"
            [options]="wfStatusOptions"
            optionLabel="label" optionValue="value"
            styleClass="w-28"
            pTooltip="Change status"
          />
          <div class="flex-1"></div>
          <span class="text-xs text-[#94a3b8]">{{ currentNodes().length }} nodes | {{ currentEdges().length }} edges</span>
          <p-divider layout="vertical" styleClass="h-6 mx-0" />
          <button pButton icon="pi pi-undo" class="p-button-text p-button-sm p-button-rounded text-[#a8b5c7]" pTooltip="Undo" [disabled]="!canUndo()" (click)="undo()"></button>
          <button pButton icon="pi pi-refresh" class="p-button-text p-button-sm p-button-rounded text-[#a8b5c7]" pTooltip="Redo" [disabled]="!canRedo()" (click)="redo()"></button>
          <p-divider layout="vertical" styleClass="h-6 mx-0" />
          @if (!hasFallbackNode()) {
            <button pButton label="+ Fallback" icon="pi pi-shield" class="p-button-sm p-button-outlined" severity="warn" pTooltip="Add fallback handler" (click)="addFallbackNode()"></button>
          }
          <button pButton [label]="showPreview()?'Close Preview':'Preview'" [icon]="showPreview()?'pi pi-times':'pi pi-play'" class="p-button-sm" [severity]="showPreview()?'secondary':'info'" (click)="togglePreview()"></button>
          <button pButton label="Save" icon="pi pi-check" class="p-button-sm" severity="success" [loading]="saving()" (click)="saveWorkflow()"></button>
        </div>
        <div class="flex flex-1 overflow-hidden">
          <div class="w-56 shrink-0"><wa-node-palette /></div>
          <div class="flex-1 bg-gray-100">
            <wa-workflow-canvas
              [nodes]="currentNodes()" [edges]="currentEdges()" [selectedNodeId]="selectedNodeId()"
              (nodeSelected)="selectNode($event)" (nodesMoved)="onNodesMoved($event)"
              (edgeCreated)="onEdgeCreated($event)" (edgeDeleted)="onEdgeDeleted($event)" (nodeDrop)="onNodeDrop($event)"
            />
          </div>
          @if (showConfigPanel() && !showPreview()) {
            <div class="w-72 shrink-0">
              <wa-node-config-panel [node]="selectedNode()" (nodeUpdated)="onNodeUpdated($event)" (deleteNode)="onDeleteNode($event)" (duplicateNode)="onDuplicateNode($event)" (panelClosed)="deselectNode()" />
            </div>
          }
          @if (showPreview()) {
            <div class="w-96 shrink-0">
              <wa-workflow-preview [nodes]="currentNodes()" [edges]="currentEdges()" (closed)="showPreview.set(false)" (highlightNode)="selectNodeById($event)" />
            </div>
          }
        </div>
      </div>
    }

    <!-- New Workflow Dialog -->
    <p-dialog [(visible)]="showNewDialog" header="Create New Workflow" [modal]="true" [style]="{width:'500px'}" [draggable]="false">
      <div class="space-y-4 py-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Workflow Name *</label>
          <input pInputText [(ngModel)]="newWfName" placeholder="e.g. Order Confirmation Flow" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Description</label>
          <input pInputText [(ngModel)]="newWfDesc" placeholder="Brief description" class="w-full" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="showNewDialog = false"></button>
        <button pButton label="Create" icon="pi pi-plus" severity="success" [disabled]="!newWfName.trim()" (click)="createWorkflow()"></button>
      </ng-template>
    </p-dialog>
  `,
})
export class AdminWorkflowBuilderComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly wfService = inject(WorkflowService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  tenantId = '';
  tenantName = signal('Tenant');
  loading = signal(true);
  saving = signal(false);
  workflows = signal<any[]>([]);
  editingWorkflow = signal<WorkflowDefinition | null>(null);
  currentNodes = signal<WorkflowNodeData[]>([]);
  currentEdges = signal<WorkflowEdgeData[]>([]);
  selectedNodeId = signal<string | null>(null);
  showConfigPanel = signal(false);
  showPreview = signal(false);
  showNewDialog = false;
  newWfName = '';
  newWfDesc = '';

  private undoStack: { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] }[] = [];
  private redoStack: { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] }[] = [];
  canUndo = signal(false);
  canRedo = signal(false);

  selectedNode = computed(() => {
    const id = this.selectedNodeId();
    return id ? this.currentNodes().find(n => n.id === id) || null : null;
  });

  wfStatusOptions = [
    { label: 'Draft', value: 'draft' },
    { label: 'Active', value: 'active' },
    { label: 'Paused', value: 'paused' },
    { label: 'Preview', value: 'preview' },
    { label: 'Archived', value: 'archived' },
  ];

  private get basePath() { return `/admin/tenants/${this.tenantId}/workflows`; }

  ngOnInit() {
    this.tenantId = this.route.snapshot.paramMap.get('id') || '';
    this.api.get<any>(`/admin/tenants/${this.tenantId}`).subscribe({
      next: (t) => this.tenantName.set(t.name || t.slug),
      error: () => {},
    });
    this.loadWorkflows();
  }

  loadWorkflows() {
    this.loading.set(true);
    this.api.get<any[]>(this.basePath).subscribe({
      next: (wfs) => { this.workflows.set(wfs || []); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  openWorkflow(wf: any) {
    this.api.get<any>(`${this.basePath}/${wf.id}`).subscribe({
      next: (full) => {
        const def: WorkflowDefinition = {
          id: full.id, name: full.name, description: full.description || '',
          status: full.status || 'draft', audience: full.audience || 'customer',
          trigger: full.trigger || 'message_received',
          nodes: full.nodes || [], edges: full.edges || [],
          createdAt: full.created_at || '', updatedAt: full.updated_at || '',
          executionCount: full.execution_count || 0,
        };
        this.editingWorkflow.set(def);
        this.currentNodes.set([...def.nodes]);
        this.currentEdges.set([...def.edges]);
        this.selectedNodeId.set(null);
        this.showConfigPanel.set(false);
        this.undoStack = []; this.redoStack = [];
        this.canUndo.set(false); this.canRedo.set(false);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Failed to load workflow' }),
    });
  }

  closeEditor() {
    this.editingWorkflow.set(null);
    this.selectedNodeId.set(null);
    this.showConfigPanel.set(false);
    this.showPreview.set(false);
  }

  createWorkflow() {
    if (!this.newWfName.trim()) return;
    this.api.post<any>(this.basePath, { name: this.newWfName, description: this.newWfDesc }).subscribe({
      next: (created) => {
        this.showNewDialog = false;
        this.newWfName = ''; this.newWfDesc = '';
        this.messageService.add({ severity: 'success', summary: 'Workflow created' });
        this.loadWorkflows();
        this.openWorkflow(created);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Failed to create workflow' }),
    });
  }

  saveWorkflow() {
    const wf = this.editingWorkflow();
    if (!wf) return;
    this.saving.set(true);
    this.api.put(`${this.basePath}/${wf.id}`, {
      name: wf.name, description: wf.description, status: wf.status,
      nodes: this.currentNodes(), edges: this.currentEdges(),
    }).subscribe({
      next: () => {
        this.saving.set(false);
        wf.nodes = this.currentNodes(); wf.edges = this.currentEdges();
        this.messageService.add({ severity: 'success', summary: 'Workflow saved' });
        this.loadWorkflows();
      },
      error: () => { this.saving.set(false); this.messageService.add({ severity: 'error', summary: 'Failed to save' }); },
    });
  }

  toggleStatus(event: Event, wf: any) {
    event.stopPropagation();
    const newStatus = wf.status === 'active' ? 'paused' : 'active';
    this.api.put(`${this.basePath}/${wf.id}`, { status: newStatus }).subscribe({
      next: () => { wf.status = newStatus; this.workflows.update(l => [...l]); },
      error: () => this.messageService.add({ severity: 'error', summary: 'Failed' }),
    });
  }

  deleteWorkflow(event: Event, wf: any) {
    event.stopPropagation();
    this.confirmationService.confirm({
      message: `Delete "${wf.name}"? This cannot be undone.`,
      header: 'Delete Workflow', icon: 'pi pi-trash', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.delete(`${this.basePath}/${wf.id}`).subscribe({
          next: () => { this.workflows.update(l => l.filter(w => w.id !== wf.id)); this.messageService.add({ severity: 'success', summary: 'Deleted' }); },
          error: () => this.messageService.add({ severity: 'error', summary: 'Failed to delete' }),
        });
      },
    });
  }

  updateName(name: string) { const wf = this.editingWorkflow(); if (wf) { wf.name = name; this.editingWorkflow.set({ ...wf }); } }
  updateStatus(status: string) { const wf = this.editingWorkflow(); if (wf) { wf.status = status as any; this.editingWorkflow.set({ ...wf }); } }

  hasFallbackNode = computed(() => this.currentNodes().some(n => n.type === 'fallback'));

  addFallbackNode() {
    this.pushUndo();
    const fb = this.wfService.createFallbackNode(
      Math.max(100, ...this.currentNodes().map(n => n.x)) + 200,
      Math.max(100, ...this.currentNodes().map(n => n.y)) - 100,
    );
    this.currentNodes.update(nodes => [...nodes, fb]);
    this.selectNode(fb);
    this.messageService.add({ severity: 'success', summary: 'Fallback node added' });
  }
  togglePreview() { this.showPreview.update(v => !v); if (this.showPreview()) this.showConfigPanel.set(false); }
  selectNodeById(id: string) { this.selectedNodeId.set(id); }

  // ─── Canvas handlers (same as workflow-builder) ───────────────────
  private pushUndo() {
    this.undoStack.push({ nodes: this.currentNodes().map(n => ({ ...n, config: { ...n.config } })), edges: this.currentEdges().map(e => ({ ...e })) });
    this.redoStack = []; this.canUndo.set(true); this.canRedo.set(false);
  }
  undo() {
    const s = this.undoStack.pop(); if (!s) return;
    this.redoStack.push({ nodes: this.currentNodes().map(n => ({ ...n, config: { ...n.config } })), edges: this.currentEdges().map(e => ({ ...e })) });
    this.currentNodes.set(s.nodes); this.currentEdges.set(s.edges);
    this.canUndo.set(this.undoStack.length > 0); this.canRedo.set(true);
  }
  redo() {
    const s = this.redoStack.pop(); if (!s) return;
    this.undoStack.push({ nodes: this.currentNodes().map(n => ({ ...n, config: { ...n.config } })), edges: this.currentEdges().map(e => ({ ...e })) });
    this.currentNodes.set(s.nodes); this.currentEdges.set(s.edges);
    this.canUndo.set(true); this.canRedo.set(this.redoStack.length > 0);
  }
  selectNode(node: WorkflowNodeData) { this.selectedNodeId.set(node.id); this.showConfigPanel.set(true); }
  deselectNode() { this.selectedNodeId.set(null); this.showConfigPanel.set(false); }
  onNodesMoved(nodes: WorkflowNodeData[]) { this.currentNodes.set(nodes); }
  onNodeDrop(event: { type: string; x: number; y: number }) {
    const def = NODE_TYPE_DEFINITIONS.find(d => d.type === event.type); if (!def) return;
    this.pushUndo();
    const node = this.wfService.createNode(def, event.x - 96, event.y - 40);
    this.currentNodes.update(nodes => [...nodes, node]); this.selectNode(node);
  }
  onEdgeCreated(event: { fromId: string; toId: string }) {
    if (this.currentEdges().find(e => e.from === event.fromId && e.to === event.toId)) return;
    if (event.fromId === event.toId) return;
    this.pushUndo();
    this.currentEdges.update(edges => [...edges, this.wfService.createEdge(event.fromId, event.toId)]);
  }
  onEdgeDeleted(edgeId: string) { this.pushUndo(); this.currentEdges.update(edges => edges.filter(e => e.id !== edgeId)); }
  onNodeUpdated(node: WorkflowNodeData) { this.pushUndo(); this.currentNodes.update(nodes => nodes.map(n => n.id === node.id ? node : n)); }
  onDeleteNode(nodeId: string) {
    this.pushUndo();
    this.currentNodes.update(nodes => nodes.filter(n => n.id !== nodeId));
    this.currentEdges.update(edges => edges.filter(e => e.from !== nodeId && e.to !== nodeId));
    this.deselectNode();
  }
  onDuplicateNode(node: WorkflowNodeData) {
    const def = NODE_TYPE_DEFINITIONS.find(d => d.type === node.type); if (!def) return;
    this.pushUndo();
    const dupe = this.wfService.createNode(def, node.x + 30, node.y + 30);
    dupe.label = node.label + ' (copy)'; dupe.config = { ...node.config };
    this.currentNodes.update(nodes => [...nodes, dupe]); this.selectNode(dupe);
  }

  getSeverity(status: string): any {
    return { active: 'success', draft: 'warn', paused: 'secondary', archived: 'secondary', preview: 'info' }[status] ?? 'secondary';
  }
}
