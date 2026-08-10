import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TripConflictsService } from '../../services/trip-conflicts.service';
import { TripSilentVoteService } from '../../silent-vote/services/trip-silent-vote.service';
import type { PlanningDecisionInspector } from '../types/planning-decision-inspector.types';
import type { PlanProposal } from '../types/plan-proposal.types';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import { PlanningDecisionCausalChainService } from './planning-decision-causal-chain.service';
import { PlanningDecisionBasisService } from './planning-decision-basis.service';
import { PlanningProposalMonitorService } from './planning-proposal-monitor.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import {
  buildEmptyInspectorMemberConsensus,
  buildEmptyInspectorPlanDiff,
  buildInspectorFeasibility,
  buildInspectorFeasibilityForProblem,
  buildInspectorFeasibilityFromPreview,
  buildInspectorMemberConsensus,
  buildInspectorPlanDiff,
  buildInspectorPlanDiffFromPreview,
  buildInspectorRefreshUrl,
  buildInspectorTabEmptyState,
  resolveInspectorOption,
} from '../utils/planning-decision-inspector.projection.util';
import { pickPrimaryConflict } from '../utils/planning-decision-basis.projection.util';
import { expandConflictLookupIds } from '../utils/resolve-conflict-lookup-ids.util';
import { buildPlanningDecisionCausalChain } from '../utils/planning-causal-chain.projection.util';
import { isMcpoiBenchmarkTrip } from '../../benchmarks/multi-constraint-poi/mcpoi-benchmark.constants';
import {
  evaluateMcpoiProposalPreview,
  loadMcpoiBenchmarkSnapshot,
  overlayMcpoiBenchmarkInspector,
} from '../../benchmarks/multi-constraint-poi/mcpoi-benchmark-runtime.util';
import type { PlanningInspectorFeasibility } from '../types/planning-decision-inspector.types';

const INSPECTOR_PREVIEW_USER = 'decision-inspector-preview';

@Injectable()
export class PlanningDecisionInspectorService {
  private readonly logger = new Logger(PlanningDecisionInspectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: PlanProposalStoreService,
    private readonly causalChain: PlanningDecisionCausalChainService,
    private readonly decisionBasis: PlanningDecisionBasisService,
    private readonly monitor: PlanningProposalMonitorService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly tripConflicts?: TripConflictsService,
    @Optional() private readonly silentVotes?: TripSilentVoteService,
    @Optional() private readonly gateway?: DecisionEngineGatewayService,
  ) {}

  async getInspector(
    tripId: string,
    opts: {
      proposalId?: string;
      problemId?: string;
      optionId?: string;
      conflictId?: string;
      userId?: string;
    },
  ): Promise<PlanningDecisionInspector> {
    const proposalId = opts.proposalId?.trim();
    const problemId = opts.problemId?.trim();

    if (proposalId) {
      return this.getInspectorForProposal(tripId, {
        proposalId,
        optionId: opts.optionId,
        conflictId: opts.conflictId,
        userId: opts.userId,
        problemId,
      });
    }

    if (problemId) {
      return this.getInspectorForProblem(tripId, {
        problemId,
        optionId: opts.optionId,
        conflictId: opts.conflictId,
        userId: opts.userId,
      });
    }

    throw new BadRequestException('proposalId 或 problemId 至少填一项');
  }

  private async getInspectorForProposal(
    tripId: string,
    opts: {
      proposalId: string;
      problemId?: string;
      optionId?: string;
      conflictId?: string;
      userId?: string;
    },
  ): Promise<PlanningDecisionInspector> {
    const proposal = this.loadProposal(tripId, opts.proposalId);
    const option = resolveInspectorOption(proposal, opts.optionId);

    const focusConflictId = opts.conflictId ?? opts.problemId;

    const [causalChain, basis, conflicts, collaborators, monitorView, voteHints] =
      await Promise.all([
        this.causalChain.getChain(tripId, { proposalId: opts.proposalId }),
        this.decisionBasis.getBasis(tripId, {
          proposalId: opts.proposalId,
          conflictId: focusConflictId,
          problemId: opts.problemId,
        }),
        this.loadConflicts(tripId),
        this.loadCollaborators(tripId),
        this.monitor.getValidity(opts.proposalId).catch(() => null),
        this.loadVoteDiscussionHints(tripId, opts.userId ?? proposal.userId),
      ]);

    const primaryConflict = pickPrimaryConflict(
      conflicts,
      focusConflictId,
      focusConflictId ? expandConflictLookupIds(focusConflictId) : undefined,
    );
    const planDiff = buildInspectorPlanDiff(proposal, option);
    const memberConsensus = buildInspectorMemberConsensus({
      proposal,
      collaborators,
      ownerId: collaborators.find((c) => c.role === 'owner')?.userId,
      voteDiscussionHints: voteHints,
    });
    const feasibilityBase = buildInspectorFeasibility({
      proposal,
      option,
      planDiff,
      consensus: memberConsensus,
      conflicts,
      isMonitorStale: monitorView?.isStale,
      travelMinutes: primaryConflict?.travelMinutes ?? primaryConflict?.travelTimeMinutes,
      validUntilDisplay: monitorView?.validUntil
        ? undefined
        : basis.dataValidUntil
          ? `判断有效期至 ${basis.dataValidUntil}`
          : undefined,
    });
    const feasibility = await this.applyMcpoiInspectorFeasibility(tripId, feasibilityBase, proposal);

    const memberHasStance =
      memberConsensus.supportCount > 0 || memberConsensus.objectionCount > 0;

    return {
      schema: 'tripnara.planning_decision_inspector@v1',
      tripId,
      mode: 'proposal',
      proposalId: opts.proposalId,
      problemId: opts.problemId,
      optionId: option?.id,
      generatedAt: new Date().toISOString(),
      refreshUrl: buildInspectorRefreshUrl(tripId, {
        proposalId: opts.proposalId,
        problemId: opts.problemId,
        optionId: option?.id,
        conflictId: focusConflictId ?? primaryConflict?.id,
      }),
      tabEmptyState: buildInspectorTabEmptyState({
        causalChainNodeCount: causalChain.nodes.length,
        planDiffRowCount: planDiff.changeRows.length,
        memberHasStance,
        hasProposal: true,
      }),
      decisionBasis: basis,
      causalChain,
      planDiff,
      memberConsensus,
      feasibility,
    };
  }

  private async getInspectorForProblem(
    tripId: string,
    opts: {
      problemId: string;
      optionId?: string;
      conflictId?: string;
      userId?: string;
    },
  ): Promise<PlanningDecisionInspector> {
    const conflicts = await this.loadConflicts(tripId);
    const lookupIds = [
      ...(opts.conflictId ? expandConflictLookupIds(opts.conflictId) : []),
      ...expandConflictLookupIds(opts.problemId),
    ];
    const matchedConflict = pickPrimaryConflict(conflicts, undefined, lookupIds);
    const focusConflictId = matchedConflict?.id;

    const [basis, collaborators] = await Promise.all([
      this.decisionBasis.getBasis(tripId, {
        problemId: opts.problemId,
        ...(matchedConflict ? { conflictId: matchedConflict.id } : {}),
      }),
      this.loadCollaborators(tripId),
    ]);

    const primaryConflict = matchedConflict ?? pickPrimaryConflict(conflicts, focusConflictId);

    // 因果链由 Tab 懒加载 GET decision-causal-chain（避免 inspector 首包 >300ms）
    const causalChain = buildPlanningDecisionCausalChain({
      tripId,
      problemId: opts.problemId,
      nodes: [],
      basisSource: 'empty',
    });

    let planDiff = buildEmptyInspectorPlanDiff();
    let feasibilityBase = buildInspectorFeasibilityForProblem({
      conflicts,
      primaryConflict,
      travelMinutes: primaryConflict?.travelMinutes ?? primaryConflict?.travelTimeMinutes,
    });

    const optionId = opts.optionId?.trim();
    const preview = optionId
      ? await this.loadOptionPreview(tripId, opts.problemId, optionId, opts.userId)
      : undefined;
    if (preview) {
      planDiff = buildInspectorPlanDiffFromPreview(preview);
      feasibilityBase = buildInspectorFeasibilityFromPreview({
        preview,
        planDiff,
        conflicts,
        primaryConflict,
        travelMinutes: primaryConflict?.travelMinutes ?? primaryConflict?.travelTimeMinutes,
      });
    }

    const memberConsensus = buildEmptyInspectorMemberConsensus(collaborators);
    const feasibility = await this.applyMcpoiInspectorFeasibility(tripId, feasibilityBase);

    return {
      schema: 'tripnara.planning_decision_inspector@v1',
      tripId,
      mode: 'problem',
      problemId: opts.problemId,
      optionId,
      generatedAt: new Date().toISOString(),
      refreshUrl: buildInspectorRefreshUrl(tripId, {
        problemId: opts.problemId,
        optionId,
        ...(focusConflictId ? { conflictId: focusConflictId } : {}),
      }),
      tabEmptyState: buildInspectorTabEmptyState({
        causalChainNodeCount: causalChain.nodes.length,
        planDiffRowCount: planDiff.changeRows.length,
        memberHasStance: false,
        hasProposal: false,
      }),
      decisionBasis: basis,
      causalChain,
      planDiff,
      memberConsensus,
      feasibility,
    };
  }

  private async applyMcpoiInspectorFeasibility(
    tripId: string,
    base: PlanningInspectorFeasibility,
    proposal?: PlanProposal,
  ): Promise<PlanningInspectorFeasibility> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip || !isMcpoiBenchmarkTrip({ tripId, metadata: trip.metadata })) {
      return base;
    }

    const snapshot = await loadMcpoiBenchmarkSnapshot(this.prisma, tripId);
    if (!snapshot) return base;

    if (proposal?.changes?.length) {
      const days = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            orderBy: { date: 'asc' },
            include: {
              ItineraryItem: {
                orderBy: { order: 'asc' },
                select: {
                  id: true,
                  type: true,
                  note: true,
                  startTime: true,
                  endTime: true,
                  order: true,
                },
              },
            },
          },
        },
      });
      if (!days) return overlayMcpoiBenchmarkInspector(base, snapshot);
      const dbDays = days.TripDay.map((day, index) => ({
        id: day.id,
        date: day.date,
        dayNumber: index + 1,
        items: day.ItineraryItem,
      }));
      const preview = evaluateMcpoiProposalPreview(snapshot, proposal, dbDays);
      return overlayMcpoiBenchmarkInspector(base, snapshot, preview.after[0]);
    }

    return overlayMcpoiBenchmarkInspector(base, snapshot);
  }

  private async loadOptionPreview(
    tripId: string,
    problemId: string,
    optionId: string,
    userId?: string,
  ) {
    if (!isDecisionGatewayUnifiedEnabled()) return undefined;
    try {
      const gateway =
        this.gateway ??
        this.moduleRef.get(DecisionEngineGatewayService, { strict: false });
      if (!gateway) return undefined;
      return await gateway.previewOption(
        tripId,
        problemId,
        optionId,
        userId ?? INSPECTOR_PREVIEW_USER,
      );
    } catch (e: unknown) {
      this.logger.warn(
        `option preview failed problem=${problemId} option=${optionId}: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    }
  }

  private loadProposal(tripId: string, proposalId: string): PlanProposal {
    const proposal = this.store.get(proposalId);
    if (!proposal || proposal.tripId !== tripId) {
      throw new NotFoundException(`规划草案 ${proposalId} 不存在或已过期`);
    }
    return proposal;
  }

  private async loadConflicts(tripId: string) {
    if (!this.tripConflicts) return [];
    try {
      const res = await this.tripConflicts.getConflicts(tripId);
      return res.conflicts ?? [];
    } catch {
      return [];
    }
  }

  private async loadCollaborators(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripCollaborator: true,
      },
    });
    if (!trip) return [];

    const userIds = new Set<string>();
    for (const c of trip.TripCollaborator) userIds.add(c.userId);
    const ownerId = (trip.metadata as { userId?: string } | null)?.userId;
    if (ownerId) userIds.add(ownerId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, displayName: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const rows = trip.TripCollaborator.map((c) => ({
      userId: c.userId,
      role: c.role,
      displayName:
        userMap.get(c.userId)?.displayName ??
        userMap.get(c.userId)?.email?.split('@')[0] ??
        c.userId.slice(0, 8),
    }));

    if (ownerId && !rows.some((r) => r.userId === ownerId)) {
      rows.unshift({
        userId: ownerId,
        role: 'owner',
        displayName:
          userMap.get(ownerId)?.displayName ??
          userMap.get(ownerId)?.email?.split('@')[0] ??
          '行程创建者',
      });
    }

    return rows;
  }

  private async loadVoteDiscussionHints(
    tripId: string,
    userId: string,
  ): Promise<string[]> {
    if (!this.silentVotes) return [];
    try {
      const votes = await this.silentVotes.listVotes(tripId, userId);
      const open = votes.find((v) => v.status === 'open');
      return open?.aggregate?.discussionHints?.map((h) => h.messageCN) ?? [];
    } catch {
      return [];
    }
  }
}
