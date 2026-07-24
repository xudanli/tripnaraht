/**
 * P4.d — MOVE_DAY SolverCandidate → RFC001 ops / PlanProposal changes / RoutePlan draft.
 * Shadow projection only — never authorize or write Effective Plan.
 */

import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import type { PlanOperation } from '../../../trips/guardian-decision-core/contracts/plan-operation.types';
import type { PlanProposalChange } from '../../../trips/arrange-itinerary/types/plan-proposal.types';
import type { SolverCandidate } from '../contracts/solver-response';
import { applyDayOrderToRoutePlan } from '../materialize/apply-day-order-to-route-plan.util';
import { minutesToHhMm } from '../materialize/apply-day-order-to-route-plan.util';

/** day-1 → 1, day-2 → 2; falls back to 1-based index in dayIds. */
export function parseDayIndexFromDayId(
  dayId: string,
  dayIdsOrdered?: string[],
): number {
  const m = /^day-?(\d+)$/i.exec(dayId.trim());
  if (m) return Math.max(1, Number(m[1]));
  if (dayIdsOrdered?.length) {
    const idx = dayIdsOrdered.indexOf(dayId);
    if (idx >= 0) return idx + 1;
  }
  return 1;
}

export function buildMoveDayRfc001Operations(
  cand: SolverCandidate,
): PlanOperation[] {
  const ops: PlanOperation[] = [];
  const dayIds = cand.dayPlans.map((d) => d.dayId);
  const moved = cand.diffHint?.movedDayPairs ?? [];

  for (const pair of moved) {
    const toDayIndex = parseDayIndexFromDayId(pair.toDayId, dayIds);
    const fromDayIndex = parseDayIndexFromDayId(pair.fromDayId, dayIds);
    ops.push({
      operationId: `op_${cand.candidateId}_move_day_${pair.nodeId}`,
      kind: 'MOVE_ITEM',
      targetRefs: [{ kind: 'PLAN_ITEM', id: pair.nodeId }],
      parameters: {
        itineraryItemId: pair.nodeId,
        fromDayId: pair.fromDayId,
        toDayId: pair.toDayId,
        fromDayIndex,
        dayIndex: toDayIndex,
        source: 'ortools_move_day',
        operation: 'MOVE_DAY',
        shadowOnly: true,
      },
    });
  }

  for (const plan of cand.dayPlans) {
    const dayIndex = parseDayIndexFromDayId(plan.dayId, dayIds);
    const orderedNodeIds = plan.nodeIds.filter((id) => id !== 'depot');
    if (!orderedNodeIds.length) continue;
    ops.push({
      operationId: `op_${cand.candidateId}_reorder_${plan.dayId}`,
      kind: 'MOVE_ITEM',
      targetRefs: orderedNodeIds.map((id) => ({
        kind: 'PLAN_ITEM' as const,
        id,
      })),
      parameters: {
        dayIndex,
        dayId: plan.dayId,
        orderedNodeIds,
        source: 'ortools_move_day',
        operation: 'MOVE_DAY',
        shadowOnly: true,
      },
    });
  }

  return ops;
}

export function solverMoveDayToPlanProposalChanges(
  cand: SolverCandidate,
): PlanProposalChange[] {
  const changes: PlanProposalChange[] = [];
  const dayIds = cand.dayPlans.map((d) => d.dayId);
  const moved = cand.diffHint?.movedDayPairs ?? [];

  for (const pair of moved) {
    const fromDay = parseDayIndexFromDayId(pair.fromDayId, dayIds);
    const toDay = parseDayIndexFromDayId(pair.toDayId, dayIds);
    changes.push({
      operation: 'MOVE',
      itemId: pair.nodeId,
      dayIndex: toDay,
      from: `第 ${fromDay} 天`,
      to: `第 ${toDay} 天`,
      label: pair.nodeId,
      note: `[ortools-shadow] MOVE_DAY ${pair.fromDayId}→${pair.toDayId}`,
    });
  }

  for (const plan of cand.dayPlans) {
    const dayIndex = parseDayIndexFromDayId(plan.dayId, dayIds);
    plan.nodeIds.forEach((nodeId, idx) => {
      if (nodeId === 'depot') return;
      if (moved.some((p) => p.nodeId === nodeId)) return; // already emitted
      const startMin = plan.startMin?.[idx];
      if (startMin == null) return;
      changes.push({
        operation: 'MOVE',
        itemId: nodeId,
        dayIndex,
        to: `第 ${dayIndex} 天 ${minutesToHhMm(startMin)}`,
        startTime: minutesToHhMm(startMin),
        label: nodeId,
        note: `[ortools-shadow] MOVE_DAY schedule ${plan.dayId}`,
      });
    });
  }

  return changes;
}

/** Apply all dayPlans onto a RoutePlanDraft (shadow materialize). */
export function applyMoveDayCandidateToRoutePlan(
  base: RoutePlanDraft,
  candidate: SolverCandidate,
): RoutePlanDraft {
  let draft = base;
  const dayIds = candidate.dayPlans.map((d) => d.dayId);
  for (const plan of candidate.dayPlans) {
    const dayIndex = parseDayIndexFromDayId(plan.dayId, dayIds);
    // Re-home segments listed on this day before ordering
    const visitIds = new Set(plan.nodeIds.filter((id) => id !== 'depot'));
    const remapped = (draft.segments ?? []).map((seg) => {
      const meta = (seg.metadata ?? {}) as Record<string, unknown>;
      const key =
        (typeof meta.itineraryItemId === 'string' && meta.itineraryItemId) ||
        (typeof meta.poiId === 'string' && meta.poiId) ||
        seg.segmentId;
      if (visitIds.has(key) && seg.dayIndex !== dayIndex) {
        return { ...seg, dayIndex };
      }
      return seg;
    });
    draft = { ...draft, segments: remapped };
    draft = applyDayOrderToRoutePlan(draft, {
      dayIndex,
      orderedNodeIds: plan.nodeIds,
      strict: false,
    });
  }
  return draft;
}

/** True when proposedOperations / changes came from MOVE_DAY shadow projection. */
export function isOrtToolsMoveDayShadowOp(parameters: Record<string, unknown>): boolean {
  return (
    parameters.source === 'ortools_move_day' ||
    parameters.operation === 'MOVE_DAY' ||
    parameters.shadowOnly === true
  );
}
