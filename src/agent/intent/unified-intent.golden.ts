/**
 * Unified Intent P1 — 重点话术 golden（规则层准确率；LLM Shadow 另测解析）。
 * 对应迁移文档中的核心 case 目录，便于后续人工扩到 200～500 条。
 */

import type { SemanticIntent } from './unified-intent.types';

export type UnifiedIntentGoldenCase = {
  id: string;
  utterance: string;
  tripId?: string | null;
  expectedIntent: SemanticIntent;
  /** 可选：期望 routeClass 粗检 */
  expectedRouteClass?: string;
  notes?: string;
};

export const UNIFIED_INTENT_GOLDEN_CASES: UnifiedIntentGoldenCase[] = [
  {
    id: 'meal_local_edit_day3',
    utterance: 'Day3行程我要安排午餐',
    tripId: 't1',
    expectedIntent: 'LOCAL_EDIT',
    expectedRouteClass: 'LOCAL_EDIT_DRAFT',
    notes: '主题 MEAL ≠ CONSULT',
  },
  {
    id: 'meal_consult_nearby',
    utterance: 'Day 3 附近有什么午餐推荐？',
    tripId: 't1',
    expectedIntent: 'CONSULT',
    expectedRouteClass: 'STATEFUL_QA',
  },
  {
    id: 'meal_assess_pace',
    utterance: 'Day 3 加午餐会不会赶不上冰川徒步？',
    tripId: 't1',
    expectedIntent: 'ASSESS_IMPACT',
    expectedRouteClass: 'IMPACT_SIMULATION',
  },
  {
    id: 'meal_global_plan',
    utterance: '重新规划整个行程，补齐每天午餐',
    tripId: 't1',
    expectedIntent: 'GLOBAL_PLAN',
    expectedRouteClass: 'FULL_PLAN_DRAFT',
  },
  {
    id: 'weather_consult',
    utterance: '明天会下雨吗？',
    tripId: 't1',
    expectedIntent: 'CONSULT',
  },
  {
    id: 'weather_assess',
    utterance: '明天下雨会影响哪些安排？',
    tripId: 't1',
    expectedIntent: 'ASSESS_IMPACT',
  },
  {
    id: 'weather_local_edit',
    utterance: '明天下雨，把户外活动换成室内的',
    tripId: 't1',
    expectedIntent: 'LOCAL_EDIT',
  },
  {
    id: 'overview_consult',
    utterance: '我的总体行程怎么样？',
    tripId: 't1',
    expectedIntent: 'CONSULT',
    expectedRouteClass: 'STATEFUL_QA',
  },
  {
    id: 'assess_no_mutation',
    utterance: '看看明天下雨会影响什么，先别改',
    tripId: 't1',
    expectedIntent: 'ASSESS_IMPACT',
    notes: '否定修改 → READ_ONLY',
  },
  {
    id: 'global_replan',
    utterance: '帮我重新规划整个行程',
    tripId: 't1',
    expectedIntent: 'GLOBAL_PLAN',
  },
  {
    id: 'consult_food_no_trip_force_plan',
    utterance: '雷克雅未克有什么特色食物？',
    tripId: 't1',
    expectedIntent: 'CONSULT',
    notes: '有 trip_id 不得升 GLOBAL_PLAN',
  },
  {
    id: 'weather_impact_trip',
    utterance: '明天天气会影响行程吗？',
    tripId: 't1',
    expectedIntent: 'ASSESS_IMPACT',
  },
  {
    id: 'pace_consult_day1',
    utterance: 'Day1 会不会太赶',
    tripId: 't1',
    expectedIntent: 'CONSULT',
    expectedRouteClass: 'STATEFUL_QA',
    notes: 'P5：节奏诊断走 CONSULT takeover，不再依赖 keyword CRE 兜底',
  },
  {
    id: 'dining_find_nearby',
    utterance: '帮我找附近的午餐',
    tripId: 't1',
    expectedIntent: 'CONSULT',
    expectedRouteClass: 'STATEFUL_QA',
  },
  {
    id: 'lodging_dining_plan_consult',
    utterance: '详细6天住宿和餐饮方案',
    tripId: 't1',
    expectedIntent: 'CONSULT',
    notes: 'P5：吃住方案咨询，不得升 GLOBAL_PLAN',
  },
];
