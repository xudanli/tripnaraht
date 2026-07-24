import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import type { ConstraintAssertion } from '../../decision-semantics/types/decision-semantics.types';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { ItineraryValidationService } from '../../../itinerary-items/services/itinerary-validation.service';
import { ValidationCode } from '../../../itinerary-items/interfaces/validation.interface';
import { DecisionCheckerService } from '../../trip-constraint-solver/services/decision-checker.service';
import { ReadinessCausalPreanalysisService } from '../../readiness/services/readiness-causal-preanalysis.service';
import { buildReadinessCascadeUiHints } from '../../readiness/utils/readiness-causal-preanalysis.util';
import type { PlanProposal } from '../types/plan-proposal.types';
import type { PlanningDecisionCausalChain } from '../types/planning-causal-chain.types';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import {
  buildPlanningDecisionCausalChain,
  filterDecisionCheckerEvidenceForProblem,
  mergeCausalChainNodes,
  projectCausalChainFromDecisionChecker,
  projectCausalChainFromDecisionCheckerEvidence,
  projectCausalChainFromOptionPreview,
  projectCausalChainFromProblemAssertions,
  projectCausalChainFromProposalSimulation,
  projectCausalChainFromReadinessHints,
  resolveBasisSource,
  type ProposalCascadeSimulation,
} from '../utils/planning-causal-chain.projection.util';
import {
  evaluateMcpoiProposalPreview,
  loadMcpoiBenchmarkSnapshot,
} from '../../benchmarks/multi-constraint-poi/mcpoi-benchmark-runtime.util';
import { isMcpoiBenchmarkTrip } from '../../benchmarks/multi-constraint-poi/mcpoi-benchmark.constants';
import {
  mergeMcpoiCausalChainNodes,
  projectMcpoiEvaluationToCausalNodes,
} from '../../benchmarks/multi-constraint-poi/mcpoi-causal-chain.projection.util';
import { CausalRuntimeSessionService } from '../../causal-runtime/causal-runtime-session.service';
import { CanonicalCausalTraceService } from '../../../causal-protocol/services/canonical-causal-trace.service';
import { loadWorldContextCausalNodes } from '../utils/planning-causal-chain-world-context.util';
import { projectCausalChainFromStoryView } from '../utils/planning-causal-chain-story-view.adapter';

const CAUSAL_CHAIN_PREVIEW_USER = 'decision-causal-chain-preview';

/**
 * @deprecated Transitional projection only — see ADR-CANONICAL-CAUSAL-TRACE-V1.
 *
 * MUST NOT: infer root cause, recalculate severity, generate new causal effects,
 * or merge narrative fragments into canonical conclusions.
 *
 * Target: CanonicalCausalTraceV1 → CausalStoryView
 */
@Injectable()
export class PlanningDecisionCausalChainService {
  private readonly logger = new Logger(PlanningDecisionCausalChainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: PlanProposalStoreService,
    private readonly validation: ItineraryValidationService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly decisionChecker?: DecisionCheckerService,
    @Optional() private readonly causalPreanalysis?: ReadinessCausalPreanalysisService,
    @Optional() private readonly gateway?: DecisionEngineGatewayService,
    @Optional() private readonly causalSession?: CausalRuntimeSessionService,
    @Optional() private readonly causalTrace?: CanonicalCausalTraceService,
  ) {}

  async getChain(
    tripId: string,
    opts?: { proposalId?: string; problemId?: string; optionId?: string; userId?: string },
  ): Promise<PlanningDecisionCausalChain> {
    const proposalId = opts?.proposalId;
    const problemId = opts?.problemId;
    const optionId = opts?.optionId?.trim();
    const proposal = proposalId ? this.loadProposal(tripId, proposalId) : undefined;

    const proposalNodes = proposal
      ? projectCausalChainFromProposalSimulation(proposal, await this.simulateProposalCascades(proposal))
      : [];

    const { readinessNodes, readinessUpdatedAt, triggerDescription } =
      await this.loadReadinessNodes(tripId);

    const conflictHint = problemId
      ? await this.loadPrimaryConflictHint(tripId, problemId)
      : undefined;

    const canonicalStoryNodes = problemId
      ? await this.loadCanonicalStoryNodes(tripId, problemId, conflictHint)
      : [];

    const worldContextNodes =
      canonicalStoryNodes.length > 0
        ? []
        : await loadWorldContextCausalNodes({
            tripId,
            prisma: this.prisma,
            causalSession: this.causalSession,
            primaryConflict: conflictHint,
          });

    const problemScopedNodes =
      problemId && canonicalStoryNodes.length === 0
        ? await this.loadProblemScopedNodes(tripId, problemId)
        : [];

    const previewNodes =
      problemId && optionId
        ? await this.loadOptionPreviewNodes(tripId, problemId, optionId, opts?.userId)
        : [];

    const decisionCheckerNodes =
      proposalNodes.length === 0 &&
      readinessNodes.length === 0 &&
      !problemId
        ? await this.loadDecisionCheckerNodes(tripId)
        : [];

    const nodes = mergeCausalChainNodes(
      canonicalStoryNodes,
      worldContextNodes,
      proposalNodes,
      readinessNodes.length ? readinessNodes : [],
      decisionCheckerNodes,
      problemScopedNodes,
      previewNodes,
    );

    const mcpoiNodes = await this.loadMcpoiBenchmarkCausalNodes(tripId, proposal);
    const mergedNodes = mergeMcpoiCausalChainNodes(nodes, mcpoiNodes);

    const proposalOrValidationCount = proposalNodes.length + mcpoiNodes.length;
    const problemAssertionCount = problemScopedNodes.filter(
      (n) => n.source === 'problem_assertion',
    ).length;
    const previewNodeCount = previewNodes.length;
    const decisionCheckerCount =
      decisionCheckerNodes.length +
      mcpoiNodes.length +
      problemScopedNodes.filter((n) => n.source === 'decision_checker').length;
    const worldContextCount = worldContextNodes.length;
    const basisSource = resolveBasisSource([
      { source: 'world_context', count: worldContextCount },
      { source: 'proposal', count: proposalOrValidationCount + previewNodeCount },
      { source: 'readiness', count: readinessNodes.length },
      { source: 'decision_checker', count: decisionCheckerCount },
      { source: 'problem_assertion', count: problemAssertionCount },
    ]);

    const basisUpdatedAt =
      readinessUpdatedAt ??
      proposal?.createdAt ??
      (triggerDescription ? new Date().toISOString() : undefined);

    return buildPlanningDecisionCausalChain({
      tripId,
      proposalId,
      problemId,
      optionId,
      nodes: mergedNodes,
      basisSource,
      basisUpdatedAt,
    });
  }

  private async loadCanonicalStoryNodes(
    tripId: string,
    problemId: string,
    conflictHint?: {
      message?: string;
      travelMinutes?: number;
      travelTimeMinutes?: number;
      affectedScopeSummary?: string;
    },
  ): Promise<ReturnType<typeof projectCausalChainFromStoryView>> {
    if (!this.causalTrace) return [];
    try {
      let story = this.causalTrace.buildStoryViewForProblem(tripId, problemId);
      if (!story) {
        const worldStateVersion = await this.causalTrace.resolveWorldStateVersion(tripId);
        const trace = await this.causalTrace.ensureProblemTrace({
          tripId,
          problemId,
          worldStateVersion,
          semanticKey: 'travel',
          diagnosticMessage: conflictHint?.message ?? conflictHint?.affectedScopeSummary,
        });
        story = this.causalTrace.buildStoryView(trace);
      }
      return projectCausalChainFromStoryView(story);
    } catch (e: unknown) {
      this.logger.warn(
        `canonical story adapter failed trip=${tripId} problem=${problemId}: ${e instanceof Error ? e.message : e}`,
      );
      return [];
    }
  }

  private async loadPrimaryConflictHint(tripId: string, problemId: string) {
    if (!this.decisionChecker) return undefined;
    try {
      const dc = await this.decisionChecker.getDecisionChecker(tripId, {
        focusConflictId: problemId,
      });
      const primary = dc.overview?.conflict?.primary as
        | {
            message?: string;
            travelMinutes?: number;
            travelTimeMinutes?: number;
          }
        | undefined;
      if (!primary?.message) return undefined;
      return {
        message: primary.message,
        travelMinutes: primary.travelMinutes,
        travelTimeMinutes: primary.travelTimeMinutes,
        affectedScopeSummary: primary.message,
      };
    } catch {
      return undefined;
    }
  }

  private async loadOptionPreviewNodes(
    tripId: string,
    problemId: string,
    optionId: string,
    userId?: string,
  ) {
    if (!isDecisionGatewayUnifiedEnabled()) return [];
    try {
      const gateway =
        this.gateway ??
        this.moduleRef.get(DecisionEngineGatewayService, { strict: false });
      if (!gateway) return [];
      const preview = await gateway.previewOption(
        tripId,
        problemId,
        optionId,
        userId ?? CAUSAL_CHAIN_PREVIEW_USER,
      );
      return projectCausalChainFromOptionPreview(preview);
    } catch (e: unknown) {
      this.logger.warn(
        `option preview for causal chain failed problem=${problemId} option=${optionId}: ${e instanceof Error ? e.message : e}`,
      );
      return [];
    }
  }

  private async loadMcpoiBenchmarkCausalNodes(
    tripId: string,
    proposal?: PlanProposal,
  ): Promise<import('../types/planning-causal-chain.types').PlanningCausalChainNode[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip || !isMcpoiBenchmarkTrip({ tripId, metadata: trip.metadata })) {
      return [];
    }

    const snapshot = await loadMcpoiBenchmarkSnapshot(this.prisma, tripId);
    if (!snapshot) return [];

    if (proposal?.changes?.length) {
      const days = await this.loadMcpoiDbDays(tripId);
      const preview = evaluateMcpoiProposalPreview(snapshot, proposal, days);
      return preview.causalNodes;
    }

    return snapshot.evaluations.flatMap((evaluation) =>
      projectMcpoiEvaluationToCausalNodes(evaluation),
    );
  }

  private async loadMcpoiDbDays(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
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
    if (!trip) return [];
    return trip.TripDay.map((day, index) => ({
      id: day.id,
      date: day.date,
      dayNumber: index + 1,
      items: day.ItineraryItem,
    }));
  }

  private loadProposal(tripId: string, proposalId: string): PlanProposal {
    const proposal = this.store.get(proposalId);
    if (!proposal || proposal.tripId !== tripId) {
      throw new NotFoundException(`规划草案 ${proposalId} 不存在或已过期`);
    }
    return proposal;
  }

  private async simulateProposalCascades(
    proposal: PlanProposal,
  ): Promise<ProposalCascadeSimulation[]> {
    const simulations: ProposalCascadeSimulation[] = [];

    for (const change of proposal.changes) {
      if (change.operation !== 'MOVE' || !change.itemId) continue;
      if (!change.startTime) continue;
      const startTime = change.startTime;

      const startIso = await this.resolveStartIso(proposal.tripId, {
        dayIndex: change.dayIndex,
        startTime,
        itemId: change.itemId,
      });
      const endIso = change.endTime
        ? await this.resolveEndIso(proposal.tripId, { dayIndex: change.dayIndex, endTime: change.endTime })
        : undefined;

      const validation = await this.validation.validateUpdate(
        change.itemId,
        {
          startTime: startIso,
          ...(endIso ? { endTime: endIso } : {}),
        },
        { detectCascadeImpact: true },
      );

      const travelWarning = validation.warnings.find(
        (w) => w.code === ValidationCode.INSUFFICIENT_TRAVEL_TIME,
      );
      const shortfall =
        typeof travelWarning?.details?.shortfall === 'number'
          ? travelWarning.details.shortfall
          : undefined;

      const bufferWarning = validation.warnings.find(
        (w) => w.code === ValidationCode.SHORT_BUFFER,
      );

      simulations.push({
        change,
        travelShortfallMinutes: shortfall,
        travelWarning: travelWarning?.message,
        bufferConsumed: Boolean(travelWarning || bufferWarning),
        cascade: validation.cascadeImpact,
      });
    }

    return simulations;
  }

  private async resolveStartIso(
    tripId: string,
    change: { dayIndex: number; startTime: string; itemId?: string },
  ): Promise<string> {
    const dayDate = await this.resolveTripDayDate(tripId, change.dayIndex);
    if (dayDate) {
      return this.combineDayAndTime(dayDate, change.startTime).toISO()!;
    }
    return change.startTime.includes('T')
      ? change.startTime
      : DateTime.fromISO(`2026-01-01T${change.startTime}:00`, { zone: 'utc' }).toISO()!;
  }

  private async resolveEndIso(
    tripId: string,
    change: { dayIndex: number; endTime?: string },
  ): Promise<string | undefined> {
    if (!change.endTime) return undefined;
    if (change.endTime.includes('T')) return change.endTime;
    const dayDate = await this.resolveTripDayDate(tripId, change.dayIndex);
    if (dayDate) {
      return this.combineDayAndTime(dayDate, change.endTime).toISO()!;
    }
    return DateTime.fromISO(`2026-01-01T${change.endTime}:00`, { zone: 'utc' }).toISO()!;
  }

  private async resolveTripDayDate(tripId: string, dayIndex: number): Promise<Date | undefined> {
    const days = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const day = days[dayIndex - 1];
    return day?.date;
  }

  private combineDayAndTime(day: Date, hhmm: string): DateTime {
    const [h, m] = hhmm.split(':').map(Number);
    return DateTime.fromJSDate(day, { zone: 'utc' }).set({
      hour: h ?? 0,
      minute: m ?? 0,
      second: 0,
      millisecond: 0,
    });
  }

  private async loadReadinessNodes(tripId: string): Promise<{
    readinessNodes: ReturnType<typeof projectCausalChainFromReadinessHints>;
    readinessUpdatedAt?: string;
    triggerDescription?: string;
  }> {
    if (!this.causalPreanalysis) {
      return { readinessNodes: [] };
    }

    const snapshot = await this.causalPreanalysis.loadSnapshot(tripId);
    const preanalysis = snapshot?.latest;
    const hints = buildReadinessCascadeUiHints(preanalysis);
    if (!hints.length) {
      return { readinessNodes: [], readinessUpdatedAt: snapshot?.updatedAt };
    }

    const trigger = preanalysis?.trigger;
    let triggerDescription: string | undefined;
    if (trigger?.entityRef?.label) {
      const minutes = hints[0]?.netImpactMinutes;
      triggerDescription =
        minutes && minutes > 0
          ? `道路预计耗时增加 ${minutes} 分钟（当前路段受交通与天气影响）`
          : trigger.entityRef.label;
    }

    return {
      readinessNodes: projectCausalChainFromReadinessHints(hints, triggerDescription),
      readinessUpdatedAt: snapshot?.updatedAt ?? preanalysis?.analyzedAt,
      triggerDescription,
    };
  }

  private async loadProblemScopedNodes(
    tripId: string,
    problemId: string,
  ): Promise<import('../types/planning-causal-chain.types').PlanningCausalChainNode[]> {
    const assertionNodes = await this.loadProblemAssertionNodes(tripId, problemId);
    if (assertionNodes.length) return assertionNodes;

    return this.loadDecisionCheckerNodes(tripId, {
      focusConflictId: problemId,
      includeEvidence: true,
    });
  }

  private async loadProblemAssertionNodes(
    tripId: string,
    problemId: string,
  ): Promise<import('../types/planning-causal-chain.types').PlanningCausalChainNode[]> {
    if (!isDecisionGatewayUnifiedEnabled() || !this.gateway) {
      return [];
    }
    try {
      const detail = await this.gateway.getProblemWithDebug(tripId, problemId);
      const rawLegacy = detail.debug?.rawLegacy as
        | { assertions?: ConstraintAssertion[] }
        | undefined;
      const assertions = rawLegacy?.assertions ?? [];
      if (!assertions.length) return [];
      return projectCausalChainFromProblemAssertions(assertions);
    } catch {
      return [];
    }
  }

  private async loadDecisionCheckerNodes(
    tripId: string,
    opts?: { focusConflictId?: string; includeEvidence?: boolean },
  ) {
    if (!this.decisionChecker) return [];
    try {
      const dc = await this.decisionChecker.getDecisionChecker(tripId, {
        focusConflictId: opts?.focusConflictId,
      });
      const cascade = dc.impact?.cascade ?? [];
      if (cascade.length) {
        return projectCausalChainFromDecisionChecker(cascade);
      }
      if (opts?.includeEvidence) {
        const items = dc.evidence?.items ?? [];
        const scoped = opts.focusConflictId
          ? filterDecisionCheckerEvidenceForProblem(items, opts.focusConflictId)
          : items;
        return scoped.length
          ? projectCausalChainFromDecisionCheckerEvidence(scoped)
          : [];
      }
      return [];
    } catch {
      return [];
    }
  }
}
