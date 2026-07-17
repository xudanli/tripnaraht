import { ExecutionRiskRecommendationService } from './execution-risk-recommendation.service';
import { RecommendationType } from '../../../generated/execution-risk-contracts';
import { RecommendationStatus } from '../../../generated/execution-risk-contracts';

describe('ExecutionRiskRecommendationService', () => {
  const risk = {
    id: 'risk_abc',
    title: '强风',
    summary: '阵风偏强',
    code: 'WEATHER_STRONG_WIND',
    type: 'ENVIRONMENT',
    recommendationIds: [],
    decisionProblemIds: [],
    sourceRefs: [{ sourceSystem: 'ENVIRONMENT_EVENT', sourceId: 'env-1' }],
    affectedMembers: [],
    affectedActivities: [{ id: 'a1', label: '冰川徒步' }],
  };

  it('fills items from knowledge three-plans when env/advisory empty', async () => {
    const aggregation = {
      getRisk: jest.fn(async () => risk),
      listRisks: jest.fn(async () => [risk]),
    };
    const svc = new ExecutionRiskRecommendationService(aggregation as never);

    jest.spyOn(svc, 'listThreePlansForRisk').mockResolvedValue([
      {
        planType: RecommendationType.RECOMMENDED,
        title: 'Recommended',
        actionCodes: ['SHORTEN'],
        actions: [],
        status: RecommendationStatus.PRESENTED,
        timeDeltaMinutes: { min: -30, max: -20 },
        experienceRetention: { min: 70, max: 90 },
        safetyDelta: { min: 20, max: 40 },
      },
      {
        planType: RecommendationType.CONSERVATIVE,
        title: 'Conservative',
        actionCodes: ['CANCEL'],
        actions: [],
        status: RecommendationStatus.PRESENTED,
        timeDeltaMinutes: { min: 0, max: 0 },
        experienceRetention: { min: 40, max: 55 },
        safetyDelta: { min: 50, max: 70 },
      },
    ] as never);

    // Force cluster path by stubbing build via listThreePlans returning plans;
    // listForRisk also needs clusters from listRisks — buildExecutionRiskClusters
    // needs fuller risk shape. Prefer last-resort stub when cluster missing.
    const items = await svc.listForRisk('trip_1', 'risk_abc', 'user_1');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]!.riskId).toBe('risk_abc');
    expect(items[0]!.title || items[0]!.label).toBeTruthy();
    expect(items.some((i) => i.isRecommended)).toBe(true);
  });

  it('throws when riskId is unknown', async () => {
    const aggregation = {
      getRisk: jest.fn(async () => null),
      listRisks: jest.fn(async () => []),
    };
    const svc = new ExecutionRiskRecommendationService(aggregation as never);
    await expect(svc.listForRisk('trip_1', 'missing', 'user_1')).rejects.toThrow(/不存在/);
  });
});
