// src/trips/services/trip-draft.service.ts
import { Injectable, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { PlaceMetadata } from '../../places/interfaces/place-metadata.interface';
import { PhysicalMetadata } from '../../places/interfaces/physical-metadata.interface';
import {
  CreateTripDraftDto,
  TripDraftResponseDto,
  DraftDay,
  DraftItineraryItem,
  DraftDaySlots,
  TimeSlot,
  TravelStyle,
  TripDraftMetadata,
  ReplaceItineraryItemDto,
  ReplaceItineraryItemResponseDto,
  RegenerateTripDto,
  RegenerateTripResponseDto,
  RegenerateChangeItem,
  SaveTripDraftDto,
} from '../dto/trip-draft.dto';
import { ItemType } from '../../itinerary-items/dto/create-itinerary-item.dto';
import { PlaceCategory } from '@prisma/client';
import type { ContextBlock } from '../../agent/context-engine/types/context-package.types';
import {
  CandidateRetrievalEngine,
  type CandidatePlace,
} from './candidate-retrieval.engine';
import { ConstraintEngine } from './constraint.engine';
import { RouteOptimizationEngine } from './route-optimization.engine';
import { FatiguePredictionEngine } from './fatigue-prediction.engine';
import { PacingEngine } from './pacing.engine';
import { GlobalPolicyWeightsService } from './global-policy-weights.service';
import { RegionAnchorPlanningService } from '../../planning-policy/services/region-anchor-planning.service';
import type { UserRouteIntent } from '../../planning-policy/interfaces/region-intent.types';
import type { PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';
import { resolveSparseRegionProfile } from '../../planning-policy/profiles/sparse-region.profile';
import type { SparseRegionProfile } from '../../planning-policy/types/open-world-poi.types';
import { buildDefaultPolarRegionStubs } from '../../planning-policy/open-world/polar-region-stubs.util';
import { runOpenWorldDiscoveryBuffer } from '../../planning-policy/open-world/discovery-buffer.util';
import {
  isElasticCandidate,
  openWorldStubsToCandidatePlaces,
} from '../../planning-policy/open-world/open-world-poi-stub.util';
import { isOpeningHoursCoveringWindow } from '../utils/time-validator';
import { assembleExperienceDraftPrompt } from '../draft-synthesis/prompt-runtime';
import {
  arbitrateSlots,
  applySlotArbitrationToOrchestrationResult,
} from '../draft-synthesis/arbitration';
import { computeDualEngineConvergence } from '../draft-synthesis/convergence';
import { runDraftValidationGate } from '../draft-synthesis/gate';
import {
  buildTripDraftStateFromDto,
  extractSelectionsFromLlmOrchestrationResult,
  finalizeTripDraftStateFromValidatedDraft,
} from '../draft-synthesis/state';
import { runExecutionSimulation } from '../draft-synthesis/execution-simulation';
import {
  buildTripDraftContract,
  type DraftContractMode,
  type TripDraftContract,
} from '../draft-synthesis/contract';
import {
  PolicyEngine,
  inferTravelPersonaFromUserIntent,
  gateNumericOptions,
} from '../draft-synthesis/persona-policy';
import { mergeExecutionPolicyWithGlobal } from '../draft-synthesis/global-optimization';
import {
  evaluateObjectivesFromOrchestration,
  computeParetoFront,
  selectFromParetoFront,
  type ParetoPlanCandidate,
} from '../draft-synthesis/pareto';
import {
  buildHeuristicConstraintReports,
  defaultAgentContributions,
  runMultiAgentNegotiation,
} from '../draft-synthesis/multi-agent';
import type { DraftPipelineResult } from '../draft-synthesis/runtime/draft-pipeline-result.types';
import { buildDecisionTrace } from '../draft-synthesis/decision-trace';
import type { SlotArbitrationResult } from '../draft-synthesis/arbitration/slot-arbitration.types';
import type { ConvergenceResult } from '../draft-synthesis/convergence/convergence.types';
import type { DraftValidationGateResult } from '../draft-synthesis/gate/draft-validation-gate.types';
import type { TripDraftEngineMode } from '../draft-synthesis/state/trip-draft-state.types';
import { buildDraftGeneratedEvent } from '../draft-synthesis/autonomous-world';
import { buildDraftPipelineSyncedWorldEvent } from '../draft-synthesis/world-simulation';
import { WorldBusService } from './world-bus.service';
import { WorldKernelService } from './world-kernel.service';

/**
 * TripDraftService
 *
 * 智能行程生成服务
 * - 候选检索（根据国家代码、风格等查询 Place）
 * - LLM：**Experience Draft Synthesis**（体验草案合成）——可信候选与叙事连贯，非最终可执行解；Solver/VERIFY 在 route_and_run → gate → verify → repair
 * - 规则校验与修复（营业时间、距离等——系统侧真实性）
 */
@Injectable()
export class TripDraftService {
  private readonly logger = new Logger(TripDraftService.name);

  private timezoneForDestination(countryCode: string): string {
    const cc = (countryCode || '').toUpperCase().trim();
    // Minimal, auditable mapping (C-2). Default to UTC.
    const MAP: Record<string, string> = {
      IS: 'Atlantic/Reykjavik',
      US: 'America/New_York',
      JP: 'Asia/Tokyo',
      CN: 'Asia/Shanghai',
      NZ: 'Pacific/Auckland',
      GB: 'Europe/London',
      FR: 'Europe/Paris',
      DE: 'Europe/Berlin',
      IT: 'Europe/Rome',
      ES: 'Europe/Madrid',
      NO: 'Europe/Oslo',
      GL: 'America/Godthab',
      CA: 'America/Toronto',
      AU: 'Australia/Sydney',
    };
    return MAP[cc] || 'UTC';
  }

  // 时段定义（小时）
  private readonly SLOT_TIMES = {
    morning: { start: 9, end: 12 },
    lunch: { start: 12, end: 13.5 },
    afternoon: { start: 13.5, end: 17.5 },
    dinner: { start: 18, end: 20 },
    evening: { start: 20, end: 22 },
  };

  private parseHourToHm(hourFloat: number): { hour: number; minute: number } {
    const h = Math.floor(hourFloat);
    const m = Math.round((hourFloat - h) * 60);
    // normalize, e.g. 13.999 -> 14:00
    const hour = (h + Math.floor(m / 60)) % 24;
    const minute = m % 60;
    return { hour, minute };
  }

  private parseOpeningRanges(hoursStr: string): Array<{ startMin: number; endMin: number }> {
    const s = (hoursStr || '').trim();
    if (!s || /^closed$/i.test(s)) return [];
    // split common separators: comma/semicolon/Chinese comma
    const parts = s.split(/[,;，；]/).map((x) => x.trim()).filter(Boolean);
    const ranges: Array<{ startMin: number; endMin: number }> = [];
    for (const p of parts) {
      const m = p.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
      if (!m) continue;
      const sh = Number(m[1]);
      const sm = m[2] ? Number(m[2]) : 0;
      const eh = Number(m[3]);
      const em = m[4] ? Number(m[4]) : 0;
      if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) continue;
      const startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      // overnight (e.g. 18:00-02:00)
      if (endMin <= startMin) endMin += 24 * 60;
      ranges.push({ startMin, endMin });
    }
    return ranges;
  }

  private buildOpeningHoursEvidence(
    openingHours: any,
    localDate: string,
    targetSlot?: string,
    window?: { start: string; end: string },
    timezone?: string,
  ) {
    const tz = timezone || 'UTC';
    const w = window || { start: '00:00', end: '23:59' };
    const v = isOpeningHoursCoveringWindow({
      openingHours,
      localDate,
      tz,
      window: w,
    });
    return {
      openingHours: v.effectiveHours,
      decision_metadata: {
        openingHoursValidation: {
          targetSlot,
          isCovered: v.isCovered,
          effectiveHours: v.effectiveHours,
          dataQuality: v.dataQuality,
          reason: v.reason,
          tz,
        },
      },
    };
  }

  private openingHoursContainWindow(openingHours: any, date: string, start: DateTime, end: DateTime): boolean {
    // legacy overload: keep default UTC if not provided
    return this.openingHoursContainWindowTz(openingHours, date, start, end, 'UTC');
  }

  private openingHoursContainWindowTz(openingHours: any, localDate: string, start: DateTime, end: DateTime, timezone?: string): boolean {
    const tz = timezone || 'UTC';
    const w = {
      start: start.setZone(tz).toFormat('HH:mm'),
      end: end.setZone(tz).toFormat('HH:mm'),
    };
    return isOpeningHoursCoveringWindow({
      openingHours,
      localDate,
      tz,
      window: w,
    }).isCovered;
  }

  constructor(
    private prisma: PrismaService,
    private llmService: LlmService,
    private candidateEngine: CandidateRetrievalEngine,
    private constraintEngine: ConstraintEngine,
    private routeEngine: RouteOptimizationEngine,
    private fatigueEngine: FatiguePredictionEngine,
    private pacingEngine: PacingEngine,
    private readonly regionAnchorPlanning: RegionAnchorPlanningService,
    private readonly globalPolicyWeightsService: GlobalPolicyWeightsService,
    @Optional() private readonly worldBus?: WorldBusService,
    @Optional() private readonly worldKernel?: WorldKernelService,
  ) {}

  /**
   * 生成行程草案（推荐）：统一由 {@link buildTripDraftContract} 收敛语义后再跑引擎。
   * @param draftLinkage `tripId` + `mode` 用于 NL 异步 / Runtime，与裸 `/trips/draft` 区分。
   */
  async generateDraft(
    dto: CreateTripDraftDto,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>,
    contextBlocks?: ContextBlock[],
    draftLinkage?: { tripId?: string; mode?: DraftContractMode },
  ): Promise<TripDraftResponseDto> {
    const contract = buildTripDraftContract({
      dto,
      contextBlocks,
      tripId: draftLinkage?.tripId,
      mode: draftLinkage?.mode,
    });
    this.logger.log(
      `TripDraftContract: mode=${contract.mode} engine=${contract.engine} tripId=${contract.tripId ?? '—'} solverCtx=${contract.constraintsProfile.solverContextInjected} regionAnchor=${contract.constraintsProfile.regionAnchorPlanning}`,
    );
    const result = await this.executeTripDraftContract(contract, onProgress);
    return result.response;
  }

  /**
   * 已构造契约时的入口（与 HTTP 解耦，便于脚本 / 编排层直接注入）。
   */
  async generateDraftFromContract(
    contract: TripDraftContract,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>,
  ): Promise<TripDraftResponseDto> {
    const result = await this.executeTripDraftContract(contract, onProgress);
    return result.response;
  }

  /**
   * Draft Runtime 单内核出口（Orchestrator / DraftRuntimeCore 调用）。
   */
  async runDraftPipeline(
    contract: TripDraftContract,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>,
  ): Promise<DraftPipelineResult> {
    return this.executeTripDraftContract(contract, onProgress);
  }

  /**
   * 统一草案管线：所有入口最终进入此方法。
   */
  private async executeTripDraftContract(
    contract: TripDraftContract,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>,
  ): Promise<DraftPipelineResult> {
    const dto = contract.input;
    const contextBlocks = contract.context;
    const draftId = randomUUID();
    const startTime = Date.now();

    // 规范化国家代码
    const countryCode = dto.destination.toUpperCase().trim();
    const timezone = this.timezoneForDestination(countryCode);

    // 验证国家代码格式
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new BadRequestException(`无效的国家代码: ${dto.destination}`);
    }

    // 验证天数
    if (dto.days < 1 || dto.days > 14) {
      throw new BadRequestException('行程天数必须在 1-14 天之间');
    }

    // Step 1: 候选检索（TripNara 多阶段检索引擎）
    this.logger.log(`开始检索候选地点（国家: ${countryCode}, 风格: ${dto.style || 'balanced'}）`);
    let poiPlanningOpts: { poiPlanning?: PoiPlanningDecisionSlice } = {};
    if (dto.region_id || dto.userInput) {
      const userRoute: Partial<UserRouteIntent> = {
        regionId: dto.region_id,
        mustIncludePoiIds: dto.must_include_poi_ids,
        excludePoiIds: dto.exclude_poi_ids,
        totalBudgetMinutes: dto.total_budget_minutes,
        pace: dto.pace,
      };
      const slice = this.regionAnchorPlanning.resolveAndBuildSlice(userRoute, dto.userInput);
      if (slice) {
        poiPlanningOpts = { poiPlanning: slice };
      }
    }
    const candidates = await this.candidateEngine.retrieve(dto, {
      routeDirectionId: dto.routeDirectionId,
      ...poiPlanningOpts,
    });

    const sparseRegionProfile = resolveSparseRegionProfile({
      countryCode,
      destinationHint: dto.userInput ?? dto.destination,
    });

    // 🆕 Deterministic stable sort：消除 DB/索引导致的输入顺序噪声（像素级复现基础）
    let stableCandidates = [...candidates].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    if (sparseRegionProfile) {
      const stubsFromRegistry = buildDefaultPolarRegionStubs(
        sparseRegionProfile.regionTag,
        dto.userInput ?? dto.destination,
      );
      const discovery = runOpenWorldDiscoveryBuffer({
        userMessage: dto.userInput ?? '',
        countryCode,
        destinationHint: dto.userInput ?? dto.destination,
        regionTags: [sparseRegionProfile.regionTag],
        existingPoiEvidence: candidates,
        existingStubIds: stubsFromRegistry.map((s) => s.stubId),
      });
      const allStubs = [...stubsFromRegistry, ...discovery.stubs];
      stableCandidates = [
        ...stableCandidates,
        ...openWorldStubsToCandidatePlaces(allStubs),
      ].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      this.logger.log(
        `[SPARSE_REGION] profile=${sparseRegionProfile.profileId} db=${candidates.length} stubs=${allStubs.length} discovery=${discovery.stubs.length} total=${stableCandidates.length}`,
      );
    }

    const minCandidateThreshold = sparseRegionProfile?.minDbCandidatesThreshold ?? 20;
    if (stableCandidates.length < minCandidateThreshold && !sparseRegionProfile) {
      throw new BadRequestException(
        `候选地点不足（${stableCandidates.length} 个）。系统暂不支持该目的地，或该国家尚未导入足够的地点数据。`
      );
    }

    // Step 2: 构建日期列表
    const days = this.buildDayList(dto);

    // Step 3: 编排（draftRuntimeMode 优先：ALGO | HYBRID | LLM）
    const rtMode = dto.draftRuntimeMode ?? (dto.useAlgorithmicDraft ? 'ALGO' : 'HYBRID');
    const personaForPolicy =
      contract.persona ?? inferTravelPersonaFromUserIntent(contract.userIntent, { userInput: dto.userInput });
    const executionPolicyBase =
      contract.executionPolicy ??
      PolicyEngine.selectExecutionPolicy(personaForPolicy, { mode: contract.mode });
    const systemPolicy = this.globalPolicyWeightsService.get();
    const executionPolicy = mergeExecutionPolicyWithGlobal(
      executionPolicyBase,
      personaForPolicy,
      systemPolicy,
    );
    let traceArbitration: SlotArbitrationResult | undefined;
    let traceConvergence: ConvergenceResult | undefined;
    let traceGate: DraftValidationGateResult | undefined;
    let paretoDecisionSummary: TripDraftMetadata['paretoDecisionSummary'];
    let llmResult: { days: any[] };
    /** LLM 草案模式下：双引擎收敛 / 门控可观测字段 */
    let dualEngineMeta: {
      dualEngineAgreementScore?: number;
      dualEngineDivergenceCount?: number;
      draftGateStatus?: 'APPROVED' | 'NEEDS_REPAIR' | 'REJECTED';
      slotLevelMergeApplied?: boolean;
    } = {};

    if (rtMode === 'ALGO') {
      this.logger.log(`[DraftRuntime] ALGO：路径优化引擎编排 ${dto.days} 天`);
      if (onProgress) {
        await onProgress({
          status: 'generating',
          stage: 'route_optimization',
          message: '正在优化路线...',
        });
      }
      llmResult = await this.routeEngine.optimize(stableCandidates, days, dto);
    } else if (rtMode === 'HYBRID') {
      this.logger.log(
        `[DraftRuntime] HYBRID：LLM + 路径引擎槽位融合（${stableCandidates.length} 候选，${dto.days} 天${contextBlocks?.length ? `，${contextBlocks.length} 上下文块` : ''}）`,
      );
      const [llmRaw, algoRaw] = await Promise.all([
        this.llmOrchestrate(dto, stableCandidates, days, onProgress, contextBlocks),
        this.routeEngine.optimize(stableCandidates, days, dto),
      ]);
      const llmSelections = extractSelectionsFromLlmOrchestrationResult(llmRaw);
      const algoSelections = extractSelectionsFromLlmOrchestrationResult(algoRaw);
      const candidatesById = new Map(stableCandidates.map((c) => [c.id, c]));
      const arbitration = arbitrateSlots({
        llmSelections,
        algoSelections,
        candidatesById,
        transport: dto.transport,
        hybridEngineWeights: { llm: executionPolicy.llmWeight, algo: executionPolicy.algoWeight },
      });
      const convergence = computeDualEngineConvergence(llmSelections, algoSelections);
      const gateDraftState = buildTripDraftStateFromDto({
        tripId: contract.tripId ?? `draft-${randomUUID()}`,
        dto,
        timezone,
        mode: 'HYBRID',
      });
      const gate = runDraftValidationGate({
        state: gateDraftState,
        convergence,
        llmEngineRan: true,
        algoEngineRan: true,
        options: {
          acceptSlotArbitrationMerge: true,
          ...gateNumericOptions(executionPolicy.gateProfile),
        },
      });
      const mergedPayload = applySlotArbitrationToOrchestrationResult({
        llmDays: llmRaw,
        algoDays: algoRaw,
        arbitration,
      });
      const llmDaysNorm = (llmRaw.days ?? []).map((d: { day: number; slots?: Record<string, unknown> }) => ({
        day: d.day,
        slots: (d.slots ?? {}) as Record<string, unknown>,
      }));
      const algoDaysNorm = (algoRaw.days ?? []).map((d: { day: number; slots?: Record<string, unknown> }) => ({
        day: d.day,
        slots: (d.slots ?? {}) as Record<string, unknown>,
      }));

      const paretoCandidates: ParetoPlanCandidate[] = [
        {
          id: 'MERGED',
          planPayload: mergedPayload as {
            days: Array<{ day: number; slots: Record<string, unknown> }>;
          },
          objectives: evaluateObjectivesFromOrchestration(mergedPayload, candidatesById, dto.transport),
        },
        {
          id: 'LLM_ONLY',
          planPayload: { days: llmDaysNorm },
          objectives: evaluateObjectivesFromOrchestration({ days: llmDaysNorm }, candidatesById, dto.transport),
        },
        {
          id: 'ALGO_ONLY',
          planPayload: { days: algoDaysNorm },
          objectives: evaluateObjectivesFromOrchestration({ days: algoDaysNorm }, candidatesById, dto.transport),
        },
      ];
      const paretoFront = computeParetoFront(paretoCandidates);
      const personaUtilityPick = selectFromParetoFront(paretoFront, personaForPolicy);
      const paretoPlans = paretoFront.map((p) => ({ planId: p.id, objectives: p.objectives }));
      const constraintReports = buildHeuristicConstraintReports(paretoPlans);
      const negotiation = runMultiAgentNegotiation({
        paretoPlans,
        personaType: personaForPolicy.type,
        reports: constraintReports,
        contributions: defaultAgentContributions(paretoPlans.map((x) => x.planId)),
        draftGateStatus: gate.status,
      });
      const finalPlanCandidate =
        paretoCandidates.find((c) => c.id === negotiation.selectedPlanId) ?? personaUtilityPick;
      llmResult = { days: finalPlanCandidate.planPayload.days };
      const objectivesByPlanId: Record<string, (typeof paretoCandidates)[0]['objectives']> = {};
      for (const c of paretoCandidates) {
        objectivesByPlanId[c.id] = c.objectives;
      }
      paretoDecisionSummary = {
        frontPlanIds: paretoFront.map((p) => p.id),
        selectedPlanId: finalPlanCandidate.id,
        personaUtilityPickPlanId: personaUtilityPick.id,
        negotiationAdjusted: finalPlanCandidate.id !== personaUtilityPick.id,
        objectivesByPlanId,
        multiAgentNegotiation: {
          contributions: negotiation.contributions.map((c) => ({
            agent: c.agent,
            supportedPlanIds: c.supportedPlanIds,
            note: c.note,
          })),
          conflictResolutionLog: negotiation.conflictResolutionLog,
        },
      };
      const pds = paretoDecisionSummary;
      this.logger.log(
        `[Pareto+MA] 前沿 ${pds!.frontPlanIds.join(',')} → 人格效用 ${personaUtilityPick.id} → 协商执行 ${finalPlanCandidate.id}（人格 ${personaForPolicy.type}）`,
      );
      dualEngineMeta = {
        dualEngineAgreementScore: convergence.agreementScore,
        dualEngineDivergenceCount: convergence.divergenceAreas.length,
        draftGateStatus: gate.status,
        slotLevelMergeApplied: true,
      };
      this.logger.log(
        `槽位融合完成：一致度 ${convergence.agreementScore.toFixed(3)}，分歧 ${convergence.divergenceAreas.length}，门控 ${gate.status}`,
      );
      traceArbitration = arbitration;
      traceConvergence = convergence;
      traceGate = gate;
    } else {
      this.logger.log(`[DraftRuntime] LLM：仅体验草案合成（${dto.days} 天）`);
      llmResult = await this.llmOrchestrate(dto, stableCandidates, days, onProgress, contextBlocks);
    }

    // Step 4: 规则校验和修复
    const validationWarnings: string[] = [];
    const failureReasonCodes = new Set<string>();
    const failureDecisionTraces: Array<{
      slot: string;
      trigger: string;
      reasonCode: string;
      rejectedTopK?: Array<{ placeId: number; reason: string; openingHours?: string }>;
    }> = [];
    const validatedDays = await this.validateAndRepair(days, llmResult, stableCandidates, validationWarnings, {
      intensity: dto.intensity,
      transport: dto.transport,
      seed: dto.seed,
      timezone,
      repairAggressiveness: executionPolicy.repairAggressiveness,
      sparseRegionProfile,
      audit: { failureReasonCodes, failureDecisionTraces },
    });

    // Decision OS lite: 汇总松弛口径（目前仅对 TIME_COMPRESSION 做结构化汇总）
    let totalCompressedMin = 0;
    for (const d of validatedDays) {
      for (const item of Object.values(d.slots || {}) as any[]) {
        if (!item) continue;
        const cm = (item?.evidence as any)?.compressedMin;
        if (typeof cm === 'number' && cm > 0) totalCompressedMin += cm;
      }
    }
    const relaxationLevel = totalCompressedMin >= 120 ? 'HEAVY' : totalCompressedMin >= 60 ? 'MODERATE' : 'NONE';
    const verificationStatus =
      failureReasonCodes.size > 0 ? 'FAILED' : relaxationLevel === 'NONE' ? 'VERIFIED' : 'VERIFIED_WITH_RELAXATION';

    const stateEngineMode: TripDraftEngineMode =
      rtMode === 'ALGO' ? 'ALGO' : rtMode === 'LLM' ? 'LLM' : 'HYBRID';

    let finalizedSimState = finalizeTripDraftStateFromValidatedDraft({
      tripId: contract.tripId ?? `draft-${randomUUID()}`,
      dto,
      timezone,
      validatedDays,
      mode: stateEngineMode,
    });
    if (contract.userIntent) {
      finalizedSimState = { ...finalizedSimState, userIntent: contract.userIntent };
    }
    const executionSimulation = runExecutionSimulation({
      tripDraftState: finalizedSimState,
      candidatesById: new Map(stableCandidates.map((c) => [c.id, c])),
      validatedDays,
      simulationLevel: executionPolicy.simulationLevel,
    });

    const decisionTrace = buildDecisionTrace({
      traceId: draftId,
      tripId: contract.tripId,
      version: finalizedSimState.version,
      rtMode: rtMode as 'LLM' | 'ALGO' | 'HYBRID',
      contractMode: contract.mode,
      intentSummary: {
        destination: dto.destination,
        days: dto.days,
        draftRuntimeMode: dto.draftRuntimeMode,
      },
      candidateCount: stableCandidates.length,
      solverContextInjected: contract.constraintsProfile.solverContextInjected,
      arbitration: traceArbitration,
      convergence: traceConvergence,
      gate: traceGate,
      simulation: executionSimulation,
      dualEngineDivergenceCount: dualEngineMeta.dualEngineDivergenceCount ?? 0,
      failureDecisionTraces,
      failureReasonCodes,
    });

    // Step 5: 构建响应
    const generationTime = Date.now() - startTime;

    const response: TripDraftResponseDto = {
      draftId,
      destination: countryCode,
      days: dto.days,
      startDate: dto.startDate || days[0].date,
      endDate: dto.endDate || days[days.length - 1].date,
      draftDays: validatedDays,
      candidatesCount: stableCandidates.length,
      validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
      tripDraftState: finalizedSimState,
      simulation: executionSimulation,
      decisionTrace,
      metadata: {
        generationTime,
        llmProvider: rtMode === 'ALGO' ? 'algorithm' : 'deepseek',
        ...(rtMode === 'ALGO' ? {} : { draftSynthesisMode: 'EXPERIENCE_DRAFT_SYNTHESIS' as const }),
        verificationStatus,
        relaxationLevel: relaxationLevel as any,
        totalCompressedMin,
        ...(failureReasonCodes.size > 0 ? { failureReasonCodes: [...failureReasonCodes] } : {}),
        ...(failureDecisionTraces.length > 0 ? { failureDecisionTraces } : {}),
        ...dualEngineMeta,
        executionSimulation,
        draftContractSummary: {
          mode: contract.mode,
          tripId: contract.tripId,
          engine: contract.engine,
          executionLevel: contract.executionLevel,
          solverContextInjected: contract.constraintsProfile.solverContextInjected,
          regionAnchorPlanning: contract.constraintsProfile.regionAnchorPlanning,
        },
        ...(contract.userIntent
          ? {
              userIntentProfileSummary: {
                preferredPace: contract.userIntent.longTermProfile.preferredPace,
                mobilityTolerance: contract.userIntent.longTermProfile.mobilityTolerance,
                spontaneityLevel: contract.userIntent.longTermProfile.spontaneityLevel,
                budgetSensitivity: contract.userIntent.longTermProfile.budgetSensitivity,
                behaviorPatternsCount: contract.userIntent.behaviorMemory.overridePatterns.length,
              },
            }
          : {}),
        ...(contract.persona
          ? {
              personaExecutionSummary: {
                personaId: contract.persona.personaId,
                type: contract.persona.type,
                gateProfile: executionPolicy.gateProfile,
                simulationLevel: executionPolicy.simulationLevel,
                repairAggressiveness: executionPolicy.repairAggressiveness,
                engineWeights: {
                  llm: executionPolicy.llmWeight,
                  algo: executionPolicy.algoWeight,
                  solver: executionPolicy.solverWeight,
                },
                constraintPriorityOrder: executionPolicy.constraintPriorityOrder,
                systemPolicySchemaVersion: systemPolicy.schemaVersion ?? 1,
              },
            }
          : {}),
        ...(paretoDecisionSummary ? { paretoDecisionSummary } : {}),
      },
    };

    if (this.worldBus) {
      try {
        this.worldBus.emit(
          buildDraftGeneratedEvent({
            draftId,
            cityKey: countryCode,
            tripId: contract.tripId,
            contractMode: contract.mode,
          }),
        );
      } catch (e: any) {
        this.logger.warn(`WorldBus DRAFT_GENERATED emit failed: ${e?.message}`);
      }
    }

    if (contract.tripId && this.worldKernel) {
      try {
        this.worldKernel.simulateTrip(
          contract.tripId,
          buildDraftPipelineSyncedWorldEvent({
            draftId,
            tripId: contract.tripId,
            contractMode: contract.mode,
          }),
        );
      } catch (e: any) {
        this.logger.warn(`WorldKernel trip world sync after draft failed: ${e?.message}`);
      }
    }

    return {
      draftId,
      response,
      tripDraftState: finalizedSimState,
      simulation: executionSimulation,
      decisionTrace,
    };
  }

  /**
   * 按城市检索候选地点（用于替换行程项）
   */
  private async retrieveCandidatesByCity(
    cityId: number,
    countryCode: string,
    style?: TravelStyle,
    constraints?: { mustBeOpen?: boolean; avoidCategories?: string[] }
  ): Promise<CandidatePlace[]> {
    // 构建类别过滤
    const categoryFilter = style 
      ? this.getCategoryFilterByStyle(style)
      : [];

    const categorySql = categoryFilter.length > 0
      ? Prisma.sql`AND p.category = ANY(${categoryFilter}::"PlaceCategory"[])`
      : Prisma.sql``;

    // 避免类别过滤
    const avoidCategorySql = constraints?.avoidCategories && constraints.avoidCategories.length > 0
      ? Prisma.sql`AND p.category != ALL(${constraints.avoidCategories}::"PlaceCategory"[])`
      : Prisma.sql``;

    // 使用 Raw Query 提取坐标（限制在同一城市）
    const rawPlaces = await this.prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      category: string;
      metadata: any;
      physicalMetadata: any;
      rating: number | null;
      lat: number;
      lng: number;
    }>>`
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.category,
        p.metadata,
        p."physicalMetadata",
        p.rating,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c.id = ${cityId}
        AND c."countryCode" = ${countryCode}
        AND p.location IS NOT NULL
        ${categorySql}
        ${avoidCategorySql}
      ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
      LIMIT 50
    `;

    // 转换为候选格式
    return rawPlaces.map(place => {
      const metadata = place.metadata as PlaceMetadata | null;
      const physicalMetadata = place.physicalMetadata as PhysicalMetadata | null;

      return {
        id: place.id,
        nameCN: place.nameCN,
        nameEN: place.nameEN,
        type: place.category,
        category: place.category,
        lat: place.lat,
        lng: place.lng,
        openingHours: metadata?.openingHours,
        avgVisitDuration: physicalMetadata?.estimated_duration_min || 60,
        tags: metadata?.rawTags || [],
        popularity: place.rating ? place.rating * 2 : 5,
        rating: place.rating || undefined,
      };
    });
  }

  /**
   * 获取替换项的路线锚点（前后行程项的中点），用于「距离太远」时筛选更近的替代
   */
  private async getRouteAnchorForItem(
    tripDayId: string,
    itemId: string
  ): Promise<{ lat: number; lng: number } | null> {
    const items = await this.prisma.$queryRaw<Array<{ id: string; placeId: number | null }>>`
      SELECT ii.id, ii."placeId"
      FROM "ItineraryItem" ii
      WHERE ii."tripDayId" = ${tripDayId}
      ORDER BY ii."startTime" ASC NULLS LAST
    `;
    const idx = items.findIndex(i => i.id === itemId);
    if (idx < 0) return null;

    const prevPlaceId = idx > 0 ? items[idx - 1].placeId : null;
    const nextPlaceId = idx < items.length - 1 ? items[idx + 1].placeId : null;
    const placeIds = [prevPlaceId, nextPlaceId].filter((id): id is number => id != null);
    if (placeIds.length === 0) return null;

    const coords = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
      SELECT ST_Y(location::geometry)::float as lat, ST_X(location::geometry)::float as lng
      FROM "Place"
      WHERE id IN (${Prisma.join(placeIds)}) AND location IS NOT NULL
    `;
    if (coords.length === 0) return null;
    const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
    const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
    return { lat, lng };
  }

  /** Haversine 距离（米） */
  private haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 根据风格获取类别过滤
   * 
   * 注意：默认情况下包含 ATTRACTION 和 RESTAURANT，但不包含 HOTEL
   * HOTEL 需要单独处理（因为酒店是住宿地点，不是游玩地点）
   */
  private getCategoryFilterByStyle(style: TravelStyle): string[] {
    const styleMap: Record<TravelStyle, string[]> = {
      [TravelStyle.NATURE]: ['ATTRACTION'],
      [TravelStyle.CULTURE]: ['ATTRACTION'],
      [TravelStyle.FOOD]: ['RESTAURANT'],
      [TravelStyle.CITYWALK]: ['ATTRACTION', 'SHOPPING'],
      [TravelStyle.PHOTOGRAPHY]: ['ATTRACTION'],
      [TravelStyle.ADVENTURE]: ['ATTRACTION'],
    };
    // 默认包含景点和餐厅，但不包含酒店（酒店需要单独推荐）
    return styleMap[style] || ['ATTRACTION', 'RESTAURANT'];
  }

  /**
   * 构建日期列表
   */
  private buildDayList(dto: CreateTripDraftDto): Array<{ day: number; date: string }> {
    const days: Array<{ day: number; date: string }> = [];
    let startDate: DateTime;

    if (dto.startDate) {
      startDate = DateTime.fromISO(dto.startDate);
    } else {
      startDate = DateTime.now().plus({ days: 1 }).startOf('day');
    }

    for (let i = 0; i < dto.days; i++) {
      const date = startDate.plus({ days: i });
      days.push({
        day: i + 1,
        date: date.toFormat('yyyy-MM-dd'),
      });
    }

    return days;
  }

  /**
   * LLM 编排选择
   * @param onProgress 进度回调函数（可选）
   */
  private async llmOrchestrate(
    dto: CreateTripDraftDto,
    candidates: CandidatePlace[],
    days: Array<{ day: number; date: string }>,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>,
    contextBlocks?: ContextBlock[]
  ): Promise<any> {
    // 构建 LLM Prompt（可选注入 Context 上下文）
    const prompt = this.buildOrchestrationPrompt(dto, candidates, days, contextBlocks);

    // Experience Draft Synthesis：允许弱完成态 + 草案责任字段（供 VERIFY 继承）
    const slotItemSchema = {
      type: 'object',
      properties: {
        deferred: {
          type: 'boolean',
          description: 'true = 该时段刻意留白，不强行填点；由后续系统补全',
        },
        placeId: { type: 'integer', description: '候选中的合法 id；deferred=true 时可省略' },
        reason: { type: 'string' },
        alternatives: { type: 'array', items: { type: 'integer' } },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        validationRequired: { type: 'boolean' },
        riskTags: { type: 'array', items: { type: 'string' } },
      },
      required: ['reason'],
    };

    const schema = {
      type: 'object',
      properties: {
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              day: { type: 'number' },
              slots: {
                type: 'object',
                properties: {
                  morning: slotItemSchema,
                  lunch: slotItemSchema,
                  afternoon: slotItemSchema,
                  dinner: slotItemSchema,
                  evening: slotItemSchema,
                },
              },
            },
            required: ['day', 'slots'],
          },
        },
      },
      required: ['days'],
    };

    let response: string | undefined;
    try {
      this.logger.log(
        `开始调用 LLM Experience Draft Synthesis（${candidates.length} 个候选地点，${days.length} 天）`,
      );
      const startTime = Date.now();
      
      // 使用 DeepSeek（内网环境可用）
      response = await this.llmService.callLlmWithSchema(
        LlmProvider.DEEPSEEK,
        prompt,
        schema
      );

      const elapsed = Date.now() - startTime;
      this.logger.log(`LLM 编排完成，耗时 ${elapsed}ms`);

      // 处理可能包含 markdown 代码块标记的响应
      const parsed = this.extractJSON(response);
      
      // 记录原始响应（用于调试）
      if (response.includes('```')) {
        this.logger.debug(`LLM 响应包含 markdown 代码块，已清理`);
      }
      
      // 验证返回结果
      if (!parsed.days || !Array.isArray(parsed.days)) {
        this.logger.warn(`LLM 返回结果格式异常: ${JSON.stringify(parsed).substring(0, 200)}`);
        throw new BadRequestException('LLM 返回结果格式不正确');
      }
      
      this.logger.log(`LLM 返回了 ${parsed.days.length} 天的编排结果`);
      
      // LLM 编排完成，通知进度回调
      if (onProgress) {
        try {
          await onProgress({
            status: 'generating',
            stage: 'llm_completed',
            message: `Experience Draft 合成完成，已生成 ${parsed.days.length} 天的草案结构`,
          });
        } catch (progressError: any) {
          this.logger.warn(`进度回调失败: ${progressError.message}`);
          // 不抛出错误，避免影响主流程
        }
      }
      
      return parsed;
    } catch (error: any) {
      this.logger.error(`LLM 编排失败: ${error.message}`, error.stack);
      if (response) {
        this.logger.error(`LLM 原始响应（前500字符）: ${response.substring(0, 500)}`);
      }
      
      // 通知进度回调：失败
      if (onProgress) {
        try {
          await onProgress({
            status: 'failed',
            stage: 'llm_error',
            message: `LLM 编排失败: ${error.message}`,
          });
        } catch (progressError: any) {
          this.logger.warn(`进度回调失败: ${progressError.message}`);
        }
      }
      
      throw new BadRequestException(`行程生成失败: ${error.message}`);
    }
  }

  /**
   * Experience Draft Synthesis Prompt —— 由 prompt-runtime 分层组装（见 `draft-synthesis/prompt-runtime`）
   */
  private buildOrchestrationPrompt(
    dto: CreateTripDraftDto,
    candidates: CandidatePlace[],
    days: Array<{ day: number; date: string }>,
    contextBlocks?: ContextBlock[]
  ): string {
    const countryCode = dto.destination.toUpperCase().trim();
    const timezone = this.timezoneForDestination(countryCode);
    return assembleExperienceDraftPrompt({
      dto,
      candidates,
      days,
      timezone,
      contextBlocks,
    });
  }

  /**
   * 规则校验和修复
   */
  private async validateAndRepair(
    days: Array<{ day: number; date: string }>,
    llmResult: any,
    candidates: CandidatePlace[],
    warnings: string[],
    options?: {
      intensity?: string;
      transport?: import('../dto/trip-draft.dto').TransportMode;
      seed?: number;
      timezone?: string;
      /** Policy Engine：LOW 时跳过餐饮重复上限松弛，减少自动改写 */
      repairAggressiveness?: 'LOW' | 'MEDIUM' | 'HIGH';
      /** SPARSE_REGION_PROFILE：极地/稀疏供给 — 冻结 fillMissingSlots、elastic 跳过 openingHours */
      sparseRegionProfile?: SparseRegionProfile | null;
      audit?: {
        failureReasonCodes: Set<string>;
        failureDecisionTraces: Array<{
          slot: string;
          trigger: string;
          reasonCode: string;
          rejectedTopK?: Array<{ placeId: number; reason: string; openingHours?: string }>;
        }>;
      };
    }
  ): Promise<DraftDay[]> {
    const validatedDays: DraftDay[] = [];
    const allowRepeatRelaxation = options?.repairAggressiveness !== 'LOW';

    const tz = options?.timezone || 'UTC';
    
    // 🆕 记录每天使用的 placeId（用于去重）
    const dailyPlaceIds = new Map<number, Set<number>>(); // day -> Set<placeId>
    const globalPlaceIds = new Map<number, number>(); // placeId -> count
    const dailyRestaurantIds = new Map<number, Set<number>>(); // day -> Set<restaurant placeId>（用于餐厅去重）

    const isMealSlot = (slot: TimeSlot) => slot === TimeSlot.LUNCH || slot === TimeSlot.DINNER;
    const slotShouldBeRestaurant = (slot: TimeSlot) => isMealSlot(slot);
    const slotShouldBeNonRestaurant = (slot: TimeSlot) =>
      slot === TimeSlot.MORNING || slot === TimeSlot.AFTERNOON || slot === TimeSlot.EVENING;

    // 🆕 重复上限策略（Decision OS）：F&B（餐饮/咖啡）默认全程最多 1 次；景点类保留 2 次
    const isFoodAndBeverage = (c: CandidatePlace): boolean => {
      if (c.category === 'RESTAURANT') return true;
      const ct = String((c as any).canonicalType ?? '').toUpperCase();
      if (ct.includes('CAFE') || ct.includes('COFFEE') || ct.includes('BAR')) return true;
      const tags = Array.isArray((c as any).tags) ? ((c as any).tags as string[]) : [];
      const t = tags.join(' ').toLowerCase();
      return t.includes('cafe') || t.includes('coffee') || t.includes('咖啡') || t.includes('bar');
    };
    const repetitionLimitFor = (c: CandidatePlace): number => (isFoodAndBeverage(c) ? 1 : 2);

    const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };

    const seed = Math.floor((options?.seed ?? 0) as number) >>> 0;
    const rand01 = (salt: number): number => {
      // xorshift32 (deterministic)
      let x = (seed ^ (salt >>> 0)) >>> 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return ((x >>> 0) % 1000000) / 1000000;
    };

    type ScoreBreakdown = {
      total: number;
      distance: number;
      categoryFit: number;
      openingHoursFit: number;
      pacingImpact: number;
      fatigueImpact: number;
      businessValue: number;
      timeCompressionCost: number;
    };
    type ReplacementChoice = {
      selected: CandidatePlace;
      topK: Array<{ placeId: number; breakdown: ScoreBreakdown }>;
      relaxedRepeatLimit?: boolean;
    };

    const pickReplacement = (args: {
      slot: TimeSlot;
      candidates: CandidatePlace[];
      dayPlaceIds: Set<number>;
      dayRestaurantIds: Set<number>;
      globalPlaceIds: Map<number, number>;
      nearPlaceId?: number;
      extraFilter?: (c: CandidatePlace) => boolean;
      // 用于“时间可行性”场景：若给定，则压缩低于 minSafe 时可直接 gate-out
      minSafeMin?: number;
      date?: string;
      timezone?: string;
      // 🆕 openingHours window gate：若给定，则候选必须覆盖该访问时间窗
      visitWindow?: { start: DateTime; end: DateTime };
      // 🆕 time-aware scoring：用于比较“换点 vs 压缩”
      timeContext?: {
        currentMin: number; // 当前 slot 最早可开始的分钟（day start + minutes）
        nextAnchorMin?: number; // 下一锚点开始时间（分钟）；缺失则不做 squeeze 估算
        intensity?: string;
      };
      auditContext?: {
        slot: string;
        trigger: string;
        reasonCodeIfUnresolvable: string;
      };
    }): ReplacementChoice | null => {
      const { slot, candidates, dayPlaceIds, dayRestaurantIds, globalPlaceIds, nearPlaceId } = args;
      const requireRestaurant = slotShouldBeRestaurant(slot);
      const forbidRestaurant = slotShouldBeNonRestaurant(slot);

      const restaurantCandidates = requireRestaurant ? candidates.filter((c) => c.category === 'RESTAURANT') : [];
      const onlyOneRestaurant = requireRestaurant && restaurantCandidates.length === 1;

      const near = nearPlaceId ? candidates.find((c) => c.id === nearPlaceId) : undefined;

      const filtered = candidates.filter((c) => {
        if (requireRestaurant && c.category !== 'RESTAURANT') return false;
        if (forbidRestaurant && c.category === 'RESTAURANT') return false;
        const elasticNode =
          options?.sparseRegionProfile?.allowElasticNodes === true && isElasticCandidate(c);
        if (dayPlaceIds.has(c.id)) return false;
        const g = globalPlaceIds.get(c.id) ?? 0;
        const limit = repetitionLimitFor(c);
        if (g >= limit && !elasticNode) return false;
        if (args.extraFilter && !args.extraFilter(c)) return false;
        const elasticSkipHours = elasticNode;
        // openingHours hard gate（若能判断 Closed）
        if (args.date && !elasticSkipHours) {
          const hoursStr = this.getOpeningHoursForDate((c as any).openingHours, args.date, args.timezone);
          if (hoursStr === 'Closed') return false;
        }
        if (args.date && args.visitWindow && !elasticSkipHours) {
          if (!this.openingHoursContainWindowTz((c as any).openingHours, args.date, args.visitWindow.start, args.visitWindow.end, args.timezone)) {
            return false;
          }
        }
        // time feasible gate：如果 nextAnchor 给定且连 MinSafe 都放不下，则 gate-out
        if (args.timeContext?.nextAnchorMin != null) {
          const slack = Math.max(0, args.timeContext.nextAnchorMin - args.timeContext.currentMin);
          const minSafe =
            c.category === 'RESTAURANT'
              ? 60
              : this.pacingEngine.isMuseum(c)
                ? 60
                : c.category === 'PARK'
                  ? 45
                  : c.category === 'SHOPPING'
                    ? 60
                    : c.category === 'ATTRACTION' || c.category === 'TRANSIT_HUB'
                      ? 30
                      : 45;
          if (slack > 0 && slack < minSafe) return false;
        }

        if (requireRestaurant) {
          // 午/晚餐：尽量避免同一家餐厅重复，除非当天只有一家餐厅候选
          if (dayRestaurantIds.has(c.id) && !onlyOneRestaurant) return false;
        }
        return true;
      });

      // 若因重复上限导致不可行：允许对餐饮类做一次“显式松弛”（可审计），避免直接失败
      const maybeRelaxed = () => {
        if (!requireRestaurant) return null;
        const relaxed = candidates.filter((c) => {
          if (c.category !== 'RESTAURANT') return false;
          if (dayPlaceIds.has(c.id)) return false;
          if (args.extraFilter && !args.extraFilter(c)) return false;
          if (args.date) {
          const hoursStr = this.getOpeningHoursForDate((c as any).openingHours, args.date, args.timezone);
            if (hoursStr === 'Closed') return false;
          }
          // 注意：这里不再检查 global usage（重复上限松弛）
          return true;
        });
        return relaxed.length > 0 ? relaxed : null;
      };

      let pool = filtered;
      let relaxedRepeatLimit = false;
      if (pool.length === 0 && allowRepeatRelaxation) {
        const relaxedPool = maybeRelaxed();
        if (relaxedPool) {
          pool = relaxedPool;
          relaxedRepeatLimit = true;
        }
      }

      if (pool.length === 0) {
        // failure trace: 将被 gate-out 的候选（尤其是 Closed）作为可回放证据写入 metadata
        if (args.auditContext && options?.audit?.failureDecisionTraces) {
          const rejectedTopK: Array<{ placeId: number; reason: string; openingHours?: string }> = [];
          // 仅在 openingHours 场景下做精细拒绝采样（否则原因过于宽泛）
          if (args.date) {
            const requireRestaurant = slotShouldBeRestaurant(args.slot);
            for (const c of candidates) {
              if (requireRestaurant && c.category !== 'RESTAURANT') continue;
              const hoursStr = this.getOpeningHoursForDate((c as any).openingHours, args.date, args.timezone);
              if (hoursStr === 'Closed') {
                rejectedTopK.push({ placeId: c.id, reason: 'GATE_OUT:OPENING_HOURS_CLOSED', openingHours: 'Closed' });
              } else if (args.visitWindow) {
                const ok = this.openingHoursContainWindowTz((c as any).openingHours, args.date, args.visitWindow.start, args.visitWindow.end, args.timezone);
                if (!ok) {
                  rejectedTopK.push({
                    placeId: c.id,
                    reason: 'GATE_OUT:OPENING_HOURS_NOT_COVERING_WINDOW',
                    openingHours: hoursStr,
                  });
                }
              }
              if (rejectedTopK.length >= 10) break;
            }
          }
          options.audit.failureDecisionTraces.push({
            slot: args.auditContext.slot,
            trigger: args.auditContext.trigger,
            reasonCode: args.auditContext.reasonCodeIfUnresolvable,
            rejectedTopK: rejectedTopK.length > 0 ? rejectedTopK : undefined,
          });
        }
        return null;
      }

      // TopK + scoring（可解释 + 可回放）
      const scoreOne = (c: CandidatePlace): ScoreBreakdown => {
        // distance: 越近越好（near 缺失则中性）
        let distScore = 0.5;
        let km = 0;
        if (near) {
          km = haversineKm(c.lat, c.lng, near.lat, near.lng);
          distScore = 1 / (1 + km); // 0..1
        }
        // categoryFit: 符合类型锁 +1，否则 -1（但不应发生，因为已过滤；保留做解释）
        const categoryFit = requireRestaurant ? (c.category === 'RESTAURANT' ? 1 : -1) : forbidRestaurant ? (c.category !== 'RESTAURANT' ? 1 : -1) : 0.5;
        // pacingImpact: 越不踩节奏越好（extraFilter 已过滤；这里给 1）
        const pacingImpact = 1;
        // fatigueImpact: 用“到 near 的行驶时间”近似（越小越好）
        const speedKmh =
          options?.transport === 'car' ? 60 : options?.transport === 'transit' ? 25 : 4;
        const travelTimeH = near ? Math.min(km / speedKmh, 4) : 1;
        const fatigueImpact = 1 / (1 + travelTimeH);
        // businessValue: rating/popularity 归一化
        const r = (c.rating ?? 0) / 5;
        const p = Math.min(1, (c.popularity ?? 0) / 10);
        const businessValue = 0.6 * r + 0.4 * p;
        // openingHoursFit: 若给了 visitWindow，则必须覆盖该窗口；未知则中性
        let openingHoursFit = 1;
        if (args.date && args.visitWindow) {
          const hoursStr = this.getOpeningHoursForDate((c as any).openingHours, args.date, args.timezone);
          if (hoursStr === 'Closed') openingHoursFit = 0;
          else if (hoursStr) openingHoursFit = this.openingHoursContainWindowTz((c as any).openingHours, args.date, args.visitWindow.start, args.visitWindow.end, args.timezone) ? 1 : 0;
        }

        const w1 = 0.33;
        const w2 = 0.15;
        const wOH = 0.07;
        const w3 = 0.1;
        const w4 = 0.2;
        const w5 = 0.15;
        // timeCompressionCost：估算为了不挤爆下一锚点需要压缩的分钟数（负向）
        let timeCompressionCost = 0;
        if (args.timeContext?.nextAnchorMin != null) {
          const slack = Math.max(0, args.timeContext.nextAnchorMin - args.timeContext.currentMin);
          // preferred stay（与动态排程器一致的最小版）
          let base = 90;
          if (c.category === 'RESTAURANT') base = (c.tags ?? []).join(' ').toLowerCase().includes('michelin') ? 120 : 90;
          else if (this.pacingEngine.isMuseum(c)) base = 150;
          else if (c.category === 'PARK') base = 90;
          else if (c.category === 'SHOPPING') base = 120;
          else if (c.category === 'ATTRACTION' || c.category === 'TRANSIT_HUB') base = 75;
          let preferred = base;
          if (args.timeContext.intensity === 'relaxed') preferred = preferred * 1.2;
          else if (args.timeContext.intensity === 'intense') preferred = preferred * 0.8;
          const pop = c.popularity ?? 0;
          if (pop >= 9) preferred = preferred * 1.3;
          else if (pop >= 8) preferred = preferred * 1.15;
          preferred = Math.round(preferred / 5) * 5;
          const minSafe =
            c.category === 'RESTAURANT'
              ? 60
              : this.pacingEngine.isMuseum(c)
                ? 60
                : c.category === 'PARK'
                  ? 45
                  : c.category === 'SHOPPING'
                    ? 60
                    : c.category === 'ATTRACTION' || c.category === 'TRANSIT_HUB'
                      ? 30
                      : 45;
          const final = Math.max(minSafe, Math.min(preferred, slack > 0 ? slack : preferred));
          const compressedMin = Math.max(0, preferred - final);
          const cw =
            this.pacingEngine.isMuseum(c) ? 2.0 : (c.category === 'ATTRACTION' || c.category === 'TRANSIT_HUB') ? 1.4 : c.category === 'SHOPPING' ? 1.2 : c.category === 'RESTAURANT' ? 1.3 : 1.0;
          timeCompressionCost = -1 * (compressedMin / 60) * cw;
        }
        const total =
          w1 * distScore +
          w2 * (categoryFit > 0 ? 1 : 0) +
          wOH * openingHoursFit +
          w3 * pacingImpact +
          w4 * fatigueImpact +
          w5 * businessValue +
          timeCompressionCost;

        return {
          total,
          distance: w1 * distScore,
          categoryFit: w2 * (categoryFit > 0 ? 1 : 0),
          openingHoursFit: wOH * openingHoursFit,
          pacingImpact: w3 * pacingImpact,
          fatigueImpact: w4 * fatigueImpact,
          businessValue: w5 * businessValue,
          timeCompressionCost,
        };
      };

      const scored = pool.map((c) => {
        const breakdown = scoreOne(c);
        // tie-break: deterministic tiny jitter based on seed + placeId
        const jitter = rand01(c.id) * 1e-6;
        return { c, breakdown, totalWithJitter: breakdown.total + jitter };
      });
      scored.sort((a, b) => b.totalWithJitter - a.totalWithJitter);
      const topK = scored.slice(0, Math.min(10, scored.length));
      const selected = topK[0]?.c;
      if (!selected) return null;
      return {
        selected,
        topK: topK.map((x) => ({ placeId: x.c.id, breakdown: x.breakdown })),
        ...(relaxedRepeatLimit ? { relaxedRepeatLimit: true } : {}),
      };
    };

    for (const dayData of days) {
      const llmDay = llmResult.days?.find((d: any) => d.day === dayData.day);
      if (!llmDay) {
        warnings.push(`第 ${dayData.day} 天缺少 LLM 编排结果`);
        continue;
      }

      const slots: DraftDaySlots = {};
      const dayPlaceIds = new Set<number>(); // 记录当天使用的 placeId
      const dayRestaurantIds = new Set<number>(); // 记录当天使用的餐厅 placeId

      // 验证每个时段
      for (const [slotKey, slotValue] of Object.entries(llmDay.slots || {})) {
        if (!slotValue || typeof slotValue !== 'object') continue;

        const slot = slotKey as TimeSlot;
        const item = slotValue as {
          placeId?: number | string | null;
          reason?: string;
          alternatives?: number[];
          deferred?: boolean;
          confidence?: string;
          validationRequired?: boolean;
          riskTags?: string[];
        };

        // Experience Draft：弱完成态 — 留白不产生 itinerary 项（可与 fillMissingSlots 衔接）
        if (item.deferred === true || item.placeId === null || item.placeId === undefined) {
          warnings.push(
            `第 ${dayData.day} 天 ${slotKey}：草案留白（deferred/无 placeId）— ${item.reason?.slice(0, 120) || '未说明'}`,
          );
          continue;
        }

        const rawPid = item.placeId;
        const placeIdNum = typeof rawPid === 'string' ? parseInt(rawPid, 10) : Number(rawPid);
        if (!Number.isFinite(placeIdNum)) {
          warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段 placeId 非法，已跳过`);
          continue;
        }
        (item as any).placeId = placeIdNum;
        let pid = placeIdNum;

        // 验证 placeId 是否存在
        let candidate = candidates.find((c) => c.id === placeIdNum);
        if (!candidate) {
          warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段的 placeId ${placeIdNum} 不在候选中`);
          continue;
        }

        // 🆕 Slot Type Lock（前置约束）：午/晚餐必须餐厅；morning/afternoon/evening 禁止餐厅
        const mustBeRestaurant = slotShouldBeRestaurant(slot);
        const mustBeNonRestaurant = slotShouldBeNonRestaurant(slot);
        if ((mustBeRestaurant && candidate.category !== 'RESTAURANT') || (mustBeNonRestaurant && candidate.category === 'RESTAURANT')) {
          const choice = pickReplacement({
            slot,
            candidates,
            dayPlaceIds,
            dayRestaurantIds,
            globalPlaceIds,
            date: dayData.date,
            auditContext: {
              slot: slotKey,
              trigger: 'TYPE_LOCK_REPAIR',
              reasonCodeIfUnresolvable: 'TYPE_LOCK_UNSATISFIABLE',
            },
          });
          if (choice) {
            warnings.push(
              `第 ${dayData.day} 天 ${slotKey} 时段触发槽位类型锁：${candidate.id}（${candidate.nameCN}）→ ${choice.selected.id}（${choice.selected.nameCN}）`,
            );
            candidate = choice.selected;
            item.placeId = choice.selected.id;
            pid = choice.selected.id;
            item.reason = (item.reason || '推荐') + ' [类型锁修复]';
            (item as any)._replacementTopK = choice.topK; // 暂存，后续写入 evidence.decisionTrace
            (item as any)._replacementRelaxedRepeatLimit = !!(choice as any).relaxedRepeatLimit;
          } else {
            warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段无法找到满足类型锁的替代地点，已跳过`);
            options?.audit?.failureReasonCodes?.add('TYPE_LOCK_UNSATISFIABLE');
            continue;
          }
        }

        // 🆕 检查当天是否已使用该 placeId
        if (dayPlaceIds.has(pid)) {
          warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段重复选择了地点 ${pid}（${candidate.nameCN}），已跳过`);
          continue; // 跳过重复项
        }

        // 🆕 检查餐厅重复（午餐和晚餐时段）
        const isRestaurant = candidate.category === 'RESTAURANT';
        const isMeal = isMealSlot(slot);
        
        if (isRestaurant && isMeal && dayRestaurantIds.has(pid)) {
          // 特殊情况：如果当天只有一家餐厅候选，允许重复
          const restaurantCandidates = candidates.filter(c => c.category === 'RESTAURANT');
          if (restaurantCandidates.length > 1) {
            warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段重复选择了餐厅 ${pid}（${candidate.nameCN}），已跳过`);
            continue; // 跳过重复餐厅（除非只有一家）
          } else {
            warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段重复选择餐厅 ${pid}（${candidate.nameCN}），但当天只有一家餐厅候选，允许重复`);
          }
        }

        // 🆕 检查全局重复次数（允许跨天重复，但限制次数）
        const globalCount = globalPlaceIds.get(pid) || 0;
        const repLimit = repetitionLimitFor(candidate);
        if (globalCount >= repLimit) {
          warnings.push(`地点 ${pid}（${candidate.nameCN}）在整个行程中已出现 ${globalCount} 次，跳过重复`);
          continue; // 跳过过度重复项
        }

        // 🆕 营业时间硬约束（简化版）：若明确 Closed，则尝试替换（同类别/类型锁）
        const hoursStr = this.getOpeningHoursForDate(candidate.openingHours, dayData.date, tz);
        if (hoursStr === 'Closed') {
          const choice = pickReplacement({
            slot,
            candidates,
            dayPlaceIds,
            dayRestaurantIds,
            globalPlaceIds,
            date: dayData.date,
            auditContext: {
              slot: slotKey,
              trigger: 'OPENING_HOURS_REPAIR',
              reasonCodeIfUnresolvable: 'OPENING_HOURS_CLOSED_UNRESOLVABLE',
            },
          });
          if (choice) {
            warnings.push(
              `第 ${dayData.day} 天 ${slotKey} 时段营业时间 Closed：${candidate.id}（${candidate.nameCN}）→ ${choice.selected.id}（${choice.selected.nameCN}）`,
            );
            candidate = choice.selected;
            item.placeId = choice.selected.id;
            pid = choice.selected.id;
            item.reason = (item.reason || '推荐') + ' [营业时间修复]';
            (item as any)._replacementTopK = choice.topK;
            (item as any)._replacementRelaxedRepeatLimit = !!(choice as any).relaxedRepeatLimit;
          } else {
            warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段营业时间 Closed 且无替代地点，已跳过`);
            options?.audit?.failureReasonCodes?.add('OPENING_HOURS_CLOSED_UNRESOLVABLE');
            continue;
          }
        }

        // 记录已使用的 placeId
        dayPlaceIds.add(pid);
        globalPlaceIds.set(pid, globalCount + 1);
        
        if (isRestaurant) {
          dayRestaurantIds.add(pid);
        }

        // 构建时段项
        const slotTime = this.SLOT_TIMES[slot];
        const st = this.parseHourToHm(slotTime.start);
        const et = this.parseHourToHm(slotTime.end);
        const startDateTime = DateTime.fromISO(dayData.date, { zone: tz }).set({ hour: st.hour, minute: st.minute, second: 0, millisecond: 0 });
        const endDateTime = DateTime.fromISO(dayData.date, { zone: tz }).set({ hour: et.hour, minute: et.minute, second: 0, millisecond: 0 });

        // 🆕 营业时间硬约束（时间窗版）：必须覆盖该 slot 的访问窗口，否则尝试替换
        if (!this.openingHoursContainWindowTz(candidate.openingHours, dayData.date, startDateTime, endDateTime, tz)) {
          const choice = pickReplacement({
            slot,
            candidates,
            dayPlaceIds,
            dayRestaurantIds,
            globalPlaceIds,
            date: dayData.date,
            timezone: tz,
            visitWindow: { start: startDateTime, end: endDateTime },
            auditContext: {
              slot: slotKey,
              trigger: 'OPENING_HOURS_WINDOW_REPAIR',
              reasonCodeIfUnresolvable: 'OPENING_HOURS_WINDOW_UNRESOLVABLE',
            },
          });
          if (choice) {
            warnings.push(
              `第 ${dayData.day} 天 ${slotKey} 时段营业时间不覆盖访问窗口：${candidate.id}（${candidate.nameCN}）→ ${choice.selected.id}（${choice.selected.nameCN}）`,
            );
            candidate = choice.selected;
            item.placeId = choice.selected.id;
            pid = choice.selected.id;
            item.reason = (item.reason || '推荐') + ' [营业时间窗口修复]';
            (item as any)._replacementTopK = choice.topK;
            (item as any)._replacementRelaxedRepeatLimit = !!(choice as any).relaxedRepeatLimit;
          } else {
            warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段营业时间不匹配且无替代地点，已跳过`);
            options?.audit?.failureReasonCodes?.add('OPENING_HOURS_WINDOW_UNRESOLVABLE');
            continue;
          }
        }

        const confRaw = item.confidence;
        const draftConfidence =
          confRaw === 'low' || confRaw === 'medium' || confRaw === 'high' ? confRaw : undefined;

        const draftItem: DraftItineraryItem = {
          placeId: candidate.id,
          slot: slot,
          startTime: startDateTime.toISO() || new Date().toISOString(),
          endTime: endDateTime.toISO() || new Date().toISOString(),
          reason: item.reason || '推荐',
          alternatives: item.alternatives || [],
          evidence: {
            ...this.buildOpeningHoursEvidence(candidate.openingHours, dayData.date, String(slot), {
              start: `${String(st.hour).padStart(2, '0')}:${String(st.minute).padStart(2, '0')}`,
              end: `${String(et.hour).padStart(2, '0')}:${String(et.minute).padStart(2, '0')}`,
            }, tz),
            rating: candidate.rating,
            source: 'database',
            draftLayer: 'EXPERIENCE_DRAFT_SYNTHESIS',
            ...(draftConfidence ? { draftConfidence } : {}),
            ...(typeof item.validationRequired === 'boolean' ? { validationRequired: item.validationRequired } : {}),
            ...(Array.isArray(item.riskTags) && item.riskTags.length > 0 ? { riskTags: item.riskTags } : {}),
          },
        };
        const repTopK = (item as any)._replacementTopK;
        if (repTopK && draftItem.evidence) {
          (draftItem.evidence as any).decisionTrace = {
            ...(draftItem.evidence as any).decisionTrace,
            replacementTopK: repTopK,
          };
        }
        const repRelaxed = (item as any)._replacementRelaxedRepeatLimit;
        if (repRelaxed && draftItem.evidence) {
          (draftItem.evidence as any).decisionTrace = {
            ...((draftItem.evidence as any).decisionTrace || {}),
            relaxation_event: {
              type: 'REPEAT_LIMIT_RELAXATION',
              reason: 'FNB_CANDIDATE_POOL_EXHAUSTED',
            },
          };
        }

        slots[slot] = draftItem;
      }

      dailyPlaceIds.set(dayData.day, dayPlaceIds);
      dailyRestaurantIds.set(dayData.day, dayRestaurantIds);

      // TripNara Phase 3: 地理约束（同一天 cluster/District 不超过 2 个）检查与修复
      const buildSlotMap = () =>
        Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { placeId: v.placeId }]));
      let slotMap = buildSlotMap();
      const hasDistrictData = Object.values(slots).some((s) => {
        const c = candidates.find((x) => x.id === s.placeId);
        return c?.districtId != null;
      });
      if (hasDistrictData) {
        const districtResult = this.constraintEngine.checkDistrictConstraint(slotMap, candidates);
        if (!districtResult.ok && districtResult.excessDistrictIds.length > 0) {
          const keepDistrictIds = districtResult.districtIds.filter(
            (id) => !districtResult.excessDistrictIds.includes(id),
          );
          for (const [slotKey, draftItem] of Object.entries(slots)) {
            const c = candidates.find((x) => x.id === draftItem.placeId);
            if (c?.districtId != null && districtResult.excessDistrictIds.includes(c.districtId)) {
              const isMeal = slotKey === 'lunch' || slotKey === 'dinner';
              const replacement = this.constraintEngine.suggestReplacementFromDistricts(
                draftItem.placeId,
                districtResult.excessDistrictIds,
                keepDistrictIds,
                candidates,
                isMeal ? 'RESTAURANT' : undefined,
              );
              if (replacement && !dayPlaceIds.has(replacement)) {
                const oldId = draftItem.placeId;
                dayPlaceIds.delete(oldId);
                dayPlaceIds.add(replacement);
                globalPlaceIds.set(oldId, Math.max(0, (globalPlaceIds.get(oldId) ?? 0) - 1));
                globalPlaceIds.set(replacement, (globalPlaceIds.get(replacement) ?? 0) + 1);
                if (c.category === 'RESTAURANT') dayRestaurantIds.delete(oldId);
                const repCandidate = candidates.find((x) => x.id === replacement);
                if (repCandidate?.category === 'RESTAURANT') dayRestaurantIds.add(replacement);
                draftItem.placeId = replacement;
                draftItem.reason = (draftItem.reason || '') + ' [District约束修复]';
                warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段因 District 约束将 ${oldId} 替换为 ${replacement}`);
              }
            }
          }
        }
      } else {
        const clusterResult = this.constraintEngine.checkClusterConstraint(slotMap, candidates);
        if (!clusterResult.ok && clusterResult.excessClusterIds.length > 0) {
          for (const [slotKey, draftItem] of Object.entries(slots)) {
            const c = candidates.find((x) => x.id === draftItem.placeId);
            if (c?.clusterId !== undefined && clusterResult.excessClusterIds.includes(c.clusterId)) {
              const isMeal = slotKey === 'lunch' || slotKey === 'dinner';
              const replacement = this.constraintEngine.suggestReplacementFromClusters(
                draftItem.placeId,
                clusterResult.excessClusterIds,
                clusterResult.clusterIds.filter((id) => !clusterResult.excessClusterIds.includes(id)),
                candidates,
                isMeal ? 'RESTAURANT' : undefined,
              );
              if (replacement && !dayPlaceIds.has(replacement)) {
                const oldId = draftItem.placeId;
                dayPlaceIds.delete(oldId);
                dayPlaceIds.add(replacement);
                globalPlaceIds.set(oldId, Math.max(0, (globalPlaceIds.get(oldId) ?? 0) - 1));
                globalPlaceIds.set(replacement, (globalPlaceIds.get(replacement) ?? 0) + 1);
                if (c.category === 'RESTAURANT') dayRestaurantIds.delete(oldId);
                const repCandidate = candidates.find((x) => x.id === replacement);
                if (repCandidate?.category === 'RESTAURANT') dayRestaurantIds.add(replacement);
                draftItem.placeId = replacement;
                draftItem.reason = (draftItem.reason || '') + ' [cluster约束修复]';
                warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段因 cluster 约束将 ${oldId} 替换为 ${replacement}`);
              }
            }
          }
        }
      }

      // 🆕 约束满足修复循环（Solver-like）：距离 → 疲劳 → 节奏，最多迭代 N 次
      const MAX_REPAIR_ITERS = 3;
      const maxDistKm = options?.transport === 'car' ? 150 : options?.transport === 'transit' ? 30 : 5;

      const adjustSetsForRemoval = (placeId: number) => {
        dayPlaceIds.delete(placeId);
        const oldC = candidates.find((c) => c.id === placeId);
        if (oldC?.category === 'RESTAURANT') dayRestaurantIds.delete(placeId);
        globalPlaceIds.set(placeId, Math.max(0, (globalPlaceIds.get(placeId) ?? 1) - 1));
      };
      const adjustSetsForAdd = (placeId: number) => {
        dayPlaceIds.add(placeId);
        const c = candidates.find((x) => x.id === placeId);
        if (c?.category === 'RESTAURANT') dayRestaurantIds.add(placeId);
        globalPlaceIds.set(placeId, (globalPlaceIds.get(placeId) ?? 0) + 1);
      };

      const tryRepairDistanceOnce = (): boolean => {
        slotMap = buildSlotMap();
        const distViolations = this.constraintEngine.checkDistanceConstraint(slotMap, candidates, options?.transport);
        if (!distViolations.length) return false;

        // 优先修复最严重的 violation（距离最大）
        const worst = [...distViolations].sort((a, b) => b.distanceKm - a.distanceKm)[0];
        const slotA = worst.slotA as TimeSlot;
        const slotB = worst.slotB as TimeSlot;
        const from = slots[slotA];
        const to = slots[slotB];
        if (!from || !to) return false;

        const choice = pickReplacement({
          slot: slotB,
          candidates,
          dayPlaceIds,
          dayRestaurantIds,
          globalPlaceIds,
          nearPlaceId: from.placeId,
          date: dayData.date,
          auditContext: {
            slot: String(slotB),
            trigger: 'DISTANCE_REPAIR',
            reasonCodeIfUnresolvable: 'DISTANCE_VIOLATION_UNRESOLVABLE',
          },
        });
        if (!choice) {
          warnings.push(`第 ${dayData.day} 天 ${worst.slotA}→${worst.slotB} 距离 ${worst.distanceKm}km 超过 ${maxDistKm}km，且无可用替代`);
          options?.audit?.failureReasonCodes?.add('DISTANCE_VIOLATION_UNRESOLVABLE');
          return false;
        }

        const oldId = to.placeId;
        adjustSetsForRemoval(oldId);
        adjustSetsForAdd(choice.selected.id);
        to.placeId = choice.selected.id;
        to.reason = (to.reason || '') + ' [距离修复]';
        (to.evidence as any) = { ...(to.evidence as any), decisionTrace: { ...(to.evidence as any)?.decisionTrace, replacementTopK: choice.topK } };
        warnings.push(
          `第 ${dayData.day} 天 ${worst.slotA}→${worst.slotB} 距离 ${worst.distanceKm}km 超过 ${maxDistKm}km，替换 ${oldId}→${choice.selected.id}`,
        );
        return true;
      };

      const tryRepairFatigueOnce = (): boolean => {
        slotMap = buildSlotMap();
        const fatigueResult = this.fatigueEngine.compute(slotMap, candidates, options?.transport);
        const maxFatigue = this.fatigueEngine.getMaxScoreForIntensity(options?.intensity);
        if (fatigueResult.score <= maxFatigue) return false;

        // 熔断策略：优先移除 evening（可选时段）降低疲劳与行走
        if (slots[TimeSlot.EVENING]) {
          const old = slots[TimeSlot.EVENING];
          delete slots[TimeSlot.EVENING];
          adjustSetsForRemoval(old.placeId);
          warnings.push(
            `第 ${dayData.day} 天疲劳分 ${fatigueResult.score.toFixed(1)} 超过限制 ${maxFatigue}（强度=${options?.intensity || 'balanced'}），已移除 evening 降低疲劳`,
          );
          return true;
        }

        // 无 evening 可移除：仅警告并退出（避免暴力删除必需槽位）
        warnings.push(
          `第 ${dayData.day} 天疲劳分 ${fatigueResult.score.toFixed(1)} 超过限制 ${maxFatigue}（强度=${options?.intensity || 'balanced'}），但无可移除的 evening 槽位`,
        );
        return false;
      };

      const tryRepairPacingOnce = (): boolean => {
        slotMap = buildSlotMap();
        const pacingViolations = this.pacingEngine.check(slotMap, candidates);
        if (!pacingViolations.length) return false;

        // 只修复第一条 violation（迭代循环会继续处理后续）
        const pv = pacingViolations[0];
        const slot = pv.slot as TimeSlot;
        const cur = slots[slot];
        if (!cur) return false;

        // 计算该 slot 之前的活动类型，用 shouldAvoidForPacing 做过滤
        const activityOrder: TimeSlot[] = [TimeSlot.MORNING, TimeSlot.AFTERNOON, TimeSlot.EVENING];
        const previousTypes: Array<{ isMuseum: boolean; isAttraction: boolean }> = [];
        for (const s of activityOrder) {
          if (s === slot) break;
          const pid = slots[s]?.placeId;
          if (!pid) continue;
          const c = candidates.find((x) => x.id === pid);
          if (!c) continue;
          previousTypes.push({ isMuseum: this.pacingEngine.isMuseum(c), isAttraction: this.pacingEngine.isAttraction(c) });
        }

        const replacement = pickReplacement({
          slot,
          candidates,
          dayPlaceIds,
          dayRestaurantIds,
          globalPlaceIds,
          extraFilter: (c) => !this.pacingEngine.shouldAvoidForPacing(slot, c, previousTypes),
          date: dayData.date,
          auditContext: {
            slot: String(slot),
            trigger: 'PACING_REPAIR',
            reasonCodeIfUnresolvable: 'PACING_VIOLATION_UNRESOLVABLE',
          },
        });
        if (!replacement) {
          warnings.push(`第 ${dayData.day} 天 ${pv.slot} 时段节奏违规（${pv.message}），且无可用替代`);
          return false;
        }

        const oldId = cur.placeId;
        adjustSetsForRemoval(oldId);
        adjustSetsForAdd(replacement.selected.id);
        cur.placeId = replacement.selected.id;
        cur.reason = (cur.reason || '') + ' [节奏修复]';
        (cur.evidence as any) = { ...(cur.evidence as any), decisionTrace: { ...(cur.evidence as any)?.decisionTrace, replacementTopK: replacement.topK } };
        warnings.push(`第 ${dayData.day} 天 ${pv.slot} 时段节奏违规（${pv.message}），替换 ${oldId}→${replacement.selected.id}`);
        return true;
      };

      for (let iter = 0; iter < MAX_REPAIR_ITERS; iter++) {
        const didDistance = tryRepairDistanceOnce();
        const didFatigue = tryRepairFatigueOnce();
        const didPacing = tryRepairPacingOnce();
        if (!didDistance && !didFatigue && !didPacing) break;
      }
      
      // 🆕 检查去重后某天是否缺少行程项，如果缺少则尝试填充
      const slotCount = Object.keys(slots).length;
      if (slotCount < 3) {
        if (options?.sparseRegionProfile?.freezeFillMissingSlots) {
          warnings.push(
            `第 ${dayData.day} 天 SPARSE_REGION：保留 intentional slack（${slotCount} 项），跳过 fillMissingSlots`,
          );
        } else {
        warnings.push(`第 ${dayData.day} 天去重后只有 ${slotCount} 个行程项，尝试从候选列表填充`);
        await this.fillMissingSlots(dayData, slots, candidates, dayPlaceIds, dayRestaurantIds, globalPlaceIds, warnings, tz, options?.sparseRegionProfile);
        }
      }

      // 🆕 Sleep Anchor（20:00 后分级 + 22:00-07:00 禁行区）
      // - evening(20-22) 作为 Optional：仅保留夜间友好项；否则优先降级为“回酒店休息”，再不行则移除
      // - 22:00-07:00 为 No-Fly Zone：本引擎不应生成该窗口内项目（动态时间轴会再做硬钳制/熔断）
      {
        const nightStart = DateTime.fromISO(dayData.date, { zone: tz }).set({ hour: 20, minute: 0, second: 0, millisecond: 0 });
        const nightEnd = DateTime.fromISO(dayData.date, { zone: tz }).set({ hour: 22, minute: 0, second: 0, millisecond: 0 });
        const isNightFriendly = (c: CandidatePlace): boolean => {
          if (!c) return false;
          // 餐饮/住宿/温泉/夜景/极光等；避免普通“白天景点”在夜间硬塞
          if (c.category === 'RESTAURANT' || c.category === 'HOTEL') return true;
          const tagText = (c.tags ?? []).join(' ').toLowerCase();
          return (
            tagText.includes('bar') ||
            tagText.includes('pub') ||
            tagText.includes('night') ||
            tagText.includes('aurora') ||
            tagText.includes('hot spring') ||
            tagText.includes('hotspring') ||
            tagText.includes('spa') ||
            tagText.includes('view') ||
            tagText.includes('night_view') ||
            tagText.includes('stargazing')
          );
        };
        const isHighQualityNight = (c: CandidatePlace): boolean => {
          const r = c.rating ?? 0;
          const p = c.popularity ?? 0;
          return r >= 4.2 || p >= 7;
        };
        const bestHotel = candidates
          .filter((c) => c.category === 'HOTEL')
          .filter((c) => this.openingHoursContainWindowTz((c as any).openingHours, dayData.date, nightStart, nightEnd, tz))
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0))[0];

        // evening gate/repair
        const ev = slots[TimeSlot.EVENING];
        if (ev) {
          const c = candidates.find((x) => x.id === ev.placeId);
          const okHours = c ? this.openingHoursContainWindowTz((c as any).openingHours, dayData.date, nightStart, nightEnd, tz) : true;
          const okType = c ? isNightFriendly(c) : true;
          const okQuality = c ? isHighQualityNight(c) : true;
          if (!c || !okHours || !okType || !okQuality) {
            // 1) try replace with night-friendly, opening-hours-fit and high-quality
            const choice = pickReplacement({
              slot: TimeSlot.EVENING,
              candidates,
              dayPlaceIds,
              dayRestaurantIds,
              globalPlaceIds,
              date: dayData.date,
              visitWindow: { start: nightStart, end: nightEnd },
              extraFilter: (x) => isNightFriendly(x) && isHighQualityNight(x),
              auditContext: {
                slot: 'evening',
                trigger: 'SLEEP_ANCHOR_EVENING_GATE',
                reasonCodeIfUnresolvable: 'SLEEP_ANCHOR_EVENING_UNSATISFIABLE',
              },
            });
            if (choice) {
              const oldId = ev.placeId;
              adjustSetsForRemoval(oldId);
              adjustSetsForAdd(choice.selected.id);
              ev.placeId = choice.selected.id;
              ev.reason = (ev.reason || '') + ' [夜间候选修复]';
              (ev.evidence as any) = {
                ...(ev.evidence as any),
                decisionTrace: { ...((ev.evidence as any)?.decisionTrace || {}), replacementTopK: choice.topK },
              };
              warnings.push(`第 ${dayData.day} 天 evening 不满足夜间门控，替换 ${oldId}→${choice.selected.id}`);
            } else if (bestHotel && !dayPlaceIds.has(bestHotel.id)) {
              // 2) degrade to hotel (Back to Hotel)
              const oldId = ev.placeId;
              adjustSetsForRemoval(oldId);
              adjustSetsForAdd(bestHotel.id);
              ev.placeId = bestHotel.id;
              ev.reason = '回酒店休息 [Sleep Anchor]';
              (ev.evidence as any) = {
                ...(ev.evidence as any),
                decisionTrace: {
                  ...((ev.evidence as any)?.decisionTrace || {}),
                  relaxation_event: { type: 'SLEEP_ANCHOR_DEGRADE_TO_HOTEL', reason: 'EVENING_GATE_FAILED' },
                },
              };
              warnings.push(`第 ${dayData.day} 天 evening 不满足夜间门控，已降级为回酒店（${bestHotel.id}）`);
            } else {
              // 3) drop evening (optional)
              const oldId = ev.placeId;
              delete slots[TimeSlot.EVENING];
              adjustSetsForRemoval(oldId);
              warnings.push(`第 ${dayData.day} 天 evening 不满足夜间门控且无酒店可回，已移除（Optional 熔断）`);
            }
          }
        } else {
          // if no evening slot, add an explicit Back-to-Hotel anchor when possible (for fatigue/time accounting)
          if (bestHotel && !dayPlaceIds.has(bestHotel.id)) {
            slots[TimeSlot.EVENING] = {
              placeId: bestHotel.id,
              slot: TimeSlot.EVENING,
              startTime: nightStart.toISO() || new Date().toISOString(),
              endTime: nightEnd.toISO() || new Date().toISOString(),
              reason: '回酒店休息 [Sleep Anchor]',
              evidence: {
                ...this.buildOpeningHoursEvidence(
                  (bestHotel as any).openingHours,
                  dayData.date,
                  'evening',
                  { start: '20:00', end: '22:00' },
                  tz,
                ),
                rating: bestHotel.rating,
                source: 'database',
                decisionTrace: { relaxation_event: { type: 'SLEEP_ANCHOR_ADD_BACK_TO_HOTEL', reason: 'EXPLICIT_END_ACTION' } },
              } as any,
            };
            adjustSetsForAdd(bestHotel.id);
          }
        }
      }

      // 必需槽位硬约束：lunch/dinner 缺失直接记为 hard failure
      if (!slots[TimeSlot.LUNCH]) options?.audit?.failureReasonCodes?.add('MISSING_REQUIRED_SLOT_LUNCH');
      if (!slots[TimeSlot.DINNER]) options?.audit?.failureReasonCodes?.add('MISSING_REQUIRED_SLOT_DINNER');

      // 🆕 动态时间轴：按「停留时长 + 交通耗时 + buffer」生成 start/end（保留午/晚餐锚点）
      {
        const slotOrder: TimeSlot[] = [
          TimeSlot.MORNING,
          TimeSlot.LUNCH,
          TimeSlot.AFTERNOON,
          TimeSlot.DINNER,
          TimeSlot.EVENING,
        ];
        const anchorStartMinutes: Record<TimeSlot, number> = {
          // 🆕 早起硬约束：Morning 最早 08:30（洗漱+早餐 buffer）
          [TimeSlot.MORNING]: 8 * 60 + 30,
          [TimeSlot.LUNCH]: 12 * 60,
          [TimeSlot.AFTERNOON]: 13 * 60 + 30,
          [TimeSlot.DINNER]: 18 * 60,
          [TimeSlot.EVENING]: 20 * 60,
        } as any;
        const bufferMin = 15;
        const speedKmh =
          options?.transport === 'car' ? 60 : options?.transport === 'transit' ? 25 : 4;

        const map = new Map(candidates.map((c) => [c.id, c]));
        const baseDurationMin = (c: CandidatePlace, slot: TimeSlot): number => {
          if (c.category === 'RESTAURANT') {
            const tags = (c.tags ?? []).join(' ').toLowerCase();
            if (tags.includes('fine') || tags.includes('michelin')) return 120;
            return 90;
          }
          if (this.pacingEngine.isMuseum(c)) return 150; // 120-180 的中位数
          if (c.category === 'PARK') return 90;
          if (c.category === 'SHOPPING') return 120;
          if (c.category === 'ATTRACTION' || c.category === 'TRANSIT_HUB') return 75;
          // fallback
          return slot === TimeSlot.EVENING ? 60 : 90;
        };
        const minSafeDurationMin = (c: CandidatePlace, slot: TimeSlot): number => {
          // MinSafe：物理可行性底线（硬约束）
          if (c.category === 'RESTAURANT') return 60;
          if (this.pacingEngine.isMuseum(c)) return 60;
          if (c.category === 'PARK') return 45;
          if (c.category === 'SHOPPING') return 60;
          if (c.category === 'ATTRACTION' || c.category === 'TRANSIT_HUB') return 30;
          return slot === TimeSlot.EVENING ? 30 : 45;
        };
        const categoryWeight = (c: CandidatePlace): number => {
          // 压缩成本权重：博物馆 > 景点 > 公园/购物
          if (this.pacingEngine.isMuseum(c)) return 2.0;
          if (c.category === 'ATTRACTION' || c.category === 'TRANSIT_HUB') return 1.4;
          if (c.category === 'SHOPPING') return 1.2;
          if (c.category === 'PARK') return 1.0;
          if (c.category === 'RESTAURANT') return 1.3;
          return 1.0;
        };
        const computePreferredDurationMin = (rawMin: number, c: CandidatePlace): number => {
          let m = rawMin;
          // 节奏/强度偏好（用 intensity 近似 pace）
          if (options?.intensity === 'relaxed') m = m * 1.2;
          else if (options?.intensity === 'intense') m = m * 0.8;
          // 热度修正：极高热度 + 拥挤排队
          const pop = c.popularity ?? 0;
          if (pop >= 9) m = m * 1.3;
          else if (pop >= 8) m = m * 1.15;
          // 四舍五入到 5 分钟颗粒
          m = Math.round(m / 5) * 5;
          return Math.max(15, Math.min(240, m));
        };
        const adjustDurationMin = (preferredMin: number, c: CandidatePlace, slot: TimeSlot, currentMin: number): number => {
          let m = preferredMin;
          // 时间挤压：如果已经明显晚于锚点，压缩（显式松弛因子由外层统一记录）
          const anchor = anchorStartMinutes[slot] ?? currentMin;
          const squeeze = currentMin - anchor;
          if (squeeze > 60 && c.category !== 'RESTAURANT') {
            m = m * 0.8;
          }
          // 下限/上限
          const min = minSafeDurationMin(c, slot);
          const max = c.category === 'RESTAURANT' ? 150 : 240;
          m = Math.max(min, Math.min(max, Math.round(m / 5) * 5));
          return m;
        };
        const travelTimeMin = (from: CandidatePlace, to: CandidatePlace): number => {
          const km = haversineKm(from.lat, from.lng, to.lat, to.lng);
          const h = Math.min(km / speedKmh, 4);
          return Math.max(0, Math.round(h * 60));
        };

        let currentMin = 8 * 60 + 30;
        let prevCandidate: CandidatePlace | null = null;
        let totalCompressedMin = 0;

        const severityForCompression = (compressedMin: number, minSafe: number, preferred: number): 'NONE' | 'MINOR' | 'MODERATE' | 'HEAVY' => {
          if (compressedMin <= 0) return 'NONE';
          const ratio = preferred > 0 ? compressedMin / preferred : 1;
          if (compressedMin >= 60 || ratio >= 0.35) return 'HEAVY';
          if (compressedMin >= 30 || ratio >= 0.2) return 'MODERATE';
          return 'MINOR';
        };

        const tryReplaceForTimeFeasibility = (
          slot: TimeSlot,
          nearPlaceId: number | undefined,
          currentMin: number,
          nextAnchorMin: number | undefined,
        ): CandidatePlace | null => {
          // 当压缩会低于 MinSafe 时，禁止悄悄压缩：尝试换点（同类型/近邻优先）
          const choice = pickReplacement({
            slot,
            candidates,
            dayPlaceIds,
            dayRestaurantIds,
            globalPlaceIds,
            nearPlaceId,
            date: dayData.date,
            timeContext: {
              currentMin,
              nextAnchorMin,
              intensity: options?.intensity,
            },
            auditContext: {
              slot: String(slot),
              trigger: 'TIME_FEASIBILITY_SWAP',
              reasonCodeIfUnresolvable: 'TIME_FEASIBILITY_UNRESOLVABLE',
            },
          });
          if (!choice) return null;
          // 记录 TopK 供审计
          return { ...(choice.selected as any), __replacementTopK: choice.topK } as any;
        };

        for (const slot of slotOrder) {
          const item = slots[slot];
          if (!item) continue;
          let c = map.get(item.placeId);
          if (!c) continue;

          // 交通耗时 + buffer
          if (prevCandidate) {
            const tMin = travelTimeMin(prevCandidate, c);
            currentMin += tMin + bufferMin;
            // 记录到 evidence 里，便于前端解释
            item.evidence = {
              ...(item.evidence as any),
              travelFromPrevMin: tMin,
              bufferMin,
            };
          }

          // 锚点：午/晚餐不早于固定时间；其他 slot 也有最早开始时间
          currentMin = Math.max(currentMin, anchorStartMinutes[slot] ?? currentMin);

          const rawStay = baseDurationMin(c, slot);
          const preferredStayMin = computePreferredDurationMin(rawStay, c);
          const minSafeMin = minSafeDurationMin(c, slot);

          // 根据锚点挤压对 preferred 做一次“建议压缩”（仍将压缩作为显式松弛记录）
          let stayMinCandidate = adjustDurationMin(preferredStayMin, c, slot, currentMin);

          // 若 stayMinCandidate 会低于 MinSafe，则该点在当前时间线下不可行 → 触发换点
          if (stayMinCandidate < minSafeMin) {
            // 使用“下一时段锚点”作为 squeeze 目标（若无下一时段则不估算）
            const nextSlotIdx = slotOrder.indexOf(slot) + 1;
            const nextSlot = nextSlotIdx > 0 && nextSlotIdx < slotOrder.length ? slotOrder[nextSlotIdx] : undefined;
            const nextAnchorMin = nextSlot ? anchorStartMinutes[nextSlot] : undefined;
            const replacement = tryReplaceForTimeFeasibility(slot, prevCandidate?.id, currentMin, nextAnchorMin);
            if (replacement) {
              warnings.push(
                `第 ${dayData.day} 天 ${slot} 时段因停留时间压缩将低于 MinSafe，替换 ${c.id}→${replacement.id}`,
              );
              // 更新 sets（相当于“换点修复”）
              const oldId = c.id;
              adjustSetsForRemoval(oldId);
              adjustSetsForAdd(replacement.id);
              item.placeId = replacement.id;
              item.reason = (item.reason || '') + ' [时间可行性换点]';
              c = replacement;
              map.set(replacement.id, replacement);
              // 重算该点的 stay
              const raw2 = baseDurationMin(c, slot);
              const preferred2 = computePreferredDurationMin(raw2, c);
              const min2 = minSafeDurationMin(c, slot);
              stayMinCandidate = Math.max(min2, adjustDurationMin(preferred2, c, slot, currentMin));
              (item.evidence as any) = {
                ...(item.evidence as any),
                timeFeasibilitySwap: { fromPlaceId: oldId, toPlaceId: replacement.id },
                decisionTrace: {
                  ...((item.evidence as any)?.decisionTrace || {}),
                  replacementTopK: (replacement as any).__replacementTopK,
                },
              };
            } else {
              // 无替代：熔断为 MinSafe（但要显式标注为 HEAVY relaxation）
              warnings.push(
                `第 ${dayData.day} 天 ${slot} 时段停留时长在时间挤压下不可行（将低于 MinSafe），无可替代点，已强制钳制到 MinSafe 并标注松弛`,
              );
              stayMinCandidate = minSafeMin;
            }
          }

          const finalStayMin = Math.max(minSafeMin, stayMinCandidate);
          const compressedMin = Math.max(0, preferredStayMin - finalStayMin);
          totalCompressedMin += compressedMin;

          const start = DateTime.fromISO(dayData.date, { zone: tz }).startOf('day').plus({ minutes: currentMin });
          const end = start.plus({ minutes: finalStayMin });
          // 🆕 禁行区硬 Gate：22:00-07:00 不允许落点；对 evening 优先熔断移除（Optional）
          const endMin = end.hour * 60 + end.minute;
          if (endMin > 22 * 60 && slot === TimeSlot.EVENING) {
            // remove evening instead of forcing impossible night travel
            const oldId = item.placeId;
            delete slots[TimeSlot.EVENING];
            adjustSetsForRemoval(oldId);
            warnings.push(`第 ${dayData.day} 天 evening 计算后会超过 22:00（Sleep Window），已移除（Optional 熔断）`);
            break;
          }
          item.startTime = start.toISO() || item.startTime;
          item.endTime = end.toISO() || item.endTime;
          const prevDecisionTrace = (item.evidence as any)?.decisionTrace || {};
          item.evidence = {
            ...(item.evidence as any),
            baseStayMin: rawStay,
            preferredStayMin,
            minSafeMin,
            finalStayMin,
            compressedMin,
            decisionTrace: {
              ...prevDecisionTrace,
              slot,
              decision: compressedMin > 0 ? 'COMPRESS_DURATION' : 'KEEP_DURATION',
              relaxation_event:
                compressedMin > 0
                  ? {
                      type: 'TIME_COMPRESSION',
                      preferred_min: preferredStayMin,
                      min_safe_min: minSafeMin,
                      final_min: finalStayMin,
                      compressed_min: compressedMin,
                      reason: currentMin - (anchorStartMinutes[slot] ?? currentMin) > 60
                        ? 'TIME_WINDOW_SQUEEZE'
                        : 'GENERAL',
                      severity: severityForCompression(compressedMin, minSafeMin, preferredStayMin),
                    }
                  : undefined,
              score_breakdown:
                compressedMin > 0
                  ? {
                      // 统一目标函数：把“时间压缩”显式记为 cost，并纳入 total（负向）
                      timeCompressionCost: -1 * (compressedMin / 60) * categoryWeight(c),
                      total: -1 * (compressedMin / 60) * categoryWeight(c),
                    }
                  : undefined,
            },
          };

          currentMin += finalStayMin;
          prevCandidate = c;
        }

        if (totalCompressedMin >= 120) {
          warnings.push(`第 ${dayData.day} 天累计停留时间压缩 ${totalCompressedMin} 分钟，属于重度松弛（HEAVY_RELAXATION）`);
        } else if (totalCompressedMin >= 60) {
          warnings.push(`第 ${dayData.day} 天累计停留时间压缩 ${totalCompressedMin} 分钟，属于中度松弛（MODERATE_RELAXATION）`);
        }
      }

      validatedDays.push({
        day: dayData.day,
        date: dayData.date,
        slots,
      });
    }

    return validatedDays;
  }

  /**
   * 🆕 填充缺失的时段（去重后某天行程项不足时调用）
   */
  private async fillMissingSlots(
    dayData: { day: number; date: string },
    slots: DraftDaySlots,
    candidates: CandidatePlace[],
    dayPlaceIds: Set<number>,
    dayRestaurantIds: Set<number>,
    globalPlaceIds: Map<number, number>,
    warnings: string[],
    timezone?: string,
    sparseRegionProfile?: SparseRegionProfile | null,
  ): Promise<void> {
    const tz = timezone || 'UTC';
    const requiredSlots: TimeSlot[] = [TimeSlot.MORNING, TimeSlot.LUNCH, TimeSlot.AFTERNOON, TimeSlot.DINNER];
    const missingSlots = requiredSlots.filter(slot => !slots[slot]);

    if (missingSlots.length === 0) return;

    const isFoodAndBeverage = (c: CandidatePlace): boolean => {
      if (c.category === 'RESTAURANT') return true;
      const ct = String((c as any).canonicalType ?? '').toUpperCase();
      if (ct.includes('CAFE') || ct.includes('COFFEE') || ct.includes('BAR')) return true;
      const tags = Array.isArray((c as any).tags) ? ((c as any).tags as string[]) : [];
      const t = tags.join(' ').toLowerCase();
      return t.includes('cafe') || t.includes('coffee') || t.includes('咖啡') || t.includes('bar');
    };
    const repetitionLimitFor = (c: CandidatePlace): number => (isFoodAndBeverage(c) ? 1 : 2);

    for (const slot of missingSlots) {
      const isMealSlot = slot === TimeSlot.LUNCH || slot === TimeSlot.DINNER;
      
      // 过滤候选：排除已使用的，优先选择餐厅（如果是用餐时段）
      const filteredCandidates = candidates.filter(c => {
        if (dayPlaceIds.has(c.id)) return false; // 排除已使用的
        const globalCount = globalPlaceIds.get(c.id) || 0;
        const repLimit = repetitionLimitFor(c);
        if (globalCount >= repLimit) return false; // 🆕 按类别重复上限：F&B=1，其它=2
        
        // 用餐时段优先选择餐厅
        if (isMealSlot) {
          if (c.category === 'RESTAURANT') {
            // 检查餐厅是否已使用（除非只有一家）
            if (dayRestaurantIds.has(c.id)) {
              const restaurantCandidates = candidates.filter(c => c.category === 'RESTAURANT');
              return restaurantCandidates.length === 1; // 只有一家时允许重复
            }
            return true;
          }
          return false; // 用餐时段只选择餐厅
        }
        
        // 非用餐时段排除餐厅
        return c.category !== 'RESTAURANT';
      });

      if (filteredCandidates.length === 0) {
        warnings.push(`第 ${dayData.day} 天 ${slot} 时段无法找到合适的候选地点`);
        continue;
      }

      // 按评分和地理位置排序（简化：只按评分）
      filteredCandidates.sort((a, b) => {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
      });

      const bestCandidate = filteredCandidates[0];
      const slotTime = this.SLOT_TIMES[slot];
      const st = this.parseHourToHm(slotTime.start);
      const et = this.parseHourToHm(slotTime.end);
      const startDateTime = DateTime.fromISO(dayData.date, { zone: tz }).set({ hour: st.hour, minute: st.minute, second: 0, millisecond: 0 });
      const endDateTime = DateTime.fromISO(dayData.date, { zone: tz }).set({ hour: et.hour, minute: et.minute, second: 0, millisecond: 0 });

      // 🆕 fillMissingSlots 也必须遵守 openingHours window gate（elastic stub 除外）
      const skipHoursGate =
        sparseRegionProfile?.allowElasticNodes === true && isElasticCandidate(bestCandidate);
      const ok =
        skipHoursGate ||
        this.openingHoursContainWindowTz((bestCandidate as any).openingHours, dayData.date, startDateTime, endDateTime, tz);
      if (!ok) {
        warnings.push(`第 ${dayData.day} 天 ${slot} 时段自动填充候选不覆盖营业时间窗口，已跳过：${bestCandidate.nameCN}`);
        continue;
      }

      slots[slot] = {
        placeId: bestCandidate.id,
        slot: slot,
        startTime: startDateTime.toISO() || new Date().toISOString(),
        endTime: endDateTime.toISO() || new Date().toISOString(),
        reason: `自动填充：${bestCandidate.nameCN}`,
        alternatives: filteredCandidates.slice(1, 4).map(c => c.id),
        evidence: {
          ...this.buildOpeningHoursEvidence(
            bestCandidate.openingHours,
            dayData.date,
            String(slot),
            { start: startDateTime.toFormat('HH:mm'), end: endDateTime.toFormat('HH:mm') },
            tz,
          ),
          rating: bestCandidate.rating,
          source: 'database',
        },
      };

      dayPlaceIds.add(bestCandidate.id);
      globalPlaceIds.set(bestCandidate.id, (globalPlaceIds.get(bestCandidate.id) ?? 0) + 1);
      if (bestCandidate.category === 'RESTAURANT') {
        dayRestaurantIds.add(bestCandidate.id);
      }

      warnings.push(`第 ${dayData.day} 天 ${slot} 时段已自动填充：${bestCandidate.nameCN}`);
    }
  }

  /**
   * 格式化营业时间
   */
  private formatOpeningHours(openingHours: any): string | undefined {
    if (!openingHours) return undefined;
    
    if (typeof openingHours === 'string') {
      return openingHours;
    }

    // 处理结构化格式
    if (openingHours.weekday) {
      return openingHours.weekday;
    }

    return undefined;
  }

  /**
   * 获取指定日期的营业时间
   */
  private getOpeningHoursForDate(openingHours: any, date: string, timezone?: string): string | undefined {
    if (!openingHours) return undefined;

    const dateTime = DateTime.fromISO(date, { zone: timezone || 'UTC' });
    const dayKey = dateTime.toFormat('ccc').toLowerCase(); // 'mon', 'tue', etc.

    if (openingHours[dayKey]) {
      return openingHours[dayKey];
    }

    const isWeekend = dateTime.weekday >= 6;
    return isWeekend ? openingHours.weekend : openingHours.weekday;
  }

  /**
   * 保存草案为行程
   */
  async saveDraftAsTrip(dto: SaveTripDraftDto): Promise<{ id: string; destination: string; startDate: string; endDate: string }> {
    const draft = dto.draft;

    // 提取所有行程项（处理用户编辑）
    const allItems: Array<{ draftItem: DraftItineraryItem; day: number; date: string }> = [];
    
    for (const draftDay of draft.draftDays) {
      // 移除用户删除的项
      const removedItemIds = dto.userEdits?.removedItems || [];
      
      // 添加原有的项（排除被删除的）
      for (const [slotKey, slotValue] of Object.entries(draftDay.slots)) {
        if (!slotValue) continue;
        
        // 简单的 ID 检查（实际应该用更可靠的方式）
        const itemKey = `${draftDay.day}-${slotKey}`;
        if (removedItemIds.includes(itemKey)) continue;
        
        allItems.push({
          draftItem: slotValue,
          day: draftDay.day,
          date: draftDay.date,
        });
      }
    }

    // 添加用户新增的项
    if (dto.userEdits?.addedItems) {
      for (const _addedItem of dto.userEdits.addedItems) {
        // 需要确定日期，这里简化处理
        // 实际应该从 addedItem 中获取或要求用户提供
      }
    }

    // 创建 Trip（需要在 TripsService 中调用）
    // 这里只返回结构，实际创建应该在 Controller 中调用 TripsService.create
    // 然后调用批量创建 ItineraryItem 的方法
    
    throw new Error('Use TripsService.createFromDraft instead');
  }

  /**
   * 从草案批量创建 ItineraryItem
   */
  async createItineraryItemsFromDraft(
    tripId: string,
    draft: TripDraftResponseDto,
    userEdits?: SaveTripDraftDto['userEdits']
  ): Promise<number> {
    // 获取所有 TripDay（按日期）
    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
    });

    // 构建日期到 TripDay 的映射
    const dateToTripDay = new Map<string, string>();
    for (const tripDay of tripDays) {
      const dateStr = DateTime.fromJSDate(tripDay.date).toFormat('yyyy-MM-dd');
      dateToTripDay.set(dateStr, tripDay.id);
    }

    // 提取所有行程项
    const itemsToCreate: Array<{
      tripDayId: string;
      placeId: number | null;
      type: string;
      startTime: Date;
      endTime: Date;
      note: string | null;
    }> = [];

    // 🆕 二次去重检查（兜底）：记录每天已创建的 placeId
    const dailyPlaceIds = new Map<number, Set<number>>(); // day -> Set<placeId>

    for (const draftDay of draft.draftDays) {
      const tripDayId = dateToTripDay.get(draftDay.date);
      if (!tripDayId) {
        this.logger.warn(`找不到日期 ${draftDay.date} 对应的 TripDay`);
        continue;
      }

      const dayPlaceIds = new Set<number>(); // 记录当天已创建的 placeId

      // 处理每个时段
      for (const [slotKey, slotValue] of Object.entries(draftDay.slots)) {
        if (!slotValue) continue;

        // 检查是否被删除
        const itemKey = `${draftDay.day}-${slotKey}`;
        if (userEdits?.removedItems?.includes(itemKey)) continue;

        // 🆕 二次去重检查（兜底）
        if (dayPlaceIds.has(slotValue.placeId)) {
          this.logger.warn(`跳过重复项：第 ${draftDay.day} 天 ${slotKey} 时段，placeId ${slotValue.placeId}`);
          continue;
        }

        dayPlaceIds.add(slotValue.placeId);

        itemsToCreate.push({
          tripDayId,
          placeId: slotValue.placeId,
          type: ItemType.ACTIVITY, // 临时值，后面会更新
          startTime: new Date(slotValue.startTime),
          endTime: new Date(slotValue.endTime),
          note: slotValue.reason || null,
        });
      }

      dailyPlaceIds.set(draftDay.day, dayPlaceIds);
    }

    // 添加用户新增的项
    if (userEdits?.addedItems) {
      for (const _addedItem of userEdits.addedItems) {
        // 需要确定 tripDayId，这里简化处理
        // 实际应该从 addedItem 中获取日期或要求用户提供
      }
    }

    // 批量创建（使用事务）
    // 先批量查询所有 place 的 category（优化性能）
    const placeIds = itemsToCreate.map(item => item.placeId).filter((id): id is number => id !== null);
    const places = placeIds.length > 0
      ? await this.prisma.place.findMany({
          where: { id: { in: placeIds } },
          select: { id: true, category: true },
        })
      : [];
    
    const placeCategoryMap = new Map(places.map(p => [p.id, p.category]));

    // 全程去重（与 validateAndRepair 一致）：餐饮类全程最多 1 次，其它 POI 最多 2 次。
    // 历史上 createItineraryItemsFromDraft 仅按「同一天」去重，跨天同一 morning 槽会重复同一景点（如连续 10 天同一瀑布）。
    const globalPlaceCounts = new Map<number, number>();
    const globalFiltered: typeof itemsToCreate = [];
    for (const item of itemsToCreate) {
      if (item.placeId == null) {
        globalFiltered.push(item);
        continue;
      }
      const cat = placeCategoryMap.get(item.placeId);
      const limit = cat === PlaceCategory.RESTAURANT ? 1 : 2;
      const g = globalPlaceCounts.get(item.placeId) ?? 0;
      if (g >= limit) {
        this.logger.warn(
          `跳过全局重复行程项：placeId=${item.placeId} 已在行程中出现 ${g} 次（上限 ${limit}）`,
        );
        continue;
      }
      globalPlaceCounts.set(item.placeId, g + 1);
      globalFiltered.push(item);
    }
    itemsToCreate.length = 0;
    itemsToCreate.push(...globalFiltered);

    // 🆕 酒店去重：每天最多保留一个住宿项（HOTEL 类别 → REST 类型）
    const filteredItemsToCreate: typeof itemsToCreate = [];
    const hotelAddedPerDay = new Map<string, boolean>();
    for (const item of itemsToCreate) {
      const category = item.placeId ? placeCategoryMap.get(item.placeId) : null;
      if (category === PlaceCategory.HOTEL) {
        const alreadyHasHotel = hotelAddedPerDay.get(item.tripDayId);
        if (alreadyHasHotel) {
          this.logger.warn(`跳过重复酒店：tripDayId=${item.tripDayId}, placeId=${item.placeId}`);
          continue;
        }
        hotelAddedPerDay.set(item.tripDayId, true);
      }
      filteredItemsToCreate.push(item);
    }
    itemsToCreate.length = 0;
    itemsToCreate.push(...filteredItemsToCreate);

    // 更新 itemsToCreate 的 type（根据时段和 place category 确定）
    for (const item of itemsToCreate) {
      // 根据开始时间确定时段
      const itemHour = new Date(item.startTime).getHours();
      let slot: TimeSlot | undefined;
      if (itemHour >= 9 && itemHour < 12) slot = TimeSlot.MORNING;
      else if (itemHour >= 12 && itemHour < 14) slot = TimeSlot.LUNCH;
      else if (itemHour >= 14 && itemHour < 18) slot = TimeSlot.AFTERNOON;
      else if (itemHour >= 18 && itemHour < 20) slot = TimeSlot.DINNER;
      else if (itemHour >= 20 && itemHour < 22) slot = TimeSlot.EVENING;

      if (slot === TimeSlot.LUNCH || slot === TimeSlot.DINNER) {
        // 用餐时段
        if (item.placeId) {
          const category = placeCategoryMap.get(item.placeId);
          // 如果是 RESTAURANT 类别，使用 MEAL_ANCHOR（需要订位）
          if (category === PlaceCategory.RESTAURANT) {
            item.type = ItemType.MEAL_ANCHOR;
          } else {
            item.type = ItemType.MEAL_FLOATING;
          }
        } else {
          item.type = ItemType.MEAL_FLOATING;
        }
      } else {
        // 其他时段都是活动
        item.type = ItemType.ACTIVITY;
      }
    }

    if (itemsToCreate.length > 0) {
      // 🆕 按 tripDayId 分组，为每个 day 的 items 设置递增的 order
      const itemsByDay = new Map<string, typeof itemsToCreate>();
      for (const item of itemsToCreate) {
        if (!itemsByDay.has(item.tripDayId)) {
          itemsByDay.set(item.tripDayId, []);
        }
        itemsByDay.get(item.tripDayId)!.push(item);
      }

      await this.prisma.$transaction(async (tx) => {
        for (const [tripDayId, dayItems] of itemsByDay.entries()) {
          // 查询当天最大的 order 值
          const maxOrderItem = await tx.itineraryItem.findFirst({
            where: { tripDayId },
            orderBy: { order: 'desc' },
            select: { order: true },
          });
          const baseOrder = maxOrderItem?.order !== null && maxOrderItem?.order !== undefined 
            ? maxOrderItem.order + 1 
            : 1;

          // 按 startTime 排序，确保顺序正确
          dayItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

          // 创建 items，设置递增的 order
          for (let i = 0; i < dayItems.length; i++) {
            const item = dayItems[i];
            await tx.itineraryItem.create({
              data: {
                id: randomUUID(),
                tripDayId: item.tripDayId,
                placeId: item.placeId,
                type: item.type as any,
                startTime: item.startTime,
                endTime: item.endTime,
                note: item.note,
                order: baseOrder + i, // 🆕 设置显示顺序
              } as any,
            });
          }
        }
      });
    }

    return itemsToCreate.length;
  }


  /**
   * 替换单个行程项（Neptune 修复）
   */
  async replaceItem(
    tripId: string,
    itemId: string,
    dto: ReplaceItineraryItemDto
  ): Promise<ReplaceItineraryItemResponseDto> {
    // 获取当前 item 信息
    const currentItem = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: {
        Place: {
          include: {
            City: true,
          },
        },
        TripDay: {
          include: {
            Trip: true,
          },
        },
      },
    });

    if (!currentItem || currentItem.TripDay.tripId !== tripId) {
      throw new NotFoundException(`找不到指定的行程项 (ID: ${itemId})`);
    }

    if (!currentItem.Place) {
      throw new NotFoundException('当前行程项关联的地点不存在');
    }

    if (!currentItem.startTime) {
      throw new BadRequestException('当前行程项的开始时间信息不完整');
    }

    // 确定时段（根据时间推断）
    const timezone = this.timezoneForDestination(currentItem.TripDay.Trip.destination);
    const startTime = DateTime.fromJSDate(currentItem.startTime, { zone: timezone });
    const hour = startTime.hour;
    let slot: TimeSlot;
    if (hour >= 9 && hour < 12) slot = TimeSlot.MORNING;
    else if (hour >= 12 && hour < 14) slot = TimeSlot.LUNCH;
    else if (hour >= 14 && hour < 18) slot = TimeSlot.AFTERNOON;
    else if (hour >= 18 && hour < 20) slot = TimeSlot.DINNER;
    else slot = TimeSlot.EVENING;

    // 获取当前地点所在的城市信息
    const currentCity = currentItem.Place.City;
    const currentCityId = currentCity?.id;
    const currentCityName = currentCity?.nameCN || currentCity?.nameEN || '未知城市';
    const countryCode = currentItem.TripDay.Trip.destination;

    this.logger.log(`替换行程项：当前地点位于 ${currentCityName} (城市ID: ${currentCityId})`);

    // 根据 reason 构建检索条件
    const constraints: any = {};
    
    if (dto.reason === 'too_tired') {
      // 找更轻松的地点
      constraints.maxDuration = 60; // 最多1小时
    } else if (dto.reason === 'too_far') {
      constraints.maxDistance = dto.constraints?.maxDistance ?? 50000; // 默认 50km（米）
    } else if (dto.reason === 'change_style' && dto.preferredStyle) {
      // 根据新风格检索
    }

    // 距离太远时：获取 route anchor（前后行程项的中点），用于过滤和排序
    let routeAnchor: { lat: number; lng: number } | null = null;
    if (dto.reason === 'too_far') {
      routeAnchor = await this.getRouteAnchorForItem(currentItem.tripDayId, itemId);
    }

    // 检索候选：优先同城市，如果不够再扩展到同国家
    let candidates: CandidatePlace[] = [];
    let sameCityCount = 0;
    let sameCityIds = new Set<number>();
    
    if (currentCityId) {
      // 首先尝试在同城市内查找
      const sameCityCandidates = await this.retrieveCandidatesByCity(
        currentCityId,
        countryCode,
        dto.preferredStyle,
        dto.constraints
      );
      
      sameCityCount = sameCityCandidates.length;
      candidates = sameCityCandidates;
      sameCityIds = new Set(sameCityCandidates.map(c => c.id));
      
      this.logger.log(`同城市候选数量: ${sameCityCount}`);
    }
    
    // 如果同城市候选不足（少于5个），扩展到同国家
    if (candidates.length < 5) {
      this.logger.log(`同城市候选不足，扩展到同国家检索`);
      const countryCandidates = await this.candidateEngine.retrieve({
        destination: countryCode,
        days: 1,
        style: dto.preferredStyle,
      });
      
      // 过滤出其他城市的候选（排除同城市的）
      const otherCityCandidates = countryCandidates.filter(c => 
        !sameCityIds.has(c.id)
      );
      
      // 合并：同城市在前，其他城市在后
      candidates = [...candidates, ...otherCityCandidates];
      
      this.logger.log(`合并后候选数量: ${candidates.length} (同城市: ${sameCityCount}, 其他城市: ${otherCityCandidates.length})`);
    }

    // 获取当日行程中已有的 placeId，排除重复
    const existingPlaceIds = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: currentItem.tripDayId },
      select: { placeId: true },
    }).then(items => new Set(items.map(i => i.placeId).filter((id): id is number => id != null)));

    // 过滤候选：同类型 + 排除当前地点 + 排除当日已有
    const originalCategory = currentItem.Place.category;
    let filteredCandidates = candidates.filter(
      c =>
        c.category === originalCategory &&
        c.id !== currentItem.placeId &&
        !existingPlaceIds.has(c.id)
    );

    // 距离太远时：仅保留在 route anchor 附近（maxDistance 米内）的候选，并按距离排序
    if (dto.reason === 'too_far' && routeAnchor && constraints.maxDistance) {
      const maxDistM = constraints.maxDistance;
      filteredCandidates = filteredCandidates
        .map(c => ({
          ...c,
          _distToRoute: this.haversineMeters(routeAnchor!.lat, routeAnchor!.lng, c.lat, c.lng),
        }))
        .filter(c => c._distToRoute <= maxDistM)
        .sort((a, b) => a._distToRoute - b._distToRoute);
      this.logger.log(`距离太远：过滤后候选 ${filteredCandidates.length} 个（距路线 ${maxDistM / 1000}km 内）`);
    }

    if (filteredCandidates.length === 0) {
      throw new NotFoundException(
        dto.reason === 'too_far'
          ? '附近没有找到同类型的更近替代地点，可尝试放宽距离限制'
          : `找不到同类型（${originalCategory}）的替代地点`
      );
    }

    // 排序：距离太远时已按距离排；否则优先同城市，然后按评分排序
    const sortedCandidates =
      dto.reason === 'too_far' && routeAnchor
        ? filteredCandidates
        : filteredCandidates.sort((a, b) => {
            const aIsSameCity = sameCityIds.has(a.id);
            const bIsSameCity = sameCityIds.has(b.id);
            if (aIsSameCity && !bIsSameCity) return -1;
            if (!aIsSameCity && bIsSameCity) return 1;
            return (b.rating || 0) - (a.rating || 0);
          });

    // 使用 LLM 选择最佳替换
    // 简化处理：选择排序后的第一个（优先同城市且评分最高）
    const bestCandidate = sortedCandidates[0];

    // 构建新 item
    if (!currentItem.startTime || !currentItem.endTime) {
      throw new BadRequestException('当前行程项的时间信息不完整');
    }

    const newItem: DraftItineraryItem = {
      placeId: bestCandidate.id,
      slot: slot,
      startTime: currentItem.startTime.toISOString(),
      endTime: currentItem.endTime.toISOString(),
      reason: `替代原地点：${dto.reason}`,
      alternatives: filteredCandidates.slice(1, 4).map(c => c.id),
      evidence: {
        ...this.buildOpeningHoursEvidence(
          (bestCandidate as any).openingHours,
          DateTime.fromJSDate((currentItem.TripDay as any)?.date ?? currentItem.startTime).toFormat('yyyy-MM-dd'),
          `${slot}`,
          {
            start: DateTime.fromJSDate(currentItem.startTime, { zone: timezone }).toFormat('HH:mm'),
            end: DateTime.fromJSDate(currentItem.endTime ?? currentItem.startTime, { zone: timezone }).toFormat('HH:mm'),
          },
          timezone,
        ),
        rating: bestCandidate.rating,
        source: 'database',
      },
    };

    return {
      newItem,
      alternatives: filteredCandidates.slice(0, 5).map(c => ({
        placeId: c.id,
        placeName: c.nameEN || c.nameCN,
        reason: `评分 ${c.rating || 'N/A'}`,
        score: (c.rating || 0) * 2,
      })),
      replacedItem: {
        placeId: currentItem.placeId || 0,
        reason: dto.reason,
      },
    };
  }

  /**
   * 重生成行程
   */
  async regenerateTrip(
    tripId: string,
    dto: RegenerateTripDto
  ): Promise<RegenerateTripResponseDto> {
    // 获取当前 trip 信息
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
              },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`找不到指定的行程 (ID: ${tripId})`);
    }

    // 构建新的生成参数
    const days = trip.TripDay.length;
    const startDate = DateTime.fromJSDate(trip.startDate).toFormat('yyyy-MM-dd');
    const endDate = DateTime.fromJSDate(trip.endDate).toFormat('yyyy-MM-dd');

    // 重新生成草案
    const newDraft = await this.generateDraft(
      {
        destination: trip.destination,
        days,
        startDate,
        endDate,
        style: dto.newPreferences?.style,
        intensity: dto.newPreferences?.intensity,
        transport: dto.newPreferences?.transport,
        constraints: dto.newPreferences?.constraints,
      },
      undefined,
      undefined,
      { tripId, mode: 'RUNTIME' },
    );

    // 对比变更（简化处理）
    const changes: RegenerateChangeItem[] = [];
    // TODO: 详细对比新旧行程，生成 changes 列表

    return {
      updatedDraft: newDraft,
      changes,
    };
  }

  /**
   * 提取 JSON（处理可能包含 markdown 代码块标记的情况）
   * 与 llm.service.ts 中的 extractJSON 方法保持一致
   */
  private extractJSON(response: string): any {
    if (!response || typeof response !== 'string') {
      throw new BadRequestException('LLM 返回的响应为空或格式不正确');
    }

    let cleaned = response.trim();
    
    // 移除 markdown 代码块标记（更严格的匹配，支持多行）
    // 匹配开头的 ```json 或 ```（可能后面有换行）
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
    // 匹配结尾的 ```（可能前面有换行）
    cleaned = cleaned.replace(/\n?\s*```$/i, '');
    cleaned = cleaned.trim();
    
    // 尝试提取 JSON 对象（如果响应中包含其他文本）
    // 使用更宽松的匹配，包括可能的多行 JSON
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    // 再次清理可能的空白字符
    cleaned = cleaned.trim();
    
    try {
      return JSON.parse(cleaned);
    } catch (parseError: any) {
      this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
      this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
      this.logger.error(`解析错误详情: ${parseError.message}`);
      throw new BadRequestException(`LLM 返回的 JSON 格式无效: ${parseError.message}`);
    }
  }
}
