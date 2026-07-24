/**
 * RFC-002 Phase 1 — single entry for Unified Decision API.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DecisionProblemNegotiationOrchestratorService } from '../../../trips/process-fairness/services/decision-problem-negotiation-orchestrator.service';
import type { DecisionProblemNegotiationHints } from '../../../trips/process-fairness/types/decision-problem-negotiation.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { isDecisionGatewayUnifiedEnabled } from '../config/decision-gateway.config';
import { isRfc001CanonicalSliceEnabled } from '../../../trips/guardian-decision-core/config/rfc001-iceland.config';
import type {
  AuthorizeDecisionGatewayInput,
  ExecuteDecisionGatewayInput,
  UnifiedDecisionCenterView,
} from '../contracts/decision-gateway.types';
import type { UnifiedDecisionProblemListView } from '../contracts/unified-decision-ui.types';
import { UnifiedDecisionProblemReadModelService } from './unified-decision-problem-read-model.service';
import { UnifiedDecisionResolutionService } from './unified-decision-resolution.service';
import { DecisionCollaborativeSubTaskService } from './decision-collaborative-subtask.service';
import type {
  ApplyDecisionProblemResponse,
  DecisionProblemApplyTaskResponse,
  StartDecisionProblemApplyResponse,
  CreateDecisionCollaborativeSubTaskRequest,
  CreateDecisionCollaborativeSubTaskResponse,
  ListDecisionCollaborativeSubTasksResponse,
  DeleteDecisionCollaborativeSubTaskResponse,
  SubmitDecisionProblemResolutionRequest,
  SubmitDecisionProblemResolutionResponse,
  UpdateDecisionCollaborativeSubTaskRequest,
  UpdateDecisionCollaborativeSubTaskResponse,
} from '../contracts/unified-decision-ui.types';
import type { ActiveDestinationPackSet } from '../../packs/contracts/destination-pack.types';
import type {
  DecisionProblemStatus,
  DecisionProblemType,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import { isDestinationPackRuntimeEnabled } from '../../packs/config/destination-pack.config';
import { DestinationPackOverlayResolverService } from '../../packs/loader/destination-pack-overlay-resolver.service';
import { DecisionRouteResolverService } from '../routing/decision-route-resolver.service';
import { RouteLineageStoreService } from '../lineage/route-lineage.store.service';
import { CanonicalDecisionEngineAdapter } from '../engines/canonical-decision-engine.adapter';
import { LegacyV15EngineAdapter } from '../engines/legacy-v15-engine.adapter';
import { DecisionTriggerGatewayService } from '../../trigger/decision-trigger.gateway.service';
import { isDecisionTriggerGatewayEnabled } from '../../trigger/decision-trigger.config';
import { MonitoringReplanningContextService } from '../../trigger/monitoring-replanning-context.service';
import { DecisionCaseService } from '../../decision-cases/services/decision-case.service';
import type { DecisionOpportunityListView } from '../../decision-cases/contracts/decision-case.types';

@Injectable()
export class DecisionEngineGatewayService {
  private readonly openProblemSeedLiteCache = new Map<
    string,
    {
      expiresAt: number;
      seeds: Array<{
        problemId: string;
        title: string;
        description: string;
        type: DecisionProblemType;
        status: DecisionProblemStatus;
      }>;
    }
  >();

  private static readonly OPEN_PROBLEM_SEED_LITE_TTL_MS = 5_000;

  private readonly problemTitleLiteCache = new Map<
    string,
    { expiresAt: number; title: string }
  >();

  private static readonly PROBLEM_TITLE_LITE_TTL_MS = 30_000;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
    private readonly routeResolver: DecisionRouteResolverService,
    private readonly lineageStore: RouteLineageStoreService,
    private readonly canonical: CanonicalDecisionEngineAdapter,
    private readonly legacy: LegacyV15EngineAdapter,
    private readonly packOverlay: DestinationPackOverlayResolverService,
    private readonly readModel: UnifiedDecisionProblemReadModelService,
    private readonly resolutions: UnifiedDecisionResolutionService,
    private readonly collaborativeSubTasks: DecisionCollaborativeSubTaskService,
    @Optional() private readonly triggerGateway?: DecisionTriggerGatewayService,
    @Optional() private readonly monitoringReplanning?: MonitoringReplanningContextService,
    @Optional() private readonly decisionCases?: DecisionCaseService,
  ) {}

  assertGatewayEnabled(): void {
    if (!isDecisionGatewayUnifiedEnabled()) {
      throw new ForbiddenException('DECISION_GATEWAY_UNIFIED is not enabled');
    }
  }

  async getDecisionCenter(tripId: string): Promise<UnifiedDecisionCenterView> {
    this.assertGatewayEnabled();
    const [list, overview, ctx] = await Promise.all([
      this.readModel.listProblems(tripId),
      this.readModel.getOverview(tripId),
      this.buildRouteContext(tripId),
    ]);

    const route = this.routeResolver.resolve({
      tripId,
      destinationCountry: ctx.destination,
      hasCanonicalProblem: ctx.canonicalProblemCount > 0,
    });

    let activePacks: ActiveDestinationPackSet | undefined;
    if (isDestinationPackRuntimeEnabled()) {
      activePacks = this.packOverlay.resolve({
        country: ctx.destination,
      });
    }

    const canonicalProblems = list.items.filter((item) => item.origin.authority === 'CANONICAL');
    const canonical =
      isRfc001CanonicalSliceEnabled() && canonicalProblems.length
        ? {
            schemaId: 'tripnara.unified_decision_center_canonical_lite@v1',
            tripId,
            generatedAt: new Date().toISOString(),
            problems: canonicalProblems,
            problemCount: canonicalProblems.length,
          }
        : undefined;

    return {
      schemaId: 'tripnara.unified_decision_center@v1',
      tripId,
      generatedAt: new Date().toISOString(),
      activeResolution: route.resolution,
      activePacks,
      canonical,
      legacy: overview,
      problemCount: list.meta.openCount,
    };
  }

  async listProblems(
    tripId: string,
    opts?: { includeDebug?: boolean },
  ): Promise<UnifiedDecisionProblemListView> {
    this.assertGatewayEnabled();
    return this.readModel.listProblems(tripId, {
      includeDebug: opts?.includeDebug,
      queueOnly: true,
    });
  }

  async listDecisionOpportunities(tripId: string): Promise<DecisionOpportunityListView> {
    this.assertGatewayEnabled();
    if (!this.decisionCases) {
      return {
        schemaId: 'tripnara.decision_opportunities@v1',
        tripId,
        generatedAt: new Date().toISOString(),
        meta: { total: 0, eligibleCount: 0 },
        items: [],
      };
    }
    return this.decisionCases.listOpportunities(tripId);
  }

  async publishDecisionOpportunity(tripId: string, opportunityId: string) {
    this.assertGatewayEnabled();
    if (!this.decisionCases) {
      throw new BadRequestException('DECISION_CASE_SERVICE_UNAVAILABLE');
    }
    const published = await this.decisionCases.publishOpportunityAsCase(tripId, opportunityId);
    if (!published) {
      throw new BadRequestException('OPPORTUNITY_NOT_ELIGIBLE_OR_BELOW_MATERIALITY');
    }
    this.readModel.invalidateCache(tripId);
    return published;
  }

  /**
   * Lightweight problem list for BFF surfaces (collaborative-tasks, collab-overview).
   * Skips per-problem routing, semantic-key resolution, and lineage writes.
   */
  async listOpenProblemSeedsLite(tripId: string): Promise<
    Array<{
      problemId: string;
      title: string;
      description: string;
      type: DecisionProblemType;
      status: DecisionProblemStatus;
    }>
  > {
    this.assertGatewayEnabled();
    const cached = this.openProblemSeedLiteCache.get(tripId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.seeds;
    }
    const seeds = await this.loadOpenProblemSeedsLite(tripId);
    this.openProblemSeedLiteCache.set(tripId, {
      expiresAt: Date.now() + DecisionEngineGatewayService.OPEN_PROBLEM_SEED_LITE_TTL_MS,
      seeds,
    });
    return seeds;
  }

  private async loadOpenProblemSeedsLite(tripId: string): Promise<
    Array<{
      problemId: string;
      title: string;
      description: string;
      type: DecisionProblemType;
      status: DecisionProblemStatus;
    }>
  > {
    const seeds: Array<{
      problemId: string;
      title: string;
      description: string;
      type: DecisionProblemType;
      status: DecisionProblemStatus;
    }> = [];
    const canonicalIds = new Set<string>();

    if (isRfc001CanonicalSliceEnabled()) {
      try {
        const canonicalSeeds = await this.canonical.listProblemSummariesLite(tripId);
        for (const seed of canonicalSeeds) {
          canonicalIds.add(seed.problemId);
          seeds.push(seed);
        }
      } catch {
        // canonical list optional when trip missing
      }
    }

    const skipLegacyCollector =
      isRfc001CanonicalSliceEnabled() && seeds.length > 0;

    if (!skipLegacyCollector) {
      try {
        const legacy = await this.legacy.listProblems(tripId);
        for (const summary of legacy.items) {
          if (canonicalIds.has(summary.id)) continue;
          seeds.push({
            problemId: summary.id,
            title: summary.title,
            description: summary.title,
            type: summary.type,
            status: summary.status,
          });
        }
      } catch {
        // legacy list optional
      }
    }

    return seeds;
  }

  /** Resolve titles for closed/open problems (BFF sub-task list). */
  async getProblemTitlesLite(
    tripId: string,
    problemIds: string[],
  ): Promise<Record<string, string>> {
    this.assertGatewayEnabled();
    const unique = [...new Set(problemIds.filter(Boolean))];
    if (unique.length === 0) return {};

    const titles: Record<string, string> = {};
    const missing: string[] = [];

    for (const problemId of unique) {
      const cacheKey = `${tripId}:${problemId}`;
      const cached = this.problemTitleLiteCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        titles[problemId] = cached.title;
      } else {
        missing.push(problemId);
      }
    }

    if (missing.length > 0) {
      const seeds = await this.listOpenProblemSeedsLite(tripId);
      for (const seed of seeds) {
        if (!missing.includes(seed.problemId)) continue;
        titles[seed.problemId] = seed.title;
        this.problemTitleLiteCache.set(`${tripId}:${seed.problemId}`, {
          expiresAt: Date.now() + DecisionEngineGatewayService.PROBLEM_TITLE_LITE_TTL_MS,
          title: seed.title,
        });
      }
    }

    const stillMissing = unique.filter((id) => !titles[id]);
    await Promise.all(
      stillMissing.map(async (problemId) => {
        try {
          const detail = await this.readModel.getProblemDetail(tripId, problemId);
          titles[problemId] = detail.problem.title;
          this.problemTitleLiteCache.set(`${tripId}:${problemId}`, {
            expiresAt: Date.now() + DecisionEngineGatewayService.PROBLEM_TITLE_LITE_TTL_MS,
            title: detail.problem.title,
          });
        } catch {
          // problem may have been purged from read model
        }
      }),
    );

    return titles;
  }

  async getProblem(
    tripId: string,
    problemId: string,
    options?: { userId?: string; focusConflictId?: string; includeDebug?: boolean },
  ) {
    this.assertGatewayEnabled();
    const hints = await this.loadNegotiationHints(tripId, problemId, options);
    const detail = await this.readModel.getProblemDetail(tripId, problemId, {
      includeDebug: options?.includeDebug,
      negotiation: hints?.negotiation,
      suggestedNegotiationDomain: hints?.suggestedNegotiationDomain,
      suggestedDecisionNode: hints?.suggestedDecisionNode,
    });
    return detail;
  }

  /** Server-side helper — includes debug/raw payloads for internal adapters */
  async getProblemWithDebug(tripId: string, problemId: string) {
    return this.getProblem(tripId, problemId, { includeDebug: true });
  }

  private async loadNegotiationHints(
    tripId: string,
    problemId: string,
    options?: { userId?: string; focusConflictId?: string },
  ): Promise<DecisionProblemNegotiationHints | null> {
    if (!options?.userId) {
      return null;
    }
    // DecisionCase 无 legacy/canonical raw；协商层跳过，避免详情 500
    if (problemId.startsWith('dc_')) {
      return null;
    }
    try {
      const orchestrator = this.moduleRef.get(DecisionProblemNegotiationOrchestratorService, {
        strict: false,
      });
      return orchestrator.projectForProblemDetail(
        tripId,
        options.userId,
        problemId,
        options.focusConflictId,
      );
    } catch {
      return null;
    }
  }

  async getOptions(tripId: string, problemId: string, opts?: { includeDebug?: boolean }) {
    this.assertGatewayEnabled();
    return this.readModel.getProblemOptions(tripId, problemId, opts);
  }

  async previewOption(
    tripId: string,
    problemId: string,
    optionId: string,
    userId: string,
    opts?: { includeDebug?: boolean },
  ) {
    this.assertGatewayEnabled();
    return this.readModel.previewAction(tripId, problemId, optionId, userId, opts);
  }

  async getOverview(tripId: string, opts?: { includeDebug?: boolean }) {
    this.assertGatewayEnabled();
    return this.readModel.getOverview(tripId, opts);
  }

  async getCausalTraceReplay(tripId: string, problemId: string) {
    this.assertGatewayEnabled();
    return this.readModel.getCausalTraceReplay(tripId, problemId);
  }

  async submitResolution(
    tripId: string,
    problemId: string,
    userId: string,
    body: SubmitDecisionProblemResolutionRequest,
  ): Promise<SubmitDecisionProblemResolutionResponse> {
    this.assertGatewayEnabled();
    return this.resolutions.submitResolution(tripId, problemId, userId, body);
  }

  async applyResolution(
    tripId: string,
    problemId: string,
    userId: string,
  ): Promise<ApplyDecisionProblemResponse> {
    this.assertGatewayEnabled();
    return this.resolutions.applyResolution(tripId, problemId, userId);
  }

  async startApplyResolutionAsync(
    tripId: string,
    problemId: string,
    userId: string,
  ): Promise<StartDecisionProblemApplyResponse> {
    this.assertGatewayEnabled();
    return this.resolutions.startApplyResolutionAsync(tripId, problemId, userId);
  }

  getApplyTask(
    tripId: string,
    problemId: string,
    taskId: string,
  ): DecisionProblemApplyTaskResponse {
    this.assertGatewayEnabled();
    return this.resolutions.getApplyTask(tripId, problemId, taskId);
  }

  async createCollaborativeSubTask(
    tripId: string,
    problemId: string,
    userId: string,
    body: CreateDecisionCollaborativeSubTaskRequest,
  ): Promise<CreateDecisionCollaborativeSubTaskResponse> {
    this.assertGatewayEnabled();
    return this.collaborativeSubTasks.createSubTask(tripId, problemId, userId, body);
  }

  async listCollaborativeSubTasks(
    tripId: string,
    problemId: string,
    resolutionId?: string,
  ): Promise<ListDecisionCollaborativeSubTasksResponse> {
    this.assertGatewayEnabled();
    return this.collaborativeSubTasks.listSubTasks(tripId, problemId, resolutionId);
  }

  async updateCollaborativeSubTask(
    tripId: string,
    problemId: string,
    subTaskId: string,
    body: UpdateDecisionCollaborativeSubTaskRequest,
  ): Promise<UpdateDecisionCollaborativeSubTaskResponse> {
    this.assertGatewayEnabled();
    return this.collaborativeSubTasks.updateSubTask(tripId, problemId, subTaskId, body);
  }

  async deleteCollaborativeSubTask(
    tripId: string,
    problemId: string,
    subTaskId: string,
  ) {
    this.assertGatewayEnabled();
    return this.collaborativeSubTasks.deleteSubTask(tripId, problemId, subTaskId);
  }

  async pollWeatherHazard(
    tripId: string,
    dayIndex: number,
    runFull?: boolean,
  ) {
    this.assertGatewayEnabled();
    if (isDecisionTriggerGatewayEnabled() && this.triggerGateway) {
      const pollMetadata = await this.monitoringReplanning?.buildPollMetadata(
        tripId,
        'WEATHER_HAZARD',
      );
      const dispatch = await this.triggerGateway.dispatch({
        kind: 'CANONICAL_MONITORING_POLL',
        tripId,
        source: 'UNIFIED_DECISION_API',
        monitoring: { pollKind: 'WEATHER_HAZARD', dayIndex, runFull },
        metadata: pollMetadata,
      });
      if (dispatch.status !== 'COMPLETED') {
        throw new BadRequestException(
          dispatch.error?.message ?? 'Decision Trigger Gateway weather poll failed',
        );
      }
      return dispatch.result;
    }
    return this.canonical.pollWeatherHazard(tripId, dayIndex, runFull);
  }

  async scanDailyLoad(tripId: string, runFull?: boolean) {
    this.assertGatewayEnabled();
    if (isDecisionTriggerGatewayEnabled() && this.triggerGateway) {
      const pollMetadata = await this.monitoringReplanning?.buildPollMetadata(
        tripId,
        'DAILY_LOAD',
      );
      const dispatch = await this.triggerGateway.dispatch({
        kind: 'CANONICAL_MONITORING_POLL',
        tripId,
        source: 'UNIFIED_DECISION_API',
        monitoring: { pollKind: 'DAILY_LOAD', runFull },
        metadata: pollMetadata,
      });
      if (dispatch.status !== 'COMPLETED') {
        throw new BadRequestException(
          dispatch.error?.message ?? 'Decision Trigger Gateway daily load scan failed',
        );
      }
      return dispatch.result;
    }
    return this.canonical.scanDailyLoad(tripId, runFull);
  }

  async evaluate(tripId: string, problemId: string) {
    this.assertGatewayEnabled();
    const ctx = await this.buildRouteContext(tripId, problemId);
    const route = this.routeResolver.resolve({
      tripId,
      problemId,
      semanticKey: ctx.semanticKey,
      destinationCountry: ctx.destination,
      hasCanonicalProblem: ctx.hasCanonicalProblem,
    });
    await this.lineageStore.append(tripId, { problemId, route });

    if (route.engineId !== 'CANONICAL_DECISION_RUNTIME' || route.resolution !== 'PRIMARY') {
      throw new BadRequestException({
        resolution: route.resolution,
        message: 'Evaluate for this problem is only supported on Canonical Runtime (Phase 1)',
      });
    }

    if (isDecisionTriggerGatewayEnabled() && this.triggerGateway) {
      const dispatch = await this.triggerGateway.dispatch({
        kind: 'CANONICAL_PROBLEM_EVALUATE',
        tripId,
        problemId,
        source: 'UNIFIED_DECISION_API',
        semanticCapability: ctx.semanticKey,
        metadata: { unifiedRoute: route },
      });
      if (dispatch.status !== 'COMPLETED') {
        throw new BadRequestException(
          dispatch.error?.message ?? 'Decision Trigger Gateway evaluate failed',
        );
      }
      return { ok: true, route, decisionRunId: dispatch.runId, ...(dispatch.result as object) };
    }

    const result = await this.canonical.evaluate(tripId, problemId);
    return { ok: true, route, ...result };
  }

  async authorize(input: AuthorizeDecisionGatewayInput) {
    this.assertGatewayEnabled();
    const engine = await this.resolveEngineForDecision(input.tripId, input.decisionId);
    if (engine !== 'CANONICAL_DECISION_RUNTIME') {
      throw new BadRequestException(
        'Unified L2 authorize is only supported for Canonical Runtime decisions in Phase 1',
      );
    }
    const route = this.routeResolver.resolve({
      tripId: input.tripId,
      hasCanonicalProblem: true,
      hasExistingDecisionRecord: true,
    });
    await this.lineageStore.append(input.tripId, {
      problemId: undefined,
      route,
    });
    const result = await this.canonical.authorize(input);
    return { ok: true, route, ...result };
  }

  async execute(input: ExecuteDecisionGatewayInput) {
    this.assertGatewayEnabled();
    const engine = await this.resolveEngineForDecision(input.tripId, input.decisionId);
    if (engine !== 'CANONICAL_DECISION_RUNTIME') {
      throw new BadRequestException(
        'Unified execute is only supported for Canonical Runtime decisions in Phase 1',
      );
    }
    const result = await this.canonical.execute(input);
    return { ok: true, ...result };
  }

  async rollback(tripId: string, decisionId: string) {
    this.assertGatewayEnabled();
    const engine = await this.resolveEngineForDecision(tripId, decisionId);
    if (engine !== 'CANONICAL_DECISION_RUNTIME') {
      throw new BadRequestException(
        'Unified rollback is only supported for Canonical Runtime decisions in Phase 1',
      );
    }
    const result = await this.canonical.rollback(tripId, decisionId);
    return { ok: true, ...result };
  }

  async listRouteLineage(tripId: string) {
    this.assertGatewayEnabled();
    return this.lineageStore.list(tripId);
  }

  private async resolveEngineForDecision(
    tripId: string,
    decisionId: string,
  ): Promise<'CANONICAL_DECISION_RUNTIME' | 'LEGACY_V15_ADAPTER'> {
    if (await this.canonical.ownsDecision(tripId, decisionId)) {
      return 'CANONICAL_DECISION_RUNTIME';
    }
    if (await this.legacy.ownsDecision(tripId, decisionId)) {
      return 'LEGACY_V15_ADAPTER';
    }
    throw new NotFoundException(`Decision ${decisionId} not found`);
  }

  private async buildRouteContext(tripId: string, problemId?: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    const destination = trip?.destination ?? undefined;
    let hasCanonicalProblem = false;
    let semanticKey: string | undefined;
    let hasExistingDecisionRecord = false;
    let canonicalProblemCount = 0;

    if (problemId) {
      hasCanonicalProblem = await this.canonical.hasProblem(tripId, problemId);
      if (hasCanonicalProblem) {
        semanticKey = await this.canonical.resolveProblemSemanticKey(tripId, problemId);
      }
    } else if (isRfc001CanonicalSliceEnabled()) {
      try {
        const view = await this.canonical.getDecisionCenter(tripId);
        canonicalProblemCount = view.problems?.length ?? 0;
        hasExistingDecisionRecord = Boolean(view.decisionRef?.decisionId);
      } catch {
        canonicalProblemCount = 0;
      }
    }

    return {
      destination,
      hasCanonicalProblem,
      semanticKey,
      hasExistingDecisionRecord,
      canonicalProblemCount,
    };
  }
}
