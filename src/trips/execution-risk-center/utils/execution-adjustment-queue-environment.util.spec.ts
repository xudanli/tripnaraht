import { buildHarnessActiveRisks } from '../harness/execution-risk-p0.harness.util';
import type { ExecutionInterventionDto } from '../../../mobile/dto/mobile-execution.types';
import {
  hasEnvironmentRecommendationAction,
  shouldSuppressAlertOnlyEnvironmentCluster,
} from './execution-adjustment-queue-environment.util';
import { buildExecutionRiskClusters } from './execution-risk-cluster.util';

describe('execution-adjustment-queue-environment.util', () => {
  const windRisk = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;

  it('detects env-rec recommendation on weather risk', () => {
    expect(hasEnvironmentRecommendationAction(windRisk)).toBe(true);
    expect(
      hasEnvironmentRecommendationAction({ ...windRisk, recommendationIds: [] }),
    ).toBe(false);
  });

  it('does not suppress weather cluster when env-rec recommendation exists', () => {
    const risks = [windRisk];
    const clusters = buildExecutionRiskClusters(risks);
    const item: ExecutionInterventionDto = {
      schemaId: 'tripnara.execution_intervention@v1',
      id: `intervention-risk-${windRisk.id}`,
      tripId: windRisk.tripId,
      type: 'SAFETY_INTERVENTION',
      priority: 'CRITICAL',
      title: windRisk.title,
      reason: windRisk.summary,
      affectedMembers: [],
      affectedActivities: [],
      recommendedAction: '查看并确认调整方案',
      evidenceRefs: [],
      requiresConfirmation: true,
      autoExecutable: false,
      reversible: true,
      modifiesEffectivePlan: true,
      requiresRevalidation: true,
      status: 'OPEN',
      primaryRiskId: windRisk.id,
      linkedRiskIds: [windRisk.id],
      recommendationId: windRisk.recommendationIds[0],
      clusterId: clusters[0]?.clusterId,
      actions: {
        primary: { label: '查看建议', action: 'view_alternatives', enabled: true },
      },
    };

    expect(shouldSuppressAlertOnlyEnvironmentCluster(item, clusters, risks)).toBe(false);
  });

  it('suppresses alert-only weather cluster without env-rec recommendation', () => {
    const advisoryOnly = { ...windRisk, recommendationIds: [] as string[] };
    const risks = [advisoryOnly];
    const clusters = buildExecutionRiskClusters(risks);
    const item: ExecutionInterventionDto = {
      schemaId: 'tripnara.execution_intervention@v1',
      id: `intervention-risk-${advisoryOnly.id}`,
      tripId: advisoryOnly.tripId,
      type: 'SAFETY_INTERVENTION',
      priority: 'CRITICAL',
      title: advisoryOnly.title,
      reason: advisoryOnly.summary,
      affectedMembers: [],
      affectedActivities: [],
      recommendedAction: '查看风险详情',
      evidenceRefs: [],
      requiresConfirmation: true,
      autoExecutable: false,
      reversible: true,
      modifiesEffectivePlan: true,
      requiresRevalidation: true,
      status: 'OPEN',
      primaryRiskId: advisoryOnly.id,
      linkedRiskIds: [advisoryOnly.id],
      clusterId: clusters.find((c) => c.primaryRiskId === advisoryOnly.id)?.clusterId,
      actions: {
        primary: { label: '查看风险详情', action: 'view_impact', enabled: true },
      },
    };

    expect(shouldSuppressAlertOnlyEnvironmentCluster(item, clusters, risks)).toBe(true);
  });
});
