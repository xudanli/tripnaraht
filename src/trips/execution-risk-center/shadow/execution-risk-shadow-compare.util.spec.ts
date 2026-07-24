import { buildExecutionRiskShadowComparison } from './execution-risk-shadow-compare.util';
import type { ExecutionRiskShadowFingerprint } from './execution-risk-shadow-compare.types';
import type { ActiveRisk } from '../types/execution-risk.types';

function risk(overrides: Partial<ActiveRisk> & Pick<ActiveRisk, 'id' | 'title' | 'riskKey'>): ActiveRisk {
  return {
    tripId: 'trip-1',
    type: 'ENVIRONMENT',
    code: 'WEATHER_STRONG_WIND',
    level: 'HIGH',
    lifecycleStatus: 'ACTIVE',
    acknowledgementStatus: 'UNREAD',
    treatmentStatus: 'ACTION_REQUIRED',
    executionGate: 'REPLAN_REQUIRED',
    summary: overrides.title,
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

describe('buildExecutionRiskShadowComparison', () => {
  const legacy: ExecutionRiskShadowFingerprint[] = [
    {
      id: 'env-1',
      sourceKey: 'ENVIRONMENT_EVENT:env-1',
      level: 'REPLAN_REQUIRED',
      title: '强风预警',
    },
  ];

  const canonicalRisk = risk({
    id: 'risk_abc',
    title: '强风预警',
    riskKey: 'rk-wind',
  });

  const canonical: ExecutionRiskShadowFingerprint[] = [
    {
      id: 'risk_abc',
      sourceKey: 'ENVIRONMENT_EVENT:env-1',
      level: 'REPLAN_REQUIRED',
      title: '强风预警',
    },
  ];

  it('marks aligned when source keys and levels match', () => {
    const result = buildExecutionRiskShadowComparison({
      tripId: 'trip-1',
      legacyFingerprints: legacy,
      canonicalFingerprints: canonical,
      canonicalRisks: [canonicalRisk],
      canonicalPrimaryId: 'risk_abc',
    });

    expect(result.diverged).toBe(false);
    expect(result.divergenceKind).toBe('ALIGNED');
    expect(result.rawRiskComparison.overlapRate).toBe(1);
    expect(result.semanticComparison.duplicateVisibleItemCount).toBe(0);
    expect(result.semanticComparison.clusterVisibility.hiddenStopCount).toBe(0);
  });

  it('classifies derived expansion when clusters align', () => {
    const derived = risk({
      id: 'risk_derived',
      title: '路段风险',
      riskKey: 'rk-road',
      isRootCause: false,
      type: 'ROAD_TRANSPORT',
      code: 'ROAD_SLIPPERY',
      sourceRefs: [{ sourceSystem: 'ENVIRONMENT_EVENT', sourceId: 'env-1' }],
    });

    const result = buildExecutionRiskShadowComparison({
      tripId: 'trip-1',
      legacyFingerprints: legacy,
      canonicalFingerprints: [
        ...canonical,
        {
          id: 'risk_derived',
          sourceKey: 'ENVIRONMENT_EVENT:env-1',
          level: 'AT_RISK',
          title: '路段风险',
        },
      ],
      canonicalRisks: [canonicalRisk, derived],
      canonicalPrimaryId: 'risk_abc',
    });

    expect(result.rawRiskComparison.derivedRiskCount).toBe(1);
    expect(result.divergenceKinds).toContain('EXPECTED_DERIVED_EXPANSION');
  });

  it('detects level mismatch', () => {
    const result = buildExecutionRiskShadowComparison({
      tripId: 'trip-1',
      legacyFingerprints: legacy,
      canonicalFingerprints: [{ ...canonical[0], level: 'AT_RISK' }],
      canonicalRisks: [{ ...canonicalRisk, executionGate: 'AT_RISK' }],
      canonicalPrimaryId: 'risk_abc',
    });

    expect(result.diverged).toBe(true);
    expect(result.divergenceKinds).toContain('SEVERITY_MISMATCH');
  });
});
