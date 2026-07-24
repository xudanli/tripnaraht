import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EnvironmentRadarService } from '../../in-trip-execution/services/environment-radar.service';
import { ExecutionAdvisoryService } from '../../trip-constraint-solver/services/execution-advisory.service';
import type { ExecutionRiskRecommendationDto } from '../types/execution-risk.types';
import { ActiveRiskAggregationService } from './active-risk-aggregation.service';
import {
  buildMemberImpactsForRecommendation,
  resolveAffectedMembersScope,
} from '../utils/execution-risk-member.util';
import { loadExecutionRiskKnowledgeFromPackage } from '../knowledge/execution-risk-knowledge.loader';
import {
  generateThreePlansFromKnowledge,
  type ExecutionRiskThreePlan,
} from '../utils/execution-risk-three-plan-generator.util';
import { buildExecutionRiskClusters } from '../utils/execution-risk-cluster.util';
import {
  enrichRecommendationPresentation,
  mapThreePlansToRecommendations,
} from '../utils/execution-risk-recommendation.projection.util';
import { resolveRiskById } from '../utils/risk-merge.util';

@Injectable()
export class ExecutionRiskRecommendationService {
  constructor(
    private readonly aggregation: ActiveRiskAggregationService,
    @Optional() private readonly environmentRadar?: EnvironmentRadarService,
    @Optional() private readonly executionAdvisory?: ExecutionAdvisoryService,
  ) {}

  async listForRisk(
    tripId: string,
    riskId: string,
    userId: string,
  ): Promise<ExecutionRiskRecommendationDto[]> {
    const risk = await this.aggregation.getRisk(tripId, riskId, userId);
    if (!risk) {
      throw new NotFoundException(`风险 ${riskId} 不存在`);
    }

    const out: ExecutionRiskRecommendationDto[] = [];

    for (const ref of risk.sourceRefs) {
      if (ref.sourceSystem === 'ENVIRONMENT_EVENT' && this.environmentRadar) {
        try {
          const detail = await this.environmentRadar.getEvent(tripId, ref.sourceId, userId);
          for (const plan of detail.alternativePlans ?? []) {
            out.push({
              id: `env-rec-${ref.sourceId}-${plan.planId}`,
              riskId: risk.id,
              title: plan.name,
              label: plan.name,
              description: plan.description,
              isRecommended: out.length === 0,
              impactSummary: plan.timeAdjustment,
              sourceSystem: 'ENVIRONMENT_EVENT',
              sourceId: ref.sourceId,
              recommendationVersion: plan.planId,
            });
          }
        } catch {
          // event may have closed
        }
      }
    }

    if (this.executionAdvisory && risk.recommendationIds.length > 0) {
      try {
        const advisory = await this.executionAdvisory.getAdvisory(tripId, userId);
        for (const rec of advisory.recommendations) {
          if (!risk.recommendationIds.includes(rec.id)) continue;
          out.push({
            id: rec.id,
            riskId: risk.id,
            title: rec.label,
            label: rec.label,
            description: rec.description,
            isRecommended: rec.isRecommended,
            impactSummary: rec.impactSummary,
            sourceSystem: 'DECISION_PROBLEM',
            sourceId: risk.decisionProblemIds[0] ?? rec.id,
            recommendationVersion: rec.id,
            validUntil: advisory.verdict.validUntil,
          });
        }
      } catch {
        // optional
      }
    }

    // Knowledge three-plans fill the gap so clients never fall back to hardcoded A/B/C
    // when an active risk / pending adjustment exists but env/advisory sources are empty.
    if (out.length === 0) {
      const knowledgePlans = await this.listThreePlansForRisk(tripId, risk.id, userId);
      const risks = await this.aggregation.listRisks(tripId, userId);
      const clusters = buildExecutionRiskClusters(risks);
      const cluster =
        clusters.find((c) => c.primaryRiskId === risk.id) ??
        clusters.find((c) => c.relatedRiskIds.includes(risk.id));
      if (cluster && knowledgePlans.length > 0) {
        out.push(
          ...mapThreePlansToRecommendations({
            risk,
            cluster,
            plans: knowledgePlans,
          }),
        );
      }
    }

    // Last-resort stub so GET never returns empty items for a resolvable active risk
    if (out.length === 0) {
      for (const recId of risk.recommendationIds) {
        if (out.some((r) => r.id === recId)) continue;
        out.push({
          id: recId,
          riskId: risk.id,
          title: '查看建议',
          label: '查看建议',
          description: risk.summary,
          isRecommended: out.length === 0,
          sourceSystem: risk.sourceRefs[0]?.sourceSystem ?? 'ENVIRONMENT_EVENT',
          sourceId: risk.sourceRefs[0]?.sourceId ?? recId,
          recommendationVersion: recId,
        });
      }
    }

    if (out.length === 0) {
      out.push({
        id: `rec_${risk.id}_RECOMMENDED`,
        riskId: risk.id,
        title: '推荐方案：按当前风险调整行程',
        label: '推荐方案：按当前风险调整行程',
        description: risk.summary || risk.title,
        isRecommended: true,
        benefitTags: ['推荐', '需确认'],
        sourceSystem: risk.sourceRefs[0]?.sourceSystem ?? 'ENVIRONMENT_EVENT',
        sourceId: risk.sourceRefs[0]?.sourceId ?? risk.id,
        recommendationVersion: 'RECOMMENDED',
      });
    }

    const withMembers = out.map((rec) => ({
      ...rec,
      memberImpacts:
        rec.memberImpacts ??
        buildMemberImpactsForRecommendation({
          risk,
          label: rec.title ?? rec.label,
          description: rec.description,
          impactSummary: rec.impactSummary,
          affectedMembersScope: resolveAffectedMembersScope({ risks: [risk] }),
        }),
    }));

    return withMembers.map(enrichRecommendationPresentation);
  }

  async listThreePlansForRisk(
    tripId: string,
    riskId: string,
    userId: string,
  ): Promise<ExecutionRiskThreePlan[]> {
    const risks = await this.aggregation.listRisks(tripId, userId);
    const risk = resolveRiskById(risks, riskId);
    if (!risk) {
      throw new NotFoundException(`风险 ${riskId} 不存在`);
    }

    const clusters = buildExecutionRiskClusters(risks);
    const cluster =
      clusters.find((c) => c.primaryRiskId === risk.id) ??
      clusters.find((c) => c.relatedRiskIds.includes(risk.id));
    if (!cluster) return [];

    const snapshot = loadExecutionRiskKnowledgeFromPackage();
    return generateThreePlansFromKnowledge({
      cluster,
      risks,
      actionsByCode: snapshot.actionsByCode,
    });
  }
}
