/**
 * Plan Decision Classifier — 重规划/整段草案（非 MDS 活动预订族）。
 */

import type { PlanDecisionClass } from './decision-state.types';

export type PlanDecisionClassification = {
  decisionClass: PlanDecisionClass | null;
  confidence: number;
  reason: string;
};

const REPLAN_RE =
  /重新规划|重做(?:一下)?(?:行程|计划)|全面(?:重排|优化|规划)|replan|重新安排.{0,12}?(?:行程|第\s*\d+\s*天|Day)/i;

export function isPlanDecisionFamily(message: string, tripId?: string | null): boolean {
  if (!String(tripId ?? '').trim()) return false;
  return REPLAN_RE.test(String(message ?? ''));
}

export function classifyPlanDecision(
  message: string,
  tripId?: string | null,
): PlanDecisionClassification {
  if (!isPlanDecisionFamily(message, tripId)) {
    return { decisionClass: null, confidence: 0, reason: 'not_plan_decision_family' };
  }
  return {
    decisionClass: 'PLAN.DAY_REPLAN',
    confidence: 0.86,
    reason: 'day_replan_lex',
  };
}
