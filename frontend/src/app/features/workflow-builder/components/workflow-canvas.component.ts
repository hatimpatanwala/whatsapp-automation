import {
  Component,
  input,
  output,
  signal,
  computed,
  ElementRef,
  viewChild,
  effect,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipModule } from 'primeng/tooltip';
import {
  WorkflowNodeData,
  WorkflowEdgeData,
  NodeTypeDefinition,
  NODE_TYPE_DEFINITIONS,
} from '../models/workflow.models';

interface EdgePath {
  id: string;
  d: string;
  label?: string;
  labelX: number;
  labelY: number;
  fromId: string;
  toId: string;
  highlighted: boolean;
}

@Component({
  selector: 'wa-workflow-canvas',
  standalone: true,
  imports: [CommonModule, TooltipModule],
  template: `
    <div
      class="relative w-full h-full overflow-hidden"
      #canvasContainer
      (dragover)="onDragOver($event)"
      (drop)="onDrop($event)"
      (pointerdown)="onCanvasPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (wheel)="onWheel($event)"
    >
      <!-- Zoomable/pannable layer -->
      <div
        class="absolute inset-0"
        [style.transform]="'translate(' + panX() + 'px, ' + panY() + 'px) scale(' + zoom() + ')'"
        [style.transform-origin]="'0 0'"
        #canvasWorld
      >
        <!-- Grid background -->
        <div class="absolute" style="top:-5000px;left:-5000px;width:10000px;height:10000px;background-image:radial-gradient(circle, #d1d5db 1px, transparent 1px);background-size:24px 24px;"></div>

        <!-- SVG Edge layer -->
        <svg class="absolute" style="top:0;left:0;width:10000px;height:10000px;overflow:visible;pointer-events:none;">
          <defs>
            <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
            </marker>
            <marker id="wf-arrow-hl" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L6,3 L0,6 Z" fill="#128C7E" />
            </marker>
          </defs>
          <!-- Edge paths -->
          @for (edge of edgePaths(); track edge.id) {
            <g class="cursor-pointer" style="pointer-events:auto" (click)="onEdgeClick(edge)">
              <path
                [attr.d]="edge.d"
                fill="none"
                [attr.stroke]="selectedEdgeId() === edge.id ? '#ef4444' : edge.highlighted ? '#128C7E' : '#94a3b8'"
                [attr.stroke-width]="selectedEdgeId() === edge.id || edge.highlighted ? 3 : 2"
                stroke-linecap="round"
                [attr.marker-end]="edge.highlighted ? 'url(#wf-arrow-hl)' : 'url(#wf-arrow)'"
              />
              <!-- Invisible wider path for easier clicking -->
              <path [attr.d]="edge.d" fill="none" stroke="transparent" stroke-width="14" />
              @if (edge.label) {
                <rect
                  [attr.x]="edge.labelX - (edge.label.length * 3.2 + 8)"
                  [attr.y]="edge.labelY - 10"
                  [attr.width]="edge.label.length * 6.4 + 16"
                  height="20"
                  rx="6"
                  [attr.fill]="edge.highlighted ? '#ecfdf5' : 'white'"
                  [attr.stroke]="edge.highlighted ? '#6ee7b7' : '#e2e8f0'"
                  stroke-width="1"
                />
                <text
                  [attr.x]="edge.labelX"
                  [attr.y]="edge.labelY + 4"
                  text-anchor="middle"
                  [attr.fill]="edge.highlighted ? '#047857' : '#64748b'"
                  font-size="10"
                  font-weight="600"
                >{{ edge.label }}</text>
              }
            </g>
          }

          <!-- Connection line being drawn -->
          @if (connectingFrom() && tempEdgePath()) {
            <path
              [attr.d]="tempEdgePath()"
              fill="none"
              stroke="#25D366"
              stroke-width="2"
              stroke-dasharray="6 4"
              stroke-linecap="round"
            />
          }
        </svg>

        <!-- Node layer -->
        @for (node of nodes(); track node.id) {
          <div
            class="absolute select-none"
            [style.left.px]="node.x"
            [style.top.px]="node.y"
            [style.z-index]="draggingNodeId() === node.id ? 100 : 1"
          >
            <div
              data-workflow-node
              class="w-48 rounded-xl shadow-md border-2 bg-white transition-shadow hover:shadow-lg"
              [style.border-color]="getNodeDef(node.type)?.color || '#94a3b8'"
              [class.ring-2]="selectedNodeId() === node.id"
              [class.ring-offset-1]="selectedNodeId() === node.id"
              [style.--tw-ring-color]="getNodeDef(node.type)?.color || '#3b82f6'"
            >
              <!-- Node header (drag handle) -->
              <div
                class="flex items-center gap-2 px-3 py-2 rounded-t-lg cursor-move"
                [style.background-color]="(getNodeDef(node.type)?.color || '#94a3b8') + '12'"
                (pointerdown)="onNodePointerDown($event, node)"
                (click)="onNodeClick($event, node)"
              >
                <!-- Input connector (top) -->
                @if (getNodeDef(node.type)?.category !== 'trigger') {
                  <div
                    class="absolute left-1/2 w-4 h-4 rounded-full border-2 bg-white cursor-pointer z-10 hover:scale-125 transition-transform"
                    style="top:-8px;transform:translateX(-50%)"
                    [style.border-color]="getNodeDef(node.type)?.color || '#94a3b8'"
                    [class.bg-green-400]="connectingFrom()"
                    (pointerdown)="$event.stopPropagation()"
                    (click)="onInputPortClick($event, node)"
                  ></div>
                }

                <div
                  class="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  [style.background-color]="(getNodeDef(node.type)?.color || '#94a3b8') + '25'"
                >
                  <i [class]="'pi ' + (getNodeDef(node.type)?.icon || 'pi-circle')" [style.color]="getNodeDef(node.type)?.color" style="font-size:0.7rem"></i>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-bold text-gray-800 truncate">{{ node.label }}</p>
                </div>
              </div>

              <!-- Node body -->
              <div class="px-3 py-2" (click)="onNodeClick($event, node)">
                <p class="text-xs text-gray-500 leading-relaxed wa-line-clamp-2">{{ node.description }}</p>
                <!-- Config preview -->
                @if (getConfigPreview(node)) {
                  <div class="mt-1.5 px-2 py-1 bg-gray-50 rounded-md">
                    <p class="text-xs text-gray-400 truncate" style="font-size:0.65rem">{{ getConfigPreview(node) }}</p>
                  </div>
                }
              </div>

              <!-- Output connectors (bottom). Filled with the node colour = connected. -->
              @if ((getNodeDef(node.type)?.maxOutputs || 0) > 0) {
                <div class="flex justify-center gap-3 pb-2.5 relative items-center">
                  @for (i of getOutputPorts(node); track i) {
                    <div
                      class="w-5 h-5 rounded-full border-2 cursor-pointer hover:scale-110 transition-transform flex items-center justify-center shadow-sm"
                      [style.border-color]="getNodeDef(node.type)?.color || '#94a3b8'"
                      [style.background-color]="i < outgoingCount(node.id) ? (getNodeDef(node.type)?.color || '#94a3b8') : (connectingFrom() === node.id ? '#bbf7d0' : 'white')"
                      (pointerdown)="$event.stopPropagation()"
                      (click)="onOutputPortClick($event, node, i)"
                      [pTooltip]="(getNodeDef(node.type)!.maxOutputs > 1 ? ('Output ' + (i + 1) + ' — ') : '') + (connectingFrom() === node.id ? 'now click a node to connect' : 'click, then click the target node')"
                      tooltipPosition="bottom"
                    >
                      @if (getNodeDef(node.type)!.maxOutputs > 1) {
                        <span
                          class="text-[9px] font-bold leading-none"
                          [style.color]="i < outgoingCount(node.id) ? 'white' : (getNodeDef(node.type)?.color || '#94a3b8')"
                        >{{ i + 1 }}</span>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Empty state -->
        @if (!nodes().length) {
          <div class="absolute flex items-center justify-center" style="top:150px;left:200px;width:300px">
            <div class="text-center">
              <div class="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <i class="pi pi-arrow-down text-gray-300" style="font-size:2rem"></i>
              </div>
              <p class="text-sm text-gray-400 font-medium">Drag nodes from the palette</p>
              <p class="text-xs text-gray-300 mt-1">Start with a Trigger node</p>
            </div>
          </div>
        }
      </div>

      <!-- Zoom controls -->
      <div class="absolute bottom-4 right-4 flex items-center gap-1 bg-white rounded-lg shadow-md border border-gray-200 px-1 py-1">
        <button class="w-7 h-7 rounded flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors" (click)="zoomOut()">
          <i class="pi pi-minus" style="font-size:0.7rem"></i>
        </button>
        <span class="text-xs text-gray-500 w-10 text-center font-mono">{{ (zoom() * 100).toFixed(0) }}%</span>
        <button class="w-7 h-7 rounded flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors" (click)="zoomIn()">
          <i class="pi pi-plus" style="font-size:0.7rem"></i>
        </button>
        <div class="w-px h-5 bg-gray-200 mx-0.5"></div>
        <button class="w-7 h-7 rounded flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors" (click)="resetView()" pTooltip="Reset view" tooltipPosition="top">
          <i class="pi pi-home" style="font-size:0.7rem"></i>
        </button>
      </div>

      <!-- Connection mode indicator -->
      @if (connectingFrom()) {
        <div class="absolute top-4 left-1/2 bg-green-500 text-white px-4 py-2 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 z-50" style="transform:translateX(-50%)">
          <i class="pi pi-link" style="font-size:0.7rem"></i>
          Click an input port to connect — Press Esc to cancel
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .edge-normal { stroke: #94a3b8; }
    .edge-selected { stroke: #ef4444; stroke-width: 3; }
    .wa-line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  `],
})
export class WorkflowCanvasComponent {
  nodes = input.required<WorkflowNodeData[]>();
  edges = input.required<WorkflowEdgeData[]>();
  selectedNodeId = input<string | null>(null);

  nodeSelected = output<WorkflowNodeData>();
  nodesMoved = output<WorkflowNodeData[]>();
  edgeCreated = output<{ fromId: string; toId: string }>();
  edgeDeleted = output<string>();
  nodeDrop = output<{ type: string; x: number; y: number }>();

  canvasContainer = viewChild<ElementRef>('canvasContainer');

  zoom = signal(1);
  panX = signal(0);
  panY = signal(0);

  // Node dragging
  draggingNodeId = signal<string | null>(null);
  private dragStartX = 0;
  private dragStartY = 0;
  private nodeStartX = 0;
  private nodeStartY = 0;

  // Canvas panning
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panOriginX = 0;
  private panOriginY = 0;

  // Edge creation
  connectingFrom = signal<string | null>(null);
  private connectFromPortX = 0;
  private connectFromPortY = 0;
  tempMouseX = signal(0);
  tempMouseY = signal(0);

  selectedEdgeId = signal<string | null>(null);

  private nodeDefCache = new Map<string, NodeTypeDefinition>();

  constructor() {
    NODE_TYPE_DEFINITIONS.forEach(d => this.nodeDefCache.set(d.type, d));
  }

  getNodeDef(type: string): NodeTypeDefinition | undefined {
    return this.nodeDefCache.get(type);
  }

  getOutputPorts(node: WorkflowNodeData): number[] {
    const def = this.getNodeDef(node.type);
    const count = def?.maxOutputs || 1;
    return Array.from({ length: count }, (_, i) => i);
  }

  getConfigPreview(node: WorkflowNodeData): string {
    const keys = Object.keys(node.config || {});
    if (!keys.length) return '';
    const preview = keys
      .filter(k => node.config[k] !== undefined && node.config[k] !== '' && node.config[k] !== null)
      .map(k => `${k}: ${String(node.config[k]).substring(0, 20)}`)
      .slice(0, 2)
      .join(' | ');
    return preview;
  }

  // X offset (relative to node left edge) of output port `slot` of `count` ports.
  private portX(count: number, slot: number): number {
    const portW = 20, gap = 12, nodeW = 192;
    const total = count * portW + (count - 1) * gap;
    const startX = nodeW / 2 - total / 2;
    return startX + slot * (portW + gap) + portW / 2;
  }

  private buttonTitles(val: any): string[] {
    if (Array.isArray(val)) {
      return val.map((b: any) => (typeof b === 'string' ? b : (b?.title ?? b?.text ?? b?.label ?? '')));
    }
    if (typeof val === 'string') return val.split('\n').map(s => s.trim()).filter(Boolean);
    return [];
  }

  outgoingCount(nodeId: string): number {
    return this.edges().filter(e => e.from === nodeId).length;
  }

  // --- Computed edge paths ---
  edgePaths = computed<EdgePath[]>(() => {
    const nodes = this.nodes();
    const edges = this.edges();
    const selId = this.selectedNodeId();
    const nodeMap = new Map<string, WorkflowNodeData>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    // Assign each outgoing edge a port slot in creation order.
    const slotBySource = new Map<string, string[]>();
    edges.forEach(e => {
      const arr = slotBySource.get(e.from) || [];
      arr.push(e.id);
      slotBySource.set(e.from, arr);
    });

    return edges.map(edge => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) return null;

      const portCount = this.getNodeDef(from.type)?.maxOutputs || 1;
      const slot = Math.min((slotBySource.get(edge.from) || []).indexOf(edge.id), portCount - 1);

      const fromX = from.x + this.portX(portCount, slot < 0 ? 0 : slot);
      const fromY = from.y + 140; // bottom of node
      const toX = to.x + 96;
      const toY = to.y - 8; // input port sits 8px above node top

      const midY = (fromY + toY) / 2;
      const d = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;

      // Auto-label: explicit edge label wins; otherwise a Send-Buttons edge is
      // labelled with the button it represents so the wiring is self-evident.
      let label = edge.label;
      if (!label && from.type === 'send_buttons') {
        label = this.buttonTitles(from.config?.['buttons'])[slot];
      }

      return {
        id: edge.id,
        d,
        label,
        labelX: (fromX + toX) / 2,
        labelY: (fromY + toY) / 2,
        fromId: edge.from,
        toId: edge.to,
        highlighted: !!selId && (edge.from === selId || edge.to === selId),
      } as EdgePath;
    }).filter(Boolean) as EdgePath[];
  });

  tempEdgePath = computed(() => {
    if (!this.connectingFrom()) return null;
    const from = this.nodes().find(n => n.id === this.connectingFrom());
    if (!from) return null;
    const fromX = from.x + 96;
    const fromY = from.y + 140;
    const toX = this.tempMouseX();
    const toY = this.tempMouseY();
    const midY = (fromY + toY) / 2;
    return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
  });

  // --- Drag from palette ---
  onDragOver(event: DragEvent) {
    if (event.dataTransfer?.types.includes('application/workflow-node')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const data = event.dataTransfer?.getData('application/workflow-node');
    if (!data) return;

    const rect = this.canvasContainer()?.nativeElement.getBoundingClientRect();
    if (!rect) return;

    const x = (event.clientX - rect.left - this.panX()) / this.zoom();
    const y = (event.clientY - rect.top - this.panY()) / this.zoom();

    const nodeDef = JSON.parse(data);
    this.nodeDrop.emit({ type: nodeDef.type, x, y });
  }

  // --- Node dragging ---
  onNodePointerDown(event: PointerEvent, node: WorkflowNodeData) {
    if (event.button !== 0) return;
    event.stopPropagation();
    this.draggingNodeId.set(node.id);
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.nodeStartX = node.x;
    this.nodeStartY = node.y;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onNodeClick(event: Event, node: WorkflowNodeData) {
    event.stopPropagation();
    // If connecting, clicking on node body also accepts connection on input
    if (this.connectingFrom() && this.connectingFrom() !== node.id) {
      const def = this.getNodeDef(node.type);
      if (def?.category !== 'trigger') {
        this.edgeCreated.emit({ fromId: this.connectingFrom()!, toId: node.id });
        this.connectingFrom.set(null);
        return;
      }
    }
    this.nodeSelected.emit(node);
    this.selectedEdgeId.set(null);
  }

  // --- Canvas panning ---
  onCanvasPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    // Only pan if clicking on empty canvas (not on a node)
    if ((event.target as HTMLElement).closest('[data-workflow-node]')) return;
    this.isPanning = true;
    this.panStartX = event.clientX;
    this.panStartY = event.clientY;
    this.panOriginX = this.panX();
    this.panOriginY = this.panY();
    this.selectedEdgeId.set(null);
  }

  onPointerMove(event: PointerEvent) {
    // Node dragging
    if (this.draggingNodeId()) {
      const dx = (event.clientX - this.dragStartX) / this.zoom();
      const dy = (event.clientY - this.dragStartY) / this.zoom();
      const updated = this.nodes().map(n => {
        if (n.id === this.draggingNodeId()) {
          return { ...n, x: this.nodeStartX + dx, y: this.nodeStartY + dy };
        }
        return n;
      });
      this.nodesMoved.emit(updated);
      return;
    }

    // Canvas panning
    if (this.isPanning) {
      const dx = event.clientX - this.panStartX;
      const dy = event.clientY - this.panStartY;
      this.panX.set(this.panOriginX + dx);
      this.panY.set(this.panOriginY + dy);
      return;
    }

    // Temp edge tracking
    if (this.connectingFrom()) {
      const rect = this.canvasContainer()?.nativeElement.getBoundingClientRect();
      if (rect) {
        this.tempMouseX.set((event.clientX - rect.left - this.panX()) / this.zoom());
        this.tempMouseY.set((event.clientY - rect.top - this.panY()) / this.zoom());
      }
    }
  }

  onPointerUp(event: PointerEvent) {
    this.draggingNodeId.set(null);
    this.isPanning = false;
  }

  // --- Zoom ---
  onWheel(event: WheelEvent) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.05 : 0.05;
    const newZoom = Math.min(2, Math.max(0.3, this.zoom() + delta));
    this.zoom.set(newZoom);
  }

  zoomIn() { this.zoom.set(Math.min(2, this.zoom() + 0.1)); }
  zoomOut() { this.zoom.set(Math.max(0.3, this.zoom() - 0.1)); }
  resetView() { this.zoom.set(1); this.panX.set(0); this.panY.set(0); }

  // --- Edge creation ---
  onOutputPortClick(event: Event, node: WorkflowNodeData, portIndex: number) {
    event.stopPropagation();
    if (this.connectingFrom()) {
      // Cancel if clicking same node's output again
      this.connectingFrom.set(null);
      return;
    }
    this.connectingFrom.set(node.id);
  }

  onInputPortClick(event: Event, node: WorkflowNodeData) {
    event.stopPropagation();
    if (this.connectingFrom() && this.connectingFrom() !== node.id) {
      this.edgeCreated.emit({ fromId: this.connectingFrom()!, toId: node.id });
      this.connectingFrom.set(null);
    }
  }

  onEdgeClick(edge: EdgePath) {
    this.selectedEdgeId.set(this.selectedEdgeId() === edge.id ? null : edge.id);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    this.connectingFrom.set(null);
    this.selectedEdgeId.set(null);
  }

  @HostListener('document:keydown.delete')
  @HostListener('document:keydown.backspace')
  onDeleteKey() {
    if (this.selectedEdgeId()) {
      this.edgeDeleted.emit(this.selectedEdgeId()!);
      this.selectedEdgeId.set(null);
    }
  }
}
