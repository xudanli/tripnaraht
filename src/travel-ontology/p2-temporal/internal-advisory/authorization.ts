/**
 * ONT-P2-02B — Internal Temporal Advisory authorization + scope freeze
 */

export const INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS = [
  'ont_p2_is_weather_shadow_01',
  'ont_p2_is_weather_shadow_02',
  'ont_canary_is_wind_01',
  'ont_pilot_is_continuous_mod_01',
] as const;

export const APPROVED_INTERNAL_REVIEWERS = [
  'reviewer.ontology.pm',
  'reviewer.ontology.qa',
  'reviewer.iceland.ops',
] as const;

export type InternalAdvisoryAuthStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED_INTERNAL_ADVISORY_ONLY'
  | 'APPROVED' // legacy alias — treat as APPROVED_INTERNAL_ADVISORY_ONLY
  | 'REJECTED'
  | 'BLOCKED_PENDING_02A';

export interface InternalTemporalAdvisoryAuthorizationV2 {
  schemaId: 'tripnara.ontology_p2_internal_temporal_advisory_authorization@v2';
  workItem: 'ONT-P2-02B';
  title: 'Internal Temporal Advisory Pilot';
  decision: 'APPROVE_INTERNAL_TEMPORAL_ADVISORY_PILOT';
  status: InternalAdvisoryAuthStatus;
  submittedAt?: string;
  approvedAt?: string;
  approver?: string;
  prerequisite: {
    workItem: 'ONT-P2-02A';
    qualityGateVerdict: 'PASS';
    ledgerComplete: true;
  };
  scope: {
    destination: 'IS';
    semanticScope: 'WEATHER_DETERIORATION';
    tripIds: string[];
    approvedInternalReviewers: string[];
    authorityMode: 'SHADOW';
    audience: 'SELECTED_INTERNAL_ONLY';
  };
  permissions: {
    showPredictedOnset: true;
    showPredictedDeterioration: true;
    showInterventionDeadline: true;
    showRecommendedDraft: true;
    showEvidenceAndConfidence: true;
    collectStructuredHumanFeedback: true;
    feedFeedbackIntoOutcomeReconciliation: true;
  };
  prohibitions: {
    mutateConstraintAssessment: true;
    callCanonicalApply: true;
    createPlanRevision: true;
    changeReadyGate: true;
    changeConfirmGate: true;
    changeExecuteGate: true;
    externalUserPush: true;
    userBlockingNotification: true;
    autoModifyItinerary: true;
    weakenP1CanonicalAssessment: true;
  };
  killSwitchEnv: 'ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH';
  canonicalControl: 'FORBIDDEN';
  externalUserEmission: 'FORBIDDEN';
  notes: string[];
}

export function isInternalAdvisoryApproved(
  status: InternalAdvisoryAuthStatus,
): boolean {
  return (
    status === 'APPROVED_INTERNAL_ADVISORY_ONLY' || status === 'APPROVED'
  );
}

export function approveInternalTemporalAdvisoryPilot(input: {
  submittedAt: string;
  nowMs?: number;
  approver?: string;
}): InternalTemporalAdvisoryAuthorizationV2 {
  const approvedAt = new Date(input.nowMs ?? Date.now()).toISOString();
  return {
    schemaId: 'tripnara.ontology_p2_internal_temporal_advisory_authorization@v2',
    workItem: 'ONT-P2-02B',
    title: 'Internal Temporal Advisory Pilot',
    decision: 'APPROVE_INTERNAL_TEMPORAL_ADVISORY_PILOT',
    status: 'APPROVED_INTERNAL_ADVISORY_ONLY',
    submittedAt: input.submittedAt,
    approvedAt,
    approver: input.approver ?? 'ontology-product-authority',
    prerequisite: {
      workItem: 'ONT-P2-02A',
      qualityGateVerdict: 'PASS',
      ledgerComplete: true,
    },
    scope: {
      destination: 'IS',
      semanticScope: 'WEATHER_DETERIORATION',
      tripIds: [...INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS],
      approvedInternalReviewers: [...APPROVED_INTERNAL_REVIEWERS],
      authorityMode: 'SHADOW',
      audience: 'SELECTED_INTERNAL_ONLY',
    },
    permissions: {
      showPredictedOnset: true,
      showPredictedDeterioration: true,
      showInterventionDeadline: true,
      showRecommendedDraft: true,
      showEvidenceAndConfidence: true,
      collectStructuredHumanFeedback: true,
      feedFeedbackIntoOutcomeReconciliation: true,
    },
    prohibitions: {
      mutateConstraintAssessment: true,
      callCanonicalApply: true,
      createPlanRevision: true,
      changeReadyGate: true,
      changeConfirmGate: true,
      changeExecuteGate: true,
      externalUserPush: true,
      userBlockingNotification: true,
      autoModifyItinerary: true,
      weakenP1CanonicalAssessment: true,
    },
    killSwitchEnv: 'ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH',
    canonicalControl: 'FORBIDDEN',
    externalUserEmission: 'FORBIDDEN',
    notes: [
      'APPROVED_INTERNAL_ADVISORY_ONLY — SHADOW temporal advice for internal reviewers',
      'Not ordinary-user advisory; not Canonical authority upgrade',
      'P1 Canonical Assessment > P2 SHADOW Advisory',
      'Independent kill switch: ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH',
    ],
  };
}
