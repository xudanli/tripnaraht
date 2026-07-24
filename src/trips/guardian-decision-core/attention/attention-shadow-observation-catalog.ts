/**
 * Slice 4 Shadow Observation — 20 deterministic + 10 staging replay samples.
 */

import type { InternalUnifiedProblemRow } from '../../../decision-runtime/gateway/utils/unified-decision-problem-projection.util';
import type { AttentionShadowSampleExpectation } from '../contracts/attention-orchestration.types';
import {
  OBS_CONTEXT,
  OBS_EPISODE_AM,
  OBS_EPISODE_PM,
  OBS_TIMES,
  OBS_TRIP_ID,
  obsInfeasibleRow,
  obsNightRow,
  obsRoadRow,
  obsSlipRow,
  obsWindRow,
  obsWindowMissRow,
} from './attention-shadow-observation-samples.util';

export interface AttentionShadowObservationCase {
  spec: AttentionShadowSampleExpectation;
  tripId: string;
  rows: InternalUnifiedProblemRow[];
  lineageOverlay?: Array<{
    problemId: string;
    weatherEpisodeId?: string;
    causedByProblemId?: string;
  }>;
  contextOverrides?: {
    routeSegmentId?: string;
    weatherEpisodeId?: string;
    now?: string;
  };
  source: 'DETERMINISTIC_DRILL' | 'STAGING_REPLAY';
}

function windChainLineage(episode: string, ids: {
  wind: string;
  slip?: string;
  infeasible?: string;
  window?: string;
  night?: string;
}) {
  const overlay: AttentionShadowObservationCase['lineageOverlay'] = [
    { problemId: ids.wind, weatherEpisodeId: episode },
  ];
  if (ids.slip) {
    overlay.push({ problemId: ids.slip, weatherEpisodeId: episode, causedByProblemId: ids.wind });
  }
  if (ids.infeasible) {
    overlay.push({
      problemId: ids.infeasible,
      weatherEpisodeId: episode,
      causedByProblemId: ids.slip ?? ids.wind,
    });
  }
  if (ids.window) {
    overlay.push({
      problemId: ids.window,
      weatherEpisodeId: episode,
      causedByProblemId: ids.infeasible ?? ids.wind,
    });
  }
  if (ids.night) {
    overlay.push({
      problemId: ids.night,
      weatherEpisodeId: episode,
      causedByProblemId: ids.infeasible ?? ids.wind,
    });
  }
  return overlay;
}

const DETERMINISTIC_SAMPLES: AttentionShadowObservationCase[] = [
  // ── CORRECT_MERGE (5) ──
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-CM-01',
      group: 'CORRECT_MERGE',
      title: '强风 + slip + window miss → 1 cluster',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedAttentionLevel: 'INTERRUPT',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'cm01_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsSlipRow({ problemId: 'cm01_slip', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsInfeasibleRow({ problemId: 'cm01_inf', observedAt: OBS_TIMES.T11, episodeId: OBS_EPISODE_AM }),
      obsWindowMissRow({ problemId: 'cm01_win', observedAt: OBS_TIMES.T11, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'cm01_wind',
      slip: 'cm01_slip',
      infeasible: 'cm01_inf',
      window: 'cm01_win',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T11 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-CM-02',
      group: 'CORRECT_MERGE',
      title: '强风 + execution infeasible',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedAttentionLevel: 'INTERRUPT',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'cm02_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'cm02_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, { wind: 'cm02_wind', infeasible: 'cm02_inf' }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-CM-03',
      group: 'CORRECT_MERGE',
      title: '强风 + infeasible + night driving',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedAttentionLevel: 'INTERRUPT',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'cm03_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'cm03_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsNightRow({ problemId: 'cm03_night', observedAt: OBS_TIMES.T11, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'cm03_wind',
      infeasible: 'cm03_inf',
      night: 'cm03_night',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T11 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-CM-04',
      group: 'CORRECT_MERGE',
      title: 'legacy 3 visible → shadow 1',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'cm04_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsSlipRow({ problemId: 'cm04_slip', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsInfeasibleRow({ problemId: 'cm04_inf', observedAt: OBS_TIMES.T11, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'cm04_wind',
      slip: 'cm04_slip',
      infeasible: 'cm04_inf',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T11 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-CM-05',
      group: 'CORRECT_MERGE',
      title: 'full chain wind→slip→inf→window→night',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'cm05_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsSlipRow({ problemId: 'cm05_slip', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsInfeasibleRow({ problemId: 'cm05_inf', observedAt: OBS_TIMES.T11, episodeId: OBS_EPISODE_AM }),
      obsWindowMissRow({ problemId: 'cm05_win', observedAt: OBS_TIMES.T12, episodeId: OBS_EPISODE_AM }),
      obsNightRow({ problemId: 'cm05_night', observedAt: OBS_TIMES.T12, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'cm05_wind',
      slip: 'cm05_slip',
      infeasible: 'cm05_inf',
      window: 'cm05_win',
      night: 'cm05_night',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T12 },
  },

  // ── CORRECT_SEPARATION (4) ──
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-CS-01',
      group: 'CORRECT_SEPARATION',
      title: '强风 + 无关 road',
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'WEATHER_STRONG_WIND',
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'NONE',
      notes: 'Road observe-only; wind cluster must exclude road',
    },
    rows: [
      obsWindRow({ problemId: 'cs01_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsRoadRow({ problemId: 'cs01_road', observedAt: OBS_TIMES.T09 }),
    ],
    lineageOverlay: [{ problemId: 'cs01_wind', weatherEpisodeId: OBS_EPISODE_AM }],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T09 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-CS-02',
      group: 'CORRECT_SEPARATION',
      title: '两个不同 weather episode',
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 2,
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'NONE',
      notes: '09–11 episode A vs 16–18 episode B',
    },
    rows: [
      obsWindRow({ problemId: 'cs02_wind_am', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsWindRow({ problemId: 'cs02_wind_pm', episodeId: OBS_EPISODE_PM, observedAt: OBS_TIMES.T16 }),
    ],
    lineageOverlay: [
      { problemId: 'cs02_wind_am', weatherEpisodeId: OBS_EPISODE_AM },
      { problemId: 'cs02_wind_pm', weatherEpisodeId: OBS_EPISODE_PM },
    ],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T16 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-CS-03',
      group: 'CORRECT_SEPARATION',
      title: '缺少显式 episode / lineage → 默认不合并',
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 2,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
      notes: 'Prefer MISSED_MERGE over FALSE_MERGE — infeasible orphan cluster',
    },
    rows: [
      obsWindRow({ problemId: 'cs03_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'cs03_inf', observedAt: OBS_TIMES.T10 }),
    ],
    lineageOverlay: [{ problemId: 'cs03_wind', weatherEpisodeId: OBS_EPISODE_AM }],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-CS-04',
      group: 'CORRECT_SEPARATION',
      title: '无关 execution-only orphan',
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsInfeasibleRow({ problemId: 'cs04_inf', observedAt: OBS_TIMES.T10 }),
    ],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },

  // ── PRIMARY_SWITCH (4) ──
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-PS-01',
      group: 'PRIMARY_SWITCH',
      title: '仅强风 → Primary=WEATHER',
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'WEATHER_STRONG_WIND',
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [obsWindRow({ problemId: 'ps01_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 })],
    lineageOverlay: [{ problemId: 'ps01_wind', weatherEpisodeId: OBS_EPISODE_AM }],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T09 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-PS-02',
      group: 'PRIMARY_SWITCH',
      title: '加入 infeasible → Primary 切换',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'ps02_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'ps02_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, { wind: 'ps02_wind', infeasible: 'ps02_inf' }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-PS-03',
      group: 'PRIMARY_SWITCH',
      title: 'rootCause=WEATHER, primary=EXECUTION',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'ps03_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsSlipRow({ problemId: 'ps03_slip', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsInfeasibleRow({ problemId: 'ps03_inf', observedAt: OBS_TIMES.T11, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'ps03_wind',
      slip: 'ps03_slip',
      infeasible: 'ps03_inf',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T11 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-PS-04',
      group: 'PRIMARY_SWITCH',
      title: 'night 出现但 primary 仍为 EXECUTION',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'ps04_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'ps04_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsNightRow({ problemId: 'ps04_night', observedAt: OBS_TIMES.T17, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'ps04_wind',
      infeasible: 'ps04_inf',
      night: 'ps04_night',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T17 },
  },

  // ── ATTENTION_ESCALATION (4) ──
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-AE-01',
      group: 'ATTENTION_ESCALATION',
      title: '仅强风 → LOG_ONLY',
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedAttentionLevel: 'LOG_ONLY',
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [obsWindRow({ problemId: 'ae01_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 })],
    lineageOverlay: [{ problemId: 'ae01_wind', weatherEpisodeId: OBS_EPISODE_AM }],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T09 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-AE-02',
      group: 'ATTENTION_ESCALATION',
      title: 'slip → QUEUE',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedAttentionLevel: 'QUEUE',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'ae02_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsSlipRow({ problemId: 'ae02_slip', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, { wind: 'ae02_wind', slip: 'ae02_slip' }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-AE-03',
      group: 'ATTENTION_ESCALATION',
      title: 'infeasible → INTERRUPT',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedAttentionLevel: 'INTERRUPT',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'ae03_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'ae03_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, { wind: 'ae03_wind', infeasible: 'ae03_inf' }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-AE-04',
      group: 'ATTENTION_ESCALATION',
      title: 'critical night → SAFETY_STOP',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedAttentionLevel: 'SAFETY_STOP',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'ae04_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'ae04_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsNightRow({ problemId: 'ae04_night', observedAt: OBS_TIMES.T17, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'ae04_wind',
      infeasible: 'ae04_inf',
      night: 'ae04_night',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T17 },
  },

  // ── RESOLUTION_REPLAY (3) ──
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-RR-01',
      group: 'RESOLUTION_REPLAY',
      title: '相同 episode 重复 polling',
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NO_DUPLICATE_ON_POLL',
    },
    rows: [
      obsWindRow({ problemId: 'rr01_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'rr01_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, { wind: 'rr01_wind', infeasible: 'rr01_inf' }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-RR-02',
      group: 'RESOLUTION_REPLAY',
      title: 'resolved → 移出 visible queue',
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'REMOVE_FROM_VISIBLE',
    },
    rows: [
      obsInfeasibleRow({
        problemId: 'rr02_inf',
        observedAt: OBS_TIMES.T10,
        episodeId: OBS_EPISODE_AM,
        workflowStatus: 'RESOLVED',
      }),
    ],
    lineageOverlay: [{ problemId: 'rr02_inf', weatherEpisodeId: OBS_EPISODE_AM }],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T12 },
  },
  {
    source: 'DETERMINISTIC_DRILL',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'DET-RR-03',
      group: 'RESOLUTION_REPLAY',
      title: 'canonical rebuild 保留底层 problems',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'REBUILD_FROM_CANONICAL',
    },
    rows: [
      obsWindRow({ problemId: 'rr03_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'rr03_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, { wind: 'rr03_wind', infeasible: 'rr03_inf' }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
];

const STAGING_REPLAY_SAMPLES: AttentionShadowObservationCase[] = [
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-01',
      group: 'STAGING_REPLAY',
      title: '单强风 staging',
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [obsWindRow({ problemId: 'stg01_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 })],
    lineageOverlay: [{ problemId: 'stg01_wind', weatherEpisodeId: OBS_EPISODE_AM }],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T09 },
  },
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-02',
      group: 'STAGING_REPLAY',
      title: '强风 + execution slip',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'stg02_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsSlipRow({ problemId: 'stg02_slip', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsInfeasibleRow({ problemId: 'stg02_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'stg02_wind',
      slip: 'stg02_slip',
      infeasible: 'stg02_inf',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-03',
      group: 'STAGING_REPLAY',
      title: '强风 + slip + window miss',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'stg03_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsSlipRow({ problemId: 'stg03_slip', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsWindowMissRow({ problemId: 'stg03_win', observedAt: OBS_TIMES.T11, episodeId: OBS_EPISODE_AM }),
      obsInfeasibleRow({ problemId: 'stg03_inf', observedAt: OBS_TIMES.T11, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'stg03_wind',
      slip: 'stg03_slip',
      infeasible: 'stg03_inf',
      window: 'stg03_win',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T11 },
  },
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-04',
      group: 'STAGING_REPLAY',
      title: '强风 + night driving',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'stg04_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'stg04_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
      obsNightRow({ problemId: 'stg04_night', observedAt: OBS_TIMES.T17, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, {
      wind: 'stg04_wind',
      infeasible: 'stg04_inf',
      night: 'stg04_night',
    }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T17 },
  },
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-05',
      group: 'STAGING_REPLAY',
      title: '无关 road problem',
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'stg05_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsRoadRow({ problemId: 'stg05_road', observedAt: OBS_TIMES.T09 }),
    ],
    lineageOverlay: [{ problemId: 'stg05_wind', weatherEpisodeId: OBS_EPISODE_AM }],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T09 },
  },
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-06',
      group: 'STAGING_REPLAY',
      title: '两个不同 weather episode',
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 2,
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'stg06_am', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsWindRow({ problemId: 'stg06_pm', episodeId: OBS_EPISODE_PM, observedAt: OBS_TIMES.T16 }),
    ],
    lineageOverlay: [
      { problemId: 'stg06_am', weatherEpisodeId: OBS_EPISODE_AM },
      { problemId: 'stg06_pm', weatherEpisodeId: OBS_EPISODE_PM },
    ],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T16 },
  },
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-07',
      group: 'STAGING_REPLAY',
      title: '相同 episode 重复 polling',
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NO_DUPLICATE_ON_POLL',
    },
    rows: [
      obsWindRow({ problemId: 'stg07_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'stg07_inf', observedAt: OBS_TIMES.T10, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, { wind: 'stg07_wind', infeasible: 'stg07_inf' }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-08',
      group: 'STAGING_REPLAY',
      title: 'problem resolved',
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'REMOVE_FROM_VISIBLE',
    },
    rows: [
      obsInfeasibleRow({
        problemId: 'stg08_inf',
        observedAt: OBS_TIMES.T10,
        episodeId: OBS_EPISODE_AM,
        workflowStatus: 'RESOLVED',
      }),
    ],
    lineageOverlay: [{ problemId: 'stg08_inf', weatherEpisodeId: OBS_EPISODE_AM }],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T12 },
  },
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-09',
      group: 'STAGING_REPLAY',
      title: 'missing episode id',
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 2,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
    rows: [
      obsWindRow({ problemId: 'stg09_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'stg09_inf', observedAt: OBS_TIMES.T10 }),
    ],
    lineageOverlay: [{ problemId: 'stg09_wind', weatherEpisodeId: OBS_EPISODE_AM }],
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
  },
  {
    source: 'STAGING_REPLAY',
    tripId: OBS_TRIP_ID,
    spec: {
      sampleId: 'STG-10',
      group: 'STAGING_REPLAY',
      title: 'stale / delayed row',
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
      notes: 'Delayed infeasible row still merges with explicit episode lineage',
    },
    rows: [
      obsWindRow({ problemId: 'stg10_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
      obsInfeasibleRow({ problemId: 'stg10_inf', observedAt: OBS_TIMES.T18, episodeId: OBS_EPISODE_AM }),
    ],
    lineageOverlay: windChainLineage(OBS_EPISODE_AM, { wind: 'stg10_wind', infeasible: 'stg10_inf' }),
    contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T18 },
  },
];

export function buildAttentionShadowObservationCatalog(): AttentionShadowObservationCase[] {
  return [...DETERMINISTIC_SAMPLES, ...STAGING_REPLAY_SAMPLES];
}

export function countObservationSamplesByGroup(): Record<string, number> {
  const catalog = buildAttentionShadowObservationCatalog();
  return catalog.reduce<Record<string, number>>((acc, c) => {
    acc[c.spec.group] = (acc[c.spec.group] ?? 0) + 1;
    return acc;
  }, {});
}
