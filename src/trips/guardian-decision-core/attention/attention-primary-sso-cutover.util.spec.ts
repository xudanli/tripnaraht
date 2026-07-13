import {
  buildAttentionPrimarySsoCutoverPlan,
  extractSemanticFromAnchorProblemId,
  filterInterventionsForPrimarySso,
  shouldSuppressInterventionForPrimarySso,
} from './attention-primary-sso-cutover.util';
import type { ExecutionInterventionDto } from '../../../mobile/dto/mobile-execution.types';

describe('attention-primary-sso-cutover.util', () => {
  const tripId = 'c0c77777-7777-4777-8777-777777777777';

  it('builds suppressed set from related effects and cluster members', () => {
    const plan = buildAttentionPrimarySsoCutoverPlan(tripId, {
      shadowPrimaryItems: [
        {
          clusterId: 'cluster_wind',
          tripId,
          primaryProblemId: 'stg_attn_infeasible',
          primarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
          headline: '强风导致今天的原计划无法按时完成',
          explanation: '预计到达下一活动时间已超过最晚入场时间',
          causalStory: [],
          attentionLevel: 'INTERRUPT',
          status: 'OPEN',
          relatedEffects: [
            { problemId: 'stg_attn_wind', semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED', label: '强风' },
            { problemId: 'stg_attn_slip', semanticCapability: 'EXECUTION_SLIP', label: '执行偏差' },
          ],
          confirmationEntry: { problemId: 'stg_attn_infeasible', actionRoute: 'decision-queue' },
          firstObservedAt: '2026-07-12T10:00:00.000Z',
          lastUpdatedAt: '2026-07-12T10:00:00.000Z',
        },
      ],
      shadowClusters: [
        {
          clusterId: 'cluster_wind',
          tripId,
          rootCauseKey: 'weather:episode:1',
          rootCauseType: 'WEATHER_STRONG_WIND',
          primaryProblemId: 'stg_attn_infeasible',
          relatedProblemIds: ['stg_attn_wind', 'stg_attn_slip', 'stg_attn_night'],
          causalChain: [],
          attentionLevel: 'INTERRUPT',
          status: 'OPEN',
          firstObservedAt: '2026-07-12T10:00:00.000Z',
          lastUpdatedAt: '2026-07-12T10:00:00.000Z',
        },
      ],
      legacyVisible: [],
    });

    expect(plan.visiblePrimaryProblemIds.has('stg_attn_infeasible')).toBe(true);
    expect(plan.suppressedProblemIds.has('stg_attn_wind')).toBe(true);
    expect(plan.suppressedProblemIds.has('stg_attn_slip')).toBe(true);
    expect(plan.suppressedProblemIds.has('stg_attn_night')).toBe(true);
  });

  it('filters merged queue items and keeps unrelated problems', () => {
    const plan = buildAttentionPrimarySsoCutoverPlan(tripId, {
      shadowPrimaryItems: [
        {
          clusterId: 'cluster_wind',
          tripId,
          primaryProblemId: 'stg_attn_wind',
          primarySemanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
          headline: '强风天气影响当前行程',
          explanation: '部分活动可能无法按原计划进行',
          causalStory: [],
          attentionLevel: 'QUEUE',
          status: 'OPEN',
          relatedEffects: [
            { problemId: 'stg_attn_slip', semanticCapability: 'EXECUTION_SLIP', label: '执行偏差' },
          ],
          confirmationEntry: { problemId: 'stg_attn_wind', actionRoute: 'decision-queue' },
          firstObservedAt: '2026-07-12T10:00:00.000Z',
          lastUpdatedAt: '2026-07-12T10:00:00.000Z',
        },
      ],
      shadowClusters: [],
      legacyVisible: [],
    });

    const items = [
      { id: 'stg_attn_wind', decisionProblemId: 'stg_attn_wind' },
      { id: 'stg_attn_slip', decisionProblemId: 'stg_attn_slip' },
      { id: 'dp_other', decisionProblemId: 'dp_other' },
    ] as ExecutionInterventionDto[];

    const filtered = filterInterventionsForPrimarySso(items, plan);
    expect(filtered.map((i) => i.id)).toEqual(['stg_attn_wind', 'dp_other']);
    expect(shouldSuppressInterventionForPrimarySso(items[1], plan)).toBe(true);
  });

  it('suppresses canonical duplicate with same semantic as visible primary', () => {
    const plan = buildAttentionPrimarySsoCutoverPlan(tripId, {
      shadowPrimaryItems: [
        {
          clusterId: 'cluster_wind',
          tripId,
          primaryProblemId: 'stg_attn_infeasible',
          primarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
          headline: '强风导致今天的原计划无法按时完成',
          explanation: '预计到达下一活动时间已超过最晚入场时间',
          causalStory: [],
          attentionLevel: 'INTERRUPT',
          status: 'OPEN',
          relatedEffects: [],
          confirmationEntry: { problemId: 'stg_attn_infeasible', actionRoute: 'decision-queue' },
          firstObservedAt: '2026-07-12T10:00:00.000Z',
          lastUpdatedAt: '2026-07-12T10:00:00.000Z',
        },
      ],
      shadowClusters: [],
      legacyVisible: [
        {
          problemId: 'stg_attn_infeasible',
          semanticKey: 'EXECUTION_SCHEDULE_INFEASIBLE',
          title: 'staging',
          workflowStatus: 'OPEN',
        },
        {
          problemId: 'dp_anchor:environment:EXECUTION_SCHEDULE_INFEASIBLE:poi_a',
          semanticKey: 'EXECUTION_SCHEDULE_INFEASIBLE',
          title: 'canonical',
          workflowStatus: 'OPEN',
        },
      ],
    });

    const items = [
      { id: 'stg_attn_infeasible', decisionProblemId: 'stg_attn_infeasible' },
      {
        id: 'dp_anchor',
        decisionProblemId: 'dp_anchor:environment:EXECUTION_SCHEDULE_INFEASIBLE:poi_a',
      },
      { id: 'dp_time', decisionProblemId: 'dp_id:issue-time-conflict' },
    ] as ExecutionInterventionDto[];

    const semanticByProblemId = new Map([
      ['stg_attn_infeasible', 'EXECUTION_SCHEDULE_INFEASIBLE'],
      ['dp_anchor:environment:EXECUTION_SCHEDULE_INFEASIBLE:poi_a', 'EXECUTION_SCHEDULE_INFEASIBLE'],
      ['dp_id:issue-time-conflict', 'TIME_CONFLICT'],
    ]);

    const filtered = filterInterventionsForPrimarySso(items, plan, semanticByProblemId);
    expect(filtered.map((i) => i.id)).toEqual(['stg_attn_infeasible']);
  });

  it('folds time-conflict under EXECUTION_SCHEDULE_INFEASIBLE primary but drops meal window', () => {
    const plan = buildAttentionPrimarySsoCutoverPlan(tripId, {
      shadowPrimaryItems: [
        {
          clusterId: 'cluster_infeasible',
          tripId,
          primaryProblemId: 'stg_attn_infeasible',
          primarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
          headline: '强风导致今天的原计划无法按时完成',
          explanation: '预计到达下一活动时间已超过最晚入场时间',
          causalStory: [],
          attentionLevel: 'INTERRUPT',
          status: 'OPEN',
          relatedEffects: [],
          confirmationEntry: { problemId: 'stg_attn_infeasible', actionRoute: 'decision-queue' },
          firstObservedAt: '2026-07-12T10:00:00.000Z',
          lastUpdatedAt: '2026-07-12T10:00:00.000Z',
        },
      ],
      shadowClusters: [],
      legacyVisible: [],
    });

    const items = [
      {
        id: 'stg_attn_infeasible',
        decisionProblemId: 'stg_attn_infeasible',
        title: '当前行程无法按原计划执行',
        reason: '执行偏差 · urgency HIGH',
      },
      {
        id: 'dp_time',
        decisionProblemId: 'dp_id:issue-time-conflict-trip',
        title: '时间冲突',
        reason: '活动 A 与 B 时间重叠 60 分钟',
      },
      {
        id: 'dp_meal',
        decisionProblemId: 'dp_id:plan_object_meal_late_arrival_po_x_meal_windo',
        title: '午餐窗冲突',
        reason: '预计 POI C 结束于 19:00，晚于午餐窗 12:00',
      },
    ] as ExecutionInterventionDto[];

    const filtered = filterInterventionsForPrimarySso(items, plan);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('stg_attn_infeasible');
    expect(filtered[0]?.reason).toContain('时间重叠');
    expect(filtered[0]?.reason).not.toContain('午餐窗');
  });

  it('extracts semantic from dp_anchor problem id', () => {
    expect(
      extractSemanticFromAnchorProblemId(
        'dp_anchor:environment:EXECUTION_SCHEDULE_INFEASIBLE:c0c77777-7777-4777-8777-777777777631',
      ),
    ).toBe('EXECUTION_SCHEDULE_INFEASIBLE');
  });
});
