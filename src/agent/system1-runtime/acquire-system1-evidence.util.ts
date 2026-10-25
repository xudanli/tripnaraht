/**
 * 按 Acquisition Plan 的 fetchKeys 取证；失败写 UNAVAILABLE，供 Sufficiency / Diagnosis 消费。
 */

import { collectLiveEvidenceFromSensorBlocks } from '../harness/collect-live-sensor-evidence.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import {
  adaptDayTimelineSlice,
  adaptLiveEvidenceFactV1,
  adaptLodgingCoverageSlice,
  mergeSystem1Evidence,
} from './adapt-system1-evidence.util';
import type {
  EvidenceAcquisitionPlan,
  System1Evidence,
  System1RuntimeFamily,
} from './system1-runtime.types';
import { loadTripLodgingCoverageFactSlice } from '../harness/trip-lodging-coverage-fact.util';
import { loadTripDayTimelineFactSlice } from '../harness/trip-day-timeline-fact.util';
import type { ResolvedTaskContextSlice } from '../harness/resolve-task-context-slice.util';
import {
  buildNextActivityAnswerZh,
  buildTodayPlanAnswerZh,
  formatNextActivityPromptLines,
  formatTodayTimelinePromptLines,
  isNextActivityDirectAnswerQuery,
  isTodayPlanDirectAnswerQuery,
} from '../harness/trip-day-timeline-fact.util';
import {
  buildTripLodgingCoverageAnswerZh,
  formatTripLodgingCoveragePromptLines,
  isLodgingGapDirectAnswerQuery,
} from '../harness/trip-lodging-coverage-fact.util';

function unavailable(key: string, detail: string): System1Evidence {
  return {
    evidenceId: `s1ev:${key}:unavailable`,
    key,
    sourceType: 'TOOL',
    value: null,
    status: 'UNAVAILABLE',
    provenance: { provider: detail },
  };
}

export type LiveSensorFetchHost = {
  fetchLiveWeatherBlock?: (input: {
    request: RouteAndRunRequestDto;
    tripId?: string;
  }) => Promise<{ block?: string | null; riskZh?: string | null } | null>;
  fetchLiveRoadBlock?: (input: {
    request: RouteAndRunRequestDto;
    tripId?: string;
  }) => Promise<{ block?: string | null; alertZh?: string | null; aggregate?: string | null } | null>;
};

export async function executeEvidenceAcquisition(input: {
  plan: EvidenceAcquisitionPlan;
  fetch: (key: string) => Promise<System1Evidence[]>;
}): Promise<{
  evidence: System1Evidence[];
  plan: EvidenceAcquisitionPlan;
}> {
  const results = await Promise.all(
    input.plan.fetchKeys.map(async (key) => {
      try {
        const rows = await input.fetch(key);
        if (rows.length === 0) {
          return {
            evidence: [unavailable(key, 'empty_fetch')],
            log: { key, ok: false, count: 0, detail: 'empty' as const },
          };
        }
        return { evidence: rows, log: { key, ok: true, count: rows.length } };
      } catch (e: unknown) {
        const detail = e instanceof Error ? e.message : String(e);
        return {
          evidence: [unavailable(key, detail)],
          log: { key, ok: false, count: 0, detail },
        };
      }
    }),
  );
  const evidence: System1Evidence[] = [];
  const fetchLog: NonNullable<EvidenceAcquisitionPlan['fetchLog']> = [];
  for (const r of results) {
    evidence.push(...r.evidence);
    fetchLog.push(r.log);
  }

  return {
    evidence,
    plan: {
      ...input.plan,
      fetchedKeys: [...input.plan.fetchKeys],
      fetchLog,
    },
  };
}

export function createLiveFeasibilityFetcher(input: {
  host: LiveSensorFetchHost;
  request: RouteAndRunRequestDto;
  tripId?: string;
}): (key: string) => Promise<System1Evidence[]> {
  const cache = new Map<string, System1Evidence[]>();
  return async (key: string) => {
    const hit = cache.get(key);
    if (hit) return hit;
    if (key === 'weather.wind' || key === 'weather.forecast') {
      if (!input.host.fetchLiveWeatherBlock) {
        cache.set(key, []);
        return [];
      }
      const w = await input.host.fetchLiveWeatherBlock({
        request: input.request,
        tripId: input.tripId,
      });
      if (!w) {
        cache.set(key, []);
        return [];
      }
      const live = collectLiveEvidenceFromSensorBlocks({
        weatherBlock: w.block,
        weatherRiskZh: w.riskZh,
      });
      const adapted = adaptLiveEvidenceFactV1(live);
      cache.set(key, adapted);
      return adapted;
    }
    if (key === 'route.status' || key === 'roadConditions') {
      if (!input.host.fetchLiveRoadBlock) {
        cache.set(key, []);
        return [];
      }
      const r = await input.host.fetchLiveRoadBlock({
        request: input.request,
        tripId: input.tripId,
      });
      if (!r) {
        cache.set(key, []);
        return [];
      }
      const live = collectLiveEvidenceFromSensorBlocks({
        roadBlock: r.block,
        roadAlertZh: r.alertZh,
        ontologyRoadAggregate: r.aggregate,
      });
      const adapted = adaptLiveEvidenceFactV1(live);
      cache.set(key, adapted);
      return adapted;
    }
    cache.set(key, []);
    return [];
  };
}

type TripPrisma = Parameters<typeof loadTripLodgingCoverageFactSlice>[0];

export function createTripQueryEvidenceFetcher(input: {
  prisma: TripPrisma;
  tripId: string;
  family: System1RuntimeFamily;
  message: string;
}): {
  fetch: (key: string) => Promise<System1Evidence[]>;
  getSlice: () => ResolvedTaskContextSlice | null;
} {
  let lodgingLoaded = false;
  let timelineLoaded = false;
  let lodgingEvidence: System1Evidence[] = [];
  let timelineEvidence: System1Evidence[] = [];
  let slice: ResolvedTaskContextSlice | null = null;

  const loadLodging = async () => {
    if (lodgingLoaded) return;
    lodgingLoaded = true;
    const lodging = await loadTripLodgingCoverageFactSlice(input.prisma, input.tripId);
    lodgingEvidence = adaptLodgingCoverageSlice(lodging ?? undefined);
    if (lodging) {
      slice = {
        registryKey: 'TRIP_QUERY_LODGING',
        promptLines: formatTripLodgingCoveragePromptLines(lodging),
        directAnswerZh: isLodgingGapDirectAnswerQuery(input.message)
          ? buildTripLodgingCoverageAnswerZh(lodging)
          : undefined,
        lodgingCoverage: lodging,
        skipFullTripSummary: true,
      };
    }
  };

  const loadTimeline = async () => {
    if (timelineLoaded) return;
    timelineLoaded = true;
    const timeline = await loadTripDayTimelineFactSlice(input.prisma, input.tripId);
    const fam =
      input.family === 'TRIP_QUERY_NEXT' ? 'TRIP_QUERY_NEXT' : 'TRIP_QUERY_TODAY';
    timelineEvidence = adaptDayTimelineSlice(timeline ?? undefined, fam);
    if (timeline) {
      if (input.family === 'TRIP_QUERY_NEXT') {
        slice = {
          registryKey: 'TRIP_QUERY_NEXT',
          promptLines: formatNextActivityPromptLines(timeline),
          directAnswerZh: isNextActivityDirectAnswerQuery(input.message)
            ? buildNextActivityAnswerZh(timeline)
            : undefined,
          dayTimeline: timeline,
          skipFullTripSummary: true,
        };
      } else {
        slice = {
          registryKey: 'TRIP_QUERY_TODAY',
          promptLines: formatTodayTimelinePromptLines(timeline),
          directAnswerZh: isTodayPlanDirectAnswerQuery(input.message)
            ? buildTodayPlanAnswerZh(timeline)
            : undefined,
          dayTimeline: timeline,
          skipFullTripSummary: true,
        };
      }
    }
  };

  return {
    getSlice: () => slice,
    fetch: async (key: string) => {
      if (
        key === 'trip.day_list' ||
        key === 'trip.accommodation_anchors' ||
        input.family === 'TRIP_QUERY_LODGING'
      ) {
        await loadLodging();
        return lodgingEvidence;
      }
      await loadTimeline();
      return timelineEvidence;
    },
  };
}

/** lodging fetch 时返回整袋证据，避免按 key 过滤丢同伴字段 */
export async function acquireTripQueryEvidenceBag(input: {
  prisma: TripPrisma;
  tripId: string;
  family: System1RuntimeFamily;
  message: string;
  fetchKeys: string[];
}): Promise<{
  evidence: System1Evidence[];
  slice: ResolvedTaskContextSlice | null;
  fetchLog: NonNullable<EvidenceAcquisitionPlan['fetchLog']>;
}> {
  const fetcher = createTripQueryEvidenceFetcher(input);
  const fetchLog: NonNullable<EvidenceAcquisitionPlan['fetchLog']> = [];
  if (input.fetchKeys.length === 0) {
    return { evidence: [], slice: null, fetchLog };
  }

  const needLodging =
    input.family === 'TRIP_QUERY_LODGING' ||
    input.fetchKeys.some((k) => k.startsWith('trip.day_list') || k.includes('accommodation'));
  const needTimeline =
    input.family === 'TRIP_QUERY_TODAY' ||
    input.family === 'TRIP_QUERY_NEXT' ||
    input.fetchKeys.some((k) =>
      ['trip.current_day', 'trip.timeline', 'trip.next_activity', 'trip.current_position'].includes(
        k,
      ),
    );

  let evidence: System1Evidence[] = [];
  if (needLodging) {
    try {
      const rows = await fetcher.fetch('trip.day_list');
      evidence = mergeSystem1Evidence([evidence, rows]);
      fetchLog.push({
        key: 'trip.lodging_bundle',
        ok: rows.some((r) => r.status === 'VERIFIED'),
        count: rows.length,
      });
    } catch (e: unknown) {
      evidence = mergeSystem1Evidence([
        evidence,
        [unavailable('trip.day_list', e instanceof Error ? e.message : String(e))],
      ]);
      fetchLog.push({ key: 'trip.lodging_bundle', ok: false, count: 0 });
    }
  }
  if (needTimeline) {
    try {
      const rows = await fetcher.fetch('trip.timeline');
      evidence = mergeSystem1Evidence([evidence, rows]);
      fetchLog.push({
        key: 'trip.timeline_bundle',
        ok: rows.some((r) => r.status === 'VERIFIED'),
        count: rows.length,
      });
    } catch (e: unknown) {
      evidence = mergeSystem1Evidence([
        evidence,
        [unavailable('trip.timeline', e instanceof Error ? e.message : String(e))],
      ]);
      fetchLog.push({ key: 'trip.timeline_bundle', ok: false, count: 0 });
    }
  }

  if (evidence.length === 0) {
    for (const key of input.fetchKeys) {
      evidence.push(unavailable(key, 'empty_fetch'));
    }
  }

  return { evidence, slice: fetcher.getSlice(), fetchLog };
}
