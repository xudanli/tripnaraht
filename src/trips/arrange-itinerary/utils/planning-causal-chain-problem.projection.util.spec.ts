import {
  filterDecisionCheckerEvidenceForProblem,
  projectCausalChainFromDecisionCheckerEvidence,
  projectCausalChainFromIcelandAssessment,
  projectCausalChainFromOptionPreview,
  projectCausalChainFromProblemAssertions,
} from './planning-causal-chain.projection.util';

describe('planning-causal-chain problem projections', () => {
  it('projects problem assertions as ordered vertical chain', () => {
    const nodes = projectCausalChainFromProblemAssertions([
      {
        domain: 'TIME',
        enforcement: 'REQUIRE_ADJUSTMENT',
        condition: '预计 红沙滩 结束于 16:00，晚于午餐窗 12:00',
        conclusion: '预计 红沙滩 结束于 16:00，晚于午餐窗 12:00',
        proofs: [
          {
            entity: '日内评估',
            currentFact: '预计 红沙滩 结束于 16:00，晚于午餐窗 12:00',
            ruleId: 'MEAL_WINDOW_VS_ARRIVAL',
          },
        ],
      },
    ]);
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes[0].source).toBe('problem_assertion');
    expect(nodes[0].title).toBe('根因');
    expect(nodes[0].severity).toBe('risk');
    expect(nodes.some((n) => n.title === '连锁风险')).toBe(true);
  });

  it('projects option preview mutations after root cause', () => {
    const nodes = projectCausalChainFromOptionPreview({
      schemaId: 'tripnara.unified_decision_action_preview@v2',
      tripId: 't1',
      problemId: 'p1',
      actionId: 'adjust_time',
      generatedAt: '2026-07-06T00:00:00Z',
      action: {
        actionId: 'adjust_time',
        title: '顺延下一项开始时间',
        summary: '将下一项开始时间顺延 20 分钟',
        executable: true,
      },
      tradeoffs: [{ dimension: 'TIME', direction: 'WORSEN', value: 20, unit: 'minutes' }],
      proposedMutations: {
        operations: [
          {
            op: 'UPDATE_ITEM',
            after: {
              payload: {
                anchors: {
                  toPlaceLabel: '哈尔格林姆斯教堂',
                  activityStartAt: '2026-07-01T11:00:00Z',
                  suggestedTime: '2026-07-01T11:20:00Z',
                },
              },
            },
          },
        ],
      },
    } as import('../../../decision-runtime/gateway/contracts/unified-decision-ui.types').UnifiedDecisionActionPreviewView);
    expect(nodes[0].title).toBe('选用方案');
    expect(nodes.some((n) => n.source === 'option_preview' && n.entityLabel === '哈尔格林姆斯教堂')).toBe(
      true,
    );
  });

  it('projects iceland causal assessment as world_context nodes', () => {
    const nodes = projectCausalChainFromIcelandAssessment({
      schema: 'tripnara/iceland-self-drive-causal/v1',
      input: {
        routeLabel: '蓝湖 → 哈尔格林姆斯教堂',
        distanceKm: 38.6,
        baseDurationMinutes: 46,
        windMps: 14,
        appointmentSlackMinutes: 12,
      },
      travelTime: {
        pointMinutes: 46,
        p10Minutes: 44,
        p90Minutes: 58,
        effectiveSpeedKmh: 50,
        windSpeedFactor: 0.85,
      },
      missProbability: 0.42,
      causalChain: ['侧风 14 m/s', '有效车速下降', 'P90 通行时间上升'],
      bindings: [],
      userFacingAssessment: '大风可能导致抵达偏晚，建议提前出发',
    });
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(nodes.every((n) => n.source === 'world_context')).toBe(true);
    expect(nodes[0].title).toBe('环境因素');
  });

  it('filters decision-checker evidence to problem-scoped items', () => {
    const problemId =
      'dp_id:plan_object_plan_object_meal_late_arrival_po_d6e7f8a9-b0c1-4234-f567-890123456789_meal_windo';
    const items = [
      { id: 'ev_trip', title: '全行程证据覆盖', subtitle: 'x' },
      {
        id: 'ev_plan_object_meal_late_arrival_po_d6e7f8a9-b0c1-4234-f567-890123456789_meal_windo_0',
        title: '预计 红沙滩 结束于 16:00，晚于午餐窗 12:00',
        subtitle: '依据：游览结束晚于午餐窗',
        refs: [{ type: 'plan_object_rule', id: 'MEAL_WINDOW_VS_ARRIVAL' }],
      },
    ];
    const filtered = filterDecisionCheckerEvidenceForProblem(items, problemId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toContain('红沙滩');
  });

  it('projects decision-checker evidence items', () => {
    const nodes = projectCausalChainFromDecisionCheckerEvidence([
      {
        id: 'ev_1',
        title: '预计 红沙滩 结束于 16:00',
        subtitle: '依据：游览结束晚于午餐窗',
        reliability: 'low',
      },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].source).toBe('decision_checker');
  });
});
