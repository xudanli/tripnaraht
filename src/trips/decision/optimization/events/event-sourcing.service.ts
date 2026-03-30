/**
 * Decision OS 事件溯源服务
 * 
 * 提供:
 * - 事件存储和检索
 * - 状态重建
 * - 事件回放
 * - 快照优化
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionEventType } from './decision-events';

// ========== 类型定义 ==========

export interface StoredEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: DecisionEventType;
  eventData: Record<string, unknown>;
  metadata: EventMetadata;
  version: number;
  timestamp: string;
}

export interface EventMetadata {
  userId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  traceId?: string;
}

export interface Snapshot<T = unknown> {
  aggregateId: string;
  aggregateType: string;
  version: number;
  state: T;
  timestamp: string;
}

export interface EventStreamFilter {
  aggregateId?: string;
  aggregateType?: string;
  eventTypes?: DecisionEventType[];
  fromVersion?: number;
  toVersion?: number;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  limit?: number;
}

export interface ReplayOptions {
  fromVersion?: number;
  toVersion?: number;
  onEvent?: (event: StoredEvent, state: unknown) => void;
}

export interface EventStoreStats {
  totalEvents: number;
  totalAggregates: number;
  totalSnapshots: number;
  oldestEvent?: string;
  newestEvent?: string;
}

// ========== 事件存储接口 ==========

export interface EventStore {
  append(events: StoredEvent[]): Promise<void>;
  getEvents(filter: EventStreamFilter): Promise<StoredEvent[]>;
  getLatestVersion(aggregateId: string): Promise<number>;
  saveSnapshot<T>(snapshot: Snapshot<T>): Promise<void>;
  getSnapshot<T>(aggregateId: string): Promise<Snapshot<T> | null>;
  getStats(): Promise<EventStoreStats>;
}

// ========== 内存事件存储 ==========

export class InMemoryEventStore implements EventStore {
  private readonly events: StoredEvent[] = [];
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly versionCache = new Map<string, number>();

  async append(events: StoredEvent[]): Promise<void> {
    for (const event of events) {
      const currentVersion = this.versionCache.get(event.aggregateId) ?? 0;
      if (event.version !== currentVersion + 1) {
        throw new Error(
          `Concurrency conflict: expected version ${currentVersion + 1}, got ${event.version}`,
        );
      }
      this.events.push(event);
      this.versionCache.set(event.aggregateId, event.version);
    }
  }

  async getEvents(filter: EventStreamFilter): Promise<StoredEvent[]> {
    let results = [...this.events];

    if (filter.aggregateId) {
      results = results.filter(e => e.aggregateId === filter.aggregateId);
    }
    if (filter.aggregateType) {
      results = results.filter(e => e.aggregateType === filter.aggregateType);
    }
    if (filter.eventTypes?.length) {
      results = results.filter(e => filter.eventTypes!.includes(e.eventType));
    }
    if (filter.fromVersion !== undefined) {
      results = results.filter(e => e.version >= filter.fromVersion!);
    }
    if (filter.toVersion !== undefined) {
      results = results.filter(e => e.version <= filter.toVersion!);
    }
    if (filter.fromTimestamp) {
      results = results.filter(e => new Date(e.timestamp) >= filter.fromTimestamp!);
    }
    if (filter.toTimestamp) {
      results = results.filter(e => new Date(e.timestamp) <= filter.toTimestamp!);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async getLatestVersion(aggregateId: string): Promise<number> {
    return this.versionCache.get(aggregateId) ?? 0;
  }

  async saveSnapshot<T>(snapshot: Snapshot<T>): Promise<void> {
    this.snapshots.set(snapshot.aggregateId, snapshot);
  }

  async getSnapshot<T>(aggregateId: string): Promise<Snapshot<T> | null> {
    return (this.snapshots.get(aggregateId) as Snapshot<T>) ?? null;
  }

  async getStats(): Promise<EventStoreStats> {
    const aggregateIds = new Set(this.events.map(e => e.aggregateId));
    const timestamps = this.events.map(e => e.timestamp).sort();

    return {
      totalEvents: this.events.length,
      totalAggregates: aggregateIds.size,
      totalSnapshots: this.snapshots.size,
      oldestEvent: timestamps[0],
      newestEvent: timestamps[timestamps.length - 1],
    };
  }

  clear(): void {
    this.events.length = 0;
    this.snapshots.clear();
    this.versionCache.clear();
  }
}

// ========== 聚合根基类 ==========

export abstract class AggregateRoot<TState = unknown> {
  protected state: TState;
  protected version = 0;
  protected uncommittedEvents: StoredEvent[] = [];

  constructor(
    public readonly aggregateId: string,
    public readonly aggregateType: string,
    initialState: TState,
  ) {
    this.state = initialState;
  }

  getState(): TState {
    return this.state;
  }

  getVersion(): number {
    return this.version;
  }

  getUncommittedEvents(): StoredEvent[] {
    return [...this.uncommittedEvents];
  }

  clearUncommittedEvents(): void {
    this.uncommittedEvents = [];
  }

  protected applyEvent(event: StoredEvent): void {
    this.state = this.evolve(this.state, event);
    this.version = event.version;
  }

  protected recordEvent(
    eventType: DecisionEventType,
    eventData: Record<string, unknown>,
    metadata: EventMetadata = {},
  ): void {
    const event: StoredEvent = {
      id: this.generateEventId(),
      aggregateId: this.aggregateId,
      aggregateType: this.aggregateType,
      eventType,
      eventData,
      metadata,
      version: this.version + 1,
      timestamp: new Date().toISOString(),
    };

    this.uncommittedEvents.push(event);
    this.applyEvent(event);
  }

  loadFromHistory(events: StoredEvent[]): void {
    for (const event of events) {
      this.applyEvent(event);
    }
  }

  loadFromSnapshot(snapshot: Snapshot<TState>): void {
    this.state = snapshot.state;
    this.version = snapshot.version;
  }

  protected abstract evolve(state: TState, event: StoredEvent): TState;

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

// ========== 事件溯源服务 ==========

@Injectable()
export class EventSourcingService {
  private readonly logger = new Logger(EventSourcingService.name);
  private readonly store: EventStore;
  private readonly snapshotInterval: number;

  constructor(
    store?: EventStore,
    options?: { snapshotInterval?: number },
  ) {
    this.store = store ?? new InMemoryEventStore();
    this.snapshotInterval = options?.snapshotInterval ?? 100;
  }

  async save<T>(aggregate: AggregateRoot<T>): Promise<void> {
    const events = aggregate.getUncommittedEvents();
    if (events.length === 0) return;

    await this.store.append(events);
    aggregate.clearUncommittedEvents();

    if (aggregate.getVersion() % this.snapshotInterval === 0) {
      await this.saveSnapshot(aggregate);
    }

    this.logger.debug(
      `[EventSourcing] Saved ${events.length} events for ${aggregate.aggregateType}:${aggregate.aggregateId}`,
    );
  }

  async load<T, A extends AggregateRoot<T>>(
    aggregateId: string,
    aggregateType: string,
    factory: (id: string) => A,
  ): Promise<A> {
    const aggregate = factory(aggregateId);

    const snapshot = await this.store.getSnapshot<T>(aggregateId);
    if (snapshot) {
      aggregate.loadFromSnapshot(snapshot);
    }

    const fromVersion = snapshot ? snapshot.version + 1 : 1;
    const events = await this.store.getEvents({
      aggregateId,
      aggregateType,
      fromVersion,
    });

    aggregate.loadFromHistory(events);

    this.logger.debug(
      `[EventSourcing] Loaded ${aggregate.aggregateType}:${aggregateId} at version ${aggregate.getVersion()}`,
    );

    return aggregate;
  }

  async replay<T, A extends AggregateRoot<T>>(
    aggregateId: string,
    aggregateType: string,
    factory: (id: string) => A,
    options?: ReplayOptions,
  ): Promise<A> {
    const aggregate = factory(aggregateId);

    const events = await this.store.getEvents({
      aggregateId,
      aggregateType,
      fromVersion: options?.fromVersion ?? 1,
      toVersion: options?.toVersion,
    });

    for (const event of events) {
      aggregate.loadFromHistory([event]);
      options?.onEvent?.(event, aggregate.getState());
    }

    return aggregate;
  }

  async getEventStream(filter: EventStreamFilter): Promise<StoredEvent[]> {
    return this.store.getEvents(filter);
  }

  async rebuildState<T, A extends AggregateRoot<T>>(
    aggregateId: string,
    aggregateType: string,
    factory: (id: string) => A,
    targetVersion?: number,
  ): Promise<T> {
    const aggregate = await this.replay(aggregateId, aggregateType, factory, {
      toVersion: targetVersion,
    });

    return aggregate.getState();
  }

  async getStats(): Promise<EventStoreStats> {
    return this.store.getStats();
  }

  private async saveSnapshot<T>(aggregate: AggregateRoot<T>): Promise<void> {
    const snapshot: Snapshot<T> = {
      aggregateId: aggregate.aggregateId,
      aggregateType: aggregate.aggregateType,
      version: aggregate.getVersion(),
      state: aggregate.getState(),
      timestamp: new Date().toISOString(),
    };

    await this.store.saveSnapshot(snapshot);

    this.logger.debug(
      `[EventSourcing] Saved snapshot for ${aggregate.aggregateType}:${aggregate.aggregateId} at version ${snapshot.version}`,
    );
  }
}

// ========== Decision 聚合示例 ==========

export interface DecisionAggregateState {
  requestId: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  action?: string;
  utility?: number;
  feedbackReceived: boolean;
  feedbackScore?: number;
  history: Array<{ action: string; timestamp: string }>;
}

export class DecisionAggregate extends AggregateRoot<DecisionAggregateState> {
  constructor(requestId: string) {
    super(requestId, 'Decision', {
      requestId,
      userId: '',
      status: 'pending',
      feedbackReceived: false,
      history: [],
    });
  }

  startDecision(userId: string, metadata?: EventMetadata): void {
    this.recordEvent(
      DecisionEventType.DECISION_STARTED,
      { userId },
      metadata,
    );
  }

  completeDecision(action: string, utility: number, metadata?: EventMetadata): void {
    this.recordEvent(
      DecisionEventType.DECISION_COMPLETED,
      { action, utility },
      metadata,
    );
  }

  failDecision(error: string, metadata?: EventMetadata): void {
    this.recordEvent(
      DecisionEventType.DECISION_FAILED,
      { error },
      metadata,
    );
  }

  receiveFeedback(score: number, metadata?: EventMetadata): void {
    this.recordEvent(
      DecisionEventType.FEEDBACK_RECEIVED,
      { satisfactionScore: score },
      metadata,
    );
  }

  protected evolve(
    state: DecisionAggregateState,
    event: StoredEvent,
  ): DecisionAggregateState {
    switch (event.eventType) {
      case DecisionEventType.DECISION_STARTED:
        return {
          ...state,
          userId: event.eventData.userId as string,
          status: 'processing',
          history: [
            ...state.history,
            { action: 'started', timestamp: event.timestamp },
          ],
        };

      case DecisionEventType.DECISION_COMPLETED:
        return {
          ...state,
          status: 'completed',
          action: event.eventData.action as string,
          utility: event.eventData.utility as number,
          history: [
            ...state.history,
            { action: 'completed', timestamp: event.timestamp },
          ],
        };

      case DecisionEventType.DECISION_FAILED:
        return {
          ...state,
          status: 'failed',
          history: [
            ...state.history,
            { action: 'failed', timestamp: event.timestamp },
          ],
        };

      case DecisionEventType.FEEDBACK_RECEIVED:
        return {
          ...state,
          feedbackReceived: true,
          feedbackScore: event.eventData.satisfactionScore as number,
          history: [
            ...state.history,
            { action: 'feedback', timestamp: event.timestamp },
          ],
        };

      default:
        return state;
    }
  }
}
