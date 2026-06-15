import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageService, ConfirmationService } from 'primeng/api';

import { NodePaletteComponent } from './components/node-palette.component';
import { WorkflowCanvasComponent } from './components/workflow-canvas.component';
import { NodeConfigPanelComponent } from './components/node-config-panel.component';
import { WorkflowPreviewComponent } from './components/workflow-preview.component';
import { WorkflowService } from './services/workflow.service';
import {
  WorkflowDefinition,
  WorkflowNodeData,
  WorkflowEdgeData,
  NODE_TYPE_DEFINITIONS,
  WORKFLOW_VARIABLES,
  WorkflowVariable,
} from './models/workflow.models';

@Component({
  selector: 'wa-workflow-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    TagModule,
    SelectModule,
    InputTextModule,
    DialogModule,
    ToastModule,
    TooltipModule,
    DividerModule,
    ConfirmDialogModule,
    SkeletonModule,
    NodePaletteComponent,
    WorkflowCanvasComponent,
    NodeConfigPanelComponent,
    WorkflowPreviewComponent,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />
    <p-confirmDialog />

    @if (!editingWorkflow()) {
      <!-- ========== WORKFLOW LIST VIEW ========== -->
      <div class="p-6 space-y-5">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">Workflow Builder</h1>
            <p class="text-gray-500 text-sm">Automate your WhatsApp commerce flows with drag-and-drop</p>
          </div>
          <div class="flex gap-2">
            <button pButton label="Chat Simulator" icon="pi pi-comments" severity="info" routerLink="/workflow-simulator"></button>
            <button pButton label="New Workflow" icon="pi pi-plus" severity="success" (click)="newWorkflowDialog = true"></button>
          </div>
        </div>

        @if (loading()) {
          <!-- Skeleton loading state -->
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            @for (i of [1,2,3,4,5,6]; track i) {
              <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <div class="flex items-start justify-between mb-3">
                  <div class="flex-1 min-w-0 space-y-2">
                    <p-skeleton width="60%" height="1.1rem" />
                    <p-skeleton width="80%" height="0.8rem" />
                  </div>
                  <p-skeleton width="4rem" height="1.4rem" borderRadius="1rem" styleClass="ml-2" />
                </div>
                <div class="flex items-center gap-4 border-t border-gray-100 pt-3 mt-3">
                  <p-skeleton width="4rem" height="0.8rem" />
                  <p-skeleton width="4rem" height="0.8rem" />
                  <p-skeleton width="4rem" height="0.8rem" styleClass="ml-auto" />
                </div>
                <div class="flex gap-2 mt-3">
                  <p-skeleton width="100%" height="2rem" borderRadius="0.375rem" />
                  <p-skeleton width="2rem" height="2rem" shape="circle" />
                  <p-skeleton width="2rem" height="2rem" shape="circle" />
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            @for (wf of workflows(); track wf.id) {
              <div
                class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-primary-200 transition-all cursor-pointer group"
                (click)="openWorkflow(wf)"
              >
                <div class="flex items-start justify-between mb-3">
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-gray-900 truncate">{{ wf.name }}</h3>
                    <p class="text-xs text-gray-400 mt-0.5">{{ wf.description || 'No description' }}</p>
                  </div>
                  <p-tag [value]="wf.status" [severity]="getWfSeverity(wf.status)" styleClass="text-xs capitalize" />
                </div>

                <div class="flex items-center gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3 mt-3">
                  <span class="flex items-center gap-1">
                    <i class="pi pi-box" style="font-size:0.65rem"></i>
                    {{ wf.nodes.length }} nodes
                  </span>
                  <span class="flex items-center gap-1">
                    <i class="pi pi-play" style="font-size:0.65rem"></i>
                    {{ wf.executionCount | number }} runs
                  </span>
                  <span class="ml-auto text-gray-400">{{ wf.updatedAt }}</span>
                </div>

                <div class="flex gap-2 mt-3">
                  <button pButton
                    [icon]="wf.status === 'active' ? 'pi pi-pause' : 'pi pi-play'"
                    [label]="wf.status === 'active' ? 'Pause' : 'Activate'"
                    class="p-button-sm p-button-outlined flex-1"
                    [severity]="wf.status === 'active' ? 'warn' : 'success'"
                    (click)="toggleWorkflow($event, wf)">
                  </button>
                  <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm p-button-rounded" pTooltip="Edit" (click)="openWorkflow(wf); $event.stopPropagation()"></button>
                  <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded p-button-danger" pTooltip="Delete" (click)="deleteWorkflow($event, wf)"></button>
                </div>
              </div>
            }

            @if (!workflows().length) {
              <div class="col-span-3 text-center py-16">
                <div class="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <i class="pi pi-sitemap text-gray-400" style="font-size:2.5rem"></i>
                </div>
                <h3 class="text-lg font-semibold text-gray-700">No workflows yet</h3>
                <p class="text-gray-400 text-sm mt-1">Create your first workflow to automate WhatsApp interactions</p>
                <button pButton label="Create Workflow" icon="pi pi-plus" severity="success" class="mt-4" (click)="newWorkflowDialog = true"></button>
              </div>
            }
          </div>
        }
      </div>
    } @else {
      <!-- ========== WORKFLOW EDITOR VIEW ========== -->
      <div class="flex flex-col h-screen" style="max-height:calc(100vh - 64px)">
        <!-- Editor toolbar -->
        <div class="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
          <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-sm p-button-rounded" pTooltip="Back to list" (click)="closeEditor()"></button>
          <p-divider layout="vertical" styleClass="h-6 mx-0" />
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <input
              pInputText
              [ngModel]="editingWorkflow()!.name"
              (ngModelChange)="updateWorkflowName($event)"
              class="text-sm font-semibold border-0 bg-transparent p-1 hover:bg-gray-50 focus:bg-gray-50 rounded"
              style="max-width:300px"
            />
            <p-select
              [ngModel]="editingWorkflow()!.status"
              (ngModelChange)="updateWorkflowStatus($event)"
              [options]="statusOptions"
              optionLabel="label" optionValue="value"
              styleClass="w-28"
              pTooltip="Change workflow status"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400">{{ currentNodes().length }} nodes | {{ currentEdges().length }} connections</span>
            <p-divider layout="vertical" styleClass="h-6 mx-0" />
            <button pButton icon="pi pi-undo" class="p-button-text p-button-sm p-button-rounded" pTooltip="Undo" [disabled]="!canUndo()" (click)="undo()"></button>
            <button pButton icon="pi pi-refresh" class="p-button-text p-button-sm p-button-rounded" pTooltip="Redo" [disabled]="!canRedo()" (click)="redo()"></button>
            <p-divider layout="vertical" styleClass="h-6 mx-0" />
            <button pButton label="Variables" icon="pi pi-hashtag" class="p-button-text p-button-sm" pTooltip="See the variables you can use in messages" (click)="showVariablesDialog = true"></button>
            <p-divider layout="vertical" styleClass="h-6 mx-0" />
            @if (!hasFallbackNode()) {
              <button pButton label="+ Fallback" icon="pi pi-shield" class="p-button-sm p-button-outlined" severity="warn" pTooltip="Add a fallback handler for invalid inputs" (click)="addFallbackNode()"></button>
            }
            <button
              pButton
              [label]="showPreview() ? 'Close Preview' : 'Preview'"
              [icon]="showPreview() ? 'pi pi-times' : 'pi pi-play'"
              class="p-button-sm"
              [severity]="showPreview() ? 'secondary' : 'info'"
              (click)="togglePreview()"
              pTooltip="Test workflow with WhatsApp-style chat simulator"
            ></button>
            <button pButton label="Save" icon="pi pi-check" class="p-button-sm" severity="success" (click)="saveWorkflow()"></button>
          </div>
        </div>

        <!-- Editor body: palette | canvas | config -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Left: Node Palette -->
          <div class="w-56 shrink-0">
            <wa-node-palette />
          </div>

          <!-- Center: Canvas -->
          <div class="flex-1 bg-gray-100">
            <wa-workflow-canvas
              [nodes]="currentNodes()"
              [edges]="currentEdges()"
              [selectedNodeId]="selectedNodeId()"
              (nodeSelected)="selectNode($event)"
              (nodesMoved)="onNodesMoved($event)"
              (edgeCreated)="onEdgeCreated($event)"
              (edgeDeleted)="onEdgeDeleted($event)"
              (nodeDrop)="onNodeDrop($event)"
            />
          </div>

          <!-- Right: Config Panel -->
          @if (showConfigPanel() && !showPreview()) {
            <div class="w-72 shrink-0">
              <wa-node-config-panel
                [node]="selectedNode()"
                (nodeUpdated)="onNodeUpdated($event)"
                (deleteNode)="onDeleteNode($event)"
                (duplicateNode)="onDuplicateNode($event)"
                (panelClosed)="deselectNode()"
              />
            </div>
          }

          <!-- Right: Preview Panel -->
          @if (showPreview()) {
            <div class="w-96 shrink-0">
              <wa-workflow-preview
                [nodes]="currentNodes()"
                [edges]="currentEdges()"
                (closed)="showPreview.set(false)"
                (highlightNode)="onPreviewHighlightNode($event)"
              />
            </div>
          }
        </div>
      </div>
    }

    <!-- ========== NEW WORKFLOW DIALOG ========== -->
    <p-dialog [(visible)]="newWorkflowDialog" header="Create New Workflow" [modal]="true" [style]="{width:'680px'}" [draggable]="false">
      <div class="space-y-4 py-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Workflow Name *</label>
          <input pInputText [(ngModel)]="newWfName" placeholder="e.g. Order Confirmation Flow" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <input pInputText [(ngModel)]="newWfDescription" placeholder="Brief description of what this workflow does" class="w-full" />
        </div>

        <!-- Templates -->
        <div>
          <label class="text-sm font-medium text-gray-700 mb-2 block">Start from a template</label>
          <div class="grid grid-cols-3 gap-3">
            @for (template of workflowTemplates; track template.name) {
              <div
                class="p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
                [class.border-primary-500]="selectedTemplate === template.name"
                [class.bg-primary-50]="selectedTemplate === template.name"
                [class.shadow-sm]="selectedTemplate === template.name"
                (click)="selectedTemplate = template.name"
              >
                <i [class]="'pi ' + template.icon + ' mb-1'" [style.color]="selectedTemplate === template.name ? '#128C7E' : '#6b7280'" style="font-size:1.25rem"></i>
                <p class="text-xs font-semibold text-gray-800">{{ template.name }}</p>
                <p class="text-xs text-gray-500 mt-0.5">{{ template.desc }}</p>
              </div>
            }
          </div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-outlined" (click)="newWorkflowDialog = false"></button>
        <button pButton label="Create Workflow" icon="pi pi-plus" severity="success" [disabled]="!newWfName.trim()" (click)="createWorkflow()"></button>
      </ng-template>
    </p-dialog>

    <!-- ========== VARIABLES REFERENCE DIALOG ========== -->
    <p-dialog [(visible)]="showVariablesDialog" header="Available Variables" [modal]="true" [style]="{width:'620px'}" [draggable]="false">
      <p class="text-sm text-gray-500 mb-3">
        Use these inside any message with double braces, e.g. <code class="bg-gray-100 px-1 rounded text-xs">Hi {{ '{{customer_name}}' }}!</code>.
        For branching, set a Switch node's variable to <code class="bg-gray-100 px-1 rounded text-xs">button_reply</code> or <code class="bg-gray-100 px-1 rounded text-xs">list_reply</code>.
      </p>
      @for (group of variableGroups; track group) {
        <div class="mb-3">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{{ group }}</p>
          <div class="space-y-1.5">
            @for (v of variablesByGroup(group); track v.name) {
              <div class="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 border border-gray-100">
                <code class="bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded text-xs font-mono whitespace-nowrap">{{ '{{' + v.name + '}}' }}</code>
                <div class="min-w-0">
                  <p class="text-xs text-gray-700">{{ v.description }}</p>
                  <p class="text-[11px] text-gray-400 mt-0.5">{{ v.example }}</p>
                </div>
              </div>
            }
          </div>
        </div>
      }
      <ng-template pTemplate="footer">
        <button pButton label="Got it" icon="pi pi-check" (click)="showVariablesDialog = false"></button>
      </ng-template>
    </p-dialog>
  `,
})
export class WorkflowBuilderComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly workflowService = inject(WorkflowService);

  // Status options
  statusOptions = [
    { label: 'Draft', value: 'draft' },
    { label: 'Active', value: 'active' },
    { label: 'Paused', value: 'paused' },
    { label: 'Preview', value: 'preview' },
    { label: 'Archived', value: 'archived' },
  ];

  // Preview
  showPreview = signal(false);

  // Variables reference
  showVariablesDialog = false;
  variableGroups: WorkflowVariable['group'][] = ['Customer', 'Conversation', 'Commerce', 'Integration'];
  variablesByGroup(group: WorkflowVariable['group']): WorkflowVariable[] {
    return WORKFLOW_VARIABLES.filter((v) => v.group === group);
  }

  // State
  editingWorkflow = signal<WorkflowDefinition | null>(null);
  currentNodes = signal<WorkflowNodeData[]>([]);
  currentEdges = signal<WorkflowEdgeData[]>([]);
  selectedNodeId = signal<string | null>(null);
  showConfigPanel = signal(false);
  loading = signal(true);

  // Undo/redo
  private undoStack: { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] }[] = [];
  private redoStack: { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] }[] = [];
  canUndo = signal(false);
  canRedo = signal(false);

  // Dialog state
  newWorkflowDialog = false;
  newWfName = '';
  newWfDescription = '';
  selectedTemplate = 'Blank Canvas';

  // Computed
  selectedNode = computed(() => {
    const id = this.selectedNodeId();
    if (!id) return null;
    return this.currentNodes().find(n => n.id === id) || null;
  });

  // Data
  workflows = signal<WorkflowDefinition[]>([]);

  workflowTemplates = [
    { name: 'Order Flow', desc: 'Confirm, pay, and deliver', icon: 'pi-shopping-cart' },
    { name: 'Support Flow', desc: 'Greet, route, and resolve', icon: 'pi-headphones' },
    { name: 'Sales Flow', desc: 'Browse, search, and buy', icon: 'pi-chart-line' },
    { name: 'Welcome Flow', desc: 'Greet and show main menu', icon: 'pi-comments' },
    { name: 'Appointment Flow', desc: 'Book and manage appointments', icon: 'pi-calendar' },
    { name: 'Feedback Flow', desc: 'Collect post-delivery feedback', icon: 'pi-star' },
    { name: 'Abandoned Cart', desc: 'Recover abandoned carts', icon: 'pi-cart-arrow-down' },
    { name: 'Order Tracking', desc: 'Track order status', icon: 'pi-map-marker' },
    { name: 'Blank Canvas', desc: 'Start from scratch', icon: 'pi-palette' },
  ];

  ngOnInit(): void {
    this.loadWorkflows();
  }

  private loadWorkflows(): void {
    this.loading.set(true);
    this.workflowService.getAll().subscribe({
      next: (response: any) => {
        const items: any[] = Array.isArray(response) ? response : (response?.data ?? response?.items ?? []);
        const mapped: WorkflowDefinition[] = items.map((w: any) => ({
          id: w.id,
          name: w.name,
          description: w.description || '',
          status: w.status || 'draft',
          trigger: w.trigger || 'message_received',
          nodes: w.nodes || [],
          edges: w.edges || [],
          createdAt: w.created_at || w.createdAt || '',
          updatedAt: w.updated_at || w.updatedAt || '',
          executionCount: w.execution_count ?? w.executionCount ?? 0,
          lastExecutedAt: w.last_executed_at || w.lastExecutedAt,
        }));
        this.workflows.set(mapped);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load workflows' });
      },
    });
  }

  // --- Workflow list actions ---
  openWorkflow(wf: WorkflowDefinition) {
    if (!wf.nodes.length && wf.id) {
      // Load full workflow from backend
      this.workflowService.getById(wf.id).subscribe({
        next: (full: any) => {
          wf.nodes = full.nodes || [];
          wf.edges = full.edges || [];
          this.setEditorState(wf);
        },
        error: () => {
          this.setEditorState(wf);
        },
      });
    } else {
      this.setEditorState(wf);
    }
  }

  private setEditorState(wf: WorkflowDefinition) {
    this.editingWorkflow.set(wf);
    this.currentNodes.set([...wf.nodes]);
    this.currentEdges.set([...wf.edges]);
    this.selectedNodeId.set(null);
    this.showConfigPanel.set(false);
    this.undoStack = [];
    this.redoStack = [];
    this.canUndo.set(false);
    this.canRedo.set(false);
  }

  closeEditor() {
    const wf = this.editingWorkflow();
    if (wf) {
      wf.nodes = this.currentNodes();
      wf.edges = this.currentEdges();
    }
    this.editingWorkflow.set(null);
    this.selectedNodeId.set(null);
    this.showConfigPanel.set(false);
  }

  toggleWorkflow(event: Event, wf: WorkflowDefinition) {
    event.stopPropagation();
    const action$ = wf.status === 'active'
      ? this.workflowService.pause(wf.id)
      : this.workflowService.activate(wf.id);
    action$.subscribe({
      next: (result: any) => {
        wf.status = result.status || (wf.status === 'active' ? 'paused' : 'active');
        this.workflows.update(list => [...list]);
        this.messageService.add({ severity: 'info', summary: 'Updated', detail: `${wf.name} is now ${wf.status}` });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update workflow status' });
      },
    });
  }

  deleteWorkflow(event: Event, wf: WorkflowDefinition) {
    event.stopPropagation();
    this.confirmationService.confirm({
      message: `Delete "${wf.name}"? This cannot be undone.`,
      header: 'Delete Workflow',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.workflowService.deleteWorkflow(wf.id).subscribe({
          next: () => {
            this.workflows.update(list => list.filter(w => w.id !== wf.id));
            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Workflow deleted' });
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete workflow' });
          },
        });
      },
    });
  }

  updateWorkflowName(name: string) {
    const wf = this.editingWorkflow();
    if (wf) {
      wf.name = name;
      this.editingWorkflow.set({ ...wf });
    }
  }

  // --- Canvas event handlers ---
  private pushUndo() {
    this.undoStack.push({
      nodes: this.currentNodes().map(n => ({ ...n, config: { ...n.config } })),
      edges: this.currentEdges().map(e => ({ ...e })),
    });
    this.redoStack = [];
    this.canUndo.set(true);
    this.canRedo.set(false);
  }

  undo() {
    const state = this.undoStack.pop();
    if (!state) return;
    this.redoStack.push({
      nodes: this.currentNodes().map(n => ({ ...n, config: { ...n.config } })),
      edges: this.currentEdges().map(e => ({ ...e })),
    });
    this.currentNodes.set(state.nodes);
    this.currentEdges.set(state.edges);
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(true);
  }

  redo() {
    const state = this.redoStack.pop();
    if (!state) return;
    this.undoStack.push({
      nodes: this.currentNodes().map(n => ({ ...n, config: { ...n.config } })),
      edges: this.currentEdges().map(e => ({ ...e })),
    });
    this.currentNodes.set(state.nodes);
    this.currentEdges.set(state.edges);
    this.canUndo.set(true);
    this.canRedo.set(this.redoStack.length > 0);
  }

  selectNode(node: WorkflowNodeData) {
    this.selectedNodeId.set(node.id);
    this.showConfigPanel.set(true);
  }

  deselectNode() {
    this.selectedNodeId.set(null);
    this.showConfigPanel.set(false);
  }

  onNodesMoved(updatedNodes: WorkflowNodeData[]) {
    this.currentNodes.set(updatedNodes);
  }

  onNodeDrop(event: { type: string; x: number; y: number }) {
    const def = NODE_TYPE_DEFINITIONS.find(d => d.type === event.type);
    if (!def) return;
    this.pushUndo();
    const node = this.workflowService.createNode(def, event.x - 96, event.y - 40);
    this.currentNodes.update(nodes => [...nodes, node]);
    this.selectNode(node);
  }

  onEdgeCreated(event: { fromId: string; toId: string }) {
    // Prevent duplicate edges
    const existing = this.currentEdges().find(e => e.from === event.fromId && e.to === event.toId);
    if (existing) return;
    // Prevent self-loops
    if (event.fromId === event.toId) return;
    this.pushUndo();
    const edge = this.workflowService.createEdge(event.fromId, event.toId);
    this.currentEdges.update(edges => [...edges, edge]);
  }

  onEdgeDeleted(edgeId: string) {
    this.pushUndo();
    this.currentEdges.update(edges => edges.filter(e => e.id !== edgeId));
  }

  onNodeUpdated(updatedNode: WorkflowNodeData) {
    this.pushUndo();
    this.currentNodes.update(nodes =>
      nodes.map(n => (n.id === updatedNode.id ? updatedNode : n))
    );
  }

  onDeleteNode(nodeId: string) {
    this.pushUndo();
    this.currentNodes.update(nodes => nodes.filter(n => n.id !== nodeId));
    this.currentEdges.update(edges => edges.filter(e => e.from !== nodeId && e.to !== nodeId));
    this.deselectNode();
  }

  onDuplicateNode(node: WorkflowNodeData) {
    this.pushUndo();
    const def = NODE_TYPE_DEFINITIONS.find(d => d.type === node.type);
    if (!def) return;
    const dupe = this.workflowService.createNode(def, node.x + 30, node.y + 30);
    dupe.label = node.label + ' (copy)';
    dupe.description = node.description;
    dupe.config = { ...node.config };
    this.currentNodes.update(nodes => [...nodes, dupe]);
    this.selectNode(dupe);
  }

  // --- Create workflow ---
  createWorkflow() {
    if (!this.newWfName.trim()) return;

    let nodes: WorkflowNodeData[] = [];
    let edges: WorkflowEdgeData[] = [];

    const templateBuilders: Record<string, () => { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] }> = {
      'Order Flow': () => this.workflowService.buildOrderFlowTemplate(),
      'Support Flow': () => this.workflowService.buildSupportFlowTemplate(),
      'Sales Flow': () => this.workflowService.buildSalesFlowTemplate(),
      'Welcome Flow': () => this.workflowService.buildWelcomeFlowTemplate(),
      'Appointment Flow': () => this.workflowService.buildAppointmentFlowTemplate(),
      'Feedback Flow': () => this.workflowService.buildFeedbackFlowTemplate(),
      'Abandoned Cart': () => this.workflowService.buildAbandonedCartFlowTemplate(),
      'Order Tracking': () => this.workflowService.buildOrderTrackingFlowTemplate(),
    };
    const builder = templateBuilders[this.selectedTemplate];
    if (builder) {
      const t = builder();
      nodes = t.nodes;
      edges = t.edges;
    }
    // Auto-add fallback node to every new workflow
    const withFb = this.workflowService.ensureFallback(nodes, edges);
    nodes = withFb.nodes;
    edges = withFb.edges;

    this.workflowService.create({
      name: this.newWfName,
      description: this.newWfDescription,
      trigger: 'message_received',
    }).subscribe({
      next: (created: any) => {
        const wf: WorkflowDefinition = {
          id: created.id,
          name: created.name,
          description: created.description || '',
          status: created.status || 'draft',
          trigger: created.trigger || 'message_received',
          nodes,
          edges,
          createdAt: created.created_at || created.createdAt,
          updatedAt: created.updated_at || created.updatedAt || 'Just now',
          executionCount: 0,
        };
        // If template has nodes, save them to the backend
        if (nodes.length > 0) {
          this.workflowService.saveDefinition(wf.id, { nodes, edges }).subscribe();
        }
        this.workflows.update(list => [wf, ...list]);
        this.newWorkflowDialog = false;
        this.newWfName = '';
        this.newWfDescription = '';
        this.selectedTemplate = 'Blank Canvas';
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Workflow created successfully' });
        this.openWorkflow(wf);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create workflow' });
      },
    });
  }

  saveWorkflow() {
    const wf = this.editingWorkflow();
    if (!wf) return;

    const nodes = this.currentNodes();
    const edges = this.currentEdges();

    const { errors, warnings } = this.validateWorkflow(nodes, edges);
    if (errors.length) {
      this.messageService.add({
        severity: 'error',
        summary: 'Cannot save yet',
        detail: errors[0] + (errors.length > 1 ? ` (and ${errors.length - 1} more issue${errors.length > 2 ? 's' : ''})` : ''),
        life: 7000,
      });
      return;
    }

    this.workflowService.saveDefinition(wf.id, { nodes, edges, status: wf.status } as any).subscribe({
      next: () => {
        wf.nodes = nodes;
        wf.edges = edges;
        wf.updatedAt = 'Just now';
        this.workflows.update(list => [...list]);
        if (warnings.length) {
          this.messageService.add({
            severity: 'warn',
            summary: 'Saved with warnings',
            detail: warnings[0] + (warnings.length > 1 ? ` (and ${warnings.length - 1} more)` : ''),
            life: 7000,
          });
        } else {
          this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Workflow saved successfully' });
        }
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save workflow' });
      },
    });
  }

  /**
   * Validate the workflow before saving. Hard errors block the save; warnings
   * allow it but surface likely problems (dead ends, unconnected nodes).
   */
  private validateWorkflow(
    nodes: WorkflowNodeData[],
    edges: WorkflowEdgeData[],
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!nodes.length) {
      errors.push('Add at least one node to the canvas.');
      return { errors, warnings };
    }

    const triggers = nodes.filter((n) => n.type.startsWith('trigger_'));
    if (triggers.length === 0) {
      errors.push('Add a trigger node — every workflow needs a starting point.');
    }

    const defMap = new Map(NODE_TYPE_DEFINITIONS.map((d) => [d.type, d]));
    const incoming = new Set(edges.map((e) => e.to));
    const outCount = new Map<string, number>();
    edges.forEach((e) => outCount.set(e.from, (outCount.get(e.from) || 0) + 1));

    for (const n of nodes) {
      const def = defMap.get(n.type);
      const name = n.label || n.type;

      // Required config fields
      if (def) {
        for (const f of def.configFields) {
          if (!f.required) continue;
          if (f.showWhen && n.config?.[f.showWhen.field] !== f.showWhen.value) continue;
          const v = n.config?.[f.key];
          const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
          if (empty) errors.push(`"${name}": ${f.label} is required.`);
        }
      }

      // send_buttons must have at least one button
      if (n.type === 'send_buttons') {
        const btns = n.config?.['buttons'];
        const count = Array.isArray(btns) ? btns.length : 0;
        if (count === 0) errors.push(`"${name}": add at least one button.`);
      }

      // Unconnected non-trigger node
      if (!n.type.startsWith('trigger_') && !incoming.has(n.id)) {
        warnings.push(`"${name}" isn't connected to anything — it will never run.`);
      }

      // Branching/menu nodes with no outgoing connection = dead end
      const branching = ['switch', 'send_buttons', 'send_list', 'condition'];
      if (branching.includes(n.type) && !(outCount.get(n.id)! > 0)) {
        warnings.push(`"${name}" has no outgoing connection — the customer will hit a dead end.`);
      }
    }

    return { errors, warnings };
  }

  hasFallbackNode = computed(() => this.currentNodes().some(n => n.type === 'fallback'));

  addFallbackNode() {
    this.pushUndo();
    const fb = this.workflowService.createFallbackNode(
      Math.max(100, ...this.currentNodes().map(n => n.x)) + 200,
      Math.max(100, ...this.currentNodes().map(n => n.y)) - 100,
    );
    this.currentNodes.update(nodes => [...nodes, fb]);
    this.selectNode(fb);
    this.messageService.add({ severity: 'success', summary: 'Fallback node added', detail: 'Configure the message and connect edges' });
  }

  updateWorkflowStatus(status: string) {
    const wf = this.editingWorkflow();
    if (wf) {
      wf.status = status as any;
      this.editingWorkflow.set({ ...wf });
    }
  }

  togglePreview() {
    this.showPreview.update(v => !v);
    if (this.showPreview()) {
      this.showConfigPanel.set(false);
    }
  }

  onPreviewHighlightNode(nodeId: string) {
    this.selectedNodeId.set(nodeId);
  }

  getWfSeverity(status: string): any {
    const map: Record<string, any> = { active: 'success', draft: 'warn', paused: 'secondary', archived: 'secondary', preview: 'info' };
    return map[status] ?? 'secondary';
  }
}
