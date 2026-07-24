/**
 * WP-TEP-11 — DecisionHook 匹配与模板注册（规划期 → 行中桥接）
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md 附录 C.4
 */

import type { DecisionHook, TriggerCondition } from '../contracts/tep-self-drive.types';

export interface HookTemplateRegistration {
  problemTemplateId: string;
  defaultPolicy: DecisionHook['defaultPolicy'];
}

const TEMPLATE_BY_SEMANTIC_KEY: Record<string, HookTemplateRegistration> = {
  ROAD_SEGMENT_UNAVAILABLE: {
    problemTemplateId: 'TMPL-ROAD_SEGMENT_UNAVAILABLE',
    defaultPolicy: 'BLOCK_UNTIL_RESOLVED',
  },
  ROAD_SEGMENT_RESTRICTED: {
    problemTemplateId: 'TMPL-ROAD_SEGMENT_RESTRICTED',
    defaultPolicy: 'REQUIRE_USER_CONFIRMATION',
  },
  WEATHER_ACTIVITY_PROHIBITED: {
    problemTemplateId: 'TMPL-WEATHER_ACTIVITY_PROHIBITED',
    defaultPolicy: 'REQUIRE_USER_CONFIRMATION',
  },
  TIME_WINDOW_INFEASIBLE: {
    problemTemplateId: 'TMPL-TIME_WINDOW_INFEASIBLE',
    defaultPolicy: 'REQUIRE_USER_CONFIRMATION',
  },
  WEATHER_ROUTE_RISK: {
    problemTemplateId: 'TMPL-WEATHER_ROUTE_RISK',
    defaultPolicy: 'REQUIRE_USER_CONFIRMATION',
  },
  EXECUTION_SCHEDULE_INFEASIBLE: {
    problemTemplateId: 'TMPL-EXECUTION_SCHEDULE_INFEASIBLE',
    defaultPolicy: 'AUTO_SUGGEST_REPAIR',
  },
};

function readObservationMetric(
  observation: Record<string, number | string | string[]>,
  metric: string,
): number | string | string[] | undefined {
  return observation[metric];
}

function evalCondition(
  condition: TriggerCondition,
  observation: Record<string, number | string | string[]>,
): boolean {
  const actual = readObservationMetric(observation, condition.metric);
  if (actual === undefined) return false;

  switch (condition.operator) {
    case '==':
      return actual === condition.value;
    case '>':
      return Number(actual) > Number(condition.value);
    case '>=':
      return Number(actual) >= Number(condition.value);
    case '<':
      return Number(actual) < Number(condition.value);
    case '<=':
      return Number(actual) <= Number(condition.value);
    case 'IN': {
      const values = Array.isArray(condition.value)
        ? condition.value
        : [String(condition.value)];
      return values.includes(String(actual));
    }
    default:
      return false;
  }
}

export function resolveHookTemplate(semanticKey: string): HookTemplateRegistration | null {
  return TEMPLATE_BY_SEMANTIC_KEY[semanticKey] ?? null;
}

/** 将运行时观测值与 Hook triggerCondition 匹配 */
export function matchDecisionHook(
  hooks: DecisionHook[],
  observation: Record<string, number | string | string[]>,
): DecisionHook | null {
  for (const hook of hooks) {
    if (evalCondition(hook.triggerCondition, observation)) {
      return hook;
    }
  }
  return null;
}

export function matchAllDecisionHooks(
  hooks: DecisionHook[],
  observation: Record<string, number | string | string[]>,
): DecisionHook[] {
  return hooks.filter((hook) => evalCondition(hook.triggerCondition, observation));
}
