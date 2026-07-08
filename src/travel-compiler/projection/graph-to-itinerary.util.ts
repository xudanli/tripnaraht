import type { Itinerary, ItineraryItem, ItineraryItemType } from '../../agent/interfaces/trip-plan.interface';
import type {
  CanonicalTravelGraph,
  TravelGraphActivityNode,
  TravelGraphBookingNode,
  TravelGraphNode,
  TravelGraphPoiNode,
  TravelGraphRouteSegmentNode,
  TravelGraphStayNode,
} from '../contracts/canonical-travel-graph.types';
import { graphToTripPlan } from './graph-to-trip-plan.util';
import { orderedSchedulableNodesForDay } from './ordered-schedulable-nodes.util';

function mapSegmentTransportMode(mode?: string): ItineraryItemType {
  switch (mode) {
    case 'walk':
      return 'WALK';
    case 'transit':
    case 'ferry':
      return 'TRANSIT';
    default:
      return 'DRIVE';
  }
}

function mapNodeToItineraryItem(
  node: TravelGraphNode,
  slotTime?: { start: string; end: string },
): ItineraryItem {
  const start = slotTime?.start ?? '09:00';
  const end = slotTime?.end ?? '11:00';

  switch (node.kind) {
    case 'POI': {
      const poi = node as TravelGraphPoiNode;
      return {
        id: poi.nodeId,
        type: 'POI',
        start_window: start,
        end_window: end,
        location_ref: {
          name: poi.label,
          place_id: poi.canonical?.placeId,
        },
        evidence_refs: poi.evidenceRefs ?? [],
        verified: Boolean(poi.canonical?.poiId),
        verification_status: poi.canonical?.poiId ? 'VERIFIED' : 'UNVERIFIED',
        metadata: {
          canonical_poi_id: poi.canonical?.poiId,
          intent_tags: poi.intentTags,
          graph_node_kind: 'POI',
          graph_node_id: poi.nodeId,
        },
      };
    }
    case 'ROUTE_SEGMENT': {
      const seg = node as TravelGraphRouteSegmentNode;
      return {
        id: seg.nodeId,
        type: mapSegmentTransportMode(seg.transportMode),
        start_window: start,
        end_window: end,
        location_ref: { name: seg.label },
        evidence_refs: seg.evidenceRefs ?? [],
        verified: Boolean(seg.segmentId),
        verification_status: seg.segmentId ? 'VERIFIED' : 'UNVERIFIED',
        metadata: {
          graph_node_kind: 'ROUTE_SEGMENT',
          graph_node_id: seg.nodeId,
          route_segment_ref: seg.segmentId,
          distance_meters: seg.distanceKm ? Math.round(seg.distanceKm * 1000) : undefined,
          duration_minutes: seg.durationMin,
        },
      };
    }
    case 'STAY': {
      const stay = node as TravelGraphStayNode;
      return {
        id: stay.nodeId,
        type: 'ACCOMMODATION',
        start_window: stay.checkInHint ?? start,
        end_window: stay.checkOutHint ?? end,
        location_ref: { name: stay.label },
        evidence_refs: stay.evidenceRefs ?? [],
        verified: true,
        verification_status: 'VERIFIED',
        metadata: {
          graph_node_kind: 'STAY',
          graph_node_id: stay.nodeId,
          linked_poi_node_id: stay.linkedPoiNodeId,
        },
      };
    }
    case 'BOOKING': {
      const booking = node as TravelGraphBookingNode;
      return {
        id: booking.nodeId,
        type: booking.bookingKind === 'hotel' ? 'ACCOMMODATION' : 'POI',
        start_window: start,
        end_window: end,
        location_ref: { name: booking.label },
        evidence_refs: booking.evidenceRefs ?? [],
        verified: booking.status === 'booked',
        verification_status: booking.status === 'booked' ? 'VERIFIED' : 'ASSUMPTION',
        notes: booking.required ? 'booking_required' : undefined,
        metadata: {
          graph_node_kind: 'BOOKING',
          graph_node_id: booking.nodeId,
          booking_kind: booking.bookingKind,
          booking_status: booking.status,
          linked_node_id: booking.linkedNodeId,
        },
      };
    }
    case 'ACTIVITY': {
      const activity = node as TravelGraphActivityNode;
      return {
        id: activity.nodeId,
        type: 'POI',
        start_window: start,
        end_window: end,
        location_ref: { name: activity.label },
        evidence_refs: activity.evidenceRefs ?? [],
        verified: Boolean(activity.canonical?.poiId),
        metadata: {
          graph_node_kind: 'ACTIVITY',
          graph_node_id: activity.nodeId,
          activity_type: activity.activityType,
          linked_poi_node_id: activity.linkedPoiNodeId,
        },
      };
    }
    default:
      return {
        id: node.nodeId,
        type: 'REST',
        start_window: start,
        end_window: end,
        location_ref: { name: node.label },
        evidence_refs: node.evidenceRefs ?? [],
        verified: false,
        verification_status: 'UNVERIFIED',
        metadata: {
          graph_node_kind: node.kind,
          graph_node_id: node.nodeId,
        },
      };
  }
}

export function graphToItinerary(graph: CanonicalTravelGraph): Itinerary {
  const requestId = graph.requestId ?? graph.compileId;
  const tripPlan = graphToTripPlan(graph);

  const days = tripPlan.days.map((day) => {
    const dayNode = graph.days.find((d) => d.dayIndex === day.day - 1);
    const scheduleNodes = orderedSchedulableNodesForDay(graph, day.day - 1);

    const items: ItineraryItem[] = scheduleNodes.map((node, idx) => {
      const slot = day.timeSlots[idx];
      return mapNodeToItineraryItem(node, {
        start: slot?.time ?? '09:00',
        end: slot?.endTime ?? '11:00',
      });
    });

    return {
      date: dayNode?.date ?? day.date,
      items,
    };
  });

  return {
    request_id: requestId,
    days,
    metadata: {
      total_days: days.length,
      source: 'canonical_travel_graph@v0',
      graphId: graph.graphId,
      compileId: graph.compileId,
    },
  };
}
