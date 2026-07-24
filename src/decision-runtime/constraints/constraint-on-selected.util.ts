/**
 * ON_FOR_SELECTED — selective canonical constraint authority by scenario.
 */

import type { PackRuleConstraintInput } from '../packs/rules/pack-rule-constraint.types';

export function parseConstraintGatewayOnScenarios(): string[] {
  const raw = process.env.CONSTRAINT_GATEWAY_ON_SCENARIOS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ConstraintScenarioDetectInput {
  packContext?: PackRuleConstraintInput;
  signals?: Record<string, unknown>;
  /** Explicit override for staging / tests */
  constraintScenarioId?: string;
}

/** Map runtime signals → rollout catalog scenarioId */
export function detectConstraintScenarioIds(
  input: ConstraintScenarioDetectInput,
): string[] {
  const ids = new Set<string>();

  if (input.constraintScenarioId) {
    ids.add(input.constraintScenarioId);
  }

  const explicit = input.signals?.constraintScenarioId;
  if (typeof explicit === 'string' && explicit.trim()) {
    ids.add(explicit.trim());
  }

  const pack = input.packContext;
  if (pack) {
    const road = pack.facts?.road as { status?: string } | undefined;
    if (pack.semanticKey === 'ROAD_SEGMENT_UNAVAILABLE' || road?.status === 'CLOSED') {
      ids.add('iceland-road-closed');
    }
  }

  const weather = input.signals?.weatherProhibitsOutdoor ?? input.signals?.stormBlocksOutdoor;
  if (weather === true || weather === 'ACTIVITY_PROHIBITED') {
    ids.add('weather-outdoor-storm');
  }

  if (input.signals?.excessiveDailyLoad === true) {
    ids.add('daily-load-excessive');
  }

  if (
    input.signals?.openingHoursConflict === true ||
    input.signals?.openingHoursViolation === true
  ) {
    ids.add('opening-hours-conflict');
  }

  if (
    input.signals?.ontologyVehicleRoute === true ||
    input.signals?.explorationReliabilityCheck === true
  ) {
    ids.add('iceland-ontology-vehicle-route');
  }

  if (input.signals?.ontologyInsuranceOrEntry === true) {
    ids.add('iceland-ontology-insurance-entry');
  }

  const ontologyCodes = input.signals?.ontologyConstraintCodes;
  if (Array.isArray(ontologyCodes)) {
    const vehicleCodes = new Set([
      'VEHICLE_CAPABILITY_MISMATCH',
      'RENTAL_CONTRACT_ROAD_PROHIBITION',
      'ROAD_STATUS_BLOCKED',
    ]);
    if (ontologyCodes.some((c) => vehicleCodes.has(String(c)))) {
      ids.add('iceland-ontology-vehicle-route');
    }
    const entryCodes = new Set([
      'INSURANCE_WATER_CROSSING_GAP',
      'ENTRY_ELIGIBILITY_UNKNOWN',
      'VISA_STATUS_UNCONFIRMED',
      'RENTAL_PICKUP_WINDOW_CONFLICT',
    ]);
    if (ontologyCodes.some((c) => entryCodes.has(String(c)))) {
      ids.add('iceland-ontology-insurance-entry');
    }
  }

  return [...ids];
}

export function shouldUseCanonicalConstraintAuthority(
  detectedScenarioIds: string[],
  onScenarios: string[] = parseConstraintGatewayOnScenarios(),
): boolean {
  if (!onScenarios.length || !detectedScenarioIds.length) return false;
  const enabled = new Set(onScenarios);
  return detectedScenarioIds.some((id) => enabled.has(id));
}
