/**
 * WP-TEP-11/12 — DecisionHook 匹配结果 → Rfc001DecisionProblem 草稿
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md 附录 C
 */

import type { EntityRef } from '../../guardian-decision-core/contracts/entity-ref.types';
import type {
  Rfc001DecisionProblem,
  Rfc001DecisionProblemType,
  Rfc001DecisionProblemUrgency,
} from '../../guardian-decision-core/contracts/decision-problem.types';
import type { DecisionHook } from '../contracts/tep-self-drive.types';
import { resolveHookTemplate } from '../registry/decision-hook.registry';

const SEMANTIC_TO_PROBLEM_TYPE: Record<string, Rfc001DecisionProblemType> = {
  ROAD_SEGMENT_UNAVAILABLE: 'RESOURCE_UNAVAILABLE',
  ROAD_SEGMENT_RESTRICTED: 'FEASIBILITY_FAILURE',
  WEATHER_ACTIVITY_PROHIBITED: 'FEASIBILITY_FAILURE',
  WEATHER_ROUTE_RISK: 'SCHEDULE_RISK',
  TIME_WINDOW_INFEASIBLE: 'SCHEDULE_RISK',
  EXECUTION_SCHEDULE_INFEASIBLE: 'EXECUTION_FAILURE',
  EXCESSIVE_DAILY_LOAD: 'EXCESSIVE_LOAD',
};

function mapRefToEntity(ref: string): EntityRef {
  if (ref.startsWith('segment:') || ref.startsWith('drive_leg_')) {
    return { kind: 'ROUTE_SEGMENT', id: ref };
  }
  if (ref.startsWith('day_')) {
    return { kind: 'DAY', id: ref };
  }
  if (ref.startsWith('accommodation_')) {
    return { kind: 'RESERVATION', id: ref };
  }
  if (ref.startsWith('activity_') || ref.startsWith('item_')) {
    return { kind: 'PLAN_ITEM', id: ref };
  }
  if (ref.startsWith('anchor_')) {
    return { kind: 'POI', id: ref };
  }
  return { kind: 'PLAN_ITEM', id: ref };
}

function resolveUrgency(hook: DecisionHook): Rfc001DecisionProblemUrgency {
  if (hook.defaultPolicy === 'BLOCK_UNTIL_RESOLVED') return 'HIGH';
  if (hook.semanticKey === 'ROAD_SEGMENT_UNAVAILABLE') return 'HIGH';
  return 'MEDIUM';
}

function extractPlanItemIds(impactScope: string[]): string[] {
  return impactScope.filter(
    (ref) =>
      ref.startsWith('activity_') ||
      ref.startsWith('item_') ||
      ref.startsWith('accommodation_'),
  );
}

export interface HookDecisionProblemDraftInput {
  tripId: string;
  planVersionId: string;
  hook: DecisionHook;
  triggerEventId: string;
  worldStateSnapshotId: string;
  detectedAt?: string;
  affectedPlanItemIds?: string[];
}

/** 将匹配的 DecisionHook 投影为 RFC-001 DecisionProblem 草稿（运行时 harness / Detector 桥接） */
export function projectHookToDecisionProblemDraft(
  input: HookDecisionProblemDraftInput,
): Rfc001DecisionProblem {
  const semanticKey = input.hook.semanticKey ?? 'UNKNOWN';
  resolveHookTemplate(semanticKey);
  const type = SEMANTIC_TO_PROBLEM_TYPE[semanticKey] ?? 'FEASIBILITY_FAILURE';
  const affectedPlanItemIds =
    input.affectedPlanItemIds ?? extractPlanItemIds(input.hook.impactScope);

  return {
    problemId: `problem_tep_${input.hook.hookId}_${input.tripId.slice(0, 8)}`,
    tripId: input.tripId,
    planVersionId: input.planVersionId,
    type,
    triggerEventId: input.triggerEventId,
    affectedEntityRefs: input.hook.impactScope.map(mapRefToEntity),
    affectedPlanItemIds,
    worldStateSnapshotId: input.worldStateSnapshotId,
    detectedAt: input.detectedAt ?? new Date().toISOString(),
    urgency: resolveUrgency(input.hook),
    status: 'OPEN',
    semanticCapability: semanticKey,
  };
}

/** 观测值从 OPEN 变为阻断态时是否应触发 Hook */
export function shouldTriggerHookTransition(input: {
  hook: DecisionHook;
  previousObservation: Record<string, number | string | string[]>;
  currentObservation: Record<string, number | string | string[]>;
}): boolean {
  const { hook, previousObservation, currentObservation } = input;
  const wasTriggered = evalHookCondition(hook, previousObservation);
  const isTriggered = evalHookCondition(hook, currentObservation);
  return !wasTriggered && isTriggered;
}

function evalHookCondition(
  hook: DecisionHook,
  observation: Record<string, number | string | string[]>,
): boolean {
  const actual = observation[hook.triggerCondition.metric];
  if (actual === undefined) return false;
  const { operator, value } = hook.triggerCondition;
  switch (operator) {
    case 'IN': {
      const values = Array.isArray(value) ? value : [String(value)];
      return values.includes(String(actual));
    }
    case '>=':
      return Number(actual) >= Number(value);
    case '>':
      return Number(actual) > Number(value);
    case '<=':
      return Number(actual) <= Number(value);
    case '<':
      return Number(actual) < Number(value);
    case '==':
      return actual === value;
    default:
      return false;
  }
}
