import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export type AgentChatEventType =
  | 'message.created'
  | 'ai.progress'
  | 'confirm.resolved'
  | 'peer.activity';

export type AgentChatEvent = {
  type: AgentChatEventType;
  conversation_id: string;
  at: string;
  actor_user_id?: string;
  payload: Record<string, unknown>;
};

/**
 * In-process fanout for conversation SSE.
 * Multi-instance: replace with Redis pub/sub later (same event shape).
 */
@Injectable()
export class AgentChatEventsService {
  private readonly bus = new EventEmitter();

  constructor() {
    this.bus.setMaxListeners(200);
  }

  publish(event: AgentChatEvent): void {
    this.bus.emit(event.conversation_id, event);
    this.bus.emit('*', event);
  }

  subscribe(conversationId: string, handler: (e: AgentChatEvent) => void): () => void {
    this.bus.on(conversationId, handler);
    return () => this.bus.off(conversationId, handler);
  }
}
