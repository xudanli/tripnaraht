/**
 * Slice 4 — strong wind → execution slip harness fixtures.
 */

import type {
  AttentionOrchestrationContext,
  AttentionOrchestrationProblemInput,
} from '../contracts/attention-orchestration.types';
import { buildWeatherStrongWindRootCauseKey } from '../attention/build-weather-strong-wind-root-cause-key.util';

export const HARNESS_ATTENTION_TRIP_ID = 'trip_attention_wind_harness';
export const HARNESS_ROUTE_SEGMENT_ID = 'segment:trip_attention_wind_harness:drive_day2';
export const HARNESS_WEATHER_EPISODE_ID = 'vedur_ep_wind_20260712_am';

export const HARNESS_NOW = '2026-07-12T12:00:00.000Z';
export const HARNESS_NOW_LATER = '2026-07-12T12:20:00.000Z';
export const HARNESS_NOW_WINDOW = '2026-07-12T15:30:00.000Z';

export const PROBLEM_WEATHER_WIND: AttentionOrchestrationProblemInput = {
  problemId: 'problem_weather_wind_001',
  tripId: HARNESS_ATTENTION_TRIP_ID,
  semanticCapability: 'WEATHER_STRONG_WIND',
  status: 'OPEN',
  detectedAt: HARNESS_NOW,
  routeSegmentId: HARNESS_ROUTE_SEGMENT_ID,
  weatherEpisodeId: HARNESS_WEATHER_EPISODE_ID,
  rootCauseCode: 'WEATHER_STRONG_WIND',
};

export const PROBLEM_EXEC_SLIP: AttentionOrchestrationProblemInput = {
  problemId: 'problem_exec_slip_001',
  tripId: HARNESS_ATTENTION_TRIP_ID,
  semanticCapability: 'EXECUTION_DEPARTURE_SLIP',
  status: 'OPEN',
  detectedAt: HARNESS_NOW_LATER,
  causedByProblemId: PROBLEM_WEATHER_WIND.problemId,
  routeSegmentId: HARNESS_ROUTE_SEGMENT_ID,
  weatherEpisodeId: HARNESS_WEATHER_EPISODE_ID,
};

export const PROBLEM_SCHEDULE_INFEASIBLE: AttentionOrchestrationProblemInput = {
  problemId: 'problem_exec_infeasible_001',
  tripId: HARNESS_ATTENTION_TRIP_ID,
  semanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
  status: 'OPEN',
  detectedAt: HARNESS_NOW_LATER,
  urgency: 'HIGH',
  causedByProblemId: PROBLEM_EXEC_SLIP.problemId,
  routeSegmentId: HARNESS_ROUTE_SEGMENT_ID,
  weatherEpisodeId: HARNESS_WEATHER_EPISODE_ID,
  explanation:
    '预计到达下一活动时间为 16:18，已超过 16:00 最晚入场时间',
};

export const PROBLEM_WINDOW_MISSED: AttentionOrchestrationProblemInput = {
  problemId: 'problem_window_missed_001',
  tripId: HARNESS_ATTENTION_TRIP_ID,
  semanticCapability: 'ACTIVITY_WINDOW_MISSED',
  status: 'OPEN',
  detectedAt: HARNESS_NOW_WINDOW,
  causedByProblemId: PROBLEM_SCHEDULE_INFEASIBLE.problemId,
  routeSegmentId: HARNESS_ROUTE_SEGMENT_ID,
  weatherEpisodeId: HARNESS_WEATHER_EPISODE_ID,
};

export const PROBLEM_NIGHT_DRIVING: AttentionOrchestrationProblemInput = {
  problemId: 'problem_night_driving_001',
  tripId: HARNESS_ATTENTION_TRIP_ID,
  semanticCapability: 'NIGHT_DRIVING_RISK',
  status: 'OPEN',
  detectedAt: HARNESS_NOW_WINDOW,
  causedByProblemId: PROBLEM_SCHEDULE_INFEASIBLE.problemId,
  routeSegmentId: HARNESS_ROUTE_SEGMENT_ID,
  weatherEpisodeId: HARNESS_WEATHER_EPISODE_ID,
};

export const PROBLEM_ROAD_CLOSED: AttentionOrchestrationProblemInput = {
  problemId: 'problem_road_closed_001',
  tripId: HARNESS_ATTENTION_TRIP_ID,
  semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
  status: 'OPEN',
  detectedAt: HARNESS_NOW,
  urgency: 'CRITICAL',
  routeSegmentId: 'segment:trip_attention_wind_harness:drive_f208',
};

export const PROBLEM_UNRELATED_WIND: AttentionOrchestrationProblemInput = {
  problemId: 'problem_weather_wind_002',
  tripId: HARNESS_ATTENTION_TRIP_ID,
  semanticCapability: 'WEATHER_STRONG_WIND',
  status: 'OPEN',
  detectedAt: HARNESS_NOW,
  routeSegmentId: 'segment:trip_attention_wind_harness:drive_day3',
  weatherEpisodeId: 'vedur_ep_wind_20260713_am',
  rootCauseCode: 'WEATHER_STRONG_WIND',
};

export function harnessAttentionContext(
  overrides: Partial<AttentionOrchestrationContext> = {},
): AttentionOrchestrationContext {
  return {
    tripId: HARNESS_ATTENTION_TRIP_ID,
    routeSegmentId: HARNESS_ROUTE_SEGMENT_ID,
    weatherEpisodeId: HARNESS_WEATHER_EPISODE_ID,
    now: HARNESS_NOW,
    ...overrides,
  };
}

export function harnessWindRootCauseKey(): string {
  return buildWeatherStrongWindRootCauseKey({
    tripId: HARNESS_ATTENTION_TRIP_ID,
    routeSegmentId: HARNESS_ROUTE_SEGMENT_ID,
    weatherEpisodeId: HARNESS_WEATHER_EPISODE_ID,
  });
}

export function cloneProblem(
  base: AttentionOrchestrationProblemInput,
  overrides: Partial<AttentionOrchestrationProblemInput>,
): AttentionOrchestrationProblemInput {
  return { ...base, ...overrides };
}
