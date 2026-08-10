/**
 * Decision Failure Taxonomy + Disagreement 分类。
 */

export type DecisionFailureTaxonomy =
  | 'WRONG_OPTION'
  | 'BAD_TIMING'
  | 'OVERLOAD'
  | 'UNDERLOAD'
  | 'IGNORE_CONSTRAINT'
  | 'POOR_EVIDENCE_USE'
  | 'USER_PREFERENCE_MISS'
  | 'EXTERNAL_SHOCK'
  | 'UNKNOWN';

export type DisagreementClass =
  | 'CANDIDATE_BETTER_CHOICE'
  | 'PRODUCTION_BETTER_CHOICE'
  | 'BOTH_WRONG'
  | 'USER_OVERRIDE_BOTH'
  | 'TIE_OR_EQUIVALENT'
  | 'UNKNOWN';

export type DecisionFailureLabelV1 = {
  taxonomy: DecisionFailureTaxonomy;
  disagreementClass: DisagreementClass;
  rationaleZh: string;
};

export function classifyDecisionFailure(input: {
  productionOptionId: string;
  candidateOptionId: string;
  userChosenOptionId?: string | null;
  outcomeGood?: boolean;
  evidenceIgnored?: boolean;
  externalShock?: boolean;
  overload?: boolean;
  underload?: boolean;
}): DecisionFailureLabelV1 {
  if (input.externalShock) {
    return {
      taxonomy: 'EXTERNAL_SHOCK',
      disagreementClass: 'UNKNOWN',
      rationaleZh: '外部环境冲击主导失败',
    };
  }
  if (input.evidenceIgnored) {
    return {
      taxonomy: 'POOR_EVIDENCE_USE',
      disagreementClass: classifyDisagreement(input),
      rationaleZh: '未充分利用 Evidence',
    };
  }
  if (input.overload) {
    return {
      taxonomy: 'OVERLOAD',
      disagreementClass: classifyDisagreement(input),
      rationaleZh: '日程过载',
    };
  }
  if (input.underload) {
    return {
      taxonomy: 'UNDERLOAD',
      disagreementClass: classifyDisagreement(input),
      rationaleZh: '日程过松/空转',
    };
  }

  const disagreementClass = classifyDisagreement(input);
  let taxonomy: DecisionFailureTaxonomy = 'UNKNOWN';
  if (input.outcomeGood === false) {
    if (
      input.userChosenOptionId &&
      input.userChosenOptionId !== input.productionOptionId &&
      input.userChosenOptionId !== input.candidateOptionId
    ) {
      taxonomy = 'USER_PREFERENCE_MISS';
    } else {
      taxonomy = 'WRONG_OPTION';
    }
  } else if (
    input.productionOptionId !== input.candidateOptionId &&
    input.outcomeGood === true
  ) {
    taxonomy = 'UNKNOWN';
  }

  return {
    taxonomy,
    disagreementClass,
    rationaleZh: `taxonomy=${taxonomy}; disagreement=${disagreementClass}`,
  };
}

function classifyDisagreement(input: {
  productionOptionId: string;
  candidateOptionId: string;
  userChosenOptionId?: string | null;
  outcomeGood?: boolean;
}): DisagreementClass {
  if (input.productionOptionId === input.candidateOptionId) {
    return 'TIE_OR_EQUIVALENT';
  }
  const user = input.userChosenOptionId;
  if (!user) return 'UNKNOWN';
  if (user !== input.productionOptionId && user !== input.candidateOptionId) {
    return 'USER_OVERRIDE_BOTH';
  }
  if (input.outcomeGood === false) {
    if (user === input.candidateOptionId || user === input.productionOptionId) {
      return 'BOTH_WRONG';
    }
  }
  if (user === input.candidateOptionId) return 'CANDIDATE_BETTER_CHOICE';
  if (user === input.productionOptionId) return 'PRODUCTION_BETTER_CHOICE';
  return 'UNKNOWN';
}
