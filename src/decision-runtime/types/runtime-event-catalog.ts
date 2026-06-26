import {
  TravelEventType,
  TrajectorySegment,
} from '../../trips/event-store/types/travel-event.types';

/**
 * PRD §18 canonical event names (SCREAMING_SNAKE).
 * Implementation uses dot-notation travel event types; map via RUNTIME_EVENT_IMPLEMENTATION.
 */
export enum RuntimeCanonicalEventType {
  TRIP_STATE_CHANGED = 'TRIP_STATE_CHANGED',
  TRIP_TRANSITION_REJECTED = 'TRIP_TRANSITION_REJECTED',
  PARTICIPANT_CONSENTED = 'PARTICIPANT_CONSENTED',
  CONSTRAINT_RECORDED = 'CONSTRAINT_RECORDED',
  PRIVATE_CONSTRAINT_SUMMARIZED = 'PRIVATE_CONSTRAINT_SUMMARIZED',
  CONFLICT_DETECTED = 'CONFLICT_DETECTED',
  CONFLICT_CONFIRMED = 'CONFLICT_CONFIRMED',
  CONFLICT_DISMISSED = 'CONFLICT_DISMISSED',
  CANDIDATE_STRATEGY_CREATED = 'CANDIDATE_STRATEGY_CREATED',
  DECISION_RECORDED = 'DECISION_RECORDED',
  READINESS_BLOCKER_RAISED = 'READINESS_BLOCKER_RAISED',
  READINESS_BLOCKER_RESOLVED = 'READINESS_BLOCKER_RESOLVED',
  READINESS_ASSESSMENT_RECORDED = 'READINESS_ASSESSMENT_RECORDED',
  CONTINGENCY_PLAN_CREATED = 'CONTINGENCY_PLAN_CREATED',
  OUTCOME_RECORDED = 'OUTCOME_RECORDED',
  SENSITIVE_DATA_ACCESSED = 'SENSITIVE_DATA_ACCESSED',
  COMMAND_REJECTED = 'COMMAND_REJECTED',
}

/** P0 minimum event set per PRD §18.2 */
export const RUNTIME_P0_CANONICAL_EVENTS: readonly RuntimeCanonicalEventType[] = [
  RuntimeCanonicalEventType.TRIP_STATE_CHANGED,
  RuntimeCanonicalEventType.TRIP_TRANSITION_REJECTED,
  RuntimeCanonicalEventType.PARTICIPANT_CONSENTED,
  RuntimeCanonicalEventType.CONSTRAINT_RECORDED,
  RuntimeCanonicalEventType.PRIVATE_CONSTRAINT_SUMMARIZED,
  RuntimeCanonicalEventType.CONFLICT_DETECTED,
  RuntimeCanonicalEventType.CANDIDATE_STRATEGY_CREATED,
  RuntimeCanonicalEventType.DECISION_RECORDED,
  RuntimeCanonicalEventType.READINESS_BLOCKER_RAISED,
  RuntimeCanonicalEventType.CONTINGENCY_PLAN_CREATED,
  RuntimeCanonicalEventType.OUTCOME_RECORDED,
] as const;

export enum RuntimePrivacyClass {
  PUBLIC = 'PUBLIC',
  TEAM = 'TEAM',
  PRIVATE = 'PRIVATE',
  SENSITIVE = 'SENSITIVE',
  RESTRICTED = 'RESTRICTED',
}

export enum RuntimeAggregateType {
  TRIP_PROJECT = 'TripProject',
  PARTICIPATION = 'Participation',
  CONSTRAINT = 'Constraint',
  CONFLICT = 'Conflict',
  CANDIDATE_STRATEGY = 'CandidateStrategy',
  DECISION_CASE = 'DecisionCase',
  READINESS_ASSESSMENT = 'ReadinessAssessment',
  CONTINGENCY_PLAN = 'ContingencyPlan',
  EXECUTION_RECORD = 'ExecutionRecord',
}

/** Gate1-specific travel event type strings (dot notation). */
export const Gate1TravelEventType = {
  PARTICIPANT_CONSENTED: 'gate1.participant.consented',
  CONSTRAINT_RECORDED: 'gate1.constraint.recorded',
  PRIVATE_CONSTRAINT_SUMMARIZED: 'gate1.constraint.summarized',
  CONFLICT_DETECTED: 'gate1.conflict.detected',
  CONFLICT_CONFIRMED: 'gate1.conflict.confirmed',
  CONFLICT_DISMISSED: 'gate1.conflict.dismissed',
  CANDIDATE_STRATEGY_CREATED: 'gate1.candidate_strategy.created',
  DECISION_RECORDED: 'gate1.decision.recorded',
  READINESS_BLOCKER_RAISED: 'gate1.readiness.blocker_raised',
  READINESS_BLOCKER_RESOLVED: 'gate1.readiness.blocker_resolved',
  READINESS_ASSESSMENT_RECORDED: 'gate1.readiness.assessment_recorded',
  CONTINGENCY_PLAN_CREATED: 'gate1.contingency_plan.created',
  OUTCOME_RECORDED: 'gate1.outcome.recorded',
  SENSITIVE_DATA_ACCESSED: 'gate1.privacy.sensitive_data_accessed',
  COMMAND_REJECTED: 'gate1.command.rejected',
} as const;

export type Gate1TravelEventTypeName =
  (typeof Gate1TravelEventType)[keyof typeof Gate1TravelEventType];

/** Map PRD canonical names to persisted travel event types. */
export const RUNTIME_EVENT_IMPLEMENTATION: Record<
  RuntimeCanonicalEventType,
  string
> = {
  [RuntimeCanonicalEventType.TRIP_STATE_CHANGED]:
    TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED,
  [RuntimeCanonicalEventType.TRIP_TRANSITION_REJECTED]:
    TravelEventType.TRIP_LIFECYCLE_TRANSITION_REJECTED,
  [RuntimeCanonicalEventType.PARTICIPANT_CONSENTED]:
    Gate1TravelEventType.PARTICIPANT_CONSENTED,
  [RuntimeCanonicalEventType.CONSTRAINT_RECORDED]:
    Gate1TravelEventType.CONSTRAINT_RECORDED,
  [RuntimeCanonicalEventType.PRIVATE_CONSTRAINT_SUMMARIZED]:
    Gate1TravelEventType.PRIVATE_CONSTRAINT_SUMMARIZED,
  [RuntimeCanonicalEventType.CONFLICT_DETECTED]:
    Gate1TravelEventType.CONFLICT_DETECTED,
  [RuntimeCanonicalEventType.CONFLICT_CONFIRMED]:
    Gate1TravelEventType.CONFLICT_CONFIRMED,
  [RuntimeCanonicalEventType.CONFLICT_DISMISSED]:
    Gate1TravelEventType.CONFLICT_DISMISSED,
  [RuntimeCanonicalEventType.CANDIDATE_STRATEGY_CREATED]:
    Gate1TravelEventType.CANDIDATE_STRATEGY_CREATED,
  [RuntimeCanonicalEventType.DECISION_RECORDED]:
    Gate1TravelEventType.DECISION_RECORDED,
  [RuntimeCanonicalEventType.READINESS_BLOCKER_RAISED]:
    Gate1TravelEventType.READINESS_BLOCKER_RAISED,
  [RuntimeCanonicalEventType.READINESS_BLOCKER_RESOLVED]:
    Gate1TravelEventType.READINESS_BLOCKER_RESOLVED,
  [RuntimeCanonicalEventType.READINESS_ASSESSMENT_RECORDED]:
    Gate1TravelEventType.READINESS_ASSESSMENT_RECORDED,
  [RuntimeCanonicalEventType.CONTINGENCY_PLAN_CREATED]:
    Gate1TravelEventType.CONTINGENCY_PLAN_CREATED,
  [RuntimeCanonicalEventType.OUTCOME_RECORDED]:
    Gate1TravelEventType.OUTCOME_RECORDED,
  [RuntimeCanonicalEventType.SENSITIVE_DATA_ACCESSED]:
    Gate1TravelEventType.SENSITIVE_DATA_ACCESSED,
  [RuntimeCanonicalEventType.COMMAND_REJECTED]:
    Gate1TravelEventType.COMMAND_REJECTED,
};

/** Trajectory segment per Gate1 runtime event category. */
export const GATE1_EVENT_SEGMENT: Record<
  Gate1TravelEventTypeName,
  TrajectorySegment
> = {
  [Gate1TravelEventType.PARTICIPANT_CONSENTED]: TrajectorySegment.ACTION,
  [Gate1TravelEventType.CONSTRAINT_RECORDED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.PRIVATE_CONSTRAINT_SUMMARIZED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.CONFLICT_DETECTED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.CONFLICT_CONFIRMED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.CONFLICT_DISMISSED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.CANDIDATE_STRATEGY_CREATED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.DECISION_RECORDED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.READINESS_BLOCKER_RAISED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.READINESS_BLOCKER_RESOLVED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.READINESS_ASSESSMENT_RECORDED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.CONTINGENCY_PLAN_CREATED]: TrajectorySegment.DECISION,
  [Gate1TravelEventType.OUTCOME_RECORDED]: TrajectorySegment.RESULT,
  [Gate1TravelEventType.SENSITIVE_DATA_ACCESSED]: TrajectorySegment.ACTION,
  [Gate1TravelEventType.COMMAND_REJECTED]: TrajectorySegment.ACTION,
};
