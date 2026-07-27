import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { WorkflowService } from './services/workflow.service';

/** A single toggleable notification/feature inside a pack (maps to one node). */
interface PackFeature {
  key: string;
  label: string;
  event?: string;        // trigger event this notification reacts to (order status, etc.)
  defaultText: string;
  default: boolean;
}
/** A pre-built automation the user enables with a checkbox. */
interface Pack {
  key: string;
  name: string;
  description: string;
  icon: string;
  triggerType: string;   // e.g. trigger_order
  triggerLabel: string;
  triggerConfig: Record<string, any>;
  features: PackFeature[];
}

/** Live editor state for a pack (what the user toggled + edited). */
interface PackState {
  enabled: boolean;
  workflowId?: string;
  features: Record<string, boolean>;
  texts: Record<string, string>;   // featureKey -> edited message
}

/** A generated, laid-out node for the locked canvas. */
interface CanvasNode {
  id: string; featureKey?: string; kind: 'trigger' | 'message';
  title: string; text: string; x: number; y: number;
}

const CARD_W = 240, CARD_H = 96, GAP_Y = 130, COL_X = 260;

/**
 * Simple, checkbox-driven "Automations" builder. The user ticks a pack (Order,
 * Appointment, …) to enable it, then ticks which notifications/features to include.
 * The blocks are generated onto a read-only canvas (same drag-flow look) where the
 * ONLY thing editable is each block's text — no palette, no connectivity editing.
 * Each enabled pack is saved as a real workflow (trigger + message nodes).
 */
@Component({
  selector: 'wa-workflow-packs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex h-[calc(100vh-3.5rem)] bg-gray-50">
      <!-- Pack picker (checkboxes) -->
      <aside class="w-80 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
        <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <h2 class="text-base font-bold text-gray-900">Automations</h2>
          <a routerLink="/workflow-builder/advanced" class="ml-auto text-[11px] text-gray-400 hover:text-indigo-600">Advanced editor</a>
        </div>
        <p class="px-4 py-2 text-[12px] text-gray-500">Tick an automation to switch it on, then choose which messages to send.</p>

        @for (pack of packs; track pack.key) {
          <div class="border-b border-gray-100">
            <label class="flex items-start gap-2.5 px-4 py-3 cursor-pointer hover:bg-gray-50"
                   [class.bg-indigo-50/40]="selectedKey() === pack.key" (click)="select(pack.key)">
              <input type="checkbox" class="mt-0.5 w-4 h-4 accent-indigo-600"
                     [checked]="state(pack.key).enabled" (click)="$event.stopPropagation()"
                     (change)="togglePack(pack, $event)" />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5 font-semibold text-[13.5px] text-gray-900">
                  <i class="pi {{ pack.icon }} text-indigo-500 text-xs"></i>{{ pack.name }}
                </span>
                <span class="block text-[11.5px] text-gray-400 leading-snug">{{ pack.description }}</span>
              </span>
            </label>

            @if (state(pack.key).enabled) {
              <div class="px-4 pb-3 pl-10 space-y-1.5">
                <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Messages to send</p>
                @for (f of pack.features; track f.key) {
                  <label class="flex items-center gap-2 text-[12.5px] text-gray-700 cursor-pointer">
                    <input type="checkbox" class="w-3.5 h-3.5 accent-indigo-600"
                           [(ngModel)]="state(pack.key).features[f.key]" (ngModelChange)="regenerate(pack)" />
                    {{ f.label }}
                  </label>
                }
              </div>
            }
          </div>
        }
      </aside>

      <!-- Canvas + inline text edit -->
      <main class="flex-1 relative overflow-hidden">
        @if (!selected()) {
          <div class="h-full flex items-center justify-center text-center text-gray-400 px-6">
            <div>
              <i class="pi pi-sitemap text-4xl mb-3 block"></i>
              <p class="text-sm font-medium">Pick an automation on the left to see its flow.</p>
            </div>
          </div>
        } @else {
          <!-- Toolbar -->
          <div class="absolute top-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-4 py-2 flex items-center gap-3">
            <span class="font-semibold text-sm text-gray-900">{{ selected()!.name }}</span>
            @if (!state(selectedKey()).enabled) {
              <span class="text-[11px] text-amber-600">Not switched on — tick it to activate</span>
            } @else {
              <span class="text-[11px] text-emerald-600"><i class="pi pi-check-circle"></i> On</span>
            }
            <div class="ml-auto flex items-center gap-1.5">
              <button class="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500" (click)="zoomBy(-0.1)">−</button>
              <span class="text-[11px] text-gray-400 w-10 text-center">{{ (zoom()*100)|number:'1.0-0' }}%</span>
              <button class="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500" (click)="zoomBy(0.1)">+</button>
              <button pButton label="Save" icon="pi pi-check" class="p-button-sm ml-2" [loading]="saving()"
                      [disabled]="!state(selectedKey()).enabled" (click)="save(selected()!)"></button>
            </div>
          </div>

          <!-- Pannable graph -->
          <div class="absolute inset-0 pt-11 overflow-hidden cursor-grab active:cursor-grabbing"
               (mousedown)="startPan($event)" (mousemove)="onPan($event)" (mouseup)="endPan()" (mouseleave)="endPan()">
            <div class="absolute origin-top-left" [style.transform]="'translate(' + panX() + 'px,' + panY() + 'px) scale(' + zoom() + ')'">
              <svg class="absolute overflow-visible pointer-events-none" width="1200" height="2000">
                @for (e of edges(); track e.id) {
                  <path [attr.d]="e.d" fill="none" stroke="#c7d2fe" stroke-width="2" />
                }
              </svg>
              @for (n of nodes(); track n.id) {
                <div class="absolute rounded-xl border shadow-sm bg-white select-none"
                     [class.border-indigo-400]="n.kind === 'trigger'" [class.border-gray-200]="n.kind !== 'trigger'"
                     [style.left.px]="n.x" [style.top.px]="n.y" [style.width.px]="cardW"
                     (mousedown)="$event.stopPropagation()">
                  <div class="px-3 py-1.5 text-[11px] font-bold rounded-t-xl flex items-center gap-1.5"
                       [class.bg-indigo-50]="n.kind === 'trigger'" [class.text-indigo-700]="n.kind === 'trigger'"
                       [class.bg-gray-50]="n.kind !== 'trigger'" [class.text-gray-500]="n.kind !== 'trigger'">
                    <i class="pi text-[10px]" [ngClass]="n.kind === 'trigger' ? 'pi-bolt' : 'pi-comment'"></i>{{ n.title }}
                  </div>
                  <div class="p-2.5">
                    @if (n.kind === 'trigger') {
                      <p class="text-[12px] text-gray-500">{{ n.text }}</p>
                    } @else if (editingId() === n.id) {
                      <textarea [(ngModel)]="editText" rows="3"
                                class="w-full text-[12px] border border-indigo-300 rounded p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                (mousedown)="$event.stopPropagation()"></textarea>
                      <div class="flex gap-1.5 mt-1.5">
                        <button class="text-[11px] px-2 py-0.5 rounded bg-indigo-600 text-white" (click)="saveText(n)">Done</button>
                        <button class="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-500" (click)="editingId.set(null)">Cancel</button>
                      </div>
                    } @else {
                      <p class="text-[12px] text-gray-700 whitespace-pre-wrap line-clamp-4 cursor-text" (click)="edit(n)">{{ n.text }}</p>
                      <button class="text-[10px] text-indigo-500 mt-1 hover:underline" (click)="edit(n)"><i class="pi pi-pencil text-[9px]"></i> Edit text</button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </main>
    </div>
  `,
})
export class WorkflowPacksComponent implements OnInit {
  private readonly wf = inject(WorkflowService);
  private readonly toast = inject(MessageService);

  readonly cardW = CARD_W;
  readonly packs: Pack[] = PACKS;
  private readonly states: Record<string, PackState> = {};
  readonly selectedKey = signal<string>('');
  readonly saving = signal(false);

  // canvas view state
  readonly zoom = signal(0.9);
  readonly panX = signal(40);
  readonly panY = signal(24);
  private panning = false; private px = 0; private py = 0;

  // inline text edit
  readonly editingId = signal<string | null>(null);
  editText = '';

  // generated graph (recomputed on toggle)
  readonly nodes = signal<CanvasNode[]>([]);
  readonly edges = signal<{ id: string; d: string }[]>([]);

  selected = computed(() => this.packs.find((p) => p.key === this.selectedKey()) || null);

  ngOnInit() {
    // seed default state
    for (const p of this.packs) {
      this.states[p.key] = {
        enabled: false,
        features: Object.fromEntries(p.features.map((f) => [f.key, f.default])),
        texts: {},
      };
    }
    // hydrate from saved workflows (tagged with pack=<key> in description)
    this.wf.getAll({ limit: 200 }).subscribe({
      next: (res: any) => {
        const list = res?.data?.data || res?.data || res || [];
        for (const w of list) {
          const m = /pack=([a-zA-Z0-9_-]+)/.exec(w.description || '');
          if (!m || !this.states[m[1]]) continue;
          const st = this.states[m[1]];
          st.enabled = w.status === 'active' || w.status === 'draft' || true;
          st.workflowId = w.id;
          // restore feature toggles + edited text from the saved definition nodes
          const nodes = w.nodes || w.definition?.nodes || [];
          if (nodes.length) {
            const pack = this.packs.find((p) => p.key === m[1])!;
            for (const f of pack.features) st.features[f.key] = false;
            for (const n of nodes) {
              const fk = String(n.id || '').split(':')[1];
              if (fk && st.features[fk] !== undefined) {
                st.features[fk] = true;
                if (n.config?.message) st.texts[fk] = n.config.message;
              }
            }
          }
        }
        if (!this.selectedKey()) this.select(this.packs[0].key);
      },
      error: () => { if (!this.selectedKey()) this.select(this.packs[0].key); },
    });
  }

  state(key: string): PackState { return this.states[key]; }

  select(key: string) {
    this.selectedKey.set(key);
    this.editingId.set(null);
    const pack = this.packs.find((p) => p.key === key);
    if (pack) this.regenerate(pack);
  }

  togglePack(pack: Pack, ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    this.states[pack.key].enabled = on;
    this.selectedKey.set(pack.key);
    this.regenerate(pack);
    if (!on && this.states[pack.key].workflowId) {
      this.wf.pause(this.states[pack.key].workflowId!).subscribe({ next: () => {}, error: () => {} });
    }
  }

  /** Rebuild the canvas graph for a pack from its enabled features + edited text. */
  regenerate(pack: Pack) {
    const st = this.states[pack.key];
    const nodes: CanvasNode[] = [];
    const edges: { id: string; d: string }[] = [];
    const triggerId = `${pack.key}:trigger`;
    nodes.push({ id: triggerId, kind: 'trigger', title: pack.triggerLabel, text: pack.description, x: 40, y: 24 });
    let row = 0;
    for (const f of pack.features) {
      if (!st.features[f.key]) continue;
      const id = `${pack.key}:${f.key}`;
      const x = 40 + COL_X;
      const y = 24 + row * GAP_Y;
      nodes.push({ id, featureKey: f.key, kind: 'message', title: f.label, text: st.texts[f.key] ?? f.defaultText, x, y });
      edges.push({ id: `e-${id}`, d: this.edgePath(40, 24, x, y) });
      row++;
    }
    this.nodes.set(nodes);
    this.edges.set(edges);
  }

  private edgePath(fx: number, fy: number, tx: number, ty: number): string {
    const x1 = fx + CARD_W, y1 = fy + CARD_H / 2, x2 = tx, y2 = ty + 18;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }

  edit(n: CanvasNode) { this.editText = n.text; this.editingId.set(n.id); }
  saveText(n: CanvasNode) {
    const pack = this.selected(); if (!pack || !n.featureKey) { this.editingId.set(null); return; }
    this.states[pack.key].texts[n.featureKey] = this.editText;
    this.editingId.set(null);
    this.regenerate(pack);
  }

  zoomBy(d: number) { this.zoom.set(Math.min(1.6, Math.max(0.4, Math.round((this.zoom() + d) * 10) / 10))); }
  startPan(e: MouseEvent) { this.panning = true; this.px = e.clientX - this.panX(); this.py = e.clientY - this.panY(); }
  onPan(e: MouseEvent) { if (this.panning) { this.panX.set(e.clientX - this.px); this.panY.set(e.clientY - this.py); } }
  endPan() { this.panning = false; }

  /** Persist the pack as a real workflow (create if needed, then save its definition). */
  save(pack: Pack) {
    const st = this.states[pack.key];
    if (!st.enabled) return;
    this.saving.set(true);
    const build = () => this.buildDefinition(pack, st);
    const persist = (id: string) => {
      const def = build();
      this.wf.saveDefinition(id, { nodes: def.nodes, edges: def.edges, trigger: pack.triggerType, status: 'active' }).subscribe({
        next: () => { this.saving.set(false); st.workflowId = id; this.toast.add({ severity: 'success', summary: 'Saved', detail: pack.name + ' is live' }); },
        error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Save failed', detail: e?.error?.message || 'Error' }); },
      });
    };
    if (st.workflowId) { persist(st.workflowId); return; }
    this.wf.create({ name: pack.name, description: `pack=${pack.key}`, trigger: pack.triggerType }).subscribe({
      next: (w: any) => { const id = w?.data?.id || w?.id; st.workflowId = id; persist(id); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Could not create', detail: e?.error?.message || 'Error' }); },
    });
  }

  /** Turn the enabled features into engine nodes/edges (trigger → one message each). */
  private buildDefinition(pack: Pack, st: PackState) {
    const nodes: any[] = [];
    const edges: any[] = [];
    const triggerId = `${pack.key}:trigger`;
    const featureIds = pack.features.filter((f) => st.features[f.key]).map((f) => `${pack.key}:${f.key}`);
    nodes.push({
      id: triggerId, type: pack.triggerType, label: pack.triggerLabel, description: pack.description,
      x: 40, y: 24, config: { ...pack.triggerConfig }, outputs: featureIds,
    });
    let row = 0;
    for (const f of pack.features) {
      if (!st.features[f.key]) continue;
      const id = `${pack.key}:${f.key}`;
      nodes.push({
        id, type: 'send_text', label: f.label, description: '',
        x: 40 + COL_X, y: 24 + row * GAP_Y,
        config: { message: st.texts[f.key] ?? f.defaultText, ...(f.event ? { event: f.event } : {}) },
        outputs: [],
      });
      edges.push({ id: `e-${id}`, from: triggerId, to: id });
      row++;
    }
    return { nodes, edges };
  }
}

// ─── Pre-built automation packs (author here; each feature = one message node) ───
const PACKS: Pack[] = [
  {
    key: 'orderUpdates', name: 'Order updates', icon: 'pi-shopping-cart',
    description: 'Keep customers posted as their order moves along.',
    triggerType: 'trigger_order', triggerLabel: 'When an order changes', triggerConfig: { event: 'created' },
    features: [
      { key: 'confirmed', label: 'Order confirmation', event: 'confirmed', default: true, defaultText: 'Hi {{customer_name}}, thanks for your order {{order_number}}! We\'ve received it and will get it ready. 🧾' },
      { key: 'packed', label: 'Order packed / processing', event: 'processing', default: true, defaultText: 'Good news {{customer_name}} — your order {{order_number}} is packed and being processed. 📦' },
      { key: 'out_for_delivery', label: 'Out for delivery', event: 'out_for_delivery', default: true, defaultText: 'Your order {{order_number}} is out for delivery and will reach you soon! 🚚' },
      { key: 'delivered', label: 'Delivered', event: 'delivered', default: true, defaultText: 'Your order {{order_number}} has been delivered. Thank you for shopping with us! 🎉' },
      { key: 'review', label: 'Ask for a review', event: 'delivered', default: false, defaultText: 'Hi {{customer_name}}, how was your experience? Reply with a ⭐1–5 rating — it really helps us!' },
    ],
  },
  {
    key: 'appointment', name: 'Appointment', icon: 'pi-calendar',
    description: 'Confirm and remind customers about their bookings.',
    triggerType: 'trigger_message', triggerLabel: 'When someone books', triggerConfig: { keywords: ['book', 'appointment'], matchType: 'contains' },
    features: [
      { key: 'confirm', label: 'Booking confirmation', default: true, defaultText: 'Your appointment is confirmed, {{customer_name}}! We look forward to seeing you. 📅' },
      { key: 'reminder', label: 'Reminder before appointment', default: true, defaultText: 'Reminder: you have an appointment with us coming up. Reply RESCHEDULE if the time no longer works.' },
      { key: 'followup', label: 'Follow-up after visit', default: false, defaultText: 'Thanks for visiting, {{customer_name}}! We hope it went well — reply here if you need anything else.' },
    ],
  },
  {
    key: 'welcome', name: 'Welcome & greeting', icon: 'pi-hand',
    description: 'Greet new customers who message you for the first time.',
    triggerType: 'trigger_message', triggerLabel: 'When someone says hi', triggerConfig: { keywords: ['hi', 'hello', 'hey'], matchType: 'contains' },
    features: [
      { key: 'greeting', label: 'Welcome message', default: true, defaultText: 'Hi there! 👋 Welcome to our store. How can we help you today?' },
      { key: 'catalog', label: 'Share catalogue link', default: true, defaultText: 'Here\'s our catalogue — browse and reply with what you\'d like to order. 🛍️' },
      { key: 'hours', label: 'Share business hours', default: false, defaultText: 'We\'re open Mon–Sat, 10am–8pm. We\'ll reply as soon as we can!' },
    ],
  },
  {
    key: 'payment', name: 'Payment reminders', icon: 'pi-wallet',
    description: 'Nudge customers about pending and received payments.',
    triggerType: 'trigger_payment', triggerLabel: 'On a payment event', triggerConfig: { event: 'received' },
    features: [
      { key: 'received', label: 'Payment received', event: 'received', default: true, defaultText: 'We\'ve received your payment for {{order_number}} — thank you! ✅' },
      { key: 'pending', label: 'Payment pending reminder', event: 'expired', default: true, defaultText: 'Gentle reminder: payment for {{order_number}} is still pending. Reply here if you need help completing it.' },
    ],
  },
];
