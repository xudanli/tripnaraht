/**
 * Bridge travel-decision-contract → decision-runtime runtime policies.
 */

import type { ObjectiveProfile } from '../../../decision-runtime/contracts/objective-definition';
import { buildObjectiveProfileFromCanonicalWeights } from '../../../decision-runtime/objectives/objective-semantics.registry';
import type { AutomationPolicy } from '../types/travel-decision-contract.types';
import {
  buildTravelDecisionContract,
} from './travel-decision-contract.builder';
import { compileObjectiveWeights } from './travel-objective.compiler';

export function resolveObjectiveProfileFromTripMetadata(input: {
  tripId: string;
  constraintsVersion?: number;
  metadata: Record<string, unknown>;
  pacing?: Record<string, unknown>;
}): ObjectiveProfile {
  const contract = buildTravelDecisionContract({
    tripId: input.tripId,
    constraintsVersion: input.constraintsVersion ?? 0,
    metadata: input.metadata,
    pacing: input.pacing ?? {},
    items: [],
    conflicts: [],
    conflictConstraintIds: new Set(),
  });

  return buildObjectiveProfileFromCanonicalWeights(contract.compiledWeights.canonical);
}

export function resolveAutomationPolicyFromTripMetadata(
  metadata: Record<string, unknown>,
  pacing?: Record<string, unknown>,
): AutomationPolicy {
  const contract = buildTravelDecisionContract({
    tripId: 'runtime',
    constraintsVersion: 0,
    metadata,
    pacing: pacing ?? {},
    items: [],
    conflicts: [],
    conflictConstraintIds: new Set(),
  });
  return contract.automation;
}

export function resolveCompiledCanonicalWeightsFromTripMetadata(input: {
  tripId: string;
  constraintsVersion?: number;
  metadata: Record<string, unknown>;
  pacing?: Record<string, unknown>;
}) {
  const objectives = buildTravelDecisionContract({
    tripId: input.tripId,
    constraintsVersion: input.constraintsVersion ?? 0,
    metadata: input.metadata,
    pacing: input.pacing ?? {},
    items: [],
    conflicts: [],
    conflictConstraintIds: new Set(),
  }).objectives;

  return compileObjectiveWeights(objectives).canonical;
}
