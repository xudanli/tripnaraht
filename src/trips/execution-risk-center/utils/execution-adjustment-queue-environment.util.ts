import type { ExecutionInterventionDto } from '../../../mobile/dto/mobile-execution.types';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import type { ActiveRisk } from '../types/execution-risk.types';
import { isWeatherLikeEnvironmentPrimary } from './execution-alert-knowledge-noise.util';

export function hasEnvironmentRecommendationAction(risk: ActiveRisk): boolean {
  return risk.recommendationIds.some((id) => id.trim().startsWith('env-rec-'));
}

export function interventionHasEnvironmentRecommendationAction(
  item: Pick<ExecutionInterventionDto, 'recommendationId' | 'primaryRiskId'>,
  risks: ActiveRisk[],
): boolean {
  if (item.recommendationId?.trim().startsWith('env-rec-')) return true;
  if (!item.primaryRiskId) return false;
  const risk = risks.find((r) => r.id === item.primaryRiskId);
  return risk != null && hasEnvironmentRecommendationAction(risk);
}

/**
 * Weather/environment clusters without decision write-back belong in execution-alerts only,
 * unless an env-rec recommendation exists (scheme 2 — actionable adjustment item).
 */
export function shouldSuppressAlertOnlyEnvironmentCluster(
  item: ExecutionInterventionDto,
  clusters: ExecutionRiskCluster[],
  risks: ActiveRisk[],
): boolean {
  if (item.decisionProblemId?.trim()) return false;
  if (item.id.startsWith('intervention-tep-')) return false;
  if (interventionHasEnvironmentRecommendationAction(item, risks)) return false;

  const cluster =
    clusters.find((c) => c.clusterId === item.clusterId) ??
    clusters.find((c) => item.id === `intervention-cluster-${c.clusterId}`);
  const primaryRiskId = item.primaryRiskId ?? cluster?.primaryRiskId;
  if (!primaryRiskId) return false;

  const risk = risks.find((r) => r.id === primaryRiskId);
  if (!risk || risk.type !== 'ENVIRONMENT') return false;
  if (!isWeatherLikeEnvironmentPrimary(risk)) return false;
  if (hasEnvironmentRecommendationAction(risk)) return false;
  return true;
}
