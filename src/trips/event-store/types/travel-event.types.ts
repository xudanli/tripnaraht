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
}

/** Event source namespace for persisted travel events. */
export enum TravelEventSource {
  TRIP_LIFECYCLE = 'trip.lifecycle',
  DECISION_OS = 'decision_os',
  COLLABORATION = 'collaboration',
  SYSTEM = 'system',
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
