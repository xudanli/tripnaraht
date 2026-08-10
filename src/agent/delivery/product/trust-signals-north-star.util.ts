/**
 * 五信号观测 + Assisted Decision Rate + North Star。
 * North Star：Successful Assisted Decisions per Active Trip（每趟旅行有效辅助决策数）
 */

export const TRUST_SIGNAL_SCHEMA = 'nara.trust_signal_bundle@v1' as const;

export type UserCorrectionSignalV1 = {
  kind: 'USER_CORRECTION';
  tripId: string;
  utteranceZh: string;
  at: string;
};

export type TaskAbandonmentSignalV1 = {
  kind: 'TASK_ABANDONMENT';
  tripId: string;
  stage: 'DECISION_CARD' | 'DRAFT_CONFIRM' | 'OTHER';
  hypothesizedCause:
    | 'AI_UNTRUSTED'
    | 'PLAN_POOR'
    | 'INFO_COMPLEX'
    | 'CTA_UNCLEAR'
    | 'USER_NOT_INTENDING'
    | 'UNKNOWN';
};

export type RecoverySignalV1 = {
  kind: 'RECOVERY';
  tripId: string;
  firstAttemptFailed: boolean;
  continuedToSuccess: boolean;
};

export type RepeatedUseSignalV1 = {
  kind: 'REPEATED_USE';
  tripId: string;
  activeDays: number;
  returnedAfterProblem: boolean;
};

export type DecisionDelegationItemV1 = {
  decisionNeedZh: string;
  naraParticipated: boolean;
  userCompleted: boolean;
  outcomeFailed: boolean;
  severeRegret: boolean;
};

export type TrustSignalBundleV1 = {
  schemaId: typeof TRUST_SIGNAL_SCHEMA;
  version: 1;
  tripId: string;
  corrections: UserCorrectionSignalV1[];
  abandonments: TaskAbandonmentSignalV1[];
  recoveries: RecoverySignalV1[];
  repeatedUse?: RepeatedUseSignalV1;
  importantDecisions: DecisionDelegationItemV1[];
};

export function computeAssistedDecisionRate(
  decisions: DecisionDelegationItemV1[],
): {
  importantDecisionN: number;
  assistedN: number;
  assistedDecisionRate: number;
  /** 不追求 100%；沉默仍是正确默认 */
  notTargetingHundredPercent: true;
} {
  const importantDecisionN = decisions.length;
  const assistedN = decisions.filter((d) => d.naraParticipated).length;
  return {
    importantDecisionN,
    assistedN,
    assistedDecisionRate:
      importantDecisionN === 0 ? 0 : assistedN / importantDecisionN,
    notTargetingHundredPercent: true,
  };
}

/**
 * 计入 North Star 的 Successful Assisted Decision。
 */
export function isSuccessfulAssistedDecision(
  d: DecisionDelegationItemV1,
): boolean {
  return (
    d.naraParticipated &&
    d.userCompleted &&
    !d.outcomeFailed &&
    !d.severeRegret
  );
}

export type NorthStarReportV1 = {
  schemaId: 'nara.north_star_assisted_decisions@v1';
  version: 1;
  tripId: string;
  successfulAssistedDecisions: number;
  activeTrip: true;
  metricNameZh: '每趟旅行有效辅助决策数';
  metricNameEn: 'Successful Assisted Decisions per Active Trip';
  dauForbiddenAsPrimary: true;
  conversationCountForbiddenAsPrimary: true;
  tokenCountForbiddenAsPrimary: true;
  reasonsZh: string[];
};

export function computeNorthStarForTrip(input: {
  tripId: string;
  decisions: DecisionDelegationItemV1[];
}): NorthStarReportV1 {
  const successfulAssistedDecisions = input.decisions.filter(
    isSuccessfulAssistedDecision,
  ).length;
  return {
    schemaId: 'nara.north_star_assisted_decisions@v1',
    version: 1,
    tripId: input.tripId,
    successfulAssistedDecisions,
    activeTrip: true,
    metricNameZh: '每趟旅行有效辅助决策数',
    metricNameEn: 'Successful Assisted Decisions per Active Trip',
    dauForbiddenAsPrimary: true,
    conversationCountForbiddenAsPrimary: true,
    tokenCountForbiddenAsPrimary: true,
    reasonsZh: [
      `有效辅助决策 ${successfulAssistedDecisions}（需真实 Decision Need + Nara 参与 + 完成 + 无严重失败/Regret）`,
    ],
  };
}
