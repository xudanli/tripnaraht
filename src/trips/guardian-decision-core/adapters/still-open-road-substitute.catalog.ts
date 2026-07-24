/**
 * P2 — still-open POI fallbacks when road repair candidates miss lastEntryAt.
 * Deterministic catalog (no live Places API in this slice).
 */

import type { RoadCandidateOpeningWindow } from '../assessment/road-candidate-opening-window.assessor';

export interface StillOpenRoadFallback {
  poiId: string;
  title: string;
  intentRefs: string[];
  regionCodes: string[];
  experienceCategories: string[];
  window: RoadCandidateOpeningWindow;
  estimatedIntentPreservation: number;
  /** Typical extra drive vs original; prefer low so ETA stays feasible */
  estimatedAddedDurationMinutes: number;
  requiresOpenRoadIds?: string[];
}

/** Iceland — longer-hour / indoor-leaning substitutes for south/highland road closes */
export const IS_STILL_OPEN_ROAD_FALLBACKS: StillOpenRoadFallback[] = [
  {
    poiId: 'is.perlan',
    title: '珍珠楼室内观景',
    intentRefs: ['intent_glacier', 'intent_photography', 'intent_indoor_alternative'],
    regionCodes: ['IS_SOUTH', 'IS_CENTRAL_HIGHLANDS'],
    experienceCategories: ['GLACIER', 'COAST'],
    window: {
      lastEntryAt: '21:00',
      closesAt: '22:00',
      timezone: 'Atlantic/Reykjavik',
    },
    estimatedIntentPreservation: 0.52,
    estimatedAddedDurationMinutes: 20,
  },
  {
    poiId: 'is.harpa',
    title: '哈帕音乐厅 / 滨海漫步',
    intentRefs: ['intent_coast', 'intent_photography', 'intent_indoor_alternative'],
    regionCodes: ['IS_SOUTH', 'IS_CENTRAL_HIGHLANDS', 'IS_NORTH'],
    experienceCategories: ['COAST', 'WATERFALL'],
    window: {
      lastEntryAt: '20:00',
      closesAt: '22:00',
      timezone: 'Atlantic/Reykjavik',
    },
    estimatedIntentPreservation: 0.48,
    estimatedAddedDurationMinutes: 15,
  },
  {
    poiId: 'is.national_museum',
    title: '国家博物馆（室内）',
    intentRefs: [
      'intent_glacier',
      'intent_wilderness',
      'intent_highland',
      'intent_indoor_alternative',
    ],
    regionCodes: ['IS_SOUTH', 'IS_CENTRAL_HIGHLANDS', 'IS_NORTH'],
    experienceCategories: ['GLACIER', 'HIGHLAND', 'WATERFALL'],
    window: {
      lastEntryAt: '16:30',
      closesAt: '17:00',
      timezone: 'Atlantic/Reykjavik',
    },
    estimatedIntentPreservation: 0.45,
    estimatedAddedDurationMinutes: 10,
  },
  {
    poiId: 'is.whales_of_iceland',
    title: '鲸展博物馆（室内）',
    intentRefs: ['intent_coast', 'intent_photography', 'intent_indoor_alternative'],
    regionCodes: ['IS_SOUTH', 'IS_NORTH'],
    experienceCategories: ['COAST'],
    window: {
      lastEntryAt: '18:00',
      closesAt: '19:00',
      timezone: 'Atlantic/Reykjavik',
    },
    estimatedIntentPreservation: 0.5,
    estimatedAddedDurationMinutes: 15,
  },
];

export function loadStillOpenRoadFallbacks(input?: {
  countryCode?: string | null;
  tripMetadata?: unknown;
}): StillOpenRoadFallback[] {
  const fromTrip = readTripStillOpenFallbacks(input?.tripMetadata);
  const country = (input?.countryCode ?? '').toUpperCase();
  const pack =
    country === 'IS' || country === 'ICELAND' ? IS_STILL_OPEN_ROAD_FALLBACKS : [];
  return [...fromTrip, ...pack];
}

function readTripStillOpenFallbacks(tripMetadata: unknown): StillOpenRoadFallback[] {
  const meta = (tripMetadata ?? {}) as Record<string, unknown>;
  const raw = meta.rfc001StillOpenRoadFallbacks;
  if (!Array.isArray(raw)) return [];
  const out: StillOpenRoadFallback[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const poiId = typeof r.poiId === 'string' ? r.poiId : null;
    const lastEntryAt =
      typeof (r.window as { lastEntryAt?: string } | undefined)?.lastEntryAt ===
      'string'
        ? (r.window as { lastEntryAt: string }).lastEntryAt
        : typeof r.lastEntryAt === 'string'
          ? r.lastEntryAt
          : null;
    if (!poiId || !lastEntryAt) continue;
    const win = (r.window ?? {}) as Record<string, unknown>;
    out.push({
      poiId,
      title: typeof r.title === 'string' ? r.title : poiId,
      intentRefs: Array.isArray(r.intentRefs)
        ? r.intentRefs.map(String)
        : ['intent_indoor_alternative'],
      regionCodes: Array.isArray(r.regionCodes) ? r.regionCodes.map(String) : ['IS_SOUTH'],
      experienceCategories: Array.isArray(r.experienceCategories)
        ? r.experienceCategories.map(String)
        : [],
      window: {
        lastEntryAt,
        closesAt:
          typeof win.closesAt === 'string'
            ? win.closesAt
            : typeof r.closesAt === 'string'
              ? r.closesAt
              : undefined,
        timezone:
          typeof win.timezone === 'string'
            ? win.timezone
            : typeof r.timezone === 'string'
              ? r.timezone
              : 'UTC',
      },
      estimatedIntentPreservation:
        typeof r.estimatedIntentPreservation === 'number'
          ? r.estimatedIntentPreservation
          : 0.5,
      estimatedAddedDurationMinutes:
        typeof r.estimatedAddedDurationMinutes === 'number'
          ? r.estimatedAddedDurationMinutes
          : 15,
      requiresOpenRoadIds: Array.isArray(r.requiresOpenRoadIds)
        ? r.requiresOpenRoadIds.map(String)
        : undefined,
    });
  }
  return out;
}
