import { randomUUID } from 'crypto';
import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import type { RouteSegment } from '../../trips/decision/shared/world-model.types';
import type { TripMutation, TripMutationSet } from '../../trips/decision-semantics/types/decision-semantics.types';
import { buildItineraryRowsFromSegment } from './plan-gate-timeline-materializer.util';

function resolveSegmentDay(segment: RouteSegment, fallbackIndex: number): number {
  const day = segment.metadata?.day as number | undefined;
  return day != null && day > 0 ? day : fallbackIndex + 1;
}

function shouldIncludeDay(
  day: number,
  partialCommit?: boolean,
  commitDays?: number[],
): boolean {
  if (!partialCommit || !commitDays?.length) return true;
  return commitDays.includes(day);
}

/**
 * Phase 5 — Agent / Planner draft-only: project PlanState segments → TripMutationSet
 * without writing ItineraryItem rows.
 */
export function buildAgentPlanDraftMutationSet(input: {
  tripId: string;
  planState: PlanState;
  versionBefore?: string;
  partialCommit?: boolean;
  commitDays?: number[];
}): TripMutationSet {
  const segments = input.planState.itinerary?.segments ?? [];
  const operations: TripMutation[] = [];
  const materializedDays: number[] = [];
  const skippedDays: number[] = [];

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const day = resolveSegmentDay(segment, index);
    if (!shouldIncludeDay(day, input.partialCommit, input.commitDays)) {
      skippedDays.push(day);
      continue;
    }

    const rows = buildItineraryRowsFromSegment(segment);
    if (rows.length) materializedDays.push(day);

    for (const row of rows) {
      operations.push({
        operation: 'ADD',
        entityType: 'ITINERARY_ITEM',
        entityId: `draft_${randomUUID().slice(0, 8)}`,
        after: {
          day,
          placeId: row.placeId,
          type: row.type,
          label: row.label,
          startMinutes: row.startMinutes,
          durationMinutes: row.durationMinutes,
          source: 'AGENT_PLAN_DRAFT',
          planId: input.planState.plan_id,
        },
        semanticEffects: [],
      });
    }
  }

  return {
    mutationId: `mut_agent_draft_${randomUUID().slice(0, 12)}`,
    tripId: input.tripId,
    operations,
    createdAt: new Date().toISOString(),
    createdBy: 'PLANNING_WORKBENCH_AGENT',
    versionBefore: input.versionBefore ?? '0',
    versionAfter: undefined,
  };
}

export function summarizeAgentPlanDraft(draft: TripMutationSet): {
  added: number;
  modified: number;
  removed: number;
  materializedDays: number[];
} {
  const days = new Set<number>();
  for (const op of draft.operations) {
    const day = op.after?.day;
    if (typeof day === 'number' && day > 0) days.add(day);
  }
  return {
    added: draft.operations.length,
    modified: 0,
    removed: 0,
    materializedDays: [...days].sort((a, b) => a - b),
  };
}
