import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { WorkflowService } from './services/workflow.service';
import { PACKS, PACK_CATEGORIES, SCALES, CUSTOM_TRIGGERS, Pack, WFNode, WFEdge, WFGraph } from './workflow-packs.catalog';

interface PackState { enabled: boolean; workflowId?: string; features: Record<string, boolean>; texts: Record<string, string>; }
interface CustomItem { id: string; label: string; triggerType: string; text: string; workflowId?: string; }
interface Laid { node: WFNode; }

const CARD_W = 210, NODE_H = 78;
const MSG_TYPES = ['send_text', 'send_buttons', 'send_list', 'send_image'];
const NODE_ICON: Record<string, string> = {
  trigger_message: 'pi-comment', trigger_order: 'pi-shopping-cart', trigger_payment: 'pi-wallet',
  trigger_quote: 'pi-file-edit', trigger_invoice: 'pi-receipt', trigger_schedule: 'pi-clock',
  send_text: 'pi-comment', send_buttons: 'pi-th-large', send_list: 'pi-list', send_image: 'pi-image',
  show_catalog: 'pi-shopping-bag', add_to_cart: 'pi-plus-circle', view_cart: 'pi-shopping-cart',
  checkout: 'pi-credit-card', payment_qr: 'pi-qrcode', search_products: 'pi-search', track_order: 'pi-map-marker',
  condition: 'pi-share-alt', switch: 'pi-sitemap', wait_for_reply: 'pi-clock', fallback: 'pi-replay',
  tag_customer: 'pi-tag', update_order: 'pi-sync', assign_agent: 'pi-user', delay: 'pi-hourglass', end: 'pi-stop-circle',
};

/**
 * Checkbox-driven Automations builder. Ticking a pack (and its sub-options) AUTO-
 * GENERATES the complete workflow logic — every node type (catalog, cart, checkout,
 * conditions, switches, waits, agent hand-off, delays…) with correct connectivity —
 * onto a locked canvas where only the message TEXT is editable. Also lets the user
 * compose fully custom notifications (own trigger + message). Each saves as a real
 * runnable workflow. The manual node editor stays at /workflow-builder/advanced.
 */
@Component({
  selector: 'wa-workflow-packs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex h-[calc(100vh-3.5rem)] bg-gray-50">
      <!-- Pack picker -->
      <aside class="w-80 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
        <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <h2 class="text-base font-bold text-gray-900">Automations</h2>
          <a routerLink="/workflow-builder/advanced" class="ml-auto text-[11px] text-gray-400 hover:text-indigo-600">Advanced editor</a>
        </div>
        <p class="px-4 pt-2 text-[12px] text-gray-500">Tick an automation — we build the whole flow for you. Choose the steps you want; edit any message text.</p>

        <!-- Scale filter -->
        <div class="px-4 py-2 flex items-center gap-1.5">
          <span class="text-[10px] font-semibold text-gray-400 uppercase mr-1">Business</span>
          <button (click)="scale.set('all')" class="text-[11px] px-2 py-0.5 rounded-full border"
                  [class.bg-indigo-600]="scale()==='all'" [class.text-white]="scale()==='all'" [class.border-indigo-600]="scale()==='all'"
                  [class.border-gray-200]="scale()!=='all'" [class.text-gray-500]="scale()!=='all'">All</button>
          @for (s of scales; track s.key) {
            <button (click)="scale.set(s.key)" class="text-[11px] px-2 py-0.5 rounded-full border"
                    [class.bg-indigo-600]="scale()===s.key" [class.text-white]="scale()===s.key" [class.border-indigo-600]="scale()===s.key"
                    [class.border-gray-200]="scale()!==s.key" [class.text-gray-500]="scale()!==s.key">{{ s.label }}</button>
          }
        </div>

        @for (cat of visibleCategories(); track cat.key) {
          <div class="border-t border-gray-100">
            <p class="px-4 pt-2.5 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">{{ cat.label }}</p>
            @if (cat.key === 'custom') {
              <label class="flex items-start gap-2.5 px-4 py-2 cursor-pointer hover:bg-gray-50"
                     [class.bg-indigo-50/50]="selectedKey()==='__custom__'" (click)="select('__custom__')">
                <i class="pi pi-bolt text-indigo-500 text-xs mt-0.5"></i>
                <span class="min-w-0 flex-1">
                  <span class="font-semibold text-[13.5px] text-gray-900 block">Custom notification</span>
                  <span class="block text-[11.5px] text-gray-400 leading-snug">Build your own: pick a trigger, write the message.</span>
                </span>
              </label>
            }
            @for (pack of packsIn(cat.key); track pack.key) {
              <div>
                <label class="flex items-start gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-gray-50"
                       [class.bg-indigo-50/50]="selectedKey()===pack.key" (click)="select(pack.key)">
                  <input type="checkbox" class="mt-0.5 w-4 h-4 accent-indigo-600"
                         [checked]="st(pack.key).enabled" (click)="$event.stopPropagation()" (change)="togglePack(pack, $event)" />
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-1.5 font-semibold text-[13.5px] text-gray-900">
                      <i class="pi {{ pack.icon }} text-indigo-500 text-xs"></i>{{ pack.name }}
                    </span>
                    <span class="block text-[11.5px] text-gray-400 leading-snug">{{ pack.description }}</span>
                  </span>
                </label>
                @if (st(pack.key).enabled && pack.features.length) {
                  <div class="px-4 pb-2.5 pl-10 space-y-1.5">
                    <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Include</p>
                    @for (f of pack.features; track f.key) {
                      <label class="flex items-center gap-2 text-[12.5px] text-gray-700 cursor-pointer">
                        <input type="checkbox" class="w-3.5 h-3.5 accent-indigo-600"
                               [(ngModel)]="st(pack.key).features[f.key]" (ngModelChange)="regen(pack)" /> {{ f.label }}
                      </label>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      </aside>

      <!-- Canvas / custom builder -->
      <main class="flex-1 relative overflow-hidden">
        @if (selectedKey() === '__custom__') {
          <!-- Custom notification builder -->
          <div class="absolute inset-0 overflow-y-auto p-6">
            <div class="max-w-2xl mx-auto">
              <div class="flex items-center gap-3 mb-4">
                <h3 class="text-lg font-bold text-gray-900">Custom notifications</h3>
                <button pButton label="Add notification" icon="pi pi-plus" class="p-button-sm p-button-outlined" (click)="addCustom()"></button>
                <button pButton label="Save all" icon="pi pi-check" class="p-button-sm ml-auto" [loading]="saving()" [disabled]="!custom().length" (click)="saveCustom()"></button>
              </div>
              @if (!custom().length) {
                <p class="text-sm text-gray-400">No custom notifications yet — click “Add notification” to create one.</p>
              }
              @for (c of custom(); track c.id; let i = $index) {
                <div class="bg-white rounded-xl border border-gray-200 p-4 mb-3 shadow-sm">
                  <div class="flex items-center gap-2 mb-2">
                    <input [(ngModel)]="c.label" class="font-semibold text-sm border-b border-transparent hover:border-gray-200 focus:border-indigo-400 outline-none flex-1" placeholder="Notification name" />
                    <button class="text-red-400 hover:text-red-600 text-sm" (click)="removeCustom(i)"><i class="pi pi-trash"></i></button>
                  </div>
                  <label class="text-[11px] font-semibold text-gray-400 uppercase">Trigger</label>
                  <select [(ngModel)]="c.triggerType" class="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mb-2 bg-white">
                    @for (tg of customTriggers; track tg.value) { <option [value]="tg.value">{{ tg.label }}</option> }
                  </select>
                  <label class="text-[11px] font-semibold text-gray-400 uppercase">Message</label>
                  <textarea [(ngModel)]="c.text" rows="3" class="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="Write the WhatsApp message… use {{ '{{customer_name}}' }} etc."></textarea>
                </div>
              }
            </div>
          </div>
        } @else if (!selected()) {
          <div class="h-full flex items-center justify-center text-center text-gray-400 px-6">
            <div><i class="pi pi-sitemap text-4xl mb-3 block"></i><p class="text-sm font-medium">Pick an automation on the left to see its flow.</p></div>
          </div>
        } @else {
          <!-- Toolbar -->
          <div class="absolute top-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-4 py-2 flex items-center gap-3">
            <span class="font-semibold text-sm text-gray-900">{{ selected()!.name }}</span>
            @if (st(selectedKey()).enabled) { <span class="text-[11px] text-emerald-600"><i class="pi pi-check-circle"></i> On</span> }
            @else { <span class="text-[11px] text-amber-600">Tick it to switch on</span> }
            <span class="text-[11px] text-gray-400">· {{ nodes().length }} steps auto-created</span>
            <div class="ml-auto flex items-center gap-1.5">
              <button class="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500" (click)="zoomBy(-0.1)">−</button>
              <span class="text-[11px] text-gray-400 w-10 text-center">{{ (zoom()*100)|number:'1.0-0' }}%</span>
              <button class="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500" (click)="zoomBy(0.1)">+</button>
              <button pButton label="Save" icon="pi pi-check" class="p-button-sm ml-2" [loading]="saving()" [disabled]="!st(selectedKey()).enabled" (click)="save(selected()!)"></button>
            </div>
          </div>

          <div class="absolute inset-0 pt-11 overflow-hidden cursor-grab active:cursor-grabbing"
               (mousedown)="startPan($event)" (mousemove)="onPan($event)" (mouseup)="endPan()" (mouseleave)="endPan()">
            <div class="absolute origin-top-left" [style.transform]="'translate('+panX()+'px,'+panY()+'px) scale('+zoom()+')'">
              <svg class="absolute overflow-visible pointer-events-none" width="1400" height="2400">
                @for (e of edgePaths(); track e.id) {
                  <path [attr.d]="e.d" fill="none" stroke="#c7d2fe" stroke-width="2" />
                  @if (e.label) { <text [attr.x]="e.lx" [attr.y]="e.ly" fill="#6366f1" font-size="10" font-weight="600" text-anchor="middle">{{ e.label }}</text> }
                }
              </svg>
              @for (n of nodes(); track n.id) {
                <div class="absolute rounded-xl border shadow-sm bg-white select-none"
                     [class.border-indigo-400]="isTrigger(n)" [class.border-gray-200]="!isTrigger(n)"
                     [style.left.px]="n.x" [style.top.px]="n.y" [style.width.px]="cardW" (mousedown)="$event.stopPropagation()">
                  <div class="px-3 py-1.5 text-[11px] font-bold rounded-t-xl flex items-center gap-1.5"
                       [class.bg-indigo-50]="isTrigger(n)" [class.text-indigo-700]="isTrigger(n)"
                       [class.bg-gray-50]="!isTrigger(n)" [class.text-gray-600]="!isTrigger(n)">
                    <i class="pi {{ icon(n) }} text-[10px]"></i>{{ n.label }}
                  </div>
                  <div class="p-2.5">
                    @if (isMessage(n)) {
                      @if (editingId() === n.id) {
                        <textarea [(ngModel)]="editText" rows="3" class="w-full text-[12px] border border-indigo-300 rounded p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200" (mousedown)="$event.stopPropagation()"></textarea>
                        <div class="flex gap-1.5 mt-1.5">
                          <button class="text-[11px] px-2 py-0.5 rounded bg-indigo-600 text-white" (click)="saveText(n)">Done</button>
                          <button class="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-500" (click)="editingId.set(null)">Cancel</button>
                        </div>
                      } @else {
                        <p class="text-[12px] text-gray-700 whitespace-pre-wrap line-clamp-4 cursor-text" (click)="edit(n)">{{ msgOf(n) }}</p>
                        <button class="text-[10px] text-indigo-500 mt-1 hover:underline" (click)="edit(n)"><i class="pi pi-pencil text-[9px]"></i> Edit text</button>
                      }
                    } @else {
                      <p class="text-[12px] text-gray-500">{{ summary(n) }}</p>
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
  readonly packs = PACKS;
  readonly categories = PACK_CATEGORIES;
  readonly scales = SCALES;
  readonly customTriggers = CUSTOM_TRIGGERS;
  private readonly states: Record<string, PackState> = {};

  readonly scale = signal<'all' | 'small' | 'medium' | 'large'>('all');
  readonly selectedKey = signal<string>('');
  readonly saving = signal(false);
  readonly custom = signal<CustomItem[]>([]);

  readonly zoom = signal(0.85); readonly panX = signal(24); readonly panY = signal(20);
  private panning = false; private px = 0; private py = 0;
  readonly editingId = signal<string | null>(null); editText = '';

  readonly nodes = signal<WFNode[]>([]);
  readonly edges = signal<WFEdge[]>([]);

  selected = computed(() => this.packs.find((p) => p.key === this.selectedKey()) || null);
  visibleCategories = computed(() => this.categories.filter((c) => c.key === 'custom' || this.packsIn(c.key).length));

  ngOnInit() {
    for (const p of this.packs) {
      this.states[p.key] = { enabled: false, features: Object.fromEntries(p.features.map((f) => [f.key, f.default])), texts: {} };
    }
    this.wf.getAll({ limit: 200 }).subscribe({
      next: (res: any) => {
        const list = res?.data?.data || res?.data || res || [];
        for (const w of list) {
          const cm = /pack=custom\|id=([a-z0-9]+)/.exec(w.description || '');
          if (cm) { /* custom items hydrate lazily when opened */ continue; }
          const m = /pack=([a-zA-Z0-9]+)/.exec(w.description || '');
          if (!m || !this.states[m[1]]) continue;
          const st = this.states[m[1]]; st.enabled = true; st.workflowId = w.id;
          const nodes = w.nodes || w.definition?.nodes || [];
          if (nodes.length) {
            const pack = this.packs.find((p) => p.key === m[1])!;
            const roles = new Set(nodes.map((n: any) => String(n.id || '').split(':')[1]));
            for (const f of pack.features) st.features[f.key] = roles.has(f.key);
            for (const n of nodes) {
              const role = String(n.id || '').split(':')[1];
              const msg = n.config?.message ?? n.config?.body ?? n.config?.caption;
              if (role && msg != null) st.texts[role] = msg;
            }
          }
        }
        this.hydrateCustom(list);
        if (!this.selectedKey()) this.select(this.packsIn('orders')[0]?.key || this.packs[0].key);
      },
      error: () => { if (!this.selectedKey()) this.select(this.packs[0].key); },
    });
  }

  private hydrateCustom(list: any[]) {
    const items: CustomItem[] = [];
    for (const w of list) {
      const cm = /pack=custom\|id=([a-z0-9]+)/.exec(w.description || '');
      if (!cm) continue;
      const nodes = w.nodes || w.definition?.nodes || [];
      const trg = nodes.find((n: any) => String(n.type || '').startsWith('trigger_'));
      const msg = nodes.find((n: any) => n.config?.message != null);
      items.push({ id: cm[1], label: w.name || 'Notification', triggerType: trg?.type || 'trigger_order', text: msg?.config?.message || '', workflowId: w.id });
    }
    if (items.length) this.custom.set(items);
  }

  st(key: string) { return this.states[key]; }
  packsIn(cat: string): Pack[] {
    const sc = this.scale();
    return this.packs.filter((p) => p.category === cat && (sc === 'all' || p.scales.includes(sc as any)));
  }

  select(key: string) {
    this.selectedKey.set(key); this.editingId.set(null);
    if (key === '__custom__') { this.nodes.set([]); this.edges.set([]); return; }
    const pack = this.packs.find((p) => p.key === key); if (pack) this.regen(pack);
  }

  togglePack(pack: Pack, ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    this.states[pack.key].enabled = on; this.selectedKey.set(pack.key); this.regen(pack);
    if (!on && this.states[pack.key].workflowId) this.wf.pause(this.states[pack.key].workflowId!).subscribe({ next: () => {}, error: () => {} });
  }

  regen(pack: Pack) {
    const st = this.states[pack.key];
    const enabled = new Set(Object.keys(st.features).filter((k) => st.features[k]));
    const g: WFGraph = pack.generate(enabled, st.texts);
    this.nodes.set(g.nodes); this.edges.set(g.edges);
  }

  // ── node rendering helpers ──
  isTrigger(n: WFNode) { return n.type.startsWith('trigger_'); }
  isMessage(n: WFNode) { return MSG_TYPES.includes(n.type); }
  icon(n: WFNode) { return NODE_ICON[n.type] || 'pi-circle'; }
  msgOf(n: WFNode): string { return n.config['message'] ?? n.config['body'] ?? n.config['caption'] ?? ''; }
  summary(n: WFNode): string {
    const c = n.config;
    switch (n.type) {
      case 'show_catalog': return 'Show the product catalogue';
      case 'add_to_cart': return 'Add chosen items to the cart';
      case 'view_cart': return 'Show the cart & totals';
      case 'checkout': return 'Checkout' + (c['requireAddress'] ? ' (collect address)' : '') + ' & take payment';
      case 'payment_qr': return 'Send a payment QR / link';
      case 'search_products': return 'Let the customer search products';
      case 'track_order': return 'Let the customer track their order';
      case 'condition': return `If ${c['variable']} ${c['operator']} “${c['value']}”`;
      case 'switch': return `Route by ${c['variable']}`;
      case 'wait_for_reply': return `Wait for a reply (${c['timeoutMinutes'] || 30} min)`;
      case 'assign_agent': return 'Hand off to a human agent';
      case 'tag_customer': return `Tag customer: ${c['tag']}`;
      case 'update_order': return `Update order status: ${c['status']}`;
      case 'delay': return `Wait ${c['duration']} ${c['unit']}`;
      case 'end': return 'End of flow';
      default: return n.label || n.type;
    }
  }
  edgePaths = computed(() => {
    const byId = new Map(this.nodes().map((n) => [n.id, n]));
    return this.edges().map((e) => {
      const f = byId.get(e.from), t = byId.get(e.to);
      if (!f || !t) return { id: e.id, d: '', label: e.label, lx: 0, ly: 0 };
      const x1 = f.x + CARD_W / 2, y1 = f.y + NODE_H, x2 = t.x + CARD_W / 2, y2 = t.y;
      const my = (y1 + y2) / 2;
      return { id: e.id, d: `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`, label: e.label, lx: (x1 + x2) / 2, ly: my - 4 };
    });
  });

  // ── text edit ──
  edit(n: WFNode) { this.editText = this.msgOf(n); this.editingId.set(n.id); }
  saveText(n: WFNode) {
    const pack = this.selected(); if (!pack) { this.editingId.set(null); return; }
    const role = n.id.split(':')[1];
    this.states[pack.key].texts[role] = this.editText;
    this.editingId.set(null);
    this.regen(pack);
  }

  // ── canvas view ──
  zoomBy(d: number) { this.zoom.set(Math.min(1.6, Math.max(0.4, Math.round((this.zoom() + d) * 10) / 10))); }
  startPan(e: MouseEvent) { this.panning = true; this.px = e.clientX - this.panX(); this.py = e.clientY - this.panY(); }
  onPan(e: MouseEvent) { if (this.panning) { this.panX.set(e.clientX - this.px); this.panY.set(e.clientY - this.py); } }
  endPan() { this.panning = false; }

  // ── save predefined pack ──
  save(pack: Pack) {
    const st = this.states[pack.key]; if (!st.enabled) return;
    this.saving.set(true);
    const g = pack.generate(new Set(Object.keys(st.features).filter((k) => st.features[k])), st.texts);
    const trigger = g.nodes.find((n) => n.type.startsWith('trigger_'))?.type;
    const persist = (id: string) => this.wf.saveDefinition(id, { nodes: g.nodes, edges: g.edges, trigger, status: 'active' }).subscribe({
      next: () => { this.saving.set(false); st.workflowId = id; this.toast.add({ severity: 'success', summary: 'Saved', detail: pack.name + ' is live' }); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Save failed', detail: e?.error?.message || 'Error' }); },
    });
    if (st.workflowId) { persist(st.workflowId); return; }
    this.wf.create({ name: pack.name, description: `pack=${pack.key}`, trigger }).subscribe({
      next: (w: any) => { const id = w?.data?.id || w?.id; st.workflowId = id; persist(id); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Could not create', detail: e?.error?.message || 'Error' }); },
    });
  }

  // ── custom notifications ──
  addCustom() {
    const id = 'c' + Math.abs(Date.now() % 1e9).toString(36);
    this.custom.set([...this.custom(), { id, label: 'New notification', triggerType: this.customTriggers[0].value, text: '' }]);
  }
  removeCustom(i: number) {
    const item = this.custom()[i];
    if (item?.workflowId) this.wf.deleteWorkflow(item.workflowId).subscribe({ next: () => {}, error: () => {} });
    this.custom.set(this.custom().filter((_, j) => j !== i));
  }
  saveCustom() {
    const items = this.custom().filter((c) => c.text.trim());
    if (!items.length) { this.toast.add({ severity: 'warn', summary: 'Add a message first' }); return; }
    this.saving.set(true);
    let pending = items.length;
    const done = () => { if (--pending <= 0) { this.saving.set(false); this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Custom notifications are live' }); } };
    for (const c of items) {
      const trg = this.customTriggers.find((x) => x.value === c.triggerType)!;
      const nodes: WFNode[] = [
        { id: `custom:${c.id}:trigger`, type: c.triggerType, label: trg.label, x: 300, y: 40, config: { ...trg.config }, outputs: [`custom:${c.id}:msg`] },
        { id: `custom:${c.id}:msg`, type: 'send_text', label: c.label || 'Message', x: 300, y: 230, config: { message: c.text }, outputs: [] },
      ];
      const edges: WFEdge[] = [{ id: `custom:${c.id}:e`, from: `custom:${c.id}:trigger`, to: `custom:${c.id}:msg` }];
      const persist = (id: string) => this.wf.saveDefinition(id, { nodes, edges, trigger: c.triggerType, status: 'active' }).subscribe({ next: () => { c.workflowId = id; done(); }, error: done });
      if (c.workflowId) persist(c.workflowId);
      else this.wf.create({ name: c.label || 'Custom notification', description: `pack=custom|id=${c.id}`, trigger: c.triggerType }).subscribe({
        next: (w: any) => { const id = w?.data?.id || w?.id; c.workflowId = id; persist(id); }, error: done,
      });
    }
  }
}
