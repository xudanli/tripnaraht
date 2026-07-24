/**
 * Slice 4 Shadow wiring — deterministic samples S4-S1 … S4-S6 (no DB, no queue mutation).
 */

import { AttentionOrchestrationShadowRunnerService } from '../attention/attention-orchestration-shadow-runner.service';
import { AttentionOrchestrationShadowMetricsService } from '../shadow/attention-orchestration-shadow-metrics.service';
import { AttentionShadowEvidenceWriter } from '../attention/attention-shadow-evidence.writer';
import { mockUnifiedProblemRow } from '../attention/attention-shadow-run.util';

const TRIP_ID = 'trip_attention_shadow_drill';
const SEGMENT = `segment:${TRIP_ID}:drive_day2`;
const EPISODE = 'vedur_ep_wind_20260712_am';
const T0 = '2026-07-12T12:00:00.000Z';
const T1 = '2026-07-12T12:20:00.000Z';
const T2 = '2026-07-12T15:30:00.000Z';

function runner() {
  const metrics = new AttentionOrchestrationShadowMetricsService();
  const svc = new AttentionOrchestrationShadowRunnerService(
    undefined,
    metrics,
    new AttentionShadowEvidenceWriter(),
  );
  return { svc, metrics };
}

describe('attention-shadow-wiring harness', () => {
  const prevFlag = process.env.ATTENTION_ROOT_CAUSE_ORCHESTRATION;

  beforeEach(() => {
    process.env.ATTENTION_ROOT_CAUSE_ORCHESTRATION = '1';
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.ATTENTION_ROOT_CAUSE_ORCHESTRATION;
    else process.env.ATTENTION_ROOT_CAUSE_ORCHESTRATION = prevFlag;
  });

  it('S4-S1: 单强风 → 1 cluster, Primary=WEATHER_STRONG_WIND', () => {
    const { svc } = runner();
    const result = svc.runFromRows({
      tripId: TRIP_ID,
      source: 'DETERMINISTIC_DRILL',
      persistEvidence: false,
      contextOverrides: { routeSegmentId: SEGMENT, weatherEpisodeId: EPISODE, now: T0 },
      rows: [
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_wind',
          semanticKey: 'WEATHER_STRONG_WIND',
          workflowStatus: 'WAITING_DECISION',
          enforcement: 'REQUIRE_CONFIRMATION',
          occurrences: [{ observedAt: T0 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
      ],
      expectation: {
        verdict: 'NO_OP',
        shadowClusterCount: 1,
        shadowVisibleCount: 0,
        rootCauseType: 'WEATHER_STRONG_WIND',
      },
    });

    expect(result.evidence?.shadowClusters).toHaveLength(1);
    expect(result.evidence?.shadowClusters[0].primaryProblemId).toBe('p_wind');
    expect(result.evidence?.comparison.reviewStatus).toBe('AUTO_PASS');
  });

  it('S4-S2: 强风 + Execution Slip → Primary=EXECUTION_SCHEDULE_INFEASIBLE', () => {
    const { svc } = runner();
    const result = svc.runFromRows({
      tripId: TRIP_ID,
      source: 'DETERMINISTIC_DRILL',
      persistEvidence: false,
      contextOverrides: { routeSegmentId: SEGMENT, weatherEpisodeId: EPISODE, now: T2 },
      rows: [
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_wind',
          semanticKey: 'WEATHER_STRONG_WIND',
          workflowStatus: 'WAITING_DECISION',
          occurrences: [{ observedAt: T0 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_infeasible',
          semanticKey: 'EXECUTION_SCHEDULE_INFEASIBLE',
          workflowStatus: 'WAITING_DECISION',
          enforcement: 'REQUIRE_ADJUSTMENT',
          occurrences: [{ observedAt: T1 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
      ],
      lineageOverlay: [
        { problemId: 'p_wind', weatherEpisodeId: EPISODE },
        { problemId: 'p_infeasible', weatherEpisodeId: EPISODE, causedByProblemId: 'p_wind' },
      ],
      expectation: {
        verdict: 'CORRECT_MERGE',
        shadowClusterCount: 1,
        shadowVisibleCount: 1,
        primarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
        rootCauseType: 'WEATHER_STRONG_WIND',
      },
    });

    expect(result.evidence?.shadowPrimaryItems).toHaveLength(1);
    expect(result.evidence?.shadowPrimaryItems[0].primarySemanticCapability).toBe(
      'EXECUTION_SCHEDULE_INFEASIBLE',
    );
    expect(result.evidence?.shadowClusters[0].rootCauseType).toBe('WEATHER_STRONG_WIND');
  });

  it('S4-S3: 加入 Night Driving → 仍 1 Primary Item, Attention 升级', () => {
    const { svc } = runner();
    const result = svc.runFromRows({
      tripId: TRIP_ID,
      source: 'DETERMINISTIC_DRILL',
      persistEvidence: false,
      contextOverrides: { routeSegmentId: SEGMENT, weatherEpisodeId: EPISODE, now: T2 },
      rows: [
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_wind',
          semanticKey: 'WEATHER_STRONG_WIND',
          workflowStatus: 'WAITING_DECISION',
          occurrences: [{ observedAt: T0 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_infeasible',
          semanticKey: 'EXECUTION_SCHEDULE_INFEASIBLE',
          workflowStatus: 'WAITING_DECISION',
          enforcement: 'REQUIRE_ADJUSTMENT',
          occurrences: [{ observedAt: T1 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_night',
          semanticKey: 'NIGHT_DRIVING_RISK',
          workflowStatus: 'WAITING_DECISION',
          enforcement: 'BLOCK',
          occurrences: [{ observedAt: T2 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
      ],
      lineageOverlay: [
        { problemId: 'p_wind', weatherEpisodeId: EPISODE },
        { problemId: 'p_infeasible', weatherEpisodeId: EPISODE, causedByProblemId: 'p_wind' },
        { problemId: 'p_night', weatherEpisodeId: EPISODE, causedByProblemId: 'p_infeasible' },
      ],
      expectation: {
        verdict: 'CORRECT_MERGE',
        shadowClusterCount: 1,
        shadowVisibleCount: 1,
        primarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      },
    });

    expect(result.evidence?.shadowPrimaryItems).toHaveLength(1);
    const level = result.evidence?.shadowClusters[0].attentionLevel;
    expect(['INTERRUPT', 'SAFETY_STOP']).toContain(level);
  });

  it('S4-S4: 无关 Road Problem → 不得并入强风 cluster', () => {
    const { svc } = runner();
    const result = svc.runFromRows({
      tripId: TRIP_ID,
      source: 'DETERMINISTIC_DRILL',
      persistEvidence: false,
      contextOverrides: { routeSegmentId: SEGMENT, weatherEpisodeId: EPISODE, now: T0 },
      rows: [
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_wind',
          semanticKey: 'WEATHER_STRONG_WIND',
          workflowStatus: 'WAITING_DECISION',
          occurrences: [{ observedAt: T0 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_road',
          semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
          workflowStatus: 'WAITING_DECISION',
          enforcement: 'BLOCK',
          occurrences: [{ observedAt: T0 }],
          scope: {
            tripId: TRIP_ID,
            routeSegmentIds: [`segment:${TRIP_ID}:drive_f208`],
          },
        }),
      ],
      expectation: {
        verdict: 'CORRECT_SEPARATION',
        shadowClusterCount: 1,
        shadowVisibleCount: 0,
      },
    });

    expect(result.evidence?.comparison.verdict).toBe('CORRECT_SEPARATION');
    expect(result.evidence?.shadowClusters).toHaveLength(1);
    expect(result.evidence?.shadowClusters[0].relatedProblemIds).not.toContain('p_road');
  });

  it('S4-S5: 重复 Polling → cluster / visible 不增加', () => {
    const { svc } = runner();
    const row = mockUnifiedProblemRow({
      tripId: TRIP_ID,
      problemId: 'p_wind',
      semanticKey: 'WEATHER_STRONG_WIND',
      workflowStatus: 'WAITING_DECISION',
      occurrences: [{ observedAt: T0 }],
      scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
    });

    const first = svc.projectFromRows({
      tripId: TRIP_ID,
      rows: [row],
      source: 'DETERMINISTIC_DRILL',
      contextOverrides: { routeSegmentId: SEGMENT, weatherEpisodeId: EPISODE, now: T0 },
    });

    const second = svc.projectFromRows({
      tripId: TRIP_ID,
      rows: [
        mockUnifiedProblemRow({
          ...row,
          occurrences: [{ observedAt: T1 }],
        }),
      ],
      source: 'DETERMINISTIC_DRILL',
      contextOverrides: { routeSegmentId: SEGMENT, weatherEpisodeId: EPISODE, now: T1 },
    });

    expect(first.shadowClusters).toHaveLength(1);
    expect(second.shadowClusters).toHaveLength(1);
    expect(first.shadowPrimaryItems.length).toBe(second.shadowPrimaryItems.length);
  });

  it('S4-S6: Resolved → cluster 退出 visible queue，底层 input 仍保留', () => {
    const { svc } = runner();
    const open = svc.projectFromRows({
      tripId: TRIP_ID,
      rows: [
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_infeasible',
          semanticKey: 'EXECUTION_SCHEDULE_INFEASIBLE',
          workflowStatus: 'WAITING_DECISION',
          enforcement: 'REQUIRE_ADJUSTMENT',
          occurrences: [{ observedAt: T1 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
      ],
      source: 'DETERMINISTIC_DRILL',
      contextOverrides: { routeSegmentId: SEGMENT, weatherEpisodeId: EPISODE, now: T1 },
    });
    expect(open.shadowPrimaryItems.length).toBe(1);

    const resolved = svc.projectFromRows({
      tripId: TRIP_ID,
      rows: [
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_infeasible',
          semanticKey: 'EXECUTION_SCHEDULE_INFEASIBLE',
          workflowStatus: 'RESOLVED',
          enforcement: 'REQUIRE_ADJUSTMENT',
          occurrences: [{ observedAt: T1 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
      ],
      source: 'DETERMINISTIC_DRILL',
      contextOverrides: { routeSegmentId: SEGMENT, weatherEpisodeId: EPISODE, now: T2 },
    });

    expect(resolved.shadowPrimaryItems).toHaveLength(0);
    expect(resolved.inputProblems).toHaveLength(1);
  });

  it('records shadow metrics on deterministic run', () => {
    const { svc, metrics } = runner();
    svc.runFromRows({
      tripId: TRIP_ID,
      source: 'DETERMINISTIC_DRILL',
      persistEvidence: false,
      contextOverrides: { routeSegmentId: SEGMENT, weatherEpisodeId: EPISODE, now: T0 },
      rows: [
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_wind',
          semanticKey: 'WEATHER_STRONG_WIND',
          workflowStatus: 'WAITING_DECISION',
          occurrences: [{ observedAt: T0 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
        mockUnifiedProblemRow({
          tripId: TRIP_ID,
          problemId: 'p_infeasible',
          semanticKey: 'EXECUTION_SCHEDULE_INFEASIBLE',
          workflowStatus: 'WAITING_DECISION',
          enforcement: 'REQUIRE_ADJUSTMENT',
          occurrences: [{ observedAt: T1 }],
          scope: { tripId: TRIP_ID, routeSegmentIds: [SEGMENT] },
        }),
      ],
    });

    const snap = metrics.snapshot();
    expect(snap.runs).toBe(1);
    expect(snap.inputProblemCount).toBe(2);
  });
});
