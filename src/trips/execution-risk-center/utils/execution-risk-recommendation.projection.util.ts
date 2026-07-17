import { RecommendationType } from '../../../generated/execution-risk-contracts';
import type {
  ActiveRisk,
  ExecutionRiskRecommendationDto,
} from '../types/execution-risk.types';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import type { ExecutionRiskThreePlan } from './execution-risk-three-plan-generator.util';
import {
  buildMemberImpactsForRecommendation,
  resolveAffectedMembersScope,
} from './execution-risk-member.util';

export function buildKnowledgeRecommendationId(
  clusterId: string,
  planType: RecommendationType | string,
): string {
  return `rec_${clusterId}_${planType}`;
}

export function mapThreePlansToRecommendations(input: {
  risk: ActiveRisk;
  cluster: ExecutionRiskCluster;
  plans: ExecutionRiskThreePlan[];
}): ExecutionRiskRecommendationDto[] {
  const scope = resolveAffectedMembersScope({ risks: [input.risk] });
  const available = input.plans.filter((p) => p.planType !== RecommendationType.UNAVAILABLE);

  return available.map((plan, index) => {
    const title = localizePlanTitle(plan);
    const benefitTags = buildBenefitTags(plan);
    const impactSummary = formatTimeDeltaTag(plan.timeDeltaMinutes);
    const isRecommended =
      plan.planType === RecommendationType.RECOMMENDED ||
      (index === 0 && !available.some((p) => p.planType === RecommendationType.RECOMMENDED));

    const dto: ExecutionRiskRecommendationDto = {
      id: buildKnowledgeRecommendationId(input.cluster.clusterId, plan.planType),
      riskId: input.risk.id,
      title,
      label: title,
      description: buildPlanDescription(plan),
      isRecommended,
      impactSummary,
      benefitTags,
      planType: String(plan.planType),
      actionCodes: plan.actionCodes,
      sourceSystem: input.risk.sourceRefs[0]?.sourceSystem ?? 'ENVIRONMENT_EVENT',
      sourceId: input.risk.sourceRefs[0]?.sourceId ?? input.cluster.clusterId,
      recommendationVersion: String(plan.planType),
      memberImpacts: buildMemberImpactsForRecommendation({
        risk: input.risk,
        label: title,
        description: buildPlanDescription(plan),
        impactSummary,
        affectedMembersScope: scope,
      }),
    };
    return dto;
  });
}

export function localizePlanTitle(plan: ExecutionRiskThreePlan): string {
  switch (plan.planType) {
    case RecommendationType.CONSERVATIVE:
      return '稳妥方案：优先避险';
    case RecommendationType.MINIMAL_CHANGE:
      return '最小改动：尽量保留原计划';
    case RecommendationType.UNAVAILABLE:
      return '暂无可行方案';
    case RecommendationType.RECOMMENDED:
    default:
      return '推荐方案：平衡安全与体验';
  }
}

export function buildBenefitTags(plan: ExecutionRiskThreePlan): string[] {
  const tags: string[] = [];
  const timeMid = midpoint(plan.timeDeltaMinutes);
  const timeTag = formatTimeDeltaTag(plan.timeDeltaMinutes);
  if (timeTag) tags.push(timeTag);
  else if (timeMid === 0) tags.push('时间基本不变');

  const safetyMid = midpoint(plan.safetyDelta);
  if (safetyMid >= 40) tags.push('显著提升安全');
  else if (safetyMid >= 15) tags.push('提升安全');
  else if (safetyMid > 0) tags.push('略增安全');

  const expMid = midpoint(plan.experienceRetention);
  if (expMid >= 85) tags.push('体验保留高');
  else if (expMid >= 70) tags.push('体验大部分保留');
  else if (expMid >= 50) tags.push('体验有取舍');
  else tags.push('体验让位于安全');

  if (plan.planType === RecommendationType.RECOMMENDED) tags.unshift('推荐');
  if (plan.planType === RecommendationType.CONSERVATIVE) tags.unshift('更稳妥');
  if (plan.planType === RecommendationType.MINIMAL_CHANGE) tags.unshift('改动小');

  return [...new Set(tags)].slice(0, 4);
}

function buildPlanDescription(plan: ExecutionRiskThreePlan): string {
  const actions = plan.actions
    .map((a) => a.label || a.actionCode)
    .filter(Boolean)
    .slice(0, 3);
  if (actions.length === 0) {
    return plan.unavailableReason ?? localizePlanTitle(plan);
  }
  return `调整动作：${actions.join('、')}`;
}

function formatTimeDeltaTag(range: { min: number; max: number }): string | undefined {
  const mid = midpoint(range);
  if (mid === 0 && range.min === 0 && range.max === 0) return undefined;
  if (mid > 0) return `+${Math.round(mid)}min`;
  if (mid < 0) return `${Math.round(mid)}min`;
  if (range.max > 0) return `+${range.min}~${range.max}min`;
  if (range.min < 0) return `${range.min}~${range.max}min`;
  return undefined;
}

function midpoint(range: { min: number; max: number }): number {
  return (range.min + range.max) / 2;
}

/** Enrich legacy env/advisory items with title + benefitTags for a stable client contract. */
export function enrichRecommendationPresentation(
  rec: ExecutionRiskRecommendationDto,
): ExecutionRiskRecommendationDto {
  const title = rec.title?.trim() || rec.label;
  const benefitTags =
    rec.benefitTags && rec.benefitTags.length > 0
      ? rec.benefitTags
      : buildLegacyBenefitTags(rec);
  return {
    ...rec,
    title,
    label: rec.label || title,
    benefitTags,
    isRecommended: rec.isRecommended ?? false,
  };
}

function buildLegacyBenefitTags(rec: ExecutionRiskRecommendationDto): string[] {
  const tags: string[] = [];
  if (rec.isRecommended) tags.push('推荐');
  if (rec.impactSummary?.trim()) tags.push(rec.impactSummary.trim());
  return tags.slice(0, 4);
}
