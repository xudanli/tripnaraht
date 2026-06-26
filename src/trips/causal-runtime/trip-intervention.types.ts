/**
 * Unified TripIntervention — canonical intervention contract across What-If,
 * causal-physics do-operator, and in-trip actuator paths.
 */

export type TripInterventionType =
  | 'SHIFT_TIME'
  | 'CHANGE_ROUTE'
  | 'REMOVE_ITEM'
  | 'REPLACE_ITEM'
  | 'CHANGE_TRANSPORT'
  | 'SPLIT_GROUP'
  | 'CHANGE_SUPPLIER'
  | 'ADD_BUFFER'
  | 'CHANGE_RESERVATION'
  | 'WAIT_FOR_WINDOW'
  | 'RETREAT_MODE'
  | 'EMERGENCY_CUTOFF';

export type TripInterventionEffectDirection = 'UP' | 'DOWN';

export interface TripInterventionExpectedEffect {
  metric: string;
  direction: TripInterventionEffectDirection;
  estimatedMagnitude?: number;
  confidence: number;
}

export interface TripInterventionSideEffect {
  metric: string;
  estimatedImpact: number;
}

/** Evidence tier for causal edges — gates auto-decision vs suggest-only. */
export type MechanismEvidenceTier =
  | 'verified_mechanism'
  | 'expert_rule'
  | 'statistical_correlation'
  | 'hypothesis_unverified'
  | 'individual_assumption';

export interface TripIntervention {
  interventionId: string;
  type: TripInterventionType;
  /** Causal variable id, e.g. `temporal:departure_time`, `weather:wind_exposure`. */
  targetVariable: string;
  previousValue?: unknown;
  proposedValue?: unknown;
  expectedEffects: TripInterventionExpectedEffect[];
  sideEffects: TripInterventionSideEffect[];
  /** Source subsystem for audit / replay. */
  source?: 'what_if' | 'causal_physics' | 'actuator' | 'guardian_repair' | 'manual';
  evidenceTier?: MechanismEvidenceTier;
  title?: string;
  description?: string;
}
