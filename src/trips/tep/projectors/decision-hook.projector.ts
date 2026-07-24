/**
 * WP-TEP-11 — DailyDrivePlan → DecisionHook[] 规划期投影
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md 附录 C
 */

import type {
  DailyDrivePlan,
  DecisionHook,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';

export interface DecisionHookProjectorInput {
  tripId: string;
  countryCode?: string;
  dailyDrivePlans: DailyDrivePlan[];
  profile?: SelfDriveProfile;
}

const IS_HIGH_WIND_KMH = 90;

function dayRefs(day: DailyDrivePlan): string[] {
  const refs = new Set<string>([
    day.origin.ref,
    day.destination.ref,
    `day_${day.dayIndex}`,
  ]);
  for (const leg of day.legs) {
    refs.add(leg.legId);
    refs.add(leg.fromRef);
    refs.add(leg.toRef);
    for (const roadRef of leg.roadRefs) refs.add(roadRef);
  }
  for (const activity of day.activities) refs.add(activity.ref);
  if (day.accommodation) refs.add(day.accommodation.ref);
  return [...refs];
}

function projectRoadHooks(day: DailyDrivePlan): DecisionHook[] {
  const hooks: DecisionHook[] = [];
  let seq = 0;

  for (const leg of day.legs) {
    if (leg.roadRefs.length === 0) continue;
    seq += 1;
    hooks.push({
      hookId: `HOOK-ROAD-D${day.dayIndex}-${seq}`,
      targetRef: leg.legId,
      triggerType: 'ROAD_STATUS_CHANGE',
      sourceMetric: 'road.status',
      triggerCondition: {
        metric: 'road.status',
        operator: 'IN',
        value: ['CLOSED', 'LIMITED', 'RESTRICTED'],
      },
      leadTime: 'PT24H',
      impactScope: dayRefs(day),
      defaultPolicy: 'BLOCK_UNTIL_RESOLVED',
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
      evidencePolicy: 'REFRESH_ON_STALE',
    });
  }

  return hooks;
}

function projectWeatherActivityHooks(day: DailyDrivePlan): DecisionHook[] {
  const hooks: DecisionHook[] = [];
  let seq = 0;

  for (const activity of day.activities) {
    if (!activity.weatherSensitive) continue;
    seq += 1;
    hooks.push({
      hookId: `HOOK-WEATHER-D${day.dayIndex}-${seq}`,
      targetRef: activity.ref,
      triggerType: 'WEATHER_THRESHOLD',
      sourceMetric: 'weather.windSpeedKmh',
      triggerCondition: {
        metric: 'weather.windSpeedKmh',
        operator: '>=',
        value: IS_HIGH_WIND_KMH,
        unit: 'km/h',
      },
      leadTime: 'PT24H',
      impactScope: dayRefs(day),
      defaultPolicy: 'REQUIRE_USER_CONFIRMATION',
      semanticKey: 'WEATHER_ACTIVITY_PROHIBITED',
      evidencePolicy: 'REQUIRE_OFFICIAL',
    });
  }

  return hooks;
}

function projectAccommodationHooks(day: DailyDrivePlan): DecisionHook[] {
  const accommodation = day.accommodation;
  if (!accommodation?.latestArrival) return [];

  return [
    {
      hookId: `HOOK-LODGE-D${day.dayIndex}-1`,
      targetRef: accommodation.ref,
      triggerType: 'EXECUTION_SLIP',
      sourceMetric: 'projectedArrivalVsLatestArrival',
      triggerCondition: {
        metric: 'projectedArrivalVsLatestArrival',
        operator: '>',
        value: 0,
        unit: 'minutes',
      },
      leadTime: 'PT12H',
      impactScope: dayRefs(day),
      defaultPolicy: 'REQUIRE_USER_CONFIRMATION',
      semanticKey: 'TIME_WINDOW_INFEASIBLE',
      evidencePolicy: 'ALLOW_DEGRADED',
    },
  ];
}

function projectDaylightHooks(day: DailyDrivePlan, profile?: SelfDriveProfile): DecisionHook[] {
  const hooks: DecisionHook[] = [];
  if (day.legs.length === 0) return hooks;

  const lastLeg = day.legs[day.legs.length - 1]!;
  hooks.push({
    hookId: `HOOK-DAYLIGHT-D${day.dayIndex}-1`,
    targetRef: lastLeg.legId,
    triggerType: 'WEATHER_THRESHOLD',
    sourceMetric: 'daylight.driveMinutesAfterCivilDusk',
    triggerCondition: {
      metric: 'daylight.driveMinutesAfterCivilDusk',
      operator: '>',
      value: 0,
      unit: 'minutes',
    },
    leadTime: 'PT6H',
    impactScope: dayRefs(day),
    defaultPolicy: profile?.drivingPolicy.nightDrivingAllowed
      ? 'REQUIRE_USER_CONFIRMATION'
      : 'AUTO_SUGGEST_REPAIR',
    semanticKey: 'WEATHER_ROUTE_RISK',
    evidencePolicy: 'ALLOW_DEGRADED',
  });

  let seq = 0;
  for (const activity of day.activities) {
    if (!activity.weatherSensitive) continue;
    seq += 1;
    hooks.push({
      hookId: `HOOK-DAYLIGHT-ACT-D${day.dayIndex}-${seq}`,
      targetRef: activity.ref,
      triggerType: 'WEATHER_THRESHOLD',
      sourceMetric: 'daylight.activityMinutesAfterSunset',
      triggerCondition: {
        metric: 'daylight.activityMinutesAfterSunset',
        operator: '>',
        value: 0,
        unit: 'minutes',
      },
      leadTime: 'PT6H',
      impactScope: dayRefs(day),
      defaultPolicy: 'AUTO_SUGGEST_REPAIR',
      semanticKey: 'WEATHER_ROUTE_RISK',
      evidencePolicy: 'ALLOW_DEGRADED',
    });
  }

  return hooks;
}

function projectReservationHooks(day: DailyDrivePlan): DecisionHook[] {
  const hooks: DecisionHook[] = [];
  let seq = 0;

  for (const activity of day.activities) {
    if (!activity.reservationRequired && !activity.fixedStartAt) continue;
    seq += 1;
    hooks.push({
      hookId: `HOOK-RESERVE-D${day.dayIndex}-${seq}`,
      targetRef: activity.ref,
      triggerType: 'RESERVATION_DEADLINE',
      sourceMetric: 'projectedArrivalVsFixedStart',
      triggerCondition: {
        metric: 'projectedArrivalVsFixedStart',
        operator: '>',
        value: 0,
        unit: 'minutes',
      },
      leadTime: 'PT3H',
      impactScope: dayRefs(day),
      defaultPolicy: 'REQUIRE_USER_CONFIRMATION',
      semanticKey: 'TIME_WINDOW_INFEASIBLE',
      evidencePolicy: 'REFRESH_ON_STALE',
    });
  }

  return hooks;
}

/** 从 DailyDrivePlan 投影规划期 DecisionHook（道路/天气/住宿/预约/日照） */
export function projectDecisionHooks(input: DecisionHookProjectorInput): DecisionHook[] {
  const hooks: DecisionHook[] = [];

  for (const day of input.dailyDrivePlans) {
    hooks.push(
      ...projectRoadHooks(day),
      ...projectWeatherActivityHooks(day),
      ...projectAccommodationHooks(day),
      ...projectDaylightHooks(day, input.profile),
      ...projectReservationHooks(day),
    );
  }

  return hooks;
}

/** 按 targetRef 查询 Hook */
export function findHooksByTargetRef(
  hooks: DecisionHook[],
  targetRef: string,
): DecisionHook[] {
  return hooks.filter(
    (h) => h.targetRef === targetRef || h.impactScope.includes(targetRef),
  );
}
