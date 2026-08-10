/**
 * Resolve DecisionScope for ConstraintEngine → Gateway evaluate input.
 * Authority Consistency: weather-outdoor-storm ON_FOR_SELECTED binds scope.
 */

import { buildWeatherActivityDecisionScope } from '../builders/build-weather-activity-decision-scope';
import type {
  DecisionScope,
  ScopeMutationCandidate,
} from '../contracts/decision-scope.types';
import { detectConstraintScenarioIds } from './constraint-on-selected.util';
import type { PackRuleConstraintInput } from '../packs/rules/pack-rule-constraint.types';

export type GatewayDecisionScopeBinding = {
  decisionScope?: DecisionScope;
  worldStateSnapshotId?: string;
  scopeMutationCandidate?: ScopeMutationCandidate;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

/**
 * Prefer explicit signals.decisionScope; otherwise auto-build for weather-outdoor-storm.
 */
export function resolveDecisionScopeForGateway(input: {
  tripId: string;
  signals?: Record<string, unknown>;
  packContext?: PackRuleConstraintInput;
}): GatewayDecisionScopeBinding {
  const signals = input.signals ?? {};

  const explicitSnapshotId =
    typeof signals.worldStateSnapshotId === 'string' &&
    signals.worldStateSnapshotId.trim()
      ? signals.worldStateSnapshotId.trim()
      : undefined;

  const explicitScope = signals.decisionScope as DecisionScope | undefined;
  if (
    explicitScope &&
    typeof explicitScope === 'object' &&
    typeof explicitScope.snapshotId === 'string'
  ) {
    return {
      decisionScope: explicitScope,
      worldStateSnapshotId: explicitSnapshotId ?? explicitScope.snapshotId,
      scopeMutationCandidate: signals.scopeMutationCandidate as
        | ScopeMutationCandidate
        | undefined,
    };
  }

  const scenarioIds = detectConstraintScenarioIds({
    signals,
    packContext: input.packContext,
  });

  if (!scenarioIds.includes('weather-outdoor-storm')) {
    return {
      worldStateSnapshotId: explicitSnapshotId,
      scopeMutationCandidate: signals.scopeMutationCandidate as
        | ScopeMutationCandidate
        | undefined,
    };
  }

  const affectedPlanItemIds = asStringArray(
    signals.affectedPlanItemIds ?? signals.weatherAffectedPlanItemIds,
  );
  const snapshotId =
    explicitSnapshotId ?? `ws_${input.tripId}_weather_outdoor_storm`;
  const dayRaw = signals.weatherAffectedDayIndex ?? signals.affectedDayIndex;
  const affectedDayIndex =
    typeof dayRaw === 'number' && Number.isFinite(dayRaw) ? dayRaw : undefined;

  const decisionScope = buildWeatherActivityDecisionScope({
    snapshotId,
    tripId: input.tripId,
    affectedPlanItemIds,
    affectedDayIndex,
    trigger: 'WEATHER_OUTDOOR_STORM',
  });

  const scopeMutationCandidate = signals.scopeMutationCandidate as
    | ScopeMutationCandidate
    | undefined;

  return {
    decisionScope,
    worldStateSnapshotId: snapshotId,
    scopeMutationCandidate,
  };
}
