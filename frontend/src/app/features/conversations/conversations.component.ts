import { Component, OnInit, signal, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ConversationService } from '../../core/services/conversation.service';
import { Conversation, Message, ConversationStatus } from '../../core/models';

interface ConversationView {
  id: string;
  customer: string;
  phone: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: number;
  status: string;
  withinWindow: boolean;
  lastMessageAt: string;
}

interface MessageView {
  id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  status: string;
  time: string;
  type: string;
}

@Component({
  selector: 'wa-conversations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    AvatarModule,
    BadgeModule,
    TagModule,
    SelectModule,
    TooltipModule,
    DividerModule,
    IconFieldModule,
    InputIconModule,
  ],
  template: `
    <div class="flex h-full" style="height: calc(100vh - 65px)">

      <!-- Conversation list -->
      <div class="w-80 flex-shrink-0 flex flex-col bg-white border-r border-gray-200">

        <!-- List header -->
        <div class="px-4 py-3 border-b border-gray-100">
          <h2 class="text-base font-bold text-gray-900 mb-3">Conversations</h2>
          <div class="relative">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" style="font-size:0.85rem"></i>
            <input
              class="w-full pl-8 pr-3 py-2 bg-gray-100 rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-primary-400"
              [(ngModel)]="searchQuery"
              placeholder="Search conversations..."
              (input)="filterConversations()"
            />
          </div>
          <div class="flex gap-2 mt-2">
            @for (filter of statusFilters; track filter.value) {
              <button
                class="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                [class.bg-primary-500]="activeFilter() === filter.value"
                [class.text-white]="activeFilter() === filter.value"
                [class.bg-gray-100]="activeFilter() !== filter.value"
                [class.text-gray-600]="activeFilter() !== filter.value"
                (click)="activeFilter.set(filter.value); filterConversations()"
              >{{ filter.label }}</button>
            }
          </div>
        </div>

        <!-- Conversation items -->
        <div class="flex-1 overflow-y-auto">
          @if (loadingConversations()) {
            <div class="flex items-center justify-center py-12">
              <i class="pi pi-spin pi-spinner text-primary-500" style="font-size:1.5rem"></i>
            </div>
          }
          @for (conv of filteredConversations(); track conv.id) {
            <div
              class="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-gray-50"
              [class.bg-primary-50]="selectedConv()?.id === conv.id"
              [class.hover:bg-gray-50]="selectedConv()?.id !== conv.id"
              (click)="selectConversation(conv)"
            >
              <div class="relative flex-shrink-0">
                <div class="w-10 h-10 rounded-full bg-primary-200 flex items-center justify-center text-primary-800 font-bold text-sm">
                  {{ getInitials(conv.customer) }}
                </div>
                <div
                  class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                  [class.bg-green-500]="conv.withinWindow"
                  [class.bg-gray-300]="!conv.withinWindow"
                ></div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <p class="font-semibold text-gray-900 text-sm truncate">{{ conv.customer }}</p>
                  <span class="text-xs text-gray-400 flex-shrink-0">{{ conv.lastMessageTime }}</span>
                </div>
                <p class="text-xs text-gray-500 truncate mt-0.5">{{ conv.lastMessage }}</p>
                <div class="flex items-center justify-between mt-1">
                  <p-tag [value]="conv.status" [severity]="getConvSeverity(conv.status)" styleClass="text-xs capitalize" />
                  @if (conv.unread > 0) {
                    <span class="bg-primary-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {{ conv.unread }}
                    </span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Chat area -->
      @if (selectedConv()) {
        <div class="flex-1 flex flex-col">

          <!-- Chat header -->
          <div class="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
            <div class="w-9 h-9 rounded-full bg-primary-200 flex items-center justify-center text-primary-800 font-bold text-sm">
              {{ getInitials(selectedConv()!.customer) }}
            </div>
            <div class="flex-1">
              <p class="font-semibold text-gray-900">{{ selectedConv()!.customer }}</p>
              <p class="text-xs text-gray-500">{{ selectedConv()!.phone }}</p>
            </div>
            <div class="flex items-center gap-2">
              @if (selectedConv()!.withinWindow) {
                <span class="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  Within 24h window
                </span>
              } @else {
                <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Window expired</span>
              }
              <button pButton icon="pi pi-phone" class="p-button-text p-button-sm p-button-rounded" pTooltip="Call customer"></button>
              <button pButton icon="pi pi-tag" class="p-button-text p-button-sm p-button-rounded" pTooltip="Add tag"></button>
              <button pButton icon="pi pi-check-circle" class="p-button-text p-button-sm p-button-rounded" pTooltip="Resolve" severity="success"></button>
              <button pButton icon="pi pi-ellipsis-v" class="p-button-text p-button-sm p-button-rounded" pTooltip="More options"></button>
            </div>
          </div>

          <!-- Messages area -->
          <div
            #messagesContainer
            class="flex-1 overflow-y-auto px-5 py-4 space-y-3"
            style="background: #efeae2 url('data:image/svg+xml,...');"
          >
            @if (loadingMessages()) {
              <div class="flex items-center justify-center py-12">
                <i class="pi pi-spin pi-spinner text-primary-500" style="font-size:1.5rem"></i>
              </div>
            }
            @for (msg of messages(); track msg.id) {
              <div
                class="flex"
                [class.justify-end]="msg.direction === 'outbound'"
              >
                <div
                  class="max-w-xs lg:max-w-md rounded-xl px-4 py-2.5 shadow-sm"
                  [class.rounded-br-sm]="msg.direction === 'outbound'"
                  [class.rounded-bl-sm]="msg.direction === 'inbound'"
                  [class.bg-white]="msg.direction === 'inbound'"
                  [class.bg-primary-100]="msg.direction === 'outbound'"
                >
                  <p class="text-sm text-gray-800 whitespace-pre-wrap break-words">{{ msg.content }}</p>
                  <div class="flex items-center justify-end gap-1 mt-1">
                    <span class="text-xs text-gray-400">{{ msg.time }}</span>
                    @if (msg.direction === 'outbound') {
                      @if (msg.status === 'read') {
                        <span class="text-xs text-blue-500">✓✓</span>
                      } @else if (msg.status === 'delivered') {
                        <span class="text-xs text-gray-400">✓✓</span>
                      } @else {
                        <span class="text-xs text-gray-400">✓</span>
                      }
                    }
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- Message input -->
          @if (selectedConv()!.withinWindow) {
            <div class="bg-white border-t border-gray-200 px-4 py-3">
              <div class="flex items-end gap-3">
                <div class="flex gap-2">
                  <button pButton icon="pi pi-paperclip" class="p-button-text p-button-rounded p-button-sm text-gray-500" pTooltip="Attach file"></button>
                  <button pButton icon="pi pi-image" class="p-button-text p-button-rounded p-button-sm text-gray-500" pTooltip="Send image"></button>
                </div>
                <div class="flex-1 relative">
                  <textarea
                    class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-primary-400 transition-colors max-h-36"
                    [(ngModel)]="messageInput"
                    placeholder="Type a message..."
                    rows="1"
                    (keydown.enter)="sendMessage($event)"
                    (input)="autoResize($event)"
                  ></textarea>
                </div>
                <button
                  pButton
                  [icon]="messageInput.trim() ? 'pi pi-send' : 'pi pi-microphone'"
                  class="p-button-rounded"
                  severity="success"
                  [disabled]="!messageInput.trim() || sending()"
                  (click)="sendMessage(null)"
                ></button>
              </div>
              <div class="flex gap-2 mt-2">
                @for (quick of quickReplies; track quick) {
                  <button
                    class="text-xs bg-gray-100 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200 border border-gray-200 px-3 py-1 rounded-full text-gray-600 transition-colors"
                    (click)="messageInput = quick"
                  >{{ quick }}</button>
                }
              </div>
            </div>
          } @else {
            <div class="bg-white border-t border-gray-200 px-4 py-4 text-center">
              <p class="text-sm text-gray-500 mb-2">The 24-hour messaging window has expired.</p>
              <button pButton label="Send Template Message" icon="pi pi-send" class="p-button-outlined p-button-sm" severity="success"></button>
            </div>
          }
        </div>
      } @else {
        <!-- No conversation selected -->
        <div class="flex-1 flex items-center justify-center bg-gray-50">
          <div class="text-center">
            <div class="w-24 h-24 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <i class="pi pi-comments text-primary-400" style="font-size:3rem"></i>
            </div>
            <h3 class="text-xl font-semibold text-gray-700">Select a conversation</h3>
            <p class="text-gray-400 mt-1">Choose a conversation from the left to start messaging</p>
          </div>
        </div>
      }
    </div>
  `,
})
export class ConversationsComponent implements OnInit {
  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;

  private readonly conversationService = inject(ConversationService);

  searchQuery = '';
  activeFilter = signal('all');
  selectedConv = signal<ConversationView | null>(null);
  filteredConversations = signal<ConversationView[]>([]);
  messages = signal<MessageView[]>([]);
  loadingConversations = signal(false);
  loadingMessages = signal(false);
  sending = signal(false);
  messageInput = '';

  private allConversations: ConversationView[] = [];

  statusFilters = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
    { label: 'Pending', value: 'pending' },
    { label: 'Resolved', value: 'resolved' },
  ];

  quickReplies = ['Thank you!', 'I\'ll check and get back to you.', 'Your order is on its way!', 'Please share your payment proof.'];

  ngOnInit() {
    this.loadConversations();
  }

  loadConversations() {
    this.loadingConversations.set(true);
    const params: any = { page: 1, limit: 20 };
    if (this.activeFilter() !== 'all') {
      params.status = this.activeFilter() as ConversationStatus;
    }
    if (this.searchQuery) {
      params.search = this.searchQuery;
    }

    this.conversationService.getAll(params).subscribe({
      next: (res) => {
        this.allConversations = res.data.map(c => this.mapConversation(c));
        this.applyLocalFilter();
        this.loadingConversations.set(false);
      },
      error: () => {
        this.loadingConversations.set(false);
      },
    });
  }

  private mapConversation(c: Conversation): ConversationView {
    const customerName = this.buildCustomerName(c);
    const phone = c.customer?.whatsappPhone ?? '';
    const lastMessageAt = c.lastMessageAt ?? c.createdAt;
    const withinWindow = this.isWithin24Hours(lastMessageAt);

    return {
      id: c.id,
      customer: customerName,
      phone,
      lastMessage: c.lastMessagePreview ?? '',
      lastMessageTime: this.formatRelativeTime(lastMessageAt),
      unread: c.unreadCount ?? 0,
      status: c.status,
      withinWindow,
      lastMessageAt,
    };
  }

  private buildCustomerName(c: Conversation): string {
    if (c.customer?.firstName || c.customer?.lastName) {
      return [c.customer.firstName, c.customer.lastName].filter(Boolean).join(' ');
    }
    if (c.customer?.whatsappName) {
      return c.customer.whatsappName;
    }
    return c.customer?.whatsappPhone ?? 'Unknown';
  }

  private isWithin24Hours(dateStr: string): boolean {
    if (!dateStr) return false;
    const diff = Date.now() - new Date(dateStr).getTime();
    return diff < 24 * 60 * 60 * 1000;
  }

  private formatRelativeTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }

  filterConversations() {
    this.loadConversations();
  }

  private applyLocalFilter() {
    let result = [...this.allConversations];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(c => c.customer.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q));
    }
    if (this.activeFilter() !== 'all') {
      result = result.filter(c => c.status === this.activeFilter());
    }
    this.filteredConversations.set(result);
  }

  selectConversation(conv: ConversationView) {
    this.selectedConv.set(conv);
    this.loadMessages(conv.id);

    // Mark as read on the server
    if (conv.unread > 0) {
      conv.unread = 0;
      this.conversationService.markAsRead(conv.id).subscribe();
      this.applyLocalFilter();
    }
  }

  private loadMessages(conversationId: string) {
    this.loadingMessages.set(true);
    this.messages.set([]);

    this.conversationService.getMessages(conversationId, { page: 1, limit: 50 }).subscribe({
      next: (res) => {
        const mapped = res.data.map(m => this.mapMessage(m));
        this.messages.set(mapped);
        this.loadingMessages.set(false);
        setTimeout(() => this.scrollToBottom(), 50);
      },
      error: () => {
        this.loadingMessages.set(false);
      },
    });
  }

  private mapMessage(m: Message): MessageView {
    return {
      id: m.id,
      content: this.extractContent(m),
      direction: m.direction as 'inbound' | 'outbound',
      status: m.status,
      time: this.formatMessageTime(m.createdAt),
      type: m.type,
    };
  }

  private extractContent(m: Message): string {
    const c = m.content as any;
    if (!c) return '';
    if (typeof c === 'string') return c;
    // text messages: { body: "..." }
    if (c.body) return typeof c.body === 'string' ? c.body : c.body?.text ?? '';
    // interactive replies (keys may be camelCase after transform interceptor)
    if (c.buttonReply) return c.buttonReply.title ?? c.buttonReply.id ?? '';
    if (c.button_reply) return c.button_reply.title ?? c.button_reply.id ?? '';
    if (c.listReply) return c.listReply.title ?? c.listReply.description ?? '';
    if (c.list_reply) return c.list_reply.title ?? c.list_reply.description ?? '';
    // media
    if (c.caption) return c.caption;
    if (c.mimeType || c.mime_type) return `[${m.type}]`;
    // template
    if (c.name || c.templateName || c.template_name) return `[Template: ${c.name || c.templateName || c.template_name}]`;
    // fallback
    return JSON.stringify(c);
  }

  private formatMessageTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) {
      return timeStr;
    } else if (diffDays === 1) {
      return `Yesterday ${timeStr}`;
    } else {
      return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`;
    }
  }

  sendMessage(event: Event | null) {
    if (event && (event as KeyboardEvent).shiftKey) return;
    if (event) event.preventDefault();

    const text = this.messageInput.trim();
    if (!text) return;

    const conv = this.selectedConv();
    if (!conv) return;

    this.sending.set(true);

    // Optimistically add the message to the UI
    const optimisticMsg: MessageView = {
      id: 'temp-' + Date.now(),
      content: text,
      direction: 'outbound',
      status: 'sending',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
    };

    this.messages.update(msgs => [...msgs, optimisticMsg]);
    this.messageInput = '';
    setTimeout(() => this.scrollToBottom(), 50);

    this.conversationService.sendMessage(conv.id, { type: 'text', content: text }).subscribe({
      next: (sentMsg) => {
        // Replace optimistic message with real one
        this.messages.update(msgs =>
          msgs.map(m => m.id === optimisticMsg.id ? this.mapMessage(sentMsg) : m)
        );
        // Update conversation preview
        conv.lastMessage = text;
        conv.lastMessageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.selectedConv.set({ ...conv });
        this.sending.set(false);
      },
      error: () => {
        // Mark optimistic message as failed
        this.messages.update(msgs =>
          msgs.map(m => m.id === optimisticMsg.id ? { ...m, status: 'failed' } : m)
        );
        this.sending.set(false);
      },
    });
  }

  private scrollToBottom() {
    const el = this.messagesContainer?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  autoResize(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 144) + 'px';
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  getConvSeverity(status: string): any {
    const map: Record<string, any> = { open: 'success', pending: 'warn', resolved: 'secondary', bot_handling: 'info' };
    return map[status] ?? 'secondary';
  }
}
