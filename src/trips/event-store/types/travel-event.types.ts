/**
 * Travel Event Store - Phase 2 Foundation
 *
 * Core types for the Travel Event Store.
 *
 * Key separation:
 * - TripStatus = where the Trip is in its lifecycle (DRAFT, RECRUITING, FORMING, PLANNING, TRAVELING, COMPLETED, CANCELLED)
 * - TrajectorySegment = what kind of event this is in the trajectory (STATE, DECISION, ACTION, RESULT)
 */

/**
 * Trajectory segment types - the role of an event in the travel trajectory.
 *
 * This is NOT the same as TripStatus. TripStatus represents the lifecycle state of the Trip.
 * TrajectorySegment represents the category/type of event being recorded.
 */
export enum TrajectorySegment {
  /** Lifecycle state change events (e.g., trip.lifecycle.state_changed) */
  STATE = 'STATE',

  /** Decision events (e.g., trip.decision.budget_changed) */
  DECISION = 'DECISION',

  /** Action events (e.g., trip.action.member_invited) */
  ACTION = 'ACTION',

  /** Result events (e.g., trip.result.member_joined) */
  RESULT = 'RESULT',
}

/** Canonical travel event type names (Phase 2 foundation). */
export enum TravelEventType {
  TRIP_LIFECYCLE_STATE_CHANGED = 'trip.lifecycle.state_changed',
  TRIP_LIFECYCLE_TRANSITION_REJECTED = 'trip.lifecycle.transition_rejected',
  TRIP_NARRATIVE_THEME_SELECTED = 'trip.narrative.theme_selected',
  TRIP_NARRATIVE_THEME_CLEARED = 'trip.narrative.theme_cleared',
  /** M7: 行中锚点移交物化 */
  TRIP_IN_TRIP_ANCHOR_MATERIALIZED = 'trip.in_trip.anchor_materialized',
  /** M8: 环境突变检测 */
  TRIP_IN_TRIP_ENVIRONMENT_DETECTED = 'trip.in_trip.environment_detected',
  /** M8: 环境事件方案锁定 */
  TRIP_IN_TRIP_ENVIRONMENT_RESOLVED = 'trip.in_trip.environment_resolved',
  /** M9: 行中消费记录 */
  TRIP_IN_TRIP_TRANSACTION_RECORDED = 'trip.in_trip.transaction_recorded',
  /** M9: 数字助推展示 */
  TRIP_IN_TRIP_NUDGE_SHOWN = 'trip.in_trip.nudge_shown',
  /** M9: 预算再平衡建议 */
  TRIP_IN_TRIP_REBALANCE_SUGGESTED = 'trip.in_trip.rebalance_suggested',
  /** M10: 成员状态向量更新 */
  TRIP_IN_TRIP_STATE_VECTOR_UPDATED = 'trip.in_trip.state_vector_updated',
  /** M10: 关系风险触发 */
  TRIP_IN_TRIP_RELATION_RISK_RAISED = 'trip.in_trip.relation_risk_raised',
  /** M10: 保护性干预 */
  TRIP_IN_TRIP_INTERVENTION_TRIGGERED = 'trip.in_trip.intervention_triggered',
  /** M10: 分组方案提议 */
  TRIP_IN_TRIP_SPLIT_PROPOSED = 'trip.in_trip.split_proposed',
  /** M10: 分组方案执行 */
  TRIP_IN_TRIP_SPLIT_EXECUTED = 'trip.in_trip.split_executed',
  /** M11: 体验微调查提交 */
  TRIP_IN_TRIP_EXPERIENCE_PULSE_SUBMITTED = 'trip.in_trip.experience_pulse_submitted',
  /** M11: 推荐权重调整 */
  TRIP_IN_TRIP_WEIGHT_ADJUSTED = 'trip.in_trip.weight_adjusted',

  /** Loop Engineering — trip-level change signals (Phase 2) */
  TRIP_CONSTRAINT_CHANGED = 'trip.constraint.changed',
  TRIP_ITINERARY_CHANGED = 'trip.itinerary.changed',

  /** Causal Travel Runtime — decision causality record (P0 dual-write) */
  TRIP_DECISION_CAUSALITY_RECORDED = 'trip.decision.causality_recorded',

  /** P5 — observed outcome vs predicted causal metrics (counterfactual closure) */
  TRIP_DECISION_CAUSALITY_OUTCOME_RECORDED = 'trip.decision.causality_outcome_recorded',

  /** Loop Engineering — orchestrator lifecycle (Phase 2) */
  LOOP_STARTED = 'loop.started',
  LOOP_ITERATION_STARTED = 'loop.iteration.started',
  LOOP_BLOCKER_DETECTED = 'loop.blocker.detected',
  LOOP_REPAIR_PROPOSED = 'loop.repair.proposed',
  LOOP_VALIDATION_PASSED = 'loop.validation.passed',
  LOOP_VALIDATION_FAILED = 'loop.validation.failed',
  LOOP_COMPLETED = 'loop.completed',
  LOOP_ESCALATED = 'loop.escalated',
  LOOP_PAUSED = 'loop.paused',
}

/** Event source namespace for persisted travel events. */
export enum TravelEventSource {
  TRIP_LIFECYCLE = 'trip.lifecycle',
  DECISION_OS = 'decision_os',
  COLLABORATION = 'collaboration',
  SYSTEM = 'system',
  NARRATIVE_ENGINE = 'narrative_engine',
  IN_TRIP_EXECUTION = 'trip.in_trip',
  LOOP_ORCHESTRATOR = 'loop.orchestrator',
  /** Gate1 → Decision Runtime dual-write (M0) */
  GATE1_RUNTIME = 'gate1.runtime',
}

/**
 * Travel event envelope - the canonical structure for persisted travel events.
 */
export interface TravelEventEnvelope {
  /** Stable event ID (derived from idempotency key). */
  eventId: string;

  /** Stable deduplication key for append-only persistence. */
  idempotencyKey: string;

  /** Associated Trip ID */
  tripId: string;

  /** Trajectory segment type */
  segment: TrajectorySegment;

  /** Event type name (e.g., 'trip.lifecycle.state_changed') */
  eventType: string;

  /** Event source namespace */
  source: TravelEventSource;

  /** Payload schema version */
  schemaVersion: number;

  /** Event payload (typed by eventType) */
  payload: Record<string, unknown>;

  /** User ID who triggered the event (if applicable) */
  userId?: string;

  /** Event timestamp (ISO 8601) */
  timestamp: string;

  /** Request ID for correlation (if applicable) */
  requestId?: string;

  /** Optional metadata */
  metadata?: Record<string, unknown>;

  /** Decision attribution - explains why this event occurred */
  attribution?: TravelEventAttribution;
}

/**
 * Decision attribution embedded in travel events.
 * This is a lightweight version of DecisionAttribution for event-level attribution.
 */
export interface TravelEventAttribution {
  /** Primary cause type */
  causeType: string;

  /** Signals that influenced this event */
  signals: string[];

  /** Influence score (0-1) */
  influenceScore: number;

  /** Confidence level */
  confidence: string;

  /** Brief explanation */
  explanation: string;

  /** Attribution computation timestamp */
  computedAt: string;
}

/**
 * Builder options for creating a TravelEventEnvelope.
 */
export interface TravelEventBuilderOptions {
  tripId: string;
  segment: TrajectorySegment;
  eventType: string;
  payload: Record<string, unknown>;
  source?: TravelEventSource;
  schemaVersion?: number;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  idempotencyKey: string;
  attribution?: TravelEventAttribution;
}

/**
 * Travel event persistence result.
 */
export interface TravelEventPersistenceResult {
  /** Whether the event was persisted */
  persisted: boolean;

  /** The event ID (even if not persisted, for idempotency) */
  eventId: string;

  /** Error message if persistence failed */
  error?: string;

  /** Whether this was a duplicate (already persisted) */
  duplicate?: boolean;
}
