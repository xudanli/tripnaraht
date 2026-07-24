import { Injectable, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { TripsService } from '../../trips.service';
import { EnvironmentRadarService } from '../../in-trip-execution/services/environment-radar.service';
import { ExecutionAdvisoryService } from '../../trip-constraint-solver/services/execution-advisory.service';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { projectAttentionItemToRisk } from '../adapters/attention-queue-risk.adapter';
import { projectDecisionProblemToRisk } from '../adapters/decision-problem-risk.adapter';
import { projectEnvironmentEventToRisk } from '../adapters/environment-event-risk.adapter';
import type {
  ActiveRisk,
  AffectedRef,
  ExecutionRiskListQuery,
  ExecutionRiskSummaryRecommendation,
  RiskSourceProjection,
} from '../types/execution-risk.types';
import {
  filterActiveRisks,
  mergeRiskProjections,
  overlayUserState,
  resolveRiskById,
} from '../utils/risk-merge.util';
import { ExecutionRiskUserStateService } from './execution-risk-user-state.service';
import { ExecutionAdjustmentQueueContextService } from './execution-adjustment-queue-context.service';
import {
  deriveCausalRiskProjections,
  loadCausalChainsForRoots,
} from '../knowledge/causal-risk-derivation.util';
import { ActiveRiskKnowledgeEnrichmentService } from '../knowledge/active-risk-knowledge-enrichment.service';
import { ExecutionRiskKnowledgeRepositoryService } from '../knowledge/execution-risk-knowledge.repository';
import {
  enrichRiskWithTripMembers,
  memberNamesMapToAffectedRefs,
} from '../utils/execution-risk-member.util';
import { applyActiveRiskUserFacingCopy } from '../utils/active-risk-display-copy.util';
import { filterExecSlipCanaryRisks } from '../utils/exec-slip-canary-risk-scope.util';
import { filterKnowledgeNoiseForExecutionAlerts } from '../utils/execution-alert-knowledge-noise.util';

@Injectable()
export class ActiveRiskAggregationService {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly userState: ExecutionRiskUserStateService,
    @Optional() private readonly environmentRadar?: EnvironmentRadarService,
    @Optional() private readonly decisionReadModel?: UnifiedDecisionProblemReadModelService,
    @Optional() private readonly tripsService?: TripsService,
    @Optional() private readonly executionAdvisory?: ExecutionAdvisoryService,
    @Optional() private readonly adjustmentContext?: ExecutionAdjustmentQueueContextService,
    @Optional() private readonly knowledgeEnrichment?: ActiveRiskKnowledgeEnrichmentService,
    @Optional() private readonly knowledge?: ExecutionRiskKnowledgeRepositoryService,
  ) {}

  async listRisks(
    tripId: string,
    userId: string,
    query: ExecutionRiskListQuery = {},
  ): Promise<ActiveRisk[]> {
    await this.access.assertTripMember(tripId, userId);
    const merged = await this.buildMergedRisks(tripId, userId);
    return this.applyQuery(merged, query);
  }

  /** Rebuild merged risks for refresh snapshot (POST confirm / internal command). */
  async snapshotActiveRisks(tripId: string, userId: string): Promise<ActiveRisk[]> {
    return this.buildMergedRisks(tripId, userId);
  }

  async getRisk(tripId: string, riskId: string, userId: string): Promise<ActiveRisk | null> {
    const risks = await this.listRisks(tripId, userId);
    const risk = resolveRiskById(risks, riskId);
    if (!risk) return null;
    await this.userState.markViewed(tripId, risk.riskKey, userId);
    return risk;
  }

  async buildSummaryRecommendation(
    tripId: string,
    userId: string,
    activeRisks: ActiveRisk[],
  ): Promise<ExecutionRiskSummaryRecommendation | undefined> {
    if (activeRisks.length === 0) return undefined;

    let headline = '关注当前执行风险并合理调整行程节奏';
    let explanation = activeRisks
      .slice(0, 3)
      .map((r) => r.summary)
      .join('；');
    let recommendedAction = '查看各风险建议并按优先级处理';
    const recommendationIds = [...new Set(activeRisks.flatMap((r) => r.recommendationIds))];

    if (this.executionAdvisory) {
      try {
        const advisory = await this.executionAdvisory.getAdvisory(tripId, userId);
        const ai = advisory.causalInsight;
        headline = ai?.guardianHeadline ?? advisory.verdict.headline ?? headline;
        explanation = ai?.causalStory?.assessment ?? advisory.verdict.headline ?? explanation;
        recommendedAction = advisory.recommendations[0]?.label ?? recommendedAction;
        recommendationIds.push(...advisory.recommendations.map((r) => r.id));
      } catch {
        // advisory optional outside TRAVELING
      }
    }

    return {
      headline,
      explanation,
      recommendedAction,
      basedOnRiskIds: activeRisks.map((r) => r.id),
      recommendationIds: [...new Set(recommendationIds)],
      generatedAt: new Date().toISOString(),
      validUntil: activeRisks.find((r) => r.validUntil)?.validUntil,
    };
  }

  /** Collect raw projections — exposed for harness */
  async collectSourceProjections(tripId: string, userId: string): Promise<RiskSourceProjection[]> {
    const projections: RiskSourceProjection[] = [];

    if (this.environmentRadar) {
      try {
        const events = await this.environmentRadar.listOpenEvents(tripId, userId);
        const evaluatedAt = new Date().toISOString();
        for (const summary of events) {
          let eventForProjection = summary;
          if (summary.affectedItemCount > 0 || summary.alternativePlanCount > 0) {
            try {
              eventForProjection = await this.environmentRadar.getEvent(tripId, summary.id, userId);
            } catch {
              eventForProjection = summary;
            }
          }
          projections.push(
            projectEnvironmentEventToRisk(eventForProjection, {
              validUntil: DateTime.now().plus({ hours: 6 }).toISO(),
              referenceDate: DateTime.now().toISODate() ?? undefined,
              evaluatedAt,
            }),
          );
        }
      } catch {
        // in-trip phase gate
      }
    }

    if (this.decisionReadModel && isDecisionGatewayUnifiedEnabled()) {
      try {
        const list = await this.decisionReadModel.listProblems(tripId, { queueOnly: true });
        for (const item of list.items) {
          if (['RESOLVED', 'DISMISSED'].includes(item.workflowStatus)) continue;
          if (item.enforcement !== 'BLOCK' && item.enforcement !== 'REQUIRE_ADJUSTMENT') continue;
          projections.push(projectDecisionProblemToRisk(item));
        }
      } catch {
        // gateway optional
      }
    }

    if (this.tripsService) {
      try {
        const attention = await this.tripsService.getAttentionQueue({ tripId, limit: 50, offset: 0 });
        for (const item of attention.items) {
          if (item.severity !== 'critical' && item.severity !== 'high') continue;
          projections.push(projectAttentionItemToRisk(item));
        }
      } catch {
        // optional
      }
    }

    return projections;
  }

  private async buildMergedRisks(tripId: string, userId: string): Promise<ActiveRisk[]> {
    const [rawProjections, tripMembers] = await Promise.all([
      this.collectSourceProjections(tripId, userId),
      this.loadTripMemberRefs(tripId),
    ]);
    let projections = this.knowledgeEnrichment
      ? await this.knowledgeEnrichment.enrichProjections(rawProjections)
      : rawProjections;

    if (this.knowledgeEnrichment && this.knowledge) {
      projections = await this.deriveAndMergeCausalProjections(projections);
    }

    const merged = mergeRiskProjections(projections);
    const enriched = this.knowledgeEnrichment
      ? await this.knowledgeEnrichment.enrichRisks(merged)
      : merged;
    const active = filterActiveRisks(enriched).map((r) =>
      enrichRiskWithTripMembers(r, tripMembers),
    );
    const states = await this.userState.listForTripUser(tripId, userId);
    const stateByKey = new Map(states.map((s) => [s.riskKey, s]));
    const advisoryAssessment = await this.loadAdvisoryAssessmentText(tripId, userId);
    const advisoryCtx = advisoryAssessment ? { assessmentText: advisoryAssessment } : {};
    const scoped = filterExecSlipCanaryRisks(
      active.map((r) =>
        applyActiveRiskUserFacingCopy(overlayUserState(r, stateByKey.get(r.riskKey)), advisoryCtx),
      ),
      tripId,
    );
    return filterKnowledgeNoiseForExecutionAlerts(scoped);
  }

  private async loadAdvisoryAssessmentText(
    tripId: string,
    userId: string,
  ): Promise<string | undefined> {
    if (!this.executionAdvisory) return undefined;
    try {
      const advisory = await this.executionAdvisory.getAdvisory(tripId, userId);
      return advisory.causalInsight?.causalStory?.assessment ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async deriveAndMergeCausalProjections(
    projections: RiskSourceProjection[],
  ): Promise<RiskSourceProjection[]> {
    const merged = mergeRiskProjections(projections);
    const active = filterActiveRisks(merged);
    const enriched = await this.knowledgeEnrichment!.enrichRisks(active);
    const roots = enriched.filter((r) => r.isRootCause !== false && r.knowledgeCode);
    if (roots.length === 0) return projections;

    const chainsByRoot = await loadCausalChainsForRoots(roots, (code) =>
      this.knowledge!.findCausalChains(code),
    );
    const derivedProjections = deriveCausalRiskProjections(roots, chainsByRoot);
    if (derivedProjections.length === 0) return projections;

    const enrichedDerived = await this.knowledgeEnrichment!.enrichProjections(derivedProjections);
    return [...projections, ...enrichedDerived];
  }

  private async loadTripMemberRefs(tripId: string): Promise<AffectedRef[]> {
    if (!this.adjustmentContext) return [];
    try {
      const ctx = await this.adjustmentContext.load(tripId);
      return memberNamesMapToAffectedRefs(ctx.memberNamesById);
    } catch {
      return [];
    }
  }

  private applyQuery(risks: ActiveRisk[], query: ExecutionRiskListQuery): ActiveRisk[] {
    let out = risks;
    if (query.lifecycleStatus?.length) {
      const set = new Set(query.lifecycleStatus);
      out = out.filter((r) => set.has(r.lifecycleStatus));
    }
    if (query.acknowledgementStatus?.length) {
      const set = new Set(query.acknowledgementStatus);
      out = out.filter((r) => set.has(r.acknowledgementStatus));
    }
    if (query.treatmentStatus?.length) {
      const set = new Set(query.treatmentStatus);
      out = out.filter((r) => set.has(r.treatmentStatus));
    }
    if (query.level?.length) {
      const set = new Set(query.level);
      out = out.filter((r) => set.has(r.level));
    }
    if (query.type?.length) {
      const set = new Set(query.type);
      out = out.filter((r) => set.has(r.type));
    }
    return out;
  }
}
