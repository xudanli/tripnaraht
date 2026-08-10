/**
 * Enrich Iceland routeFacts.daylightDriving from SunCalc + structured plan times.
 * Never invents civil dusk/dawn; never invents night exposure without leg finish times.
 */

import type { TripPlan } from '../../../../trips/decision/plan-model';
import { parseIsoTimeToMinutes } from '../../../../trips/decision/utils/weather-slot-delay.util';
import {
  resolveDayGeoFromPlan,
  resolveDaylightFact,
} from '../../../../trips/tep/utils/daylight-fact.provider';
import type { IcelandSelfDriveRouteFacts } from './iceland-self-drive-route-facts.types';

/** Reykjavík fallback — matches is-daylight-rules + TEP defaults */
export const ICELAND_DAYLIGHT_FALLBACK_LAT = 64.13;
export const ICELAND_DAYLIGHT_FALLBACK_LNG = -21.94;
export const ICELAND_DAYLIGHT_TIMEZONE = 'Atlantic/Reykjavik';

export interface IcelandCivilTwilightMinutes {
  civilDawnLocalMin: number;
  civilDuskLocalMin: number;
  source: 'solar-algorithm' | 'sunset-fallback';
}

/**
 * SunCalc civil twilight for a date/geo. Returns undefined when polar / ambiguous.
 */
export function resolveIcelandCivilTwilightMinutes(input: {
  date: string;
  lat?: number;
  lng?: number;
  timezone?: string;
}): IcelandCivilTwilightMinutes | undefined {
  const fact = resolveDaylightFact({
    date: input.date,
    lat: input.lat ?? ICELAND_DAYLIGHT_FALLBACK_LAT,
    lng: input.lng ?? ICELAND_DAYLIGHT_FALLBACK_LNG,
    timezone: input.timezone ?? ICELAND_DAYLIGHT_TIMEZONE,
  });
  if ('degraded' in fact) return undefined;

  const dawn = parseLocalLabelToMinutes(fact.civilDawnLocal);
  const dusk = fact.civilDuskMinutes;
  if (dawn == null || !Number.isFinite(dusk)) return undefined;

  return {
    civilDawnLocalMin: dawn,
    civilDuskLocalMin: dusk,
    source: fact.source,
  };
}

function parseLocalLabelToMinutes(label?: string): number | undefined {
  if (!label || !/^\d{1,2}:\d{2}$/.test(label)) return undefined;
  const [h, m] = label.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  return h * 60 + m;
}

function pickFocusDay(plan: TripPlan | undefined, fallbackDate?: string) {
  if (plan?.days?.length) {
    const withLegs = plan.days.find((d) =>
      d.timeSlots.some((s) => s.travelLegFromPrev && s.travelLegFromPrev.durationMin > 0),
    );
    return withLegs ?? plan.days[0];
  }
  if (fallbackDate) {
    return { date: fallbackDate, day: 1, timeSlots: [] as TripPlan['days'][0]['timeSlots'] };
  }
  return undefined;
}

function resolveGeoFromPlanDay(
  plan: TripPlan | undefined,
  day: NonNullable<ReturnType<typeof pickFocusDay>>,
): { lat: number; lng: number } {
  for (const slot of day.timeSlots) {
    const leg = slot.travelLegFromPrev;
    if (leg?.from && leg?.to) {
      return resolveDayGeoFromPlan({
        origin: leg.from,
        destination: leg.to,
        fallbackLat: ICELAND_DAYLIGHT_FALLBACK_LAT,
        fallbackLng: ICELAND_DAYLIGHT_FALLBACK_LNG,
      });
    }
    if (
      typeof slot.coordinates?.lat === 'number' &&
      typeof slot.coordinates?.lng === 'number'
    ) {
      return { lat: slot.coordinates.lat, lng: slot.coordinates.lng };
    }
  }
  // Scan whole plan for any geo
  if (plan) {
    for (const d of plan.days) {
      for (const slot of d.timeSlots) {
        const leg = slot.travelLegFromPrev;
        if (leg?.from && leg?.to) {
          return resolveDayGeoFromPlan({
            origin: leg.from,
            destination: leg.to,
            fallbackLat: ICELAND_DAYLIGHT_FALLBACK_LAT,
            fallbackLng: ICELAND_DAYLIGHT_FALLBACK_LNG,
          });
        }
      }
    }
  }
  return {
    lat: ICELAND_DAYLIGHT_FALLBACK_LAT,
    lng: ICELAND_DAYLIGHT_FALLBACK_LNG,
  };
}

function sumSameDayDriveMinutes(
  day: NonNullable<ReturnType<typeof pickFocusDay>>,
): number {
  let sum = 0;
  for (const slot of day.timeSlots) {
    const dur = slot.travelLegFromPrev?.durationMin;
    if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
      sum += Math.round(dur);
    }
  }
  return sum;
}

/**
 * Max minutes past civil dusk that any drive leg finishes (TEP-aligned).
 * Requires structured slot endTime or time+duration — otherwise 0 (not invented).
 */
function maxNightExposureMinutes(
  day: NonNullable<ReturnType<typeof pickFocusDay>>,
  civilDuskLocalMin: number,
): number {
  let maxOver = 0;
  for (const slot of day.timeSlots) {
    const leg = slot.travelLegFromPrev;
    if (!leg || !(leg.durationMin > 0)) continue;

    let finish: number | undefined;
    if (slot.endTime) {
      finish = parseIsoTimeToMinutes(slot.endTime);
    } else if (slot.time && Number.isFinite(leg.durationMin)) {
      // Arrival ≈ slot.time when slot is the destination; duration is the inbound leg.
      finish = parseIsoTimeToMinutes(slot.time);
    }
    if (finish == null) continue;
    maxOver = Math.max(maxOver, finish - civilDuskLocalMin);
  }
  return Math.max(0, Math.round(maxOver));
}

/**
 * Next-day early locked/anchor slot → morning booking signal (structured only).
 */
function detectNextMorningBooking(
  plan: TripPlan | undefined,
  focusDate: string,
): boolean | undefined {
  if (!plan?.days?.length) return undefined;
  const focusIdx = plan.days.findIndex((d) => d.date === focusDate);
  if (focusIdx < 0 || focusIdx + 1 >= plan.days.length) return undefined;
  const next = plan.days[focusIdx + 1]!;
  for (const slot of next.timeSlots) {
    if (!slot.time) continue;
    const mins = parseIsoTimeToMinutes(slot.time);
    if (mins > 10 * 60) continue;
    if (slot.locked === true || slot.priorityTag === 'anchor') {
      return true;
    }
  }
  return undefined;
}

/**
 * Merge SunCalc + plan-derived daylight into route facts.
 * Explicit upstream daylightDriving fields win field-by-field.
 */
export function enrichRouteFactsWithDaylightDriving(opts: {
  facts: IcelandSelfDriveRouteFacts;
  plan?: TripPlan;
  fallbackDate?: string;
  lat?: number;
  lng?: number;
}): IcelandSelfDriveRouteFacts {
  const existing = opts.facts.daylightDriving ?? {};
  const day = pickFocusDay(opts.plan, opts.fallbackDate);
  if (!day?.date) {
    return opts.facts;
  }

  const geo =
    opts.lat != null && opts.lng != null
      ? { lat: opts.lat, lng: opts.lng }
      : resolveGeoFromPlanDay(opts.plan, day);

  const twilight = resolveIcelandCivilTwilightMinutes({
    date: day.date,
    lat: geo.lat,
    lng: geo.lng,
  });

  const sameDayComputed = sumSameDayDriveMinutes(day);
  const nightComputed =
    twilight != null
      ? maxNightExposureMinutes(day, twilight.civilDuskLocalMin)
      : undefined;
  const nextMorningComputed = detectNextMorningBooking(opts.plan, day.date);

  const daylightDriving: NonNullable<IcelandSelfDriveRouteFacts['daylightDriving']> =
    {
      ...existing,
    };

  if (
    typeof existing.civilDawnLocalMin !== 'number' &&
    twilight?.civilDawnLocalMin != null
  ) {
    daylightDriving.civilDawnLocalMin = twilight.civilDawnLocalMin;
  }
  if (
    typeof existing.civilDuskLocalMin !== 'number' &&
    twilight?.civilDuskLocalMin != null
  ) {
    daylightDriving.civilDuskLocalMin = twilight.civilDuskLocalMin;
  }
  if (
    typeof existing.sameDayDriveMinutes !== 'number' &&
    sameDayComputed > 0
  ) {
    daylightDriving.sameDayDriveMinutes = sameDayComputed;
  }
  if (
    typeof existing.nightExposureMinutes !== 'number' &&
    nightComputed != null
  ) {
    daylightDriving.nightExposureMinutes = nightComputed;
  }
  if (
    existing.nextMorningBooking == null &&
    nextMorningComputed === true
  ) {
    daylightDriving.nextMorningBooking = true;
  }

  const hasAny =
    typeof daylightDriving.nightExposureMinutes === 'number' ||
    typeof daylightDriving.sameDayDriveMinutes === 'number' ||
    daylightDriving.nextMorningBooking === true ||
    (typeof daylightDriving.civilDawnLocalMin === 'number' &&
      typeof daylightDriving.civilDuskLocalMin === 'number');

  if (!hasAny) return opts.facts;

  const isNight =
    opts.facts.isNight === true ||
    (typeof daylightDriving.nightExposureMinutes === 'number' &&
      daylightDriving.nightExposureMinutes > 0);

  return {
    ...opts.facts,
    isNight: isNight || undefined,
    daylightDriving,
  };
}
