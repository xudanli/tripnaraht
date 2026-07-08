/**
 * Rule-based NL trip intent classifier (S1 — no LLM required).
 */

import type { DecisionTriggerKind, DecisionRunRouteTarget } from '../../contracts/decision-run-request';
import type { TripIntentClassification, TripIntentKind } from './trip-intent.types';

interface IntentRule {
  id: string;
  kind: TripIntentKind;
  patterns: RegExp[];
  triggerKind: DecisionTriggerKind;
  routeTargetHint: DecisionRunRouteTarget;
  confidence: number;
}

const RULES: IntentRule[] = [
  {
    id: 'decision_status',
    kind: 'DECISION_STATUS',
    patterns: [
      /有哪些问题需要处理/,
      /需要我决定/,
      /待处理/,
      /决策队列/,
      /what.*decide/i,
      /open decisions?/i,
    ],
    triggerKind: 'USER_INTENT',
    routeTargetHint: 'AGENTIC_ORCHESTRATION',
    confidence: 0.85,
  },
  {
    id: 'feasibility_check',
    kind: 'FEASIBILITY_CHECK',
    patterns: [
      /能走吗/,
      /可行吗/,
      /能不能执行/,
      /是否可以出发/,
      /feasib/i,
      /can i (do|take) this trip/i,
    ],
    triggerKind: 'USER_INTENT',
    routeTargetHint: 'AGENTIC_ORCHESTRATION',
    confidence: 0.88,
  },
  {
    id: 'weather_risk',
    kind: 'WEATHER_RISK',
    patterns: [
      /下雨/,
      /大风/,
      /暴雪/,
      /天气/,
      /强风/,
      /weather/i,
      /rain/i,
      /wind/i,
    ],
    triggerKind: 'CANONICAL_MONITORING_POLL',
    routeTargetHint: 'CANONICAL_MONITORING',
    confidence: 0.82,
  },
  {
    id: 'swap_lodging',
    kind: 'SWAP_LODGING',
    patterns: [/换(一个|个)?住宿/, /换酒店/, /更换酒店/, /change hotel/i, /swap lodging/i],
    triggerKind: 'MANUAL_REPAIR_REQUEST',
    routeTargetHint: 'CANONICAL_L2_EVALUATE',
    confidence: 0.84,
  },
  {
    id: 'swap_activity',
    kind: 'SWAP_ACTIVITY',
    patterns: [
      /换(一个|个)?景点/,
      /替换/,
      /改成/,
      /换一个/,
      /replace (poi|activity)/i,
    ],
    triggerKind: 'USER_INTENT',
    routeTargetHint: 'AGENTIC_ORCHESTRATION',
    confidence: 0.8,
  },
  {
    id: 'modify_itinerary',
    kind: 'MODIFY_ITINERARY',
    patterns: [
      /第\s*\d+\s*天/,
      /太累/,
      /调整/,
      /修改行程/,
      /改行程/,
      /too tired/i,
      /day\s*\d+/i,
      /adjust/i,
    ],
    triggerKind: 'USER_INTENT',
    routeTargetHint: 'AGENTIC_ORCHESTRATION',
    confidence: 0.86,
  },
  {
    id: 'plan_trip',
    kind: 'PLAN_TRIP',
    patterns: [
      /帮我规划/,
      /规划.*(冰岛|行程|旅行)/,
      /安排.*天/,
      /plan (my )?trip/i,
      /help me plan/i,
    ],
    triggerKind: 'LEGACY_AGENT_ROUTE',
    routeTargetHint: 'LEGACY_DECISION_ENGINE',
    confidence: 0.9,
  },
];

export function classifyTripIntent(message: string): TripIntentClassification {
  const text = message.trim();
  if (!text) {
    return fallback('empty_message');
  }

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return {
        kind: rule.kind,
        confidence: rule.confidence,
        matchedRule: rule.id,
        triggerKind: rule.triggerKind,
        routeTargetHint: rule.routeTargetHint,
      };
    }
  }

  return fallback('general_query');
}

function fallback(matchedRule: string): TripIntentClassification {
  return {
    kind: 'GENERAL_QUERY',
    confidence: 0.55,
    matchedRule,
    triggerKind: 'LEGACY_AGENT_ROUTE',
    routeTargetHint: 'LEGACY_DECISION_ENGINE',
  };
}

/** Extract day index from Chinese/English day references (0-based). */
export function extractDayIndexFromMessage(message: string): number | undefined {
  const zhDigit = message.match(/第\s*(\d+)\s*天/);
  if (zhDigit?.[1]) {
    const n = Number(zhDigit[1]);
    if (Number.isFinite(n) && n >= 1) return n - 1;
  }

  const zhCn = message.match(/第\s*([一二三四五六七八九十两]+)\s*天/);
  if (zhCn?.[1]) {
    const n = chineseNumeralToInt(zhCn[1]);
    if (n != null && n >= 1) return n - 1;
  }

  const en = message.match(/day\s*(\d+)/i);
  if (en?.[1]) {
    const n = Number(en[1]);
    if (Number.isFinite(n) && n >= 1) return n - 1;
  }
  return undefined;
}

const CN_NUM: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function chineseNumeralToInt(raw: string): number | undefined {
  if (raw.length === 1) return CN_NUM[raw];
  if (raw.startsWith('十')) {
    const rest = raw.slice(1);
    return rest ? 10 + (CN_NUM[rest] ?? 0) : 10;
  }
  if (raw.endsWith('十')) {
    const head = raw.slice(0, -1);
    return (CN_NUM[head] ?? 0) * 10;
  }
  return undefined;
}
