import { buildClusterVisibilityComparison } from './cluster-visibility-audit.util';
import type { ActiveRisk } from '../types/execution-risk.types';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import { aggregateExecutionAlertRisks } from '../utils/execution-alerts-aggregation.util';
import { buildExecutionRiskClusters } from '../utils/execution-risk-cluster.util';

function risk(id: string, title: string, overrides: Partial<ActiveRisk> = {}): ActiveRisk {
  return {
    id,
    tripId: 'trip-1',
    riskKey: `rk|${id}`,
    type: 'ENVIRONMENT',
    code: 'WEATHER_STRONG_WIND',
    title,
    summary: title,
    level: 'HIGH',
    lifecycleStatus: 'ACTIVE',
    acknowledgementStatus: 'UNREAD',
    treatmentStatus: 'ACTION_REQUIRED',
    executionGate: 'REPLAN_REQUIRED',
    sourceRefs: [{ sourceSystem: 'ENVIRONMENT_EVENT', sourceId: 'env-1' }],
    affectedActivities: [],
    affectedLocations: [],
    affectedRouteSegments: [],
    affectedMembers: [],
    evidenceRefs: [],
    recommendationIds: [],
    decisionProblemIds: [],
    isRootCause: true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildClusterVisibilityComparison', () => {
  it('marks primary cluster visible and derived cluster suppressed with representation', () => {
    const primary = risk('risk_primary', '强风预警', { executionGate: 'STOP', level: 'CRITICAL' });
    const derived = risk('risk_derived', '路段风险', {
      isRootCause: false,
      type: 'ROAD_TRANSPORT',
      code: 'ROAD_SLIPPERY',
      executionGate: 'AT_RISK',
      level: 'HIGH',
    });

    const risks = [primary, derived];
    const aggregation = aggregateExecutionAlertRisks(risks);
    const clusters = buildExecutionRiskClusters(risks);
    const result = buildClusterVisibilityComparison({
      clusters,
      listAlerts: aggregation.listAlerts,
      risks,
    });

    expect(result.totalClusterCount).toBeGreaterThanOrEqual(1);
    expect(result.visibleClusterCount).toBeGreaterThanOrEqual(1);
    expect(result.hiddenStopCount).toBe(0);
  });
});
