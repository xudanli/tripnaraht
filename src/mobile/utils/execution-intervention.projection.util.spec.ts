import {
  isScheduleTightnessIssue,
  projectConsumerToIntervention,
  resolveInterventionType,
  resolveInterventionPriority,
} from './execution-intervention.projection.util';
import type { ConsumerDecisionItem } from '../../trips/travel-status/types/travel-status.types';
import type { UnifiedDecisionProblemListItem } from '../../decision-runtime/gateway/contracts/unified-decision-ui.types';

function baseConsumer(overrides: Partial<ConsumerDecisionItem> = {}): ConsumerDecisionItem {
  return {
    schemaId: 'tripnara.consumer_decision_item@v1',
    problemId: 'p1',
    headline: '测试项',
    impact: '影响安排',
    explanation: '原因说明',
    severity: 'CONFLICT',
    actions: {
      acceptRecommended: { enabled: true, actionId: 'act-1' },
      keepOriginal: { enabled: true, actionId: 'keep-1' },
      viewAlternatives: { enabled: true, count: 2 },
      defer: { enabled: true, actionId: 'defer-1' },
    },
    ...overrides,
  };
}

function baseListItem(
  overrides: Partial<UnifiedDecisionProblemListItem> = {},
): UnifiedDecisionProblemListItem {
  return {
    problemId: 'p1',
    semanticKey: 'travel',
    instanceKey: 'i1',
    type: 'CONSTRAINT',
    dimension: 'SCHEDULE',
    enforcement: 'REQUIRE_ADJUSTMENT',
    phase: 'EXECUTION',
    affectsPlan: true,
    workflowStatus: 'OPEN',
    executionStatus: 'NOT_STARTED',
    title: '测试项',
    summary: '摘要',
    scope: { tripId: 't1' },
    evidenceSummary: { count: 0, freshness: 'UNKNOWN' },
    actionability: { requiresAction: true, allowedActions: [] },
    occurrenceCount: 1,
    detectors: [],
    origin: { authority: 'CANONICAL', primaryDetector: 'test' },
    ...overrides,
  };
}

describe('execution-intervention.projection.util', () => {
  it('maps same_day_travel to DYNAMIC_REPLAN not execution alert', () => {
    const item = baseListItem({ semanticKey: 'same_day_travel:day1' });
    expect(isScheduleTightnessIssue(item)).toBe(true);
    expect(resolveInterventionType(item, baseConsumer({ headline: '同日交通偏紧' }))).toBe(
      'DYNAMIC_REPLAN',
    );
  });

  it('maps safety semantic keys to SAFETY_INTERVENTION', () => {
    const item = baseListItem({ semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:evt' });
    expect(resolveInterventionType(item, baseConsumer())).toBe('SAFETY_INTERVENTION');
    expect(resolveInterventionPriority('SAFETY_INTERVENTION', item, baseConsumer({ severity: 'BLOCK' }))).toBe(
      'CRITICAL',
    );
  });

  it('maps prep keywords to EXECUTION_PREPARATION', () => {
    expect(
      resolveInterventionType(
        undefined,
        baseConsumer({ headline: '检查装备与补水', severity: 'OPTIMIZE' }),
      ),
    ).toBe('EXECUTION_PREPARATION');
  });

  it('projects consumer item with actions and decisionProblemId', () => {
    const result = projectConsumerToIntervention({
      consumer: baseConsumer({ headline: '缩短冰川徒步时长', explanation: '安全原因' }),
      listItem: baseListItem({
        semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:x',
        causalStoryView: {
          traceId: 'ct_1',
          worldStateVersion: 'ws_1',
          headline: '强风影响冰川徒步',
          assessment: '下午风力超标，户外段风险升高',
          chain: [
            {
              nodeId: 'n1',
              type: 'WORLD_CHANGE',
              title: '天气变化',
              description: '阵风 27 m/s',
            },
            {
              nodeId: 'n2',
              type: 'IMPACT',
              title: '影响活动',
              description: '冰川徒步体验',
            },
            {
              nodeId: 'n3',
              type: 'CONFLICT',
              title: '安全冲突',
              description: '原方案不满足安全条件',
            },
            {
              nodeId: 'n4',
              type: 'OPTION',
              title: '建议',
              description: '缩短至 90 分钟',
            },
          ],
          technicalTraceRef: 'ct_1',
        },
        causalTraceRef: {
          traceId: 'ct_1',
          worldStateVersion: 'ws_1',
          protocolVersion: 'causal-trace-v1',
        },
      }),
      tripId: 't1',
      memberNamesById: new Map([['u1', 'Patrick']]),
      activityTitleById: new Map([['a1', '冰川徒步']]),
      actionDeadline: '2026-07-08T13:30:00.000Z',
    });
    expect(result.type).toBe('SAFETY_INTERVENTION');
    expect(result.causalChain.nodes).toHaveLength(4);
    expect(result.causalChain.nodes[0]?.type).toBe('WORLD_CHANGE');
    expect(result.causalTraceRef?.traceId).toBe('ct_1');
    expect(result.actions.primary.label).toBe('确认调整');
    expect(result.decisionProblemId).toBe('p1');
    expect(result.actions.defer?.label).toContain('13:30');
  });

  it('builds fallback causal chain when story view is missing', () => {
    const result = projectConsumerToIntervention({
      consumer: baseConsumer({ headline: '确认集合点', explanation: '成员位置未同步' }),
      listItem: baseListItem({ dimension: 'TEAM_FIT' }),
      tripId: 't1',
      memberNamesById: new Map([['u1', 'Patrick']]),
      activityTitleById: new Map(),
    });
    expect(result.causalChain.nodes.map((n) => n.type)).toEqual([
      'WORLD_CHANGE',
      'IMPACT',
      'CONFLICT',
      'OPTION',
    ]);
    expect(result.causalChain.assessment).toBe('成员位置未同步');
    const conflictDesc = result.causalChain.nodes.find((n) => n.type === 'CONFLICT')?.description;
    expect(conflictDesc).not.toBe(result.causalChain.assessment);
    expect(conflictDesc).toBe('团队状态与当前安排存在偏差');
  });

  it('splits short title and causal headline for schedule tightness', () => {
    const result = projectConsumerToIntervention({
      consumer: baseConsumer({
        headline: '蓝湖温泉 → 哈尔格林姆斯教堂：强风导致预约高风险',
        explanation:
          'Day 1 · 蓝湖温泉 → 哈尔格林姆斯教堂约 38.6 km，路面约 47 分钟，首项开始时间偏紧',
        impact: '影响第 1 天的安排',
        recommendation: {
          title: '延后蓝湖出发 30 分钟',
          summary: '保留预约窗口',
          keeps: ['预约'],
          costs: ['停留缩短'],
          recommendedActionId: 'act-1',
        },
      }),
      listItem: baseListItem({
        semanticKey: 'same_day_travel:day1',
        title: '蓝湖温泉 → 哈尔格林姆斯教堂：强风导致预约高风险',
        impactScopeView: {
          arrangements: [
            { dayIndex: 1, label: '蓝湖温泉 → 哈尔格林姆斯教堂' },
          ],
        },
      }),
      tripId: 't1',
      memberNamesById: new Map(),
      activityTitleById: new Map(),
    });
    expect(result.title).toBe('同日交通偏紧');
    expect(result.causalChain.headline).toContain('蓝湖温泉');
    expect(result.reason).toContain('38.6 km');
    expect(result.recommendedAction).toBe('延后蓝湖出发 30 分钟');
    expect(result.causalChain.nodes.find((n) => n.type === 'OPTION')?.description).toBe(
      '延后蓝湖出发 30 分钟',
    );
    expect(result.decisionProblemId).toBe('p1');
  });
});
