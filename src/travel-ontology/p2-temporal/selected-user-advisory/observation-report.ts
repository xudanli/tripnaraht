/**
 * ONT-P2-03A — Selected User Observation Report freeze scaffold + completion checklist
 */

import { createHash } from 'crypto';
import type { SelectedUserTemporalAdvisoryAuthorizationApproved } from './authorization';
import type { SelectedUserPilotMetrics } from './user-advisory.metrics';
import { selectedUserBoundaryAllZero } from './user-advisory.metrics';

export const P2_03A_OBSERVATION_REPORT_SCHEMA_ID =
  'tripnara.ontology_p2_selected_user_advisory_observation@v1' as const;

export interface SelectedUserObservationChecklistItem {
  id: string;
  ok: boolean;
  detail: string;
}

export interface SelectedUserObservationReport {
  schemaId: typeof P2_03A_OBSERVATION_REPORT_SCHEMA_ID;
  workItem: 'ONT-P2-03A';
  status: 'IN_PROGRESS' | 'FROZEN';
  frozenAt?: string;
  authorizationHash: string;
  metrics: SelectedUserPilotMetrics;
  checklist: SelectedUserObservationChecklistItem[];
  nextAllowed:
    | 'SELECTED_USER_ADVISORY_COHORT_EXPANSION'
    | 'WEATHER_TEMPORAL_ADVISORY_PRODUCT_GATE'
    | 'NONE';
  nextForbidden: Array<
    | 'P2_CANONICAL_AUTHORITY'
    | 'PREDICTION_TRIGGERS_BLOCK'
    | 'AUTO_REROUTE'
    | 'FULL_USER_ROLLOUT'
    | 'FOURTH_SEMANTIC'
  >;
  replayFingerprint: string;
}

export function buildSelectedUserObservationChecklist(input: {
  allUsersHaveOptIn: boolean;
  allBoundPredictionAndContext: boolean;
  p1CanonicalPreferred: boolean;
  coveredPredictionReplaceAndWithdraw: boolean;
  coveredDeadlineExpiry: boolean;
  coveredWarningNeedConfirmUnknown: boolean;
  understandingIssuesAdjudicated: boolean;
  unresolvedActionableFn: number;
  metrics: SelectedUserPilotMetrics;
  killSwitchVerified: boolean;
}): SelectedUserObservationChecklistItem[] {
  return [
    {
      id: 'ALL_USERS_EXPLICIT_OPTIN',
      ok: input.allUsersHaveOptIn,
      detail: '所有用户均有明确 Opt-in 记录',
    },
    {
      id: 'BOUND_PREDICTION_AND_CONTEXT',
      ok: input.allBoundPredictionAndContext,
      detail: '所有建议绑定 predictionVersion 和 contextRevision',
    },
    {
      id: 'P1_CANONICAL_PREFERRED',
      ok: input.p1CanonicalPreferred,
      detail: 'P1 Canonical 始终优先',
    },
    {
      id: 'COVERED_REPLACE_AND_WITHDRAW',
      ok: input.coveredPredictionReplaceAndWithdraw,
      detail: '至少覆盖一次预测替换和明确撤回',
    },
    {
      id: 'COVERED_DEADLINE_EXPIRY',
      ok: input.coveredDeadlineExpiry,
      detail: '至少覆盖一次 Deadline 到期',
    },
    {
      id: 'COVERED_OUTCOME_BANDS',
      ok: input.coveredWarningNeedConfirmUnknown,
      detail: '至少覆盖 WARNING / NEED_CONFIRM / UNKNOWN',
    },
    {
      id: 'UNDERSTANDING_ADJUDICATED',
      ok: input.understandingIssuesAdjudicated,
      detail: '建议理解问题全部完成人工裁决',
    },
    {
      id: 'ACTIONABLE_FN_ZERO',
      ok: input.unresolvedActionableFn === 0,
      detail: `未裁决 Actionable FN = ${input.unresolvedActionableFn}`,
    },
    {
      id: 'NON_SELECTED_NON_OPTIN_ZERO',
      ok:
        input.metrics.non_selected_emission_count === 0 &&
        input.metrics.non_optin_emission_count === 0,
      detail: 'non-selected / non-opt-in emission = 0',
    },
    {
      id: 'STALE_DUPLICATE_ZERO',
      ok:
        input.metrics.stale_advisory_exposure === 0 &&
        input.metrics.multiple_active_user_advisories === 0,
      detail: 'stale / duplicate advisory = 0',
    },
    {
      id: 'CANONICAL_CONTROL_ZERO',
      ok:
        input.metrics.canonical_apply_invocation === 0 &&
        input.metrics.assessment_mutation === 0 &&
        input.metrics.plan_revision_created === 0,
      detail: 'Canonical 控制边界全部为 0',
    },
    {
      id: 'KILL_SWITCH_VERIFIED',
      ok: input.killSwitchVerified,
      detail: '用户 Kill Switch 实测通过',
    },
  ];
}

export function freezeSelectedUserObservationReport(input: {
  authorization: SelectedUserTemporalAdvisoryAuthorizationApproved;
  metrics: SelectedUserPilotMetrics;
  checklist: SelectedUserObservationChecklistItem[];
  nowMs?: number;
}): SelectedUserObservationReport {
  const allOk =
    input.checklist.every((c) => c.ok) && selectedUserBoundaryAllZero(input.metrics);
  const replayFingerprint = `rp_03a_${createHash('sha256')
    .update(
      JSON.stringify({
        ah: input.authorization.authorizationHash,
        metrics: {
          emit: input.metrics.selected_optin_emission_count,
          nonSel: input.metrics.non_selected_emission_count,
          nonOpt: input.metrics.non_optin_emission_count,
        },
        checklist: input.checklist.map((c) => [c.id, c.ok]),
      }),
    )
    .digest('hex')
    .slice(0, 24)}`;

  return {
    schemaId: P2_03A_OBSERVATION_REPORT_SCHEMA_ID,
    workItem: 'ONT-P2-03A',
    status: allOk ? 'FROZEN' : 'IN_PROGRESS',
    frozenAt: allOk ? new Date(input.nowMs ?? Date.now()).toISOString() : undefined,
    authorizationHash: input.authorization.authorizationHash,
    metrics: input.metrics,
    checklist: input.checklist,
    nextAllowed: allOk ? 'SELECTED_USER_ADVISORY_COHORT_EXPANSION' : 'NONE',
    nextForbidden: [
      'P2_CANONICAL_AUTHORITY',
      'PREDICTION_TRIGGERS_BLOCK',
      'AUTO_REROUTE',
      'FULL_USER_ROLLOUT',
      'FOURTH_SEMANTIC',
    ],
    replayFingerprint,
  };
}
