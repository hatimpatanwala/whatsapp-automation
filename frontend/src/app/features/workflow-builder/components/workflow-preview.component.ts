import { Component, Input, Output, EventEmitter, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowNodeData, WorkflowEdgeData } from '../models/workflow.models';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user' | 'system';
  type: 'text' | 'buttons' | 'list' | 'image' | 'template' | 'catalog' | 'delay';
  text: string;
  buttons?: { id: string; title: string }[];
  listSections?: { title: string; items: { id: string; title: string; description?: string }[] }[];
  imageUrl?: string;
  timestamp: Date;
  nodeId?: string;
  nodeLabel?: string;
}

interface PreviewState {
  currentNodeId: string | null;
  variables: Record<string, any>;
  waitingForReply: boolean;
  buttonMap: Record<string, string>;
  completed: boolean;
  paused: boolean;
}

@Component({
  selector: 'wa-workflow-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    /* WhatsApp authentic light theme */
    :host { display: block; height: 100%; }

    .wa-phone {
      display: flex; flex-direction: column; height: 100%;
      background: #efeae2; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      border-left: 1px solid #d1d7db;
    }

    /* Header - WhatsApp teal */
    .wa-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; background: #008069; color: white; flex-shrink: 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .wa-header-avatar {
      width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .wa-header-name { font-size: 16px; font-weight: 500; }
    .wa-header-status { font-size: 13px; opacity: 0.8; }
    .wa-header-btn {
      background: none; border: none; color: white; cursor: pointer; padding: 6px;
      border-radius: 50%; transition: background 0.15s; font-size: 18px;
    }
    .wa-header-btn:hover { background: rgba(255,255,255,0.12); }

    /* Chat area with WhatsApp wallpaper */
    .wa-chat {
      flex: 1; overflow-y: auto; padding: 12px 60px 12px 60px;
      background-color: #efeae2;
      background-image: url("data:image/svg+xml,%3Csvg width='400' height='400' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='p' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpath d='M20 5a2 2 0 110 4 2 2 0 010-4zM5 20a2 2 0 110 4 2 2 0 010-4zM35 20a2 2 0 110 4 2 2 0 010-4zM20 35a2 2 0 110 4 2 2 0 010-4z' fill='%23d4cfc6' opacity='0.3'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='400' height='400' fill='url(%23p)'/%3E%3C/svg%3E");
    }

    /* System message (centered pill) */
    .wa-system {
      text-align: center; margin: 8px 0;
    }
    .wa-system-pill {
      display: inline-block; background: #fdf4c5; color: #54656f;
      font-size: 12px; padding: 5px 12px; border-radius: 8px;
      box-shadow: 0 1px 1px rgba(0,0,0,0.06); max-width: 85%;
    }

    /* Message row */
    .wa-msg-row { display: flex; margin-bottom: 2px; }
    .wa-msg-row.bot { justify-content: flex-start; }
    .wa-msg-row.user { justify-content: flex-end; }

    /* Bubble base */
    .wa-bubble {
      max-width: 75%; padding: 6px 7px 8px 9px; border-radius: 8px;
      position: relative; font-size: 14.2px; line-height: 19px; color: #111b21;
      box-shadow: 0 1px 0.5px rgba(11,20,26,0.13);
      word-wrap: break-word; white-space: pre-wrap;
    }
    /* Incoming (bot) */
    .wa-bubble.incoming {
      background: #ffffff; border-top-left-radius: 0;
    }
    /* Outgoing (user) */
    .wa-bubble.outgoing {
      background: #d9fdd3; border-top-right-radius: 0;
    }

    /* Tail triangles */
    .wa-bubble.incoming::before {
      content: ''; position: absolute; top: 0; left: -8px; width: 0; height: 0;
      border-top: 6px solid #ffffff; border-left: 8px solid transparent;
    }
    .wa-bubble.outgoing::after {
      content: ''; position: absolute; top: 0; right: -8px; width: 0; height: 0;
      border-top: 6px solid #d9fdd3; border-right: 8px solid transparent;
    }

    /* Node label (above message) */
    .wa-node-label {
      font-size: 11px; color: #008069; font-weight: 500;
      margin-bottom: 2px; padding-left: 2px;
    }

    /* Timestamp + checkmarks */
    .wa-meta {
      display: flex; align-items: center; justify-content: flex-end; gap: 3px;
      margin-top: 2px; float: right; margin-left: 12px; position: relative; top: 5px;
    }
    .wa-time { font-size: 11px; color: #667781; }
    .wa-check { color: #53bdeb; font-size: 11px; }

    /* Interactive buttons */
    .wa-buttons { margin-top: 4px; }
    .wa-btn {
      display: block; width: 100%; text-align: center; padding: 8px;
      margin-top: 4px; border-radius: 8px; font-size: 14px; font-weight: 500;
      color: #008069; background: #ffffff; cursor: pointer;
      border: 1px solid #e2e8e4; transition: all 0.15s;
      box-shadow: 0 1px 1px rgba(0,0,0,0.06);
    }
    .wa-btn:hover:not(:disabled) { background: #f0faf7; }
    .wa-btn:disabled { opacity: 0.5; cursor: default; }

    /* List menu */
    .wa-list-trigger {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px; margin-top: 4px; border-radius: 8px; font-size: 14px;
      color: #008069; background: #ffffff; cursor: pointer;
      border: 1px solid #e2e8e4; font-weight: 500;
      box-shadow: 0 1px 1px rgba(0,0,0,0.06);
    }
    .wa-list-menu {
      background: #ffffff; border: 1px solid #e2e8e4; border-radius: 8px;
      margin-top: 4px; overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .wa-list-section { padding: 6px 12px; font-size: 12px; font-weight: 600; color: #008069; background: #f0f2f5; text-transform: uppercase; letter-spacing: 0.3px; }
    .wa-list-item {
      padding: 10px 12px; cursor: pointer; border-top: 1px solid #f0f2f5; transition: background 0.1s;
    }
    .wa-list-item:hover { background: #f0faf7; }
    .wa-list-item-title { font-size: 14px; color: #111b21; }
    .wa-list-item-desc { font-size: 12px; color: #667781; margin-top: 2px; }

    /* Image placeholder */
    .wa-image {
      background: #e2e8e4; border-radius: 6px; padding: 16px; text-align: center;
      margin-bottom: 4px; color: #667781;
    }

    /* Delay indicator */
    .wa-delay { display: flex; align-items: center; gap: 6px; color: #667781; font-style: italic; }

    /* Typing indicator */
    .wa-typing { display: flex; align-items: center; gap: 3px; padding: 12px 16px; }
    .wa-typing-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #9ca5ab;
      animation: wa-bounce 1.3s ease-in-out infinite;
    }
    .wa-typing-dot:nth-child(2) { animation-delay: 0.15s; }
    .wa-typing-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes wa-bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }

    /* Input area */
    .wa-input-area {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: #f0f2f5; flex-shrink: 0;
    }
    .wa-text-input {
      flex: 1; border: none; background: #ffffff; border-radius: 21px;
      padding: 9px 16px; font-size: 15px; outline: none; color: #111b21;
      box-shadow: 0 1px 1px rgba(0,0,0,0.06);
    }
    .wa-text-input::placeholder { color: #9ca5ab; }
    .wa-send-btn {
      width: 42px; height: 42px; border-radius: 50%; border: none;
      background: #008069; color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; flex-shrink: 0;
    }
    .wa-send-btn:hover { background: #017561; }
    .wa-send-btn:disabled { background: #b3c7c1; cursor: default; }

    /* Footer status bar */
    .wa-footer-status {
      padding: 8px 16px; background: #f0f2f5; text-align: center;
      font-size: 13px; color: #667781; flex-shrink: 0;
      border-top: 1px solid #e2e8e4;
    }
    .wa-footer-btn {
      background: none; border: 1px solid #008069; color: #008069;
      padding: 6px 16px; border-radius: 20px; cursor: pointer;
      font-size: 13px; font-weight: 500; transition: all 0.15s;
    }
    .wa-footer-btn:hover { background: #f0faf7; }

    /* Exec log */
    .wa-log-toggle {
      padding: 6px 12px; background: #f0f2f5; border-top: 1px solid #e2e8e4;
      font-size: 11px; color: #667781; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; gap: 4px; transition: background 0.1s;
    }
    .wa-log-toggle:hover { background: #e9e5dd; }
    .wa-log-entries { max-height: 100px; overflow-y: auto; padding: 4px 12px 8px; background: #f0f2f5; }
    .wa-log-entry { font-size: 10px; font-family: monospace; display: flex; gap: 6px; padding: 2px 0; }
    .wa-log-step { color: #008069; width: 20px; text-align: right; flex-shrink: 0; }
    .wa-log-type { color: #9ca5ab; width: 100px; flex-shrink: 0; }
    .wa-log-label { color: #111b21; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wa-log-action { color: #667781; flex-shrink: 0; }
  `],
  template: `
    <div class="wa-phone">
      <!-- Header -->
      <div class="wa-header">
        <div style="display:flex; align-items:center; gap:12px">
          <div class="wa-header-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
          </div>
          <div>
            <div class="wa-header-name">Workflow Preview</div>
            <div class="wa-header-status">
              @if (state.completed) { online }
              @else if (state.waitingForReply) { online }
              @else if (state.paused) { online }
              @else { typing... }
            </div>
          </div>
        </div>
        <div style="display:flex; gap:4px">
          <button class="wa-header-btn" title="Restart" (click)="restart()">&#8634;</button>
          <button class="wa-header-btn" title="Close" (click)="closed.emit()">&times;</button>
        </div>
      </div>

      <!-- Chat area -->
      <div class="wa-chat" id="waPreviewChat">
        <!-- Preview mode banner -->
        <div class="wa-system">
          <div class="wa-system-pill" style="background:#fff3cd">
            &#128274; Preview Mode — No real messages are sent
          </div>
        </div>

        @for (msg of messages(); track msg.id) {
          @if (msg.sender === 'system') {
            <div class="wa-system">
              <div class="wa-system-pill">{{ msg.text }}</div>
            </div>
          } @else if (msg.sender === 'bot') {
            <!-- Bot (incoming) message -->
            <div style="margin-bottom:2px">
              @if (msg.nodeLabel) {
                <div class="wa-node-label">{{ msg.nodeLabel }}</div>
              }
              <div class="wa-msg-row bot">
                <div class="wa-bubble incoming"
                     [style.cursor]="msg.nodeId ? 'pointer' : 'default'"
                     (click)="msg.nodeId && highlightNode.emit(msg.nodeId)">
                  @if (msg.type === 'image') {
                    <div class="wa-image">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="#9ca5ab"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                      <div style="font-size:12px;margin-top:4px">{{ msg.imageUrl || 'Image' }}</div>
                    </div>
                  }
                  @if (msg.type === 'delay') {
                    <div class="wa-delay">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#667781"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>
                      {{ msg.text }}
                    </div>
                  } @else {
                    {{ msg.text }}
                  }
                  <span class="wa-meta">
                    <span class="wa-time">{{ msg.timestamp | date:'HH:mm' }}</span>
                  </span>
                </div>
              </div>

              <!-- Buttons -->
              @if (msg.buttons?.length) {
                <div class="wa-buttons" style="max-width:75%">
                  @for (btn of msg.buttons; track btn.id) {
                    <button class="wa-btn"
                      [disabled]="!state.waitingForReply || activeReplyMsgId() !== msg.id"
                      (click)="sendButtonReply(btn, msg)">
                      {{ btn.title }}
                    </button>
                  }
                </div>
              }

              <!-- List -->
              @if (msg.listSections?.length) {
                <div style="max-width:75%;margin-top:4px">
                  <button class="wa-list-trigger"
                    [disabled]="!state.waitingForReply || activeReplyMsgId() !== msg.id"
                    (click)="showListMenu.set(!showListMenu())">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#008069"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
                    View Options
                  </button>
                  @if (showListMenu() && state.waitingForReply && activeReplyMsgId() === msg.id) {
                    <div class="wa-list-menu">
                      @for (section of msg.listSections; track section.title) {
                        <div class="wa-list-section">{{ section.title }}</div>
                        @for (item of section.items; track item.id) {
                          <div class="wa-list-item" (click)="sendListReply(item, msg)">
                            <div class="wa-list-item-title">{{ item.title }}</div>
                            @if (item.description) {
                              <div class="wa-list-item-desc">{{ item.description }}</div>
                            }
                          </div>
                        }
                      }
                    </div>
                  }
                </div>
              }
            </div>
          } @else {
            <!-- User (outgoing) message -->
            <div class="wa-msg-row user">
              <div class="wa-bubble outgoing">
                {{ msg.text }}
                <span class="wa-meta">
                  <span class="wa-time">{{ msg.timestamp | date:'HH:mm' }}</span>
                  <span class="wa-check">&#10003;&#10003;</span>
                </span>
              </div>
            </div>
          }
        }

        <!-- Typing indicator -->
        @if (typing()) {
          <div class="wa-msg-row bot">
            <div class="wa-bubble incoming">
              <div class="wa-typing">
                <div class="wa-typing-dot"></div>
                <div class="wa-typing-dot"></div>
                <div class="wa-typing-dot"></div>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Input area -->
      @if (state.waitingForReply && !activeReplyMsgId()) {
        <div class="wa-input-area">
          <input class="wa-text-input" placeholder="Type a message" [(ngModel)]="userInput" (keydown.enter)="sendTextReply()" />
          <button class="wa-send-btn" [disabled]="!userInput.trim()" (click)="sendTextReply()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      } @else if (state.completed) {
        <div class="wa-footer-status">
          Workflow completed &nbsp;
          <button class="wa-footer-btn" (click)="restart()">&#8634; Restart</button>
        </div>
      } @else if (state.paused) {
        <div class="wa-footer-status">
          Delay in progress &nbsp;
          <button class="wa-footer-btn" (click)="skipDelay()">Skip &#9654;</button>
        </div>
      } @else if (state.waitingForReply) {
        <div class="wa-footer-status">Select an option above to continue</div>
      } @else {
        <div class="wa-footer-status">Processing...</div>
      }

      <!-- Execution log -->
      <div class="wa-log-toggle" (click)="showLog.set(!showLog())">
        {{ showLog() ? '&#9660;' : '&#9654;' }} Execution Log ({{ executionLog().length }} steps)
      </div>
      @if (showLog()) {
        <div class="wa-log-entries">
          @for (entry of executionLog(); track entry.step) {
            <div class="wa-log-entry">
              <span class="wa-log-step">{{ entry.step }}.</span>
              <span class="wa-log-type">{{ entry.nodeType }}</span>
              <span class="wa-log-label">{{ entry.label }}</span>
              <span class="wa-log-action">{{ entry.action }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class WorkflowPreviewComponent implements OnChanges {
  @Input() nodes: WorkflowNodeData[] = [];
  @Input() edges: WorkflowEdgeData[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() highlightNode = new EventEmitter<string>();

  messages = signal<ChatMessage[]>([]);
  typing = signal(false);
  showListMenu = signal(false);
  showLog = signal(false);
  executionLog = signal<{ step: number; nodeType: string; label: string; action: string }[]>([]);
  activeReplyMsgId = signal<string | null>(null);

  userInput = '';
  private stepCount = 0;
  private delayTimeout: any;

  state: PreviewState = {
    currentNodeId: null,
    variables: {},
    waitingForReply: false,
    buttonMap: {},
    completed: false,
    paused: false,
  };

  ngOnChanges(changes: SimpleChanges) {
    if (changes['nodes'] || changes['edges']) { this.restart(); }
  }

  restart() {
    clearTimeout(this.delayTimeout);
    this.messages.set([]);
    this.executionLog.set([]);
    this.typing.set(false);
    this.showListMenu.set(false);
    this.activeReplyMsgId.set(null);
    this.userInput = '';
    this.stepCount = 0;
    this.state = { currentNodeId: null, variables: { customer_name: 'Test User', customer_phone: '+1234567890' }, waitingForReply: false, buttonMap: {}, completed: false, paused: false };

    if (!this.nodes.length) {
      this.addSystemMessage('No nodes in this workflow. Add nodes to preview.');
      this.state.completed = true;
      return;
    }

    const triggerNode = this.nodes.find(n => n.type.startsWith('trigger_'));
    if (triggerNode) {
      this.addSystemMessage('Workflow started — trigger: ' + triggerNode.label);
      this.logStep(triggerNode, 'triggered');
      const edge = this.edges.find(e => e.from === triggerNode.id);
      if (edge) { this.executeNode(edge.to); }
      else { this.addSystemMessage('No node connected after trigger'); this.state.completed = true; }
    } else {
      const nodesWithIncoming = new Set(this.edges.map(e => e.to));
      const startNode = this.nodes.find(n => !nodesWithIncoming.has(n.id)) || this.nodes[0];
      this.addSystemMessage('Started from: ' + startNode.label);
      this.executeNode(startNode.id);
    }
  }

  private async executeNode(nodeId: string) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) { this.addSystemMessage('Node not found'); this.state.completed = true; return; }
    if (this.stepCount++ > 50) { this.addSystemMessage('Max steps reached (50)'); this.state.completed = true; return; }

    this.state.currentNodeId = nodeId;
    this.highlightNode.emit(nodeId);
    this.typing.set(true);
    await this.delay(500 + Math.random() * 500);
    this.typing.set(false);

    switch (node.type) {
      case 'send_text': this.handleSendText(node); break;
      case 'send_buttons': this.handleSendButtons(node); break;
      case 'send_list': this.handleSendList(node); break;
      case 'send_image': this.handleSendImage(node); break;
      case 'send_template': this.handleSendTemplate(node); break;
      case 'show_catalog': this.handleShowCatalog(node); break;
      case 'wait_for_reply': this.handleWaitForReply(node); break;
      case 'condition': this.handleCondition(node); break;
      case 'switch': this.handleSwitch(node); break;
      case 'delay': this.handleDelay(node); break;
      case 'tag_customer': this.handleAction(node, 'Tagged customer: ' + (node.config['tags'] || 'tag')); break;
      case 'update_order': this.handleAction(node, 'Order updated to: ' + (node.config['status'] || 'confirmed')); break;
      case 'assign_agent': this.handleAction(node, 'Assigned to agent'); break;
      case 'set_language': this.handleAction(node, 'Language: ' + (node.config['language'] || 'en')); break;
      case 'http_request': this.handleAction(node, 'HTTP ' + (node.config['method'] || 'GET') + ' ' + (node.config['url'] || '/api')); break;
      case 'add_to_cart': this.handleAction(node, 'Added to cart'); break;
      case 'view_cart': this.addBotMessage('Your cart:\n- Sample Product x1 — $10.00\n\nTotal: $10.00', 'text', node); this.logStep(node, 'sent'); this.followEdge(node.id); break;
      case 'checkout': this.handleAction(node, 'Checkout initiated'); break;
      case 'inventory_check': this.handleInventoryCheck(node); break;
      case 'search_products': this.handleAction(node, 'Searching products...'); break;
      case 'filter_products': this.handleAction(node, 'Filtering products...'); break;
      case 'payment_qr': this.addBotMessage('Please scan this QR code to pay.', 'text', node); this.logStep(node, 'sent'); this.followEdge(node.id); break;
      case 'fallback': this.addBotMessage(this.resolveTemplate(node.config['message'] || "Sorry, I didn't understand."), 'text', node); this.logStep(node, 'fallback'); this.followEdge(node.id); break;
      case 'start_workflow': this.addSystemMessage('Chain → ' + (node.config['workflowName'] || 'another workflow')); this.logStep(node, 'chain'); this.state.completed = true; break;
      case 'end': this.addSystemMessage('Workflow ended'); this.logStep(node, 'end'); this.state.completed = true; break;
      default: this.addSystemMessage(node.type + ': ' + node.label); this.logStep(node, 'skip'); this.followEdge(node.id); break;
    }
  }

  // ─── Node handlers ─────────────────────────────────────────────────────
  private handleSendText(node: WorkflowNodeData) {
    this.addBotMessage(this.resolveTemplate(node.config['text'] || node.config['message'] || 'Hello!'), 'text', node);
    this.logStep(node, 'sent');
    if (node.config['waitForReply']) { this.state.waitingForReply = true; this.activeReplyMsgId.set(null); }
    else { this.followEdge(node.id); }
  }

  private handleSendButtons(node: WorkflowNodeData) {
    const text = this.resolveTemplate(node.config['text'] || node.config['body'] || 'Please choose:');
    let buttonsRaw: any[] = node.config['buttons'] || [];
    // Handle buttons stored as newline-separated string
    if (typeof buttonsRaw === 'string') {
      buttonsRaw = (buttonsRaw as string).split('\n').map(s => s.trim()).filter(s => s);
    }
    const buttons = buttonsRaw.map((b: any, i: number) => ({ id: `btn_${i}`, title: typeof b === 'string' ? b : b.text || b.title || `Button ${i + 1}` }));
    const outEdges = this.edges.filter(e => e.from === node.id);
    this.state.buttonMap = {};
    for (const btn of buttons) {
      const matchEdge = outEdges.find(e => e.label?.toLowerCase() === btn.title.toLowerCase());
      if (matchEdge) this.state.buttonMap[btn.title.toLowerCase()] = matchEdge.to;
    }
    const msgId = this.addBotMessage(text, 'buttons', node, { buttons });
    this.activeReplyMsgId.set(msgId);
    this.state.waitingForReply = true;
    this.logStep(node, 'wait');
  }

  private handleSendList(node: WorkflowNodeData) {
    const text = this.resolveTemplate(node.config['body'] || node.config['text'] || 'Select an option:');
    const sections = node.config['sections'] || [{ title: 'Options', items: [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }] }];
    const outEdges = this.edges.filter(e => e.from === node.id);
    this.state.buttonMap = {};
    for (const s of sections) for (const item of s.items || []) {
      const e = outEdges.find(e => e.label?.toLowerCase() === (item.title || '').toLowerCase());
      if (e) this.state.buttonMap[(item.title || '').toLowerCase()] = e.to;
    }
    const msgId = this.addBotMessage(text, 'list', node, { listSections: sections });
    this.activeReplyMsgId.set(msgId);
    this.state.waitingForReply = true;
    this.logStep(node, 'wait');
  }

  private handleSendImage(node: WorkflowNodeData) {
    this.addBotMessage(this.resolveTemplate(node.config['caption'] || '') || 'Image', 'image', node, { imageUrl: node.config['url'] || '' });
    this.logStep(node, 'sent');
    this.followEdge(node.id);
  }

  private handleSendTemplate(node: WorkflowNodeData) {
    this.addBotMessage(`📋 Template: ${node.config['templateName'] || 'template'}\n${node.config['body'] || ''}`, 'template', node);
    this.logStep(node, 'sent');
    this.followEdge(node.id);
  }

  private handleShowCatalog(node: WorkflowNodeData) {
    this.addBotMessage(this.resolveTemplate(node.config['headerText'] || 'Browse our products:'), 'catalog', node);
    this.logStep(node, 'sent');
    this.followEdge(node.id);
  }

  private handleWaitForReply(node: WorkflowNodeData) {
    const prompt = node.config['prompt'] || node.config['text'];
    if (prompt) this.addBotMessage(this.resolveTemplate(prompt), 'text', node);
    this.state.waitingForReply = true;
    this.activeReplyMsgId.set(null);
    this.logStep(node, 'wait');
  }

  private handleCondition(node: WorkflowNodeData) {
    this.addSystemMessage(`Condition: ${node.config['variable'] || '?'} ${node.config['operator'] || '=='} ${node.config['value'] || '?'} → Yes`);
    this.logStep(node, 'eval');
    const outEdges = this.edges.filter(e => e.from === node.id);
    const yesEdge = outEdges.find(e => e.label?.toLowerCase() === 'yes') || outEdges[0];
    if (yesEdge) this.executeNode(yesEdge.to);
    else this.state.completed = true;
  }

  private handleSwitch(node: WorkflowNodeData) {
    this.addSystemMessage('Switch → first branch');
    this.logStep(node, 'eval');
    const outEdges = this.edges.filter(e => e.from === node.id);
    if (outEdges.length) this.executeNode(outEdges[0].to);
    else this.state.completed = true;
  }

  private handleDelay(node: WorkflowNodeData) {
    const amt = node.config['duration'] || node.config['delay'] || 5;
    const unit = node.config['unit'] || 'seconds';
    this.addBotMessage(`Waiting ${amt} ${unit}...`, 'delay', node);
    this.logStep(node, 'delay');
    this.state.paused = true;
    this.delayTimeout = setTimeout(() => { this.state.paused = false; this.addSystemMessage('Delay done'); this.followEdge(node.id); }, 2000);
  }

  private handleInventoryCheck(node: WorkflowNodeData) {
    this.addSystemMessage('Inventory: In stock');
    this.logStep(node, 'check');
    const outEdges = this.edges.filter(e => e.from === node.id);
    const e = outEdges.find(e => e.label?.toLowerCase().includes('in_stock') || e.label?.toLowerCase().includes('yes')) || outEdges[0];
    if (e) this.executeNode(e.to); else this.followEdge(node.id);
  }

  private handleAction(node: WorkflowNodeData, desc: string) {
    this.addSystemMessage(desc);
    this.logStep(node, 'action');
    this.followEdge(node.id);
  }

  // ─── Reply ─────────────────────────────────────────────────────────────
  sendButtonReply(btn: { id: string; title: string }, msg: ChatMessage) {
    if (!this.state.waitingForReply) return;
    this.state.waitingForReply = false; this.activeReplyMsgId.set(null); this.showListMenu.set(false);
    this.addUserMessage(btn.title);
    const next = this.state.buttonMap[btn.title.toLowerCase()];
    if (next) this.executeNode(next);
    else if (msg.nodeId) this.followEdge(msg.nodeId, btn.title);
  }

  sendListReply(item: { id: string; title: string }, msg: ChatMessage) {
    if (!this.state.waitingForReply) return;
    this.state.waitingForReply = false; this.activeReplyMsgId.set(null); this.showListMenu.set(false);
    this.addUserMessage(item.title);
    const next = this.state.buttonMap[item.title.toLowerCase()];
    if (next) this.executeNode(next);
    else if (msg.nodeId) this.followEdge(msg.nodeId, item.title);
  }

  sendTextReply() {
    if (!this.userInput.trim() || !this.state.waitingForReply) return;
    const text = this.userInput.trim(); this.userInput = '';
    this.state.waitingForReply = false; this.activeReplyMsgId.set(null);
    this.addUserMessage(text);
    this.state.variables['last_reply'] = text;
    if (this.state.currentNodeId) this.followEdge(this.state.currentNodeId, text);
  }

  skipDelay() {
    clearTimeout(this.delayTimeout); this.state.paused = false;
    this.addSystemMessage('Delay skipped');
    if (this.state.currentNodeId) this.followEdge(this.state.currentNodeId);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────
  private followEdge(fromId: string, replyText?: string) {
    const outEdges = this.edges.filter(e => e.from === fromId);
    if (!outEdges.length) { this.addSystemMessage('No outgoing connection — ended'); this.state.completed = true; return; }
    if (replyText) {
      const match = outEdges.find(e => e.label?.toLowerCase() === replyText.toLowerCase());
      if (match) { this.executeNode(match.to); return; }
      // No match — check for default (unlabeled) edge
      const defaultEdge = outEdges.find(e => !e.label);
      if (defaultEdge) { this.executeNode(defaultEdge.to); return; }
      // No default edge — look for a fallback node in the workflow
      const fallbackNode = this.nodes.find(n => n.type === 'fallback');
      if (fallbackNode) { this.addSystemMessage('No match — routing to fallback'); this.executeNode(fallbackNode.id); return; }
      // No fallback — re-show the same node (loop back)
      const fromNode = this.nodes.find(n => n.id === fromId);
      if (fromNode && (fromNode.type === 'send_buttons' || fromNode.type === 'send_list')) {
        this.addBotMessage("Sorry, that's not a valid option. Please choose from the options above.", 'text', fromNode);
        this.state.waitingForReply = true;
        this.activeReplyMsgId.set(null);
        return;
      }
    }
    // Default: follow first edge
    const defaultEdge = outEdges.find(e => !e.label) || outEdges[0];
    this.executeNode(defaultEdge.to);
  }

  private resolveTemplate(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, k) => this.state.variables[k] ?? `{{${k}}}`);
  }

  private addBotMessage(text: string, type: ChatMessage['type'], node: WorkflowNodeData, extra?: Partial<ChatMessage>): string {
    const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
    this.messages.update(m => [...m, { id, sender: 'bot', type, text, timestamp: new Date(), nodeId: node.id, nodeLabel: node.label, ...extra }]);
    this.scrollToBottom(); return id;
  }

  private addUserMessage(text: string) {
    this.messages.update(m => [...m, { id: 'msg_' + Date.now(), sender: 'user', type: 'text', text, timestamp: new Date() }]);
    this.scrollToBottom();
  }

  private addSystemMessage(text: string) {
    this.messages.update(m => [...m, { id: 'msg_' + Date.now() + '_s', sender: 'system', type: 'text', text, timestamp: new Date() }]);
    this.scrollToBottom();
  }

  private logStep(node: WorkflowNodeData, action: string) {
    this.executionLog.update(l => [...l, { step: l.length + 1, nodeType: node.type, label: node.label, action }]);
  }

  private delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

  private scrollToBottom() {
    setTimeout(() => { const el = document.getElementById('waPreviewChat'); if (el) el.scrollTop = el.scrollHeight; }, 60);
  }
}
