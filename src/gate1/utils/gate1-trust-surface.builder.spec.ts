import {
  buildCandidateTrustCard,
  buildPlanBTrustCard,
  scoreCandidateConfidence,
  summarizeTrustCards,
} from './gate1-trust-surface.builder';

describe('gate1-trust-surface.builder', () => {
  const baseCandidate = {
    id: 'c1',
    label: '方案 A',
    version: 1,
    sourceType: 'HUMAN_ASSISTED',
    humanMinutes: 45,
    strategySummary: '南岸环线 + 冰川湖',
    constraintSatisfaction: {
      items: [
        { status: 'SATISFIED' },
        { status: 'SATISFIED' },
        { status: 'PARTIAL' },
      ],
    },
    risks: [{ level: 'LOW' }],
    publishedAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
  };

  it('scores constraint satisfaction into confidence', () => {
    const { score, rationale } = scoreCandidateConfidence(baseCandidate);
    expect(score).toBeGreaterThan(0.4);
    expect(rationale).toContain('约束满足度');
  });

  it('builds candidate card with alternatives and human disclaimer', () => {
    const alt = {
      ...baseCandidate,
      id: 'c2',
      label: '方案 B',
      strategySummary: '北线精简',
    };
    const card = buildCandidateTrustCard(baseCandidate, [baseCandidate, alt]);
    expect(card.subjectType).toBe('CANDIDATE');
    expect(card.alternatives).toHaveLength(1);
    expect(card.machineAesthetic.humanAssisted).toBe(true);
    expect(card.dataSources.length).toBeGreaterThan(0);
  });

  it('builds plan B card with trigger context', () => {
    const card = buildPlanBTrustCard({
      id: 'p1',
      label: 'Plan B v1',
      version: 1,
      sourceType: 'HUMAN_ASSISTED',
      humanMinutes: 30,
      riskTitle: '大风封路',
      alternativeSummary: '改走 1 号公路内陆段',
      triggerCondition: '风速 > 15m/s 持续 2h',
      advisorPreDecision: 'ADOPT',
      triggered: false,
      publishedAt: new Date('2026-06-03T00:00:00Z'),
      updatedAt: new Date('2026-06-03T00:00:00Z'),
    });
    expect(card.subjectType).toBe('PLAN_B');
    expect(card.confidence.level).toBe('HIGH');
  });

  it('builds plan B card with causal intervention payload in impactSummary', () => {
    const impactSummary = JSON.stringify({
      schema: 'tripnara/plan-b-intervention/v1',
      intervention: {
        interventionId: 'SHIFT:glacier:50',
        type: 'SHIFT_TIME',
        targetVariable: 'temporal:poi_start:glacier',
        expectedEffects: [{ metric: 'miss_probability', direction: 'DOWN', confidence: 0.8 }],
        sideEffects: [],
        title: '提前 50 分钟',
      },
      causalProjection: {
        causalChain: ['temporal:departure_time', 'outcome:miss_probability'],
        bindings: [
          {
            variable: 'outcome:miss_probability',
            label: '错过预约/窗口概率',
            baseValue: 0.42,
            projectedValue: 0.28,
            unit: 'ratio',
          },
        ],
      },
    });

    const card = buildPlanBTrustCard({
      id: 'p2',
      label: 'Plan B 阵风',
      version: 1,
      sourceType: 'SYSTEM',
      humanMinutes: null,
      riskTitle: '南岸阵风导致迟到',
      alternativeSummary: 'fallback text',
      triggerCondition: 'wind > 15m/s',
      advisorPreDecision: 'PENDING',
      triggered: false,
      publishedAt: null,
      updatedAt: new Date('2026-06-04T00:00:00Z'),
      impactSummary,
    });

    expect(card.alternatives[0].interventionSummary).toContain('错过概率');
    expect(card.alternatives[0].causalChain).toHaveLength(2);
    expect(card.confidence.rationale).toContain('42%');
  });

  it('builds plan B card with fulfillment causal assessment', () => {
    const card = buildPlanBTrustCard(
      {
        id: 'p3',
        label: 'Plan B 供应商',
        version: 1,
        sourceType: 'HUMAN_ASSISTED',
        humanMinutes: 20,
        riskTitle: '供应商未确认',
        alternativeSummary: '改订其他供应商',
        triggerCondition: 'confirmation pending',
        advisorPreDecision: 'PENDING',
        triggered: false,
        publishedAt: null,
        updatedAt: new Date('2026-06-05T00:00:00Z'),
      },
      {
        schema: 'tripnara/gate1-fulfillment-causal/v1',
        departureFailureRisk: 0.52,
        causalChain: [
          'readiness:blocker',
          'supplier:lead_time',
          'outcome:departure_failure_risk',
        ],
        bindings: [],
        userFacingAssessment: '有 1 项阻断级就绪任务，履约风险约 52%。',
        recommendedIntervention: {
          type: 'ESCALATE_SUPPLIER',
          action: '催促供应商确认',
          rationale: '窗口不足',
        },
      },
    );

    expect(card.confidence.rationale).toContain('52%');
    expect(card.alternatives[0].causalChain).toContain('supplier:lead_time');
    expect(card.dataSources.some((d) => d.id.startsWith('fulfillment:'))).toBe(true);
  });

  it('summarizes trust cards', () => {
    const card = buildCandidateTrustCard(baseCandidate, [baseCandidate]);
    const summary = summarizeTrustCards([card]);
    expect(summary.totalCards).toBe(1);
    expect(summary.humanAssistedCount).toBe(1);
  });
});
