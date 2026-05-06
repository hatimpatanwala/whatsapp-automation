import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

import { NodePaletteComponent } from './components/node-palette.component';
import { WorkflowCanvasComponent } from './components/workflow-canvas.component';
import { NodeConfigPanelComponent } from './components/node-config-panel.component';
import { WorkflowService } from './services/workflow.service';
import {
  WorkflowDefinition,
  WorkflowNodeData,
  WorkflowEdgeData,
  NODE_TYPE_DEFINITIONS,
} from './models/workflow.models';

@Component({
  selector: 'wa-workflow-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    TagModule,
    SelectModule,
    InputTextModule,
    DialogModule,
    ToastModule,
    TooltipModule,
    DividerModule,
    ConfirmDialogModule,
    NodePaletteComponent,
    WorkflowCanvasComponent,
    NodeConfigPanelComponent,
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
          <button pButton label="New Workflow" icon="pi pi-plus" severity="success" (click)="newWorkflowDialog = true"></button>
        </div>

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
            <p-tag [value]="editingWorkflow()!.status" [severity]="getWfSeverity(editingWorkflow()!.status)" styleClass="text-xs" />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400">{{ currentNodes().length }} nodes | {{ currentEdges().length }} connections</span>
            <p-divider layout="vertical" styleClass="h-6 mx-0" />
            <button pButton icon="pi pi-undo" class="p-button-text p-button-sm p-button-rounded" pTooltip="Undo" [disabled]="!canUndo()" (click)="undo()"></button>
            <button pButton icon="pi pi-refresh" class="p-button-text p-button-sm p-button-rounded" pTooltip="Redo" [disabled]="!canRedo()" (click)="redo()"></button>
            <p-divider layout="vertical" styleClass="h-6 mx-0" />
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
          @if (showConfigPanel()) {
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
        </div>
      </div>
    }

    <!-- ========== NEW WORKFLOW DIALOG ========== -->
    <p-dialog [(visible)]="newWorkflowDialog" header="Create New Workflow" [modal]="true" [style]="{width:'520px'}" [draggable]="false">
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
          <div class="grid grid-cols-2 gap-3">
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
  `,
})
export class WorkflowBuilderComponent {
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly workflowService = inject(WorkflowService);

  // State
  editingWorkflow = signal<WorkflowDefinition | null>(null);
  currentNodes = signal<WorkflowNodeData[]>([]);
  currentEdges = signal<WorkflowEdgeData[]>([]);
  selectedNodeId = signal<string | null>(null);
  showConfigPanel = signal(false);

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
  workflows = signal<WorkflowDefinition[]>([
    {
      id: '1', name: 'Order Confirmation Flow', description: 'Confirms orders and sends payment QR',
      status: 'active', trigger: 'order_created', nodes: [], edges: [],
      createdAt: '2026-04-15', updatedAt: '2 days ago', executionCount: 847, lastExecutedAt: '5 mins ago',
    },
    {
      id: '2', name: 'Payment Reminder', description: 'Sends reminders for pending payments',
      status: 'active', trigger: 'payment_pending', nodes: [], edges: [],
      createdAt: '2026-04-10', updatedAt: '1 week ago', executionCount: 312, lastExecutedAt: '1 hour ago',
    },
    {
      id: '3', name: 'Abandoned Cart Recovery', description: 'Recovers abandoned carts via WhatsApp',
      status: 'active', trigger: 'cart_abandoned', nodes: [], edges: [],
      createdAt: '2026-04-08', updatedAt: '3 days ago', executionCount: 145, lastExecutedAt: '30 mins ago',
    },
    {
      id: '4', name: 'Welcome New Customer', description: 'Greets new customers with catalog',
      status: 'paused', trigger: 'customer_created', nodes: [], edges: [],
      createdAt: '2026-03-25', updatedAt: '2 weeks ago', executionCount: 78, lastExecutedAt: '1 day ago',
    },
    {
      id: '5', name: 'Delivery Update Notifier', description: 'Notifies customers on delivery updates',
      status: 'draft', trigger: 'delivery_status_changed', nodes: [], edges: [],
      createdAt: '2026-05-01', updatedAt: 'Today', executionCount: 0,
    },
  ]);

  workflowTemplates = [
    { name: 'Order Flow', desc: 'Confirm, pay, and deliver', icon: 'pi-shopping-cart' },
    { name: 'Support Flow', desc: 'Greet, route, and resolve', icon: 'pi-headphones' },
    { name: 'Sales Flow', desc: 'Browse, search, and buy', icon: 'pi-chart-line' },
    { name: 'Blank Canvas', desc: 'Start from scratch', icon: 'pi-palette' },
  ];

  // --- Workflow list actions ---
  openWorkflow(wf: WorkflowDefinition) {
    // Load template nodes for demo workflows that haven't been populated yet
    if (!wf.nodes.length) {
      let template: { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } | null = null;
      if (wf.id === '1' || wf.id === '2') {
        template = this.workflowService.buildOrderFlowTemplate();
      } else if (wf.id === '3' || wf.id === '4') {
        template = this.workflowService.buildSalesFlowTemplate();
      } else if (wf.id === '5') {
        template = this.workflowService.buildSupportFlowTemplate();
      }
      if (template) {
        wf.nodes = template.nodes;
        wf.edges = template.edges;
      }
    }
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
    wf.status = wf.status === 'active' ? 'paused' : 'active';
    this.workflows.update(list => [...list]);
    this.messageService.add({ severity: 'info', summary: 'Updated', detail: `${wf.name} is now ${wf.status}` });
  }

  deleteWorkflow(event: Event, wf: WorkflowDefinition) {
    event.stopPropagation();
    this.confirmationService.confirm({
      message: `Delete "${wf.name}"? This cannot be undone.`,
      header: 'Delete Workflow',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.workflows.update(list => list.filter(w => w.id !== wf.id));
        this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Workflow deleted' });
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

    if (this.selectedTemplate === 'Order Flow') {
      const t = this.workflowService.buildOrderFlowTemplate();
      nodes = t.nodes;
      edges = t.edges;
    } else if (this.selectedTemplate === 'Support Flow') {
      const t = this.workflowService.buildSupportFlowTemplate();
      nodes = t.nodes;
      edges = t.edges;
    } else if (this.selectedTemplate === 'Sales Flow') {
      const t = this.workflowService.buildSalesFlowTemplate();
      nodes = t.nodes;
      edges = t.edges;
    }

    const newWf: WorkflowDefinition = {
      id: Date.now().toString(),
      name: this.newWfName,
      description: this.newWfDescription,
      status: 'draft',
      trigger: 'message_received',
      nodes,
      edges,
      createdAt: new Date().toISOString(),
      updatedAt: 'Just now',
      executionCount: 0,
    };

    this.workflows.update(list => [newWf, ...list]);
    this.newWorkflowDialog = false;
    this.newWfName = '';
    this.newWfDescription = '';
    this.selectedTemplate = 'Blank Canvas';
    this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Workflow created successfully' });
    this.openWorkflow(newWf);
  }

  saveWorkflow() {
    const wf = this.editingWorkflow();
    if (wf) {
      wf.nodes = this.currentNodes();
      wf.edges = this.currentEdges();
      wf.updatedAt = 'Just now';
      this.workflows.update(list => [...list]);
    }
    this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Workflow saved successfully' });
  }

  getWfSeverity(status: string): any {
    const map: Record<string, any> = { active: 'success', draft: 'warn', paused: 'secondary', archived: 'secondary' };
    return map[status] ?? 'secondary';
  }
}
