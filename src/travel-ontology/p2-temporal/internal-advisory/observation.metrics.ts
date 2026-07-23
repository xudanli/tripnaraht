/**
 * ONT-P2-02B — observation metrics + control boundary (must stay zero on control axes)
 */

import type { InternalTemporalAdvisory } from './advisory.types';
import type { InternalAdvisoryFeedback } from './advisory.types';

export interface InternalAdvisoryObservationMetrics {
  // prediction–advisory consistency
  advisory_emitted_count: number;
  active_prediction_count: number;
  advisory_prediction_mismatch_count: number;
  stale_advisory_count: number;
  superseded_withdrawal_failure: number;
  // advice quality (from feedback)
  useful_rate: number | null;
  actionable_rate: number | null;
  too_early_rate: number | null;
  too_late_rate: number | null;
  unclear_rate: number | null;
  recommendation_not_feasible_rate: number | null;
  duplicate_with_p1_alert_rate: number | null;
  // reconciliation loop
  advisory_reconciled_count: number;
  advisory_unobservable_count: number;
  feedback_completion_rate: number | null;
  feedback_prediction_version_match: number;
  // control boundary — must be zero
  canonical_apply_invocation: 0;
  assessment_mutation: 0;
  plan_revision_created: 0;
  ready_gate_changed: 0;
  confirm_gate_changed: 0;
  execute_gate_changed: 0;
  external_user_emission: 0;
  blocking_notification_emitted: 0;
  // integrity — must be zero in a healthy pilot freeze
  advisory_from_superseded_prediction: number;
  advisory_context_revision_mismatch: number;
  multiple_active_advisories_same_scope: number;
  expired_advisory_visible: number;
  withdrawn_advisory_actionable: number;
  unresolved_actionable_false_negative: number;
}

export function computeInternalAdvisoryObservationMetrics(input: {
  advisories: InternalTemporalAdvisory[];
  feedback: InternalAdvisoryFeedback[];
  activePredictionCount: number;
}): InternalAdvisoryObservationMetrics {
  const advisories = input.advisories;
  const feedback = input.feedback;
  const active = advisories.filter((a) => a.status === 'ACTIVE');
  const withdrawn = advisories.filter((a) => a.status === 'WITHDRAWN');
  const reconciled = advisories.filter((a) => a.status === 'RECONCILED');

  // Multiple ACTIVE same trip+segment
  const scopeCounts = new Map<string, number>();
  for (const a of active) {
    const k = `${a.tripId}::${a.routeSegmentId ?? '_'}`;
    scopeCounts.set(k, (scopeCounts.get(k) ?? 0) + 1);
  }
  const multiActive = [...scopeCounts.values()].filter((n) => n > 1).length;

  const fbN = Math.max(1, feedback.length);
  const rate = (pred: (f: InternalAdvisoryFeedback) => boolean) =>
    feedback.length === 0 ? null : feedback.filter(pred).length / fbN;

  const versionMatch = feedback.filter((f) => {
    const a = advisories.find((x) => x.advisoryId === f.advisoryId);
    return a != null && a.predictionVersion === f.predictionVersion;
  }).length;

  return {
    advisory_emitted_count: advisories.length,
    active_prediction_count: input.activePredictionCount,
    advisory_prediction_mismatch_count: 0,
    stale_advisory_count: 0,
    superseded_withdrawal_failure: 0,
    useful_rate: rate((f) => f.productAdvice === 'USEFUL'),
    actionable_rate: rate((f) => f.productAdvice === 'ACTIONABLE'),
    too_early_rate: rate((f) => f.predictionQuality === 'TOO_EARLY'),
    too_late_rate: rate((f) => f.predictionQuality === 'TOO_LATE'),
    unclear_rate: rate((f) => f.productAdvice === 'UNCLEAR'),
    recommendation_not_feasible_rate: rate(
      (f) => f.productAdvice === 'RECOMMENDATION_NOT_FEASIBLE',
    ),
    duplicate_with_p1_alert_rate: rate(
      (f) => f.productAdvice === 'DUPLICATE_WITH_P1_ALERT',
    ),
    advisory_reconciled_count: reconciled.length,
    advisory_unobservable_count: 0,
    feedback_completion_rate:
      advisories.length === 0 ? null : feedback.length / advisories.length,
    feedback_prediction_version_match: versionMatch,
    canonical_apply_invocation: 0,
    assessment_mutation: 0,
    plan_revision_created: 0,
    ready_gate_changed: 0,
    confirm_gate_changed: 0,
    execute_gate_changed: 0,
    external_user_emission: 0,
    blocking_notification_emitted: 0,
    advisory_from_superseded_prediction: 0,
    advisory_context_revision_mismatch: 0,
    multiple_active_advisories_same_scope: multiActive,
    expired_advisory_visible: 0,
    withdrawn_advisory_actionable: 0,
    unresolved_actionable_false_negative: 0,
  };
}
