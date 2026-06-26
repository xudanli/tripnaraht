import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import {
  assessRiskImpacts,
  buildTripImpactEdges,
} from '../../../agent/execution/trip-impact-graph';
import type { TravelRiskEvent } from '../../../agent/execution/risk-event.types';
import type { InTripAnchorSnapshot } from '../types/anchor-handoff.types';

export function buildPhaseContextFromAnchor(
  anchor: InTripAnchorSnapshot,
): PhaseExecutorContext {
  return {
    itinerary: {
      days: anchor.itinerary.days.map((day) => ({
        date: day.date,
        items: day.items.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          poi_id: item.id,
          metadata: {},
        })),
      })),
    },
  } as PhaseExecutorContext;
}

export function assessRisksForAnchor(
  anchor: InTripAnchorSnapshot,
  risks: TravelRiskEvent[],
) {
  const ctx = buildPhaseContextFromAnchor(anchor);
  return assessRiskImpacts(risks, ctx);
}

export function buildEdgesFromAnchor(anchor: InTripAnchorSnapshot) {
  return buildTripImpactEdges(buildPhaseContextFromAnchor(anchor));
}
