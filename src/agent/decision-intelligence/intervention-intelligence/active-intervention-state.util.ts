/**
 * Active Intervention State — 同一事件统一生命周期。
 */

import type { InterventionCandidateV1 } from './intervention-candidate.util';
import type { InterventionSurfaceLevelV1 } from './intervention-candidate.util';

export const ACTIVE_INTERVENTION_STATE_SCHEMA =
  'nara.active_intervention_state@v1' as const;

export type ActiveInterventionPhase =
  | 'NONE'
  | 'OBSERVING'
  | 'CANDIDATE_OPEN'
  | 'PASSIVE_SURFACED'
  | 'INTERRUPT_SHADOW'
  | 'RESOLVED'
  | 'EXPIRED'
  | 'SUPPRESSED';

export type ActiveInterventionStateV1 = {
  schemaId: typeof ACTIVE_INTERVENTION_STATE_SCHEMA;
  version: 1;
  stateId: string;
  tripId: string;
  riskEventKey: string;
  scenarioId: InterventionCandidateV1['scenarioId'];
  phase: ActiveInterventionPhase;
  activeCandidateId?: string;
  surfaceLevel?: InterventionSurfaceLevelV1;
  openedAt?: string;
  updatedAt: string;
  resolvedAt?: string;
  /** 同一事件一条生命周期 */
  singleLifecyclePerEvent: true;
  notifyUser: false;
};

export function createActiveInterventionState(input: {
  tripId: string;
  riskEventKey: string;
  scenarioId: InterventionCandidateV1['scenarioId'];
  stateId?: string;
  now?: string;
}): ActiveInterventionStateV1 {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaId: ACTIVE_INTERVENTION_STATE_SCHEMA,
    version: 1,
    stateId:
      input.stateId ??
      `ais_${input.tripId}_${input.riskEventKey}`,
    tripId: input.tripId,
    riskEventKey: input.riskEventKey,
    scenarioId: input.scenarioId,
    phase: 'NONE',
    updatedAt: now,
    singleLifecyclePerEvent: true,
    notifyUser: false,
  };
}

export function applyCandidateToActiveState(input: {
  state: ActiveInterventionStateV1;
  candidate: InterventionCandidateV1;
  now?: string;
}): ActiveInterventionStateV1 {
  if (
    input.candidate.tripId !== input.state.tripId ||
    input.candidate.riskEventKey !== input.state.riskEventKey
  ) {
    throw new Error('[ActiveIntervention] event_mismatch');
  }
  if (
    input.state.phase === 'RESOLVED' ||
    input.state.phase === 'EXPIRED'
  ) {
    throw new Error(
      '[ActiveIntervention] lifecycle_closed:cannot_attach_new_candidate',
    );
  }

  const now = input.now ?? new Date().toISOString();
  let phase: ActiveInterventionPhase = 'CANDIDATE_OPEN';
  if (input.candidate.surfaceLevel === 'DO_NOT_SURFACE') {
    phase = 'SUPPRESSED';
  } else if (input.candidate.surfaceLevel === 'SURFACE_PASSIVELY') {
    phase = 'PASSIVE_SURFACED';
  } else {
    phase = 'INTERRUPT_SHADOW';
  }

  return {
    ...input.state,
    phase,
    activeCandidateId: input.candidate.candidateId,
    surfaceLevel: input.candidate.surfaceLevel,
    openedAt: input.state.openedAt ?? now,
    updatedAt: now,
    notifyUser: false,
  };
}

export function resolveActiveIntervention(input: {
  state: ActiveInterventionStateV1;
  outcome: 'RESOLVED' | 'EXPIRED';
  now?: string;
}): ActiveInterventionStateV1 {
  const now = input.now ?? new Date().toISOString();
  return {
    ...input.state,
    phase: input.outcome,
    updatedAt: now,
    resolvedAt: now,
    notifyUser: false,
  };
}
