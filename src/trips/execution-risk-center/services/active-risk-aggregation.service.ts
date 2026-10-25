import { Injectable, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { TripsService } from '../../trips.service';
import { EnvironmentRadarService } from '../../in-trip-execution/services/environment-radar.service';
import { ExecutionAdvisoryService } from '../../trip-constraint-solver/services/execution-advisory.service';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { projectDecisionProblemToRisk } from '../adapters/decision-problem-risk.adapter';
import {
  attachRiskId,
  projectEnvironmentEventToRisk,
} from '../adapters/environment-event-risk.adapter';
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
import { deriveRiskId } from '../utils/risk-key.util';
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
    await this.access.assertTripMember(tripId, userId);
    if (!riskId?.trim()) return null;

    // 详情页优先环境快路径（秒级）；勿先等全量 buildMergedRisks（曾 15s+ 导致 App 详情一直转圈）
    const envLite = await this.listEnvironmentOnlyRisks(tripId, userId, { lite: true });
    let risk =
      resolveRiskById(envLite, riskId) ??
      (await this.resolveEnvironmentRiskAlias(tripId, userId, riskId, envLite, { lite: true }));

    if (!risk) {
      // 全量合并在高负载下可达 15s+；详情壳必须有上限，超时则 404 而不是无限转圈
      const risks = await Promise.race([
        this.buildMergedRisks(tripId, userId),
        new Promise<ActiveRisk[]>((resolve) => setTimeout(() => resolve([]), 2_500)),
      ]);
      if (risks.length > 0) {
        risk =
          resolveRiskById(risks, riskId) ??
          (await this.resolveEnvironmentRiskAlias(tripId, userId, riskId, risks, { lite: true }));
      }
    }

    if (!risk) return null;

    if (this.knowledgeEnrichment && risk.knowledgeCode == null) {
      try {
        const [enriched] = await this.knowledgeEnrichment.enrichRisks([risk]);
        if (enriched) risk = enriched;
      } catch {
        // enrichment optional for detail shell
      }
    }

    await this.userState.markViewed(tripId, risk.riskKey, userId);
    return risk;
  }

  /**
   * 仅环境事件投影（与 collectSourceProjections 同源 hydrate），供 alerts 快路径与详情 ID 对齐。
   * lite=true：跳过 getEvent hydrate + knowledge enrich，保证高负载下仍能秒级返回稳定 ID。
   */
  async listEnvironmentOnlyRisks(
    tripId: string,
    userId: string,
    opts?: { lite?: boolean },
  ): Promise<ActiveRisk[]> {
    await this.access.assertTripMember(tripId, userId);
    const projections = await this.collectEnvironmentProjections(tripId, userId, {
      lite: opts?.lite === true,
    });
    if (opts?.lite || !this.knowledgeEnrichment) {
      return filterActiveRisks(mergeRiskProjections(projections));
    }
    const enrichedProjections = await this.knowledgeEnrichment.enrichProjections(projections);
    const merged = filterActiveRisks(mergeRiskProjections(enrichedProjections));
    const enriched = await this.knowledgeEnrichment.enrichRisks(merged);
    return filterKnowledgeNoiseForExecutionAlerts(enriched);
  }

  /**
   * 将 summary-only 或 hydrated 环境风险 ID 解析到 canonical ActiveRisk（优先 list 结果）。
   */
  private async resolveEnvironmentRiskAlias(
    tripId: string,
    userId: string,
    riskId: string,
    canonicalRisks: ActiveRisk[],
    aliasOpts?: { lite?: boolean },
  ): Promise<ActiveRisk | null> {
    if (!this.environmentRadar) return null;
    try {
      const events = await this.environmentRadar.listOpenEvents(tripId, userId);
      const evaluatedAt = new Date().toISOString();
      const opts = {
        validUntil: DateTime.now().plus({ hours: 6 }).toISO(),
        referenceDate: DateTime.now().toISODate() ?? undefined,
        evaluatedAt,
      };
      for (const summary of events) {
        const summaryProj = projectEnvironmentEventToRisk(summary, opts);
        const summaryId = deriveRiskId(tripId, summaryProj.riskKey);

        // lite：只用 summary ID；仍把「仅 summary 命中」的 canonical 风险返回（与 alerts 快路径对齐）
        if (aliasOpts?.lite) {
          if (riskId === summaryId) {
            return (
              resolveRiskById(canonicalRisks, summaryId) ??
              canonicalRisks.find((r) => r.rootEventId === summary.id) ??
              null
            );
          }
          // 旧 hydrated ID：短超时尝试 getEvent，失败则按 rootEvent 回退到 summary 风险
          let detailId: string | null = null;
          if (summary.affectedItemCount > 0 || summary.alternativePlanCount > 0) {
            try {
              const detail = await Promise.race([
                this.environmentRadar.getEvent(tripId, summary.id, userId),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 400)),
              ]);
              if (detail) {
                detailId = deriveRiskId(
                  tripId,
                  projectEnvironmentEventToRisk(detail, opts).riskKey,
                );
              }
            } catch {
              detailId = null;
            }
          }
          if (detailId && riskId === detailId) {
            return (
              resolveRiskById(canonicalRisks, summaryId) ??
              canonicalRisks.find((r) => r.rootEventId === summary.id) ??
              null
            );
          }
          continue;
        }

        let detail = summary as Parameters<typeof projectEnvironmentEventToRisk>[0];
        if (summary.affectedItemCount > 0 || summary.alternativePlanCount > 0) {
          try {
            detail = await this.environmentRadar.getEvent(tripId, summary.id, userId);
          } catch {
            detail = summary;
          }
        }
        const detailId = deriveRiskId(tripId, projectEnvironmentEventToRisk(detail, opts).riskKey);
        if (riskId !== summaryId && riskId !== detailId) continue;

        const byDetail = resolveRiskById(canonicalRisks, detailId);
        if (byDetail) return byDetail;

        const envOnly = await this.listEnvironmentOnlyRisks(tripId, userId);
        return (
          resolveRiskById(envOnly, detailId) ??
          resolveRiskById(envOnly, summaryId) ??
          envOnly.find((r) => r.rootEventId === summary.id) ??
          null
        );
      }
    } catch {
      return null;
    }
    return null;
  }

  private async collectEnvironmentProjections(
    tripId: string,
    userId: string,
    opts?: { lite?: boolean },
  ): Promise<RiskSourceProjection[]> {
    const projections: RiskSourceProjection[] = [];
    if (!this.environmentRadar) return projections;
    try {
      // 一次拉详情（含 alternativePlans），lite 也保留方案 ID，避免卡片建议空泛、recommendations 对不上
      const events =
        typeof this.environmentRadar.listOpenEventDetails === 'function'
          ? await this.environmentRadar.listOpenEventDetails(tripId, userId)
          : await this.environmentRadar.listOpenEvents(tripId, userId).then(async (summaries) => {
              const details = [];
              for (const summary of summaries) {
                if (opts?.lite) {
                  details.push(summary);
                  continue;
                }
                if (summary.affectedItemCount > 0 || summary.alternativePlanCount > 0) {
                  try {
                    details.push(
                      await this.environmentRadar!.getEvent(tripId, summary.id, userId),
                    );
                  } catch {
                    details.push(summary);
                  }
                } else {
                  details.push(summary);
                }
              }
              return details;
            });
      const evaluatedAt = new Date().toISOString();
      for (const event of events) {
        projections.push(
          projectEnvironmentEventToRisk(event, {
            validUntil: DateTime.now().plus({ hours: 6 }).toISO(),
            referenceDate: DateTime.now().toISODate() ?? undefined,
            evaluatedAt,
          }),
        );
      }
    } catch {
      // in-trip phase gate
    }
    return projections;
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
    const projections: RiskSourceProjection[] = [
      ...(await this.collectEnvironmentProjections(tripId, userId)),
    ];

    if (this.decisionReadModel && isDecisionGatewayUnifiedEnabled()) {
      try {
        // 仅读投影，禁止 refresh/collect，避免 listRisks ↔ listProblems ↔ getReportFast 环
        const list = await Promise.race([
          this.decisionReadModel.listProblems(tripId, {
            queueOnly: true,
            skipCausalEnrich: true,
            projectionOnly: true,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
        ]);
        if (list) {
          for (const item of list.items) {
            if (['RESOLVED', 'DISMISSED'].includes(item.workflowStatus)) continue;
            if (item.enforcement !== 'BLOCK' && item.enforcement !== 'REQUIRE_ADJUSTMENT') continue;
            projections.push(projectDecisionProblemToRisk(item));
          }
        }
      } catch {
        // gateway optional
      }
    }

    // Attention 会触发 feasibility/conflicts；ERC 读路径跳过，环境事件 + decision 足够投影活跃风险
    // （避免 listRisks → attention → SmartRoutes 再次拖死 execution-alerts）

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
      const advisory = await Promise.race([
        this.executionAdvisory.getAdvisory(tripId, userId),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_500)),
      ]);
      return advisory?.causalInsight?.causalStory?.assessment ?? undefined;
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
