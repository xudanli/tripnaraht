import type { ISODate, TripWorldState, ActivityCandidate } from '../../trips/decision/world-model';
import type { CanonicalTravelGraph, TravelGraphPoiNode } from '../contracts/canonical-travel-graph.types';
import { graphToTripPlan } from './graph-to-trip-plan.util';

export function buildTripWorldStateFromGraph(graph: CanonicalTravelGraph): TripWorldState {
  const startDate =
    (graph.days[0]?.date as ISODate | undefined) ??
    (`1970-01-01` as ISODate);
  const durationDays = Math.max(1, graph.days.length);

  const candidatesByDate: TripWorldState['candidatesByDate'] = {};

  for (const day of graph.days) {
    const date = (day.date as ISODate | undefined) ?? startDate;
    const pois = graph.nodes.filter(
      (n): n is TravelGraphPoiNode => n.kind === 'POI' && n.dayIndex === day.dayIndex,
    );
    candidatesByDate[date] = pois.map(
      (poi): ActivityCandidate => ({
        id: poi.canonical?.poiId ?? poi.nodeId,
        name: { en: poi.label, zh: poi.label },
        type: 'sightseeing',
        durationMin: 90,
        intentTags: poi.intentTags,
        requiresBooking: graph.bookings.some(
          (b) => b.linkedNodeId === poi.nodeId && b.required,
        ),
      }),
    );
  }

  const tripPlan = graphToTripPlan(graph);

  return {
    context: {
      tripId: graph.tripId,
      destination: graph.destination.countryCode,
      startDate,
      durationDays,
      preferences: {
        intents: {},
        pace: 'moderate',
        riskTolerance: 'medium',
      },
    },
    candidatesByDate,
    signals: {
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}
