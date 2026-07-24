import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import type { UnifiedDecisionProblemDetailView } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type {
  DecisionSpaceBundle,
  DecisionSpaceBundleQuery,
} from '../types/decision-space-bundle.types';
import type { PlanningDecisionInspector } from '../types/planning-decision-inspector.types';
import type { PlanningDecisionBasis } from '../types/planning-decision-basis.types';
import { PlanningDecisionBasisService } from './planning-decision-basis.service';
import { PlanningDecisionInspectorService } from './planning-decision-inspector.service';
import { PlanningDecisionCausalChainService } from './planning-decision-causal-chain.service';
import { PlanningOrchestratorFacadeService } from './planning-orchestrator-facade.service';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import {
  bundleNeedsBasis,
  bundleNeedsInspector,
  bundleNeedsPack,
  bundlePackIsFull,
  resolveBundleModules,
} from '../utils/decision-space-bundle.surface.util';
import {
  buildBundleEtag,
  buildBundleMeta,
  projectBundleNegotiation,
  projectBundleOrchestration,
  projectBundlePackFull,
  projectBundlePackSummary,
  projectBundleProblem,
  sliceInspectorForBundle,
} from '../utils/decision-space-bundle.projection.util';
import { buildInspectorTabEmptyState } from '../utils/planning-decision-inspector.projection.util';

@Injectable()
export class DecisionSpaceBundleService {
  constructor(
    private readonly basisService: PlanningDecisionBasisService,
    private readonly inspectorService: PlanningDecisionInspectorService,
    private readonly causalChainService: PlanningDecisionCausalChainService,
    private readonly orchestrator: PlanningOrchestratorFacadeService,
    private readonly proposalStore: PlanProposalStoreService,
    @Optional() private readonly gateway?: DecisionEngineGatewayService,
  ) {}

  async getBundle(
    tripId: string,
    query: DecisionSpaceBundleQuery,
    opts?: { userId?: string },
  ): Promise<DecisionSpaceBundle> {
    const problemId = query.problemId?.trim();
    const proposalId = query.proposalId?.trim();
    const conflictId = query.conflictId?.trim() ?? query.focusConflictId?.trim();
    const optionId = query.optionId?.trim();

    if (!problemId && !proposalId) {
      throw new BadRequestException('problemId 或 proposalId 至少填一项');
    }

    const orchestrationState = this.orchestrator.getOrchestrationState(tripId);
    const resolvedProposalId = proposalId ?? orchestrationState.activeProposalId;
    const { included, deferred } = resolveBundleModules(query);
    const surfaceKey = query.include?.trim() || query.surface?.trim() || 'default';
    const tripVersion = `tv_${orchestrationState.contextVersion}`;
    const mode = problemId ? 'problem' : 'proposal';

    const needsProblemDetail =
      !!problemId &&
      (included.includes('problem') || included.includes('negotiation'));

    const problemDetail = needsProblemDetail
      ? await this.loadProblemDetail(tripId, problemId, {
          userId: opts?.userId,
          focusConflictId: conflictId,
        })
      : null;

    const [basis, inspectorBase] = await Promise.all([
      this.loadBasis(tripId, included, {
        problemId,
        proposalId: resolvedProposalId,
        conflictId,
      }),
      this.loadInspectorBase(tripId, included, {
        problemId,
        proposalId: resolvedProposalId,
        optionId,
        conflictId,
        userId: opts?.userId,
      }),
    ]);

    const pack = this.loadPack(tripId, included, resolvedProposalId);

    let inspectorFull: PlanningDecisionInspector | undefined = inspectorBase;
    if (inspectorFull && included.includes('inspector.causalChain')) {
      inspectorFull = await this.enrichInspectorCausalChain(
        tripId,
        inspectorFull,
        resolvedProposalId,
        problemId,
        optionId,
        opts?.userId,
      );
    }
    const inspector = inspectorFull
      ? sliceInspectorForBundle(
          inspectorFull,
          included,
          included.includes('basis'),
        )
      : undefined;

    const pendingProposalCount = this.countPendingProposals(tripId);
    const orchestration =
      included.includes('orchestration')
        ? projectBundleOrchestration(orchestrationState, pendingProposalCount)
        : undefined;

    const negotiation =
      included.includes('negotiation') && problemDetail
        ? projectBundleNegotiation(problemDetail.negotiation)
        : undefined;

    const binding = {
      problemId,
      proposalId: resolvedProposalId,
      conflictId,
      optionId,
      mode: mode as 'problem' | 'proposal',
    };

    const etag = buildBundleEtag({
      tripVersion,
      problemId,
      proposalId: resolvedProposalId,
      optionId,
      surfaceKey,
    });

    const previewRequiredForPlanDiff =
      included.includes('inspector.planDiff') &&
      !!problemId &&
      !resolvedProposalId &&
      (inspector?.planDiff?.changeRows.length ?? 0) === 0;

    const meta = buildBundleMeta({
      tripId,
      included,
      deferred,
      inspector,
      problemId,
      proposalId: resolvedProposalId,
      optionId,
      conflictId,
      previewRequiredForPlanDiff,
    });

    return {
      schema: 'tripnara.decision_space_bundle@v1',
      tripId,
      generatedAt: new Date().toISOString(),
      tripVersion,
      etag,
      binding,
      ...(problemDetail ? { problem: projectBundleProblem(problemDetail) } : {}),
      ...(basis ? { basis } : {}),
      ...(pack ? { pack } : {}),
      ...(inspector ? { inspector } : {}),
      ...(negotiation ? { negotiation } : {}),
      ...(orchestration ? { orchestration } : {}),
      meta,
    };
  }

  private async loadProblemDetail(
    tripId: string,
    problemId: string | undefined,
    opts: { userId?: string; focusConflictId?: string },
  ): Promise<UnifiedDecisionProblemDetailView | null> {
    if (!problemId) return null;
    if (!isDecisionGatewayUnifiedEnabled() || !this.gateway) {
      throw new BadRequestException('Decision Gateway 未启用，无法加载 problem 模块');
    }
    try {
      return await this.gateway.getProblem(tripId, problemId, {
        userId: opts.userId,
        focusConflictId: opts.focusConflictId,
      });
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException(`决策问题 ${problemId} 不存在或已过期`);
      }
      throw e;
    }
  }

  private async loadBasis(
    tripId: string,
    included: ReturnType<typeof resolveBundleModules>['included'],
    opts: {
      problemId?: string;
      proposalId?: string;
      conflictId?: string;
    },
  ): Promise<PlanningDecisionBasis | undefined> {
    if (!bundleNeedsBasis(included)) return undefined;
    return this.basisService.getBasis(tripId, {
      problemId: opts.problemId,
      proposalId: opts.proposalId,
      conflictId: opts.conflictId,
    });
  }

  private loadPack(
    tripId: string,
    included: ReturnType<typeof resolveBundleModules>['included'],
    proposalId?: string,
  ) {
    if (!bundleNeedsPack(included) || !proposalId) return undefined;
    const proposal = this.proposalStore.get(proposalId);
    if (!proposal || proposal.tripId !== tripId || !proposal.decisionPack) {
      return undefined;
    }
    const pack = proposal.decisionPack;
    return bundlePackIsFull(included)
      ? projectBundlePackFull(pack)
      : projectBundlePackSummary(pack);
  }

  private async loadInspectorBase(
    tripId: string,
    included: ReturnType<typeof resolveBundleModules>['included'],
    opts: {
      problemId?: string;
      proposalId?: string;
      optionId?: string;
      conflictId?: string;
      userId?: string;
    },
  ): Promise<PlanningDecisionInspector | undefined> {
    if (!bundleNeedsInspector(included)) return undefined;
    if (!opts.problemId && !opts.proposalId) return undefined;

    return this.inspectorService.getInspector(tripId, {
      problemId: opts.problemId,
      proposalId: opts.proposalId,
      optionId: opts.optionId,
      conflictId: opts.conflictId,
      userId: opts.userId,
    });
  }

  private async enrichInspectorCausalChain(
    tripId: string,
    inspector: PlanningDecisionInspector,
    proposalId?: string,
    problemId?: string,
    optionId?: string,
    userId?: string,
  ): Promise<PlanningDecisionInspector> {
    const causalChain = await this.causalChainService.getChain(tripId, {
      proposalId,
      problemId,
      optionId: optionId ?? inspector.optionId,
      userId,
    });
    const planDiffRowCount = inspector.planDiff?.changeRows.length ?? 0;
    const memberHasStance =
      (inspector.memberConsensus?.supportCount ?? 0) > 0 ||
      (inspector.memberConsensus?.objectionCount ?? 0) > 0;

    return {
      ...inspector,
      causalChain,
      tabEmptyState: buildInspectorTabEmptyState({
        causalChainNodeCount: causalChain.nodes.length,
        planDiffRowCount,
        memberHasStance,
        hasProposal: inspector.mode === 'proposal',
      }),
    };
  }

  private countPendingProposals(tripId: string): number {
    return this.proposalStore
      .listByTrip(tripId, ['AWAITING_CONFIRMATION', 'PREVIEW'])
      .length;
  }
}
