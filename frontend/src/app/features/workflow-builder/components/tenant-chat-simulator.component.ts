import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { WorkflowService } from '../services/workflow.service';
import { WorkflowNodeData, WorkflowEdgeData, WorkflowDefinition } from '../models/workflow.models';

interface SimMsg {
  id: string;
  sender: 'user' | 'bot' | 'system';
  text: string;
  time: Date;
  buttons?: { id: string; title: string }[];
  listSections?: { title: string; items: { id: string; title: string; desc?: string }[] }[];
  nodeLabel?: string;
  nodeId?: string;
}

@Component({
  selector: 'wa-tenant-chat-sim',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule],
  styles: [`
    :host { display: block; height: 100%; }
    .tcs { display: flex; height: calc(100vh - 128px); border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 24px rgba(0,0,0,0.06); margin: 0 auto; max-width: 1200px; }

    .tcs-side { width: 300px; flex-shrink: 0; background: #f8fafc; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; }
    .tcs-side-hdr { padding: 16px; border-bottom: 1px solid #e5e7eb; }
    .tcs-side-list { flex: 1; overflow-y: auto; padding: 8px; }
    .tcs-wf { padding: 10px 12px; border-radius: 8px; margin-bottom: 3px; cursor: default; transition: background 0.1s; }
    .tcs-wf:hover { background: #f1f5f9; }
    .tcs-wf-name { font-size: 13px; color: #111827; font-weight: 600; }
    .tcs-wf-kw { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .tcs-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; display: inline-block; margin-top: 4px; }
    .tcs-badge.active { background: #dcfce7; color: #16a34a; }
    .tcs-badge.draft { background: #fef3c7; color: #d97706; }
    .tcs-badge.preview { background: #dbeafe; color: #2563eb; }

    .tcs-chat { flex: 1; display: flex; flex-direction: column; background: #efeae2; }
    .tcs-hdr { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #008069; color: white; flex-shrink: 0; }
    .tcs-avatar { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; }
    .tcs-name { font-size: 16px; font-weight: 500; }
    .tcs-status { font-size: 13px; opacity: 0.8; }
    .tcs-clear { background: none; border: none; color: white; cursor: pointer; padding: 6px; font-size: 18px; border-radius: 50%; margin-left: auto; }
    .tcs-clear:hover { background: rgba(255,255,255,0.12); }

    .tcs-msgs {
      flex: 1; overflow-y: auto; padding: 12px 40px;
      background-color: #efeae2;
      background-image: url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M100 10a3 3 0 110 6 3 3 0 010-6zM10 100a3 3 0 110 6 3 3 0 010-6zM190 100a3 3 0 110 6 3 3 0 010-6zM100 190a3 3 0 110 6 3 3 0 010-6z' fill='%23d4cfc6' opacity='0.25'/%3E%3C/svg%3E");
    }
    .tcs-row { display: flex; margin-bottom: 3px; }
    .tcs-row.user { justify-content: flex-end; }
    .tcs-row.bot { justify-content: flex-start; }
    .tcs-bub { max-width: 70%; padding: 6px 9px 8px; border-radius: 8px; font-size: 14.2px; line-height: 19px; color: #111b21; position: relative; box-shadow: 0 1px 0.5px rgba(11,20,26,0.13); white-space: pre-wrap; word-wrap: break-word; }
    .tcs-bub.in { background: #fff; border-top-left-radius: 0; }
    .tcs-bub.in::before { content:''; position: absolute; top: 0; left: -8px; border-top: 6px solid #fff; border-left: 8px solid transparent; }
    .tcs-bub.out { background: #d9fdd3; border-top-right-radius: 0; }
    .tcs-bub.out::after { content:''; position: absolute; top: 0; right: -8px; border-top: 6px solid #d9fdd3; border-right: 8px solid transparent; }
    .tcs-time { font-size: 11px; color: #667781; float: right; margin-left: 10px; margin-top: 4px; }
    .tcs-chk { color: #53bdeb; font-size: 11px; margin-left: 2px; }
    .tcs-nlbl { font-size: 11px; color: #008069; font-weight: 500; margin-bottom: 2px; }
    .tcs-sys { text-align: center; margin: 8px 0; }
    .tcs-pill { display: inline-block; background: #fdf4c5; color: #54656f; font-size: 12px; padding: 5px 12px; border-radius: 8px; box-shadow: 0 1px 1px rgba(0,0,0,0.06); }
    .tcs-btn { display: block; width: 100%; text-align: center; padding: 8px; margin-top: 4px; border-radius: 8px; font-size: 14px; font-weight: 500; color: #008069; background: #fff; border: 1px solid #e2e8e4; cursor: pointer; box-shadow: 0 1px 1px rgba(0,0,0,0.06); }
    .tcs-btn:hover:not(:disabled) { background: #f0faf7; }
    .tcs-btn:disabled { opacity: 0.4; cursor: default; }
    .tcs-typing { display: flex; gap: 4px; padding: 10px 14px; }
    .tcs-dot { width: 8px; height: 8px; border-radius: 50%; background: #9ca5ab; animation: tcb 1.3s ease-in-out infinite; }
    .tcs-dot:nth-child(2) { animation-delay: 0.15s; }
    .tcs-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes tcb { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
    .tcs-input { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f0f2f5; flex-shrink: 0; }
    .tcs-inp { flex: 1; border: none; background: #fff; border-radius: 21px; padding: 9px 16px; font-size: 15px; outline: none; color: #111b21; }
    .tcs-inp::placeholder { color: #9ca5ab; }
    .tcs-send { width: 42px; height: 42px; border-radius: 50%; border: none; background: #008069; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .tcs-send:hover { background: #017561; }
    .tcs-send:disabled { background: #b3c7c1; cursor: default; }
    .tcs-list-menu { background: #fff; border: 1px solid #e2e8e4; border-radius: 8px; margin-top: 4px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .tcs-list-sec { padding: 5px 12px; font-size: 11px; font-weight: 600; color: #008069; background: #f0f2f5; text-transform: uppercase; }
    .tcs-list-item { padding: 10px 12px; cursor: pointer; border-top: 1px solid #f0f2f5; }
    .tcs-list-item:hover { background: #f0faf7; }
  `],
  template: `
    <div class="p-6">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px">
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/workflow-builder"></button>
        <div>
          <h1 style="font-size:20px; font-weight:700; color:#111827; margin:0">Chat Simulator</h1>
          <p style="font-size:13px; color:#6b7280; margin:0">Test your workflows like a real WhatsApp conversation</p>
        </div>
      </div>

      <div class="tcs">
        <!-- Sidebar -->
        <div class="tcs-side">
          <div class="tcs-side-hdr">
            <div style="font-size:14px; font-weight:600; color:#111827">Workflows</div>
            <div style="font-size:11px; color:#6b7280; margin-top:4px; background:#f1f5f9; padding:6px 10px; border-radius:6px">
              Type a message — keywords from active/preview workflows are matched.
            </div>
          </div>
          <div class="tcs-side-list">
            @for (wf of workflows(); track wf.id) {
              <div class="tcs-wf">
                <div class="tcs-wf-name">{{ wf.name }}</div>
                <div class="tcs-wf-kw">{{ getKw(wf) }}</div>
                <span class="tcs-badge" [class.active]="wf.status==='active'" [class.draft]="wf.status==='draft'" [class.preview]="wf.status==='preview'">{{ wf.status }}</span>
              </div>
            }
            @if (loading()) { <div style="text-align:center; padding:30px; color:#9ca3af">Loading...</div> }
          </div>
        </div>

        <!-- Chat -->
        <div class="tcs-chat">
          <div class="tcs-hdr">
            <div class="tcs-avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
            </div>
            <div style="flex:1">
              <div class="tcs-name">My Store Bot</div>
              <div class="tcs-status">@if (typing()) { typing... } @else if (activeWf()) { {{ activeWf()!.name }} } @else { online }</div>
            </div>
            <button class="tcs-clear" title="Clear" (click)="clearChat()">&#128465;</button>
          </div>

          <div class="tcs-msgs" id="tcsChatArea">
            <div class="tcs-sys"><div class="tcs-pill" style="background:#fff3cd">&#128274; Simulator — no real messages sent</div></div>
            <div class="tcs-sys"><div class="tcs-pill">Send a message to start</div></div>

            @for (msg of messages(); track msg.id) {
              @if (msg.sender === 'system') {
                <div class="tcs-sys"><div class="tcs-pill">{{ msg.text }}</div></div>
              } @else if (msg.sender === 'bot') {
                <div>
                  @if (msg.nodeLabel) { <div class="tcs-nlbl">{{ msg.nodeLabel }}</div> }
                  <div class="tcs-row bot"><div class="tcs-bub in">{{ msg.text }}<span class="tcs-time">{{ msg.time | date:'HH:mm' }}</span></div></div>
                  @if (msg.buttons?.length) {
                    <div style="max-width:70%;margin-top:4px">
                      @for (btn of msg.buttons; track btn.id) {
                        <button class="tcs-btn" [disabled]="!waiting()" (click)="clickBtn(btn)">{{ btn.title }}</button>
                      }
                    </div>
                  }
                  @if (msg.listSections?.length) {
                    <div style="max-width:70%;margin-top:4px">
                      <button class="tcs-btn" [disabled]="!waiting()" (click)="listOpen.set(!listOpen())">&#9776; View Options</button>
                      @if (listOpen() && waiting()) {
                        <div class="tcs-list-menu">
                          @for (sec of msg.listSections; track sec.title) {
                            <div class="tcs-list-sec">{{ sec.title }}</div>
                            @for (item of sec.items; track item.id) {
                              <div class="tcs-list-item" (click)="clickList(item)">
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
                <div class="tcs-row user"><div class="tcs-bub out">{{ msg.text }}<span class="tcs-time">{{ msg.time | date:'HH:mm' }}<span class="tcs-chk">&#10003;&#10003;</span></span></div></div>
              }
            }

            @if (typing()) {
              <div class="tcs-row bot"><div class="tcs-bub in"><div class="tcs-typing"><div class="tcs-dot"></div><div class="tcs-dot"></div><div class="tcs-dot"></div></div></div></div>
            }
          </div>

          <div class="tcs-input">
            <input class="tcs-inp" placeholder="Type a message..." [(ngModel)]="userInput" (keydown.enter)="send()" />
            <button class="tcs-send" [disabled]="!userInput.trim()" (click)="send()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TenantChatSimulatorComponent implements OnInit {
  private readonly wfService = inject(WorkflowService);
  workflows = signal<any[]>([]);
  messages = signal<SimMsg[]>([]);
  typing = signal(false);
  waiting = signal(false);
  listOpen = signal(false);
  activeWf = signal<any>(null);
  loading = signal(true);
  userInput = '';

  private curNode: string | null = null;
  private curWf: any = null;
  private vars: Record<string, any> = { customer_name: 'Test User', customer_phone: '+1234567890' };
  private btnMap: Record<string, string> = {};
  private steps = 0;

  ngOnInit() { this.loadWfs(); }

  private loadWfs() {
    this.loading.set(true);
    this.wfService.getAll().subscribe({
      next: (res: any) => {
        const items = Array.isArray(res) ? res : res?.data || [];
        let pending = items.length;
        if (!pending) { this.workflows.set([]); this.loading.set(false); return; }
        const loaded: any[] = [];
        for (const wf of items) {
          this.wfService.getById(wf.id).subscribe({
            next: (full: any) => { loaded.push(full); if (--pending === 0) { this.workflows.set(loaded); this.loading.set(false); } },
            error: () => { if (--pending === 0) { this.workflows.set(loaded); this.loading.set(false); } },
          });
        }
      },
      error: () => this.loading.set(false),
    });
  }

  getKw(wf: any): string {
    const nodes = wf.nodes || [];
    const t = nodes.find((n: any) => n.type?.startsWith('trigger_'));
    if (!t) return nodes.length + ' nodes';
    const kws = t.config?.keywords || [];
    const kw = t.config?.keyword || '';
    const all = [...kws, ...(kw ? [kw] : [])];
    if (all.length) return 'Keywords: ' + all.join(', ');
    return t.type.replace('trigger_', '') + ' trigger';
  }

  clearChat() {
    this.messages.set([]); this.curWf = null; this.curNode = null;
    this.activeWf.set(null); this.waiting.set(false); this.steps = 0;
    this.vars = { customer_name: 'Test User', customer_phone: '+1234567890' };
  }

  send() {
    const t = this.userInput.trim(); if (!t) return; this.userInput = '';
    this.addUser(t); this.listOpen.set(false);
    if (this.waiting() && this.curWf && this.curNode) {
      this.waiting.set(false); this.vars['last_reply'] = t;
      this.follow(this.curNode, t); return;
    }
    const matched = this.match(t);
    if (matched) {
      this.curWf = matched; this.activeWf.set(matched); this.steps = 0;
      this.vars = { customer_name: 'Test User', customer_phone: '+1234567890', trigger_message: t };
      this.addSys('Matched: ' + matched.name);
      const trigger = (matched.nodes || []).find((n: any) => n.type?.startsWith('trigger_'));
      if (trigger) { const e = (matched.edges || []).find((e: any) => e.from === trigger.id); if (e) { this.exec(e.to); return; } }
      const inc = new Set((matched.edges || []).map((e: any) => e.to));
      const start = (matched.nodes || []).find((n: any) => !inc.has(n.id)) || matched.nodes?.[0];
      if (start) this.exec(start.id); else this.addSys('No nodes');
    } else {
      this.addBot("Sorry, I didn't understand. Try a different message.");
    }
  }

  clickBtn(btn: { id: string; title: string }) {
    if (!this.waiting()) return; this.waiting.set(false);
    this.addUser(btn.title);
    const next = this.btnMap[btn.title.toLowerCase()];
    if (next) this.exec(next); else if (this.curNode) this.follow(this.curNode, btn.title);
  }

  clickList(item: { id: string; title: string }) {
    if (!this.waiting()) return; this.waiting.set(false); this.listOpen.set(false);
    this.addUser(item.title);
    const next = this.btnMap[item.title.toLowerCase()];
    if (next) this.exec(next); else if (this.curNode) this.follow(this.curNode, item.title);
  }

  private match(text: string): any {
    const lower = text.toLowerCase();
    for (const wf of this.workflows()) {
      if (wf.status !== 'active' && wf.status !== 'preview') continue;
      const t = (wf.nodes || []).find((n: any) => n.type === 'trigger_message');
      if (!t) continue;
      let rawKws: any = t.config?.keywords || [];
      if (typeof rawKws === 'string') rawKws = rawKws.split(',').map((s: string) => s.trim()).filter((s: string) => s);
      const kws = [...rawKws, ...(t.config?.keyword ? t.config.keyword.split(',').map((s: string) => s.trim()) : [])].map((k: string) => k.toLowerCase());
      const mt = t.config?.matchType || 'contains';
      for (const k of kws) {
        if (mt === 'exact' && lower === k) return wf;
        if (mt === 'starts_with' && lower.startsWith(k)) return wf;
        if (lower.includes(k)) return wf;
      }
    }
    return this.workflows().find((w: any) => (w.status === 'active' || w.status === 'preview') && w.nodes?.length > 0) || null;
  }

  private async exec(nodeId: string) {
    if (!this.curWf) return;
    const node = (this.curWf.nodes || []).find((n: any) => n.id === nodeId);
    if (!node) { this.addSys('Node not found'); this.end(); return; }
    if (this.steps++ > 50) { this.addSys('Max steps'); this.end(); return; }
    this.curNode = nodeId;
    this.typing.set(true); await new Promise(r => setTimeout(r, 500 + Math.random() * 500)); this.typing.set(false);
    const edges = this.curWf.edges || [];
    switch (node.type) {
      case 'send_text': {
        this.addBot(this.res(node.config?.text || node.config?.message || 'Hello!'), node.label);
        if (node.config?.waitForReply) this.waiting.set(true); else this.follow(nodeId); break;
      }
      case 'send_buttons': {
        let rawBtns: any = node.config?.buttons || [];
        if (typeof rawBtns === 'string') rawBtns = rawBtns.split('\n').map((s: string) => s.trim()).filter((s: string) => s);
        const btns = rawBtns.map((b: any, i: number) => ({ id: 'b' + i, title: typeof b === 'string' ? b : b.text || b.title || 'Btn' }));
        const outs = edges.filter((e: any) => e.from === nodeId);
        this.btnMap = {};
        for (const btn of btns) { const e = outs.find((e: any) => e.label?.toLowerCase() === btn.title.toLowerCase()); if (e) this.btnMap[btn.title.toLowerCase()] = e.to; }
        this.addBot(this.res(node.config?.text || node.config?.body || 'Choose:'), node.label, { buttons: btns });
        this.waiting.set(true); break;
      }
      case 'send_list': {
        const secs = node.config?.sections || [{ title: 'Options', items: [{ id: '1', title: 'Option 1' }] }];
        const outs = edges.filter((e: any) => e.from === nodeId);
        this.btnMap = {};
        for (const s of secs) for (const it of s.items || []) { const e = outs.find((e: any) => e.label?.toLowerCase() === (it.title || '').toLowerCase()); if (e) this.btnMap[(it.title || '').toLowerCase()] = e.to; }
        this.addBot(this.res(node.config?.body || node.config?.text || 'Select:'), node.label, { listSections: secs });
        this.waiting.set(true); break;
      }
      case 'wait_for_reply':
        if (node.config?.prompt || node.config?.text) this.addBot(this.res(node.config.prompt || node.config.text), node.label);
        this.waiting.set(true); break;
      case 'condition': {
        this.addSys('Condition → Yes');
        const outs = edges.filter((e: any) => e.from === nodeId);
        const yes = outs.find((e: any) => e.label?.toLowerCase() === 'yes') || outs[0];
        if (yes) this.exec(yes.to); else this.end(); break;
      }
      case 'delay':
        this.addSys('Delay: ' + (node.config?.duration || 5) + ' ' + (node.config?.unit || 'sec'));
        setTimeout(() => this.follow(nodeId), 1500); break;
      case 'end': this.addSys('Workflow completed'); this.end(); break;
      case 'start_workflow': this.addSys('Chain → ' + (node.config?.workflowName || 'next')); this.end(); break;
      default: this.addSys(node.label + ' (' + node.type + ')'); this.follow(nodeId); break;
    }
  }

  private follow(fromId: string, reply?: string) {
    if (!this.curWf) return;
    const outs = (this.curWf.edges || []).filter((e: any) => e.from === fromId);
    if (!outs.length) { this.addSys('No connection — ended'); this.end(); return; }
    if (reply) {
      const m = outs.find((e: any) => e.label?.toLowerCase() === reply.toLowerCase());
      if (m) { this.exec(m.to); return; }
      const def = outs.find((e: any) => !e.label);
      if (def) { this.exec(def.to); return; }
      const fb = (this.curWf.nodes || []).find((n: any) => n.type === 'fallback');
      if (fb) { this.addSys('No match — fallback'); this.exec(fb.id); return; }
      const fromNode = (this.curWf.nodes || []).find((n: any) => n.id === fromId);
      if (fromNode && (fromNode.type === 'send_buttons' || fromNode.type === 'send_list')) {
        this.addBot("Sorry, that's not a valid option. Please choose from above.");
        this.waiting.set(true); return;
      }
    }
    this.exec((outs.find((e: any) => !e.label) || outs[0]).to);
  }

  private end() { this.curWf = null; this.curNode = null; this.activeWf.set(null); this.waiting.set(false); }
  private res(t: string): string { return t.replace(/\{\{(\w+)\}\}/g, (_, k) => this.vars[k] ?? '{{' + k + '}}'); }
  private addUser(t: string) { this.messages.update(m => [...m, { id: 'u' + Date.now(), sender: 'user', text: t, time: new Date() }]); this.scroll(); }
  private addBot(t: string, label?: string, extra?: Partial<SimMsg>) { this.messages.update(m => [...m, { id: 'b' + Date.now() + Math.random(), sender: 'bot', text: t, time: new Date(), nodeLabel: label, ...extra }]); this.scroll(); }
  private addSys(t: string) { this.messages.update(m => [...m, { id: 's' + Date.now(), sender: 'system', text: t, time: new Date() }]); this.scroll(); }
  private scroll() { setTimeout(() => { const el = document.getElementById('tcsChatArea'); if (el) el.scrollTop = el.scrollHeight; }, 50); }
}
