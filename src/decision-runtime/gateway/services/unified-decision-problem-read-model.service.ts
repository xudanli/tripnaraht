/**
 * Unified Decision Problem SSOT read model — canonical + legacy merge with stable dedupe.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { isRfc001CanonicalSliceEnabled } from '../../../trips/guardian-decision-core/config/rfc001-iceland.config';
import { DecisionProblemCollectorService } from '../../../trips/decision-semantics/collectors/decision-problem.collector';
import { DecisionRouteResolverService } from '../routing/decision-route-resolver.service';
import { RouteLineageStoreService } from '../lineage/route-lineage.store.service';
import { CanonicalDecisionEngineAdapter } from '../engines/canonical-decision-engine.adapter';
import { LegacyV15EngineAdapter } from '../engines/legacy-v15-engine.adapter';
import type { InternalUnifiedProblemRow } from '../utils/unified-decision-problem-projection.util';
import {
  aggregateRowsByInstanceKey,
  buildUnifiedDecisionProblemListView,
  mapCanonicalProblemToRow,
  mapLegacyDetailToRow,
  mapStoredResolutionExecutionStatus,
  overlayStoredResolutionOnListItem,
  projectRowToListItem,
  resolveLinkedFeasibilityIssue,
} from '../utils/unified-decision-problem-projection.util';
import type { ConstraintEnforcement } from '../../../trips/decision-semantics/types/decision-semantics.types';
import type {
  UnifiedDecisionActionPreviewView,
  UnifiedDecisionCenterOverviewView,
  UnifiedDecisionOptionsView,
  UnifiedDecisionProblemDetailView,
  UnifiedDecisionProblemListItem,
  UnifiedDecisionProblemListView,
} from '../contracts/unified-decision-ui.types';
import {
  projectListItemsToPlanningConflicts,
  buildPlanningConflictsSummaryFromItems,
} from '../utils/planning-conflicts-projection.util';
import type { PlanningConflictItem } from '../../../trips/trip-constraint-solver/types/planning-conflicts.types';
import { qualifiesForDecisionQueue } from '../utils/decision-queue-admission.util';
import type { Rfc001DecisionCenterProblemView } from '../../../trips/guardian-decision-core/adapters/decision-center-bridge.adapter';
import type {
  DecisionProblemDetail,
  DecisionOption,
  DecisionOptionPreviewResponse,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import { buildRequiredAcknowledgements } from '../utils/decision-acknowledgement.util';
import {
  buildActionabilityWithWriteChain,
  extractCanonicalResolution,
  partitionActionsForProductView,
  projectDecisionOptionsToActions,
} from '../utils/unified-decision-action-projection.util';
import { buildDecisionCenterHeadline } from '../../../trips/decision-semantics/read/decision-center-overview.util';
import { DecisionProblemResolutionStoreService } from '../persistence/decision-problem-resolution.store';
import { buildPlanningConflictsCacheKey } from '../../../trips/trip-constraint-solver/utils/planning-conflicts-cache-key.util';
import { findFeasibilityIssueForCanonicalRow } from '../utils/canonical-fallback-options.util';
import { buildCanonicalCapabilityStubOptions } from '../utils/canonical-capability-stub-options.util';
import { resolveFeasibilityDiagnosisOccurrenceCount } from '../utils/decision-problem-queue-display.util';
import { CanonicalCausalTraceService } from '../../../causal-protocol/services/canonical-causal-trace.service';
import {
  isTravelOrTransportProblem,
} from '../../../causal-protocol/adapters/iceland-causal-trace.adapter';
import {
  isTripInExecutionPhase,
} from '../utils/plan-object-execution-admission.util';

const COLLECT_ROWS_CACHE_TTL_MS = 10_000;

export interface UnifiedPlanningConflictsProjection {
  conflicts: PlanningConflictItem[];
  summary: ReturnType<typeof buildPlanningConflictsSummaryFromItems>;
}

@Injectable()
export class UnifiedDecisionProblemReadModelService {
  private readonly logger = new Logger(UnifiedDecisionProblemReadModelService.name);
  private readonly collectRowsCache = new Map<
    string,
    { revisionKey: string; expiresAt: number; rows: InternalUnifiedProblemRow[] }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly routeResolver: DecisionRouteResolverService,
    private readonly lineageStore: RouteLineageStoreService,
    private readonly canonical: CanonicalDecisionEngineAdapter,
    private readonly legacy: LegacyV15EngineAdapter,
    private readonly collector: DecisionProblemCollectorService,
    private readonly resolutionStore: DecisionProblemResolutionStoreService,
    private readonly causalTrace: CanonicalCausalTraceService,
  ) {}

  invalidateCache(tripId: string): void {
    this.collectRowsCache.delete(tripId);
    this.collector.invalidateCache(tripId);
  }

  private async collectRowsCached(
    tripId: string,
    opts?: { recordLineage?: boolean },
  ): Promise<InternalUnifiedProblemRow[]> {
    if (opts?.recordLineage) {
      return this.collectRows(tripId, opts);
    }

    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    const revisionKey = tripRow
      ? buildPlanningConflictsCacheKey(tripRow)
      : `missing:${Date.now()}`;
    const cached = this.collectRowsCache.get(tripId);
    if (cached && cached.revisionKey === revisionKey && cached.expiresAt > Date.now()) {
      return cached.rows;
    }

    const rows = await this.collectRows(tripId, { recordLineage: false });
    this.collectRowsCache.set(tripId, {
      revisionKey,
      expiresAt: Date.now() + COLLECT_ROWS_CACHE_TTL_MS,
      rows,
    });
    return rows;
  }

  async collectRows(tripId: string, opts?: { recordLineage?: boolean }): Promise<InternalUnifiedProblemRow[]> {
    const ctx = await this.buildRouteContext(tripId);
    const rows: InternalUnifiedProblemRow[] = [];
    const canonicalIds = new Set<string>();
    const recordLineage = opts?.recordLineage === true;
    const lineageBatch: Array<{
      problemId?: string;
      semanticKey?: string;
      route: NonNullable<InternalUnifiedProblemRow['route']>;
    }> = [];

    let collected: Awaited<ReturnType<DecisionProblemCollectorService['collect']>> | undefined;
    try {
      collected = await this.collector.collect(tripId);
    } catch {
      collected = undefined;
    }

    if (isRfc001CanonicalSliceEnabled()) {
      try {
        const canonicalProblems = await this.canonical.listProblems(tripId);
        const canonicalRows = await Promise.all(
          canonicalProblems.map(async (problem) => {
            canonicalIds.add(problem.problemId);
            const semanticKey =
              (await this.canonical.resolveProblemSemanticKey(tripId, problem.problemId)) ??
              problem.problemId;
            const route = this.routeResolver.resolve({
              tripId,
              problemId: problem.problemId,
              semanticKey,
              destinationCountry: ctx.destination,
              hasCanonicalProblem: true,
            });
            if (recordLineage) {
              lineageBatch.push({ problemId: problem.problemId, semanticKey, route });
            }
            const provisionalRow = mapCanonicalProblemToRow(problem, tripId, semanticKey, route);
            const linkedIssue =
              collected != null
                ? findFeasibilityIssueForCanonicalRow(collected, provisionalRow)
                : undefined;
            return mapCanonicalProblemToRow(problem, tripId, semanticKey, route, linkedIssue);
          }),
        );
        rows.push(...canonicalRows);
      } catch {
        // canonical optional when trip missing
      }
    }

    try {
      if (collected) {
        for (const detail of collected.items) {
          if (canonicalIds.has(detail.id)) continue;
          const route = this.routeResolver.resolve({
            tripId,
            problemId: detail.id,
            semanticKey: detail.semanticKey,
            destinationCountry: ctx.destination,
            hasCanonicalProblem: false,
          });
          if (recordLineage) {
            lineageBatch.push({
              problemId: detail.id,
              semanticKey: detail.semanticKey,
              route,
            });
          }
          const linkedIssue = resolveLinkedFeasibilityIssue(collected, detail);
          rows.push(mapLegacyDetailToRow(detail, tripId, route, linkedIssue));
        }
      }
    } catch {
      // legacy collector optional
    }

    if (recordLineage && lineageBatch.length) {
      await this.lineageStore.appendBatch(tripId, lineageBatch);
    }

    return aggregateRowsByInstanceKey(rows);
  }

  async listProblems(
    tripId: string,
    opts?: { includeDebug?: boolean; queueOnly?: boolean },
  ): Promise<UnifiedDecisionProblemListView> {
    const [rows, resolutions, collected, tripStatus] = await Promise.all([
      this.collectRowsCached(tripId),
      this.resolutionStore.listForTrip(tripId),
      this.collector.collect(tripId).catch(() => undefined),
      this.loadTripStatus(tripId),
    ]);
    const diagnosisOccurrenceCount = collected
      ? resolveFeasibilityDiagnosisOccurrenceCount(collected.feasibilityIssues)
      : undefined;
    const view = buildUnifiedDecisionProblemListView({
      tripId,
      rows,
      includeDebug: opts?.includeDebug,
      queueOnly: opts?.queueOnly ?? true,
      excludePlanObjectForExecution: isTripInExecutionPhase(tripStatus),
      diagnosisOccurrenceCount,
    });
    const baseItems = view.items.map((item) =>
      overlayStoredResolutionOnListItem(item, resolutions[item.problemId]),
    );
    const items = await this.enrichListItemsWithCausalNarrative(tripId, baseItems, rows);

    const byEnforcement: Partial<Record<ConstraintEnforcement, number>> = {};
    let actionableCount = 0;
    let openCount = 0;

    for (const item of items) {
      if (!['RESOLVED', 'DISMISSED'].includes(item.workflowStatus)) {
        openCount += 1;
        byEnforcement[item.enforcement] = (byEnforcement[item.enforcement] ?? 0) + 1;
        if (item.actionability.requiresAction) actionableCount += 1;
      }
    }

    return {
      ...view,
      items,
      meta: {
        ...view.meta,
        openCount,
        actionableCount,
        occurrenceCount: diagnosisOccurrenceCount ?? view.meta.occurrenceCount,
        byEnforcement,
      },
    };
  }

  async projectPlanningConflicts(tripId: string): Promise<UnifiedPlanningConflictsProjection> {
    const list = await this.listProblems(tripId, { queueOnly: true });
    const conflicts = projectListItemsToPlanningConflicts(list.items);
    return {
      conflicts,
      summary: buildPlanningConflictsSummaryFromItems(conflicts),
    };
  }

  async countQueueEligibleOpenProblems(tripId: string): Promise<{
    openCount: number;
    actionableCount: number;
    occurrenceCount: number;
    blockingCount: number;
  }> {
    const rows = await this.collectRowsCached(tripId);
    let openCount = 0;
    let actionableCount = 0;
    let occurrenceCount = 0;
    let blockingCount = 0;

    for (const row of rows) {
      if (['RESOLVED', 'DISMISSED'].includes(row.workflowStatus)) continue;
      if (
        !qualifiesForDecisionQueue({
          enforcement: row.enforcement,
          workflowStatus: row.workflowStatus,
          semanticKey: row.semanticKey,
          title: row.title,
          summary: row.summary,
          hasExecutableOptions: row.hasExecutableOptions,
          blocksPlan: row.enforcement === 'BLOCK',
          requiresAdjustment: row.enforcement === 'REQUIRE_ADJUSTMENT',
          requiresConfirmation: row.enforcement === 'REQUIRE_CONFIRMATION',
        })
      ) {
        continue;
      }
      openCount += 1;
      occurrenceCount += row.occurrenceCount;
      if (row.enforcement === 'BLOCK') blockingCount += 1;
      if (row.workflowStatus === 'WAITING_DECISION') actionableCount += 1;
    }

    return { openCount, actionableCount, occurrenceCount, blockingCount };
  }

  async getOverview(tripId: string, opts?: { includeDebug?: boolean }): Promise<UnifiedDecisionCenterOverviewView> {
    const [rows, resolutions, collected] = await Promise.all([
      this.collectRowsCached(tripId),
      this.resolutionStore.listForTrip(tripId),
      this.collector.collect(tripId).catch(() => undefined),
    ]);
    const diagnosisOccurrenceCount = collected
      ? resolveFeasibilityDiagnosisOccurrenceCount(collected.feasibilityIssues)
      : undefined;
    const view = buildUnifiedDecisionProblemListView({
      tripId,
      rows,
      includeDebug: opts?.includeDebug,
      queueOnly: true,
      diagnosisOccurrenceCount,
    });
    const listItems = await this.enrichListItemsWithCausalNarrative(tripId, view.items.map((item) =>
      overlayStoredResolutionOnListItem(item, resolutions[item.problemId]),
    ), rows);
    const list = { ...view, items: listItems };

    let resolvedProblemCount = 0;
    for (const row of rows) {
      if (!['RESOLVED', 'DISMISSED'].includes(row.workflowStatus)) continue;
      if (
        qualifiesForDecisionQueue({
          enforcement: row.enforcement,
          workflowStatus: row.workflowStatus,
          semanticKey: row.semanticKey,
          title: row.title,
          summary: row.summary,
          hasExecutableOptions: row.hasExecutableOptions,
          blocksPlan: row.enforcement === 'BLOCK',
          requiresAdjustment: row.enforcement === 'REQUIRE_ADJUSTMENT',
          requiresConfirmation: row.enforcement === 'REQUIRE_CONFIRMATION',
        })
      ) {
        resolvedProblemCount += 1;
      }
    }

    const daySet = new Set<number>();
    for (const item of list.items) {
      for (const day of item.scope.dayIds ?? []) daySet.add(day);
    }

    let waitingUserDecisionCount = 0;
    let applyingCount = 0;
    for (const item of list.items) {
      if (item.workflowStatus === 'WAITING_DECISION') waitingUserDecisionCount += 1;
      if (['APPLYING', 'DRAFT_CREATED'].includes(item.executionStatus)) applyingCount += 1;
    }

    const byEnforcement: Partial<Record<ConstraintEnforcement, number>> = {};
    let actionableCount = 0;
    let openCount = 0;
    for (const item of list.items) {
      if (!['RESOLVED', 'DISMISSED'].includes(item.workflowStatus)) {
        openCount += 1;
        byEnforcement[item.enforcement] = (byEnforcement[item.enforcement] ?? 0) + 1;
        if (item.actionability.requiresAction) actionableCount += 1;
      }
    }

    const guardianNarrative = this.pickGuardianNarrativeFromItems(list.items);

    return {
      schemaId: 'tripnara.unified_decision_center_overview@v2',
      tripId,
      generatedAt: new Date().toISOString(),
      totalOpenProblemCount: openCount,
      resolvedProblemCount,
      actionableProblemCount: actionableCount,
      blockingProblemCount: byEnforcement.BLOCK ?? 0,
      waitingUserDecisionCount,
      waitingTeamDecisionCount: 0,
      applyingCount,
      staleEvidenceCount: list.items.filter((i) => i.evidenceSummary.freshness === 'STALE').length,
      occurrenceCount: diagnosisOccurrenceCount ?? list.meta.occurrenceCount,
      byEnforcement,
      headline: buildDecisionCenterHeadline(byEnforcement, openCount),
      guardianHeadline: guardianNarrative?.headline,
      guardianAssessment: guardianNarrative?.assessment,
      affectedDayNumbers: [...daySet].sort((a, b) => a - b),
      problems: list.items,
    };
  }

  async getProblemDetail(
    tripId: string,
    problemId: string,
    opts?: {
      includeDebug?: boolean;
      negotiation?: DecisionProblemDetail['negotiation'];
      suggestedNegotiationDomain?: string;
      suggestedDecisionNode?: string;
    },
  ): Promise<UnifiedDecisionProblemDetailView> {
    const row = await this.findRow(tripId, problemId);
    if (!row) throw new NotFoundException(`DECISION_PROBLEM_NOT_FOUND: ${problemId}`);

    const actions = await this.resolveLegacyOrCanonicalOptions(tripId, row);
    return this.buildProblemDetailView(tripId, row, actions, opts);
  }

  async resolveWorldStateVersionForTrip(tripId: string): Promise<string> {
    const collected = await this.collector.collect(tripId).catch(() => undefined);
    return this.causalTrace.resolveWorldStateVersion(tripId, collected?.tripVersion);
  }

  async getCausalTraceReplay(tripId: string, problemId: string) {
    const row = await this.findRow(tripId, problemId);
    if (!row) throw new NotFoundException(`DECISION_PROBLEM_NOT_FOUND: ${problemId}`);

    let replay = await this.causalTrace.getTraceReplay(tripId, row.problemId);
    if (!replay) {
      const worldStateVersion = await this.resolveWorldStateVersionForTrip(tripId);
      await this.causalTrace.ensureProblemTrace({
        tripId,
        problemId: row.problemId,
        worldStateVersion,
        semanticKey: row.semanticKey,
        problemType: row.type,
        dimension: row.dimension,
        diagnosticMessage: row.queueDescription ?? row.summary,
      });
      replay = await this.causalTrace.getTraceReplay(tripId, row.problemId);
    }
    if (!replay) {
      throw new NotFoundException(`CAUSAL_TRACE_NOT_FOUND: ${problemId}`);
    }
    return replay;
  }

  async getProblemOptions(
    tripId: string,
    problemId: string,
    opts?: { includeDebug?: boolean },
  ): Promise<UnifiedDecisionOptionsView> {
    const row = await this.findRow(tripId, problemId);
    if (!row) throw new NotFoundException(`DECISION_PROBLEM_NOT_FOUND: ${problemId}`);

    const rawOptions = await this.resolveLegacyOrCanonicalOptions(tripId, row);
    const detail = await this.buildProblemDetailView(tripId, row, rawOptions, opts);
    const recommendedAction =
      detail.actions.find(
        (a) => a.type === detail.actionability.recommendedAction && a.allowed && !a.blockedReason,
      ) ?? detail.actions.find((a) => a.allowed && !a.blockedReason);
    const requiredAcknowledgements = await this.resolveRequiredAcknowledgements(
      tripId,
      row.problemId,
      detail.problem,
      recommendedAction?.requiresConfirmation,
    );
    return {
      schemaId: 'tripnara.unified_decision_options@v2',
      tripId,
      problemId: row.problemId,
      generatedAt: new Date().toISOString(),
      actions: detail.actions,
      actionability: detail.actionability,
      ...(requiredAcknowledgements?.length ? { requiredAcknowledgements } : {}),
      ...(detail.debug ? { debug: detail.debug } : {}),
    };
  }

  /** Problem-level ack templates — same SSOT as preview/submit resolution. */
  private async resolveRequiredAcknowledgements(
    tripId: string,
    problemId: string,
    problem: UnifiedDecisionProblemListItem,
    requiresConfirmation?: boolean,
  ): Promise<string[] | undefined> {
    let assertions: DecisionProblemDetail['assertions'] = [];
    try {
      const legacy = await this.legacy.getProblem(tripId, problemId);
      assertions = legacy.assertions;
    } catch {
      assertions = [
        {
          id: `${problemId}:ack`,
          sourceSystem: 'FEASIBILITY',
          sourceRefId: problemId,
          nature: 'HARD_CONSTRAINT',
          domain: 'TIME',
          enforcement: problem.enforcement,
          overridable: problem.enforcement !== 'BLOCK',
          condition: problem.semanticKey,
          conclusion: 'ack-fallback',
          proofs: [],
        },
      ];
    }
    const required = buildRequiredAcknowledgements({
      requiresConfirmation,
      enforcement: problem.enforcement,
      detail: {
        type: problem.type,
        semanticKey: problem.semanticKey,
        assertions,
      },
    });
    return required.length ? required : undefined;
  }

  private async resolveLegacyOrCanonicalOptions(
    tripId: string,
    row: InternalUnifiedProblemRow,
  ) {
    const isCanonical =
      row.authority === 'CANONICAL' &&
      row.route?.engineId === 'CANONICAL_DECISION_RUNTIME' &&
      row.route?.resolution === 'PRIMARY';

    if (isCanonical && row.rawCanonical) {
      let canonicalOptions = row.rawCanonical.options ?? [];
      if (!canonicalOptions.some((o) => o.executable !== false)) {
        const fallback = await this.resolveCanonicalFallbackOptions(tripId, row);
        const viableFallback = fallback.filter((o) => o.executable !== false);
        if (viableFallback.length > 0) {
          canonicalOptions = [...canonicalOptions, ...viableFallback];
        }
      } else if (canonicalOptions.length === 0) {
        const fallback = await this.resolveCanonicalFallbackOptions(tripId, row);
        if (fallback.length > 0) {
          canonicalOptions = fallback;
        }
      }
      if (canonicalOptions.length > 0) {
        return canonicalOptions;
      }
    }

    const collected = await this.collector.collect(tripId);
    const optionsResp = await this.legacy.getOptions(tripId, row.problemId, {
      enrichTradeoffs: false,
      preloadedCollected: collected,
    });
    return optionsResp.options;
  }

  /** Pre-evaluate canonical rows — reuse feasibility repair options when workspace is empty. */
  private async resolveCanonicalFallbackOptions(
    tripId: string,
    row: InternalUnifiedProblemRow,
  ): Promise<DecisionOption[]> {
    const collected = await this.collector.collect(tripId);
    const issue = findFeasibilityIssueForCanonicalRow(collected, row);
    if (issue) {
      const fromFeasibility = await this.legacy.buildOptionsForFeasibilityIssue(tripId, issue, {
        preloadedCollected: collected,
      });
      const viable = fromFeasibility.filter((o) => o.executable !== false);
      if (viable.length > 0) return viable;
    }
    return buildCanonicalCapabilityStubOptions(row);
  }

  private async buildProblemDetailView(
    tripId: string,
    row: InternalUnifiedProblemRow,
    actions: DecisionOption[],
    opts?: {
      includeDebug?: boolean;
      negotiation?: DecisionProblemDetail['negotiation'];
      suggestedNegotiationDomain?: string;
      suggestedDecisionNode?: string;
    },
  ): Promise<UnifiedDecisionProblemDetailView> {
    const isCanonical =
      row.authority === 'CANONICAL' &&
      row.route?.engineId === 'CANONICAL_DECISION_RUNTIME' &&
      row.route?.resolution === 'PRIMARY';

    const projectedActions = projectDecisionOptionsToActions(actions, {
      tripId,
      problemId: row.problemId,
      enforcement: row.enforcement,
      authority: isCanonical ? 'CANONICAL' : 'LEGACY',
    });
    const { actions: productActions, suppressedActions } = partitionActionsForProductView(
      projectedActions,
      opts?.includeDebug,
    );

    const problem = projectRowToListItem(row, opts?.includeDebug === true);
    const actionability = buildActionabilityWithWriteChain({
      enforcement: row.enforcement,
      requiresAction: problem.actionability.requiresAction,
      allowedActions: problem.actionability.allowedActions,
      authority: isCanonical ? 'CANONICAL' : 'LEGACY',
    });

    const storedResolution = await this.resolutionStore.getForProblem(tripId, row.problemId);
    const baseItem = projectRowToListItem(row, opts?.includeDebug === true);
    const problemItem = overlayStoredResolutionOnListItem(
      {
        ...baseItem,
        workflowStatus: storedResolution ? 'DECIDED' : baseItem.workflowStatus,
        executionStatus: mapStoredResolutionExecutionStatus(storedResolution),
      },
      storedResolution,
    );

    const detail: UnifiedDecisionProblemDetailView = {
      schemaId: 'tripnara.unified_decision_problem_detail@v2',
      tripId,
      generatedAt: new Date().toISOString(),
      problem: problemItem,
      actions: productActions,
      actionability,
      resolution: storedResolution
        ? {
            resolutionId: storedResolution.resolutionId,
            problemId: storedResolution.problemId,
            selectedActionId: storedResolution.selectedActionId,
            status: storedResolution.status,
            decidedAt: storedResolution.decidedAt,
            actionPlanId: storedResolution.actionPlanId,
          }
        : row.rawCanonical
          ? extractCanonicalResolution(row.rawCanonical)
          : undefined,
      ...(opts?.negotiation ? { negotiation: opts.negotiation } : {}),
    };

    if (opts?.includeDebug) {
      detail.debug = {
        authority: row.authority,
        engineId: row.route?.engineId ?? (row.authority === 'CANONICAL' ? 'CANONICAL_DECISION_RUNTIME' : 'LEGACY_V15_ADAPTER'),
        resolution: row.route?.resolution ?? 'LEGACY_FALLBACK',
        sourceIds: row.sourceIds,
        flow: row.flow,
        route: row.route,
        rawLegacy: row.rawLegacy,
        rawCanonical: row.rawCanonical,
        ...(suppressedActions?.length ? { suppressedActions } : {}),
      };
    }

    detail.causalTraceRef = await this.attachCausalTraceRef(tripId, row);
    if (detail.causalTraceRef) {
      const trace = this.causalTrace.getTrace(detail.causalTraceRef.traceId);
      if (trace) {
        detail.causalStoryView = this.causalTrace.buildStoryView(trace, 'neutral');
        detail.guardianCausalStoryView = this.causalTrace.buildStoryView(trace, 'abu');
      }
    }

    return detail;
  }

  private async attachCausalTraceRef(
    tripId: string,
    row: InternalUnifiedProblemRow,
  ) {
    try {
      const collected = await this.collector.collect(tripId).catch(() => undefined);
      const worldStateVersion = await this.causalTrace.resolveWorldStateVersion(
        tripId,
        collected?.tripVersion,
      );
      const trace = await this.causalTrace.ensureProblemTrace({
        tripId,
        problemId: row.problemId,
        worldStateVersion,
        semanticKey: row.semanticKey,
        problemType: row.type,
        dimension: row.dimension,
        diagnosticMessage: row.queueDescription ?? row.summary,
      });
      return this.causalTrace.toRef(trace);
    } catch (e) {
      this.logger.warn(
        `attachCausalTraceRef failed trip=${tripId} problem=${row.problemId}: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    }
  }

  async previewAction(
    tripId: string,
    problemId: string,
    actionId: string,
    userId: string,
    opts?: { includeDebug?: boolean },
  ): Promise<UnifiedDecisionActionPreviewView> {
    const row = await this.findRow(tripId, problemId);
    if (!row) throw new NotFoundException(`DECISION_PROBLEM_NOT_FOUND: ${problemId}`);

    const options = await this.getProblemOptions(tripId, problemId, opts);
    const action = options.actions.find((a) => a.actionId === actionId);
    if (!action) throw new NotFoundException(`DECISION_ACTION_NOT_FOUND: ${actionId}`);

    const isCanonical =
      row.authority === 'CANONICAL' &&
      row.route?.engineId === 'CANONICAL_DECISION_RUNTIME' &&
      row.route?.resolution === 'PRIMARY';

    const preview = isCanonical
      ? await this.canonical.previewOption(tripId, problemId, actionId)
      : await this.legacy.previewOption(tripId, problemId, actionId, userId);

    const legacyPreview = preview as DecisionOptionPreviewResponse;
    let repairPreview = legacyPreview.repairPreview;
    // Canonical preview 无 feasibility dry-run；补拉 legacy repairPreview 供 inspector planDiff 多行投影
    if (!repairPreview) {
      try {
        const legacyOnly = await this.legacy.previewOption(
          tripId,
          problemId,
          actionId,
          userId,
        );
        repairPreview = legacyOnly.repairPreview;
      } catch {
        // legacy 不可用时沿用 canonical preview
      }
    }
    let requiredAcknowledgements = legacyPreview.requiredAcknowledgements;
    const detail = await this.getProblemDetail(tripId, problemId, opts);
    if (!requiredAcknowledgements?.length) {
      try {
        const legacyDetail = await this.legacy.getProblem(tripId, problemId);
        requiredAcknowledgements = buildRequiredAcknowledgements({
          requiresConfirmation: action.requiresConfirmation,
          enforcement: detail.problem.enforcement,
          detail: {
            type: legacyDetail.type,
            semanticKey: legacyDetail.semanticKey,
            assertions: legacyDetail.assertions,
          },
        });
      } catch {
        requiredAcknowledgements = buildRequiredAcknowledgements({
          requiresConfirmation: action.requiresConfirmation,
          enforcement: detail.problem.enforcement,
          detail: {
            type: detail.problem.type,
            semanticKey: detail.problem.semanticKey,
            assertions: [],
          },
        });
      }
    }

    let causalTraceRef = detail.causalTraceRef;
    let causalStoryView = detail.causalStoryView;
    let boundTrace: ReturnType<CanonicalCausalTraceService['bindPreview']> | undefined;
    if (this.causalTrace && detail.causalTraceRef) {
      const timeTradeoff = preview.tradeoffs?.find((t) => t.dimension === 'TIME');
      boundTrace = this.causalTrace.bindPreview({
        traceId: detail.causalTraceRef.traceId,
        optionId: actionId,
        problemId,
        metricsBefore:
          typeof timeTradeoff?.value === 'number' ? { timeMinutes: timeTradeoff.value } : undefined,
      });
      if (boundTrace) {
        causalTraceRef = this.causalTrace.toRef(boundTrace);
        causalStoryView = this.causalTrace.buildStoryView(boundTrace, 'neutral');
      }
    }

    const guardianCausalStoryView = boundTrace
      ? this.causalTrace.buildStoryView(boundTrace, 'abu')
      : detail.guardianCausalStoryView;

    return {
      schemaId: 'tripnara.unified_decision_action_preview@v2',
      tripId,
      problemId,
      actionId,
      generatedAt: new Date().toISOString(),
      action,
      tradeoffs: preview.tradeoffs ?? [],
      predictedImpact: preview.predictedImpact,
      proposedMutations: preview.proposedMutations,
      repairPreview,
      requiredAcknowledgements: requiredAcknowledgements?.length
        ? requiredAcknowledgements
        : undefined,
      causalTraceRef,
      causalStoryView,
      guardianCausalStoryView,
      debug: options.debug,
    };
  }

  private pickGuardianNarrativeFromItems(
    items: UnifiedDecisionProblemListItem[],
  ): { headline: string; assessment: string } | undefined {
    const travel = items.find(
      (item) =>
        item.guardianCausalStoryView &&
        !['RESOLVED', 'DISMISSED'].includes(item.workflowStatus) &&
        (item.semanticKey?.includes('travel') || item.dimension === 'SCHEDULE'),
    );
    if (!travel?.guardianCausalStoryView) return undefined;
    return {
      headline: travel.guardianCausalStoryView.headline,
      assessment: travel.guardianCausalStoryView.assessment,
    };
  }

  private async enrichListItemsWithCausalNarrative(
    tripId: string,
    items: UnifiedDecisionProblemListItem[],
    rows: InternalUnifiedProblemRow[],
  ): Promise<UnifiedDecisionProblemListItem[]> {
    const rowByProblemId = new Map(rows.map((row) => [row.problemId, row]));
    const collected = await this.collector.collect(tripId).catch(() => undefined);
    const worldStateVersion = await this.causalTrace.resolveWorldStateVersion(
      tripId,
      collected?.tripVersion,
    );

    return Promise.all(
      items.map(async (item) => {
        const row = rowByProblemId.get(item.problemId);
        if (!row || ['RESOLVED', 'DISMISSED'].includes(item.workflowStatus)) return item;
        if (item.causalStoryView?.chain?.length) return item;
        try {
          const trace = await this.causalTrace.ensureProblemTrace({
            tripId,
            problemId: row.problemId,
            worldStateVersion,
            semanticKey: row.semanticKey,
            problemType: row.type,
            dimension: row.dimension,
            diagnosticMessage: row.queueDescription ?? row.summary,
          });
          return {
            ...item,
            causalTraceRef: this.causalTrace.toRef(trace),
            causalStoryView: this.causalTrace.buildStoryView(trace, 'neutral'),
            guardianCausalStoryView: this.causalTrace.buildStoryView(trace, 'abu'),
          };
        } catch {
          return item;
        }
      }),
    );
  }

  private async findRow(tripId: string, problemId: string): Promise<InternalUnifiedProblemRow | undefined> {
    const rows = await this.collectRowsCached(tripId);
    return rows.find(
      (r) =>
        r.problemId === problemId ||
        r.semanticKey === problemId ||
        r.instanceKey === problemId,
    );
  }

  private async loadTripStatus(tripId: string): Promise<string | undefined> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    return trip?.status ?? undefined;
  }

  private async buildRouteContext(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    return { destination: trip?.destination ?? undefined };
  }
}
