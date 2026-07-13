import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { GuardianChooseService } from '../../decision/optimization/services/guardian-choose.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CoverageMapService } from './coverage-map.service';
import { FindingMarksService } from './finding-marks.service';
import { TripReadinessWeatherForecastService } from './trip-readiness-weather-forecast.service';
import { ReadinessDecisionRepairBridgeService } from './readiness-decision-repair-bridge.service';
import { TripPlanPersistenceService } from './trip-plan-persistence.service';
import { ReadinessGuardianNegotiationService } from './readiness-guardian-negotiation.service';
import { ReadinessCausalPreanalysisService } from './readiness-causal-preanalysis.service';
import { READINESS_DECISION_ENGINE_PATH } from '../utils/trip-decision-repair-bridge.util';
import {
  buildGuardianDeferMessage,
  buildGuardianRepairHintsFromSummary,
  buildReadinessDeferredChooseFields,
  shouldDeferRepairByPreNegotiation,
} from '../utils/readiness-guardian-negotiation.util';
import {
  DECISION_ENGINE_REPAIR_ACTIONS,
  isDecisionEngineRepairAction,
} from '../utils/trip-decision-repair-bridge.util';
import type {
  ApplyRepairRequest,
  ApplyRepairResponse,
  AutoRepairRequest,
  PreviewRepairRequest,
  PreviewRepairResponse,
  RefreshEvidenceResponse,
  RepairOption,
  ReadinessGuardianNegotiationSnapshot,
} from '../types/coverage-map.types';
import {
  buildTripPlanItineraryDiff,
  applyStructuralRepairToPlan,
  countTripPlanSlots,
  countTripPlanSlotsForDay,
  itineraryDiffToHighlights,
} from '../utils/trip-plan-repair-preview.util';
import { isRoadClassStructuralRepairOption } from '../../trip-constraint-solver/utils/road-class-repair-options.util';
import { assertFeasibilityRepairAuthority } from '../../trip-constraint-solver/utils/repair-authority.util';
import { isEffectivePlanWriteChainEnabled } from '../../../decision-runtime/execution/effective-plan-write-chain.config';
import { assertPlanMutationAllowedOrThrow } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';

const MARK_NOT_APPLICABLE_ACTIONS = new Set(['manual_confirm', 'mark_resolved']);
const ADD_TO_LATER_ACTIONS = new Set(['ignore']);
const REFRESH_ONLY_ACTIONS = new Set(['refresh']);
const WEATHER_FETCH_ACTIONS = new Set(['fetch_weather']);
const DECISION_ENGINE_ACTIONS = DECISION_ENGINE_REPAIR_ACTIONS;

const IMPACT_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

@Injectable()
export class ReadinessRepairService {
  private readonly logger = new Logger(ReadinessRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coverageMapService: CoverageMapService,
    private readonly findingMarksService: FindingMarksService,
    private readonly weatherForecastService: TripReadinessWeatherForecastService,
    private readonly decisionRepairBridge: ReadinessDecisionRepairBridgeService,
    private readonly tripPlanPersistence: TripPlanPersistenceService,
    private readonly guardianNegotiationService: ReadinessGuardianNegotiationService,
    private readonly causalPreanalysisService: ReadinessCausalPreanalysisService,
    @Optional() private readonly guardianChoose?: GuardianChooseService,
    @Optional() private readonly effectivePlanWriteGuard?: EffectivePlanWriteGuardService,
  ) {}

  async applyRepair(request: ApplyRepairRequest): Promise<ApplyRepairResponse> {
    const { tripId, blockerId, optionId, reason, executeDecision, persistDecision, runGuardianNegotiation, forceDecisionRepair } = request;
    const repairOptions = await this.coverageMapService.getRepairOptions(tripId, blockerId);
    const option = repairOptions.options.find((item) => item.id === optionId);

    if (!option) {
      throw new BadRequestException(
        `选项 ${optionId} 不属于阻塞项 ${blockerId} 的修复列表`,
      );
    }

    const actionType = option.actionType || 'unknown';
    this.logger.debug(`applyRepair trip=${tripId} blocker=${blockerId} action=${actionType}`);

    try {
      assertFeasibilityRepairAuthority(request.repairAuthority ?? 'readiness_prep', option);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    if (!MARK_NOT_APPLICABLE_ACTIONS.has(actionType) && isEffectivePlanWriteChainEnabled()) {
      assertPlanMutationAllowedOrThrow(
        this.effectivePlanWriteGuard,
        'ReadinessRepairService.applyRepair',
      );
    }

    if (MARK_NOT_APPLICABLE_ACTIONS.has(actionType)) {
      await this.findingMarksService.markNotApplicable(tripId, blockerId, {
        reason: reason || option.title,
      });
      const readinessScore = await this.coverageMapService.getReadinessScore(tripId);
      return {
        tripId,
        blockerId,
        optionId,
        actionType,
        status: 'applied',
        message: '已标记为不适用，准备度分数已更新',
        readinessScore,
      };
    }

    if (ADD_TO_LATER_ACTIONS.has(actionType)) {
      await this.findingMarksService.addToLater(tripId, blockerId, {
        note: reason || option.title,
      });
      return {
        tripId,
        blockerId,
        optionId,
        actionType,
        status: 'applied',
        message: '已加入稍后处理列表',
      };
    }

    if (REFRESH_ONLY_ACTIONS.has(actionType)) {
      const readinessScore = await this.coverageMapService.getReadinessScore(tripId);
      return {
        tripId,
        blockerId,
        optionId,
        actionType,
        status: 'applied',
        message: '准备度检查已刷新',
        readinessScore,
      };
    }

    if (WEATHER_FETCH_ACTIONS.has(actionType)) {
      const metadata = await this.fetchWeatherMetadata(tripId);
      const readinessScore = await this.coverageMapService.getReadinessScore(tripId);
      return {
        tripId,
        blockerId,
        optionId,
        actionType,
        status: metadata.available ? 'applied' : 'deferred',
        message: metadata.available
          ? '已获取逐日天气预报并刷新准备度分数'
          : '当前行程窗口暂无可用逐日预报，请临行前再查',
        readinessScore,
        metadata,
      };
    }

    if (isRoadClassStructuralRepairOption(option)) {
      const beforePlan = await this.decisionRepairBridge.loadCurrentTripPlan(tripId);
      const afterPlan = applyStructuralRepairToPlan(beforePlan, {
        actionType,
        payload: (option.payload ?? {}) as Record<string, unknown>,
      });
      const shouldPersist = persistDecision !== false;
      const persistence = shouldPersist
        ? await this.tripPlanPersistence.persistRepairPlan(tripId, afterPlan)
        : undefined;
      const readinessScore = await this.coverageMapService.getReadinessScore(tripId);
      return {
        tripId,
        blockerId,
        optionId,
        actionType,
        status: 'applied',
        message: `已应用拆段方案：${option.title}`,
        readinessScore,
        metadata: {
          structuralRepair: true,
          persisted: Boolean(persistence?.applied),
        },
      };
    }

    if (DECISION_ENGINE_ACTIONS.has(actionType)) {
      if (executeDecision) {
        const negotiationContext = {
          tripId,
          repairActionType: actionType,
          blockerId,
        };
        const shouldRunNegotiation = runGuardianNegotiation !== false;
        let guardianNegotiation: ReadinessGuardianNegotiationSnapshot | undefined;
        let preRepair;

        if (shouldRunNegotiation && this.guardianNegotiationService.isEnabled()) {
          preRepair = await this.guardianNegotiationService.negotiateForTrip(
            tripId,
            'pre_repair',
            negotiationContext,
          );
        }

        if (
          preRepair &&
          !forceDecisionRepair &&
          shouldDeferRepairByPreNegotiation(preRepair)
        ) {
          const guardianNegotiation = { preRepair, latest: preRepair };
          await this.guardianNegotiationService.persistSnapshot(tripId, guardianNegotiation);
          const readinessScore = await this.coverageMapService.getReadinessScore(tripId);
          const deferredChoose = buildReadinessDeferredChooseFields(preRepair);
          await this.persistDeferredChooseContext(tripId, deferredChoose.humanDecisionPointsFlat);
          return {
            tripId,
            blockerId,
            optionId,
            actionType,
            status: 'deferred',
            message: buildGuardianDeferMessage(preRepair),
            readinessScore,
            guardianNegotiation,
            humanDecisionPointsFlat: deferredChoose.humanDecisionPointsFlat,
            presentation: deferredChoose.presentation,
            metadata: {
              suggestedAction: actionType,
              blockerMessage: repairOptions.blockerMessage,
              guardianGate: 'low_consensus_reject',
            },
          };
        }

        const causalPreAnalysis = (repairOptions.causalPreAnalysis ??
          repairOptions.dependencyImpact) ?? undefined;

        if (causalPreAnalysis) {
          await this.causalPreanalysisService.persistResult(tripId, causalPreAnalysis, blockerId);
        }

        const decisionResult = await this.decisionRepairBridge.executeDecisionRepair({
          tripId,
          actionType,
          blockerMessage: repairOptions.blockerMessage,
          guardianRepairHints: buildGuardianRepairHintsFromSummary(preRepair),
          causalPreAnalysis: causalPreAnalysis ?? null,
        });

        const shouldPersist = persistDecision !== false;
        let persistence;
        if (shouldPersist) {
          persistence = await this.tripPlanPersistence.persistRepairPlan(
            tripId,
            decisionResult.plan,
          );
        }

        if (shouldRunNegotiation && this.guardianNegotiationService.isEnabled()) {
          const postRepair = await this.guardianNegotiationService.negotiateForTrip(
            tripId,
            'post_repair',
            negotiationContext,
          );
          guardianNegotiation = {
            preRepair,
            postRepair,
            latest: postRepair ?? preRepair,
          };
          if (guardianNegotiation.latest) {
            await this.guardianNegotiationService.persistSnapshot(tripId, guardianNegotiation);
          }
        }

        const readinessScore = await this.coverageMapService.getReadinessScore(tripId);
        const persisted = Boolean(persistence?.applied);

        return {
          tripId,
          blockerId,
          optionId,
          actionType,
          status: 'applied',
          message: persisted
            ? '已通过决策引擎修复并写回行程'
            : shouldPersist
              ? '已通过决策引擎生成修复计划（行程无结构变化）'
              : '已通过决策引擎生成修复计划（未写回行程）',
          readinessScore,
          decisionPlan: decisionResult.plan as unknown as Record<string, unknown>,
          decisionLog: decisionResult.log as unknown as Record<string, unknown>,
          persisted,
          persistence,
          guardianNegotiation,
          metadata: {
            suggestedAction: actionType,
            blockerMessage: repairOptions.blockerMessage,
            causalPreAnalysis: causalPreAnalysis ?? undefined,
          },
        };
      }

      return {
        tripId,
        blockerId,
        optionId,
        actionType,
        status: 'redirect',
        message: '此修复需调整行程计划，请使用决策引擎修复接口或设置 executeDecision=true',
        redirectUrl: READINESS_DECISION_ENGINE_PATH,
        metadata: {
          suggestedAction: actionType,
          blockerMessage: repairOptions.blockerMessage,
          causalPreAnalysis: repairOptions.causalPreAnalysis ?? repairOptions.dependencyImpact,
        },
      };
    }

    const readinessScore = await this.coverageMapService.getReadinessScore(tripId);
    return {
      tripId,
      blockerId,
      optionId,
      actionType,
      status: 'deferred',
      message: option.description || '请按指引手动完成此修复',
      readinessScore,
    };
  }

  /**
   * P0：与 apply-repair 同决策路径的 dry-run 预览（persistDecision=false，不写库）。
   */
  async previewRepair(request: PreviewRepairRequest): Promise<PreviewRepairResponse> {
    const { tripId, blockerId, optionId, issueId } = request;
    const repairOptions = await this.coverageMapService.getRepairOptions(tripId, blockerId);
    const option = repairOptions.options.find((item) => item.id === optionId);

    if (!option) {
      throw new BadRequestException(
        `选项 ${optionId} 不属于阻塞项 ${blockerId} 的修复列表`,
      );
    }

    const actionType = option.actionType || 'unknown';
    const scoreResponse = await this.coverageMapService.getReadinessScore(tripId);
    const scoreBefore = scoreResponse.score.overall;
    const dayNumber =
      request.affectedDayNumber ??
      this.inferPreviewDayNumber(repairOptions, issueId);

    if (isRoadClassStructuralRepairOption(option)) {
      return this.buildStructuralPlanPreview({
        tripId,
        blockerId,
        issueId,
        optionId,
        actionType,
        option,
        dayNumber,
        scoreBefore,
        blockerMessage: repairOptions.blockerMessage,
      });
    }

    if (!isDecisionEngineRepairAction(actionType)) {
      return this.buildHeuristicPreview({
        tripId,
        blockerId,
        issueId,
        optionId,
        actionType,
        option,
        dayNumber,
        scoreBefore,
        blockerMessage: repairOptions.blockerMessage,
      });
    }

    const beforePlan = await this.decisionRepairBridge.loadCurrentTripPlan(tripId);
    const negotiationContext = { tripId, repairActionType: actionType, blockerId };
    const shouldRunNegotiation = request.runGuardianNegotiation !== false;
    let preRepair;

    if (shouldRunNegotiation && this.guardianNegotiationService.isEnabled()) {
      preRepair = await this.guardianNegotiationService.negotiateForTrip(
        tripId,
        'pre_repair',
        negotiationContext,
      );
    }

    if (
      preRepair &&
      !request.forceDecisionRepair &&
      shouldDeferRepairByPreNegotiation(preRepair)
    ) {
      const deferredChoose = buildReadinessDeferredChooseFields(preRepair);
      await this.persistDeferredChooseContext(tripId, deferredChoose.humanDecisionPointsFlat);
      return {
        tripId,
        blockerId,
        issueId,
        optionId,
        actionType,
        previewMode: 'decision_engine_dry_run',
        status: 'would_defer',
        message: buildGuardianDeferMessage(preRepair),
        wouldDefer: true,
        before: this.buildPreviewDaySnapshot(beforePlan, dayNumber, repairOptions.blockerMessage ? [repairOptions.blockerMessage] : []),
        after: this.buildPreviewDaySnapshot(beforePlan, dayNumber, ['应用时将需您确认后再修复']),
        itineraryDiff: [],
        impact: {
          feasibilityScoreBefore: scoreBefore,
          estimated: true,
        },
        guardianNegotiation: { preRepair, latest: preRepair },
        humanDecisionPointsFlat: deferredChoose.humanDecisionPointsFlat,
        presentation: deferredChoose.presentation,
        option,
      };
    }

    const causalPreAnalysis =
      (repairOptions.causalPreAnalysis ?? repairOptions.dependencyImpact) ?? null;

    const decisionResult = await this.decisionRepairBridge.executeDecisionRepair({
      tripId,
      actionType,
      blockerMessage: repairOptions.blockerMessage,
      guardianRepairHints: buildGuardianRepairHintsFromSummary(preRepair),
      causalPreAnalysis,
    });

    const afterPlan = decisionResult.plan;
    const diff = buildTripPlanItineraryDiff(beforePlan, afterPlan);
    const highlights = itineraryDiffToHighlights(diff);

    return {
      tripId,
      blockerId,
      issueId,
      optionId,
      actionType,
      previewMode: 'decision_engine_dry_run',
      status: 'preview',
      message:
        diff.length > 0
          ? `决策引擎预览：${diff.length} 处行程变更（未写库）`
          : '决策引擎预览：计划结构无变化（未写库）',
      before: this.buildPreviewDaySnapshot(
        beforePlan,
        dayNumber,
        highlights.length ? [] : repairOptions.blockerMessage ? [repairOptions.blockerMessage] : [],
      ),
      after: this.buildPreviewDaySnapshot(
        afterPlan,
        dayNumber,
        highlights.length ? highlights : [option.title],
      ),
      itineraryDiff: diff.map((entry) => ({
        slotId: entry.slotId,
        changeType: entry.changeType,
        dayNumber: entry.dayNumber,
        before: entry.before as unknown as Record<string, unknown>,
        after: entry.after as unknown as Record<string, unknown>,
      })),
      impact: {
        feasibilityScoreBefore: scoreBefore,
        estimated: true,
      },
      guardianNegotiation: preRepair ? { preRepair, latest: preRepair } : undefined,
      decisionPlan: afterPlan as unknown as Record<string, unknown>,
      decisionLog: decisionResult.log as unknown as Record<string, unknown>,
      option,
    };
  }

  async autoRepair(request: AutoRepairRequest): Promise<ApplyRepairResponse> {
    const repairOptions = await this.coverageMapService.getRepairOptions(
      request.tripId,
      request.blockerId,
    );

    if (repairOptions.options.length === 0) {
      throw new BadRequestException(`阻塞项 ${request.blockerId} 没有可用修复选项`);
    }

    const sorted = [...repairOptions.options].sort(
      (a, b) => (IMPACT_RANK[b.impact] || 0) - (IMPACT_RANK[a.impact] || 0),
    );

    const localOption =
      sorted.find((option) => this.isLocallyApplicable(option)) ?? sorted[0];

    return this.applyRepair({
      tripId: request.tripId,
      blockerId: request.blockerId,
      optionId: localOption.id,
      reason: 'auto-repair',
      executeDecision: request.executeDecision,
      persistDecision: request.persistDecision,
      runGuardianNegotiation: request.runGuardianNegotiation,
      forceDecisionRepair: request.forceDecisionRepair,
    });
  }

  async getGuardianNegotiation(
    tripId: string,
  ): Promise<ReadinessGuardianNegotiationSnapshot | null> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }
    const snapshot = await this.guardianNegotiationService.loadSnapshot(tripId);
    return snapshot ?? null;
  }

  async refreshEvidence(tripId: string): Promise<RefreshEvidenceResponse> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const [score, coverageMap] = await Promise.all([
      this.coverageMapService.getReadinessScore(tripId),
      this.coverageMapService.getCoverageMap(tripId),
    ]);

    return {
      tripId,
      score,
      coverageSummary: coverageMap.summary,
      refreshedAt: new Date().toISOString(),
    };
  }

  private isLocallyApplicable(option: RepairOption): boolean {
    const actionType = option.actionType || '';
    return (
      MARK_NOT_APPLICABLE_ACTIONS.has(actionType) ||
      ADD_TO_LATER_ACTIONS.has(actionType) ||
      REFRESH_ONLY_ACTIONS.has(actionType) ||
      WEATHER_FETCH_ACTIONS.has(actionType)
    );
  }

  private inferPreviewDayNumber(
    repairOptions: Awaited<ReturnType<CoverageMapService['getRepairOptions']>>,
    issueId?: string,
  ): number {
    const anchorDay = repairOptions.options[0]?.payload?.anchors as
      | { toDayNumber?: number; fromDayNumber?: number }
      | undefined;
    if (typeof anchorDay?.toDayNumber === 'number') return anchorDay.toDayNumber;
    if (typeof anchorDay?.fromDayNumber === 'number') return anchorDay.fromDayNumber;
    const dayMatch = issueId?.match(/day[-_]?(\d+)/i);
    if (dayMatch) return Number(dayMatch[1]);
    return 1;
  }

  private buildPreviewDaySnapshot(
    plan: import('../../decision/plan-model').TripPlan,
    dayNumber: number,
    highlights: string[],
  ): PreviewRepairResponse['before'] {
    return {
      dayNumber,
      itemCount: countTripPlanSlotsForDay(plan, dayNumber),
      totalItemCount: countTripPlanSlots(plan),
      highlights,
    };
  }

  private async buildStructuralPlanPreview(input: {
    tripId: string;
    blockerId: string;
    issueId?: string;
    optionId: string;
    actionType: string;
    option: RepairOption;
    dayNumber: number;
    scoreBefore: number;
    blockerMessage?: string;
  }): Promise<PreviewRepairResponse> {
    const beforePlan = await this.decisionRepairBridge.loadCurrentTripPlan(input.tripId);
    const afterPlan = applyStructuralRepairToPlan(beforePlan, {
      actionType: input.actionType,
      payload: (input.option.payload ?? {}) as Record<string, unknown>,
    });
    const diff = buildTripPlanItineraryDiff(beforePlan, afterPlan);
    const highlights = itineraryDiffToHighlights(diff);

    return {
      tripId: input.tripId,
      blockerId: input.blockerId,
      issueId: input.issueId,
      optionId: input.optionId,
      actionType: input.actionType,
      previewMode: 'decision_engine_dry_run',
      status: 'preview',
      message:
        diff.length > 0
          ? `拆段方案预览：${diff.length} 处行程变更（未写库）`
          : '拆段方案预览：未能定位可变更的行程项（请检查 anchors.itemId）',
      before: this.buildPreviewDaySnapshot(
        beforePlan,
        input.dayNumber,
        highlights.length ? [] : input.blockerMessage ? [input.blockerMessage] : [],
      ),
      after: this.buildPreviewDaySnapshot(
        afterPlan,
        input.dayNumber,
        highlights.length ? highlights : [input.option.title],
      ),
      itineraryDiff: diff.map((entry) => ({
        slotId: entry.slotId,
        changeType: entry.changeType,
        dayNumber: entry.dayNumber,
        before: entry.before as unknown as Record<string, unknown>,
        after: entry.after as unknown as Record<string, unknown>,
      })),
      impact: {
        feasibilityScoreBefore: input.scoreBefore,
        feasibilityScoreAfter: Math.min(100, input.scoreBefore + 12),
        estimated: true,
      },
      decisionPlan: afterPlan as unknown as Record<string, unknown>,
      option: input.option,
    };
  }

  private async buildHeuristicPreview(input: {
    tripId: string;
    blockerId: string;
    issueId?: string;
    optionId: string;
    actionType: string;
    option: RepairOption;
    dayNumber: number;
    scoreBefore: number;
    blockerMessage?: string;
  }): Promise<PreviewRepairResponse> {
    const impactRank =
      input.option.impact === 'high' ? 18 : input.option.impact === 'medium' ? 10 : 5;

    let daySnapshot: PreviewRepairResponse['before'] = {
      dayNumber: input.dayNumber,
      itemCount: 0,
      totalItemCount: 0,
      highlights: input.blockerMessage ? [input.blockerMessage] : [],
    };

    try {
      const plan = await this.decisionRepairBridge.loadCurrentTripPlan(input.tripId);
      daySnapshot = this.buildPreviewDaySnapshot(
        plan,
        input.dayNumber,
        input.blockerMessage ? [input.blockerMessage] : [],
      );
    } catch {
      // keep zeros when trip cannot be loaded
    }

    return {
      tripId: input.tripId,
      blockerId: input.blockerId,
      issueId: input.issueId,
      optionId: input.optionId,
      actionType: input.actionType,
      previewMode: 'heuristic',
      status: 'preview',
      message: '启发式预览（非计划类修复；应用后行为可能与预览不同）',
      before: daySnapshot,
      after: {
        ...daySnapshot,
        highlights: [input.option.title],
      },
      itineraryDiff: [],
      impact: {
        feasibilityScoreBefore: input.scoreBefore,
        feasibilityScoreAfter: Math.min(100, input.scoreBefore + impactRank),
        estimated: true,
      },
      option: input.option,
    };
  }

  private async fetchWeatherMetadata(tripId: string): Promise<Record<string, unknown>> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: {
                  select: { metadata: true },
                },
              },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const bundle = await this.weatherForecastService.buildForecastRisksForTrip(trip, 'zh');
    return {
      available: bundle.summary.available,
      reason: bundle.summary.reason,
      forecastDayCount: bundle.risks[0]?.forecastDays?.length ?? 0,
      source: bundle.summary.source,
    };
  }

  private async persistDeferredChooseContext(
    tripId: string,
    decisionPoints: string[],
  ): Promise<void> {
    if (!this.guardianChoose || !decisionPoints.length) return;
    await this.guardianChoose.persistChooseContext(tripId, {
      source: 'readiness_repair',
      decisionPoints,
      hardConstraintBlocked: false,
      correlationId: `readiness-defer-${Date.now()}`,
    });
  }
}
