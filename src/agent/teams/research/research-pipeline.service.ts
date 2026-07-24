/**
 * ResearchPipelineService
 *
 * MAT 3.0：拓扑驱动研究管线 — prepare → runTopologyPlanOnWorkspace → finalize；
 * 实现 `IResearchExecutor`（Kernel RESEARCH 阶段）。
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState, EnvironmentState } from '../../../decision/kernel/decision-state.types';
import type {
  IResearchExecutor,
  PhaseExecutorContext,
} from '../../../decision/kernel/interfaces/phase-executor.interface';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { WorldModelCollectorService } from '../../execution/shared/world-model-collector.service';
import { PredictionCollectorService } from '../../execution/shared/prediction-collector.service';
import { ContextHydrationService } from '../../execution/shared/context-hydration.service';
import { ResearchWorldFactShadowIngestorService } from '../../../world-facts/research-world-fact-shadow-ingestor.service';
import { calculateEnvironmentRisk, getWeatherForTime } from '../../../trips/ontology/environment/environment-domain.util';
import { ResearchMemberRegistry } from './research-member.registry';
import type { LeaderResearchWorkspace } from './research-scoped-workspace.types';
import type { ResearchTopologyPlan } from './research-topology.types';
import {
  ResearchContextManager,
  ResearchPatchScopeViolationError,
  createSuturePatchFromPrior,
  deepCloneResearchData,
  computeResearchPatchFromIsolation,
  partitionResearchPatchByScope,
} from './research-context-manager';
import { ResearchTeamBusService, ResearchTeamBusTimeoutError } from './research-team-bus.service';
import {
  RESEARCH_PARALLEL_ASSIGNMENT_OP,
  RESEARCH_SEQUENTIAL_ASSIGNMENT_OP,
} from './research-team-bus.types';
import type {
  ResearchParallelAssignmentPayload,
  ResearchScopedPatchScope,
  ResearchSequentialAssignmentPayload,
  ResearchSequentialMemberKind,
  ScopedResearchPatch,
  ResearchBudgetBucketsMap,
  ResearchFinancials,
} from './research-team-bus.types';
import type { ResearchContextPhase, ResearchMergeAttribution } from './research-context.types';
import type { FinancialFeedbackLine } from './research-team-budget-ledger.util';
import { accumulateResearchFinancialReport } from './research-team-budget-ledger.util';
import { buildResearchFinancialsFromHotelLiveRefresh } from './research-member-hotel-financials.util';
import {
  pickBudgetRerollTargetFromReport,
  shouldTriggerBudgetRollback,
  type BudgetArbitratorDecisionLogEntry,
} from './research-team-budget-rollback.util';
import { incrementRealtimeRerollCount, readRealtimeRerollCount } from '../../memory/emotional-resonance/research-realtime-frustration.util';
import { buildUserEmotionalAccountSnapshot } from '../../memory/emotional-resonance/tolerance-calculator.util';
import type { UserEmotionalAccount } from '../../memory/emotional-resonance/user-emotional-account.types';

@Injectable()
export class ResearchPipelineService implements IResearchExecutor {
  private readonly logger = new Logger(ResearchPipelineService.name);

  constructor(
    private readonly worldModelCollector: WorldModelCollectorService,
    private readonly predictionCollector: PredictionCollectorService,
    private readonly contextHydration: ContextHydrationService,
    private readonly researchMemberRegistry: ResearchMemberRegistry,
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional()
    private readonly worldFactShadowIngest?: ResearchWorldFactShadowIngestorService,
    @Optional() private readonly researchTeamBus?: ResearchTeamBusService,
  ) {}

  private finiteNumber(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }

  private cloneResearchPrior(prior: Record<string, unknown>): Record<string, unknown> {
    const sc = (globalThis as any).structuredClone as ((x: unknown) => unknown) | undefined;
    try {
      if (sc) return sc(prior) as Record<string, unknown>;
    } catch {
      // fall through
    }
    try {
      return JSON.parse(JSON.stringify(prior)) as Record<string, unknown>;
    } catch {
      return { ...prior };
    }
  }

  private setWindSpeedMeta(
    researchData: Record<string, unknown>,
    meta: {
      source: 'failure_risk_prediction' | 'weather_predictions' | 'weather_forecast';
      aggregation: 'mean' | 'max' | 'p90';
      sampleCount: number;
      /** 当 aggregation=p90 时记录分位数算法定义，避免口径争议 */
      quantileMethod?: 'ceil-index';
      /** 可追溯证据引用（用于 external/internal 判定与回放） */
      evidence?: { ids: string[]; sources?: string[] };
    },
  ): void {
    (researchData as any).windSpeedMs_meta = meta;
  }

  private windAggregation(): 'mean' | 'max' | 'p90' {
    const v = String(process.env.DECISION_OS_WIND_AGG ?? 'mean').toLowerCase();
    return v === 'max' ? 'max' : v === 'p90' ? 'p90' : 'mean';
  }

  private aggregateWind(values: number[], agg: 'mean' | 'max' | 'p90'): number | undefined {
    if (!values.length) return undefined;
    if (agg === 'max') return Math.max(...values);
    if (agg === 'p90') {
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.9 * sorted.length) - 1));
      return sorted[idx];
    }
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * 从 RESEARCH 输出中抽取「独立通道」的观测风速（m/s），并写入 researchData.windSpeedMs。
   * 优先级（按更“独立/更原始”优先）：
   * - failure_risk_prediction.predictions[].windSpeed (m/s) 取均值
   * - weather_predictions[].windSpeed (m/s) 取均值
   * - weather_forecast.forecasts[].wind.speed_kmh (km/h -> m/s) 取均值
   */
  private deriveWindSpeedMs(researchData: Record<string, unknown>): number | undefined {
    const aggregation = this.windAggregation();
    const frp = researchData.failure_risk_prediction as any;
    const preds = Array.isArray(frp?.predictions) ? frp.predictions : undefined;
    if (preds?.length) {
      const ws = preds.map((p: any) => this.finiteNumber(p?.windSpeed)).filter((n: any) => n !== undefined) as number[];
      if (ws.length > 0) {
        const frpEvidenceId = (researchData as any).failure_risk_prediction_evidence_id;
        const frpEvidenceSource = (researchData as any).failure_risk_prediction_evidence_source;
        this.setWindSpeedMeta(researchData, {
          source: 'failure_risk_prediction',
          aggregation,
          sampleCount: ws.length,
          quantileMethod: aggregation === 'p90' ? 'ceil-index' : undefined,
          evidence:
            typeof frpEvidenceId === 'string' && frpEvidenceId.trim()
              ? { ids: [frpEvidenceId], sources: typeof frpEvidenceSource === 'string' ? [frpEvidenceSource] : undefined }
              : undefined,
        });
        return this.aggregateWind(ws, aggregation);
      }
    }

    const wp = researchData.weather_predictions as any;
    if (Array.isArray(wp) && wp.length > 0) {
      const ws = wp.map((p: any) => this.finiteNumber(p?.windSpeed)).filter((n: any) => n !== undefined) as number[];
      if (ws.length > 0) {
        const wpEvidenceId = (researchData as any).weather_predictions_evidence_id;
        const wpEvidenceSource = (researchData as any).weather_predictions_evidence_source;
        this.setWindSpeedMeta(researchData, {
          source: 'weather_predictions',
          aggregation,
          sampleCount: ws.length,
          quantileMethod: aggregation === 'p90' ? 'ceil-index' : undefined,
          evidence:
            typeof wpEvidenceId === 'string' && wpEvidenceId.trim()
              ? { ids: [wpEvidenceId], sources: typeof wpEvidenceSource === 'string' ? [wpEvidenceSource] : undefined }
              : undefined,
        });
        return this.aggregateWind(ws, aggregation);
      }
    }

    const wf = researchData.weather_forecast as any;
    const fs = Array.isArray(wf?.forecasts) ? wf.forecasts : undefined;
    if (fs?.length) {
      const kmhs = fs
        .map((f: any) => this.finiteNumber(f?.wind?.speed_kmh))
        .filter((n: any) => n !== undefined) as number[];
      if (kmhs.length > 0) {
        const ms = kmhs.map((k) => k / 3.6);
        const ev = Array.isArray(wf?.evidence) ? wf.evidence : [];
        const evidenceIds = ev.map((e: any) => e?.evidence_id).filter(Boolean);
        const evidenceSources = ev.map((e: any) => e?.source).filter(Boolean);
        this.setWindSpeedMeta(researchData, {
          source: 'weather_forecast',
          aggregation,
          sampleCount: ms.length,
          quantileMethod: aggregation === 'p90' ? 'ceil-index' : undefined,
          evidence: evidenceIds.length > 0 ? { ids: evidenceIds, sources: evidenceSources } : undefined,
        });
        return this.aggregateWind(ms, aggregation);
      }
    }

    return undefined;
  }

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    researchData: Record<string, unknown>;
    environmentPatch: Partial<EnvironmentState>;
  }> {
    this.logger.debug(`[ResearchPipeline] 执行 RESEARCH 阶段 requestId=${ctx.requestId}`);
    return this.runResearchPipeline(dso, ctx);
  }

  /**
   * 单轨研究管线：prepare → Registry 拓扑 → Member → finalize（与 `ResearchTeamLeader` 共用）。
   */
  async runResearchPipeline(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    researchData: Record<string, unknown>;
    environmentPatch: Partial<EnvironmentState>;
  }> {
    const ws = await this.prepareLeaderResearchWorkspace(dso, ctx);
    const plan = this.researchMemberRegistry.buildTopologyPlanForResearchExecution({
      effectiveMode: ws.effectiveMode,
      scopesForTopology: ws.scopesForTopology,
      hasTrip: !!ctx.tripPlanRequest,
    });
    await this.runTopologyPlanOnWorkspace(dso, ctx, ws, plan);
    return this.finalizeLeaderResearchWorkspace(dso, ctx, ws);
  }

  /**
   * 合并 prior、端点回填；不跑 Member（供 Leader 审计后再调度，或与 `runTopologyPlanOnWorkspace` 串联）。
   */
  async prepareLeaderResearchWorkspace(dso: DecisionState, ctx: PhaseExecutorContext): Promise<LeaderResearchWorkspace> {
    const researchMode = ctx.researchMode ?? 'full';
    const scopesToRecompute = ctx.researchScopesToRecompute ?? [];
    let effectiveMode: 'full' | 'transport_only' | 'scoped_partial' = researchMode;
    if (
      researchMode === 'scoped_partial' &&
      (!ctx.priorResearchData ||
        typeof ctx.priorResearchData !== 'object' ||
        Object.keys(ctx.priorResearchData).length === 0 ||
        scopesToRecompute.length === 0)
    ) {
      if (ctx.forbidScopedPartialDegradeToFull) {
        const msg =
          'scoped_partial missing prior/scopes under RETURN_TO_RESEARCH; refusing silent degrade to full';
        this.logger.warn(`[ResearchPipeline] ${msg} requestId=${ctx.requestId}`);
        throw new Error(msg);
      }
      this.logger.warn(
        `[ResearchPipeline] scoped_partial 缺少 priorResearchData 或 scopes，回退为 full requestId=${ctx.requestId}`,
      );
      effectiveMode = 'full';
      // 显式标记：调用方可写入 phase_execution_path（禁止静默）
      (ctx as { __scopedPartialDegradedToFull?: boolean }).__scopedPartialDegradedToFull = true;
    }

    const isTransportOnly = effectiveMode === 'transport_only';
    const isScopedPartial = effectiveMode === 'scoped_partial';

    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    let effectiveTrip: PhaseExecutorContext['tripPlanRequest'] = ctx.tripPlanRequest;

    if (isTransportOnly && ctx.priorResearchData && typeof ctx.priorResearchData === 'object') {
      Object.assign(researchData, this.cloneResearchPrior(ctx.priorResearchData as Record<string, unknown>));
      this.logger.debug(`[ResearchPipeline] transport_only: merged prior research keys=${Object.keys(researchData).join(',')}`);
    } else if (isScopedPartial && ctx.priorResearchData && typeof ctx.priorResearchData === 'object') {
      Object.assign(researchData, this.cloneResearchPrior(ctx.priorResearchData as Record<string, unknown>));
      this.logger.debug(
        `[ResearchPipeline] scoped_partial: merged prior keys=${Object.keys(researchData).join(',')} recompute=${scopesToRecompute.join(',')}`,
      );
    }

    const needsTransport =
      isTransportOnly ||
      (!isScopedPartial && effectiveMode === 'full') ||
      (isScopedPartial && scopesToRecompute.includes('transport'));

    if (ctx.tripPlanRequest) {
      const hydration = this.contextHydration.hydrateTripPlanForTransport(dso, ctx.tripPlanRequest, {
        recentMessages: ctx.recent_messages,
      });
      effectiveTrip = hydration.trip ?? ctx.tripPlanRequest;
      if (hydration.patchedFields.length > 0 && (needsTransport || !isScopedPartial)) {
        researchData.transport_endpoint_hydration = {
          fields: hydration.patchedFields,
          provenance: hydration.provenance,
          ...(hydration.derived_from_history?.length
            ? {
                derived_from_history: hydration.derived_from_history,
                fact_signature: hydration.fact_signature,
              }
            : {}),
          ...(hydration.geo_context_hint ? { geo_context_hint: hydration.geo_context_hint } : {}),
        };
        this.logger.debug(
          `[ResearchPipeline] transport 端点已回填: ${hydration.patchedFields.join(',')} provenance=${JSON.stringify(hydration.provenance ?? {})}`,
        );
      }
    }

    const scopesForTopology =
      effectiveMode === 'scoped_partial'
        ? ResearchMemberRegistry.normalizeScopesForTopology(scopesToRecompute as readonly string[])
        : [];

    return {
      researchData,
      evidenceRefs,
      effectiveTrip,
      effectiveMode,
      scopesForTopology,
      realtimeRerollCount: readRealtimeRerollCount(researchData),
    };
  }

  /**
   * 按 `ResearchTopologyPlan` 调度 Member（preParallel → parallel → sequential）。
   */
  async runTopologyPlanOnWorkspace(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    ws: LeaderResearchWorkspace,
    plan: ResearchTopologyPlan,
  ): Promise<void> {
    const { researchData, evidenceRefs, effectiveTrip } = ws;
    if (!effectiveTrip) return;
    const trip = effectiveTrip as NonNullable<PhaseExecutorContext['tripPlanRequest']>;
    const requestId = ctx.requestId;

    const mgr = new ResearchContextManager(researchData, evidenceRefs);
    const financialScratch: FinancialFeedbackLine[] = [];
    const leaderUserEmotionalAccount = this.buildLeaderUserEmotionalAccountSnapshot(ws, ctx);

    for (let pi = 0; pi < (plan.preParallelSequential ?? []).length; pi++) {
      const s = plan.preParallelSequential![pi]!;
      if (s.kind === 'transport') {
        if (this.researchTeamBus) {
          const seqTimeout = this.sequentialBusSlotTimeoutMs();
          await this.runSequentialBusAssignment(mgr, requestId, trip, ctx, {
            slotId: `pre_parallel:${pi}:${s.id}`,
            phase: 'pre_parallel',
            memberKind: 'transport',
            source: s.id,
            timeoutMs: seqTimeout,
            budgetBuckets: ws.researchBudgetBuckets,
            financialScratch,
          });
        } else {
          await mgr.runIsolated(s.id, 'pre_parallel', async (rd, er) => {
            await this.researchMemberRegistry.transport.runTransportSearch({
              requestId,
              tripPlanRequest: trip,
              researchData: rd,
              evidenceRefs: er,
              userCognitiveProfile: ctx.userCognitiveProfile,
            });
          });
        }
      }
    }

    if (this.researchTeamBus) {
      const baselineResearchData = mgr.forkResearchData();
      const baselineEvidenceRefs = mgr.forkEvidenceRefs();
      const rawTimeout = Number(process.env.RESEARCH_PARALLEL_SLOT_TIMEOUT_MS);
      const slotTimeout = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 180_000;

      type BusParallelJob = {
        slotId: string;
        source: string;
        memberKind: 'destination' | 'hotel' | 'flight';
        rd: Record<string, unknown>;
        er: string[];
      };

      type ParallelOutcome =
        | { kind: 'member_patch'; job: BusParallelJob; patch: ScopedResearchPatch; financials?: ResearchFinancials }
        | { kind: 'suture'; job: BusParallelJob };

      const busJobs: BusParallelJob[] = [];
      for (let index = 0; index < plan.parallel.length; index++) {
        const slot = plan.parallel[index]!;
        const slotId = `parallel:${index}:${slot.id}`;
        if (slot.kind === 'destination') {
          busJobs.push({
            slotId,
            source: slot.id,
            memberKind: 'destination',
            rd: deepCloneResearchData(baselineResearchData),
            er: [...baselineEvidenceRefs],
          });
        } else if (slot.kind === 'hotel') {
          busJobs.push({
            slotId,
            source: slot.id,
            memberKind: 'hotel',
            rd: deepCloneResearchData(baselineResearchData),
            er: [...baselineEvidenceRefs],
          });
        } else if (slot.kind === 'flight') {
          busJobs.push({
            slotId,
            source: slot.id,
            memberKind: 'flight',
            rd: deepCloneResearchData(baselineResearchData),
            er: [...baselineEvidenceRefs],
          });
        }
      }

      if (busJobs.length) {
        const outcomes: ParallelOutcome[] = await Promise.all(
          busJobs.map(async (job): Promise<ParallelOutcome> => {
            try {
              const payload = this.buildParallelBusPayload(job, trip, ctx, dso, ws, leaderUserEmotionalAccount);
              const waitP = this.researchTeamBus!.waitForSlot(requestId, job.slotId, slotTimeout);
              this.researchTeamBus!.publishAssignment(requestId, job.slotId, payload);
              const completion = await waitP;
              if (!completion.ok) {
                this.logger.warn(
                  `[ResearchPipeline] parallel bus ok=false slot=${job.slotId} memberKind=${job.memberKind} err=${completion.error ?? 'unknown'}`,
                );
                return { kind: 'suture', job };
              }
              if (!completion.patch) {
                throw new Error(`ResearchTeamBus: parallel slot missing scoped patch: ${job.slotId}`);
              }
              return { kind: 'member_patch', job, patch: completion.patch, financials: completion.financials };
            } catch (e) {
              const reason = e instanceof ResearchTeamBusTimeoutError ? 'timeout' : e instanceof Error ? e.message : String(e);
              this.logger.warn(
                `[ResearchPipeline] parallel bus slot failed slot=${job.slotId} memberKind=${job.memberKind} reason=${reason}`,
              );
              return { kind: 'suture', job };
            }
          }),
        );
        for (const o of outcomes) {
          if (o.kind === 'member_patch') {
            if (o.financials) {
              financialScratch.push({ slot_id: o.job.slotId, financials: o.financials });
            }
            this.applyMemberPatchOrSuture({
              mgr,
              patch: o.patch,
              source: o.job.source,
              phase: 'parallel',
              memberKind: o.job.memberKind,
              ctx,
              slotId: o.job.slotId,
            });
          } else {
            this.tryApplySutureFromPrior(mgr, o.job.memberKind, ctx, 'parallel');
          }
        }
      }
    } else {
      const parallelSlots = plan.parallel
        .map((slot) => {
          if (slot.kind === 'destination') {
            return {
              source: slot.id,
              run: (rd: Record<string, unknown>, er: string[]) =>
                this.researchMemberRegistry.destination.runDestinationBundle({
                  requestId,
                  routeDirectionId: ctx.routeDirectionId,
                  userId: ctx.userId,
                  dso,
                  tripPlanRequest: trip,
                  researchData: rd,
                  evidenceRefs: er,
                  itinerary: ctx.itinerary,
                  recentMessages: ctx.recent_messages,
                }),
            };
          }
          if (slot.kind === 'hotel') {
            return {
              source: slot.id,
              run: (rd: Record<string, unknown>, er: string[]) =>
                this.researchMemberRegistry.hotel.runScopedCommerce({
                  requestId,
                  tripPlanRequest: trip,
                  researchData: rd,
                  evidenceRefs: er,
                  researchAtomicRollbackSnapshot: ctx.researchAtomicRollbackSnapshot,
                  userCognitiveProfile: ctx.userCognitiveProfile,
                  ...(leaderUserEmotionalAccount ? { userEmotionalAccount: leaderUserEmotionalAccount } : {}),
                }),
            };
          }
          if (slot.kind === 'flight') {
            return {
              source: slot.id,
              run: (rd: Record<string, unknown>, er: string[]) =>
                this.researchMemberRegistry.flight.runScopedCommerce({
                  requestId,
                  tripPlanRequest: trip,
                  researchData: rd,
                  evidenceRefs: er,
                  userCognitiveProfile: ctx.userCognitiveProfile,
                  ...(leaderUserEmotionalAccount ? { userEmotionalAccount: leaderUserEmotionalAccount } : {}),
                }),
            };
          }
          return null;
        })
        .filter((x): x is { source: string; run: (rd: Record<string, unknown>, er: string[]) => Promise<void> } => x !== null);

      if (parallelSlots.length) {
        await mgr.runParallelSlotsMerged(parallelSlots);
      }
    }

    for (let si = 0; si < plan.sequential.length; si++) {
      const s = plan.sequential[si]!;
      if (s.kind === 'transport') {
        if (this.researchTeamBus) {
          const seqTimeout = this.sequentialBusSlotTimeoutMs();
          await this.runSequentialBusAssignment(mgr, requestId, trip, ctx, {
            slotId: `sequential:${si}:${s.id}`,
            phase: 'sequential',
            memberKind: 'transport',
            source: s.id,
            timeoutMs: seqTimeout,
            budgetBuckets: ws.researchBudgetBuckets,
            financialScratch,
          });
        } else {
          await mgr.runIsolated(s.id, 'sequential', async (rd, er) => {
            await this.researchMemberRegistry.transport.runTransportSearch({
              requestId,
              tripPlanRequest: trip,
              researchData: rd,
              evidenceRefs: er,
              userCognitiveProfile: ctx.userCognitiveProfile,
            });
          });
        }
      }
      if (s.kind === 'compliance') {
        if (this.researchTeamBus) {
          const seqTimeout = this.sequentialBusSlotTimeoutMs();
          await this.runSequentialBusAssignment(mgr, requestId, trip, ctx, {
            slotId: `sequential:${si}:${s.id}`,
            phase: 'sequential',
            memberKind: 'compliance',
            source: s.id,
            timeoutMs: seqTimeout,
            budgetBuckets: ws.researchBudgetBuckets,
            financialScratch,
          });
        } else {
          await mgr.runIsolated(s.id, 'sequential', async (rd, er) => {
            await this.researchMemberRegistry.compliance.runComplianceResearch({
              requestId,
              tripPlanRequest: trip,
              researchData: rd,
              evidenceRefs: er,
            });
          });
        }
      }
    }

    if (financialScratch.length) {
      const { report, alerts } = accumulateResearchFinancialReport(financialScratch, {
        total_user_budget: ws.researchTripTotalBudget,
        buckets: ws.researchBudgetBuckets,
      });
      ws.globalFinancialReport = report;
      if (alerts.length) ws.budgetShadowAlerts = alerts;
    }

    if (shouldTriggerBudgetRollback(ws.budgetShadowAlerts, this.budgetRollbackOverrunThreshold())) {
      ws.budgetRerunRequired = true;
      await this.maybeExecuteBudgetDrivenHotelRollback(mgr, ctx, trip, requestId, ws, financialScratch);
    }

    ws.researchContextMergeLog = mgr.getMergeLog();
  }

  private buildLeaderUserEmotionalAccountSnapshot(
    ws: LeaderResearchWorkspace,
    ctx: PhaseExecutorContext,
  ): UserEmotionalAccount | undefined {
    const rr = readRealtimeRerollCount(ws.researchData);
    if (!ctx.userCognitiveProfile && !ws.globalFinancialReport && rr === 0) return undefined;
    return buildUserEmotionalAccountSnapshot(
      ctx.userCognitiveProfile,
      ws.globalFinancialReport,
      ws.researchTripTotalBudget,
      rr,
    );
  }

  private buildParallelBusPayload(
    job: { memberKind: 'destination' | 'hotel' | 'flight'; rd: Record<string, unknown>; er: string[] },
    trip: NonNullable<PhaseExecutorContext['tripPlanRequest']>,
    ctx: PhaseExecutorContext,
    dso: DecisionState,
    ws: LeaderResearchWorkspace,
    userEmotionalAccount?: UserEmotionalAccount,
  ): ResearchParallelAssignmentPayload {
    const op = RESEARCH_PARALLEL_ASSIGNMENT_OP;
    const bucket = ws.researchBudgetBuckets?.[job.memberKind];
    const emo = userEmotionalAccount;
    if (job.memberKind === 'hotel') {
      return {
        op,
        memberKind: 'hotel',
        researchData: job.rd,
        evidenceRefs: job.er,
        tripPlanRequest: trip,
        researchAtomicRollbackSnapshot: ctx.researchAtomicRollbackSnapshot,
        userCognitiveProfile: ctx.userCognitiveProfile,
        dso,
        ...(bucket ? { budgetBucket: bucket } : {}),
        ...(emo ? { userEmotionalAccount: emo } : {}),
      };
    }
    if (job.memberKind === 'flight') {
      return {
        op,
        memberKind: 'flight',
        researchData: job.rd,
        evidenceRefs: job.er,
        tripPlanRequest: trip,
        userCognitiveProfile: ctx.userCognitiveProfile,
        ...(bucket ? { budgetBucket: bucket } : {}),
        ...(emo ? { userEmotionalAccount: emo } : {}),
      };
    }
    return {
      op,
      memberKind: 'destination',
      researchData: job.rd,
      evidenceRefs: job.er,
      tripPlanRequest: trip,
      dso,
      routeDirectionId: ctx.routeDirectionId,
      userId: ctx.userId,
      itinerary: ctx.itinerary,
      recentMessages: ctx.recent_messages,
      ...(bucket ? { budgetBucket: bucket } : {}),
      ...(emo ? { userEmotionalAccount: emo } : {}),
    };
  }

  private sequentialBusSlotTimeoutMs(): number {
    const raw = Number(process.env.RESEARCH_SEQUENTIAL_SLOT_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 180_000;
  }

  /** 5.0.1：总超支比例 ≥ 此值则标记 `budgetRerunRequired` 并尝试酒店降级重跑（默认 15%）。 */
  private budgetRollbackOverrunThreshold(): number {
    const raw = Number(process.env.RESEARCH_BUDGET_ROLLBACK_OVERRUN_RATIO);
    return Number.isFinite(raw) && raw > 0 ? raw : 0.15;
  }

  private pushBudgetArbitratorDecisionLog(
    researchData: Record<string, unknown>,
    entry: BudgetArbitratorDecisionLogEntry,
  ): void {
    const k = '__research_budget_arbitration_decision_log';
    const prev = researchData[k];
    const arr: BudgetArbitratorDecisionLogEntry[] = Array.isArray(prev)
      ? [...(prev as BudgetArbitratorDecisionLogEntry[])]
      : [];
    arr.push(entry);
    researchData[k] = arr;
  }

  /**
   * 预算驱动局部重跑：对「性价比压力」最大的酒店域再跑一次紧缩 Skill，合并归因 `BUDGET_ARBITRATOR_ROLLBACK`；
   * 成功后二次聚账并写入 `financial_impact` / `globalFinancialReport.budget_aggregate_savings`。
   */
  private async maybeExecuteBudgetDrivenHotelRollback(
    mgr: ResearchContextManager,
    ctx: PhaseExecutorContext,
    trip: NonNullable<PhaseExecutorContext['tripPlanRequest']>,
    requestId: string,
    ws: LeaderResearchWorkspace,
    financialScratch: FinancialFeedbackLine[],
  ): Promise<void> {
    const report = ws.globalFinancialReport;
    const alert = ws.budgetShadowAlerts?.find((a) => a.code === 'BUDGET_OVERRUN_ALERT');
    if (!report || !alert) return;

    const target = pickBudgetRerollTargetFromReport(report);
    if (target?.scope !== 'hotel') {
      this.logger.debug(
        `[ResearchPipeline] budget rollback: skip non-hotel scope=${target?.scope ?? 'none'} requestId=${requestId}`,
      );
      return;
    }

    const baselineRd = deepCloneResearchData(mgr.forkResearchData());
    const baselineEr = [...mgr.forkEvidenceRefs()];
    const rd = deepCloneResearchData(mgr.forkResearchData());
    const er = [...mgr.forkEvidenceRefs()];

    const origBucket = ws.researchBudgetBuckets?.hotel;
    const tightened =
      origBucket !== undefined
        ? {
            target_amount: Math.max(1, Math.round(origBucket.target_amount * 0.72)),
            hard_limit: Math.max(1, Math.round(origBucket.target_amount * 0.82)),
          }
        : undefined;

    const v1Total = report.total_estimated_cost;
    const rollbackUserEmotionalAccount = this.buildLeaderUserEmotionalAccountSnapshot(ws, ctx);

    try {
      await this.researchMemberRegistry.hotel.runScopedCommerce({
        requestId,
        tripPlanRequest: trip,
        researchData: rd,
        evidenceRefs: er,
        researchAtomicRollbackSnapshot: ctx.researchAtomicRollbackSnapshot,
        userCognitiveProfile: ctx.userCognitiveProfile,
        budgetRerunHints: { austerityMode: true, tightenedBudgetBucket: tightened },
        ...(rollbackUserEmotionalAccount ? { userEmotionalAccount: rollbackUserEmotionalAccount } : {}),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[ResearchPipeline] budget-driven hotel rollback failed requestId=${requestId} ${msg}`);
      return;
    }

    const patch = computeResearchPatchFromIsolation({
      baselineResearchData: baselineRd,
      isolatedResearchData: rd,
      baselineEvidenceRefs: baselineEr,
      isolatedEvidenceRefs: er,
      scope: 'hotel',
    });
    this.applyScopedResearchPatch(mgr, patch, 'BUDGET_ARBITRATOR_ROLLBACK', 'parallel', 'BUDGET_ARBITRATOR_ROLLBACK');

    const newHotel = buildResearchFinancialsFromHotelLiveRefresh(ws.researchData as Record<string, unknown>);
    const priorHotelLine = financialScratch.find((f) => f.financials.scope === 'hotel');
    const v2Lines: FinancialFeedbackLine[] = [
      ...financialScratch.filter((f) => f.financials.scope !== 'hotel'),
      ...(newHotel
        ? [{ slot_id: priorHotelLine?.slot_id ?? target.slot_id, financials: newHotel }]
        : priorHotelLine
          ? [priorHotelLine]
          : []),
    ];
    const accOpts = {
      total_user_budget: ws.researchTripTotalBudget,
      buckets: ws.researchBudgetBuckets,
    };
    const { report: v2Report, alerts: v2Alerts } = accumulateResearchFinancialReport(v2Lines, accOpts);
    const savings = Math.max(0, v1Total - v2Report.total_estimated_cost);
    ws.globalFinancialReport = {
      ...v2Report,
      prior_total_estimated_cost: v1Total,
      ...(savings > 0 ? { budget_aggregate_savings: savings } : {}),
    };
    ws.budgetShadowAlerts = v2Alerts;

    const entry: BudgetArbitratorDecisionLogEntry = {
      source: 'BUDGET_ARBITRATOR_ROLLBACK',
      scope: 'hotel',
      at: new Date().toISOString(),
      overrun_ratio: alert.overrun_ratio,
      reroll_pressure_score: target.pressure_score,
      slot_id: target.slot_id,
      austerity_mode: true,
      ...(tightened ? { tightened_bucket: tightened } : {}),
      financial_impact: {
        budget_savings: savings,
        v1_total_estimated_cost: v1Total,
        v2_total_estimated_cost: v2Report.total_estimated_cost,
      },
    };
    this.pushBudgetArbitratorDecisionLog(ws.researchData, entry);
    const rr = incrementRealtimeRerollCount(ws.researchData);
    ws.realtimeRerollCount = rr;
  }

  private tryApplySutureFromPrior(
    mgr: ResearchContextManager,
    scope: ResearchScopedPatchScope,
    ctx: PhaseExecutorContext,
    phase: ResearchContextPhase,
  ): void {
    const prior = ctx.priorResearchData;
    if (!prior || typeof prior !== 'object') return;
    const patch = createSuturePatchFromPrior({ scope, priorResearchData: prior as Record<string, unknown> });
    if (Object.keys(patch.researchDataPartial).length === 0 && patch.evidenceRefsAppended.length === 0) return;
    mgr.applyResearchPatch({
      patch,
      source: 'FALLBACK_SUTURE',
      phase,
      attribution: 'FALLBACK_SUTURE',
    });
  }

  private applyScopedResearchPatch(
    mgr: ResearchContextManager,
    patch: ScopedResearchPatch,
    source: string,
    phase: ResearchContextPhase,
    attribution: ResearchMergeAttribution,
  ): void {
    const { scopedPartial, outOfScopePartial } = partitionResearchPatchByScope(patch);
    if (Object.keys(scopedPartial).length > 0 || patch.evidenceRefsAppended.length > 0) {
      mgr.applyResearchPatch({
        patch: { ...patch, researchDataPartial: scopedPartial },
        source,
        phase,
        attribution,
      });
    }
    if (Object.keys(outOfScopePartial).length > 0) {
      mgr.mergeResearchDataKeys({
        keys: outOfScopePartial,
        source,
        phase,
        attribution,
      });
    }
  }

  private applyMemberPatchOrSuture(input: {
    mgr: ResearchContextManager;
    patch: ScopedResearchPatch;
    source: string;
    phase: ResearchContextPhase;
    memberKind: ResearchScopedPatchScope;
    ctx: PhaseExecutorContext;
    slotId: string;
  }): void {
    const { mgr, patch, source, phase, memberKind, ctx, slotId } = input;
    try {
      this.applyScopedResearchPatch(mgr, patch, source, phase, 'MEMBER_PATCH');
    } catch (e) {
      if (!(e instanceof ResearchPatchScopeViolationError)) {
        throw e;
      }
      this.logger.warn(
        `[ResearchPipeline] member patch scope violation slot=${slotId} memberKind=${memberKind} key=${e.key} patchScope=${e.patchScope} inferredScope=${e.inferredScope}; applying prior suture`,
      );
      this.tryApplySutureFromPrior(mgr, memberKind, ctx, phase);
    }
  }

  private async runSequentialBusAssignment(
    mgr: ResearchContextManager,
    requestId: string,
    trip: NonNullable<PhaseExecutorContext['tripPlanRequest']>,
    ctx: PhaseExecutorContext,
    options: {
      slotId: string;
      phase: ResearchContextPhase;
      memberKind: ResearchSequentialMemberKind;
      source: string;
      timeoutMs: number;
      budgetBuckets?: ResearchBudgetBucketsMap;
      financialScratch?: FinancialFeedbackLine[];
    },
  ): Promise<void> {
    const bus = this.researchTeamBus!;
    const { slotId, phase, memberKind, source, timeoutMs, budgetBuckets, financialScratch } = options;
    const rd = deepCloneResearchData(mgr.forkResearchData());
    const er = mgr.forkEvidenceRefs();
    const seqBucket = budgetBuckets?.[memberKind];
    const payload: ResearchSequentialAssignmentPayload = {
      op: RESEARCH_SEQUENTIAL_ASSIGNMENT_OP,
      memberKind,
      researchData: rd,
      evidenceRefs: er,
      tripPlanRequest: trip,
      userCognitiveProfile: ctx.userCognitiveProfile,
      ...(seqBucket ? { budgetBucket: seqBucket } : {}),
    };
    let completion;
    try {
      const waitP = bus.waitForSlot(requestId, slotId, timeoutMs);
      bus.publishAssignment(requestId, slotId, payload);
      completion = await waitP;
    } catch (e) {
      this.tryApplySutureFromPrior(mgr, memberKind, ctx, phase);
      const reason = e instanceof ResearchTeamBusTimeoutError ? 'timeout' : e instanceof Error ? e.message : String(e);
      this.logger.warn(`[ResearchPipeline] sequential bus wait failed slot=${slotId} memberKind=${memberKind} reason=${reason}`);
      return;
    }
    if (!completion.ok) {
      this.tryApplySutureFromPrior(mgr, memberKind, ctx, phase);
      this.logger.warn(
        `[ResearchPipeline] sequential bus ok=false slot=${slotId} memberKind=${memberKind} err=${completion.error ?? 'unknown'}`,
      );
      return;
    }
    if (!completion.patch) {
      throw new Error(`ResearchTeamBus: sequential slot missing scoped patch: ${slotId}`);
    }
    if (completion.financials && financialScratch) {
      financialScratch.push({ slot_id: slotId, financials: completion.financials });
    }
    this.applyMemberPatchOrSuture({
      mgr,
      patch: completion.patch,
      source,
      phase,
      memberKind,
      ctx,
      slotId,
    });
  }

  /**
   * windSpeedMs、environmentPatch、WorldFact shadow（与历史 `execute` 尾部对齐）。
   */
  async finalizeLeaderResearchWorkspace(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    ws: LeaderResearchWorkspace,
  ): Promise<{
    researchData: Record<string, unknown>;
    environmentPatch: Partial<EnvironmentState>;
  }> {
    const { researchData, effectiveTrip } = ws;
    const windSpeedMs = this.deriveWindSpeedMs(researchData);
    if (windSpeedMs !== undefined) {
      researchData.windSpeedMs = windSpeedMs;
    }
    if (ws.globalFinancialReport) {
      researchData.__research_global_financial_report = ws.globalFinancialReport;
    }
    if (ws.budgetShadowAlerts?.length) {
      researchData.__research_budget_shadow_alerts = [...ws.budgetShadowAlerts];
    }
    if (ws.budgetRerunRequired) {
      researchData.__research_budget_rerun_required = true;
    }
    const environmentPatch = this.extractEnvironmentPatch(researchData, effectiveTrip ?? ctx.tripPlanRequest);
    if (this.worldFactShadowIngest) {
      void this.worldFactShadowIngest.ingestFromResearchOutput({
        researchData,
        requestId: ctx.requestId,
        countryCode: dso.environmentState?.countryCode,
        routeDirectionId: ctx.routeDirectionId,
      });
    }
    return { researchData, environmentPatch };
  }

  /** @deprecated 使用 prepareLeaderResearchWorkspace */
  async prepareScopedCommerceTransportWorkspace(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<LeaderResearchWorkspace> {
    return this.prepareLeaderResearchWorkspace(dso, ctx);
  }

  /** @deprecated 使用 finalizeLeaderResearchWorkspace */
  async finalizeScopedCommerceTransportWorkspace(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    ws: LeaderResearchWorkspace,
  ): Promise<{
    researchData: Record<string, unknown>;
    environmentPatch: Partial<EnvironmentState>;
  }> {
    return this.finalizeLeaderResearchWorkspace(dso, ctx, ws);
  }

  private extractEnvironmentPatch(
    researchData: Record<string, unknown>,
    tripRequest?: PhaseExecutorContext['tripPlanRequest'],
  ): Partial<EnvironmentState> {
    const env: Partial<EnvironmentState> = {};
    if (researchData.countryCode || researchData.country_code) {
      env.countryCode = (researchData.countryCode ?? researchData.country_code) as string;
    }
    if (researchData.route_direction_id || researchData.routeDirectionId) {
      env.routeDirectionId = (researchData.route_direction_id ?? researchData.routeDirectionId) as string;
    }
    const rcw = researchData.routeCorridorWorld ?? researchData.route_corridor_world;
    if (rcw && typeof rcw === 'object' && !Array.isArray(rcw)) {
      env.routeCorridorWorld = rcw as EnvironmentState['routeCorridorWorld'];
      const rid = (rcw as { routeDirectionId?: string }).routeDirectionId;
      if (!env.routeDirectionId && typeof rid === 'string' && rid.trim()) {
        env.routeDirectionId = rid.trim();
      }
    }
    if (researchData.month !== undefined) {
      env.month = typeof researchData.month === 'number' ? researchData.month : parseInt(String(researchData.month), 10);
    } else if (tripRequest?.start_date) {
      env.month = new Date(tripRequest.start_date).getMonth() + 1;
    } else if (tripRequest?.date_range?.start_date) {
      env.month = new Date(tripRequest.date_range.start_date).getMonth() + 1;
    }
    if (researchData.road_conditions || researchData.roadConditions) {
      env.roadConditions = (researchData.road_conditions ?? researchData.roadConditions) as Record<string, unknown>;
    }
    if (researchData.weather_risk !== undefined || researchData.weatherRisk !== undefined) {
      env.weatherRisk = (researchData.weather_risk ?? researchData.weatherRisk) as number;
    }
    if (researchData.windSpeedMs !== undefined || (researchData as any).wind_speed_ms !== undefined) {
      const v = (researchData.windSpeedMs ?? (researchData as any).wind_speed_ms) as unknown;
      env.windSpeedMs = typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    }
    if ((researchData.failure_risk_prediction as any)?.predictions?.length) {
      const preds = (researchData.failure_risk_prediction as any).predictions;
      const hasHigh = preds.some((p: any) => p.riskLevel === 'HIGH');
      env.failureRiskLevel = hasHigh ? 'HIGH' : preds.some((p: any) => p.riskLevel === 'MODERATE' || p.riskLevel === 'MEDIUM') ? 'MEDIUM' : 'LOW';
    }
    if (researchData.crowd_level !== undefined || researchData.crowdLevel !== undefined) {
      const c = researchData.crowd_level ?? researchData.crowdLevel;
      env.crowdLevel = typeof c === 'number' ? Math.min(1, Math.max(0, c)) : undefined;
    }
    const daylights =
      researchData.daylight_by_date ??
      researchData.daylightByDate ??
      (researchData.weather_forecast as any)?.daylight_by_date ??
      (researchData.weather_forecast as any)?.daylightByDate;
    if (daylights && typeof daylights === 'object' && !Array.isArray(daylights)) {
      env.daylightByDate = daylights as EnvironmentState['daylightByDate'];
    }

    // Admin-injected solar overrides (RouteDirection.metadata.environment_overrides_v1), carried via world.physical.prefetched_evidence.
    // Priority: explicit overrides should win over auto-collected daylights, because they are used for signature lock + audit.
    try {
      const rd: any = researchData as any;
      const prefetched: any[] =
        (rd?.world?.physical?.prefetched_evidence as any[]) ??
        (rd?.world_build_context?.world?.physical?.prefetched_evidence as any[]) ??
        (rd?.worldModel?.physical?.prefetched_evidence as any[]) ??
        [];
      const list = Array.isArray(prefetched) ? prefetched : [];
      const envOverride = list.find((x) => x && typeof x === 'object' && (x as any).kind === 'environment_overrides_v1');
      const solar = envOverride?.overrides?.solar;
      const weather = envOverride?.overrides?.weather;
      if (solar && typeof solar === 'object') {
        const twilightBufferMin =
          solar.twilightBufferMin ?? solar.twilight_buffer_min ?? solar.twilightBuffer ?? solar.twilight_buffer;
        if (typeof twilightBufferMin === 'number' && Number.isFinite(twilightBufferMin)) {
          (env as any).twilightBufferMin = Math.round(twilightBufferMin);
        }

        const mergeDaylight = (date: string, patch: any) => {
          const k = String(date).slice(0, 10);
          if (!k) return;
          const cur = (env.daylightByDate?.[k] ?? {}) as any;
          env.daylightByDate = { ...(env.daylightByDate ?? {}), [k]: { ...cur, ...patch } };
        };

        // Option A: full daylightByDate shape.
        const overrideDaylightByDate = solar.daylightByDate ?? solar.daylight_by_date;
        if (overrideDaylightByDate && typeof overrideDaylightByDate === 'object' && !Array.isArray(overrideDaylightByDate)) {
          for (const [k, v] of Object.entries(overrideDaylightByDate as any)) {
            if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
            mergeDaylight(k, {
              ...(typeof (v as any).sunrise === 'string' ? { sunrise: String((v as any).sunrise) } : {}),
              ...(typeof (v as any).sunset === 'string' ? { sunset: String((v as any).sunset) } : {}),
              ...(typeof (v as any).civil_dusk === 'string' ? { civil_dusk: String((v as any).civil_dusk) } : {}),
              ...(typeof (v as any).civilDusk === 'string' ? { civil_dusk: String((v as any).civilDusk) } : {}),
            });
          }
        }

        // Option B: partial maps.
        const sunsetByDate = solar.sunsetByDate ?? solar.sunset_by_date;
        if (sunsetByDate && typeof sunsetByDate === 'object' && !Array.isArray(sunsetByDate)) {
          for (const [k, v] of Object.entries(sunsetByDate as any)) {
            if (typeof v === 'string' && v.trim()) mergeDaylight(k, { sunset: v.trim() });
          }
        }
        const civilDuskByDate = solar.civilDuskByDate ?? solar.civil_dusk_by_date ?? solar.civilDusk_by_date;
        if (civilDuskByDate && typeof civilDuskByDate === 'object' && !Array.isArray(civilDuskByDate)) {
          for (const [k, v] of Object.entries(civilDuskByDate as any)) {
            if (typeof v === 'string' && v.trim()) mergeDaylight(k, { civil_dusk: v.trim() });
          }
        }
        const sunriseByDate = solar.sunriseByDate ?? solar.sunrise_by_date;
        if (sunriseByDate && typeof sunriseByDate === 'object' && !Array.isArray(sunriseByDate)) {
          for (const [k, v] of Object.entries(sunriseByDate as any)) {
            if (typeof v === 'string' && v.trim()) mergeDaylight(k, { sunrise: v.trim() });
          }
        }
      }

      // Environment risk score (spec-aligned): derive from weather + daylight windows when possible.
      // Keep backward compatibility: only fill when caller didn't provide weatherRisk explicitly.
      if (
        env.weatherRisk === undefined &&
        weather &&
        typeof weather === 'object' &&
        tripRequest &&
        ((tripRequest as any)?.date_range?.start_date || (tripRequest as any)?.start_date)
      ) {
        const eventTimeISO = String((tripRequest as any)?.date_range?.start_date ?? (tripRequest as any)?.start_date);
        let wv: any = weather;
        const series = Array.isArray((weather as any)?.forecastSeries)
          ? (weather as any).forecastSeries
          : Array.isArray((weather as any)?.forecast_series)
            ? (weather as any).forecast_series
            : [];
        if (series.length > 0) {
          const normalized = series
            .filter((x: any) => x && typeof x === 'object')
            .map((x: any) => ({
              locationId: String(x.locationId ?? x.location_id ?? ''),
              timeWindow: {
                start: String(x.start ?? x.timeWindow?.start ?? x.time_window?.start ?? ''),
                end: String(x.end ?? x.timeWindow?.end ?? x.time_window?.end ?? ''),
              },
              windSpeedKph:
                typeof x.windSpeedKph === 'number'
                  ? x.windSpeedKph
                  : typeof x.wind_speed_kph === 'number'
                    ? x.wind_speed_kph
                    : typeof x.wind_mps === 'number'
                      ? x.wind_mps * 3.6
                      : NaN,
              visibilityMeters:
                typeof x.visibilityMeters === 'number'
                  ? x.visibilityMeters
                  : typeof x.visibility_m === 'number'
                    ? x.visibility_m
                    : typeof x.visibility_meters === 'number'
                      ? x.visibility_meters
                      : NaN,
              precipitationMm:
                typeof x.precipitationMm === 'number'
                  ? x.precipitationMm
                  : typeof x.precipitation_mm === 'number'
                    ? x.precipitation_mm
                    : NaN,
              snowDepthCm:
                typeof x.snowDepthCm === 'number'
                  ? x.snowDepthCm
                  : typeof x.snow_depth_cm === 'number'
                    ? x.snow_depth_cm
                    : NaN,
              temperatureC: typeof x.temperatureC === 'number' ? x.temperatureC : NaN,
              condition: String(x.condition ?? 'CLEAR'),
              confidenceScore:
                typeof x.confidenceScore === 'number'
                  ? x.confidenceScore
                  : typeof x.confidence_score === 'number'
                    ? x.confidence_score
                    : 0,
              source: String(x.source ?? ''),
              updatedAt: String(x.updatedAt ?? x.updated_at ?? ''),
            }))
            .filter((x: any) => x.timeWindow.start && x.timeWindow.end);
          const selected = getWeatherForTime({ weatherForecasts: normalized as any, timeISO: eventTimeISO }) as any;
          if (selected) wv = selected;
        }

        const dateKey = eventTimeISO.slice(0, 10);
        const solarForRisk =
          env.daylightByDate?.[dateKey]?.sunset
            ? {
                locationId: env.routeDirectionId ?? env.countryCode ?? 'unknown',
                sunrise: env.daylightByDate?.[dateKey]?.sunrise ?? '',
                sunset: env.daylightByDate?.[dateKey]?.sunset ?? '',
                civilTwilightEnd: env.daylightByDate?.[dateKey]?.civil_dusk ?? undefined,
                daylightMinutes: 0,
              }
            : null;

        env.weatherRisk = calculateEnvironmentRisk({
          windSpeedKph:
            typeof wv?.windSpeedKph === 'number'
              ? wv.windSpeedKph
              : typeof wv?.wind_speed_kph === 'number'
                ? wv.wind_speed_kph
                : typeof wv?.wind_mps === 'number'
                  ? wv.wind_mps * 3.6
                  : null,
          visibilityMeters:
            typeof wv?.visibilityMeters === 'number'
              ? wv.visibilityMeters
              : typeof wv?.visibility_m === 'number'
                ? wv.visibility_m
                : typeof wv?.visibility_meters === 'number'
                  ? wv.visibility_meters
                  : null,
          precipitationMm:
            typeof wv?.precipitationMm === 'number'
              ? wv.precipitationMm
              : typeof wv?.precipitation_mm === 'number'
                ? wv.precipitation_mm
                : null,
          snowDepthCm:
            typeof wv?.snowDepthCm === 'number'
              ? wv.snowDepthCm
              : typeof wv?.snow_depth_cm === 'number'
                ? wv.snow_depth_cm
                : null,
          solar: solarForRisk as any,
          eventTimeISO,
          policy: {
            wind_drive_limit_kph: 50,
            min_visibility_m: 1000,
            snow_depth_limit_cm: 10,
            precipitation_limit_mm: 10,
            sunset_safety_buffer_min: (env as any).twilightBufferMin ?? 30,
          },
        });
      }
    } catch {
      // best-effort only
    }

    return env;
  }
}
