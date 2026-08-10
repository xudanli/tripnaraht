/**
 * Observation Plan 构造：模板 + CRE 安全底线；校验 Registry，禁止自由造键。
 */

import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';
import type { CreOperation } from '../context-requirement/operation.types';
import {
  assertObservationKeysRegistered,
  creKeyToObservationKeys,
  isRegisteredObservationKey,
} from './observation-capability.registry';
import { buildPlanFromTemplate } from './observation-task.templates';
import type {
  ObservationNeed,
  ObservationPlan,
  ObservationScope,
  RorObservationTask,
} from './reality-observation.types';

/** CRE operation → ROR 观察任务 */
export function mapCreOperationToRorTask(
  creOp: CreOperation,
  message?: string,
): RorObservationTask | null {
  const msg = message ?? '';
  switch (creOp) {
    case 'ADD_ACTIVITY_TO_DAY':
      return 'ADD_ACTIVITY';
    case 'REPLACE_ACTIVITY':
      return 'REPLACE_ACTIVITY';
    case 'REPLAN_DUE_TO_RISK':
      return 'RISK_REPLAN';
    case 'CHECK_EXECUTABILITY':
      if (/路|路线|F-road|能不能走|通行/i.test(msg)) return 'ROUTE_EXECUTABILITY';
      return 'DAY_EXECUTABILITY';
    case 'OPTIMIZE_DAY':
    case 'OPTIMIZE_TRIP':
      return 'DAY_PACE';
    case 'CHANGE_ACCOMMODATION':
    case 'MOVE_ACTIVITY':
      return 'DAY_PACE';
    case 'ASK_TRIP_QUESTION':
    case 'COMPARE_OPTIONS':
    case 'UPLOAD_BOOKING':
    case 'GENERIC_UNKNOWN':
      return null;
    default:
      return null;
  }
}

/** 话术兜底映射（无 CRE 或 CRE 偏泛时） */
export function inferRorTaskFromMessage(message: string): RorObservationTask | null {
  const m = message ?? '';
  if (/太赶|太累|轻松一点|节奏|pace|density/i.test(m)) return 'DAY_PACE';
  if (/换一个|换成|替代|replace/i.test(m)) return 'REPLACE_ACTIVITY';
  if (/加到|安排到|排到|加入/i.test(m)) return 'ADD_ACTIVITY';
  if (/天气变|风暴|封路|重排|plan\s*b/i.test(m)) return 'RISK_REPLAN';
  if (/能不能走|这条路|F-road|通行/i.test(m)) return 'ROUTE_EXECUTABILITY';
  if (
    /还能去吗|能不能去|适合去|executab|安全吗|影响.{0,8}(?:行程|日程|计划)|天气影响/i.test(m)
  ) {
    return 'DAY_EXECUTABILITY';
  }
  return null;
}

export function buildCreSafetyFloorKeys(crePlan?: ContextRequirementPlan | null): string[] {
  if (!crePlan?.requirements?.length) return [];
  const keys: string[] = [];
  for (const req of crePlan.requirements) {
    if (!req.blocking && req.necessity !== 'REQUIRED' && req.necessity !== 'APPLY_REQUIRED') {
      continue;
    }
    keys.push(...creKeyToObservationKeys(req.key));
  }
  return [...new Set(keys)].filter(isRegisteredObservationKey);
}

function injectSafetyFloorNeeds(
  plan: ObservationPlan,
  safetyFloorKeys: string[],
): ObservationPlan {
  const present = new Set(plan.needs.flatMap((n) => n.contextKeys));
  const extra: ObservationNeed[] = [];
  for (const key of safetyFloorKeys) {
    if (present.has(key)) continue;
    if (!isRegisteredObservationKey(key)) continue;
    extra.push({
      question: `安全底线：观察 ${key}`,
      subject: `safety:${key}`,
      contextKeys: [key],
      reason: 'CRE blocking/required 不可省略',
      necessity: 'REQUIRED',
      blocking: true,
    });
    present.add(key);
  }
  return {
    ...plan,
    needs: [...plan.needs, ...extra],
    safetyFloorKeys,
  };
}

export function validateObservationPlanKeys(plan: ObservationPlan): {
  ok: boolean;
  illegalKeys: string[];
} {
  const all = plan.needs.flatMap((n) => n.contextKeys);
  const illegalKeys = assertObservationKeysRegistered(all);
  return { ok: illegalKeys.length === 0, illegalKeys };
}

export type BuildObservationPlanInput = {
  message: string;
  scope: ObservationScope;
  crePlan?: ContextRequirementPlan | null;
  travelMode?: 'SELF_DRIVE' | 'OTHER' | null;
  containsOutdoorActivity?: boolean;
  containsReservableActivity?: boolean;
  /** 可选：外部（LLM）提出的 needs；非法 key 会被丢弃 */
  proposedNeeds?: ObservationNeed[];
};

/**
 * 构造 Observation Plan（规则模板起步；可选合并 LLM 提案中的合法键）。
 */
export function buildObservationPlan(input: BuildObservationPlanInput): ObservationPlan | null {
  const creOp = input.crePlan?.operation;
  const task =
    (creOp ? mapCreOperationToRorTask(creOp, input.message) : null) ??
    inferRorTaskFromMessage(input.message);
  if (!task) return null;

  const dayFromCre = input.crePlan?.target?.dayIndex;
  const scope: ObservationScope = {
    ...input.scope,
    dayIndex: input.scope.dayIndex ?? dayFromCre ?? null,
    message: input.message,
  };

  const safetyFloorKeys = buildCreSafetyFloorKeys(input.crePlan);
  let plan = buildPlanFromTemplate(
    task,
    scope,
    {
      travelMode: input.travelMode,
      containsOutdoorActivity: input.containsOutdoorActivity,
      containsReservableActivity: input.containsReservableActivity,
    },
    safetyFloorKeys,
  );
  plan = injectSafetyFloorNeeds(plan, safetyFloorKeys);

  if (input.proposedNeeds?.length) {
    const legal = input.proposedNeeds
      .map((n) => ({
        ...n,
        contextKeys: n.contextKeys.filter(isRegisteredObservationKey),
      }))
      .filter((n) => n.contextKeys.length > 0);
    const seen = new Set(plan.needs.map((n) => n.subject));
    for (const n of legal) {
      if (seen.has(n.subject)) continue;
      plan.needs.push(n);
      seen.add(n.subject);
    }
  }

  const check = validateObservationPlanKeys(plan);
  if (!check.ok) {
    plan = {
      ...plan,
      needs: plan.needs
        .map((n) => ({
          ...n,
          contextKeys: n.contextKeys.filter(isRegisteredObservationKey),
        }))
        .filter((n) => n.contextKeys.length > 0),
    };
  }
  return plan;
}
