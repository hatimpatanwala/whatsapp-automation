import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import {
  Conversation,
  ConversationStatus,
  Message,
  MessageType,
  PaginatedResponse,
} from '../models';

export interface ConversationListParams extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ConversationStatus;
  assignedTo?: string;
  customerId?: string;
  hasUnread?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface MessageListParams extends QueryParams {
  page?: number;
  limit?: number;
  before?: string;          // cursor-based: messages before this message ID
  after?: string;           // cursor-based: messages after this message ID
}

export interface SendMessagePayload {
  type: MessageType;
  content?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  replyToMessageId?: string;
  buttons?: Array<{ type: 'reply' | 'url' | 'phone'; text: string; value: string }>;
}

export interface ConversationStats {
  totalConversations: number;
  openConversations: number;
  pendingConversations: number;
  resolvedToday: number;
  averageFirstResponseMinutes: number;
  averageResolutionMinutes: number;
  unassigned: number;
}

@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly api = inject(ApiService);

  // ─── Conversations ─────────────────────────────────────────────────────────

  getAll(params?: ConversationListParams): Observable<PaginatedResponse<Conversation>> {
    return this.api.get<PaginatedResponse<Conversation>>('/conversations', params);
  }

  getById(id: string): Observable<Conversation> {
    return this.api.get<Conversation>(`/conversations/${id}`);
  }

  getByCustomer(customerId: string, params?: QueryParams): Observable<PaginatedResponse<Conversation>> {
    return this.api.get<PaginatedResponse<Conversation>>(
      `/customers/${customerId}/conversations`,
      params,
    );
  }

  /**
   * Assign a conversation to a team member.
   */
  assign(id: string, userId: string): Observable<Conversation> {
    return this.api.post<Conversation>(`/conversations/${id}/assign`, { userId });
  }

  /**
   * Unassign a conversation (put it back in the queue).
   */
  unassign(id: string): Observable<Conversation> {
    return this.api.post<Conversation>(`/conversations/${id}/unassign`, {});
  }

  /**
   * Resolve / close a conversation.
   */
  resolve(id: string): Observable<Conversation> {
    return this.api.post<Conversation>(`/conversations/${id}/resolve`, {});
  }

  /**
   * Reopen a resolved conversation.
   */
  reopen(id: string): Observable<Conversation> {
    return this.api.post<Conversation>(`/conversations/${id}/reopen`, {});
  }

  addTags(id: string, tags: string[]): Observable<Conversation> {
    return this.api.post<Conversation>(`/conversations/${id}/tags`, { tags });
  }

  markAsRead(id: string): Observable<void> {
    return this.api.post<void>(`/conversations/${id}/read`, {});
  }

  getStats(): Observable<ConversationStats> {
    return this.api.get<ConversationStats>('/conversations/stats');
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  getMessages(conversationId: string, params?: MessageListParams): Observable<PaginatedResponse<Message>> {
    return this.api.get<PaginatedResponse<Message>>(
      `/conversations/${conversationId}/messages`,
      params,
    );
  }

  /**
   * Send a message in a conversation.
   */
  sendMessage(conversationId: string, payload: SendMessagePayload): Observable<Message> {
    return this.api.post<Message>(`/conversations/${conversationId}/messages`, payload);
  }

  /**
   * Upload a media file and get back a media URL to use in a message.
   */
  uploadMedia(conversationId: string, file: FormData): Observable<{ mediaUrl: string; mediaType: string }> {
    return this.api.http.post<{ mediaUrl: string; mediaType: string }>(
      this.api.url(`/conversations/${conversationId}/media`),
      file,
    );
  }

  /**
   * Send a WhatsApp template message (required outside the 24-hour service window).
   */
  sendTemplate(
    conversationId: string,
    templateName: string,
    params?: Record<string, string>,
  ): Observable<Message> {
    return this.sendMessage(conversationId, {
      type: 'template',
      templateName,
      templateParams: params,
    });
  }
}
