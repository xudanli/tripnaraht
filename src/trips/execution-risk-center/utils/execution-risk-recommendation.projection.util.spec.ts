import { RecommendationType } from '../../../generated/execution-risk-contracts';
import type { ActiveRisk } from '../types/execution-risk.types';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import type { ExecutionRiskThreePlan } from './execution-risk-three-plan-generator.util';
import {
  buildBenefitTags,
  buildKnowledgeRecommendationId,
  enrichRecommendationPresentation,
  mapThreePlansToRecommendations,
} from './execution-risk-recommendation.projection.util';
import { RecommendationStatus } from '../../../generated/execution-risk-contracts';

describe('execution-risk-recommendation.projection.util', () => {
  const risk = {
    id: 'risk_wind001',
    title: '强风',
    summary: '阵风偏强',
    code: 'WEATHER_STRONG_WIND',
    affectedMembers: [{ id: 'm1', label: 'Patrick' }],
    affectedActivities: [{ id: 'a1', label: '冰川徒步' }],
    sourceRefs: [{ sourceSystem: 'ENVIRONMENT_EVENT', sourceId: 'env-1' }],
  } as ActiveRisk;

  const cluster: ExecutionRiskCluster = {
    clusterId: 'cluster_wind',
    tripId: 'trip_1',
    primaryRiskId: 'risk_wind001',
    relatedRiskIds: ['risk_wind001'],
    rootCauseCode: 'WEATHER_STRONG_WIND',
    primaryKnowledgeCode: 'ENV-WIND-01',
    suppressedDecisionCount: 0,
    severity: 'REPLAN_REQUIRED',
    affectedActivityIds: ['a1'],
    affectedMemberIds: ['m1'],
    consequenceCodes: [],
    consequenceImpacts: [],
    adjustmentType: 'SAFETY_INTERVENTION',
    requiresUserDecision: true,
  };

  const plans: ExecutionRiskThreePlan[] = [
    {
      planType: RecommendationType.RECOMMENDED,
      title: 'Recommended',
      actionCodes: ['SHORTEN_HIKE'],
      actions: [{ category: 'ACTIVITY' as never, actionCode: 'SHORTEN_HIKE', label: '缩短徒步' }],
      status: RecommendationStatus.PRESENTED,
      timeDeltaMinutes: { min: -30, max: -20 },
      experienceRetention: { min: 75, max: 85 },
      safetyDelta: { min: 20, max: 40 },
    },
    {
      planType: RecommendationType.CONSERVATIVE,
      title: 'Conservative',
      actionCodes: ['CANCEL_HIKE'],
      actions: [{ category: 'ACTIVITY' as never, actionCode: 'CANCEL_HIKE', label: '取消徒步' }],
      status: RecommendationStatus.PRESENTED,
      timeDeltaMinutes: { min: 0, max: 0 },
      experienceRetention: { min: 40, max: 55 },
      safetyDelta: { min: 50, max: 70 },
    },
    {
      planType: RecommendationType.MINIMAL_CHANGE,
      title: 'Minimal',
      actionCodes: ['ADD_BREAKS'],
      actions: [{ category: 'TIME' as never, actionCode: 'ADD_BREAKS', label: '增加休息' }],
      status: RecommendationStatus.PRESENTED,
      timeDeltaMinutes: { min: 15, max: 30 },
      experienceRetention: { min: 85, max: 95 },
      safetyDelta: { min: 5, max: 15 },
    },
  ];

  it('maps three plans to client recommendation cards with stable ids', () => {
    const items = mapThreePlansToRecommendations({ risk, cluster, plans });
    expect(items.length).toBe(3);
    expect(items[0]!.id).toBe(buildKnowledgeRecommendationId('cluster_wind', 'RECOMMENDED'));
    expect(items.every((i) => i.riskId === 'risk_wind001')).toBe(true);
    expect(items.some((i) => i.isRecommended)).toBe(true);
    expect(items[0]!.title).toContain('推荐');
    expect(items[0]!.benefitTags?.length).toBeGreaterThan(0);
    // ALL_MEMBERS scope omits per-member duplication; FOCUSED fills memberImpacts
    expect(items[0]!.memberImpacts ?? []).toEqual([]);
  });

  it('builds benefit tags from plan deltas', () => {
    const tags = buildBenefitTags(plans[0]!);
    expect(tags).toContain('推荐');
    expect(tags.some((t) => t.includes('min') || t.includes('安全') || t.includes('体验'))).toBe(
      true,
    );
  });

  it('enriches legacy items with title and benefitTags', () => {
    const enriched = enrichRecommendationPresentation({
      id: 'env-rec-1',
      riskId: 'risk_wind001',
      label: '缩短徒步',
      description: 'desc',
      isRecommended: true,
      impactSummary: '-30min',
      sourceSystem: 'ENVIRONMENT_EVENT',
      sourceId: 'env-1',
    });
    expect(enriched.title).toBe('缩短徒步');
    expect(enriched.benefitTags).toEqual(expect.arrayContaining(['推荐', '-30min']));
  });
});
