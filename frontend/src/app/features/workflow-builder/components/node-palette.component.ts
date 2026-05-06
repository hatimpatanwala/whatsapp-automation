import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import {
  NODE_TYPE_DEFINITIONS,
  NODE_CATEGORIES,
  NodeCategory,
  NodeTypeDefinition,
} from '../models/workflow.models';

@Component({
  selector: 'wa-node-palette',
  standalone: true,
  imports: [CommonModule, FormsModule, InputTextModule, TooltipModule],
  template: `
    <div class="flex flex-col h-full bg-white border-r border-gray-200">
      <!-- Header -->
      <div class="p-3 border-b border-gray-100">
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Node Palette</h3>
        <div class="relative">
          <i class="pi pi-search absolute left-2.5 top-1/2 text-gray-400" style="font-size:0.75rem;transform:translateY(-50%)"></i>
          <input
            pInputText
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
            placeholder="Search nodes..."
            class="w-full text-xs pl-7"
            style="padding-top:0.4rem;padding-bottom:0.4rem"
          />
        </div>
      </div>

      <!-- Categories -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        @for (cat of categories; track cat.key) {
          @if (filteredNodesByCategory(cat.key).length) {
            <div>
              <!-- Category header -->
              <button
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                (click)="toggleCategory(cat.key)"
              >
                <i [class]="'pi ' + cat.icon" style="font-size:0.7rem"></i>
                <span>{{ cat.label }}</span>
                <span class="ml-auto text-gray-400 text-xs">{{ filteredNodesByCategory(cat.key).length }}</span>
                <i class="pi text-gray-400" [class.pi-chevron-down]="expandedCategories().has(cat.key)" [class.pi-chevron-right]="!expandedCategories().has(cat.key)" style="font-size:0.6rem"></i>
              </button>

              <!-- Node items -->
              @if (expandedCategories().has(cat.key)) {
                <div class="space-y-1 mt-1 ml-1">
                  @for (nodeDef of filteredNodesByCategory(cat.key); track nodeDef.type) {
                    <div
                      class="flex items-center gap-2 px-2 py-2 rounded-lg cursor-grab border border-transparent hover:border-gray-200 hover:bg-gray-50 transition-all select-none active:cursor-grabbing"
                      draggable="true"
                      (dragstart)="onDragStart($event, nodeDef)"
                      [pTooltip]="nodeDef.description"
                      tooltipPosition="right"
                    >
                      <div
                        class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        [style.background-color]="nodeDef.color + '18'"
                      >
                        <i [class]="'pi ' + nodeDef.icon" [style.color]="nodeDef.color" style="font-size:0.75rem"></i>
                      </div>
                      <div class="min-w-0">
                        <p class="text-xs font-medium text-gray-800 truncate">{{ nodeDef.label }}</p>
                        <p class="text-xs text-gray-400 truncate" style="font-size:0.65rem">{{ nodeDef.description }}</p>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        }
      </div>

      <!-- Hint -->
      <div class="p-3 border-t border-gray-100 text-center">
        <p class="text-xs text-gray-400">
          <i class="pi pi-info-circle mr-1"></i>
          Drag nodes onto the canvas
        </p>
      </div>
    </div>
  `,
})
export class NodePaletteComponent {
  categories = NODE_CATEGORIES;
  searchQuery = signal('');
  expandedCategories = signal<Set<NodeCategory>>(new Set(['trigger', 'message', 'commerce', 'logic', 'action', 'utility']));

  filteredNodesByCategory(category: NodeCategory): NodeTypeDefinition[] {
    const query = this.searchQuery().toLowerCase().trim();
    const nodes = NODE_TYPE_DEFINITIONS.filter(n => n.category === category);
    if (!query) return nodes;
    return nodes.filter(
      n => n.label.toLowerCase().includes(query) || n.description.toLowerCase().includes(query)
    );
  }

  toggleCategory(cat: NodeCategory) {
    this.expandedCategories.update(set => {
      const next = new Set(set);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  onDragStart(event: DragEvent, nodeDef: NodeTypeDefinition) {
    event.dataTransfer!.setData('application/workflow-node', JSON.stringify(nodeDef));
    event.dataTransfer!.effectAllowed = 'copy';
  }
}
