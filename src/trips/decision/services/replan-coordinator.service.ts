/**
 * REPLAN 协调服务
 *
 * 专利实施例 2：环境变化时执行 RESEARCH → GATE_EVAL → CONTEXT_BUILD → PLAN_GEN → VERIFY 重规划
 * 实现 IReplanTrigger，供 DecisionKernel.pushEnvironmentDelta 在 shouldReplan 时调用
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import { type IReplanTrigger } from '../../../decision/kernel/replan-trigger.interface';
import { DSO_FEEDBACK_PERSISTENCE } from '../../../decision/kernel/dso-feedback-persistence.interface';
import type { IDsoFeedbackPersistence } from '../../../decision/kernel/dso-feedback-persistence.interface';
import type { PhaseExecutorContext, GateResultLike } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import { REPLAN_FLIGHT_SEARCH } from '../../../decision/kernel/replan-flight-search.interface';
import type { IReplanFlightSearch } from '../../../decision/kernel/replan-flight-search.interface';

@Injectable()
export class ReplanCoordinatorService implements IReplanTrigger {
  private readonly logger = new Logger(ReplanCoordinatorService.name);

  constructor(
    private readonly decisionKernel: DecisionKernelService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(DSO_FEEDBACK_PERSISTENCE) private readonly feedbackPersistence?: IDsoFeedbackPersistence,
    @Optional() @Inject(REPLAN_FLIGHT_SEARCH) private readonly flightSearch?: IReplanFlightSearch,
  ) {}

  async triggerReplan(tripRunIdOrTripId: string, reason: string): Promise<void> {
    this.logger.log(`[ReplanCoordinator] 开始重规划: tripRunId=${tripRunIdOrTripId}, reason=${reason}`);

    if (!this.feedbackPersistence) {
      this.logger.warn('[ReplanCoordinator] 无 DSO 持久化，跳过');
      return;
    }

    let dso = await this.feedbackPersistence.getDso(tripRunIdOrTripId);
    if (!dso) {
      this.logger.warn(`[ReplanCoordinator] 未找到 DSO: ${tripRunIdOrTripId}`);
      return;
    }

    const ctx = await this.buildContext(tripRunIdOrTripId, dso);
    if (!ctx) {
      this.logger.warn(`[ReplanCoordinator] 无法构建上下文: ${tripRunIdOrTripId}`);
      return;
    }

    try {
      // RESEARCH
      this.logger.debug('[ReplanCoordinator] 执行 RESEARCH');
      const { newState: dsoAfterResearch, researchData } = await this.decisionKernel.executeResearch(dso, ctx);
      dso = dsoAfterResearch;
      ctx.researchData = researchData;

      // 航班替换（专利 6.2.9：航班取消时搜索替代航班）
      dso = await this.replaceCancelledFlights(dso, ctx, reason);

      // GATE_EVAL
      this.logger.debug('[ReplanCoordinator] 执行 GATE_EVAL');
      const { newState: dsoAfterGate, gateResult } = await this.decisionKernel.executeGateEval(dso, ctx);
      dso = dsoAfterGate;
      ctx.gateResult = gateResult;

      // CONTEXT_BUILD
      this.logger.debug('[ReplanCoordinator] 执行 CONTEXT_BUILD');
      const contextPackage = await this.decisionKernel.getContextPackage(dso, {
        tripId: tripRunIdOrTripId,
        destinationCountryCode: dso.environmentState?.countryCode ?? 'IS',
      });
      dso = this.decisionKernel.updateState(dso, { contextPackage });

      // PLAN_GEN
      this.logger.debug('[ReplanCoordinator] 执行 PLAN_GEN');
      const { newState: dsoAfterPlan, itinerary } = await this.decisionKernel.executePlanGen(dso, ctx);
      dso = dsoAfterPlan;
      ctx.itinerary = itinerary;

      // VERIFY →（issues 非空时）REPAIR，与 Agent 编排 KERNEL_NATIVE 路径对齐（S-TD-02）
      this.logger.debug('[ReplanCoordinator] 执行 VERIFY');
      const { newState: dsoAfterVerify, issues } = await this.decisionKernel.executeVerify(dso, ctx);
      dso = dsoAfterVerify;

      if (issues?.length) {
        this.logger.debug(`[ReplanCoordinator] VERIFY 发现问题 (${issues.length})，执行 REPAIR`);
        const { newState: dsoAfterRepair, itinerary: repairedItinerary } = await this.decisionKernel.executeRepair(dso, ctx);
        dso = dsoAfterRepair;
        if (repairedItinerary) {
          ctx.itinerary = repairedItinerary;
        }
      }

      await this.feedbackPersistence.persistDso(tripRunIdOrTripId, dso);
      this.logger.log(`[ReplanCoordinator] 重规划完成: ${tripRunIdOrTripId}, version=${dso.systemState?.version ?? 'N/A'}`);
    } catch (e: unknown) {
      this.logger.error(`[ReplanCoordinator] 重规划失败: ${(e as Error)?.message}`, (e as Error)?.stack);
      throw e;
    }
  }

  /** 当 reason 为 flight_cancelled 时，搜索替代航班并更新 DSO.environmentState.flights */
  private async replaceCancelledFlights(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    reason: string,
  ): Promise<DecisionState> {
    if (reason !== 'flight_cancelled' || !this.flightSearch) return dso;

    const flights = dso.environmentState?.flights as Array<{ status?: string }> | undefined;
    if (!Array.isArray(flights) || !flights.some((f) => (f?.status ?? '').toLowerCase() === 'cancelled')) return dso;

    const origin = typeof ctx.tripPlanRequest?.origin === 'string' ? ctx.tripPlanRequest.origin : undefined;
    const dest = typeof ctx.tripPlanRequest?.destination === 'string'
      ? ctx.tripPlanRequest.destination
      : undefined;
    const startDate = ctx.tripPlanRequest?.start_date ?? ctx.tripPlanRequest?.date_range?.start_date ?? '';
    if (!origin || !dest || !startDate) {
      this.logger.debug('[ReplanCoordinator] 缺少 origin/destination/startDate，跳过航班替换');
      return dso;
    }

    const alternatives = await this.flightSearch.searchAlternatives(origin, dest, startDate);
    if (alternatives.length === 0) return dso;

    // 替代航班优先，保留原非取消项作为备选
    const keepExisting = (dso.environmentState?.flights ?? []).filter(
      (f) => (f?.status ?? '').toLowerCase() !== 'cancelled',
    );
    const mergedFlights = [...alternatives, ...keepExisting];
    return this.decisionKernel.updateState(dso, {
      environmentState: { ...dso.environmentState, flights: mergedFlights },
    });
  }

  private async buildContext(
    tripRunIdOrTripId: string,
    dso: DecisionState,
  ): Promise<PhaseExecutorContext | null> {
    const trip = await this.resolveTrip(tripRunIdOrTripId);
    const intent = dso.userIntent ?? {};

    const dest = typeof intent.destination === 'string'
      ? intent.destination
      : (typeof intent.destination === 'object' && intent.destination)
        ? intent.destination
        : trip?.destination;
    if (!dest) return null;

    const startDate = intent.dateRange?.startDate ?? trip?.startDate?.toISOString().slice(0, 10) ?? '';
    const endDate = intent.dateRange?.endDate ?? trip?.endDate?.toISOString().slice(0, 10) ?? startDate;
    const days = intent.days ?? (trip ? Math.ceil((trip.endDate.getTime() - trip.startDate.getTime()) / 86400000) + 1 : 1);
    const party = intent.party ?? { count: 2 };

    const origin = intent.origin
      ? (typeof intent.origin === 'string' ? intent.origin : undefined)
      : undefined;
    const tripPlanRequest = {
      destination: dest,
      origin,
      date_range: { start_date: startDate, end_date: endDate },
      start_date: startDate,
      days: Math.max(1, days),
      mode: (intent.mode as string) ?? 'drive',
      party,
      party_profile: { fitness: (party as { fitness_level?: string })?.fitness_level ?? 'medium' },
    };

    return {
      requestId: tripRunIdOrTripId,
      tripPlanRequest,
      researchData: {},
      gateResult: { gate_result: 'ALLOW' as const, violations: [], required_adjustments: [], confidence: 0.8 } as GateResultLike,
    };
  }

  private async resolveTrip(
    id: string,
  ): Promise<{ destination: string; startDate: Date; endDate: Date } | null> {
    const byTrip = await this.prisma.trip.findUnique({
      where: { id },
      select: { destination: true, startDate: true, endDate: true },
    });
    if (byTrip) return byTrip;

    const byRun = await this.prisma.tripRun.findUnique({
      where: { id },
      select: { tripId: true },
    });
    if (!byRun?.tripId) return null;

    const t = await this.prisma.trip.findUnique({
      where: { id: byRun.tripId },
      select: { destination: true, startDate: true, endDate: true },
    });
    return t;
  }
}
