import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ApiService } from '../../../core/services/api.service';

interface SimMessage {
  id: string;
  sender: 'user' | 'bot' | 'system';
  text: string;
  time: Date;
  buttons?: { id: string; title: string; nodeId?: string }[];
  listSections?: { title: string; items: { id: string; title: string; desc?: string; nodeId?: string }[] }[];
  nodeLabel?: string;
}

interface SimWorkflow {
  id: string;
  name: string;
  trigger: any;
  nodes: any[];
  edges: any[];
  status: string;
}

@Component({
  selector: 'wa-chat-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, RouterLink],
  styles: [`
    :host { display: block; height: 100%; }
    .sim-container { display: flex; height: calc(100vh - 44px); }

    /* Left panel - workflow list */
    .sim-sidebar {
      width: 320px; flex-shrink: 0; display: flex; flex-direction: column;
      background: #111927; border-right: 1px solid #1c2640;
    }
    .sim-sidebar-header {
      padding: 16px; border-bottom: 1px solid #1c2640;
    }
    .sim-wf-list { flex: 1; overflow-y: auto; padding: 8px; }
    .sim-wf-item {
      padding: 10px 12px; border-radius: 10px; margin-bottom: 4px; cursor: default;
      border: 1px solid transparent; transition: all 0.15s;
    }
    .sim-wf-item:hover { background: rgba(255,255,255,0.03); }
    .sim-wf-name { font-size: 13px; color: #e2e8f0; font-weight: 500; }
    .sim-wf-trigger { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    .sim-wf-badge {
      font-size: 10px; padding: 2px 8px; border-radius: 12px; font-weight: 600;
      display: inline-block; margin-top: 4px;
    }
    .sim-wf-badge.active { background: rgba(16,185,129,0.15); color: #34d399; }
    .sim-wf-badge.draft { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .sim-wf-badge.preview { background: rgba(59,130,246,0.15); color: #60a5fa; }

    /* Right panel - WhatsApp chat */
    .sim-chat { flex: 1; display: flex; flex-direction: column; background: #efeae2; }

    .sim-chat-header {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px; background: #008069; color: white; flex-shrink: 0;
    }
    .sim-avatar {
      width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center;
    }
    .sim-chat-name { font-size: 16px; font-weight: 500; }
    .sim-chat-status { font-size: 13px; opacity: 0.8; }

    .sim-messages {
      flex: 1; overflow-y: auto; padding: 12px 48px;
      background-color: #efeae2;
      background-image: url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M100 10a3 3 0 110 6 3 3 0 010-6zM10 100a3 3 0 110 6 3 3 0 010-6zM190 100a3 3 0 110 6 3 3 0 010-6zM100 190a3 3 0 110 6 3 3 0 010-6z' fill='%23d4cfc6' opacity='0.25'/%3E%3C/svg%3E");
    }

    /* Messages */
    .sim-msg { margin-bottom: 3px; display: flex; }
    .sim-msg.user { justify-content: flex-end; }
    .sim-msg.bot { justify-content: flex-start; }

    .sim-bubble {
      max-width: 70%; padding: 6px 9px 8px; border-radius: 8px; font-size: 14.2px;
      line-height: 19px; color: #111b21; position: relative;
      box-shadow: 0 1px 0.5px rgba(11,20,26,0.13); white-space: pre-wrap; word-wrap: break-word;
    }
    .sim-bubble.in { background: #fff; border-top-left-radius: 0; }
    .sim-bubble.in::before {
      content: ''; position: absolute; top: 0; left: -8px;
      border-top: 6px solid #fff; border-left: 8px solid transparent;
    }
    .sim-bubble.out { background: #d9fdd3; border-top-right-radius: 0; }
    .sim-bubble.out::after {
      content: ''; position: absolute; top: 0; right: -8px;
      border-top: 6px solid #d9fdd3; border-right: 8px solid transparent;
    }
    .sim-time { font-size: 11px; color: #667781; float: right; margin-left: 10px; margin-top: 4px; }
    .sim-checks { color: #53bdeb; font-size: 11px; margin-left: 2px; }
    .sim-node { font-size: 11px; color: #008069; font-weight: 500; margin-bottom: 2px; }
    .sim-sys { text-align: center; margin: 8px 0; }
    .sim-sys-pill {
      display: inline-block; background: #fdf4c5; color: #54656f;
      font-size: 12px; padding: 5px 12px; border-radius: 8px;
      box-shadow: 0 1px 1px rgba(0,0,0,0.06);
    }

    /* Buttons & List */
    .sim-btn-row { max-width: 70%; margin-top: 4px; }
    .sim-wa-btn {
      display: block; width: 100%; text-align: center; padding: 8px; margin-top: 4px;
      border-radius: 8px; font-size: 14px; font-weight: 500; color: #008069;
      background: #fff; border: 1px solid #e2e8e4; cursor: pointer;
      box-shadow: 0 1px 1px rgba(0,0,0,0.06); transition: background 0.1s;
    }
    .sim-wa-btn:hover:not(:disabled) { background: #f0faf7; }
    .sim-wa-btn:disabled { opacity: 0.4; cursor: default; }
    .sim-list-menu { background: #fff; border: 1px solid #e2e8e4; border-radius: 8px; margin-top: 4px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .sim-list-sec { padding: 5px 12px; font-size: 11px; font-weight: 600; color: #008069; background: #f0f2f5; text-transform: uppercase; }
    .sim-list-item { padding: 10px 12px; cursor: pointer; border-top: 1px solid #f0f2f5; }
    .sim-list-item:hover { background: #f0faf7; }

    /* Typing */
    .sim-typing { display: flex; gap: 4px; padding: 10px 14px; }
    .sim-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #9ca5ab;
      animation: sbounce 1.3s ease-in-out infinite;
    }
    .sim-dot:nth-child(2) { animation-delay: 0.15s; }
    .sim-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes sbounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }

    /* Input */
    .sim-input-bar {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      background: #f0f2f5; flex-shrink: 0;
    }
    .sim-text-input {
      flex: 1; border: none; background: #fff; border-radius: 21px;
      padding: 9px 16px; font-size: 15px; outline: none; color: #111b21;
    }
    .sim-text-input::placeholder { color: #9ca5ab; }
    .sim-send {
      width: 42px; height: 42px; border-radius: 50%; border: none;
      background: #008069; color: white; cursor: pointer; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
    }
    .sim-send:hover { background: #017561; }
    .sim-send:disabled { background: #b3c7c1; cursor: default; }
  `],
  template: `
    <div class="sim-container">
      <!-- LEFT: Workflow list -->
      <div class="sim-sidebar">
        <div class="sim-sidebar-header">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px">
            <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-sm p-button-rounded" style="color:#94a3b8" [routerLink]="['/admin/tenants', tenantId, 'view']"></button>
            <div>
              <div style="color:white; font-size:14px; font-weight:600">Chat Simulator</div>
              <div style="color:#94a3b8; font-size:11px">{{ tenantName() }} — {{ workflows().length }} workflows</div>
            </div>
          </div>
          <div style="font-size:11px; color:#94a3b8; background:#1c2640; padding:8px 12px; border-radius:8px">
            Type a message to trigger workflows. Keywords from active/preview workflows are matched automatically.
          </div>
        </div>
        <div class="sim-wf-list">
          @for (wf of workflows(); track wf.id) {
            <div class="sim-wf-item">
              <div class="sim-wf-name">{{ wf.name }}</div>
              <div class="sim-wf-trigger">{{ getTriggerLabel(wf) }}</div>
              <span class="sim-wf-badge" [class.active]="wf.status==='active'" [class.draft]="wf.status==='draft'" [class.preview]="wf.status==='preview'">{{ wf.status }}</span>
            </div>
          }
          @if (!workflows().length) {
            <div style="text-align:center; padding:40px 20px; color:#94a3b8; font-size:13px">
              No workflows found
            </div>
          }
        </div>
      </div>

      <!-- RIGHT: WhatsApp Chat -->
      <div class="sim-chat">
        <div class="sim-chat-header">
          <div class="sim-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
          </div>
          <div style="flex:1">
            <div class="sim-chat-name">{{ tenantName() }} Bot</div>
            <div class="sim-chat-status">
              @if (typing()) { typing... }
              @else if (activeWf()) { {{ activeWf()!.name }} }
              @else { online }
            </div>
          </div>
          <button style="background:none; border:none; color:white; cursor:pointer; padding:6px; font-size:18px; border-radius:50%" title="Clear chat" (click)="clearChat()">&#128465;</button>
        </div>

        <div class="sim-messages" id="simChatArea">
          <div class="sim-sys"><div class="sim-sys-pill" style="background:#fff3cd">&#128274; Simulator — no real messages sent</div></div>
          <div class="sim-sys"><div class="sim-sys-pill">Send a message to start a conversation</div></div>

          @for (msg of messages(); track msg.id) {
            @if (msg.sender === 'system') {
              <div class="sim-sys"><div class="sim-sys-pill">{{ msg.text }}</div></div>
            } @else if (msg.sender === 'bot') {
              <div>
                @if (msg.nodeLabel) { <div class="sim-node">{{ msg.nodeLabel }}</div> }
                <div class="sim-msg bot">
                  <div class="sim-bubble in">
                    {{ msg.text }}
                    <span class="sim-time">{{ msg.time | date:'HH:mm' }}</span>
                  </div>
                </div>
                @if (msg.buttons?.length) {
                  <div class="sim-btn-row">
                    @for (btn of msg.buttons; track btn.id) {
                      <button class="sim-wa-btn" [disabled]="!waitingForReply()" (click)="handleButton(btn, msg)">{{ btn.title }}</button>
                    }
                  </div>
                }
                @if (msg.listSections?.length) {
                  <div class="sim-btn-row">
                    <button class="sim-wa-btn" [disabled]="!waitingForReply()" (click)="listOpen.set(!listOpen())">&#9776; View Options</button>
                    @if (listOpen() && waitingForReply()) {
                      <div class="sim-list-menu">
                        @for (sec of msg.listSections; track sec.title) {
                          <div class="sim-list-sec">{{ sec.title }}</div>
                          @for (item of sec.items; track item.id) {
                            <div class="sim-list-item" (click)="handleListItem(item, msg)">
                              <div style="font-size:14px; color:#111b21">{{ item.title }}</div>
                              @if (item.desc) { <div style="font-size:12px; color:#667781">{{ item.desc }}</div> }
                            </div>
                          }
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            } @else {
              <div class="sim-msg user">
                <div class="sim-bubble out">
                  {{ msg.text }}
                  <span class="sim-time">{{ msg.time | date:'HH:mm' }}<span class="sim-checks">&#10003;&#10003;</span></span>
                </div>
              </div>
            }
          }

          @if (typing()) {
            <div class="sim-msg bot">
              <div class="sim-bubble in"><div class="sim-typing"><div class="sim-dot"></div><div class="sim-dot"></div><div class="sim-dot"></div></div></div>
            </div>
          }
        </div>

        <div class="sim-input-bar">
          <input class="sim-text-input" placeholder="Type a message..." [(ngModel)]="userInput" (keydown.enter)="sendMessage()" />
          <button class="sim-send" [disabled]="!userInput.trim()" (click)="sendMessage()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ChatSimulatorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  tenantId = '';
  tenantName = signal('Tenant');
  workflows = signal<SimWorkflow[]>([]);
  messages = signal<SimMessage[]>([]);
  typing = signal(false);
  waitingForReply = signal(false);
  listOpen = signal(false);
  activeWf = signal<SimWorkflow | null>(null);
  userInput = '';

  // Execution state
  private currentNodeId: string | null = null;
  private currentWf: SimWorkflow | null = null;
  private variables: Record<string, any> = { customer_name: 'Test User', customer_phone: '+1234567890' };
  private buttonMap: Record<string, string> = {};
  private stepCount = 0;
  private delayTimer: any;

  ngOnInit() {
    this.tenantId = this.route.snapshot.paramMap.get('id') || '';
    this.api.get<any>(`/admin/tenants/${this.tenantId}`).subscribe({
      next: (t) => this.tenantName.set(t.name || t.slug),
    });
    this.loadWorkflows();
  }

  private loadWorkflows() {
    this.api.get<any[]>(`/admin/tenants/${this.tenantId}/workflows`).subscribe({
      next: (wfs) => {
        // Load full definitions for each
        const loaded: SimWorkflow[] = [];
        let pending = wfs.length;
        if (!pending) { this.workflows.set([]); return; }
        for (const wf of wfs) {
          this.api.get<any>(`/admin/tenants/${this.tenantId}/workflows/${wf.id}`).subscribe({
            next: (full) => {
              loaded.push({ id: full.id, name: full.name, trigger: full.trigger, nodes: full.nodes || [], edges: full.edges || [], status: full.status });
              if (--pending === 0) this.workflows.set(loaded);
            },
            error: () => { if (--pending === 0) this.workflows.set(loaded); },
          });
        }
      },
    });
  }

  getTriggerLabel(wf: SimWorkflow): string {
    if (!wf.nodes?.length) return 'No nodes';
    const trigger = wf.nodes.find((n: any) => n.type?.startsWith('trigger_'));
    if (!trigger) return wf.nodes.length + ' nodes';
    const kw = trigger.config?.keywords || trigger.config?.keyword || '';
    if (kw) return 'Keywords: ' + (Array.isArray(kw) ? kw.join(', ') : kw);
    return trigger.type.replace('trigger_', '') + ' trigger';
  }

  clearChat() {
    this.messages.set([]);
    this.currentWf = null;
    this.currentNodeId = null;
    this.activeWf.set(null);
    this.waitingForReply.set(false);
    this.variables = { customer_name: 'Test User', customer_phone: '+1234567890' };
    this.stepCount = 0;
    clearTimeout(this.delayTimer);
  }

  sendMessage() {
    const text = this.userInput.trim();
    if (!text) return;
    this.userInput = '';
    this.addMsg('user', text);
    this.listOpen.set(false);

    // If we're waiting for a reply in an active workflow
    if (this.waitingForReply() && this.currentWf && this.currentNodeId) {
      this.waitingForReply.set(false);
      this.variables['last_reply'] = text;
      this.followEdge(this.currentNodeId, text);
      return;
    }

    // Otherwise, try to match a workflow trigger
    const matched = this.matchWorkflow(text);
    if (matched) {
      this.currentWf = matched;
      this.activeWf.set(matched);
      this.stepCount = 0;
      this.variables = { customer_name: 'Test User', customer_phone: '+1234567890', trigger_message: text };
      this.addSys('Matched workflow: ' + matched.name);

      const trigger = matched.nodes.find((n: any) => n.type?.startsWith('trigger_'));
      if (trigger) {
        const edge = matched.edges.find((e: any) => e.from === trigger.id);
        if (edge) { this.executeNode(edge.to); return; }
      }
      // No trigger node, start from first
      const nodesWithIncoming = new Set(matched.edges.map((e: any) => e.to));
      const start = matched.nodes.find((n: any) => !nodesWithIncoming.has(n.id)) || matched.nodes[0];
      if (start) this.executeNode(start.id);
      else this.addSys('Workflow has no executable nodes');
    } else {
      this.addBot("Sorry, I didn't understand that. Try a different message.", undefined, 'Default Reply');
    }
  }

  handleButton(btn: { id: string; title: string; nodeId?: string }, msg: SimMessage) {
    if (!this.waitingForReply()) return;
    this.waitingForReply.set(false);
    this.addMsg('user', btn.title);
    const next = this.buttonMap[btn.title.toLowerCase()];
    if (next) this.executeNode(next);
    else if (this.currentNodeId) this.followEdge(this.currentNodeId, btn.title);
  }

  handleListItem(item: { id: string; title: string }, msg: SimMessage) {
    if (!this.waitingForReply()) return;
    this.waitingForReply.set(false);
    this.listOpen.set(false);
    this.addMsg('user', item.title);
    const next = this.buttonMap[item.title.toLowerCase()];
    if (next) this.executeNode(next);
    else if (this.currentNodeId) this.followEdge(this.currentNodeId, item.title);
  }

  // ─── Workflow matching ────────────────────────────────────────────────
  private matchWorkflow(text: string): SimWorkflow | null {
    const lower = text.toLowerCase();
    for (const wf of this.workflows()) {
      if (wf.status !== 'active' && wf.status !== 'preview') continue;
      const trigger = wf.nodes.find((n: any) => n.type === 'trigger_message');
      if (!trigger) continue;
      let keywords: any = trigger.config?.keywords || [];
      if (typeof keywords === 'string') keywords = keywords.split(',').map((s: string) => s.trim()).filter((s: string) => s);
      const kw = trigger.config?.keyword || '';
      const allKw = [...keywords, ...(kw ? kw.split(',').map((s: string) => s.trim()) : [])].map((k: string) => k.toLowerCase());
      const matchType = trigger.config?.matchType || 'contains';
      for (const k of allKw) {
        if (matchType === 'exact' && lower === k) return wf;
        if (matchType === 'starts_with' && lower.startsWith(k)) return wf;
        if (lower.includes(k)) return wf; // default: contains
      }
    }
    // Fallback: match any active workflow
    return this.workflows().find(wf => (wf.status === 'active' || wf.status === 'preview') && wf.nodes.length > 0) || null;
  }

  // ─── Node execution ───────────────────────────────────────────────────
  private async executeNode(nodeId: string) {
    if (!this.currentWf) return;
    const node = this.currentWf.nodes.find((n: any) => n.id === nodeId);
    if (!node) { this.addSys('Node not found'); this.endWf(); return; }
    if (this.stepCount++ > 50) { this.addSys('Max steps reached'); this.endWf(); return; }
    this.currentNodeId = nodeId;

    this.typing.set(true);
    await this.wait(500 + Math.random() * 600);
    this.typing.set(false);

    const edges = this.currentWf.edges;
    switch (node.type) {
      case 'send_text': {
        const t = this.resolve(node.config?.text || node.config?.message || 'Hello!');
        this.addBot(t, node.id, node.label);
        if (node.config?.waitForReply) { this.waitingForReply.set(true); }
        else this.followEdge(nodeId);
        break;
      }
      case 'send_buttons': {
        const t = this.resolve(node.config?.text || node.config?.body || 'Choose:');
        let rawBtns: any = node.config?.buttons || [];
        if (typeof rawBtns === 'string') rawBtns = rawBtns.split('\n').map((s: string) => s.trim()).filter((s: string) => s);
        const btns = rawBtns.map((b: any, i: number) => ({ id: 'b' + i, title: typeof b === 'string' ? b : b.text || b.title || 'Button ' + (i + 1) }));
        const outs = edges.filter((e: any) => e.from === nodeId);
        this.buttonMap = {};
        for (const btn of btns) { const e = outs.find((e: any) => e.label?.toLowerCase() === btn.title.toLowerCase()); if (e) this.buttonMap[btn.title.toLowerCase()] = e.to; }
        this.addBot(t, node.id, node.label, { buttons: btns });
        this.waitingForReply.set(true);
        break;
      }
      case 'send_list': {
        const t = this.resolve(node.config?.body || node.config?.text || 'Select:');
        const sections = node.config?.sections || [{ title: 'Options', items: [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }] }];
        const outs = edges.filter((e: any) => e.from === nodeId);
        this.buttonMap = {};
        for (const s of sections) for (const item of s.items || []) { const e = outs.find((e: any) => e.label?.toLowerCase() === (item.title || '').toLowerCase()); if (e) this.buttonMap[(item.title || '').toLowerCase()] = e.to; }
        this.addBot(t, node.id, node.label, { listSections: sections });
        this.waitingForReply.set(true);
        break;
      }
      case 'send_image':
        this.addBot('[Image] ' + this.resolve(node.config?.caption || ''), node.id, node.label);
        this.followEdge(nodeId); break;
      case 'send_template':
        this.addBot('Template: ' + (node.config?.templateName || ''), node.id, node.label);
        this.followEdge(nodeId); break;
      case 'wait_for_reply': {
        const p = node.config?.prompt || node.config?.text;
        if (p) this.addBot(this.resolve(p), node.id, node.label);
        this.waitingForReply.set(true); break;
      }
      case 'condition': {
        this.addSys('Condition: ' + (node.config?.variable || '?') + ' → Yes');
        const outs = edges.filter((e: any) => e.from === nodeId);
        const yes = outs.find((e: any) => e.label?.toLowerCase() === 'yes') || outs[0];
        if (yes) this.executeNode(yes.to); else this.endWf(); break;
      }
      case 'delay': {
        const amt = node.config?.duration || 5;
        this.addSys('Delay: ' + amt + ' ' + (node.config?.unit || 'sec'));
        this.delayTimer = setTimeout(() => this.followEdge(nodeId), 1500);
        break;
      }
      case 'end': this.addSys('Workflow completed'); this.endWf(); break;
      case 'start_workflow': this.addSys('Chain → ' + (node.config?.workflowName || 'next')); this.endWf(); break;
      default:
        this.addSys(node.label + ' (' + node.type + ')');
        this.followEdge(nodeId); break;
    }
  }

  private followEdge(fromId: string, replyText?: string) {
    if (!this.currentWf) return;
    const outs = this.currentWf.edges.filter((e: any) => e.from === fromId);
    if (!outs.length) { this.addSys('No outgoing edge — ended'); this.endWf(); return; }
    if (replyText) {
      const m = outs.find((e: any) => e.label?.toLowerCase() === replyText.toLowerCase());
      if (m) { this.executeNode(m.to); return; }
      const def = outs.find((e: any) => !e.label);
      if (def) { this.executeNode(def.to); return; }
      // No match — try fallback node
      const fb = (this.currentWf.nodes || []).find((n: any) => n.type === 'fallback');
      if (fb) { this.addSys('No match — fallback'); this.executeNode(fb.id); return; }
      // No fallback — re-prompt
      const fromNode = (this.currentWf.nodes || []).find((n: any) => n.id === fromId);
      if (fromNode && (fromNode.type === 'send_buttons' || fromNode.type === 'send_list')) {
        this.addBot("Sorry, that's not a valid option. Please choose from above.", fromId, 'Invalid Input');
        this.waitingForReply.set(true); return;
      }
    }
    this.executeNode((outs.find((e: any) => !e.label) || outs[0]).to);
  }

  private endWf() { this.currentWf = null; this.currentNodeId = null; this.activeWf.set(null); this.waitingForReply.set(false); }

  private resolve(t: string): string { return t.replace(/\{\{(\w+)\}\}/g, (_, k) => this.variables[k] ?? '{{' + k + '}}'); }
  private wait(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

  private addMsg(sender: 'user' | 'bot', text: string) {
    this.messages.update(m => [...m, { id: 'm' + Date.now() + Math.random(), sender, text, time: new Date() }]);
    this.scroll();
  }
  private addBot(text: string, nodeId?: string, nodeLabel?: string, extra?: Partial<SimMessage>) {
    this.messages.update(m => [...m, { id: 'm' + Date.now() + Math.random(), sender: 'bot', text, time: new Date(), nodeLabel, ...extra }]);
    this.scroll();
  }
  private addSys(text: string) {
    this.messages.update(m => [...m, { id: 's' + Date.now(), sender: 'system', text, time: new Date() }]);
    this.scroll();
  }
  private scroll() { setTimeout(() => { const el = document.getElementById('simChatArea'); if (el) el.scrollTop = el.scrollHeight; }, 50); }
}
