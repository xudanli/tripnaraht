import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

/**
 * VERIFY 节点向 Host / 循环胶水层报告的裁决（不在节点内改图路由）。
 */
export type VerifyPhaseVerdictKind =
  | 'ok'
  | 'fatal'
  | 'return_to_research'
  | 'needs_repair'
  | 'complete';

export type VerifyPhaseVerdict = {
  kind: VerifyPhaseVerdictKind;
  /** FATAL 时供 terminal_failed 使用 */
  fatalMessage?: string;
};

export type VerifyPhaseResult = {
  decisionState: DecisionState | undefined;
  verdict: VerifyPhaseVerdict;
};
