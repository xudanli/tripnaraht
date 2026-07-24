/**
 * Shadow observation sample row builders (deterministic + staging replay).
 */

import type { InternalUnifiedProblemRow } from '../../../decision-runtime/gateway/utils/unified-decision-problem-projection.util';
import { mockUnifiedProblemRow, shadowOccurrence } from './attention-shadow-run.util';

export const OBS_TRIP_ID = 'trip_attention_observation';
export const OBS_SEGMENT = `segment:${OBS_TRIP_ID}:drive_day2`;
export const OBS_EPISODE_AM = 'vedur_ep_20260712_am';
export const OBS_EPISODE_PM = 'vedur_ep_20260712_pm';

export function obsWindRow(input: {
  problemId: string;
  episodeId: string;
  observedAt: string;
  workflowStatus?: InternalUnifiedProblemRow['workflowStatus'];
}): InternalUnifiedProblemRow {
  return mockUnifiedProblemRow({
    tripId: OBS_TRIP_ID,
    problemId: input.problemId,
    semanticKey: 'WEATHER_STRONG_WIND',
    workflowStatus: input.workflowStatus ?? 'WAITING_DECISION',
    enforcement: 'REQUIRE_CONFIRMATION',
    occurrences: [shadowOccurrence(input.observedAt)],
    scope: { tripId: OBS_TRIP_ID, routeSegmentIds: [OBS_SEGMENT] },
    rawCanonical: {
      rfc001Problem: {
        triggerEventId: `weather_episode:${input.episodeId}`,
        weatherEpisodeId: input.episodeId,
      },
    } as unknown as InternalUnifiedProblemRow['rawCanonical'],
  });
}

export function obsInfeasibleRow(input: {
  problemId: string;
  observedAt: string;
  episodeId?: string;
  causedByProblemId?: string;
  workflowStatus?: InternalUnifiedProblemRow['workflowStatus'];
}): InternalUnifiedProblemRow {
  return mockUnifiedProblemRow({
    tripId: OBS_TRIP_ID,
    problemId: input.problemId,
    semanticKey: 'EXECUTION_SCHEDULE_INFEASIBLE',
    workflowStatus: input.workflowStatus ?? 'WAITING_DECISION',
    enforcement: 'REQUIRE_ADJUSTMENT',
    occurrences: [shadowOccurrence(input.observedAt)],
    scope: { tripId: OBS_TRIP_ID, routeSegmentIds: [OBS_SEGMENT] },
    rawCanonical: input.episodeId
      ? ({
          rfc001Problem: {
            triggerEventId: `weather_episode:${input.episodeId}`,
            weatherEpisodeId: input.episodeId,
          },
        } as unknown as InternalUnifiedProblemRow['rawCanonical'])
      : undefined,
  });
}

export function obsNightRow(input: {
  problemId: string;
  observedAt: string;
  episodeId?: string;
  workflowStatus?: InternalUnifiedProblemRow['workflowStatus'];
}): InternalUnifiedProblemRow {
  return mockUnifiedProblemRow({
    tripId: OBS_TRIP_ID,
    problemId: input.problemId,
    semanticKey: 'NIGHT_DRIVING_RISK',
    workflowStatus: input.workflowStatus ?? 'WAITING_DECISION',
    enforcement: 'BLOCK',
    occurrences: [shadowOccurrence(input.observedAt)],
    scope: { tripId: OBS_TRIP_ID, routeSegmentIds: [OBS_SEGMENT] },
    rawCanonical: input.episodeId
      ? ({
          rfc001Problem: {
            triggerEventId: `weather_episode:${input.episodeId}`,
            weatherEpisodeId: input.episodeId,
          },
        } as unknown as InternalUnifiedProblemRow['rawCanonical'])
      : undefined,
  });
}

export function obsRoadRow(input: {
  problemId: string;
  observedAt: string;
  segmentId?: string;
}): InternalUnifiedProblemRow {
  return mockUnifiedProblemRow({
    tripId: OBS_TRIP_ID,
    problemId: input.problemId,
    semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
    workflowStatus: 'WAITING_DECISION',
    enforcement: 'BLOCK',
    occurrences: [shadowOccurrence(input.observedAt)],
    scope: {
      tripId: OBS_TRIP_ID,
      routeSegmentIds: [input.segmentId ?? `segment:${OBS_TRIP_ID}:drive_f208`],
    },
  });
}

export function obsSlipRow(input: {
  problemId: string;
  observedAt: string;
  episodeId?: string;
}): InternalUnifiedProblemRow {
  return mockUnifiedProblemRow({
    tripId: OBS_TRIP_ID,
    problemId: input.problemId,
    semanticKey: 'EXECUTION_DEPARTURE_SLIP',
    workflowStatus: 'WAITING_DECISION',
    enforcement: 'REQUIRE_CONFIRMATION',
    occurrences: [shadowOccurrence(input.observedAt)],
    scope: { tripId: OBS_TRIP_ID, routeSegmentIds: [OBS_SEGMENT] },
    rawCanonical: input.episodeId
      ? ({
          rfc001Problem: {
            triggerEventId: `weather_episode:${input.episodeId}`,
            weatherEpisodeId: input.episodeId,
          },
        } as unknown as InternalUnifiedProblemRow['rawCanonical'])
      : undefined,
  });
}

export function obsWindowMissRow(input: {
  problemId: string;
  observedAt: string;
  episodeId?: string;
}): InternalUnifiedProblemRow {
  return mockUnifiedProblemRow({
    tripId: OBS_TRIP_ID,
    problemId: input.problemId,
    semanticKey: 'ACTIVITY_WINDOW_MISSED',
    workflowStatus: 'WAITING_DECISION',
    enforcement: 'REQUIRE_ADJUSTMENT',
    occurrences: [shadowOccurrence(input.observedAt)],
    scope: { tripId: OBS_TRIP_ID, routeSegmentIds: [OBS_SEGMENT] },
    rawCanonical: input.episodeId
      ? ({
          rfc001Problem: {
            triggerEventId: `weather_episode:${input.episodeId}`,
            weatherEpisodeId: input.episodeId,
          },
        } as unknown as InternalUnifiedProblemRow['rawCanonical'])
      : undefined,
  });
}

/** Inject episode + causal lineage into orchestration inputs post-map. */
export function withEpisodeAndLineage(
  problems: Array<{ problemId: string; episodeId?: string; causedByProblemId?: string }>,
): Map<string, { episodeId?: string; causedByProblemId?: string }> {
  return new Map(problems.map((p) => [p.problemId, p]));
}

export const OBS_CONTEXT = {
  routeSegmentId: OBS_SEGMENT,
  weatherEpisodeId: OBS_EPISODE_AM,
};

export const OBS_TIMES = {
  T09: '2026-07-12T09:00:00.000Z',
  T10: '2026-07-12T10:00:00.000Z',
  T11: '2026-07-12T11:00:00.000Z',
  T12: '2026-07-12T12:00:00.000Z',
  T16: '2026-07-12T16:00:00.000Z',
  T17: '2026-07-12T17:00:00.000Z',
  T18: '2026-07-12T18:00:00.000Z',
};
