/**
 * Exec Slip Canary — DecisionWorkspace fixture for stg_attn_infeasible (Slice 3 repair candidates).
 */

import {
  EXEC_SLIP_CANARY_ACTIVITY_A_ID,
  EXEC_SLIP_CANARY_ACTIVITY_B_ID,
  EXEC_SLIP_CANARY_ACTIVITY_C_ID,
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_INITIAL_PLAN_ID,
  EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
  EXEC_SLIP_SCENARIO_A_PLANNED_DEPART,
} from './prod-canary-execution-slip-pre-signoff.constants';
import { STAGING_ATTENTION_EPISODE } from './staging-canary-attention-seed-problems.util';
import { buildRepairCandidate } from '../src/trips/guardian-decision-core/adapters/repair-candidate.adapter';
import { EXECUTION_SUBSTITUTE_POI_ID } from '../src/trips/guardian-decision-core/adapters/execution-slip-repair-candidate.adapter';
import { EXECUTION_SLIP_CANDIDATE_IDS } from '../src/trips/guardian-decision-core/contracts/execution-slip.types';
import type { DecisionWorkspace } from '../src/trips/guardian-decision-core/contracts/decision-workspace.types';
import type { ExecutionDepartureObservation } from '../src/trips/guardian-decision-core/contracts/execution-slip.types';
import type { Rfc001DecisionProblem } from '../src/trips/guardian-decision-core/contracts/decision-problem.types';

export const EXEC_SLIP_INFEASIBLE_PROBLEM_ID = 'stg_attn_infeasible';

export function buildExecSlipCanaryInfeasibleWorkspace(
  problemId = EXEC_SLIP_INFEASIBLE_PROBLEM_ID,
): DecisionWorkspace {
  const workspaceId = `ws_${problemId}`;
  const now = new Date().toISOString();

  const removeNext = buildRepairCandidate({
    workspaceId,
    candidateId: EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY,
    basePlanVersionId: EXEC_SLIP_INITIAL_PLAN_ID,
    replacesPlanItemIds: [EXEC_SLIP_CANARY_ACTIVITY_B_ID],
    generationMethod: 'LOCAL_SUBSTITUTION',
    estimatedIntentPreservation: 0.65,
    estimatedAddedDurationMinutes: 0,
    preservedIntentRefs: ['intent_schedule_recovery'],
    operations: [
      {
        operationId: 'op_remove_next',
        kind: 'REMOVE_ITEM',
        targetRefs: [{ kind: 'PLAN_ITEM', id: EXEC_SLIP_CANARY_ACTIVITY_B_ID }],
        parameters: {
          itineraryItemId: EXEC_SLIP_CANARY_ACTIVITY_B_ID,
          action: 'REMOVE_NEXT_ACTIVITY',
        },
      },
    ],
  });

  const substituteNext = buildRepairCandidate({
    workspaceId,
    candidateId: EXECUTION_SLIP_CANDIDATE_IDS.SUBSTITUTE_NEXT_ACTIVITY,
    basePlanVersionId: EXEC_SLIP_INITIAL_PLAN_ID,
    replacesPlanItemIds: [EXEC_SLIP_CANARY_ACTIVITY_B_ID],
    generationMethod: 'LOCAL_SUBSTITUTION',
    estimatedIntentPreservation: 0.75,
    estimatedAddedDurationMinutes: 0,
    preservedIntentRefs: ['intent_substitute_nearby'],
    operations: [
      {
        operationId: 'op_substitute_next',
        kind: 'REPLACE_ITEM',
        targetRefs: [{ kind: 'PLAN_ITEM', id: EXEC_SLIP_CANARY_ACTIVITY_B_ID }],
        parameters: {
          itineraryItemId: EXEC_SLIP_CANARY_ACTIVITY_B_ID,
          substitutePoiId: EXECUTION_SUBSTITUTE_POI_ID,
          action: 'SUBSTITUTE_NEXT_ACTIVITY',
        },
      },
    ],
  });

  return {
    workspaceId,
    problemId,
    basePlanVersionId: EXEC_SLIP_INITIAL_PLAN_ID,
    worldStateSnapshotId: 'wss_stg_attn_seed',
    preferenceSnapshotId: `pref_${EXEC_SLIP_CANARY_TRIP_ID}_default`,
    constraintAssertions: [],
    loadAssessments: [],
    repairCandidates: [removeNext, substituteNext],
    createdAt: now,
    revision: 2,
    status: 'READY_FOR_FINALIZE',
  };
}

export function buildExecSlipCanaryInfeasibleObservation(): ExecutionDepartureObservation {
  return {
    observationId: 'obs_stg_attn_infeasible_seed',
    tripId: EXEC_SLIP_CANARY_TRIP_ID,
    planVersionId: EXEC_SLIP_INITIAL_PLAN_ID,
    activityId: EXEC_SLIP_CANARY_ACTIVITY_A_ID,
    plannedDepartAt: EXEC_SLIP_SCENARIO_A_PLANNED_DEPART,
    observedAt: EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
    stillAtPoi: true,
    source: 'USER_REPORT',
    recordedAt: new Date().toISOString(),
    recordedBy: 'seed-exec-slip-canary-infeasible-workspace',
  };
}

export function patchExecSlipCanaryInfeasibleWorkspace(
  metadata: Record<string, unknown>,
  opts?: { problemId?: string },
): Record<string, unknown> {
  const problemId = opts?.problemId ?? EXEC_SLIP_INFEASIBLE_PROBLEM_ID;
  const problemsBlock = metadata.rfc001DecisionProblems as
    | { items?: Rfc001DecisionProblem[]; lastUpdatedAt?: string }
    | undefined;
  const problems = problemsBlock?.items ?? [];
  if (!problems.some((p) => p.problemId === problemId)) {
    throw new Error(`RFC-001 problem ${problemId} not found in trip metadata`);
  }

  const workspace = buildExecSlipCanaryInfeasibleWorkspace(problemId);
  const workspacesBlock = metadata.rfc001DecisionWorkspaces as
    | { items?: DecisionWorkspace[]; lastUpdatedAt?: string }
    | undefined;
  const existing = (workspacesBlock?.items ?? []).filter((w) => w.problemId !== problemId);

  const observation = buildExecSlipCanaryInfeasibleObservation();
  const observations = {
    ...((metadata.executionDepartureObservations as Record<string, ExecutionDepartureObservation>) ??
      {}),
    [observation.observationId]: observation,
  };

  const worldState = (metadata.rfc001WorldState as Record<string, unknown>) ?? {};
  const events = Array.isArray(worldState.events) ? [...worldState.events] : [];
  if (!events.some((e) => (e as { eventId?: string }).eventId === `evt_attn_${problemId}`)) {
    events.push({
      eventId: `evt_attn_${problemId}`,
      eventType: 'EXECUTION_DEPARTURE_SLIP',
      tripId: EXEC_SLIP_CANARY_TRIP_ID,
      observedAt: EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
      payload: {
        activityId: EXEC_SLIP_CANARY_ACTIVITY_A_ID,
        nextActivityId: EXEC_SLIP_CANARY_ACTIVITY_B_ID,
        plannedDepartAt: EXEC_SLIP_SCENARIO_A_PLANNED_DEPART,
        observedAt: EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
        stillAtPoi: true,
        source: 'USER_REPORT',
      },
    });
  }

  return {
    ...metadata,
    executionDepartureObservations: observations,
    rfc001WorldState: {
      ...worldState,
      events,
    },
    executionSlipCanaryDrill: {
      ...((metadata.executionSlipCanaryDrill as Record<string, unknown>) ?? {}),
      substituteActivityId: EXEC_SLIP_CANARY_ACTIVITY_C_ID,
      infeasibleWorkspaceSeededAt: new Date().toISOString(),
    },
    rfc001DecisionWorkspaces: {
      items: [...existing, workspace],
      lastUpdatedAt: new Date().toISOString(),
    },
    attentionShadowSeed: {
      ...((metadata.attentionShadowSeed as Record<string, unknown>) ?? {}),
      infeasibleWorkspaceSeededAt: new Date().toISOString(),
      weatherEpisodeId: STAGING_ATTENTION_EPISODE,
    },
  };
}
