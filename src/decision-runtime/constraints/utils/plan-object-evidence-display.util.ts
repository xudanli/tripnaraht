/**
 * PlanObject Gateway 证据 — BFF 展示文案（semanticKey 不进 title）
 */

import type { PlanObjectAssessmentKind } from '../../plan-objects/contracts/plan-object.types';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import type { FeasibilityProofDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import { PLAN_OBJECT_ENGINE } from '../adapters/plan-object-assessment-to-assertion.adapter';

const PLAN_OBJECT_RULE_SUBTITLES: Record<PlanObjectAssessmentKind, string> = {
  STAY_LINKAGE: '依据：住宿衔接不完整',
  MEAL_WINDOW_VS_ARRIVAL: '依据：游览结束晚于午餐窗',
  MEAL_WINDOW_GAP: '依据：午餐空闲时间不足',
  BUFFER_LINKAGE: '依据：相邻活动缓冲不足',
  DAILY_FATIGUE_LOAD: '依据：当日疲劳负荷偏高',
  TRANSFER_DAILY_LOAD: '依据：当日转移路程偏多',
};

export function isPlanObjectGatewayAssertion(assertion: ConstraintAssertion): boolean {
  return assertion.evaluator.engine === PLAN_OBJECT_ENGINE;
}

export function isPlanObjectSemanticKey(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('plan_object_');
}

export function planObjectRuleSubtitle(ruleId: string | undefined): string {
  if (!ruleId) return '依据：日内评估';
  return PLAN_OBJECT_RULE_SUBTITLES[ruleId as PlanObjectAssessmentKind] ?? '依据：日内评估';
}

export function buildPlanObjectGatewayProof(assertion: ConstraintAssertion): FeasibilityProofDto {
  return {
    entity: '日内评估',
    constraint: assertion.reasonCode,
    currentFact: assertion.message,
    evidenceSource: PLAN_OBJECT_ENGINE,
    evidenceType: 'gateway_projection',
    conclusion: assertion.status,
    ruleId: assertion.evaluator.ruleId,
    confidence: assertion.confidence,
    semanticKey: assertion.constraintType,
  };
}

export function buildPlanObjectEvidenceRefs(
  proof: FeasibilityProofDto,
): Array<{ type: string; id: string }> {
  const refs: Array<{ type: string; id: string }> = [];
  if (proof.semanticKey) refs.push({ type: 'semantic_key', id: proof.semanticKey });
  if (proof.itemId) refs.push({ type: 'trip_item', id: proof.itemId });
  if (proof.ruleId) refs.push({ type: 'plan_object_rule', id: proof.ruleId });
  return refs;
}
