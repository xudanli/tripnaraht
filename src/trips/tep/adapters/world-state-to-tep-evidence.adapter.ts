/**
 * WP-TEP-10 — WorldState assertions → TEP Validator evidence (pure adapter).
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md §11.4 Slice 1
 */

import type { StoredRfc001WorldState } from '../../guardian-decision-core/evidence/world-state-store.service';
import type { WorldStateAssertion } from '../../guardian-decision-core/contracts/world-state.types';
import type { RoadStatusAssertionPayload } from '../../guardian-decision-core/adapters/road-status-to-assertion.adapter';
import type { WeatherHazardAssertionPayload } from '../../guardian-decision-core/adapters/weather-hazard-to-assertion.adapter';
import type { ExecutionDepartureAssertionPayload } from '../../guardian-decision-core/adapters/execution-departure-to-assertion.adapter';
import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import type {
  ActivityArrivalProjection,
  RoadConditionSnapshot,
} from '../validation/tep-validation.types';

export interface WeatherHazardSnapshot {
  dayIndex?: number;
  regionId: string;
  windSpeedKmh: number;
  windGustKmh?: number;
  activityType?: string;
  requiresGuide?: boolean;
  observedAt: string;
  validUntil?: string;
  degraded?: boolean;
}

export interface TepWorldStateEvidence {
  roadConditions: RoadConditionSnapshot[];
  activityArrivals: ActivityArrivalProjection[];
  weatherHazards: WeatherHazardSnapshot[];
  /** 证据来源标记 */
  sources: Array<
    'road.status' | 'weather.hazard' | 'execution.departure_slip' | 'plan_schedule'
  >;
  hasStaleEvidence: boolean;
}

function isActive(assertion: WorldStateAssertion): boolean {
  return assertion.status === 'ACTIVE';
}

function isExpired(validUntil: string | undefined, nowMs: number): boolean {
  if (!validUntil) return false;
  const expires = new Date(validUntil).getTime();
  return !Number.isNaN(expires) && expires < nowMs;
}

function collectPlanRoadRefs(dailyDrivePlans: DailyDrivePlan[]): string[] {
  const refs = new Set<string>();
  for (const day of dailyDrivePlans) {
    for (const leg of day.legs) {
      for (const ref of leg.roadRefs) refs.add(ref);
    }
  }
  return [...refs];
}

function roadRefMatchesAssertion(
  roadRef: string,
  assertion: WorldStateAssertion<RoadStatusAssertionPayload>,
): boolean {
  const payload = assertion.payload;
  const roadId = payload.roadId?.toUpperCase() ?? '';
  const subjectId = assertion.subjectRef.id ?? '';
  const hay = roadRef.toUpperCase();
  return (
    (roadId.length > 0 && hay.includes(roadId)) ||
    hay.includes(subjectId.toUpperCase()) ||
    subjectId.toUpperCase().includes(hay)
  );
}

export function mapRoadAssertionsToConditions(input: {
  store: StoredRfc001WorldState;
  dailyDrivePlans: DailyDrivePlan[];
  now?: Date;
}): RoadConditionSnapshot[] {
  const nowMs = (input.now ?? new Date()).getTime();
  const planRefs = collectPlanRoadRefs(input.dailyDrivePlans);
  if (planRefs.length === 0) return [];

  const roadAssertions = input.store.assertions.filter(
    (a): a is WorldStateAssertion<RoadStatusAssertionPayload> =>
      a.predicate === 'road.status' && isActive(a),
  );

  const conditions: RoadConditionSnapshot[] = [];
  for (const roadRef of planRefs) {
    const match = [...roadAssertions]
      .reverse()
      .find((a) => roadRefMatchesAssertion(roadRef, a));
    if (!match) continue;

    const expired = isExpired(match.validUntil, nowMs);
    conditions.push({
      roadRef,
      roadId: match.payload.roadId,
      status: expired ? 'UNKNOWN' : match.payload.status,
      observedAt: match.observedAt,
      validUntil: match.validUntil,
      degraded: expired,
    });
  }

  return conditions;
}

export function mapWeatherAssertionsToHazards(input: {
  store: StoredRfc001WorldState;
  dailyDrivePlans: DailyDrivePlan[];
  now?: Date;
}): WeatherHazardSnapshot[] {
  const nowMs = (input.now ?? new Date()).getTime();
  const dayIndexes = new Set(dailyDrivePlansDayIndexes(input.dailyDrivePlans));

  return input.store.assertions
    .filter(
      (a): a is WorldStateAssertion<WeatherHazardAssertionPayload> =>
        a.predicate === 'weather.hazard' && isActive(a),
    )
    .filter((a) => {
      const day = a.payload.dayIndex;
      return day == null || dayIndexes.has(day);
    })
    .map((a) => {
      const expired = isExpired(a.validUntil, nowMs);
      return {
        dayIndex: a.payload.dayIndex,
        regionId: a.payload.regionId,
        windSpeedKmh: a.payload.windSpeedKmh,
        windGustKmh: a.payload.windGustKmh,
        activityType: a.payload.activityType,
        requiresGuide: a.payload.requiresGuide,
        observedAt: a.observedAt,
        validUntil: a.validUntil,
        degraded: expired,
      };
    });
}

function dailyDrivePlansDayIndexes(dailyDrivePlans: DailyDrivePlan[]): Set<number> {
  return new Set(dailyDrivePlans.map((d) => d.dayIndex));
}

function toActivityRef(itemId: string): string {
  return itemId.startsWith('activity_') ? itemId : `activity_${itemId}`;
}

function toAccommodationRef(itemId: string): string {
  return itemId.startsWith('accommodation_') ? itemId : `accommodation_${itemId}`;
}

export function mapExecutionSlipToArrivals(input: {
  store: StoredRfc001WorldState;
}): ActivityArrivalProjection[] {
  const arrivals: ActivityArrivalProjection[] = [];

  for (const assertion of input.store.assertions) {
    if (assertion.predicate !== 'execution.departure_slip' || !isActive(assertion)) {
      continue;
    }
    const payload = assertion.payload as ExecutionDepartureAssertionPayload;
    if (!payload.projectedEta) continue;

    const targetId = payload.nextActivityId ?? payload.activityId;
    arrivals.push({
      activityRef: toActivityRef(targetId),
      projectedArrivalAt: payload.projectedEta,
    });

    if (payload.lastEntryAt) {
      arrivals.push({
        activityRef: toAccommodationRef(targetId),
        projectedArrivalAt: payload.lastEntryAt,
      });
    }
  }

  return arrivals;
}

/** 规划期回退：按 leg 累加估算到达时间（无 WorldState slip 时） */
export function projectScheduleArrivalsFromDailyPlans(
  dailyDrivePlans: DailyDrivePlan[],
): ActivityArrivalProjection[] {
  const arrivals: ActivityArrivalProjection[] = [];

  for (const day of dailyDrivePlans) {
    const dayStart = new Date(`${day.date}T08:00:00.000Z`);
    let cursorMs = dayStart.getTime();

    for (const leg of day.legs) {
      cursorMs += (leg.adjustedMinutes ?? leg.baseNavigationMinutes) * 60_000;
      arrivals.push({
        activityRef: toActivityRef(leg.toRef),
        projectedArrivalAt: new Date(cursorMs).toISOString(),
      });
    }

    for (const activity of day.activities) {
      if (activity.fixedStartAt) continue;
      arrivals.push({
        activityRef: activity.ref,
        projectedArrivalAt: new Date(cursorMs).toISOString(),
      });
    }

    if (day.accommodation) {
      arrivals.push({
        activityRef: day.accommodation.ref,
        projectedArrivalAt: new Date(cursorMs).toISOString(),
      });
    }
  }

  return dedupeArrivals(arrivals);
}

function dedupeArrivals(
  arrivals: ActivityArrivalProjection[],
): ActivityArrivalProjection[] {
  const byRef = new Map<string, ActivityArrivalProjection>();
  for (const row of arrivals) {
    byRef.set(row.activityRef, row);
  }
  return [...byRef.values()];
}

export function mergeActivityArrivals(
  worldState: ActivityArrivalProjection[],
  schedule: ActivityArrivalProjection[],
): ActivityArrivalProjection[] {
  const merged = new Map<string, ActivityArrivalProjection>();
  for (const row of schedule) merged.set(row.activityRef, row);
  for (const row of worldState) merged.set(row.activityRef, row);
  return [...merged.values()];
}

export function buildTepEvidenceFromWorldState(input: {
  store: StoredRfc001WorldState;
  dailyDrivePlans: DailyDrivePlan[];
  now?: Date;
}): TepWorldStateEvidence {
  const roadConditions = mapRoadAssertionsToConditions(input);
  const weatherHazards = mapWeatherAssertionsToHazards(input);
  const slipArrivals = mapExecutionSlipToArrivals({ store: input.store });
  const scheduleArrivals = projectScheduleArrivalsFromDailyPlans(input.dailyDrivePlans);
  const activityArrivals = mergeActivityArrivals(slipArrivals, scheduleArrivals);

  const sources: TepWorldStateEvidence['sources'] = [];
  if (roadConditions.length > 0) sources.push('road.status');
  if (weatherHazards.length > 0) sources.push('weather.hazard');
  if (slipArrivals.length > 0) sources.push('execution.departure_slip');
  if (scheduleArrivals.length > 0) sources.push('plan_schedule');

  const hasStaleEvidence =
    roadConditions.some((r) => r.degraded) || weatherHazards.some((w) => w.degraded);

  return {
    roadConditions,
    activityArrivals,
    weatherHazards,
    sources,
    hasStaleEvidence,
  };
}
