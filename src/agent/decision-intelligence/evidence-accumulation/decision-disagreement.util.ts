/**
 * DecisionDisagreementEvent — 沉淀 Production 与 Candidate 推荐不一致的真实 Case。
 */

export const DECISION_DISAGREEMENT_SCHEMA =
  'nara.decision_disagreement_event@v1' as const;

export type DecisionDisagreementEventV1 = {
  schemaId: typeof DECISION_DISAGREEMENT_SCHEMA;
  version: 1;
  eventId: string;
  experimentId?: string;
  tripId: string;
  decisionKey: string;
  snapshotId: string;
  productionOptionId: string;
  candidateOptionId: string;
  userChosenOptionId?: string | null;
  at: string;
  noteZh?: string;
  /** 真实分歧 case，供后续 Temporal/Proactive 学习，非 Policy 证明 */
  isRealCase: true;
};

export function recordDecisionDisagreement(input: {
  tripId: string;
  decisionKey: string;
  snapshotId: string;
  productionOptionId: string;
  candidateOptionId: string;
  userChosenOptionId?: string | null;
  experimentId?: string;
  noteZh?: string;
  eventId?: string;
}): DecisionDisagreementEventV1 | null {
  if (input.productionOptionId === input.candidateOptionId) {
    return null;
  }
  return {
    schemaId: DECISION_DISAGREEMENT_SCHEMA,
    version: 1,
    eventId: input.eventId ?? `disagree_${input.decisionKey}_${Date.now()}`,
    experimentId: input.experimentId,
    tripId: input.tripId,
    decisionKey: input.decisionKey,
    snapshotId: input.snapshotId,
    productionOptionId: input.productionOptionId,
    candidateOptionId: input.candidateOptionId,
    userChosenOptionId: input.userChosenOptionId ?? null,
    at: new Date().toISOString(),
    noteZh: input.noteZh,
    isRealCase: true,
  };
}
