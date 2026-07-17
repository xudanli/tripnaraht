/**
 * Iceland Day-1 arrival fixture for contextual same-day micro-planning tests / manual QA.
 */

import type {
  CanonicalSameDayContext,
  ContextualRecommendationsContextDelta,
} from '../types/contextual-recommendations.types';

export const ICELAND_ARRIVAL_DAY_TRIP_ID = 'trip_is_arrival_day_fixture';

/** Backend-authoritative slice the Context Builder would produce for Day 1. */
export const icelandArrivalDayCanonical: CanonicalSameDayContext = {
  tripId: ICELAND_ARRIVAL_DAY_TRIP_ID,
  destination: 'IS',
  countryCode: 'IS',
  focusDayIndex: 1,
  tripPhase: 'ARRIVAL_DAY',
  hotel: {
    name: 'Reykjavik Centrum Hotel',
    cityName: '雷克雅未克',
    lat: 64.1466,
    lng: -21.9426,
    confirmed: true,
    placeId: 9001,
    anchorSource: 'FOCUS_DAY',
    anchorDayIndex: 1,
  },
  tomorrow: {
    dayIndex: 2,
    firstActivityStart: '08:30',
    theme: '黄金圈',
    earlyDeparture: true,
  },
  team: {
    memberCount: 4,
    childrenPresent: true,
    elderlyPresent: false,
    physicalConstraints: ['一名成员体能较弱'],
  },
  weatherHint: '小雨、风较大',
  sources: {
    fromDelta: [],
    fromBackend: [
      'trip.destination',
      'day1.accommodation',
      'day2.firstActivity',
      'trip.metadata.team',
      'worldState.weather.hazard',
    ],
  },
};

/** Frontend Context Delta for KEF landing, low energy family. */
export const icelandArrivalDayContextDelta: ContextualRecommendationsContextDelta = {
  currentLocation: {
    lat: 63.985,
    lng: -22.605,
    label: 'Keflavik Airport',
  },
  currentTime: '2026-07-16T16:20:00+00:00',
  availableUntil: '21:00',
  desiredReturnTime: '21:00',
  tripPhase: 'ARRIVAL_DAY',
  desiredIntensity: 'LIGHT',
  teamState: {
    energy: 'LOW',
    temporaryConstraints: ['刚完成长途飞行', 'MOTION_SICKNESS'],
  },
  preference: ['吃饭', '简单逛逛', '早点回酒店'],
};

export const icelandArrivalDayRecommendBody = {
  scenario: 'SAME_DAY_ACTIVITY' as const,
  intent: '我们刚落地，一家人都比较累，今晚适合做什么？想吃个饭，九点前回酒店',
  dayIndex: 1,
  contextDelta: icelandArrivalDayContextDelta,
};

/** curl-friendly Mobile paths for manual QA */
export const icelandArrivalDayManualQa = {
  recommendPath: `/api/mobile/trips/${ICELAND_ARRIVAL_DAY_TRIP_ID}/planning/contextual-recommendations`,
  commitPath: `/api/mobile/trips/${ICELAND_ARRIVAL_DAY_TRIP_ID}/planning/contextual-recommendations/commit`,
  legacyExplorePath: `/api/mobile/trips/${ICELAND_ARRIVAL_DAY_TRIP_ID}/planning/activities/recommendations`,
  todayActivitiesAlias: `/api/mobile/trips/${ICELAND_ARRIVAL_DAY_TRIP_ID}/planning/today-activities`,
  notes: [
    'Replace trip id with a real IS trip that has Day1 Reykjavik hotel + Day2 early start.',
    'Prefer POST contextual-recommendations; GET today-activities is a thin bootstrap alias.',
    'GET activities/recommendations?mode=same_day also routes to contextual (migration).',
  ],
};
