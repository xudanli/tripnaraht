/**
 * WP-TEP-15 — aggregate daylight violation minutes for TEP runtime hooks
 */

import type {
  DailyDrivePlan,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';
import type { ActivityArrivalProjection } from '../validation/tep-validation.types';
import { loadDaylightRules } from '../loaders/daylight-rules.loader';
import {
  projectAllDayScheduleTimelines,
  type DayScheduleTimeline,
} from './day-schedule-timeline.util';
import {
  resolveDayGeoFromPlan,
  resolveDaylightFact,
} from './daylight-fact.provider';

export interface DaylightViolationMinutes {
  driveMinutesAfterCivilDusk: number;
  activityMinutesAfterSunset: number;
}

function maxDriveAfterDusk(
  timeline: DayScheduleTimeline,
  cutoffMinutes: number,
): number {
  let maxOver = 0;
  for (const legFinish of timeline.legFinishes) {
    maxOver = Math.max(maxOver, legFinish.finishMinutesLocal - cutoffMinutes);
  }
  return Math.max(0, maxOver);
}

function maxActivityAfterSunset(input: {
  day: DailyDrivePlan;
  timeline: DayScheduleTimeline;
  sunsetMinutes: number;
}): number {
  let maxOver = 0;
  for (const activity of input.day.activities) {
    if (!activity.weatherSensitive) continue;
    const window = input.timeline.activities.find((a) => a.ref === activity.ref);
    if (!window) continue;
    maxOver = Math.max(maxOver, window.endMinutesLocal - input.sunsetMinutes);
  }
  return Math.max(0, maxOver);
}

export function computeDaylightViolationMinutes(input: {
  countryCode: string;
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
  activityArrivals?: ActivityArrivalProjection[];
  latitude?: number;
  longitude?: number;
}): DaylightViolationMinutes {
  const rules = loadDaylightRules(input.countryCode);
  const fallbackLat = input.latitude ?? rules?.computation.defaultLatitude ?? 64.13;
  const fallbackLng = input.longitude ?? rules?.computation.defaultLongitude ?? -21.94;
  const timezone = rules?.computation.fallbackTimezone ?? 'Atlantic/Reykjavik';

  let driveMinutesAfterCivilDusk = 0;
  let activityMinutesAfterSunset = 0;

  const timelines = projectAllDayScheduleTimelines(
    input.dailyDrivePlans,
    input.activityArrivals,
  );

  for (const timeline of timelines) {
    const day = input.dailyDrivePlans.find((d) => d.dayIndex === timeline.dayIndex);
    if (!day) continue;

    const geo = resolveDayGeoFromPlan({
      origin: day.origin,
      destination: day.destination,
      fallbackLat,
      fallbackLng,
    });

    const factOrFailure = resolveDaylightFact({
      date: timeline.date,
      lat: geo.lat,
      lng: geo.lng,
      timezone,
      maxMinutesAfterSunset: input.profile.drivingPolicy.maxMinutesAfterSunset,
    });
    if ('degraded' in factOrFailure) continue;

    const drivingCutoff = !input.profile.drivingPolicy.nightDrivingAllowed
      ? (factOrFailure.drivingCutoffMinutes ?? factOrFailure.civilDuskMinutes)
      : factOrFailure.civilDuskMinutes;

    driveMinutesAfterCivilDusk = Math.max(
      driveMinutesAfterCivilDusk,
      maxDriveAfterDusk(timeline, drivingCutoff),
    );

    activityMinutesAfterSunset = Math.max(
      activityMinutesAfterSunset,
      maxActivityAfterSunset({
        day,
        timeline,
        sunsetMinutes: factOrFailure.sunsetMinutes,
      }),
    );
  }

  return { driveMinutesAfterCivilDusk, activityMinutesAfterSunset };
}

function localMinutesToIso(dayDate: string, minutesLocal: number): string {
  const day = new Date(`${dayDate}T00:00:00.000Z`);
  return new Date(day.getTime() + minutesLocal * 60_000).toISOString();
}

/** Shift schedule arrivals from execution slip (late departure → later leg/activity ETA) */
export function buildExecutionSlipDaylightArrivals(input: {
  dailyDrivePlans: DailyDrivePlan[];
  dayIndex: number;
  slipMinutes: number;
  nextActivityId: string;
  projectedEta: string;
}): ActivityArrivalProjection[] {
  const arrivals: ActivityArrivalProjection[] = [
    {
      activityRef: input.nextActivityId.startsWith('activity_')
        ? input.nextActivityId
        : `activity_${input.nextActivityId}`,
      projectedArrivalAt: input.projectedEta,
    },
  ];

  const day = input.dailyDrivePlans.find((d) => d.dayIndex === input.dayIndex);
  const lastLeg = day?.legs[day.legs.length - 1];
  if (!day || !lastLeg || input.slipMinutes <= 0) {
    return arrivals;
  }

  const timelines = projectAllDayScheduleTimelines([day]);
  const finishMinutes = timelines[0]!.lastLegFinishMinutesLocal + input.slipMinutes;
  const legDestRef = lastLeg.toRef.startsWith('activity_')
    ? lastLeg.toRef
    : `activity_${lastLeg.toRef}`;

  arrivals.push({
    activityRef: legDestRef,
    projectedArrivalAt: localMinutesToIso(day.date, finishMinutes),
  });

  return arrivals;
}
