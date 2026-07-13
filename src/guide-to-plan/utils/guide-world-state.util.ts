import { DateTime } from 'luxon';
import type { ISODate } from '../../trips/decision/world-model';
import type { TripWorldState } from '../../trips/decision/world-model';
import type { GuideItineraryDraft } from '../services/guide-plan-builder.service';
import type { GuideTravelContext } from '../types/guide-to-plan.types';

export function buildGuideTripWorldState(input: {
  countryCode: string;
  travelContext?: GuideTravelContext | null;
  draft: GuideItineraryDraft;
  placeCoords?: Map<number, { lat: number; lng: number }>;
  sessionId?: string;
}): TripWorldState {
  const coords = input.placeCoords ?? new Map();
  const travelContext = input.travelContext;
  const draft = input.draft;

  const startDate =
    travelContext?.startDate ??
    draft.days[0]?.date ??
    DateTime.utc().plus({ days: 30 }).toISODate()!;
  const durationDays = draft.totalDays || draft.days.length || 3;

  const candidatesByDate: TripWorldState['candidatesByDate'] = {};
  for (const day of draft.days) {
    const date = (day.date ?? DateTime.fromISO(startDate).plus({ days: day.day - 1 }).toISODate()) as ISODate;
    candidatesByDate[date] = day.items.map((item, idx) => {
      const point = item.placeId != null ? coords.get(item.placeId) : undefined;
      return {
        id: item.candidateId ?? `guide-item-${day.day}-${idx}`,
        name: { zh: item.name, en: item.name },
        type: mapActivityType(item.type),
        durationMin: item.visitDurationMinutes ?? 120,
        location: point ? { point } : undefined,
        intentTags: item.source === 'guide' ? ['guide_faithful'] : ['guide_adjusted'],
        qualityScore: item.source === 'guide' ? 0.7 : 0.5,
      };
    });
  }

  return {
    context: {
      tripId: input.sessionId,
      destination: input.countryCode,
      startDate,
      durationDays,
      travelModeDefault: 'drive',
      preferences: {
        intents: { guide_to_plan: 1 },
        pace: travelContext?.travelers?.seniors ? 'relaxed' : 'moderate',
        riskTolerance: 'medium',
      },
    },
    candidatesByDate,
    signals: {
      lastUpdatedAt: new Date().toISOString(),
      alerts: [
        {
          code: 'guide_to_plan',
          severity: 'info',
          message: 'Guide-to-Plan canonical evaluation',
        },
      ],
    },
    physical: {
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
    },
  } as unknown as TripWorldState;
}

function mapActivityType(type: string): import('../../trips/decision/world-model').ActivityType {
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
