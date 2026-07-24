/**
 * SolverCandidate → PlanProposalChange[] (shadow suggestion only).
 * Never applied unless user confirms a separate proposal built from changes.
 */

import type { PlanProposalChange } from '../../../trips/arrange-itinerary/types/plan-proposal.types';
import type { SolverCandidate } from '../contracts/solver-response';
import { minutesToHhMm } from '../materialize/apply-day-order-to-route-plan.util';
import {
  dateToDayMinutes,
  serviceDurationMinutes,
  type DayVrptwItemInput,
} from '../projection/build-solver-problem-from-day-items.util';
import { solverMoveDayToPlanProposalChanges } from './ortools-move-day-projection.util';

export function solverCandidateToPlanProposalChanges(input: {
  candidate: SolverCandidate;
  dayIndex: number;
  items: DayVrptwItemInput[];
}): PlanProposalChange[] {
  if (input.candidate.operation === 'MOVE_DAY') {
    return solverMoveDayToPlanProposalChanges(input.candidate);
  }

  const byId = new Map(input.items.map((i) => [i.itemId, i]));
  const day = input.candidate.dayPlans[0];
  if (!day) return [];

  const baseOrder = input.items.map((i) => i.itemId);
  const newOrder = day.nodeIds.filter((id) => id !== 'depot');
  const orderChanged = baseOrder.join('|') !== newOrder.join('|');

  const changes: PlanProposalChange[] = [];
  day.nodeIds.forEach((nodeId, idx) => {
    if (nodeId === 'depot') return;
    const item = byId.get(nodeId);
    if (!item) return;
    const startMin = day.startMin?.[idx] ?? dateToDayMinutes(item.startTime);
    const dur = serviceDurationMinutes(item);
    const endMin = startMin + dur;
    const startLabel = minutesToHhMm(startMin);
    const endLabel = minutesToHhMm(endMin);
    const fromLabel = minutesToHhMm(dateToDayMinutes(item.startTime));
    if (!orderChanged && startLabel === fromLabel) return;

    changes.push({
      operation: 'MOVE',
      itemId: item.itemId,
      dayIndex: input.dayIndex,
      from: `第 ${input.dayIndex} 天 ${fromLabel}`,
      to: `第 ${input.dayIndex} 天 ${startLabel}`,
      startTime: startLabel,
      endTime: endLabel,
      label: item.label ?? '活动',
      note: `[ortools-shadow] ${input.candidate.operation} ${input.candidate.label}`,
    });
  });

  return changes;
}

/** Prefer lowest objective candidate. */
export function pickBestSolverCandidate(
  candidates: SolverCandidate[],
): SolverCandidate | undefined {
  if (!candidates.length) return undefined;
  return [...candidates].sort(
    (a, b) => (a.objectiveValue ?? 0) - (b.objectiveValue ?? 0),
  )[0];
}
