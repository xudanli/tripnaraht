/**
 * ONT-P2-03A — Selected User Temporal Advisory Pilot authorization (APPROVED)
 */

import { createHash } from 'crypto';

export const P2_03A_APPROVED_AUTH_SCHEMA_ID =
  'tripnara.ontology_p2_selected_user_temporal_advisory_authorization@v2' as const;

export const SELECTED_USER_APPROVED_TRIP_IDS = [
  'ont_p2_is_user_optin_weather_01',
  'ont_p2_is_user_optin_weather_02',
  'ont_p2_is_user_optin_weather_03',
  'ont_p2_is_user_optin_weather_04',
  'ont_p2_is_user_optin_weather_05',
  'ont_canary_is_wind_01',
  'ont_canary_is_wind_02',
] as const;

export const SELECTED_USER_APPROVED_USER_IDS = [
  'user_optin_is_01',
  'user_optin_is_02',
  'user_optin_is_03',
  'user_optin_is_04',
  'user_optin_is_05',
  'user_optin_is_06',
  'user_optin_is_07',
  'user_optin_is_08',
  'user_optin_is_09',
  'user_optin_is_10',
  'user_optin_is_11',
  'user_optin_is_12',
] as const;

export const SELECTED_USER_CONSENT_VERSION = 'p2-user-advisory-consent@v1' as const;

export interface SelectedUserTemporalAdvisoryAuthorizationApproved {
  schemaId: typeof P2_03A_APPROVED_AUTH_SCHEMA_ID;
  workItem: 'ONT-P2-03A';
  title: 'Selected User Temporal Advisory Pilot';
  decision: 'APPROVE_SELECTED_USER_TEMPORAL_ADVISORY_PILOT';
  status: 'APPROVED_SELECTED_USER_ADVISORY_PILOT';
  submittedAt: string;
  approvedAt: string;
  approvedBy: string;
  authorizationHash: string;

  authorityMode: 'SHADOW';
  deliveryMode: 'ADVISORY_ONLY';
  audience: 'EXPLICIT_OPT_IN_SELECTED_USERS';
  destination: 'IS';
  semanticScope: 'WEATHER_DETERIORATION';

  canonicalControl: 'FORBIDDEN';
  automaticPlanMutation: 'FORBIDDEN';
  blockingNotification: 'FORBIDDEN';
  externalFullRollout: 'NOT_AUTHORIZED';
  semanticScopeExpansion: 'NOT_AUTHORIZED';

  approvedTripIds: string[];
  approvedUserIds: string[];
  consentVersion: typeof SELECTED_USER_CONSENT_VERSION;
  approvedViewers: string[];
  approvedSemanticScope: 'WEATHER_DETERIORATION';
  predictionRuntimeVersion: string;
  advisoryProjectionVersion: string;
  qualityBaselineVersion: string;
  rollbackCommand: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1';
  killSwitchEnv: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH';

  dependencies: {
    qualityGate02A: 'PASS';
    observationGate02C: 'PASS';
    weatherShadowPilot: 'ACTIVE';
    p1CanonicalPriority: 'ENFORCED';
    frozenObservationFingerprint?: string;
  };

  permissions: {
    showTemporalAdvisoryToOptInUser: true;
    collectUserFeedback: true;
    enterExistingPlanningFlow: true;
    viewEvidenceAndUpdates: true;
    dismissExperiment: true;
  };

  prohibitions: {
    oneClickAdopt: true;
    autoReroute: true;
    immediateConfirm: true;
    continueExecuteShortcut: true;
    ignoreCanonicalRisk: true;
    mutateConstraintAssessment: true;
    callCanonicalApply: true;
    modifyPlanDirectly: true;
    triggerBlockFromAdvisory: true;
    weakenP1CanonicalBlock: true;
  };

  notes: string[];
}

function computeAuthHash(payload: Omit<SelectedUserTemporalAdvisoryAuthorizationApproved, 'authorizationHash'>): string {
  const { notes: _n, ...rest } = payload;
  void _n;
  return `ah_${createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 24)}`;
}

export function approveSelectedUserTemporalAdvisoryPilot(input: {
  submittedAt: string;
  nowMs?: number;
  approvedBy?: string;
  frozenObservationFingerprint?: string;
}): SelectedUserTemporalAdvisoryAuthorizationApproved {
  const approvedAt = new Date(input.nowMs ?? Date.now()).toISOString();
  const base: Omit<SelectedUserTemporalAdvisoryAuthorizationApproved, 'authorizationHash'> = {
    schemaId: P2_03A_APPROVED_AUTH_SCHEMA_ID,
    workItem: 'ONT-P2-03A',
    title: 'Selected User Temporal Advisory Pilot',
    decision: 'APPROVE_SELECTED_USER_TEMPORAL_ADVISORY_PILOT',
    status: 'APPROVED_SELECTED_USER_ADVISORY_PILOT',
    submittedAt: input.submittedAt,
    approvedAt,
    approvedBy: input.approvedBy ?? 'ontology-product-authority',
    authorityMode: 'SHADOW',
    deliveryMode: 'ADVISORY_ONLY',
    audience: 'EXPLICIT_OPT_IN_SELECTED_USERS',
    destination: 'IS',
    semanticScope: 'WEATHER_DETERIORATION',
    canonicalControl: 'FORBIDDEN',
    automaticPlanMutation: 'FORBIDDEN',
    blockingNotification: 'FORBIDDEN',
    externalFullRollout: 'NOT_AUTHORIZED',
    semanticScopeExpansion: 'NOT_AUTHORIZED',
    approvedTripIds: [...SELECTED_USER_APPROVED_TRIP_IDS],
    approvedUserIds: [...SELECTED_USER_APPROVED_USER_IDS],
    consentVersion: SELECTED_USER_CONSENT_VERSION,
    approvedViewers: [...SELECTED_USER_APPROVED_USER_IDS],
    approvedSemanticScope: 'WEATHER_DETERIORATION',
    predictionRuntimeVersion: 'p2.0.0-shadow',
    advisoryProjectionVersion: 'p2.user-advisory.projection@v1',
    qualityBaselineVersion: 'tripnara.ontology_p2_weather_quality_baseline@v1',
    rollbackCommand: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1',
    killSwitchEnv: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH',
    dependencies: {
      qualityGate02A: 'PASS',
      observationGate02C: 'PASS',
      weatherShadowPilot: 'ACTIVE',
      p1CanonicalPriority: 'ENFORCED',
      frozenObservationFingerprint: input.frozenObservationFingerprint,
    },
    permissions: {
      showTemporalAdvisoryToOptInUser: true,
      collectUserFeedback: true,
      enterExistingPlanningFlow: true,
      viewEvidenceAndUpdates: true,
      dismissExperiment: true,
    },
    prohibitions: {
      oneClickAdopt: true,
      autoReroute: true,
      immediateConfirm: true,
      continueExecuteShortcut: true,
      ignoreCanonicalRisk: true,
      mutateConstraintAssessment: true,
      callCanonicalApply: true,
      modifyPlanDirectly: true,
      triggerBlockFromAdvisory: true,
      weakenP1CanonicalBlock: true,
    },
    notes: [
      'APPROVE_SELECTED_USER_TEMPORAL_ADVISORY_PILOT — SHADOW advisory for explicit Opt-in users only',
      'Does NOT mean P2 is Canonical or may trigger BLOCK / mutate plan',
      'P1 Canonical Assessment > P2 SHADOW Advisory',
      'Adjust itinerary must enter Decision/Preview → Canonical Assessment → Confirm → Canonical Apply',
      'Activate with Kill Switch ON first, dry-run, then disable Kill Switch',
    ],
  };

  return {
    ...base,
    authorizationHash: computeAuthHash(base),
  };
}
