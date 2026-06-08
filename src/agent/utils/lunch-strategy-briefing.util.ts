/**
 * Agent 轻量咨询：午餐策略提示行（行程概览 / 餐饮段落）。
 */

import {
  buildAgentMealBriefing,
  LUNCH_STRATEGY_LABELS,
  resolveLunchStrategyFromTrip,
  type LunchStrategy,
} from '../../planning-policy/utils/lunch-strategy.util';

export function buildLunchStrategyPromptLines(trip: {
  metadata?: unknown;
  pacingConfig?: unknown;
  destination?: string | null;
}): string[] {
  const strategy = resolveLunchStrategyFromTrip(trip);
  return [
    `【午餐时间窗策略】${LUNCH_STRATEGY_LABELS[strategy]}（${strategy}）`,
    buildAgentMealBriefing(strategy),
    '评估餐饮安排时：除是否「有午餐项」外，须判断 11:30–14:00 是否有足够空档或 MEAL_FLOATING/MEAL_ANCHOR；缺口须给可执行改法（错峰/卡点/沿路补给），勿只写「记得吃饭」。',
  ];
}

export function buildLunchStrategyOrchestratorHints(strategy: LunchStrategy): string[] {
  return [
    `当前午餐策略：${LUNCH_STRATEGY_LABELS[strategy]}。`,
    buildAgentMealBriefing(strategy),
  ];
}
