/**
 * ONT-P2-04 — Expansion safety counters (must stay zero) + observation gate checklist
 */

export interface ExpansionMustBeZeroCounters {
  non_selected_emission: number;
  non_optin_emission: number;
  non_iceland_emission: number;
  other_semantic_emission: number;
  cross_cohort_duplicate_emission: number;
  variant_prediction_mismatch: number;
  prediction_version_mismatch: number;
  context_revision_mismatch: number;
  consent_sync_failure: number;
  withdrawal_failure: number;
  expired_advisory_actionable: number;
  user_believed_plan_auto_changed: number;
  user_missed_canonical_block: number;
  unnecessary_high_impact_plan_change: number;
  canonical_apply_invocation: number;
  assessment_mutation: number;
  plan_revision_created: number;
  ready_gate_changed: number;
  confirm_gate_changed: number;
  execute_gate_changed: number;
  blocking_notification_emitted: number;
}

export function createEmptyExpansionMustBeZero(): ExpansionMustBeZeroCounters {
  return {
    non_selected_emission: 0,
    non_optin_emission: 0,
    non_iceland_emission: 0,
    other_semantic_emission: 0,
    cross_cohort_duplicate_emission: 0,
    variant_prediction_mismatch: 0,
    prediction_version_mismatch: 0,
    context_revision_mismatch: 0,
    consent_sync_failure: 0,
    withdrawal_failure: 0,
    expired_advisory_actionable: 0,
    user_believed_plan_auto_changed: 0,
    user_missed_canonical_block: 0,
    unnecessary_high_impact_plan_change: 0,
    canonical_apply_invocation: 0,
    assessment_mutation: 0,
    plan_revision_created: 0,
    ready_gate_changed: 0,
    confirm_gate_changed: 0,
    execute_gate_changed: 0,
    blocking_notification_emitted: 0,
  };
}

export function expansionMustBeZeroAllClear(
  c: ExpansionMustBeZeroCounters,
): boolean {
  return Object.values(c).every((n) => n === 0);
}

export const EXPANSION_OBSERVATION_GATE_CHECKLIST = [
  'ALL_24_TRIPS_42_USERS_ELIGIBILITY_VERIFIED',
  'AT_LEAST_30_NATURAL_LIVE_EVENT_ADVISORIES',
  'AT_LEAST_20_USERS_DELIVERED',
  'AT_LEAST_15_USERS_SURFACED',
  'AT_LEAST_10_USERS_OPENED_OR_FEEDBACK',
  'BOTH_DISPLAY_VARIANTS_PREDICTION_IDENTICAL',
  'DELIVERED_SURFACED_OPENED_LEAK_EXPLAINED',
  'COVERS_PLANNING_PREDEPARTURE_EXECUTION',
  'COVERS_AT_LEAST_THREE_VEHICLE_CLASSES',
  'COVERS_PREDICTION_HOLD_REVERSAL_WITHDRAW_EXPIRE',
  'ALL_SAFETY_AND_CANONICAL_COUNTERS_ZERO',
  'EXPANSION_OBSERVATION_REPORT_FROZEN',
] as const;

export type ExpansionObservationGateCheckId =
  (typeof EXPANSION_OBSERVATION_GATE_CHECKLIST)[number];

export interface ExpansionObservationGateReport {
  schemaId: 'tripnara.ontology_p2_expansion_observation_gate@v1';
  workItem: 'ONT-P2-04';
  status: 'NOT_READY' | 'IN_PROGRESS' | 'PASS' | 'FAIL';
  productGate: 'NOT_AUTHORIZED';
  checks: Array<{ id: ExpansionObservationGateCheckId; ok: boolean; detail: string }>;
  mustBeZero: ExpansionMustBeZeroCounters;
  mustBeZeroClear: boolean;
  nextAllowed: Array<
    | 'CONTINUE_WAVE_3A_OBSERVATION'
    | 'APPROVE_WAVE_3B_WITHIN_EXPANSION_AUTH'
    | 'APPROVE_WAVE_3C_WITHIN_EXPANSION_AUTH'
    | 'FREEZE_EXPANSION_OBSERVATION_REPORT'
    | 'CONSIDER_PRODUCT_GATE_AFTER_PASS'
  >;
  nextForbidden: Array<
    | 'WEATHER_TEMPORAL_ADVISORY_PRODUCT_GATE'
    | 'P2_CANONICAL_AUTHORITY'
    | 'CHANGE_PREDICTION_FREQUENCY_OR_THRESHOLDS'
    | 'OPEN_ALL_24_42_WITHOUT_WAVE_GATES'
  >;
}

export function buildExpansionObservationGateStub(input: {
  mustBeZero?: ExpansionMustBeZeroCounters;
  wave: 'WAVE_3A' | 'WAVE_3B' | 'WAVE_3C';
}): ExpansionObservationGateReport {
  const mustBeZero = input.mustBeZero ?? createEmptyExpansionMustBeZero();
  const mustBeZeroClear = expansionMustBeZeroAllClear(mustBeZero);
  const checks = EXPANSION_OBSERVATION_GATE_CHECKLIST.map((id) => ({
    id,
    ok: false,
    detail:
      id === 'ALL_SAFETY_AND_CANONICAL_COUNTERS_ZERO'
        ? mustBeZeroClear
          ? 'counters currently zero (sample incomplete)'
          : 'nonzero safety/canonical counter'
        : 'pending live expansion observation',
  }));
  if (mustBeZeroClear) {
    const idx = checks.findIndex(
      (c) => c.id === 'ALL_SAFETY_AND_CANONICAL_COUNTERS_ZERO',
    );
    if (idx >= 0) checks[idx]!.ok = true;
  }

  return {
    schemaId: 'tripnara.ontology_p2_expansion_observation_gate@v1',
    workItem: 'ONT-P2-04',
    status: 'IN_PROGRESS',
    productGate: 'NOT_AUTHORIZED',
    checks,
    mustBeZero,
    mustBeZeroClear,
    nextAllowed: [
      input.wave === 'WAVE_3A'
        ? 'CONTINUE_WAVE_3A_OBSERVATION'
        : input.wave === 'WAVE_3B'
          ? 'APPROVE_WAVE_3C_WITHIN_EXPANSION_AUTH'
          : 'FREEZE_EXPANSION_OBSERVATION_REPORT',
    ],
    nextForbidden: [
      'WEATHER_TEMPORAL_ADVISORY_PRODUCT_GATE',
      'P2_CANONICAL_AUTHORITY',
      'CHANGE_PREDICTION_FREQUENCY_OR_THRESHOLDS',
      'OPEN_ALL_24_42_WITHOUT_WAVE_GATES',
    ],
  };
}
