import { buildHarnessActiveRisks, HARNESS_ACTIVITY_ID, HARNESS_TRIP_ID } from '../harness/execution-risk-p0.harness.util';
import type { ActiveRisk } from '../types/execution-risk.types';
import { buildRiskKey } from './risk-key.util';
import {
  buildExecutionRiskClusters,
  shouldSuppressDerivedDecisionItem,
} from './execution-risk-cluster.util';
import { isScheduleDerivedFromPrimary } from './execution-alerts-aggregation.util';

function buildScheduleRisk(overrides: Partial<ActiveRisk> & Pick<ActiveRisk, 'id' | 'riskKey'>): ActiveRisk {
  const base = buildHarnessActiveRisks()[0]!;
  return {
    ...base,
    type: 'SCHEDULE',
    code: 'SCHEDULE_DELAY',
    executionGate: 'REPLAN_REQUIRED',
    level: 'HIGH',
    treatmentStatus: 'DECISION_REQUIRED',
    sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: 'dp-traffic' }],
    decisionProblemIds: ['dp-traffic'],
    ...overrides,
  };
}

describe('execution-risk-cluster.util', () => {
  it('merges wind primary with same-scope schedule into one cluster', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const scheduleRisk = buildScheduleRisk({
      id: 'risk_schedule_day1',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day1',
        affectedScope: 'day-1',
      }),
      title: '同日交通偏紧',
      summary: '预计延误约 47 分钟',
      affectedActivities: [
        { id: HARNESS_ACTIVITY_ID, label: '瓦特纳冰川徒步', kind: 'activity' },
      ],
    });

    expect(isScheduleDerivedFromPrimary(scheduleRisk, primary)).toBe(true);

    const clusters = buildExecutionRiskClusters([primary, scheduleRisk]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.primaryRiskId).toBe(primary.id);
    expect(clusters[0]?.relatedRiskIds).toContain(scheduleRisk.id);
    expect(clusters[0]?.adjustmentType).toBe('SAFETY_INTERVENTION');
    expect(clusters[0]?.consequenceImpacts.length).toBeGreaterThan(0);
    expect(clusters[0]?.suppressedDecisionCount).toBe(1);
  });

  it('keeps independent road block as separate cluster from wind', () => {
    const risks = buildHarnessActiveRisks();
    const clusters = buildExecutionRiskClusters(risks);
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    expect(clusters.some((c) => c.rootCauseCode === 'WEATHER_STRONG_WIND')).toBe(true);
    expect(clusters.some((c) => c.rootCauseCode === 'ROAD_CLOSED')).toBe(true);
  });

  it('suppresses derived-only decision item when primary cluster exists', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const scheduleRisk = buildScheduleRisk({
      id: 'risk_schedule_day1',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day1',
        affectedScope: 'day-1',
      }),
      title: '同日交通偏紧',
      summary: '预计延误约 47 分钟',
      affectedActivities: [
        { id: HARNESS_ACTIVITY_ID, label: '瓦特纳冰川徒步', kind: 'activity' },
      ],
    });
    const clusters = buildExecutionRiskClusters([primary, scheduleRisk]);

    expect(
      shouldSuppressDerivedDecisionItem({
        linkedRiskIds: [scheduleRisk.id],
        decisionProblemId: 'dp-traffic',
        clusters,
        risks: [primary, scheduleRisk],
      }),
    ).toBe(true);
  });
});
