import { selectDecisionSpaceInsight } from './decision-space-insight.selector';
import type {
  UnifiedDecisionOptionsView,
  UnifiedDecisionProblemListItem,
} from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';

function glacierProblem(overrides?: Partial<UnifiedDecisionProblemListItem>): UnifiedDecisionProblemListItem {
  return {
    problemId: 'dc_glacier_trip1',
    semanticKey: 'OPPORTUNITY.GLACIER_EXPERIENCE',
    instanceKey: 'dc_glacier_trip1',
    type: 'PREFERENCE_CONFLICT',
    dimension: 'EXPERIENCE',
    enforcement: 'REQUIRE_ADJUSTMENT',
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus: 'WAITING_DECISION',
    executionStatus: 'NOT_REQUIRED',
    title: '选择哪种冰川体验？',
    summary: '路线靠近多个冰川产品；合并为一个决策。',
    scope: { tripId: 'trip1' },
    evidenceSummary: { count: 4, freshness: 'FRESH', confidence: 0.9 },
    actionability: {
      requiresAction: true,
      recommendedAction: 'ALTERNATIVE',
      allowedActions: ['ALTERNATIVE', 'PLAN_B', 'DEFER'],
      writeChain: 'CONSTRAINT_WRITEBACK',
    },
    occurrenceCount: 1,
    detectors: [{ detectorId: 'iceland.glacier', sourceRefIds: ['route:glacier_zone'] }],
    origin: { authority: 'CANONICAL', primaryDetector: 'iceland.glacier' },
    decisionCase: {
      sourceKind: 'OPPORTUNITY',
      requiredness: 'IMPORTANT',
      domain: 'EXPERIENCE',
      scope: 'ACTIVITY',
      actionKind: 'SELECT',
      materialityScore: 8,
      materialityBreakdown: {
        budget: 2,
        time: 3,
        fitness: 2,
        bookingUrgency: 1,
        safety: 0,
        team: 0,
        irreversibility: 0,
      },
      enrichmentStage: 'ENRICHED',
      writebackTargets: ['ITINERARY'],
      uiGroup: 'IMPORTANT_CHOICE',
      uiGroupLabelZh: '关键选择',
    },
    ...overrides,
  };
}

function optionsView(opts?: { single?: boolean }): UnifiedDecisionOptionsView {
  if (opts?.single) {
    return {
      schemaId: 'tripnara.unified_decision_options@v2',
      tripId: 'trip1',
      problemId: 'dc_glacier_trip1',
      generatedAt: new Date().toISOString(),
      actions: [
        {
          actionId: 'only_one',
          type: 'ALTERNATIVE',
          source: 'RULE_ENGINE',
          title: '唯一方案',
          summary: '无分歧',
          requiresConfirmation: true,
          allowed: true,
        },
      ],
      actionability: {
        requiresAction: true,
        allowedActions: ['ALTERNATIVE'],
        writeChain: 'CONSTRAINT_WRITEBACK',
      },
    };
  }
  return {
    schemaId: 'tripnara.unified_decision_options@v2',
    tripId: 'trip1',
    problemId: 'dc_glacier_trip1',
    generatedAt: new Date().toISOString(),
    actions: [
      {
        actionId: 'glacier_hike',
        type: 'ALTERNATIVE',
        source: 'RULE_ENGINE',
        title: '冰川徒步',
        summary: '体能中高，约 3–5 小时',
        requiresConfirmation: true,
        allowed: true,
        expectedImpact: { durationDelta: 210, budgetDelta: 12000 },
      },
      {
        actionId: 'glacier_short',
        type: 'ALTERNATIVE',
        source: 'RULE_ENGINE',
        title: '短线冰川体验',
        summary: '约 2–3 小时',
        requiresConfirmation: true,
        allowed: true,
        expectedImpact: { durationDelta: 120, budgetDelta: 8000 },
      },
      {
        actionId: 'glacier_skip',
        type: 'DEFER',
        source: 'RULE_ENGINE',
        title: '暂不加入',
        summary: '不改当前行程',
        requiresConfirmation: false,
        allowed: true,
      },
    ],
    actionability: {
      requiresAction: true,
      allowedActions: ['ALTERNATIVE', 'DEFER'],
      writeChain: 'CONSTRAINT_WRITEBACK',
    },
  };
}

describe('selectDecisionSpaceInsight · SILENT policy', () => {
  it('returns SILENT when no open problems', () => {
    const insight = selectDecisionSpaceInsight({ openProblems: [] });
    expect(insight.mode).toBe('SILENT');
    expect(insight.actions).toEqual([]);
  });

  it('returns SILENT for routine unresolved decision without option divergence', () => {
    const focused = glacierProblem({
      decisionCase: {
        ...glacierProblem().decisionCase!,
        requiredness: 'IMPORTANT',
        uiGroup: 'IMPORTANT_CHOICE',
      },
    });
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      optionsView: optionsView({ single: true }),
    });
    expect(insight.mode).toBe('SILENT');
    expect(insight.modeReason).toBe('QUEUE_ALREADY_SURFACES');
    expect(insight.actions).toEqual([]);
  });

  it('returns ATTENTION when material option divergence exists (glacier multi-option)', () => {
    const focused = glacierProblem();
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      optionsView: optionsView(),
      surface: 'LIST',
    });
    expect(insight.mode).toBe('ATTENTION');
    expect(insight.modeReason).toBe('MATERIAL_OPTION_DIVERGENCE');
    expect(insight.recommendation?.recommendedOptionId).toBe('glacier_hike');
    expect(insight.actions.some((a) => a.kind === 'PREVIEW')).toBe(true);
    expect(insight.actions.some((a) => a.label === '打开决策空间')).toBe(false);
    expect(insight.observationSummary).not.toBe(insight.explanationSummary);
  });

  it('DETAIL surface suppresses yellow card (already viewing options)', () => {
    const focused = glacierProblem({
      decisionCase: {
        ...glacierProblem().decisionCase!,
        requiredness: 'BLOCKING',
        uiGroup: 'MUST_CONFIRM',
      },
    });
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      optionsView: optionsView(),
      surface: 'DETAIL',
    });
    expect(insight.mode).toBe('SILENT');
    expect(insight.modeReason).toBe('DETAIL_SURFACE_SUPPRESSES');
  });

  it('DETAIL + explicitAsk expands without loop actions', () => {
    const focused = glacierProblem();
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      optionsView: optionsView(),
      surface: 'DETAIL',
      explicitAsk: true,
    });
    expect(insight.mode).toBe('ATTENTION');
    expect(['EXPLICIT_ASK', 'MATERIAL_OPTION_DIVERGENCE']).toContain(insight.modeReason);
    expect(insight.actions.every((a) => a.kind === 'PREVIEW' && a.actionType === 'COMPARE_OPTIONS')).toBe(
      true,
    );
    expect(insight.actions.some((a) => a.label === '查看决策详情')).toBe(false);
  });

  it('prefers TravelCausalDecision card for observation / chain / recommendation', () => {
    const {
      buildStrongWindAppointmentFixture,
      projectCausalDecisionCard,
    } = require('../../../travel-causal-decision') as typeof import('../../../travel-causal-decision');
    const decision = buildStrongWindAppointmentFixture();
    const card = projectCausalDecisionCard(decision);
    const focused = glacierProblem({
      dimension: 'ENVIRONMENT',
      enforcement: 'BLOCK',
      decisionCase: {
        ...glacierProblem().decisionCase!,
        requiredness: 'BLOCKING',
        uiGroup: 'MUST_CONFIRM',
        materialityBreakdown: {
          ...glacierProblem().decisionCase!.materialityBreakdown!,
          safety: 3,
        },
      },
      travelCausalDecision: decision,
      causalDecisionCard: card,
      causalTraceRef: {
        traceId: 'ct_wind',
        worldStateVersion: 'ws_v1',
        protocolVersion: 'causal-trace-v1',
      },
    });
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      optionsView: optionsView(),
      explicitAsk: true,
    });
    expect(insight.mode).toBe('INTERVENTION');
    expect(insight.observationSummary).toContain('强风');
    expect(insight.explanationSummary).toContain('驾驶速度');
    expect(insight.recommendation?.summary).toContain('瀑布');
    expect(insight.causalDecisionCard?.interventionDeadline).toBe(
      decision.temporalForecast.interventionDeadline,
    );
    expect(insight.impacts.some((i) => i.summary.includes('最晚处理时间'))).toBe(true);
  });

  it('upgrades SILENT → ATTENTION on explicitAsk (问 Nara)', () => {
    const focused = glacierProblem();
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      optionsView: optionsView({ single: true }),
      explicitAsk: true,
    });
    expect(insight.mode).toBe('ATTENTION');
    expect(insight.modeReason).toBe('EXPLICIT_ASK');
    expect(insight.actions.some((a) => a.kind === 'PREVIEW')).toBe(true);
  });

  it('returns INTERVENTION for BLOCKING requiredness', () => {
    const focused = glacierProblem({
      decisionCase: {
        ...glacierProblem().decisionCase!,
        requiredness: 'BLOCKING',
        uiGroup: 'MUST_CONFIRM',
      },
    });
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      optionsView: optionsView({ single: true }),
    });
    expect(insight.mode).toBe('INTERVENTION');
    expect(insight.priority).toBe('P0');
    expect(insight.modeReason).toBe('BLOCKING_DECISION');
  });

  it('returns INTERVENTION for safety-related (ENVIRONMENT dimension)', () => {
    const focused = glacierProblem({
      dimension: 'ENVIRONMENT',
      decisionCase: {
        ...glacierProblem().decisionCase!,
        requiredness: 'OPTIONAL',
        uiGroup: 'WORTH_CONSIDERING',
      },
    });
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      optionsView: optionsView({ single: true }),
    });
    expect(insight.mode).toBe('INTERVENTION');
    expect(insight.modeReason).toBe('SAFETY_RELATED_DECISION');
  });
});
