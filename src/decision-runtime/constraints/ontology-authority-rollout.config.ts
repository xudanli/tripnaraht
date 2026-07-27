/**
 * Ontology authority rollout (restored).
 * Kill switch env: ONTOLOGY_AUTHORITY_KILL_SWITCH
 */

import {
  isIcelandOntologyDestination,
  isOntologyAuthoritySelectedCanaryTrip,
  loadOntologyAuthoritySelectedTripsWhitelist,
} from './ontology-authority-selected-trips';

export type OntologyAuthorityRolloutMode =
  | 'OFF'
  | 'SHADOW'
  | 'ON_FOR_SELECTED'
  | 'DEFAULT_READ'
  | 'ON';

const ICELAND_P0_SCENARIO_SEMANTICS = [
  'VEHICLE_ROUTE',
  'INSURANCE_GAP',
  'WIND_CAMPER',
  'VISA_ENTRY',
  'FLIGHT_RENTAL_PICKUP',
] as const;

export type IcelandOntologyScenarioSemantics =
  (typeof ICELAND_P0_SCENARIO_SEMANTICS)[number];

export interface OntologyAuthorityAccessContext {
  tripId?: string | null;
  destination?: string | null;
  semanticScope?: string | null;
}

export type OntologyAuthorityWriteContext = OntologyAuthorityAccessContext;

export function isIcelandFiveScenarioSemantic(
  semantic: string | null | undefined,
): semantic is IcelandOntologyScenarioSemantics {
  if (!semantic) return false;
  return (ICELAND_P0_SCENARIO_SEMANTICS as readonly string[]).includes(semantic);
}

export function isOntologyAuthorityInternalGate1Enabled(): boolean {
  const v = process.env.ONTOLOGY_AUTHORITY_INTERNAL_GATE1?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isOntologyAuthorityProductionOnUnlocked(): boolean {
  const v = process.env.ONTOLOGY_AUTHORITY_PRODUCTION_ON_UNLOCKED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Primary ontology authority kill switch (restored from dist). */
export function isOntologyAuthorityKillSwitchEngaged(): boolean {
  const v = process.env.ONTOLOGY_AUTHORITY_KILL_SWITCH?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function resolveOntologyAuthorityRolloutMode(): OntologyAuthorityRolloutMode {
  const raw = process.env.ONTOLOGY_AUTHORITY_ROLLOUT_MODE?.trim().toUpperCase();
  if (
    raw === 'OFF' ||
    raw === 'SHADOW' ||
    raw === 'ON_FOR_SELECTED' ||
    raw === 'DEFAULT_READ' ||
    raw === 'ON'
  ) {
    if (raw === 'ON' || raw === 'ON_FOR_SELECTED' || raw === 'DEFAULT_READ') {
      if (
        !isOntologyAuthorityProductionOnUnlocked() &&
        !isOntologyAuthorityInternalGate1Enabled()
      ) {
        return 'SHADOW';
      }
    }
    return raw;
  }
  if (isOntologyAuthorityInternalGate1Enabled()) return 'ON';
  return 'SHADOW';
}

export function tripIdSuggestsIceland(tripId: string | null | undefined): boolean {
  if (!tripId) return false;
  const t = tripId.toLowerCase();
  return (
    t.includes('_is_') ||
    t.startsWith('ont_canary_is_') ||
    t.startsWith('ont_pilot_is_') ||
    t.startsWith('pilot_is_') ||
    t.includes('iceland')
  );
}

export function isEligibleIcelandTrip(ctx?: OntologyAuthorityAccessContext): boolean {
  if (isIcelandOntologyDestination(ctx?.destination ?? undefined)) return true;
  if (tripIdSuggestsIceland(ctx?.tripId)) return true;
  if (isOntologyAuthoritySelectedCanaryTrip(ctx?.tripId)) return true;
  return false;
}

export function isWithinIcelandFiveScenarioScope(
  ctx?: OntologyAuthorityAccessContext,
): boolean {
  const sem = ctx?.semanticScope?.trim();
  if (!sem) return true;
  return isIcelandFiveScenarioSemantic(sem);
}

export function getIcelandOntologyAuthorityScope() {
  const killSwitch = isOntologyAuthorityKillSwitchEngaged();
  const mode = killSwitch ? ('OFF' as const) : resolveOntologyAuthorityRolloutMode();
  const wl = loadOntologyAuthoritySelectedTripsWhitelist();
  return {
    destination: 'IS' as const,
    scenarios: ICELAND_P0_SCENARIO_SEMANTICS,
    mode,
    killSwitch,
    productionOnUnlocked: isOntologyAuthorityProductionOnUnlocked(),
    internalGate1: isOntologyAuthorityInternalGate1Enabled(),
    maxProductionModeBeforeUnlock: 'SHADOW' as const,
    canaryTripIds: wl.tripIds,
    postUnlockRecommendedMode: 'DEFAULT_READ' as const,
  };
}

export function ontologyAuthorityMayConsumeCanonicalAssessment(
  ctx?: OntologyAuthorityAccessContext,
): boolean {
  if (isOntologyAuthorityKillSwitchEngaged()) return false;
  if (!isWithinIcelandFiveScenarioScope(ctx)) return false;
  const mode = resolveOntologyAuthorityRolloutMode();
  if (mode === 'OFF' || mode === 'SHADOW') return false;
  if (mode === 'ON_FOR_SELECTED') {
    return isOntologyAuthoritySelectedCanaryTrip(ctx?.tripId);
  }
  if (mode === 'DEFAULT_READ' || mode === 'ON') {
    return isEligibleIcelandTrip(ctx);
  }
  return false;
}

export function ontologyAuthorityMayWriteEffectivePlan(
  ctx?: OntologyAuthorityWriteContext,
): boolean {
  if (isOntologyAuthorityKillSwitchEngaged()) return false;
  if (!isWithinIcelandFiveScenarioScope(ctx)) return false;
  const mode = resolveOntologyAuthorityRolloutMode();
  if (mode === 'ON') return isEligibleIcelandTrip(ctx);
  if (mode === 'ON_FOR_SELECTED' || mode === 'DEFAULT_READ') {
    return isOntologyAuthoritySelectedCanaryTrip(ctx?.tripId);
  }
  return false;
}

export function ontologyAuthorityObservabilityLabels(): Record<string, string> {
  const scope = getIcelandOntologyAuthorityScope();
  return {
    ontology_authority_mode: scope.mode,
    ontology_authority_dest: scope.destination,
    ontology_authority_kill_switch: String(scope.killSwitch),
    ontology_authority_prod_unlocked: String(scope.productionOnUnlocked),
    ontology_authority_internal_gate1: String(scope.internalGate1),
    ontology_authority_canary_trips: String(scope.canaryTripIds.length),
    ontology_authority_default_read: String(
      scope.mode === 'DEFAULT_READ' || scope.mode === 'ON',
    ),
  };
}
