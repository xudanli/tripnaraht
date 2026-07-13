/**
 * WP-TEP / IS-CERT-404 — TEP primary over Canonical duplicate suppression
 * @see internal-docs/product/TEP-PHASE0-CONTRACT-FREEZE.md §6
 */

import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { ExecutionInterventionDto } from '../../../mobile/dto/mobile-execution.types';
import type { DecisionHook } from '../contracts/tep-self-drive.types';

export interface TepCanonicalDedupKeyParts {
  tripId: string;
  eventSemanticKey: string;
  targetRef: string;
  effectivePlanVersionId: string;
}

export interface TepCanonicalDedupContext {
  tripId: string;
  effectivePlanVersionId: string;
  decisionHooks: DecisionHook[];
}

export function buildTepCanonicalDedupKey(parts: TepCanonicalDedupKeyParts): string {
  return `${parts.tripId}|${parts.eventSemanticKey}|${parts.targetRef}|${parts.effectivePlanVersionId}`;
}

export function isTepPrimaryProblemId(problemId: string | undefined): boolean {
  return Boolean(problemId?.startsWith('problem_tep_'));
}

export function isTepPrimaryIntervention(item: ExecutionInterventionDto): boolean {
  if (item.id.startsWith('intervention-tep-')) return true;
  return isTepPrimaryProblemId(item.decisionProblemId);
}

export function resolveDedupKeyFromHook(
  hook: DecisionHook,
  tripId: string,
  effectivePlanVersionId: string,
): string | undefined {
  const eventSemanticKey = hook.semanticKey;
  if (!eventSemanticKey || !hook.targetRef) return undefined;
  return buildTepCanonicalDedupKey({
    tripId,
    eventSemanticKey,
    targetRef: hook.targetRef,
    effectivePlanVersionId,
  });
}

export function resolveTargetRefFromProblem(problem: Rfc001DecisionProblem): string | undefined {
  const driveLeg = problem.affectedEntityRefs?.find((r) => r.id.startsWith('drive_leg_'));
  if (driveLeg) return driveLeg.id;
  const segment = problem.affectedEntityRefs?.find(
    (r) => r.kind === 'ROUTE_SEGMENT' || r.id.startsWith('segment:'),
  );
  if (segment) return segment.id;
  return problem.affectedEntityRefs?.[0]?.id;
}

export function resolveEventSemanticKeyFromProblem(
  problem: Rfc001DecisionProblem,
): string | undefined {
  if (problem.semanticCapability) return problem.semanticCapability;
  if (problem.type === 'RESOURCE_UNAVAILABLE') return 'ROAD_SEGMENT_UNAVAILABLE';
  const targetRef = resolveTargetRefFromProblem(problem);
  if (
    problem.type === 'FEASIBILITY_FAILURE' &&
    (targetRef?.startsWith('drive_leg_') || targetRef?.startsWith('segment:'))
  ) {
    return 'ROAD_SEGMENT_UNAVAILABLE';
  }
  return undefined;
}

export function resolveDedupKeyFromProblem(problem: Rfc001DecisionProblem): string | undefined {
  const eventSemanticKey = resolveEventSemanticKeyFromProblem(problem);
  const targetRef = resolveTargetRefFromProblem(problem);
  if (!eventSemanticKey || !targetRef || !problem.planVersionId) return undefined;
  return buildTepCanonicalDedupKey({
    tripId: problem.tripId,
    eventSemanticKey,
    targetRef,
    effectivePlanVersionId: problem.planVersionId,
  });
}

export function resolveDedupKeyFromIntervention(
  item: ExecutionInterventionDto,
  context: TepCanonicalDedupContext,
): string | undefined {
  if (item.decisionProblemId) {
    const hook = context.decisionHooks.find((h) => {
      const hookKey = resolveDedupKeyFromHook(
        h,
        context.tripId,
        context.effectivePlanVersionId,
      );
      if (!hookKey) return false;
      return item.decisionProblemId?.includes(h.hookId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    });
    if (hook) {
      return resolveDedupKeyFromHook(hook, context.tripId, context.effectivePlanVersionId);
    }
  }

  const activityRef = item.affectedActivities?.find((a) => a.startsWith('drive_leg_'));
  const hook = context.decisionHooks.find((h) => {
    if (activityRef && h.targetRef === activityRef) return true;
    if (h.triggerType === 'ROAD_STATUS_CHANGE' && item.type === 'SAFETY_INTERVENTION') {
      return h.semanticKey === 'ROAD_SEGMENT_UNAVAILABLE';
    }
    return false;
  });
  if (hook) {
    return resolveDedupKeyFromHook(hook, context.tripId, context.effectivePlanVersionId);
  }

  return undefined;
}

/** Collect dedup keys owned by TEP primary (stored hooks + TEP-shaped queue items). */
export function collectTepPrimaryDedupKeys(
  items: ExecutionInterventionDto[],
  context: TepCanonicalDedupContext,
): Set<string> {
  const keys = new Set<string>();
  for (const hook of context.decisionHooks) {
    const key = resolveDedupKeyFromHook(
      hook,
      context.tripId,
      context.effectivePlanVersionId,
    );
    if (key) keys.add(key);
  }
  for (const item of items) {
    if (!isTepPrimaryIntervention(item)) continue;
    const key = resolveDedupKeyFromIntervention(item, context);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * When TEP fully explains an event, suppress Canonical duplicate cards in adjustment-queue.
 * TEP primary interventions are always kept.
 */
export function dedupeAdjustmentQueueForTepCanonical(
  items: ExecutionInterventionDto[],
  context: TepCanonicalDedupContext,
): ExecutionInterventionDto[] {
  const tepPrimaryKeys = collectTepPrimaryDedupKeys(items, context);
  if (tepPrimaryKeys.size === 0) return items;

  return items.filter((item) => {
    if (isTepPrimaryIntervention(item)) return true;
    const key = resolveDedupKeyFromIntervention(item, context);
    if (!key) return true;
    return !tepPrimaryKeys.has(key);
  });
}

export function isCanonicalDuplicateOfTepPrimary(
  canonical: Rfc001DecisionProblem,
  tepPrimary: Rfc001DecisionProblem,
): boolean {
  if (isTepPrimaryProblemId(canonical.problemId)) return false;
  if (!isTepPrimaryProblemId(tepPrimary.problemId)) return false;
  const a = resolveDedupKeyFromProblem(canonical);
  const b = resolveDedupKeyFromProblem(tepPrimary);
  return Boolean(a && b && a === b);
}
