/**
 * Staging real-DB replay scenario catalog — Canary trip state capture slots (A–F + authority edge cases).
 *
 * Each scenario is a read-only `runForTrip` against the live Unified Read Model.
 * Ops prepares trip state per `setupHint` before capture; mismatch → AUTO_PENDING_HUMAN.
 */

import type { StagingReplayScenarioSpec } from './attention-shadow-staging-replay.util';

export const ATTENTION_SHADOW_CANARY_TRIP_ID = 'c0c77777-7777-4777-8777-777777777777';

export const STAGING_REAL_DB_REPLAY_CATALOG: StagingReplayScenarioSpec[] = [
  {
    scenarioId: 'STG-REPLAY-A',
    title: '单天气问题 — WEATHER_STRONG_WIND',
    setupHint:
      'Canary trip 仅保留 1 条 OPEN 的 WEATHER_STRONG_WIND（含 weatherEpisodeId + routeSegmentId）。无 execution / road / night。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'WEATHER_STRONG_WIND',
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'NONE',
    },
  },
  {
    scenarioId: 'STG-REPLAY-B',
    title: '天气 + 执行偏差 — Primary 切换',
    setupHint:
      '同一 weather episode：WEATHER_STRONG_WIND + EXECUTION_SCHEDULE_INFEASIBLE（causedBy 或 lineage 指向 wind）。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedAttentionLevel: 'QUEUE',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
  },
  {
    scenarioId: 'STG-REPLAY-C',
    title: '加入夜间驾驶 — cluster 不变，attention 升级',
    setupHint:
      '在 B 基础上加入 NIGHT_DRIVING_RISK（同 episode lineage）。cluster 数保持 1。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedAttentionLevel: 'INTERRUPT',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
  },
  {
    scenarioId: 'STG-REPLAY-D',
    title: '无关 Road Problem — 不得 false merge',
    setupHint:
      'C 状态基础上加入独立 ROAD_* OPEN problem（无 weather episode / 无 causedBy 链）。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedAttentionLevel: 'INTERRUPT',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
  },
  {
    scenarioId: 'STG-REPLAY-E',
    title: '重复 polling — 不得 duplicate cluster / visible item',
    setupHint:
      '保持 D 状态不变；本 scenario 连续执行两次 runForTrip，第二次 cluster / visible 计数不得增加。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NO_DUPLICATE_ON_POLL',
    },
  },
  {
    scenarioId: 'STG-REPLAY-F',
    title: '全部 resolved — visible 移除，underlying 保留',
    setupHint:
      '将 wind chain 相关 problems 标 RESOLVED（或 ACKNOWLEDGED 按产品定义）；Read Model 仍返回 underlying rows。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'NO_OP',
      expectedClusterCount: 1,
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'REMOVE_FROM_VISIBLE',
    },
  },
  {
    scenarioId: 'STG-REPLAY-07',
    title: '双 weather episode — 不得跨 episode merge',
    setupHint:
      '同一 trip 上 AM / PM 两个独立 weatherEpisodeId 的 WEATHER_STRONG_WIND。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 2,
      expectedVisibleItemCount: 0,
      expectedResolutionBehavior: 'NONE',
    },
  },
  {
    scenarioId: 'STG-REPLAY-08',
    title: 'missing episode — 保守分离',
    setupHint:
      'WEATHER_STRONG_WIND 有 episode；EXECUTION_SCHEDULE_INFEASIBLE 无 episode / 无 causedBy。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'CORRECT_SEPARATION',
      expectedClusterCount: 2,
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
  },
  {
    scenarioId: 'STG-REPLAY-09',
    title: 'stale / delayed row — 仍应 merge',
    setupHint:
      '同 episode 的 infeasible row observedAt 明显滞后于 wind，但 lineage 完整。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
  },
  {
    scenarioId: 'STG-REPLAY-10',
    title: '完整 wind → slip → infeasible 链',
    setupHint:
      '实库完整因果链：WEATHER_STRONG_WIND + EXECUTION_SLIP + EXECUTION_SCHEDULE_INFEASIBLE（同 episode）。',
    tripId: ATTENTION_SHADOW_CANARY_TRIP_ID,
    expectation: {
      expectedVerdict: 'CORRECT_MERGE',
      expectedClusterCount: 1,
      expectedPrimarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      expectedAttentionLevel: 'INTERRUPT',
      expectedVisibleItemCount: 1,
      expectedResolutionBehavior: 'NONE',
    },
  },
];

export function getStagingReplayScenario(id: string): StagingReplayScenarioSpec | undefined {
  return STAGING_REAL_DB_REPLAY_CATALOG.find((s) => s.scenarioId === id);
}

export function listStagingReplayScenarioIds(): string[] {
  return STAGING_REAL_DB_REPLAY_CATALOG.map((s) => s.scenarioId);
}
