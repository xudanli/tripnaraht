/**
 * Contract Composition — 仅留接口，不实现多合同合成。
 * 未来：AVAILABILITY_CHECK + PACE_ASSESS 等 Dependent Contract，禁止退回 GLOBAL_PLAN。
 */

import type { DecisionClass, DecisionNextAction } from './decision-state.types';

export type DecisionContractCompositionV1 = {
  schema: 'tripnara.decision_contract_composition@v1';
  primaryDecision: DecisionClass;
  dependentDecisions: DecisionClass[];
  /** 预留：合成后的唯一 Next Action */
  composedNextAction?: DecisionNextAction | null;
};
