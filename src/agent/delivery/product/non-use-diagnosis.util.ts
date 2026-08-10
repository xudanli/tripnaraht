/**
 * 用户没用 Nara 的判断顺序 — 只有最后才进新能力讨论。
 *
 * 不知道可以问 → UX / Discoverability
 * 问了但理解错 → Intent / Context
 * 理解对但答不好 → Evidence / Decision
 * 答得好但不信 → Explainability / Trust
 * 信了但不行动 → Decision UX / Action Cost
 * 想做但系统做不了 → Existing Capability Gap
 * 重复、大量、高价值 → V1.1 Candidate
 */

export const NON_USE_DIAGNOSIS_SCHEMA =
  'nara.non_use_diagnosis@v1' as const;

export type NonUseStage =
  | 'DISCOVERABILITY'
  | 'INTENT_CONTEXT'
  | 'EVIDENCE_DECISION'
  | 'EXPLAINABILITY_TRUST'
  | 'DECISION_UX_ACTION_COST'
  | 'EXISTING_CAPABILITY_GAP'
  | 'V11_CANDIDATE';

export type NonUseDiagnosisV1 = {
  schemaId: typeof NON_USE_DIAGNOSIS_SCHEMA;
  version: 1;
  tripId: string;
  stage: NonUseStage;
  whyZh: string;
  /** 仅 V11_CANDIDATE 才讨论新能力 */
  mayDiscussNewCapability: boolean;
  noEvidenceNoFeature: true;
};

const ORDER: Array<{
  stage: NonUseStage;
  predicate: (h: NonUseHints) => boolean;
  whyZh: string;
}> = [
  {
    stage: 'DISCOVERABILITY',
    predicate: (h) => !!h.didNotKnowCouldAsk,
    whyZh: '不知道可以问 → UX / Discoverability',
  },
  {
    stage: 'INTENT_CONTEXT',
    predicate: (h) => !!h.askedButMisunderstood,
    whyZh: '问了但理解错 → Intent / Context',
  },
  {
    stage: 'EVIDENCE_DECISION',
    predicate: (h) => !!h.understoodButAnswerPoor,
    whyZh: '理解对但答不好 → Evidence / Decision',
  },
  {
    stage: 'EXPLAINABILITY_TRUST',
    predicate: (h) => !!h.answerGoodButUntrusted,
    whyZh: '答得好但用户不信 → Explainability / Trust',
  },
  {
    stage: 'DECISION_UX_ACTION_COST',
    predicate: (h) => !!h.trustedButDidNotAct,
    whyZh: '信了但不行动 → Decision UX / Action Cost',
  },
  {
    stage: 'EXISTING_CAPABILITY_GAP',
    predicate: (h) => !!h.wantedButSystemCannot,
    whyZh: '想做但系统做不了 → Existing Capability Gap',
  },
  {
    stage: 'V11_CANDIDATE',
    predicate: (h) =>
      !!h.wantedButSystemCannot &&
      !!h.repeated &&
      !!h.highVolume &&
      !!h.highValue,
    whyZh: '重复、大量、高价值 → V1.1 Candidate（唯一可议新能力）',
  },
];

export type NonUseHints = {
  didNotKnowCouldAsk?: boolean;
  askedButMisunderstood?: boolean;
  understoodButAnswerPoor?: boolean;
  answerGoodButUntrusted?: boolean;
  trustedButDidNotAct?: boolean;
  wantedButSystemCannot?: boolean;
  repeated?: boolean;
  highVolume?: boolean;
  highValue?: boolean;
};

export function diagnoseNonUse(input: {
  tripId: string;
  hints: NonUseHints;
}): NonUseDiagnosisV1 {
  /** 从早到晚找第一命中；V11 需显式全满足，优先于仅 Gap */
  if (
    input.hints.wantedButSystemCannot &&
    input.hints.repeated &&
    input.hints.highVolume &&
    input.hints.highValue
  ) {
    return {
      schemaId: NON_USE_DIAGNOSIS_SCHEMA,
      version: 1,
      tripId: input.tripId,
      stage: 'V11_CANDIDATE',
      whyZh: '重复、大量、高价值且现有 V1 不可解 → 可进入 V1.1 候选讨论',
      mayDiscussNewCapability: true,
      noEvidenceNoFeature: true,
    };
  }

  for (const step of ORDER) {
    if (step.stage === 'V11_CANDIDATE') continue;
    if (step.predicate(input.hints)) {
      return {
        schemaId: NON_USE_DIAGNOSIS_SCHEMA,
        version: 1,
        tripId: input.tripId,
        stage: step.stage,
        whyZh: step.whyZh,
        mayDiscussNewCapability: false,
        noEvidenceNoFeature: true,
      };
    }
  }

  return {
    schemaId: NON_USE_DIAGNOSIS_SCHEMA,
    version: 1,
    tripId: input.tripId,
    stage: 'DISCOVERABILITY',
    whyZh: '证据不足：默认先查 Discoverability / 继续观察，不立项功能',
    mayDiscussNewCapability: false,
    noEvidenceNoFeature: true,
  };
}
