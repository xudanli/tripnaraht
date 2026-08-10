/**
 * DecisionRegret — Rollback / Immediate Replan / User Correction 等事后质量信号。
 */

export const DECISION_REGRET_SCHEMA = 'nara.decision_regret@v1' as const;

export type DecisionRegretSignalKind =
  | 'ROLLBACK'
  | 'IMMEDIATE_REPLAN'
  | 'USER_CORRECTION'
  | 'COMPLAINT'
  | 'NONE';

export type DecisionRegretV1 = {
  schemaId: typeof DECISION_REGRET_SCHEMA;
  version: 1;
  regretId: string;
  tripId: string;
  decisionKey: string;
  signal: DecisionRegretSignalKind;
  /** 0=无悔 1=强悔 */
  regretScore: number;
  observedAt: string;
  noteZh?: string;
  /** 事后信号，不是反事实 */
  isPostHocObserved: true;
};

const SIGNAL_SCORE: Record<DecisionRegretSignalKind, number> = {
  NONE: 0,
  USER_CORRECTION: 0.45,
  IMMEDIATE_REPLAN: 0.7,
  ROLLBACK: 0.9,
  COMPLAINT: 0.85,
};

export function buildDecisionRegret(input: {
  tripId: string;
  decisionKey: string;
  signal: DecisionRegretSignalKind;
  noteZh?: string;
  regretId?: string;
}): DecisionRegretV1 {
  return {
    schemaId: DECISION_REGRET_SCHEMA,
    version: 1,
    regretId: input.regretId ?? `regret_${input.decisionKey}_${Date.now()}`,
    tripId: input.tripId,
    decisionKey: input.decisionKey,
    signal: input.signal,
    regretScore: SIGNAL_SCORE[input.signal],
    observedAt: new Date().toISOString(),
    noteZh: input.noteZh,
    isPostHocObserved: true,
  };
}

/** 1 - regret；用于质量分 */
export function regretToQualityBonus(regret: DecisionRegretV1): number {
  return Math.max(0, 1 - regret.regretScore);
}
