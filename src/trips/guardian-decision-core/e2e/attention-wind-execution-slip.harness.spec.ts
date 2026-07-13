/**
 * Slice 4 — Attention & Root-Cause Orchestration harness (S4-A1 … S4-A10).
 */

import { AttentionOrchestrationRuntime, shouldMergeProblems } from '../attention/attention-orchestration.runtime';
import { buildWeatherStrongWindRootCauseKey } from '../attention/build-weather-strong-wind-root-cause-key.util';
import { isQueueVisible } from '../attention/attention-admission.util';
import { projectUnifiedDecisionItem } from '../attention/unified-decision-item.projection';
import {
  cloneProblem,
  harnessAttentionContext,
  HARNESS_NOW,
  HARNESS_NOW_LATER,
  HARNESS_NOW_WINDOW,
  HARNESS_ROUTE_SEGMENT_ID,
  HARNESS_WEATHER_EPISODE_ID,
  PROBLEM_EXEC_SLIP,
  PROBLEM_NIGHT_DRIVING,
  PROBLEM_ROAD_CLOSED,
  PROBLEM_SCHEDULE_INFEASIBLE,
  PROBLEM_UNRELATED_WIND,
  PROBLEM_WEATHER_WIND,
  PROBLEM_WINDOW_MISSED,
} from './attention-wind-execution-slip.harness.util';

describe('attention-wind-execution-slip harness', () => {
  const ctx = harnessAttentionContext();

  function runtime(at?: string) {
    return new AttentionOrchestrationRuntime({ now: at ?? HARNESS_NOW });
  }

  it('S4-A1: 强风单独出现 → 1 cluster', () => {
    const rt = runtime();
    const result = rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    expect(result.created).toBe(true);
    expect(rt.store.listByTripId(ctx.tripId)).toHaveLength(1);
    expect(result.cluster.rootCauseType).toBe('WEATHER_STRONG_WIND');
    expect(result.cluster.primaryProblemId).toBe(PROBLEM_WEATHER_WIND.problemId);
  });

  it('S4-A2: 后续产生 execution slip → 更新原 cluster', () => {
    const rt = runtime();
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    const second = rt.ingestProblem(
      cloneProblem(PROBLEM_EXEC_SLIP, { detectedAt: HARNESS_NOW_LATER }),
      ctx,
    );
    expect(second.created).toBe(false);
    expect(rt.store.listByTripId(ctx.tripId)).toHaveLength(1);
    expect(second.cluster.relatedProblemIds).toContain(PROBLEM_EXEC_SLIP.problemId);
    expect(second.cluster.primaryProblemId).toBe(PROBLEM_WEATHER_WIND.problemId);
  });

  it('S4-A3: 后续时间窗失效 → Primary 升级为 EXECUTION_SCHEDULE_INFEASIBLE', () => {
    const rt = runtime(HARNESS_NOW);
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    rt.ingestProblem(PROBLEM_EXEC_SLIP, ctx);
    const third = rt.ingestProblem(PROBLEM_SCHEDULE_INFEASIBLE, ctx);
    expect(third.primaryChanged).toBe(true);
    expect(third.cluster.primaryProblemId).toBe(PROBLEM_SCHEDULE_INFEASIBLE.problemId);
  });

  it('S4-A4: 相同事件重复进入 → 不新增 cluster', () => {
    const rt = runtime();
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    const dup = rt.ingestProblem(
      cloneProblem(PROBLEM_WEATHER_WIND, {
        detectedAt: HARNESS_NOW_LATER,
      }),
      ctx,
    );
    expect(dup.created).toBe(false);
    expect(rt.store.listByTripId(ctx.tripId)).toHaveLength(1);
  });

  it('S4-A5: 严重度 QUEUE → INTERRUPT → 允许 re-notify', () => {
    const rt = runtime(HARNESS_NOW);
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    const before = rt.ingestProblem(PROBLEM_EXEC_SLIP, ctx);
    expect(isQueueVisible(before.cluster.attentionLevel)).toBe(true);

    const after = rt.ingestProblem(
      cloneProblem(PROBLEM_SCHEDULE_INFEASIBLE, { detectedAt: HARNESS_NOW_WINDOW }),
      ctx,
    );
    expect(after.attentionEscalated).toBe(true);
    expect(after.cluster.attentionLevel).toBe('INTERRUPT');
    expect(after.shouldNotify).toBe(true);
  });

  it('S4-A6: 用户确认方案 → 不再重复提醒', () => {
    const rt = runtime(HARNESS_NOW);
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    rt.ingestProblem(PROBLEM_SCHEDULE_INFEASIBLE, ctx);
    const clusterId = rt.store.listAll()[0].clusterId;
    rt.acknowledgeCluster(clusterId, HARNESS_NOW_LATER);

    const again = rt.ingestProblem(
      cloneProblem(PROBLEM_WINDOW_MISSED, { detectedAt: HARNESS_NOW_WINDOW }),
      ctx,
    );
    expect(again.shouldNotify).toBe(false);
    expect(again.cluster.status).toBe('ACKNOWLEDGED');
  });

  it('S4-A7: Problem 全部 resolved → cluster 移出可见队列', () => {
    const rt = runtime();
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    rt.ingestProblem(PROBLEM_SCHEDULE_INFEASIBLE, ctx);
    const clusterId = rt.store.listAll()[0].clusterId;
    rt.resolveCluster(clusterId, HARNESS_NOW_LATER);
    expect(rt.listVisiblePrimaryItems()).toHaveLength(0);
  });

  it('S4-A8: 两个无关根因 → 保留两个 cluster', () => {
    const rt = runtime();
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    rt.ingestProblem(PROBLEM_UNRELATED_WIND, ctx);
    expect(rt.store.listByTripId(ctx.tripId)).toHaveLength(2);
  });

  it('S4-A9: Weather 与 Road 无因果 → 不合并', () => {
    expect(
      shouldMergeProblems(PROBLEM_WEATHER_WIND, PROBLEM_ROAD_CLOSED, ctx),
    ).toBe(false);

    const rt = runtime();
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    rt.ingestProblem(PROBLEM_ROAD_CLOSED, ctx);
    expect(rt.store.listByTripId(ctx.tripId)).toHaveLength(2);
  });

  it('S4-A10: 新 Evidence 语义不变 → 仅更新 lastUpdatedAt', () => {
    const rt = runtime(HARNESS_NOW);
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    rt.ingestProblem(PROBLEM_EXEC_SLIP, ctx);
    const before = rt.store.listAll()[0];

    const refresh = rt.ingestProblem(
      cloneProblem(PROBLEM_EXEC_SLIP, {
        detectedAt: '2026-07-12T12:05:00.000Z',
      }),
      harnessAttentionContext({ now: HARNESS_NOW_LATER }),
    );

    expect(refresh.created).toBe(false);
    expect(refresh.primaryChanged).toBe(false);
    expect(refresh.attentionEscalated).toBe(false);
    expect(refresh.shouldNotify).toBe(false);
    expect(refresh.cluster.lastUpdatedAt).not.toBe(before.lastUpdatedAt);
    expect(refresh.cluster.primaryProblemId).toBe(before.primaryProblemId);
  });

  it('projects a single Primary Item for the wind → infeasible chain', () => {
    const rt = runtime(HARNESS_NOW);
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    rt.ingestProblem(PROBLEM_EXEC_SLIP, ctx);
    rt.ingestProblem(PROBLEM_SCHEDULE_INFEASIBLE, ctx);
    rt.ingestProblem(PROBLEM_NIGHT_DRIVING, ctx);

    const items = rt.listVisiblePrimaryItems();
    expect(items).toHaveLength(1);
    expect(items[0].primarySemanticCapability).toBe('EXECUTION_SCHEDULE_INFEASIBLE');
    expect(items[0].headline).toContain('强风');
    expect(items[0].relatedEffects.length).toBeGreaterThan(0);
    expect(items[0].confirmationEntry.problemId).toBe(
      PROBLEM_SCHEDULE_INFEASIBLE.problemId,
    );
  });

  it('stable rootCauseKey excludes observedAt', () => {
    const key = buildWeatherStrongWindRootCauseKey({
      tripId: ctx.tripId,
      routeSegmentId: HARNESS_ROUTE_SEGMENT_ID,
      weatherEpisodeId: HARNESS_WEATHER_EPISODE_ID,
    });
    expect(key).toBe(
      `weather:strong-wind:${ctx.tripId}:${HARNESS_ROUTE_SEGMENT_ID}:${HARNESS_WEATHER_EPISODE_ID}`,
    );
    expect(key).not.toContain('observed');
    expect(key).not.toContain('trigger');
  });

  it('underlying canonical problems are preserved in runtime snapshot', () => {
    const rt = runtime();
    rt.ingestProblem(PROBLEM_WEATHER_WIND, ctx);
    rt.ingestProblem(PROBLEM_SCHEDULE_INFEASIBLE, ctx);
    expect(rt.snapshotProblems()).toHaveLength(2);
    expect(rt.listVisiblePrimaryItems()).toHaveLength(1);

    const item = projectUnifiedDecisionItem({
      cluster: rt.store.listAll()[0],
      problems: rt.snapshotProblems(),
    });
    expect(item).not.toBeNull();
    expect(item!.relatedEffects.some((e) => e.problemId === PROBLEM_WEATHER_WIND.problemId)).toBe(
      true,
    );
  });
});
