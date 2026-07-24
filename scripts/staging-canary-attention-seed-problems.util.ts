/**
 * Slice 4 Attention — RFC001 problem fixtures for staging Execution Slip Canary seed.
 */

import type { Rfc001DecisionProblem } from '../src/trips/guardian-decision-core/contracts/decision-problem.types';
import { EXEC_SLIP_CANARY_ACTIVITY_A_ID, EXEC_SLIP_CANARY_TRIP_ID } from './prod-canary-execution-slip-pre-signoff.constants';

export const STAGING_ATTENTION_EPISODE = 'vedur_ep_exec_slip_staging_20260712';
export const STAGING_ATTENTION_EPISODE_PM = 'vedur_ep_exec_slip_staging_20260712_pm';
export const STAGING_ATTENTION_ROUTE_SEGMENT = `segment:${EXEC_SLIP_CANARY_TRIP_ID}:drive_day2`;
export const STAGING_ATTENTION_ROAD_SEGMENT = `segment:${EXEC_SLIP_CANARY_TRIP_ID}:road_f208`;

export type AttentionSeedProblem = Rfc001DecisionProblem & {
  weatherEpisodeId?: string;
  causedByProblemId?: string;
};

export type AttentionSeedProfile =
  | 'slice4-a'
  | 'slice4-b'
  | 'slice4-c'
  | 'slice4-d'
  | 'slice4-f'
  | 'slice4-07'
  | 'slice4-08'
  | 'slice4-09'
  | 'slice4-10';

const PROBLEM_IDS = {
  wind: 'stg_attn_wind',
  windPm: 'stg_attn_wind_pm',
  slip: 'stg_attn_slip',
  infeasible: 'stg_attn_infeasible',
  infeasibleNoEp: 'stg_attn_infeasible_no_ep',
  night: 'stg_attn_night',
  road: 'stg_attn_road',
} as const;

function baseProblem(input: {
  problemId: string;
  semanticCapability: string;
  status?: Rfc001DecisionProblem['status'];
  weatherEpisodeId?: string;
  causedByProblemId?: string;
  routeSegmentId?: string;
  detectedAt?: string;
}): AttentionSeedProblem {
  const detectedAt = input.detectedAt ?? '2026-07-12T09:00:00.000Z';
  const segment = input.routeSegmentId ?? STAGING_ATTENTION_ROUTE_SEGMENT;
  return {
    problemId: input.problemId,
    tripId: EXEC_SLIP_CANARY_TRIP_ID,
    planVersionId: 'plan_1',
    type: 'FEASIBILITY_FAILURE',
    triggerEventId: input.weatherEpisodeId
      ? `weather_episode:${input.weatherEpisodeId}`
      : `evt_attn_${input.problemId}`,
    affectedEntityRefs: [
      { kind: 'ROUTE_SEGMENT', id: segment, label: segment },
      { kind: 'PLAN_ITEM', id: EXEC_SLIP_CANARY_ACTIVITY_A_ID, label: 'activityA' },
    ],
    affectedPlanItemIds: [EXEC_SLIP_CANARY_ACTIVITY_A_ID],
    worldStateSnapshotId: 'wss_stg_attn_seed',
    detectedAt,
    urgency: 'HIGH',
    status: input.status ?? 'OPEN',
    semanticCapability: input.semanticCapability,
    weatherEpisodeId: input.weatherEpisodeId,
    causedByProblemId: input.causedByProblemId,
  };
}

export function buildAttentionSeedProblems(profile: AttentionSeedProfile): AttentionSeedProblem[] {
  const wind = baseProblem({
    problemId: PROBLEM_IDS.wind,
    semanticCapability: 'WEATHER_STRONG_WIND',
    weatherEpisodeId: STAGING_ATTENTION_EPISODE,
    detectedAt: '2026-07-12T09:00:00.000Z',
  });
  const slip = baseProblem({
    problemId: PROBLEM_IDS.slip,
    semanticCapability: 'EXECUTION_DEPARTURE_SLIP',
    weatherEpisodeId: STAGING_ATTENTION_EPISODE,
    causedByProblemId: PROBLEM_IDS.wind,
    detectedAt: '2026-07-12T10:00:00.000Z',
  });
  const infeasible = baseProblem({
    problemId: PROBLEM_IDS.infeasible,
    semanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
    weatherEpisodeId: STAGING_ATTENTION_EPISODE,
    causedByProblemId: PROBLEM_IDS.slip,
    detectedAt: '2026-07-12T10:30:00.000Z',
  });
  const night = baseProblem({
    problemId: PROBLEM_IDS.night,
    semanticCapability: 'NIGHT_DRIVING_RISK',
    weatherEpisodeId: STAGING_ATTENTION_EPISODE,
    causedByProblemId: PROBLEM_IDS.infeasible,
    detectedAt: '2026-07-12T17:00:00.000Z',
  });
  const road = baseProblem({
    problemId: PROBLEM_IDS.road,
    semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
    routeSegmentId: STAGING_ATTENTION_ROAD_SEGMENT,
    detectedAt: '2026-07-12T09:30:00.000Z',
  });
  const windPm = baseProblem({
    problemId: PROBLEM_IDS.windPm,
    semanticCapability: 'WEATHER_STRONG_WIND',
    weatherEpisodeId: STAGING_ATTENTION_EPISODE_PM,
    detectedAt: '2026-07-12T16:00:00.000Z',
  });
  const infeasibleNoEp = baseProblem({
    problemId: PROBLEM_IDS.infeasibleNoEp,
    semanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
    detectedAt: '2026-07-12T10:30:00.000Z',
  });

  switch (profile) {
    case 'slice4-a':
      return [wind];
    case 'slice4-b':
      return [wind, infeasible];
    case 'slice4-c':
      return [wind, infeasible, night];
    case 'slice4-d':
      return [wind, infeasible, night, road];
    case 'slice4-f':
      return [wind, infeasible, night, road].map((p) => ({ ...p, status: 'RESOLVED' as const }));
    case 'slice4-07':
      return [wind, windPm];
    case 'slice4-08':
      return [wind, infeasibleNoEp];
    case 'slice4-09':
      return [
        wind,
        {
          ...infeasible,
          detectedAt: '2026-07-12T18:00:00.000Z',
        },
      ];
    case 'slice4-10':
      return [wind, slip, infeasible, night];
    default:
      return [wind, infeasible, night, road];
  }
}

export function buildLineageOverlayFromSeedProblems(
  problems: AttentionSeedProblem[],
): Array<{ problemId: string; weatherEpisodeId?: string; causedByProblemId?: string }> {
  return problems
    .map((p) => ({
      problemId: p.problemId,
      weatherEpisodeId: p.weatherEpisodeId,
      causedByProblemId: p.causedByProblemId,
    }))
    .filter((p) => p.weatherEpisodeId || p.causedByProblemId);
}

export const SCENARIO_ATTENTION_PROFILE: Record<string, AttentionSeedProfile> = {
  'STG-REPLAY-A': 'slice4-a',
  'STG-REPLAY-B': 'slice4-b',
  'STG-REPLAY-C': 'slice4-c',
  'STG-REPLAY-D': 'slice4-d',
  'STG-REPLAY-E': 'slice4-d',
  'STG-REPLAY-F': 'slice4-f',
  'STG-REPLAY-07': 'slice4-07',
  'STG-REPLAY-08': 'slice4-08',
  'STG-REPLAY-09': 'slice4-09',
  'STG-REPLAY-10': 'slice4-10',
};

export function profileForScenario(scenarioId: string): AttentionSeedProfile {
  return SCENARIO_ATTENTION_PROFILE[scenarioId] ?? defaultAttentionSeedProfile();
}

export function defaultAttentionSeedProfile(): AttentionSeedProfile {
  return 'slice4-d';
}
