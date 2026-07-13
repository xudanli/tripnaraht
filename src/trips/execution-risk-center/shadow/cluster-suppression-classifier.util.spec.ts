import { classifyClusterSuppression } from './cluster-suppression-classifier.util';
import { buildClusterVisibilityComparison } from './cluster-visibility-audit.util';
import type { ActiveRisk } from '../types/execution-risk.types';
import type { AggregatedExecutionAlertRisk } from '../utils/execution-alerts-aggregation.util';
import { buildClusterFromRisks } from '../utils/execution-risk-cluster.util';

function risk(
  id: string,
  title: string,
  overrides: Partial<ActiveRisk> = {},
): ActiveRisk {
  return {
    id,
    tripId: 'trip-iceland',
    riskKey: `rk|${id}`,
    type: 'SCHEDULE',
    code: 'SCHEDULE_DELAY',
    title,
    summary: title,
    level: 'HIGH',
    lifecycleStatus: 'ACTIVE',
    acknowledgementStatus: 'UNREAD',
    treatmentStatus: 'DECISION_REQUIRED',
    executionGate: 'REPLAN_REQUIRED',
    sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: `dp_${id}` }],
    affectedActivities: [{ id: 'day-3', label: '第 3 天', kind: 'activity' }],
    affectedLocations: [],
    affectedRouteSegments: [],
    affectedMembers: [],
    evidenceRefs: [],
    recommendationIds: ['rec-1'],
    decisionProblemIds: [`dp_${id}`],
    isRootCause: true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('cluster suppression — Iceland baseline pattern', () => {
  const wind = risk('risk_wind', '强风预警', {
    type: 'ENVIRONMENT',
    code: 'WEATHER_STRONG_WIND',
    executionGate: 'STOP',
    level: 'CRITICAL',
    treatmentStatus: 'ACTION_REQUIRED',
    sourceRefs: [{ sourceSystem: 'ENVIRONMENT_EVENT', sourceId: 'env-wind' }],
    decisionProblemIds: [],
    recommendationIds: [],
  });

  const scheduleStop = risk('risk_schedule_stop', '同日交通偏紧', {
    executionGate: 'STOP',
    level: 'CRITICAL',
    decisionProblemIds: [
      'dp_travel:same_day_travel:5ee5ce0c-f6a7-44f1-8232-694a9aecd12e:123853b2',
    ],
    sourceRefs: [
      {
        sourceSystem: 'DECISION_PROBLEM',
        sourceId: 'dp_travel:same_day_travel:5ee5ce0c-f6a7-44f1-8232-694a9aecd12e:123853b2',
      },
    ],
  });

  const scheduleDup = risk('risk_schedule_dup', '同日交通偏紧', {
    executionGate: 'REPLAN_REQUIRED',
    decisionProblemIds: [
      'dp_travel:same_day_travel:7488f8f6-9f16-48d8-8c7d-afdb55816307:36eeb145',
    ],
    sourceRefs: [
      {
        sourceSystem: 'DECISION_PROBLEM',
        sourceId: 'dp_travel:same_day_travel:7488f8f6-9f16-48d8-8c7d-afdb55816307:36eeb145',
      },
    ],
  });

  const lunchRisks = [1, 2, 3].map((n) =>
    risk(`risk_lunch_${n}`, '午餐窗冲突', {
      type: 'BOOKING_FULFILLMENT',
      code: 'BOOKING_WINDOW_AT_RISK',
      executionGate: 'REPLAN_REQUIRED',
      decisionProblemIds: [
        `dp_id:plan_object_meal_late_arrival_po_${n}_meal_windo`,
      ],
      sourceRefs: [
        {
          sourceSystem: 'DECISION_PROBLEM',
          sourceId: `dp_id:plan_object_meal_late_arrival_po_${n}_meal_windo`,
        },
      ],
    }),
  );

  const risks = [wind, scheduleStop, scheduleDup, ...lunchRisks];
  const scheduleCluster = buildClusterFromRisks(scheduleStop, [scheduleStop], []);
  scheduleCluster.consequenceImpacts.push({
    code: 'BOOKING_WINDOW_AT_RISK',
    label: '午餐窗冲突可能无法按时完成',
    sourceRiskId: 'risk_lunch_1',
  });
  scheduleCluster.consequenceCodes.push('BOOKING_WINDOW_AT_RISK');

  const clusters = [
    buildClusterFromRisks(wind, [wind], []),
    scheduleCluster,
    buildClusterFromRisks(scheduleDup, [scheduleDup], []),
    ...lunchRisks.map((r) => buildClusterFromRisks(r, [r], [])),
  ];

  const listAlerts: AggregatedExecutionAlertRisk[] = [
    { risk: wind, role: 'PRIMARY' },
    { risk: scheduleStop, role: 'INDEPENDENT' },
  ];
  const visibleClusters = clusters.filter((c) =>
    listAlerts.some((a) => a.risk.id === c.primaryRiskId),
  );

  it('classifies duplicate same-day travel and lunch windows without UNKNOWN', () => {
    const visibleDecisionProblemIds = new Set(
      visibleClusters.map((c) => c.decisionProblemId).filter(Boolean) as string[],
    );

    const scheduleDupCluster = clusters.find((c) => c.primaryRiskId === 'risk_schedule_dup')!;
    const lunchCluster = clusters.find((c) => c.primaryRiskId === 'risk_lunch_1')!;

    const dup = classifyClusterSuppression({
      cluster: scheduleDupCluster,
      risks,
      visibleClusters,
      visibleDecisionProblemIds,
    });
    expect(dup.reason).toBe('DUPLICATE_DECISION');
    expect(dup.representedByClusterId).toBe('cluster_risk_schedule_stop');

    const lunch = classifyClusterSuppression({
      cluster: lunchCluster,
      risks,
      visibleClusters,
      visibleDecisionProblemIds,
    });
    expect(lunch.reason).toBe('DUPLICATE_DECISION');
    expect(lunch.representedByClusterId).toBe('cluster_risk_schedule_stop');
  });

  it('passes cluster visibility hard gates for Iceland-like pattern', () => {
    const result = buildClusterVisibilityComparison({
      clusters,
      listAlerts,
      risks,
    });

    expect(result.unknownSuppressionCount).toBe(0);
    expect(result.hiddenHighSeverityCount).toBe(0);
    expect(result.hiddenStopCount).toBe(0);
    expect(result.suppressedByReason.UNKNOWN).toBe(0);
    expect(result.suppressedByReason.DUPLICATE_DECISION).toBe(4);
  });
});
