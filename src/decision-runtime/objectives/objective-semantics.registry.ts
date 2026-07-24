/**
 * Objective Semantics Registry v1 — 8 canonical objectives (L2–L4).
 * @see ADR-007-Decision-Runtime-v2.md
 */

import type {
  CanonicalObjectiveId,
  ObjectiveEvaluation,
  ObjectiveProfile,
  ObjectiveSemantics,
} from '../contracts/objective-definition';
import type { TripPlan } from '../../trips/decision/plan-model';
import { evaluatePlanObjectives } from './evaluators/plan-objective-evaluator.util';

export const OBJECTIVE_REGISTRY_VERSION = 'objectives@v1';

const REGISTRY: ObjectiveSemantics[] = [
  {
    objectiveId: 'daily_driving_load',
    formulaVersion: '1.0.0',
    evaluator: 'plan-objective-evaluator',
    tier: 'L2',
    inputFields: ['plan.days.timeSlots.travelLegFromPrev'],
    outputRange: [0, 480],
    direction: 'MINIMIZE',
    missingDataPolicy: 'IGNORE',
    normalizationMethod: 'min-max-per-day',
    aggregationMethod: 'max-day',
    description: 'Peak daily driving minutes',
  },
  {
    objectiveId: 'daily_physical_load',
    formulaVersion: '1.0.0',
    evaluator: 'plan-objective-evaluator',
    tier: 'L2',
    inputFields: ['plan.days.timeSlots'],
    outputRange: [0, 720],
    direction: 'MINIMIZE',
    missingDataPolicy: 'IGNORE',
    normalizationMethod: 'min-max-per-day',
    aggregationMethod: 'max-day',
    description: 'Peak daily active minutes',
  },
  {
    objectiveId: 'time_window_satisfaction',
    formulaVersion: '1.0.0',
    evaluator: 'plan-objective-evaluator',
    tier: 'L2',
    inputFields: ['plan.days.timeSlots.time', 'plan.days.timeSlots.endTime'],
    outputRange: [0, 1],
    direction: 'MAXIMIZE',
    missingDataPolicy: 'UNKNOWN',
    normalizationMethod: 'ratio',
    aggregationMethod: 'mean',
  },
  {
    objectiveId: 'buffer_time',
    formulaVersion: '1.0.0',
    evaluator: 'plan-objective-evaluator',
    tier: 'L2',
    inputFields: ['plan.days.timeSlots'],
    outputRange: [0, 180],
    direction: 'MAXIMIZE',
    missingDataPolicy: 'IGNORE',
    normalizationMethod: 'minutes',
    aggregationMethod: 'min-day',
  },
  {
    objectiveId: 'must_visit_poi_completion',
    formulaVersion: '1.0.0',
    evaluator: 'plan-objective-evaluator',
    tier: 'L3',
    inputFields: ['plan.days.timeSlots.poiId', 'plan.days.timeSlots.priorityTag'],
    outputRange: [0, 1],
    direction: 'MAXIMIZE',
    missingDataPolicy: 'FAIL',
    normalizationMethod: 'ratio',
    aggregationMethod: 'mean',
  },
  {
    objectiveId: 'interest_match',
    formulaVersion: '1.0.0',
    evaluator: 'plan-objective-evaluator',
    tier: 'L3',
    inputFields: ['candidate.utilityHint'],
    outputRange: [0, 1],
    direction: 'MAXIMIZE',
    missingDataPolicy: 'IMPUTE',
    normalizationMethod: 'clamp-01',
    aggregationMethod: 'mean',
  },
  {
    objectiveId: 'min_member_utility',
    formulaVersion: '1.0.0',
    evaluator: 'plan-objective-evaluator',
    tier: 'L3',
    inputFields: ['candidate.utilityHint'],
    outputRange: [0, 1],
    direction: 'MAXIMIZE',
    missingDataPolicy: 'IMPUTE',
    normalizationMethod: 'clamp-01',
    aggregationMethod: 'min',
    description: 'Weak-member protection proxy',
  },
  {
    objectiveId: 'total_travel_time',
    formulaVersion: '1.0.0',
    evaluator: 'plan-objective-evaluator',
    tier: 'L4',
    inputFields: ['plan.days.timeSlots.travelLegFromPrev.durationMin'],
    outputRange: [0, 1440],
    direction: 'MINIMIZE',
    missingDataPolicy: 'IGNORE',
    normalizationMethod: 'minutes',
    aggregationMethod: 'sum',
  },
  {
    objectiveId: 'budget_deviation',
    formulaVersion: '1.0.0',
    evaluator: 'plan-objective-evaluator',
    tier: 'L4',
    inputFields: ['plan.metadata.budget'],
    outputRange: [0, 1],
    direction: 'MINIMIZE',
    missingDataPolicy: 'UNKNOWN',
    normalizationMethod: 'ratio',
    aggregationMethod: 'mean',
  },
];

export function buildDefaultObjectiveProfile(): ObjectiveProfile {
  return {
    registryVersion: OBJECTIVE_REGISTRY_VERSION,
    enabledObjectives: REGISTRY.map((o) => o.objectiveId),
    minMemberUtilityThreshold: 0.4,
  };
}

/** Merge travel-decision-contract compiled canonical weights into ObjectiveProfile. */
export function buildObjectiveProfileFromCanonicalWeights(
  canonicalWeights: Partial<Record<CanonicalObjectiveId, number>>,
  base?: ObjectiveProfile,
): ObjectiveProfile {
  const profile = base ?? buildDefaultObjectiveProfile();
  const weightEntries = Object.entries(canonicalWeights).filter(
    ([, w]) => typeof w === 'number' && w > 0,
  ) as [CanonicalObjectiveId, number][];

  if (weightEntries.length === 0) {
    return profile;
  }

  const enabledSet = new Set(profile.enabledObjectives);
  for (const [objectiveId] of weightEntries) {
    enabledSet.add(objectiveId);
  }

  const weights: Partial<Record<CanonicalObjectiveId, number>> = {
    ...(profile.weights ?? {}),
  };
  for (const [objectiveId, weight] of weightEntries) {
    weights[objectiveId] = weight;
  }

  return {
    ...profile,
    enabledObjectives: REGISTRY.map((o) => o.objectiveId).filter((id) => enabledSet.has(id)),
    weights,
  };
}

export class ObjectiveSemanticsRegistry {
  getVersion(): string {
    return OBJECTIVE_REGISTRY_VERSION;
  }

  list(): ObjectiveSemantics[] {
    return [...REGISTRY];
  }

  get(objectiveId: CanonicalObjectiveId): ObjectiveSemantics | undefined {
    return REGISTRY.find((o) => o.objectiveId === objectiveId);
  }

  snapshot(): {
    schemaId: 'tripnara.objective_registry_snapshot@v1';
    version: typeof OBJECTIVE_REGISTRY_VERSION;
    objectiveCount: number;
    objectives: ObjectiveSemantics[];
  } {
    return {
      schemaId: 'tripnara.objective_registry_snapshot@v1',
      version: OBJECTIVE_REGISTRY_VERSION,
      objectiveCount: REGISTRY.length,
      objectives: this.list(),
    };
  }

  evaluatePlan(input: {
    plan: TripPlan;
    utilityHint?: number;
    enabledObjectives?: CanonicalObjectiveId[];
  }): ObjectiveEvaluation[] {
    const enabled =
      input.enabledObjectives ?? buildDefaultObjectiveProfile().enabledObjectives;
    return evaluatePlanObjectives({
      plan: input.plan,
      utilityHint: input.utilityHint,
      enabledObjectives: enabled,
      registry: REGISTRY,
    });
  }
}
