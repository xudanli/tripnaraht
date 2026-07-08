import type { TripPlan, PlanDay, PlanSlot } from '../../trips/decision/plan-model';
import type { ActivityType } from '../../trips/decision/world-model';
import type {
  CanonicalTravelGraph,
  TravelGraphActivityNode,
  TravelGraphBookingNode,
  TravelGraphNode,
  TravelGraphPoiNode,
  TravelGraphRouteSegmentNode,
  TravelGraphStayNode,
} from '../contracts/canonical-travel-graph.types';
import { orderedSchedulableNodesForDay } from './ordered-schedulable-nodes.util';

function mapActivityType(raw?: string): ActivityType {
  switch (raw) {
    case 'spa':
    case 'wellness':
      return 'rest';
    case 'hiking':
    case 'ice_hiking':
      return 'nature';
    case 'food':
      return 'food';
    case 'tour':
      return 'tour';
    case 'stay':
      return 'hotel';
    default:
      return 'sightseeing';
  }
}

function mapNodeToPlanSlot(node: TravelGraphNode, index: number): PlanSlot {
  switch (node.kind) {
    case 'POI': {
      const poi = node as TravelGraphPoiNode;
      return {
        id: poi.nodeId,
        time: defaultStartTime(index),
        endTime: defaultEndTime(index),
        title: poi.label,
        type: mapActivityType(poi.canonical?.activityType),
        poiId: poi.canonical?.poiId ?? poi.poiId,
        semanticTags: poi.intentTags,
        priorityTag: index === 0 ? 'anchor' : 'core',
      };
    }
    case 'ROUTE_SEGMENT': {
      const seg = node as TravelGraphRouteSegmentNode;
      return {
        id: seg.nodeId,
        time: defaultStartTime(index),
        endTime: defaultEndTime(index),
        title: seg.label,
        type: 'transport',
        notes: seg.segmentId,
        semanticTags: ['transit', seg.transportMode ?? 'drive'].filter(Boolean) as string[],
        priorityTag: 'core',
      };
    }
    case 'STAY': {
      const stay = node as TravelGraphStayNode;
      return {
        id: stay.nodeId,
        time: stay.checkInHint ?? defaultStartTime(index),
        endTime: stay.checkOutHint ?? defaultEndTime(index),
        title: stay.label,
        type: 'hotel',
        priorityTag: 'anchor',
        semanticTags: stay.intentTags ?? ['stay'],
      };
    }
    case 'BOOKING': {
      const booking = node as TravelGraphBookingNode;
      return {
        id: booking.nodeId,
        time: defaultStartTime(index),
        endTime: defaultEndTime(index),
        title: booking.label,
        type: booking.bookingKind === 'hotel' ? 'hotel' : 'tour',
        notes: booking.status,
        locked: booking.status === 'booked',
        priorityTag: 'core',
        semanticTags: ['booking', booking.bookingKind ?? 'other'].filter(Boolean) as string[],
      };
    }
    case 'ACTIVITY': {
      const activity = node as TravelGraphActivityNode;
      return {
        id: activity.nodeId,
        time: defaultStartTime(index),
        endTime: defaultEndTime(index),
        title: activity.label,
        type: mapActivityType(activity.activityType ?? activity.canonical?.activityType),
        semanticTags: activity.intentTags,
        priorityTag: 'core',
      };
    }
    default:
      return {
        id: node.nodeId,
        time: defaultStartTime(index),
        endTime: defaultEndTime(index),
        title: node.label,
        type: 'other',
        priorityTag: 'optional',
      };
  }
}

export function graphToTripPlan(graph: CanonicalTravelGraph): TripPlan {
  const days: PlanDay[] = graph.days.map((dayNode) => {
    const scheduleNodes = orderedSchedulableNodesForDay(graph, dayNode.dayIndex);
    const timeSlots: PlanSlot[] = scheduleNodes.map((node, idx) => mapNodeToPlanSlot(node, idx));

    return {
      day: dayNode.dayIndex + 1,
      date: dayNode.date ?? `1970-01-${String(dayNode.dayIndex + 1).padStart(2, '0')}`,
      timeSlots,
    };
  });

  return {
    version: 'canonical-travel-graph@v0',
    createdAt: graph.createdAt,
    tripId: graph.tripId,
    days,
  };
}

function defaultStartTime(index: number): string {
  const slots = ['09:00', '11:30', '14:00', '16:30', '18:00'];
  return slots[index % slots.length] ?? '09:00';
}

function defaultEndTime(index: number): string {
  const slots = ['11:00', '13:30', '16:00', '18:30', '20:00'];
  return slots[index % slots.length] ?? '11:00';
}
