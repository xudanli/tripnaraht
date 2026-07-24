import { buildHarnessActiveRisks } from '../harness/execution-risk-p0.harness.util';
import { projectActiveRiskDetailWithUserFacing } from './execution-risk-detail.projection.util';
import type { AttentionPrimarySsoCutoverPlan } from '../../guardian-decision-core/attention/attention-primary-sso-cutover.util';

describe('projectActiveRiskDetailWithUserFacing', () => {
  it('projects userNarrative and userActions from ActiveRisk', () => {
    const base = buildHarnessActiveRisks()[0]!;
    const risk = {
      ...base,
      type: 'SCHEDULE' as const,
      code: 'SCHEDULE_DELAY' as const,
      title: '时间冲突',
      summary: 'overlap 60 min',
      executionGate: 'STOP' as const,
    };
    const detail = projectActiveRiskDetailWithUserFacing(risk);

    expect(detail.userNarrative?.whatHappened).toBeTruthy();
    expect(detail.userNarrative?.impactOnTrip).toBeTruthy();
    expect(detail.userNarrative?.whatHappened).not.toMatch(/RFC-001|urgency HIGH/i);
    expect(detail.userActions?.length).toBeGreaterThan(0);
    expect(detail.projectionSource).toBe('execution_risk_center');
  });

  it('applies attention primary headline when cutover plan matches', () => {
    const risk = buildHarnessActiveRisks()[0]!;
    const problemId = risk.decisionProblemIds[0] ?? 'dp_test';
    const cutoverPlan = {
      tripId: risk.tripId,
      attentionPrimaryItems: [
        {
          clusterId: 'cluster_1',
          tripId: risk.tripId,
          primaryProblemId: problemId,
          primarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
          headline: '强风等原因导致今天的原计划无法按时完成',
          explanation: '预计到达下一活动时间可能已超过最晚入场时间',
          causalStory: [],
          attentionLevel: 'QUEUE',
          status: 'OPEN',
          relatedEffects: [],
          confirmationEntry: { problemId, actionRoute: 'decision-queue' },
          firstObservedAt: '2026-07-12T12:00:00.000Z',
          lastUpdatedAt: '2026-07-12T12:00:00.000Z',
        },
      ],
      visiblePrimaryProblemIds: new Set([problemId]),
      suppressedProblemIds: new Set<string>(),
    } as unknown as AttentionPrimarySsoCutoverPlan;

    const detail = projectActiveRiskDetailWithUserFacing(
      { ...risk, decisionProblemIds: [problemId] },
      { cutoverPlan },
    );

    expect(detail.projectionSource).toBe('execution_risk_center+attention_primary_sso');
    expect(detail.userNarrative?.whatHappened).toContain('强风等原因导致今天的原计划无法按时完成');
  });
});
