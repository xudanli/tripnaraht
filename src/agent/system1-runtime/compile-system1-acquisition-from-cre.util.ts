/**
 * CRE → System1 取数编排。
 * Family RequiredEvidence 仍是 Sufficiency 合同；CRE 决定 WORLD_STATE 传感器要不要 FETCH。
 * ASK_TRIP_QUESTION 合同故意不含路况/车辆，不得误删 lodging / timeline 取证。
 */

import {
  buildContextRequirementPlan,
  evaluateContextRequirementPlan,
  inferCreActivityFlagsFromMessage,
  type ContextRequirementPlan,
  type CreContextHints,
  type CreContextSource,
} from '../context-requirement';
import { planEvidenceAcquisition } from './plan-evidence-acquisition.util';
import { resolveSystem1RequiredEvidence } from './required-evidence.registry';
import type {
  EvidenceAcquisitionPlan,
  RequiredEvidenceSpec,
  System1ClaimType,
  System1CreOrchestration,
  System1Evidence,
  System1EvidenceSourceType,
  System1RuntimeFamily,
} from './system1-runtime.types';

/** CRE 合同键 → System1 Evidence 键（仅已有 adapter 的映射） */
export const CRE_KEY_TO_SYSTEM1: Record<string, string> = {
  'weather.forecast': 'weather.wind',
  roadConditions: 'route.status',
  'vehicle.profile': 'vehicle.profile',
  'targetDay.activities': 'trip.timeline',
  'targetDay.date': 'trip.current_day',
  'targetDay.accommodation': 'trip.accommodation_anchors',
  'options.candidates': 'decision.options',
};

const WORLD_SENSOR_KEYS = new Set(['weather.wind', 'route.status']);

export function mapCreSourceToSystem1(
  source: CreContextSource,
): System1EvidenceSourceType {
  if (source === 'WEATHER_SERVICE' || source === 'ROAD_SERVICE') return 'WORLD_STATE';
  if (source === 'KNOWLEDGE_BASE') return 'KNOWLEDGE';
  if (source === 'USER_INPUT' || source === 'USER_PROMPT') return 'USER_INPUT';
  if (source === 'PRODUCT_CATALOG') return 'TOOL';
  return 'TRIP_STATE';
}

export function mapCreKeyToSystem1(creKey: string): string | null {
  return CRE_KEY_TO_SYSTEM1[creKey] ?? null;
}

export function projectCreOrchestration(
  crePlan: ContextRequirementPlan | null | undefined,
  constrainedKeys: string[] = [],
): System1CreOrchestration | undefined {
  if (!crePlan) return undefined;
  const mappedFetchKeys = [
    ...new Set(
      crePlan.acquisition.fetchKeys
        .map((k) => mapCreKeyToSystem1(k))
        .filter((k): k is string => Boolean(k)),
    ),
  ];
  return {
    operation: crePlan.operation,
    nextAction: crePlan.nextAction,
    creFetchKeys: [...crePlan.acquisition.fetchKeys],
    mappedFetchKeys,
    constrainedKeys,
  };
}

/**
 * Live 在 Gateway 提前返回，看不到 Orchestrator CRE。
 * 可行性默认自驾，才能展开 roadConditions。
 */
export function ensureSystem1CrePlan(input: {
  family: System1RuntimeFamily;
  message: string;
  tripId?: string | null;
  crePlan?: ContextRequirementPlan | null;
  hints?: CreContextHints;
}): ContextRequirementPlan {
  if (input.crePlan) return input.crePlan;
  const activity = inferCreActivityFlagsFromMessage(input.message);
  if (input.family === 'LIVE_FEASIBILITY') {
    return buildContextRequirementPlan({
      message: input.message,
      tripId: input.tripId ?? null,
      unifiedSemanticIntent: 'ASSESS_IMPACT',
      hints: {
        message: input.message,
        tripId: input.tripId ?? null,
        travelMode: 'SELF_DRIVE',
        destinationKnown: Boolean(input.tripId?.trim()),
        containsOutdoorActivity: activity.containsOutdoorActivity,
        containsReservableActivity: activity.containsReservableActivity,
        ...(input.hints ?? {}),
      },
    });
  }
  if (input.family === 'DECISION_SUPPORT') {
    return evaluateContextRequirementPlan(
      {
        operation: 'COMPARE_OPTIONS',
        confidence: 0.92,
        target: {},
        reason: 'system1_decision_support',
      },
      {
        message: input.message,
        tripId: input.tripId ?? null,
        destinationKnown: Boolean(input.tripId?.trim()),
        ...(input.hints ?? {}),
      },
    );
  }
  if (input.family === 'WEATHER_ROAD_QA') {
    return buildContextRequirementPlan({
      message: input.message,
      tripId: input.tripId ?? null,
      unifiedSemanticIntent: 'ASSESS_IMPACT',
      hints: {
        message: input.message,
        tripId: input.tripId ?? null,
        travelMode: 'SELF_DRIVE',
        destinationKnown: Boolean(input.tripId?.trim()),
        containsOutdoorActivity: activity.containsOutdoorActivity,
        ...(input.hints ?? {}),
      },
    });
  }
  if (input.family === 'INVENTORY_CONSULT') {
    return buildContextRequirementPlan({
      message: input.message,
      tripId: input.tripId ?? null,
      unifiedSemanticIntent: 'CONSULT',
      hints: {
        message: input.message,
        tripId: input.tripId ?? null,
        destinationKnown: Boolean(input.tripId?.trim()),
        ...(input.hints ?? {}),
      },
    });
  }
  return buildContextRequirementPlan({
    message: input.message,
    tripId: input.tripId ?? null,
    unifiedSemanticIntent: 'CONSULT',
    hints: {
      message: input.message,
      tripId: input.tripId ?? null,
      destinationKnown: Boolean(input.tripId?.trim()),
      ...(input.hints ?? {}),
    },
  });
}

/**
 * CRE 已声明的 WORLD_STATE 字段：仅 FETCHABLE 才拉。
 * CRE 未声明的 Family 键（住宿日程等）保持原计划。
 */
export function applyCreFetchOverlay(
  plan: EvidenceAcquisitionPlan,
  crePlan: ContextRequirementPlan | null | undefined,
): { plan: EvidenceAcquisitionPlan; constrainedKeys: string[] } {
  if (!crePlan) return { plan, constrainedKeys: [] };
  const mappedDeclared = new Set<string>();
  const mappedFetchable = new Set<string>();
  for (const req of crePlan.requirements) {
    const sysKey = mapCreKeyToSystem1(req.key);
    if (!sysKey) continue;
    mappedDeclared.add(sysKey);
    if (req.status === 'FETCHABLE' || crePlan.acquisition.fetchKeys.includes(req.key)) {
      mappedFetchable.add(sysKey);
    }
  }

  const constrainedKeys: string[] = [];
  const fetchKeys = plan.fetchKeys.filter((k) => {
    if (!WORLD_SENSOR_KEYS.has(k)) return true;
    if (!mappedDeclared.has(k)) return true;
    if (mappedFetchable.has(k)) return true;
    constrainedKeys.push(k);
    return false;
  });

  const constrained = new Set(constrainedKeys);
  const items = plan.items.map((item) => {
    if (item.action !== 'FETCH' || !constrained.has(item.key)) return item;
    return { key: item.key, action: 'SKIP' as const, reason: 'cre_not_fetchable' };
  });

  return {
    constrainedKeys,
    plan: {
      ...plan,
      items,
      fetchKeys,
    },
  };
}

export function compileSystem1AcquisitionPlan(input: {
  family: System1RuntimeFamily | null | undefined;
  evidence: System1Evidence[];
  tripId?: string | null;
  skipExternalFetch?: boolean;
  alreadyFetched?: string[];
  crePlan?: ContextRequirementPlan | null;
  candidateClaimTypes?: System1ClaimType[] | null;
}): {
  required: RequiredEvidenceSpec[];
  plan: EvidenceAcquisitionPlan;
  cre?: System1CreOrchestration;
} {
  const required = resolveSystem1RequiredEvidence({
    family: input.family,
    candidateClaimTypes: input.candidateClaimTypes,
  });
  const raw = planEvidenceAcquisition({
    required,
    evidence: input.evidence,
    context: {
      tripId: input.tripId,
      skipExternalFetch: input.skipExternalFetch,
      alreadyFetched: input.alreadyFetched,
    },
  });
  const overlaid = applyCreFetchOverlay(raw, input.crePlan);
  return {
    required,
    plan: overlaid.plan,
    cre: projectCreOrchestration(input.crePlan, overlaid.constrainedKeys),
  };
}
