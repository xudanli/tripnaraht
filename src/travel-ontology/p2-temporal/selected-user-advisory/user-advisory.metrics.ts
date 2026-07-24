/**
 * ONT-P2-03A — Selected User Pilot observation metrics + one-vote rollback
 */

import type { UserTemporalAdvisory } from './user-advisory.types';

export interface SelectedUserPilotMetrics {
  // Eligibility / boundary
  selected_optin_emission_count: number;
  non_selected_emission_count: number;
  non_optin_emission_count: number;
  non_iceland_emission_count: number;
  other_semantic_emission_count: number;

  // Understanding (manual adjudication rates — seeded in harness)
  prediction_identity_understood_rate: number | null;
  advisory_vs_canonical_confusion_rate: number | null;
  deadline_understood_rate: number | null;
  plan_auto_changed_misunderstanding_rate: number | null;

  // Behavior
  advisory_open_rate: number | null;
  details_view_rate: number | null;
  planning_entry_rate: number | null;
  dismiss_rate: number | null;
  feedback_rate: number | null;
  ignored_until_expired_rate: number | null;

  // Risk
  user_missed_canonical_block: number;
  user_believed_plan_auto_changed: number;
  unnecessary_high_impact_plan_change: number;
  stale_advisory_exposure: number;
  wrong_trip_or_segment_exposure: number;
  external_non_selected_emission: number;

  // Control boundary (must stay zero)
  canonical_apply_invocation: number;
  assessment_mutation: number;
  plan_revision_created: number;

  // Lifecycle hygiene
  superseded_advisory_visible: number;
  withdrawn_advisory_actionable: number;
  expired_deadline_visible: number;
  multiple_active_user_advisories: number;
  prediction_context_mismatch: number;
}

export function createEmptySelectedUserPilotMetrics(): SelectedUserPilotMetrics {
  return {
    selected_optin_emission_count: 0,
    non_selected_emission_count: 0,
    non_optin_emission_count: 0,
    non_iceland_emission_count: 0,
    other_semantic_emission_count: 0,
    prediction_identity_understood_rate: null,
    advisory_vs_canonical_confusion_rate: null,
    deadline_understood_rate: null,
    plan_auto_changed_misunderstanding_rate: null,
    advisory_open_rate: null,
    details_view_rate: null,
    planning_entry_rate: null,
    dismiss_rate: null,
    feedback_rate: null,
    ignored_until_expired_rate: null,
    user_missed_canonical_block: 0,
    user_believed_plan_auto_changed: 0,
    unnecessary_high_impact_plan_change: 0,
    stale_advisory_exposure: 0,
    wrong_trip_or_segment_exposure: 0,
    external_non_selected_emission: 0,
    canonical_apply_invocation: 0,
    assessment_mutation: 0,
    plan_revision_created: 0,
    superseded_advisory_visible: 0,
    withdrawn_advisory_actionable: 0,
    expired_deadline_visible: 0,
    multiple_active_user_advisories: 0,
    prediction_context_mismatch: 0,
  };
}

export function computeSelectedUserPilotMetrics(input: {
  advisories: UserTemporalAdvisory[];
  emissionAttempts?: Array<{
    emitted: boolean;
    tripSelected: boolean;
    optIn: boolean;
    destinationIs: boolean;
    semanticOk: boolean;
  }>;
  behavior?: Partial<
    Pick<
      SelectedUserPilotMetrics,
      | 'prediction_identity_understood_rate'
      | 'advisory_vs_canonical_confusion_rate'
      | 'deadline_understood_rate'
      | 'plan_auto_changed_misunderstanding_rate'
      | 'advisory_open_rate'
      | 'details_view_rate'
      | 'planning_entry_rate'
      | 'dismiss_rate'
      | 'feedback_rate'
      | 'ignored_until_expired_rate'
      | 'user_missed_canonical_block'
      | 'user_believed_plan_auto_changed'
      | 'unnecessary_high_impact_plan_change'
      | 'stale_advisory_exposure'
      | 'wrong_trip_or_segment_exposure'
    >
  >;
}): SelectedUserPilotMetrics {
  const m = createEmptySelectedUserPilotMetrics();

  for (const a of input.advisories) {
    if (a.status === 'ACTIVE') {
      m.selected_optin_emission_count += 1;
    }
  }

  // Multiple ACTIVE same user+trip+segment
  const activeKeys = new Map<string, number>();
  for (const a of input.advisories) {
    if (a.status !== 'ACTIVE') continue;
    const k = `${a.userId}::${a.tripId}::${a.routeSegmentId ?? '_'}`;
    activeKeys.set(k, (activeKeys.get(k) ?? 0) + 1);
  }
  for (const n of activeKeys.values()) {
    if (n > 1) m.multiple_active_user_advisories += n - 1;
  }

  for (const attempt of input.emissionAttempts ?? []) {
    if (!attempt.emitted) continue;
    if (!attempt.tripSelected) m.non_selected_emission_count += 1;
    if (!attempt.optIn) m.non_optin_emission_count += 1;
    if (!attempt.destinationIs) m.non_iceland_emission_count += 1;
    if (!attempt.semanticOk) m.other_semantic_emission_count += 1;
    if (!attempt.tripSelected || !attempt.optIn) {
      m.external_non_selected_emission += 1;
    }
  }

  Object.assign(m, input.behavior ?? {});
  return m;
}

export function selectedUserBoundaryAllZero(m: SelectedUserPilotMetrics): boolean {
  return (
    m.non_selected_emission_count === 0 &&
    m.non_optin_emission_count === 0 &&
    m.non_iceland_emission_count === 0 &&
    m.other_semantic_emission_count === 0 &&
    m.user_missed_canonical_block === 0 &&
    m.user_believed_plan_auto_changed === 0 &&
    m.external_non_selected_emission === 0 &&
    m.canonical_apply_invocation === 0 &&
    m.assessment_mutation === 0 &&
    m.plan_revision_created === 0 &&
    m.superseded_advisory_visible === 0 &&
    m.withdrawn_advisory_actionable === 0 &&
    m.expired_deadline_visible === 0 &&
    m.multiple_active_user_advisories === 0 &&
    m.prediction_context_mismatch === 0
  );
}

export type OneVoteRollbackTrigger =
  | 'NON_OPTIN_SAW_ADVISORY'
  | 'NON_SELECTED_TRIP_EMISSION'
  | 'USER_BELIEVED_PLAN_AUTO_CHANGED'
  | 'P2_WEAKENED_P1_BLOCK'
  | 'WITHDRAWAL_FAILED'
  | 'EXPIRED_DEADLINE_ACTIONABLE'
  | 'PREDICTION_ADVISORY_CONTEXT_MISMATCH'
  | 'UNNECESSARY_HIGH_IMPACT_CHANGE'
  | 'UNEXPLAINED_ACTIONABLE_FN'
  | 'CANONICAL_CONTROL_BOUNDARY_NONZERO';

export function evaluateOneVoteRollback(input: {
  metrics: SelectedUserPilotMetrics;
  triggers?: OneVoteRollbackTrigger[];
}): {
  rollback: boolean;
  command: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1';
  continues: {
    prediction: true;
    reconciliation: true;
    internalAdvisory: true;
    p0p1: true;
  };
  reasons: string[];
} {
  const reasons: string[] = [...(input.triggers ?? [])];
  const m = input.metrics;
  if (m.non_optin_emission_count > 0) reasons.push('NON_OPTIN_SAW_ADVISORY');
  if (m.non_selected_emission_count > 0) reasons.push('NON_SELECTED_TRIP_EMISSION');
  if (m.user_believed_plan_auto_changed > 0) {
    reasons.push('USER_BELIEVED_PLAN_AUTO_CHANGED');
  }
  if (m.expired_deadline_visible > 0) reasons.push('EXPIRED_DEADLINE_ACTIONABLE');
  if (m.prediction_context_mismatch > 0) {
    reasons.push('PREDICTION_ADVISORY_CONTEXT_MISMATCH');
  }
  if (m.unnecessary_high_impact_plan_change > 0) {
    reasons.push('UNNECESSARY_HIGH_IMPACT_CHANGE');
  }
  if (
    m.canonical_apply_invocation > 0 ||
    m.assessment_mutation > 0 ||
    m.plan_revision_created > 0
  ) {
    reasons.push('CANONICAL_CONTROL_BOUNDARY_NONZERO');
  }
  if (m.withdrawn_advisory_actionable > 0 || m.superseded_advisory_visible > 0) {
    reasons.push('WITHDRAWAL_FAILED');
  }

  const unique = [...new Set(reasons)];
  return {
    rollback: unique.length > 0,
    command: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1',
    continues: {
      prediction: true,
      reconciliation: true,
      internalAdvisory: true,
      p0p1: true,
    },
    reasons: unique,
  };
}
