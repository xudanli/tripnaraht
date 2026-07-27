/**
 * Persist DecisionScope binding on trip.metadata so ConstraintEngine / Gateway
 * can reuse weather-outdoor-storm scope on later isFeasible calls.
 */

import type { DecisionScope } from '../../../decision-runtime/contracts/decision-scope.types';

export const AUTHORITY_DECISION_SCOPE_METADATA_KEY =
  'authorityDecisionScopeSignals' as const;

export type AuthorityDecisionScopeSignalsV1 = {
  schemaId: 'tripnara.authority_decision_scope_signals@v1';
  constraintScenarioId: 'weather-outdoor-storm';
  weatherProhibitsOutdoor: true | 'ACTIVITY_PROHIBITED';
  worldStateSnapshotId: string;
  decisionScope: DecisionScope;
  affectedPlanItemIds: string[];
  weatherAffectedDayIndex?: number;
  stampedAt: string;
  problemId?: string;
  workspaceId?: string;
};

export function buildWeatherOutdoorStormScopeSignals(input: {
  decisionScope: DecisionScope;
  worldStateSnapshotId: string;
  affectedPlanItemIds: string[];
  weatherAffectedDayIndex?: number;
  problemId?: string;
  workspaceId?: string;
  stampedAt?: string;
}): AuthorityDecisionScopeSignalsV1 {
  return {
    schemaId: 'tripnara.authority_decision_scope_signals@v1',
    constraintScenarioId: 'weather-outdoor-storm',
    weatherProhibitsOutdoor: 'ACTIVITY_PROHIBITED',
    worldStateSnapshotId: input.worldStateSnapshotId,
    decisionScope: input.decisionScope,
    affectedPlanItemIds: [...input.affectedPlanItemIds],
    weatherAffectedDayIndex: input.weatherAffectedDayIndex,
    stampedAt: input.stampedAt ?? new Date().toISOString(),
    problemId: input.problemId,
    workspaceId: input.workspaceId,
  };
}

export function mergeAuthorityDecisionScopeIntoTripMetadata(
  metadata: Record<string, unknown> | null | undefined,
  signals: AuthorityDecisionScopeSignalsV1,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [AUTHORITY_DECISION_SCOPE_METADATA_KEY]: signals,
  };
}

export function readAuthorityDecisionScopeSignalsFromMetadata(
  metadata: unknown,
): AuthorityDecisionScopeSignalsV1 | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as Record<string, unknown>)[
    AUTHORITY_DECISION_SCOPE_METADATA_KEY
  ];
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Partial<AuthorityDecisionScopeSignalsV1>;
  if (s.schemaId !== 'tripnara.authority_decision_scope_signals@v1') return undefined;
  if (!s.decisionScope || typeof s.decisionScope !== 'object') return undefined;
  if (typeof s.worldStateSnapshotId !== 'string' || !s.worldStateSnapshotId.trim()) {
    return undefined;
  }
  return s as AuthorityDecisionScopeSignalsV1;
}

/**
 * Flatten metadata binding into TripWorldState.signals for resolveDecisionScopeForGateway.
 */
export function applyAuthorityDecisionScopeSignalsToWorldSignals(
  signals: Record<string, unknown>,
  binding: AuthorityDecisionScopeSignalsV1 | undefined,
): Record<string, unknown> {
  if (!binding) return signals;
  return {
    ...signals,
    weatherProhibitsOutdoor: binding.weatherProhibitsOutdoor,
    constraintScenarioId: binding.constraintScenarioId,
    worldStateSnapshotId: binding.worldStateSnapshotId,
    decisionScope: binding.decisionScope,
    affectedPlanItemIds: binding.affectedPlanItemIds,
    ...(binding.weatherAffectedDayIndex !== undefined
      ? { weatherAffectedDayIndex: binding.weatherAffectedDayIndex }
      : {}),
  };
}
