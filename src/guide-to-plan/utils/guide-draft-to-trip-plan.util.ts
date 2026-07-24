/**
 * Guide itinerary draft → TripPlan for Constraint Evaluation Gateway.
 */

import type { TripPlan, PlanSlot } from '../../trips/decision/plan-model';
import type { GuideItineraryDraft } from '../services/guide-plan-builder.service';

export function guideDraftToTripPlan(input: {
  draft: GuideItineraryDraft;
  tripId?: string;
  travelModeDefault?: 'drive' | 'walk';
}): TripPlan {
  const driveDefault = input.travelModeDefault === 'drive';

  return {
    version: 'guide-draft@v1',
    createdAt: new Date().toISOString(),
    tripId: input.tripId,
    days: input.draft.days.map((day) => ({
      day: day.day,
      date: day.date ?? `1970-01-${String(day.day).padStart(2, '0')}`,
      timeSlots: day.items.map((item, idx): PlanSlot => {
        const slot: PlanSlot = {
          id: item.candidateId ?? `guide_${day.day}_${idx}`,
          time: item.startTime?.slice(0, 5) ?? '09:00',
          endTime: item.endTime?.slice(0, 5),
          title: item.name,
          type: mapGuideItemType(item.type),
          poiId: item.placeId != null ? String(item.placeId) : undefined,
          semanticTags: item.source === 'guide' ? ['guide_faithful'] : ['guide_adjusted'],
        };
        const needsDriveLeg =
          driveDefault &&
          (idx > 0 || (item.travelMinutesFromPrev ?? 0) > 0 || (day.drivingMinutesEstimate ?? 0) > 0);
        if (needsDriveLeg) {
          slot.travelLegFromPrev = {
            mode: 'drive',
            from: { lat: 0, lng: 0 },
            to: { lat: 0, lng: 0 },
            durationMin: item.travelMinutesFromPrev ?? day.drivingMinutesEstimate ?? 15,
          };
        } else if (idx > 0) {
          slot.travelLegFromPrev = {
            mode: 'walk',
            from: { lat: 0, lng: 0 },
            to: { lat: 0, lng: 0 },
            durationMin: item.travelMinutesFromPrev ?? 15,
          };
        }
        return slot;
      }),
    })),
    metrics: dayDrivingMetrics(input.draft),
  };
}

function mapGuideItemType(type: string): PlanSlot['type'] {
  switch (type) {
    case 'restaurant':
      return 'food';
    case 'hotel':
      return 'hotel';
    case 'activity':
      return 'tour';
    default:
      return 'sightseeing';
  }
}

function dayDrivingMetrics(draft: GuideItineraryDraft): TripPlan['metrics'] {
  const driveMinutes = draft.days.reduce(
    (sum, d) => sum + (d.drivingMinutesEstimate ?? 0),
    0,
  );
  if (driveMinutes <= 0) return undefined;
  return {
    estTravelMinutes: driveMinutes,
    estActiveMinutes: draft.days.reduce((sum, d) => sum + d.activityCount * 90, 0),
  };
}
