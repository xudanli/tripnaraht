/**
 * Decision OS WebSocket 网关
 * 
 * 提供:
 * - 实时决策状态更新
 * - 学习进度推送
 * - 指标实时流
 * - 客户端订阅管理
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';

// ========== 类型定义 ==========

export interface WebSocketClient {
  id: string;
  userId?: string;
  subscriptions: Set<string>;
  lastActivity: Date;
  metadata?: Record<string, unknown>;
}

export interface WebSocketMessage<T = unknown> {
  type: MessageType;
  channel: string;
  payload: T;
  timestamp: string;
  messageId: string;
}

export enum MessageType {
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  PUBLISH = 'publish',
  ACK = 'ack',
  ERROR = 'error',
  PING = 'ping',
  PONG = 'pong',
}

export interface SubscribeRequest {
  channels: string[];
}

export interface UnsubscribeRequest {
  channels: string[];
}

export interface PublishRequest<T = unknown> {
  channel: string;
  data: T;
}

export interface DecisionUpdatePayload {
  requestId: string;
  phase: string;
  progress: number;
  action?: string;
  utility?: number;
  confidence?: number;
}

export interface LearningProgressPayload {
  iteration: number;
  totalIterations: number;
  loss: number;
  accuracy: number;
  phase: 'training' | 'validation' | 'complete';
}

export interface MetricsStreamPayload {
  timestamp: string;
  metrics: {
    name: string;
    value: number;
    labels?: Record<string, string>;
  }[];
}

export interface SystemStatusPayload {
  health: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  activeConnections: number;
  pendingDecisions: number;
  lastUpdate: string;
}

// ========== 预定义频道 ==========

export const DecisionOSChannels = {
  DECISION_UPDATES: 'decision:updates',
  DECISION_COMPLETED: 'decision:completed',
  LEARNING_PROGRESS: 'learning:progress',
  METRICS_STREAM: 'metrics:stream',
  SYSTEM_STATUS: 'system:status',
  DSO_SNAPSHOTS: 'dso:snapshots',
  ERRORS: 'errors',
} as const;

// ========== WebSocket 管理器 ==========

@Injectable()
export class WebSocketManager implements OnModuleDestroy {
  private readonly logger = new Logger(WebSocketManager.name);
  private readonly clients = new Map<string, WebSocketClient>();
  private readonly channelSubscribers = new Map<string, Set<string>>();
  private readonly emitter = new EventEmitter();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly options: {
      heartbeatIntervalMs?: number;
      clientTimeoutMs?: number;
      maxClientsPerChannel?: number;
    } = {},
  ) {
    this.options = {
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30000,
      clientTimeoutMs: options.clientTimeoutMs ?? 120000,
      maxClientsPerChannel: options.maxClientsPerChannel ?? 1000,
    };

    this.startCleanupTimer();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.emitter.removeAllListeners();
    this.clients.clear();
    this.channelSubscribers.clear();
  }

  registerClient(clientId: string, userId?: string): WebSocketClient {
    const client: WebSocketClient = {
      id: clientId,
      userId,
      subscriptions: new Set(),
      lastActivity: new Date(),
    };

    this.clients.set(clientId, client);
    this.logger.log(`[WebSocket] Client registered: ${clientId}`);

    return client;
  }

  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    for (const channel of client.subscriptions) {
      this.unsubscribe(clientId, channel);
    }

    this.clients.delete(clientId);
    this.logger.log(`[WebSocket] Client unregistered: ${clientId}`);
  }

  subscribe(clientId: string, channel: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      this.logger.warn(`[WebSocket] Unknown client: ${clientId}`);
      return false;
    }

    let subscribers = this.channelSubscribers.get(channel);
    if (!subscribers) {
      subscribers = new Set();
      this.channelSubscribers.set(channel, subscribers);
    }

    if (subscribers.size >= this.options.maxClientsPerChannel!) {
      this.logger.warn(`[WebSocket] Channel ${channel} at capacity`);
      return false;
    }

    subscribers.add(clientId);
    client.subscriptions.add(channel);
    client.lastActivity = new Date();

    this.logger.debug(`[WebSocket] Client ${clientId} subscribed to ${channel}`);
    return true;
  }

  unsubscribe(clientId: string, channel: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    const subscribers = this.channelSubscribers.get(channel);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }

    client.subscriptions.delete(channel);
    client.lastActivity = new Date();

    return true;
  }

  publish<T>(channel: string, payload: T): number {
    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers || subscribers.size === 0) {
      return 0;
    }

    const message: WebSocketMessage<T> = {
      type: MessageType.PUBLISH,
      channel,
      payload,
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
    };

    this.emitter.emit('message', message, Array.from(subscribers));

    return subscribers.size;
  }

  broadcast<T>(payload: T, excludeClientIds?: string[]): number {
    const excludeSet = new Set(excludeClientIds ?? []);
    let count = 0;

    const message: WebSocketMessage<T> = {
      type: MessageType.PUBLISH,
      channel: '*',
      payload,
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
    };

    const recipients: string[] = [];
    for (const clientId of this.clients.keys()) {
      if (!excludeSet.has(clientId)) {
        recipients.push(clientId);
        count++;
      }
    }

    if (recipients.length > 0) {
      this.emitter.emit('message', message, recipients);
    }

    return count;
  }

  onMessage(callback: (message: WebSocketMessage, clientIds: string[]) => void): void {
    this.emitter.on('message', callback);
  }

  getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  getChannelSubscribers(channel: string): string[] {
    return Array.from(this.channelSubscribers.get(channel) ?? []);
  }

  getStats(): {
    totalClients: number;
    totalChannels: number;
    channelStats: Map<string, number>;
  } {
    const channelStats = new Map<string, number>();
    for (const [channel, subscribers] of this.channelSubscribers) {
      channelStats.set(channel, subscribers.size);
    }

    return {
      totalClients: this.clients.size,
      totalChannels: this.channelSubscribers.size,
      channelStats,
    };
  }

  heartbeat(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.lastActivity = new Date();
    return true;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveClients();
    }, this.options.heartbeatIntervalMs!);
  }

  private cleanupInactiveClients(): void {
    const now = Date.now();
    const timeout = this.options.clientTimeoutMs!;

    for (const [clientId, client] of this.clients) {
      if (now - client.lastActivity.getTime() > timeout) {
        this.logger.debug(`[WebSocket] Removing inactive client: ${clientId}`);
        this.unregisterClient(clientId);
      }
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ========== Decision OS WebSocket 服务 ==========

@Injectable()
export class DecisionWebSocketService {
  private readonly logger = new Logger(DecisionWebSocketService.name);

  constructor(private readonly manager: WebSocketManager) {}

  publishDecisionUpdate(update: DecisionUpdatePayload): number {
    return this.manager.publish(DecisionOSChannels.DECISION_UPDATES, update);
  }

  publishDecisionCompleted(result: {
    requestId: string;
    action: string;
    utility: number;
    durationMs: number;
  }): number {
    return this.manager.publish(DecisionOSChannels.DECISION_COMPLETED, result);
  }

  publishLearningProgress(progress: LearningProgressPayload): number {
    return this.manager.publish(DecisionOSChannels.LEARNING_PROGRESS, progress);
  }

  publishMetrics(metrics: MetricsStreamPayload): number {
    return this.manager.publish(DecisionOSChannels.METRICS_STREAM, metrics);
  }

  publishSystemStatus(status: SystemStatusPayload): number {
    return this.manager.publish(DecisionOSChannels.SYSTEM_STATUS, status);
  }

  publishDSOSnapshot(snapshot: {
    requestId: string;
    version: number;
    phase: string;
    confidence: number;
  }): number {
    return this.manager.publish(DecisionOSChannels.DSO_SNAPSHOTS, snapshot);
  }

  publishError(error: {
    code: string;
    message: string;
    requestId?: string;
  }): number {
    return this.manager.publish(DecisionOSChannels.ERRORS, error);
  }

  subscribeToDecisionUpdates(clientId: string): boolean {
    return this.manager.subscribe(clientId, DecisionOSChannels.DECISION_UPDATES);
  }

  subscribeToLearningProgress(clientId: string): boolean {
    return this.manager.subscribe(clientId, DecisionOSChannels.LEARNING_PROGRESS);
  }

  subscribeToMetrics(clientId: string): boolean {
    return this.manager.subscribe(clientId, DecisionOSChannels.METRICS_STREAM);
  }

  subscribeToSystemStatus(clientId: string): boolean {
    return this.manager.subscribe(clientId, DecisionOSChannels.SYSTEM_STATUS);
  }

  getChannelStats(): Record<string, number> {
    const stats = this.manager.getStats();
    const result: Record<string, number> = {};
    for (const [channel, count] of stats.channelStats) {
      result[channel] = count;
    }
    return result;
  }
}
