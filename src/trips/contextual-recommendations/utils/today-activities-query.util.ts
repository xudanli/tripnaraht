import type { ContextualRecommendationsRequestDto } from '../dto/contextual-recommendations.dto';

export type TodayActivitiesQuery = {
  mode?: string;
  sameDay?: string;
  dayIndex?: number;
  intent?: string;
  energy?: string;
  intensity?: string;
  returnBy?: string;
  availableUntil?: string;
  tripPhase?: string;
  lat?: number;
  lng?: number;
  locationLabel?: string;
};

/** True when legacy activities/recommendations should route to contextual micro-planning. */
export function isSameDayActivitiesMode(query: {
  mode?: string;
  sameDay?: string;
}): boolean {
  const mode = (query.mode ?? '').trim().toUpperCase();
  if (mode === 'SAME_DAY' || mode === 'SAME_DAY_ACTIVITY' || mode === 'TODAY') {
    return true;
  }
  const flag = (query.sameDay ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function mapTodayActivitiesQueryToRecommendBody(
  query: TodayActivitiesQuery,
): ContextualRecommendationsRequestDto {
  const energy =
    query.energy === 'LOW' || query.energy === 'MEDIUM' || query.energy === 'HIGH'
      ? query.energy
      : undefined;
  const desiredIntensity =
    query.intensity === 'LIGHT' ||
    query.intensity === 'MODERATE' ||
    query.intensity === 'FULL'
      ? query.intensity
      : undefined;
  const tripPhase =
    query.tripPhase === 'ARRIVAL_DAY' ||
    query.tripPhase === 'IN_TRIP' ||
    query.tripPhase === 'DEPARTURE_DAY' ||
    query.tripPhase === 'UNKNOWN'
      ? query.tripPhase
      : undefined;

  const hasCoords =
    typeof query.lat === 'number' &&
    typeof query.lng === 'number' &&
    Number.isFinite(query.lat) &&
    Number.isFinite(query.lng);

  return {
    scenario: 'SAME_DAY_ACTIVITY',
    ...(query.intent?.trim() ? { intent: query.intent.trim() } : {}),
    ...(query.dayIndex != null ? { dayIndex: query.dayIndex } : {}),
    contextDelta: {
      currentTime: new Date().toISOString(),
      ...(query.returnBy ? { desiredReturnTime: query.returnBy, availableUntil: query.returnBy } : {}),
      ...(query.availableUntil && !query.returnBy
        ? { availableUntil: query.availableUntil }
        : {}),
      ...(tripPhase ? { tripPhase } : {}),
      ...(desiredIntensity ? { desiredIntensity } : {}),
      ...(energy ? { teamState: { energy } } : {}),
      ...(hasCoords
        ? {
            currentLocation: {
              lat: query.lat!,
              lng: query.lng!,
              ...(query.locationLabel ? { label: query.locationLabel } : {}),
            },
          }
        : query.locationLabel
          ? { currentLocation: query.locationLabel }
          : {}),
    },
  };
}
