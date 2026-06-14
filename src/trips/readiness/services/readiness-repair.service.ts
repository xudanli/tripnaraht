import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
  shouldDeferRepairByPreNegotiation,
} from '../utils/readiness-guardian-negotiation.util';
import type {
  ApplyRepairRequest,
  ApplyRepairResponse,
  AutoRepairRequest,
  RefreshEvidenceResponse,
  RepairOption,
  ReadinessGuardianNegotiationSnapshot,
} from '../types/coverage-map.types';

const MARK_NOT_APPLICABLE_ACTIONS = new Set(['manual_confirm', 'mark_resolved']);
const ADD_TO_LATER_ACTIONS = new Set(['ignore']);
const REFRESH_ONLY_ACTIONS = new Set(['refresh']);
const WEATHER_FETCH_ACTIONS = new Set(['fetch_weather']);
const DECISION_ENGINE_ACTIONS = new Set([
  'reorder_pois',
  'move_to_day',
  'remove_pois',
  'book_transport',
  'find_alternative_route',
  'contact_guide',
  'change_hotel',
  'search_nearby',
  'change_destination',
  'buy_insurance',
]);

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
          return {
            tripId,
            blockerId,
            optionId,
            actionType,
            status: 'deferred',
            message: buildGuardianDeferMessage(preRepair),
            readinessScore,
            guardianNegotiation,
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
}
