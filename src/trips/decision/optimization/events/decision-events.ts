/**
 * Decision OS 事件系统
 * 
 * 提供事件驱动的解耦架构，支持：
 * - 决策生命周期事件
 * - 学习事件
 * - 系统状态事件
 * - 审计事件
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';

// ========== 事件类型定义 ==========

export enum DecisionEventType {
  // 决策生命周期
  DECISION_STARTED = 'decision.started',
  DECISION_COMPLETED = 'decision.completed',
  DECISION_FAILED = 'decision.failed',

  // Trip 生命周期事件
  TRIP_STATE_CHANGED = 'trip.state.changed',

  // DSO 状态
  DSO_CREATED = 'dso.created',
  DSO_UPDATED = 'dso.updated',
  DSO_SNAPSHOT_RECORDED = 'dso.snapshot.recorded',
  DSO_ROLLBACK = 'dso.rollback',
  
  // 学习事件
  FEEDBACK_RECEIVED = 'learning.feedback.received',
  LEARNING_TRIGGERED = 'learning.triggered',
  WEIGHTS_UPDATED = 'learning.weights.updated',
  CONVERGENCE_CHANGED = 'learning.convergence.changed',
  
  // 策略事件
  POLICY_INFERRED = 'policy.inferred',
  POLICY_UPDATED = 'policy.updated',
  
  // 约束事件
  CONSTRAINT_VIOLATED = 'constraint.violated',
  CONSTRAINT_RELAXED = 'constraint.relaxed',
  
  // 系统事件
  CIRCUIT_STATE_CHANGED = 'system.circuit.changed',
  LOCK_ACQUIRED = 'system.lock.acquired',
  LOCK_RELEASED = 'system.lock.released',
  LOCK_TIMEOUT = 'system.lock.timeout',
  
  // 稳定性事件
  LYAPUNOV_COMPUTED = 'stability.lyapunov.computed',
  STABILITY_WARNING = 'stability.warning',
}

// ========== 事件数据类型 ==========

export interface BaseEvent {
  type: DecisionEventType;
  timestamp: string;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface DecisionStartedEvent extends BaseEvent {
  type: DecisionEventType.DECISION_STARTED;
  dsoVersion: number;
  phase: string;
}

export interface DecisionCompletedEvent extends BaseEvent {
  type: DecisionEventType.DECISION_COMPLETED;
  action: string;
  utility: number;
  confidence: number;
  latencyMs: number;
}

export interface DecisionFailedEvent extends BaseEvent {
  type: DecisionEventType.DECISION_FAILED;
  error: string;
  errorCode?: string;
}

export interface TripStateChangedEvent extends BaseEvent {
  type: DecisionEventType.TRIP_STATE_CHANGED;
  tripId: string;
  previousStatus: string;
  newStatus: string;
  userId?: string;
}

export interface DSOSnapshotEvent extends BaseEvent {
  type: DecisionEventType.DSO_SNAPSHOT_RECORDED;
  version: number;
  phase: string;
  confidence?: number;
  lyapunovValue?: number;
}

export interface FeedbackReceivedEvent extends BaseEvent {
  type: DecisionEventType.FEEDBACK_RECEIVED;
  decisionId: string;
  satisfactionScore?: number;
  actualUtility?: number;
  feedbackType?: 'LIKE' | 'DISLIKE' | 'NEUTRAL';
}

export interface LearningTriggeredEvent extends BaseEvent {
  type: DecisionEventType.LEARNING_TRIGGERED;
  trigger: string;
  feedbackCount: number;
}

export interface WeightsUpdatedEvent extends BaseEvent {
  type: DecisionEventType.WEIGHTS_UPDATED;
  previousWeights: Record<string, number>;
  newWeights: Record<string, number>;
  learningRate: number;
}

export interface ConvergenceChangedEvent extends BaseEvent {
  type: DecisionEventType.CONVERGENCE_CHANGED;
  previousStatus: string;
  newStatus: string;
  cumulativeRegret?: number;
}

export interface PolicyInferredEvent extends BaseEvent {
  type: DecisionEventType.POLICY_INFERRED;
  selectedAction: string;
  entropy: number;
  actionProbabilities: Record<string, number>;
}

export interface ConstraintViolatedEvent extends BaseEvent {
  type: DecisionEventType.CONSTRAINT_VIOLATED;
  constraint: string;
  isHard: boolean;
  value?: unknown;
  limit?: unknown;
}

export interface CircuitStateChangedEvent extends BaseEvent {
  type: DecisionEventType.CIRCUIT_STATE_CHANGED;
  circuitName: string;
  previousState: string;
  newState: string;
  consecutiveFailures: number;
}

export interface LyapunovComputedEvent extends BaseEvent {
  type: DecisionEventType.LYAPUNOV_COMPUTED;
  value: number;
  isDecreasing: boolean;
  convergenceRate?: number;
}

export type DecisionEvent =
  | DecisionStartedEvent
  | DecisionCompletedEvent
  | DecisionFailedEvent
  | TripStateChangedEvent
  | DSOSnapshotEvent
  | FeedbackReceivedEvent
  | LearningTriggeredEvent
  | WeightsUpdatedEvent
  | ConvergenceChangedEvent
  | PolicyInferredEvent
  | ConstraintViolatedEvent
  | CircuitStateChangedEvent
  | LyapunovComputedEvent
  | BaseEvent;

// ========== 事件监听器类型 ==========

export type EventListener<T extends BaseEvent = BaseEvent> = (event: T) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe: () => void;
}

// ========== 事件总线服务 ==========

@Injectable()
export class DecisionEventBus implements OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(DecisionEventBus.name);
  private readonly eventHistory: DecisionEvent[] = [];
  private readonly maxHistorySize = 1000;
  private isRecordingHistory = false;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  onModuleDestroy() {
    this.emitter.removeAllListeners();
  }

  emit<T extends DecisionEvent>(event: T): void {
    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };

    this.logger.debug(`[Event] ${event.type}${event.requestId ? ` (${event.requestId})` : ''}`);

    if (this.isRecordingHistory) {
      this.recordHistory(enrichedEvent);
    }

    this.emitter.emit(event.type, enrichedEvent);
    this.emitter.emit('*', enrichedEvent);
  }

  on<T extends DecisionEvent>(
    eventType: DecisionEventType | '*',
    listener: EventListener<T>,
  ): EventSubscription {
    this.emitter.on(eventType, listener as EventListener);

    return {
      unsubscribe: () => {
        this.emitter.off(eventType, listener as EventListener);
      },
    };
  }

  once<T extends DecisionEvent>(
    eventType: DecisionEventType,
    listener: EventListener<T>,
  ): EventSubscription {
    this.emitter.once(eventType, listener as EventListener);

    return {
      unsubscribe: () => {
        this.emitter.off(eventType, listener as EventListener);
      },
    };
  }

  off(eventType: DecisionEventType, listener: EventListener): void {
    this.emitter.off(eventType, listener);
  }

  removeAllListeners(eventType?: DecisionEventType): void {
    if (eventType) {
      this.emitter.removeAllListeners(eventType);
    } else {
      this.emitter.removeAllListeners();
    }
  }

  listenerCount(eventType: DecisionEventType): number {
    return this.emitter.listenerCount(eventType);
  }

  enableHistoryRecording(enabled: boolean = true): void {
    this.isRecordingHistory = enabled;
  }

  getEventHistory(filter?: {
    type?: DecisionEventType;
    requestId?: string;
    limit?: number;
  }): DecisionEvent[] {
    let events = [...this.eventHistory];

    if (filter?.type) {
      events = events.filter(e => e.type === filter.type);
    }

    if (filter?.requestId) {
      events = events.filter(e => e.requestId === filter.requestId);
    }

    if (filter?.limit) {
      events = events.slice(-filter.limit);
    }

    return events;
  }

  clearHistory(): void {
    this.eventHistory.length = 0;
  }

  private recordHistory(event: DecisionEvent): void {
    this.eventHistory.push(event);

    while (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }
}

// ========== 事件发射辅助类 ==========

@Injectable()
export class DecisionEventEmitter {
  constructor(private readonly eventBus: DecisionEventBus) {}

  decisionStarted(requestId: string, userId: string, dsoVersion: number, phase: string): void {
    this.eventBus.emit<DecisionStartedEvent>({
      type: DecisionEventType.DECISION_STARTED,
      timestamp: new Date().toISOString(),
      requestId,
      userId,
      dsoVersion,
      phase,
    });
  }

  decisionCompleted(
    requestId: string,
    userId: string,
    action: string,
    utility: number,
    confidence: number,
    latencyMs: number,
  ): void {
    this.eventBus.emit<DecisionCompletedEvent>({
      type: DecisionEventType.DECISION_COMPLETED,
      timestamp: new Date().toISOString(),
      requestId,
      userId,
      action,
      utility,
      confidence,
      latencyMs,
    });
  }

  decisionFailed(requestId: string, userId: string, error: string, errorCode?: string): void {
    this.eventBus.emit<DecisionFailedEvent>({
      type: DecisionEventType.DECISION_FAILED,
      timestamp: new Date().toISOString(),
      requestId,
      userId,
      error,
      errorCode,
    });
  }

  tripStateChanged(tripId: string, previousStatus: string, newStatus: string, userId?: string): void {
    this.eventBus.emit<TripStateChangedEvent>({
      type: DecisionEventType.TRIP_STATE_CHANGED,
      timestamp: new Date().toISOString(),
      tripId,
      previousStatus,
      newStatus,
      userId,
    });
  }

  snapshotRecorded(
    requestId: string,
    version: number,
    phase: string,
    confidence?: number,
    lyapunovValue?: number,
  ): void {
    this.eventBus.emit<DSOSnapshotEvent>({
      type: DecisionEventType.DSO_SNAPSHOT_RECORDED,
      timestamp: new Date().toISOString(),
      requestId,
      version,
      phase,
      confidence,
      lyapunovValue,
    });
  }

  feedbackReceived(
    requestId: string,
    userId: string,
    decisionId: string,
    satisfactionScore?: number,
    actualUtility?: number,
    feedbackType?: 'LIKE' | 'DISLIKE' | 'NEUTRAL',
  ): void {
    this.eventBus.emit<FeedbackReceivedEvent>({
      type: DecisionEventType.FEEDBACK_RECEIVED,
      timestamp: new Date().toISOString(),
      requestId,
      userId,
      decisionId,
      satisfactionScore,
      actualUtility,
      feedbackType,
    });
  }

  learningTriggered(requestId: string, trigger: string, feedbackCount: number): void {
    this.eventBus.emit<LearningTriggeredEvent>({
      type: DecisionEventType.LEARNING_TRIGGERED,
      timestamp: new Date().toISOString(),
      requestId,
      trigger,
      feedbackCount,
    });
  }

  weightsUpdated(
    userId: string,
    previousWeights: Record<string, number>,
    newWeights: Record<string, number>,
    learningRate: number,
  ): void {
    this.eventBus.emit<WeightsUpdatedEvent>({
      type: DecisionEventType.WEIGHTS_UPDATED,
      timestamp: new Date().toISOString(),
      userId,
      previousWeights,
      newWeights,
      learningRate,
    });
  }

  convergenceChanged(
    userId: string,
    previousStatus: string,
    newStatus: string,
    cumulativeRegret?: number,
  ): void {
    this.eventBus.emit<ConvergenceChangedEvent>({
      type: DecisionEventType.CONVERGENCE_CHANGED,
      timestamp: new Date().toISOString(),
      userId,
      previousStatus,
      newStatus,
      cumulativeRegret,
    });
  }

  policyInferred(
    requestId: string,
    selectedAction: string,
    entropy: number,
    actionProbabilities: Record<string, number>,
  ): void {
    this.eventBus.emit<PolicyInferredEvent>({
      type: DecisionEventType.POLICY_INFERRED,
      timestamp: new Date().toISOString(),
      requestId,
      selectedAction,
      entropy,
      actionProbabilities,
    });
  }

  constraintViolated(
    requestId: string,
    constraint: string,
    isHard: boolean,
    value?: unknown,
    limit?: unknown,
  ): void {
    this.eventBus.emit<ConstraintViolatedEvent>({
      type: DecisionEventType.CONSTRAINT_VIOLATED,
      timestamp: new Date().toISOString(),
      requestId,
      constraint,
      isHard,
      value,
      limit,
    });
  }

  circuitStateChanged(
    circuitName: string,
    previousState: string,
    newState: string,
    consecutiveFailures: number,
  ): void {
    this.eventBus.emit<CircuitStateChangedEvent>({
      type: DecisionEventType.CIRCUIT_STATE_CHANGED,
      timestamp: new Date().toISOString(),
      circuitName,
      previousState,
      newState,
      consecutiveFailures,
    });
  }

  lyapunovComputed(
    requestId: string,
    value: number,
    isDecreasing: boolean,
    convergenceRate?: number,
  ): void {
    this.eventBus.emit<LyapunovComputedEvent>({
      type: DecisionEventType.LYAPUNOV_COMPUTED,
      timestamp: new Date().toISOString(),
      requestId,
      value,
      isDecreasing,
      convergenceRate,
    });
  }
}
