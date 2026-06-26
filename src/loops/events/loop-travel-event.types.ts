import type { LoopRunStatus, LoopType, TripRuntimeState } from '../types/loop-definition.types';

/** Causation / correlation fields stored in travel event metadata (Phase 2). */
export interface LoopTravelEventContext {
  loopRunId: string;
  loopType: LoopType;
  iterationId?: string;
  iterationSequence?: number;
  correlationId: string;
  causationId?: string;
  evidenceRefs?: string[];
  confidence?: number;
}

export interface LoopStartedPayload {
  loopType: LoopType;
  triggerEventId?: string;
  triggerType?: string;
  runtimeState: TripRuntimeState;
}

export interface LoopBlockerDetectedPayload {
  issueId: string;
  blockerId: string;
  issueTitle: string;
  sequence: number;
}

export interface LoopRepairProposedPayload {
  issueId: string;
  optionId: string;
  title: string;
  actionType: string;
  sequence: number;
}

export interface LoopValidationPayload {
  issueId: string;
  passed: boolean;
  previewStatus: string;
  wouldDefer?: boolean;
  completionRateP10?: number;
  sequence: number;
}

export interface LoopCompletedPayload {
  status: LoopRunStatus;
  stopReason?: string;
  requiresApproval: boolean;
  iterationCount: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export type LoopTriggerType =
  | 'CONSTRAINT_CHANGED'
  | 'ITINERARY_CHANGED'
  | 'BLOCKER_DETECTED'
  | 'MANUAL'
  | 'LIFECYCLE_PLANNING'
  | 'WEATHER_ALERT'
  | 'ROAD_CLOSED'
  | 'TRAFFIC_DELAY'
  | 'LATE_DEPARTURE'
  | 'ENVIRONMENT_DETECTED';
