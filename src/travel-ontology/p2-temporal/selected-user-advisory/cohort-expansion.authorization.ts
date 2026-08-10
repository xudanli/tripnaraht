/**
 * ONT-P2-04 — Selected User Cohort Expansion Authorization
 * Submit → Approve. 24 trips / 42 users is authorized TOTAL (not additive delta).
 * Activation remains wave-gated (3A → 3B → 3C). Product Gate not authorized.
 */

import { createHash } from 'crypto';
import {
  assertCohortExpansionSizeInBand,
  COHORT_EXPANSION_TRIP_DIVERSITY,
  COHORT_EXPANSION_TRIP_IDS,
  COHORT_EXPANSION_USER_IDS,
} from './cohort-expansion.cohort';
import { COHORT_DISPLAY_VARIANT_IDS } from './cohort-expansion.display-variant';
import { COHORT_FUNNEL_STAGES } from './cohort-expansion.funnel';
import { COHORT_EXPANSION_KILL_SWITCH_ENV } from './cohort-expansion.kill-switch';
import { SELECTED_USER_CONSENT_VERSION } from './authorization';

export const P2_04_COHORT_EXPANSION_AUTH_SCHEMA_ID =
  'tripnara.ontology_p2_selected_user_cohort_expansion_authorization@v1' as const;

/** Submitted-auth hash from ONT-P2-04 submit (rebind target). */
export const P2_04_SUBMITTED_AUTHORIZATION_HASH =
  'ah_abe0b2911f3e411eff5a6379' as const;

export type CohortExpansionAuthStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED_SELECTED_USER_COHORT_EXPANSION'
  | 'BLOCKED_PENDING_03C'
  | 'REJECTED';

export type CohortExpansionDecision =
  | 'SUBMIT_SELECTED_USER_ADVISORY_COHORT_EXPANSION'
  | 'APPROVE_SELECTED_USER_COHORT_EXPANSION';

export interface SelectedUserCohortExpansionAuthorization {
  schemaId: typeof P2_04_COHORT_EXPANSION_AUTH_SCHEMA_ID;
  workItem: 'ONT-P2-04';
  title: 'Selected User Cohort Expansion Authorization';
  decision: CohortExpansionDecision;
  status: CohortExpansionAuthStatus;
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  authorizationHash?: string;
  /** When APPROVED, retains the SUBMITTED hash for provenance rebinding */
  submittedAuthorizationHash?: string;

  prerequisite: {
    workItem: 'ONT-P2-03C';
    wave2ObservationVerdict: 'PASS' | 'FAIL' | 'UNKNOWN';
    wave2Decision: 'SELECTED_USER_ADVISORY_COHORT_EXPANSION' | 'NONE';
    wave2FreezeFingerprint?: string;
    priorAuthorizationHash: string;
    priorCommitSha: string;
    priorBuildArtifactHash: string;
  };

  /** Authorized TOTAL after expansion — not “+24/+42 on top of prior”. */
  authorizedTotalScope: {
    trips: 24;
    users: 42;
    destination: 'IS';
    semanticScope: 'WEATHER_DETERIORATION';
    authorityMode: 'SHADOW';
    deliveryMode: 'ADVISORY_ONLY';
  };

  authorityMode: 'SHADOW';
  deliveryMode: 'ADVISORY_ONLY';
  audience: 'EXPLICIT_OPT_IN_SELECTED_USERS';
  destination: 'IS';
  semanticScope: 'WEATHER_DETERIORATION';

  predictionUnchanged: {
    frequency: 'UNCHANGED';
    thresholds: 'UNCHANGED';
    semanticScope: 'WEATHER_DETERIORATION';
    predictionRuntimeVersion: 'p2.0.0-shadow';
    qualityBaselineVersion: 'tripnara.ontology_p2_weather_quality_baseline@v1';
  };

  canonicalControl: 'FORBIDDEN';
  predictionThresholdChange: 'FORBIDDEN';
  predictionFrequencyChange: 'FORBIDDEN';
  automaticPlanMutation: 'FORBIDDEN';
  blockingNotification: 'FORBIDDEN';
  externalFullRollout: 'NOT_AUTHORIZED';
  semanticScopeExpansion: 'NOT_AUTHORIZED';
  productGate: 'NOT_AUTHORIZED';
  productGateEntry: 'NOT_AUTHORIZED_UNTIL_COVERAGE';

  proposedTripIds: string[];
  proposedUserIds: string[];
  priorTripCount: number;
  priorUserCount: number;
  proposedTripCount: number;
  proposedUserCount: number;
  tripDiversitySummary: Array<{ region: string; tripCount: number }>;
  consentVersion: typeof SELECTED_USER_CONSENT_VERSION;
  requiresExplicitOptInAndAllowlist: true;

  activationPlan: {
    waves: Array<'WAVE_3A' | 'WAVE_3B' | 'WAVE_3C'>;
    wave3aTarget: { trips: 12; users: 22 };
    wave3bTarget: { trips: 18; users: 32 };
    wave3cTarget: { trips: 24; users: 42 };
    note: 'Same APPROVED expansion auth; progressive waves — not Product Gate';
  };

  observationPlan: {
    funnelStages: typeof COHORT_FUNNEL_STAGES;
    displayVariantIds: typeof COHORT_DISPLAY_VARIANT_IDS;
    displayVariantConstraint: 'SAME_PREDICTION_DATA_ONLY';
    stableVariantBinding: 'userId';
    coverageGatesBeforeProductGate: Array<
      | 'NATURAL_EVENTS_PRESENT'
      | 'USER_EXPOSURE_SURFACED_OPENED'
      | 'FEEDBACK_ACTION_COVERAGE'
    >;
    nextDecisionAfterCoverage:
      | 'WEATHER_TEMPORAL_ADVISORY_PRODUCT_GATE'
      | 'CONTINUE_COHORT_OBSERVATION'
      | 'ROLLBACK';
  };

  permissions: {
    expandSelectedAllowlist: true;
    showTemporalAdvisoryToOptInUser: true;
    collectUserFeedback: true;
    enterExistingPlanningFlow: true;
    runLimitedDisplayVariantTest: true;
    instrumentFullFunnel: true;
    activateWave3A: true;
    activateWave3BAfter3AClear: true;
    activateWave3CAfter3BClear: true;
  };

  prohibitions: {
    changePredictionFrequency: true;
    changePredictionThresholds: true;
    expandSemanticScope: true;
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
    enterProductGateWithoutCoverage: true;
    openFull24x42InOneStep: true;
  };

  rollbackCommand: 'ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH=1';
  killSwitchEnv: typeof COHORT_EXPANSION_KILL_SWITCH_ENV;
  priorCohortKillSwitchEnv: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH';
  notes: string[];
}

function summarizeDiversity(): Array<{ region: string; tripCount: number }> {
  const map = new Map<string, number>();
  for (const row of COHORT_EXPANSION_TRIP_DIVERSITY) {
    map.set(row.region, (map.get(row.region) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([region, tripCount]) => ({ region, tripCount }))
    .sort((a, b) => a.region.localeCompare(b.region));
}

function computeAuthHash(
  payload: Omit<SelectedUserCohortExpansionAuthorization, 'authorizationHash' | 'notes'>,
): string {
  return `ah_${createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)}`;
}

function buildBaseFields(input: {
  wave2ObservationVerdict: 'PASS' | 'FAIL';
  wave2Decision?: 'SELECTED_USER_ADVISORY_COHORT_EXPANSION' | 'NONE';
  wave2FreezeFingerprint?: string;
  priorAuthorizationHash?: string;
  priorCommitSha?: string;
  priorBuildArtifactHash?: string;
  size: { tripCount: number; userCount: number; ok: boolean; reasons: string[] };
}): Omit<
  SelectedUserCohortExpansionAuthorization,
  | 'decision'
  | 'status'
  | 'submittedAt'
  | 'approvedAt'
  | 'approvedBy'
  | 'authorizationHash'
  | 'submittedAuthorizationHash'
  | 'notes'
> {
  return {
    schemaId: P2_04_COHORT_EXPANSION_AUTH_SCHEMA_ID,
    workItem: 'ONT-P2-04',
    title: 'Selected User Cohort Expansion Authorization',
    prerequisite: {
      workItem: 'ONT-P2-03C',
      wave2ObservationVerdict: input.wave2ObservationVerdict,
      wave2Decision:
        input.wave2ObservationVerdict === 'PASS'
          ? (input.wave2Decision ?? 'SELECTED_USER_ADVISORY_COHORT_EXPANSION')
          : 'NONE',
      wave2FreezeFingerprint:
        input.wave2ObservationVerdict === 'PASS'
          ? (input.wave2FreezeFingerprint ?? 'frz_w2_54c2cea7bd3048ea030ddfbd')
          : undefined,
      priorAuthorizationHash:
        input.priorAuthorizationHash ?? 'ah_e53d405a643c2e08f5471696',
      priorCommitSha:
        input.priorCommitSha ?? '89b82bc25abadc222c56380492d4d4119cbeeaa3',
      priorBuildArtifactHash:
        input.priorBuildArtifactHash ?? 'bh_809b8d07af4d6735fff28c30',
    },
    authorizedTotalScope: {
      trips: 24,
      users: 42,
      destination: 'IS',
      semanticScope: 'WEATHER_DETERIORATION',
      authorityMode: 'SHADOW',
      deliveryMode: 'ADVISORY_ONLY',
    },
    authorityMode: 'SHADOW',
    deliveryMode: 'ADVISORY_ONLY',
    audience: 'EXPLICIT_OPT_IN_SELECTED_USERS',
    destination: 'IS',
    semanticScope: 'WEATHER_DETERIORATION',
    predictionUnchanged: {
      frequency: 'UNCHANGED',
      thresholds: 'UNCHANGED',
      semanticScope: 'WEATHER_DETERIORATION',
      predictionRuntimeVersion: 'p2.0.0-shadow',
      qualityBaselineVersion: 'tripnara.ontology_p2_weather_quality_baseline@v1',
    },
    canonicalControl: 'FORBIDDEN',
    predictionThresholdChange: 'FORBIDDEN',
    predictionFrequencyChange: 'FORBIDDEN',
    automaticPlanMutation: 'FORBIDDEN',
    blockingNotification: 'FORBIDDEN',
    externalFullRollout: 'NOT_AUTHORIZED',
    semanticScopeExpansion: 'NOT_AUTHORIZED',
    productGate: 'NOT_AUTHORIZED',
    productGateEntry: 'NOT_AUTHORIZED_UNTIL_COVERAGE',
    proposedTripIds: [...COHORT_EXPANSION_TRIP_IDS],
    proposedUserIds: [...COHORT_EXPANSION_USER_IDS],
    priorTripCount: 7,
    priorUserCount: 12,
    proposedTripCount: input.size.tripCount,
    proposedUserCount: input.size.userCount,
    tripDiversitySummary: summarizeDiversity(),
    consentVersion: SELECTED_USER_CONSENT_VERSION,
    requiresExplicitOptInAndAllowlist: true,
    activationPlan: {
      waves: ['WAVE_3A', 'WAVE_3B', 'WAVE_3C'],
      wave3aTarget: { trips: 12, users: 22 },
      wave3bTarget: { trips: 18, users: 32 },
      wave3cTarget: { trips: 24, users: 42 },
      note: 'Same APPROVED expansion auth; progressive waves — not Product Gate',
    },
    observationPlan: {
      funnelStages: COHORT_FUNNEL_STAGES,
      displayVariantIds: COHORT_DISPLAY_VARIANT_IDS,
      displayVariantConstraint: 'SAME_PREDICTION_DATA_ONLY',
      stableVariantBinding: 'userId',
      coverageGatesBeforeProductGate: [
        'NATURAL_EVENTS_PRESENT',
        'USER_EXPOSURE_SURFACED_OPENED',
        'FEEDBACK_ACTION_COVERAGE',
      ],
      nextDecisionAfterCoverage: 'WEATHER_TEMPORAL_ADVISORY_PRODUCT_GATE',
    },
    permissions: {
      expandSelectedAllowlist: true,
      showTemporalAdvisoryToOptInUser: true,
      collectUserFeedback: true,
      enterExistingPlanningFlow: true,
      runLimitedDisplayVariantTest: true,
      instrumentFullFunnel: true,
      activateWave3A: true,
      activateWave3BAfter3AClear: true,
      activateWave3CAfter3BClear: true,
    },
    prohibitions: {
      changePredictionFrequency: true,
      changePredictionThresholds: true,
      expandSemanticScope: true,
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
      enterProductGateWithoutCoverage: true,
      openFull24x42InOneStep: true,
    },
    rollbackCommand: 'ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH=1',
    killSwitchEnv: COHORT_EXPANSION_KILL_SWITCH_ENV,
    priorCohortKillSwitchEnv: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH',
  };
}

export function submitSelectedUserCohortExpansionAuthorization(input: {
  wave2ObservationVerdict: 'PASS' | 'FAIL';
  wave2Decision?: 'SELECTED_USER_ADVISORY_COHORT_EXPANSION' | 'NONE';
  wave2FreezeFingerprint?: string;
  priorAuthorizationHash?: string;
  priorCommitSha?: string;
  priorBuildArtifactHash?: string;
  nowMs?: number;
}): SelectedUserCohortExpansionAuthorization {
  const size = assertCohortExpansionSizeInBand({
    tripIds: COHORT_EXPANSION_TRIP_IDS,
    userIds: COHORT_EXPANSION_USER_IDS,
  });
  const fields = buildBaseFields({ ...input, size });

  if (input.wave2ObservationVerdict !== 'PASS') {
    return {
      ...fields,
      decision: 'SUBMIT_SELECTED_USER_ADVISORY_COHORT_EXPANSION',
      status: 'BLOCKED_PENDING_03C',
      notes: ['Blocked until ONT-P2-03C Wave2 Observation PASS'],
    };
  }

  const submittedAt = new Date(input.nowMs ?? Date.now()).toISOString();
  const base: Omit<SelectedUserCohortExpansionAuthorization, 'authorizationHash'> = {
    ...fields,
    decision: 'SUBMIT_SELECTED_USER_ADVISORY_COHORT_EXPANSION',
    status: 'SUBMITTED',
    submittedAt,
    notes: [
      'SUBMIT_SELECTED_USER_ADVISORY_COHORT_EXPANSION — awaiting separate approve',
      `Authorized TOTAL scope ${size.tripCount} trips / ${size.userCount} users (not additive)`,
      'Activate via Wave 3A → 3B → 3C; Expansion Kill Switch independent of prior 7/12',
      ...(size.ok ? [] : size.reasons),
    ],
  };
  const { notes: _n, ...hashable } = base;
  void _n;
  return { ...base, authorizationHash: computeAuthHash(hashable) };
}

export function approveSelectedUserCohortExpansion(input: {
  submitted: SelectedUserCohortExpansionAuthorization;
  nowMs?: number;
  approvedBy?: string;
  /** Prefer frozen submit hash from ONT-P2-04 submit artifact */
  submittedAuthorizationHash?: string;
}): SelectedUserCohortExpansionAuthorization {
  if (input.submitted.status !== 'SUBMITTED') {
    throw new Error('ONT-P2-04: authorization must be SUBMITTED before approve');
  }
  const approvedAt = new Date(input.nowMs ?? Date.now()).toISOString();
  const submittedHash =
    input.submittedAuthorizationHash ??
    input.submitted.authorizationHash ??
    P2_04_SUBMITTED_AUTHORIZATION_HASH;

  const {
    notes: _n,
    authorizationHash: _h,
    decision: _d,
    status: _s,
    ...rest
  } = input.submitted;
  void _n;
  void _h;
  void _d;
  void _s;

  const approved: Omit<SelectedUserCohortExpansionAuthorization, 'authorizationHash'> = {
    ...rest,
    decision: 'APPROVE_SELECTED_USER_COHORT_EXPANSION',
    status: 'APPROVED_SELECTED_USER_COHORT_EXPANSION',
    approvedAt,
    approvedBy: input.approvedBy ?? 'ontology-product-authority',
    submittedAuthorizationHash: submittedHash,
    notes: [
      'APPROVE_SELECTED_USER_COHORT_EXPANSION — authorized TOTAL 24 trips / 42 users',
      '24/42 is TOTAL scope after expansion, NOT additive on top of prior 7/12',
      'Activate Wave 3A first (~12/22); do not open full cohort in one step',
      'Expansion Kill Switch ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH (new cohort only)',
      'Prior 7/12 remains under ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH',
      'Product Gate NOT_AUTHORIZED — SHADOW + ADVISORY_ONLY only',
      'Prediction frequency / thresholds / semantics UNCHANGED; Canonical FORBIDDEN',
      `Rebinds submittedAuthorizationHash=${submittedHash}`,
    ],
  };
  const { notes: _n2, ...hashable } = approved;
  void _n2;
  return {
    ...approved,
    authorizationHash: computeAuthHash(hashable),
  };
}
