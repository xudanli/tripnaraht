import { RecommendationType } from '../../../generated/execution-risk-contracts';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import {
  assertThreePlanDiversity,
  generateThreePlansFromHarnessExpected,
  generateThreePlansFromKnowledge,
} from './execution-risk-three-plan-generator.util';
import { loadExecutionRiskKnowledgeFromPackage } from '../knowledge/execution-risk-knowledge.loader';
import { RecommendationStatus } from '../../../generated/execution-risk-contracts';

describe('execution-risk-three-plan-generator.util', () => {
  const cluster: ExecutionRiskCluster = {
    clusterId: 'cluster_test',
    tripId: 'trip_test',
    primaryRiskId: 'risk_env_wind',
    relatedRiskIds: ['risk_env_wind'],
    rootCauseCode: 'WEATHER_STRONG_WIND',
    primaryKnowledgeCode: 'ENV-WIND-01',
    suppressedDecisionCount: 0,
    severity: 'REPLAN_REQUIRED',
    affectedActivityIds: [],
    affectedMemberIds: [],
    consequenceCodes: ['WEATHER_STRONG_WIND'],
    consequenceImpacts: [],
    adjustmentType: 'SAFETY_INTERVENTION',
    requiresUserDecision: true,
  };

  it('maps harness expected plans with distinct action codes (AC-008)', () => {
    const plans = generateThreePlansFromHarnessExpected(
      [
        {
          planType: 'RECOMMENDED',
          actionCodes: ['POSTPONE_GLACIER_HIKE', 'DELAY_DEPARTURE_2H'],
          timeDeltaMinutes: { min: 90, max: 150 },
          experienceRetention: { min: 70, max: 90 },
          safetyDelta: { min: 30, max: 50 },
        },
        {
          planType: 'CONSERVATIVE',
          actionCodes: ['CANCEL_GLACIER_HIKE', 'SKIP_TO_VIK'],
          timeDeltaMinutes: { min: 30, max: 60 },
          experienceRetention: { min: 40, max: 55 },
          safetyDelta: { min: 50, max: 70 },
        },
        {
          planType: 'MINIMAL_CHANGE',
          actionCodes: ['SHORTEN_HIKE_DURATION', 'ADD_WIND_BREAKS'],
          timeDeltaMinutes: { min: 15, max: 30 },
          experienceRetention: { min: 85, max: 95 },
          safetyDelta: { min: 5, max: 15 },
        },
      ],
      cluster,
    );

    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.planType)).toEqual([
      RecommendationType.RECOMMENDED,
      RecommendationType.CONSERVATIVE,
      RecommendationType.MINIMAL_CHANGE,
    ]);
    expect(assertThreePlanDiversity(plans)).toEqual([]);
  });

  it('generates knowledge-backed plans when intervention actions match cluster codes', () => {
    const snapshot = loadExecutionRiskKnowledgeFromPackage();
    const plans = generateThreePlansFromKnowledge({
      cluster,
      risks: [
        {
          id: 'risk_env_wind',
          knowledgeCode: 'ENV-WIND-01',
        } as never,
      ],
      actionsByCode: snapshot.actionsByCode,
    });

    expect(plans.length).toBeGreaterThanOrEqual(3);
    expect(plans[0]?.actionCodes.length).toBeGreaterThan(0);
  });

  it('vetoes continue-only plans under STOP severity (AC-007 runtime)', () => {
    const stopCluster: ExecutionRiskCluster = {
      ...cluster,
      severity: 'STOP',
      primaryKnowledgeCode: 'ROAD-ICE-01',
    };
    const snapshot = loadExecutionRiskKnowledgeFromPackage();
    const plans = generateThreePlansFromKnowledge({
      cluster: stopCluster,
      risks: [
        {
          id: 'risk_road_ice',
          knowledgeCode: 'ROAD-ICE-01',
          executionGate: 'STOP',
        } as never,
      ],
      actionsByCode: snapshot.actionsByCode,
    });

    const continueOnly = plans.filter(
      (p) =>
        p.actionCodes.length > 0 &&
        p.actionCodes.every((c) =>
          ['CONTINUE_AS_PLANNED', 'MAINTAIN_CURRENT_PACE', 'MAINTAIN_SCHEDULE'].includes(c),
        ),
    );
    expect(continueOnly).toHaveLength(0);

    const vetoed = plans.filter((p) => p.unavailableReason === 'VETOED_BY_SAFETY');
    if (vetoed.length > 0) {
      expect(vetoed.every((p) => p.status === RecommendationStatus.REJECTED)).toBe(true);
      expect(vetoed.every((p) => p.actionCodes.length === 0)).toBe(true);
    }
  });
});
