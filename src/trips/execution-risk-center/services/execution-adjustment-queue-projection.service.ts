import { Injectable, Optional } from '@nestjs/common';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { ConsumerDecisionQueueService } from '../../travel-status/services/consumer-decision-queue.service';
import type {
  ExecutionAdjustmentQueueDto,
  ExecutionInterventionType,
} from '../../../mobile/dto/mobile-execution.types';
import {
  dedupeInterventions,
  enrichInterventionWithRiskLinks,
  projectActiveRiskToIntervention,
} from '../adapters/active-risk-intervention.adapter';
import {
  enrichInterventionWithCluster,
  projectClusterToIntervention,
} from '../adapters/risk-cluster-intervention.adapter';
import { resolvePrimaryRiskId } from '../utils/execution-alerts-aggregation.util';
import {
  buildExecutionRiskClusters,
  findClusterForRisk,
  shouldSuppressDerivedDecisionItem,
} from '../utils/execution-risk-cluster.util';
import { ActiveRiskAggregationService } from './active-risk-aggregation.service';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import {
  EXECUTION_ADJUSTMENT_QUEUE_SCHEMA_ID,
  prioritySortWeight,
  projectConsumerToIntervention,
} from '../utils/execution-intervention.projection.util';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import { buildDecisionQueueHeadline } from '../../travel-status/utils/consumer-decision-item.projection.util';
import { enrichInterventionWithUserNarrative } from '../utils/execution-user-narrative.projection.util';
import type { TepErcBridgeService } from '../../tep/services/tep-erc-bridge.service';
import { AttentionPrimarySsoCutoverService } from '../../guardian-decision-core/attention/attention-primary-sso-cutover.service';
import {
  applyOptionalNarratorEnhancement,
  ExecutionUserNarrativeNarratorService,
} from './execution-user-narrative-narrator.service';
import { TepPlanMetadataService } from '../../tep/services/tep-plan-metadata.service';
import { attachRecoveryGraphToInterventions } from '../utils/execution-recovery-graph-enrichment.util';
import {
  enrichInterventionWithAttentionPrimary,
  filterInterventionsForPrimarySso,
  findAttentionPrimaryForIntervention,
  isMealWindowPlanObjectIntervention,
  mergePrimaryCascadeIntoUserNarrative,
} from '../../guardian-decision-core/attention/attention-primary-sso-cutover.util';
import { isScheduleTightnessRisk } from '../utils/execution-intervention.projection.util';
import { shouldSuppressAlertOnlyEnvironmentCluster } from '../utils/execution-adjustment-queue-environment.util';

export interface ExecutionAdjustmentQueueContext {
  memberNamesById: Map<string, string>;
  activityTitleById: Map<string, string>;
  actionDeadline?: string;
}

@Injectable()
export class ExecutionAdjustmentQueueProjectionService {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly aggregation: ActiveRiskAggregationService,
    private readonly decisionQueue: ConsumerDecisionQueueService,
    @Optional() private readonly decisionReadModel?: UnifiedDecisionProblemReadModelService,
    @Optional() private readonly tepErcBridge?: TepErcBridgeService,
    @Optional() private readonly primarySsoCutover?: AttentionPrimarySsoCutoverService,
    @Optional() private readonly planMetadata?: TepPlanMetadataService,
    @Optional() private readonly narrator?: ExecutionUserNarrativeNarratorService,
  ) {}

  async getAdjustmentQueue(
    tripId: string,
    userId: string,
    ctx: ExecutionAdjustmentQueueContext,
  ): Promise<ExecutionAdjustmentQueueDto> {
    await this.access.assertTripMember(tripId, userId);

    const [queue, listView, risks] = await Promise.all([
      this.decisionQueue.getQueue(tripId, { hydrateRecommendations: true }),
      isDecisionGatewayUnifiedEnabled() && this.decisionReadModel
        ? this.decisionReadModel.listProblems(tripId, { queueOnly: true }).catch(() => null)
        : Promise.resolve(null),
      this.aggregation.listRisks(tripId, userId),
    ]);

    const listById = new Map<string, UnifiedDecisionProblemListItem>(
      (listView?.items ?? []).map((item) => [item.problemId, item as UnifiedDecisionProblemListItem]),
    );

    const clusters = buildExecutionRiskClusters(risks);
    const clusterByPrimary = new Map(clusters.map((c) => [c.primaryRiskId, c]));

    const fromDecision = queue.items
      .map((consumer) => {
        const intervention = enrichInterventionWithRiskLinks(
          projectConsumerToIntervention({
            consumer,
            listItem: listById.get(consumer.problemId) ?? undefined,
            tripId,
            memberNamesById: ctx.memberNamesById,
            activityTitleById: ctx.activityTitleById,
            actionDeadline: ctx.actionDeadline,
          }),
          risks,
          { memberNamesById: ctx.memberNamesById },
        );
        const primaryRiskId = intervention.primaryRiskId
          ? resolvePrimaryRiskId(risks, intervention.primaryRiskId)
          : undefined;
        const linked = primaryRiskId && primaryRiskId !== intervention.primaryRiskId
          ? {
              ...intervention,
              primaryRiskId,
              linkedRiskIds: [...new Set([...(intervention.linkedRiskIds ?? []), primaryRiskId])],
            }
          : intervention;

        if (
          shouldSuppressDerivedDecisionItem({
            linkedRiskIds: linked.linkedRiskIds ?? [],
            decisionProblemId: linked.decisionProblemId,
            clusters,
            risks,
          })
        ) {
          return null;
        }

        const cluster =
          (primaryRiskId && clusterByPrimary.get(primaryRiskId)) ??
          findClusterForRisk(clusters, linked.linkedRiskIds?.[0] ?? '');
        if (cluster) {
          return enrichInterventionWithCluster(linked, cluster, risks);
        }
        return linked;
      })
      .filter((i): i is NonNullable<typeof i> => i != null);

    const coveredRiskIds = new Set(fromDecision.flatMap((i) => i.linkedRiskIds ?? []));
    const coveredClusterIds = new Set(
      fromDecision.map((i) => i.clusterId).filter((id): id is string => Boolean(id)),
    );

    const fromClusters = clusters
      .filter((c) => !coveredClusterIds.has(c.clusterId))
      .map((c) => {
        const item = projectClusterToIntervention(c, risks, tripId, ctx.actionDeadline);
        if (item) {
          for (const rid of c.relatedRiskIds) coveredRiskIds.add(rid);
          coveredClusterIds.add(c.clusterId);
        }
        return item;
      })
      .filter((i): i is NonNullable<typeof i> => i != null);

    const fromRisks = risks
      .filter((r) => !coveredRiskIds.has(r.id))
      .filter((r) => !isScheduleTightnessRisk(r))
      .map((r) => projectActiveRiskToIntervention(r, tripId, ctx.actionDeadline))
      .filter((i): i is NonNullable<typeof i> => i != null);

    let items = dedupeInterventions([...fromDecision, ...fromClusters, ...fromRisks])
      .sort((a, b) => prioritySortWeight(a.priority) - prioritySortWeight(b.priority));

    const semanticByProblemId = new Map(
      [...listById.entries()].map(([id, row]) => [id, row.semanticKey]),
    );
    items = items.filter(
      (item) => !isMealWindowPlanObjectIntervention(item, semanticByProblemId),
    );
    items = items.filter(
      (item) => !shouldSuppressAlertOnlyEnvironmentCluster(item, clusters, risks),
    );

    const cutoverPlan = await this.primarySsoCutover?.loadCutoverPlan(tripId);
    if (cutoverPlan) {
    items = filterInterventionsForPrimarySso(items, cutoverPlan, semanticByProblemId).map((item) => {
        const attentionPrimary = findAttentionPrimaryForIntervention(item, cutoverPlan);
        const enriched = attentionPrimary
          ? enrichInterventionWithAttentionPrimary(item, attentionPrimary)
          : item;
        return mergePrimaryCascadeIntoUserNarrative(
          enrichInterventionWithUserNarrative(enriched),
        );
      });
    } else {
      items = items.map((item) => enrichInterventionWithUserNarrative(item));
    }

    const tepLoaded = await this.planMetadata?.loadTepMetadata(tripId).catch(() => null);
    if (tepLoaded?.tep?.recoveryGraph?.fallbackOptions?.length) {
      items = attachRecoveryGraphToInterventions(
        items,
        tepLoaded.tep.recoveryGraph,
        tepLoaded.planVersionId,
      ).map((item) =>
        mergePrimaryCascadeIntoUserNarrative(enrichInterventionWithUserNarrative(item)),
      );
    }

    const countsByType: Record<ExecutionInterventionType, number> = {
      SAFETY_INTERVENTION: 0,
      DYNAMIC_REPLAN: 0,
      TEAM_COORDINATION: 0,
      EXECUTION_PREPARATION: 0,
    };
    for (const item of items) {
      countsByType[item.type] += 1;
    }

    const pendingCount = items.length;
    const criticalCount = items.filter((i) => i.priority === 'CRITICAL').length;

    const baseQueue: ExecutionAdjustmentQueueDto = {
      schemaId: EXECUTION_ADJUSTMENT_QUEUE_SCHEMA_ID,
      tripId,
      contextVersion: 0,
      projectionSource: 'execution_risk_center',
      pendingCount,
      criticalCount,
      highPriorityCount: items.filter(
        (i) => i.priority === 'HIGH' || i.priority === 'CRITICAL',
      ).length,
      headline: buildAdjustmentQueueHeadline(items),
      items,
      countsByType,
      linkedActiveRiskCount: risks.filter(
        (r) =>
          r.treatmentStatus === 'ACTION_REQUIRED' ||
          r.treatmentStatus === 'DECISION_REQUIRED',
      ).length,
      ...(cutoverPlan
        ? {
            projectionSource: 'execution_risk_center+attention_primary_sso',
          }
        : {}),
      riskClusters: clusters.map((c) => ({
        clusterId: c.clusterId,
        primaryRiskId: c.primaryRiskId,
        relatedRiskIds: c.relatedRiskIds,
        rootCauseCode: c.rootCauseCode,
        severity: c.severity,
        adjustmentType: c.adjustmentType,
        consequenceCount: c.consequenceImpacts.length,
      })),
      generatedAt: new Date().toISOString(),
    };

    if (this.tepErcBridge) {
      const enriched = await this.tepErcBridge.enrichAdjustmentQueue(tripId, baseQueue);
      return this.applyOptionalNarratorToQueue(tripId, enriched);
    }

    return this.applyOptionalNarratorToQueue(tripId, baseQueue);
  }

  private async applyOptionalNarratorToQueue(
    tripId: string,
    queue: ExecutionAdjustmentQueueDto,
  ): Promise<ExecutionAdjustmentQueueDto> {
    if (!this.narrator?.isEnabled()) return queue;

    const loaded = await this.planMetadata?.loadTepMetadata(tripId).catch(() => null);
    const recoveryGraph = loaded?.tep?.recoveryGraph;

    const items = await Promise.all(
      queue.items.map(async (item) => {
        if (!item.userNarrative) return item;
        const narrative = await applyOptionalNarratorEnhancement(
          {
            tripId,
            place: item.userNarrative.affected?.route,
            activities: item.userNarrative.affected?.activities,
            deadline: item.actionDeadline,
            recoveryGraph,
            ruleNarrative: item.userNarrative,
          },
          this.narrator,
        );
        return enrichInterventionWithUserNarrative({ ...item, userNarrative: narrative });
      }),
    );

    return { ...queue, items };
  }
}

/** Headline + counts must derive from the same projected items[] list. */
function buildAdjustmentQueueHeadline(
  items: ExecutionAdjustmentQueueDto['items'],
): string {
  const pending = items.length;
  if (pending <= 0) return '暂无待调整事项';
  const blocking = items.filter(
    (i) =>
      i.priority === 'CRITICAL' ||
      (i.requiresConfirmation && i.type === 'SAFETY_INTERVENTION'),
  ).length;
  return buildDecisionQueueHeadline(pending, blocking);
}
