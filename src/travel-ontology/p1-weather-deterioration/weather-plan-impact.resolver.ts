import { TRAVEL_WORLD_PREDICATES, type TravelWorldFact } from '../contracts/travel-world-fact.types';
import type {
  WeatherPlanImpact,
  WeatherPlanView,
  WeatherProductBehavior,
  WeatherTimeline,
  WeatherWarningLevel,
  WeatherPlanSegmentRef,
} from './weather-deterioration.types';
import {
  parseWeatherWarningLevel,
  WEATHER_WARNING_RANK,
} from './weather-warning-to-travel-world-fact.adapter';

function regionMatch(
  seg: WeatherPlanSegmentRef,
  regionId: string,
  subjectId: string,
): boolean {
  if (seg.segmentId === subjectId) return true;
  const regions = (seg.regionIds ?? []).map((r) => r.toUpperCase());
  return regions.includes(regionId.toUpperCase()) || seg.windExposed === true;
}

export function resolveWeatherProductBehavior(input: {
  matchedSegmentIds: string[];
  warningLevel: WeatherWarningLevel;
  highRoof: boolean;
  enRouteOnExposedSegment?: boolean;
  affectsFutureDaysOnly?: boolean;
}): WeatherProductBehavior {
  if (input.matchedSegmentIds.length === 0 && !input.highRoof) return 'WORLD_STATE_ONLY';
  if (input.warningLevel === 'NONE' || input.warningLevel === 'YELLOW') {
    return input.matchedSegmentIds.length ? 'MONITORING' : 'WORLD_STATE_ONLY';
  }
  if (input.enRouteOnExposedSegment && input.warningLevel === 'RED') {
    return 'EXECUTION_BLOCK_URGENT';
  }
  if (input.affectsFutureDaysOnly) return 'MONITORING';
  if (input.warningLevel === 'RED' && input.highRoof) return 'ACTIVE_RISK_BLOCK';
  if (input.warningLevel === 'ORANGE' && input.highRoof) return 'ACTIVE_ADJUSTMENT';
  if (input.matchedSegmentIds.length && input.warningLevel === 'ORANGE') {
    return 'ACTIVE_ADJUSTMENT';
  }
  return 'MONITORING';
}

export function buildWeatherTimeline(input: {
  facts: TravelWorldFact[];
  subjectId: string;
  currentLevel: WeatherWarningLevel;
}): WeatherTimeline {
  const history = input.facts
    .filter(
      (f) =>
        f.predicate === TRAVEL_WORLD_PREDICATES.WEATHER_WARNING_LEVEL &&
        f.subjectId === input.subjectId,
    )
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));

  let onsetAt: string | undefined;
  let deterioratedAt: string | undefined;
  let peakLevel: WeatherWarningLevel = 'NONE';
  let lastActionBy: string | undefined;

  for (const f of history) {
    const level = parseWeatherWarningLevel(String(f.value));
    if (WEATHER_WARNING_RANK[level] >= WEATHER_WARNING_RANK.YELLOW && !onsetAt) {
      onsetAt = f.validFrom ?? f.observedAt;
    }
    if (
      peakLevel !== 'NONE' &&
      WEATHER_WARNING_RANK[level] > WEATHER_WARNING_RANK[peakLevel]
    ) {
      deterioratedAt = f.observedAt;
    }
    if (WEATHER_WARNING_RANK[level] >= WEATHER_WARNING_RANK[peakLevel]) {
      peakLevel = level;
    }
    if (f.validTo) lastActionBy = f.validTo;
  }

  if (!onsetAt && input.currentLevel !== 'NONE') {
    const live = history[history.length - 1];
    onsetAt = live?.validFrom ?? live?.observedAt;
  }
  if (!lastActionBy) {
    const live = history.filter((f) => f.freshness !== 'EXPIRED').at(-1);
    lastActionBy = live?.validTo ?? live?.expiresAt;
  }

  return { onsetAt, deterioratedAt, peakLevel, lastActionBy };
}

export function resolveWeatherPlanImpact(input: {
  facts: TravelWorldFact[];
  plan: WeatherPlanView;
  nowMs?: number;
}): WeatherPlanImpact | null {
  const nowMs = input.nowMs ?? Date.now();
  const warnings = input.facts.filter((f) => {
    if (f.predicate !== TRAVEL_WORLD_PREDICATES.WEATHER_WARNING_LEVEL) return false;
    if (f.freshness === 'EXPIRED') return false;
    if (f.expiresAt && Date.parse(f.expiresAt) < nowMs) return false;
    if (f.authorityLevel !== 'GOVERNMENT' && f.authorityLevel !== 'OFFICIAL_OPERATOR') {
      return false;
    }
    return true;
  });
  if (warnings.length === 0) return null;

  const primary = warnings.sort(
    (a, b) =>
      WEATHER_WARNING_RANK[parseWeatherWarningLevel(String(b.value))] -
      WEATHER_WARNING_RANK[parseWeatherWarningLevel(String(a.value))],
  )[0]!;
  const warningLevel = parseWeatherWarningLevel(String(primary.value));
  const geom = primary.scope.geometry as { regionId?: string } | undefined;
  const regionId = geom?.regionId ?? primary.scope.region ?? primary.subjectId;
  const matched = input.plan.segments.filter((s) =>
    regionMatch(s, regionId, primary.subjectId),
  );
  const matchedSegmentIds = matched.map((s) => s.segmentId);
  const highRoof = Boolean(
    input.plan.vehicleClass && /HIGH_ROOF/i.test(input.plan.vehicleClass),
  );
  const impacts: WeatherPlanImpact['impacts'] = [];

  if (highRoof && WEATHER_WARNING_RANK[warningLevel] >= WEATHER_WARNING_RANK.ORANGE) {
    impacts.push({
      kind: 'HIGH_ROOF_VEHICLE',
      note: `高顶车辆在 ${warningLevel} 强风下风险升高（派生）`,
    });
  }
  for (const seg of matched) {
    impacts.push({
      kind: 'EXPOSED_SEGMENT',
      segmentId: seg.segmentId,
      planItemId: seg.itineraryItemId,
      note: `路段 ${seg.label ?? seg.segmentId} 暴露于 ${warningLevel} 预警`,
    });
    if (seg.outdoorActivity) {
      impacts.push({
        kind: 'ACTIVITY_OUTDOOR',
        planItemId: seg.itineraryItemId,
        segmentId: seg.segmentId,
        note: '户外活动受强风影响',
      });
    }
  }

  const timeline = buildWeatherTimeline({
    facts: input.facts,
    subjectId: primary.subjectId,
    currentLevel: warningLevel,
  });
  if (timeline.lastActionBy) {
    impacts.push({
      kind: 'LAST_ACTION_DEADLINE',
      note: `最晚行动参考 ${timeline.lastActionBy}`,
    });
  }

  const productBehavior = resolveWeatherProductBehavior({
    matchedSegmentIds,
    warningLevel,
    highRoof,
    enRouteOnExposedSegment: input.plan.enRouteOnExposedSegment,
    affectsFutureDaysOnly: input.plan.affectsFutureDaysOnly,
  });

  return {
    regionId,
    warningLevel,
    matchedSegmentIds,
    affectedPlanItemIds: [
      ...new Set(
        matched
          .map((m) => m.itineraryItemId)
          .filter((x): x is string => !!x),
      ),
    ],
    impacts,
    productBehavior,
    affectsActivePlan:
      productBehavior !== 'WORLD_STATE_ONLY' && productBehavior !== 'MONITORING',
    timeline,
  };
}
