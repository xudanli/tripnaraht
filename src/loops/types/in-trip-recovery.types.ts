import type { TripLoopUiViewDto } from '../adapters/trip-loop-ui.adapter';
import type { InTripLoopUiViewDto } from '../adapters/in-trip-loop-ui.adapter';
import type { LoopIterationDecision, LoopRunStatus, TripRuntimeState } from './loop-definition.types';

export interface InTripRecoverySnapshot {
  verdictStatus: string;
  openEnvironmentEvents: number;
  redEvents: number;
  delayMinutes: number;
  atRiskItems: number;
  onTrack: boolean;
}

export type InTripTriggerKind =
  | 'WEATHER_ALERT'
  | 'ROAD_CLOSED'
  | 'TRAFFIC_DELAY'
  | 'LATE_DEPARTURE'
  | 'ENVIRONMENT_EVENT';

export interface InTripRecoveryIterationView {
  sequence: number;
  triggerKind: InTripTriggerKind;
  environmentEventId?: string;
  triggerTitle: string;
  proposal: {
    planId: string;
    title: string;
    actionType: string;
  };
  validation: {
    passed: boolean;
    experienceEquivalence?: number;
    wouldDefer?: boolean;
    lateProbabilityBefore?: number;
    lateProbabilityAfter?: number;
  };
  decision: LoopIterationDecision;
  attemptedPlans: string[];
  protectedItems?: string[];
}

export interface InTripRecoveryLoopResult {
  loopRunId: string;
  status: LoopRunStatus;
  runtimeState: TripRuntimeState;
  before: InTripRecoverySnapshot;
  after: InTripRecoverySnapshot;
  iterations: InTripRecoveryIterationView[];
  recommendedPlans: Array<{
    environmentEventId: string;
    planId: string;
    title: string;
    actionType: string;
    triggerKind: InTripTriggerKind;
  }>;
  requiresApproval: boolean;
  stopReason?: string;
  ui?: InTripLoopUiViewDto;
}

export type { TripLoopUiViewDto };
