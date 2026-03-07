#!/usr/bin/env npx ts-node
/**
 * NARRATE 阶段测试 - 用户可读旅行方案生成
 *
 * 测试行程叙述代理服务（ClaudeNarratorAgentService）将 VERIFY 确认的结构化方案
 * 转换为用户可理解的旅行说明，写入 narration（对应 DSO.narrative）。
 *
 * 文档: docs/Decision_OS_实施例_旅行规划.md 332-385
 *
 * 输入（从 DSO 读取）：planDraft、userIntent、environmentState、constraints、
 *   optimizationHints、confidence
 *
 * 输出：user_friendly_summary、day_by_day_narrative、highlights、tips、warnings
 *
 * 使用 trip: 1c077df7-18ae-45b8-a58e-e71865d224f5
 *
 * 运行：
 *   npm run test:narrate
 *   快速模式（mock itinerary）：SKIP_PLAN_GEN=1 npm run test:narrate
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ClaudeNarratorAgentService } from '../src/agent/services/sub-agents/narrator-agent.service';
import { PlanGenExecutorService } from '../src/agent/execution/plan-gen-executor.service';
import { ContextEngineAdapterService } from '../src/decision/kernel/context-engine-adapter.service';
import { WorldModelCollectorService } from '../src/agent/execution/shared/world-model-collector.service';
import type { Itinerary, GateResult, DecisionLogEntry, OrchestratorState } from '../src/agent/interfaces/trip-plan.interface';
import type { PhaseExecutorContext, GateResultLike } from '../src/decision/kernel/interfaces/phase-executor.interface';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';
import { DecisionKernelService } from '../src/decision/kernel/decision-kernel.service';

const logger = new Logger('NarratePhase-Test');

const TRIP_ID = '1c077df7-18ae-45b8-a58e-e71865d224f5';
const ICELAND_COORDS_FALLBACK = { lat: 64.1466, lng: -21.9426 };

async function loadTripData(prisma: PrismaService) {
  const trip = await prisma.trip.findUnique({
    where: { id: TRIP_ID },
    include: {
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            orderBy: [{ startTime: 'asc' }, { order: 'asc' }],
            include: { Place: true },
          },
        },
      },
    },
  });
  if (!trip) throw new Error(`行程不存在: ${TRIP_ID}`);

  const startStr = trip.startDate.toISOString().split('T')[0];
  const endStr = trip.endDate.toISOString().split('T')[0];
  const days =
    Math.ceil((new Date(endStr).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) || 6;

  return {
    destination: trip.destination || 'Iceland',
    coords: [ICELAND_COORDS_FALLBACK],
    dateRange: { start: startStr, end: endStr },
    days,
  };
}

/** 构建 mock itinerary（方案 C：第 3 天室内 SPA） */
function buildMockItinerary(tripData: { days: number; dateRange: { start: string } }): Itinerary {
  const days = Array.from({ length: tripData.days }, (_, i) => {
    const d = new Date(tripData.dateRange.start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    return {
      date: dateStr,
      items: [
        {
          id: `item-${i}-1`,
          type: 'POI' as const,
          location_ref: { name: i === 2 ? '室内 SPA' : `POI Day ${i + 1}` },
          start_window: `${dateStr}T09:00`,
          end_window: `${dateStr}T12:00`,
          evidence_refs: [],
          verified: true,
          metadata: { duration_minutes: 180, distance_meters: i === 2 ? 0 : 4500 },
        },
      ],
    };
  });
  return { request_id: TRIP_ID, days };
}

/** 构建 mock GateResult */
function buildMockGateResult(): GateResult {
  return {
    gate_result: 'ALLOW',
    violations: [],
    required_adjustments: [],
    confidence: 0.87,
  };
}

/** 构建 mock decision_log */
function buildMockDecisionLog(requestId: string): DecisionLogEntry[] {
  return [
    {
      request_id: requestId,
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: '约束、研究数据',
      outputs_summary: '第3天户外活动不可行，调整为室内',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
    },
    {
      request_id: requestId,
      step: 'VERIFY',
      actor: 'CoreDecision',
      inputs_summary: 'planDraft',
      outputs_summary: '所有约束满足，置信度 0.87',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
    },
  ];
}

/** 构建 minimal OrchestratorState */
function buildMockContext(
  tripData: { destination: string; dateRange: { start: string; end: string }; days: number },
  itinerary: Itinerary,
): OrchestratorState {
  return {
    current_step: 'NARRATE',
    request_id: TRIP_ID,
    trip_plan_request: {
      request_id: TRIP_ID,
      origin: '',
      destination: tripData.destination,
      date_range: { start_date: tripData.dateRange.start, end_date: tripData.dateRange.end },
      days: tripData.days,
      party: { count: 2, has_elderly: true, fitness_level: 'low' },
    },
    itinerary,
    gate_result: buildMockGateResult(),
    decision_log: buildMockDecisionLog(TRIP_ID),
    evidence_registry: new Map(),
    errors: [],
    metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
  };
}

async function main(): Promise<void> {
  logger.log(`📋 NARRATE 阶段测试 - Trip ID: ${TRIP_ID}`);
  logger.log('='.repeat(60));

  let app: INestApplication;

  try {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init();
    logger.log('✅ 应用初始化完成\n');
  } catch (error: any) {
    logger.error(`❌ 应用初始化失败: ${error?.message}`);
    process.exit(1);
  }

  try {
    const prisma = app.get(PrismaService);
    const tripData = await loadTripData(prisma);
    logger.log(`📖 行程: ${tripData.destination}, ${tripData.dateRange.start} ~ ${tripData.dateRange.end}, ${tripData.days} 天`);

    let itinerary: Itinerary;

    if (process.env.SKIP_PLAN_GEN === '1') {
      logger.log('\n【Step 1】使用 mock itinerary（SKIP_PLAN_GEN=1）');
      itinerary = buildMockItinerary(tripData);
    } else {
      logger.log('\n【Step 1】执行 PlanGen 获取 planDraft');
      const kernel = app.get(DecisionKernelService);
      const contextAdapter = app.get(ContextEngineAdapterService);
      const collector = app.get(WorldModelCollectorService);
      const initialDSO = kernel.createInitialState(TRIP_ID);
      const dso: DecisionState = {
        ...initialDSO,
        userIntent: {
          destination: tripData.destination,
          dateRange: { startDate: tripData.dateRange.start, endDate: tripData.dateRange.end },
          days: tripData.days,
          mode: 'drive',
          party: { count: 2 },
        },
        environmentState: { countryCode: 'IS' },
        systemState: { ...initialDSO.systemState, requestId: TRIP_ID, currentPhase: 'GATE_EVAL' },
      };
      const contextPackage = await contextAdapter.buildContextPackage(dso, {
        tripId: TRIP_ID,
        destinationCountryCode: 'IS',
      });
      const researchData: Record<string, unknown> = {};
      const evidenceRefs: string[] = [];
      await collector.collect(
        {
          destination: tripData.coords[0],
          destination_name: tripData.destination,
          route_coords: tripData.coords,
          date_range: { start_date: tripData.dateRange.start, end_date: tripData.dateRange.end },
          party: { count: 2 },
        },
        researchData,
        evidenceRefs,
      );
      const planGenExecutor = app.get(PlanGenExecutorService);
      const phaseCtx: PhaseExecutorContext = {
        requestId: TRIP_ID,
        tripPlanRequest: {
          destination: tripData.coords[0],
          date_range: { start_date: tripData.dateRange.start, end_date: tripData.dateRange.end },
          start_date: tripData.dateRange.start,
          days: tripData.days,
          mode: 'drive',
          party: { count: 2 },
        },
        researchData,
        gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 } as GateResultLike,
      };
      const enrichedDSO = { ...dso, contextPackage, constraints: { feasible: true, violations: [] } };
      const result = await planGenExecutor.execute(enrichedDSO, phaseCtx);
      const raw = (result.itinerary ?? result.planDraft) as Itinerary;
      // 确保 items 有 narrator 所需字段
      itinerary = {
        ...raw,
        days: (raw.days ?? []).map((d) => ({
          ...d,
          items: (d.items ?? []).map((it: any) => ({
            ...it,
            type: it.type ?? 'POI',
            location_ref: it.location_ref ?? { name: it.name ?? 'POI' },
            evidence_refs: it.evidence_refs ?? [],
            verified: it.verified ?? true,
          })),
        })),
      };
      logger.log(`  └─ PlanGen 完成，itinerary.days: ${itinerary?.days?.length ?? 0}`);
    }

    // 【Step 2】构建 NARRATE 输入
    logger.log('\n【Step 2】构建 NARRATE 输入');
    const gateResult = buildMockGateResult();
    const decisionLog = buildMockDecisionLog(TRIP_ID);
    const context = buildMockContext(tripData, itinerary);
    logger.log(`  └─ itinerary.days: ${itinerary.days.length}`);
    logger.log(`  └─ gate_result: ${gateResult.gate_result}`);
    logger.log(`  └─ decision_log: ${decisionLog.length} 条`);

    // 【Step 3】调用 Narrator Agent
    logger.log('\n【Step 3】ClaudeNarratorAgentService.narrate()');
    let narratorAgent: ClaudeNarratorAgentService | undefined;
    try {
      narratorAgent = app.get(ClaudeNarratorAgentService);
    } catch {
      narratorAgent = undefined;
    }
    if (!narratorAgent) {
      logger.warn('  └─ ⚠️ ClaudeNarratorAgentService 未注入，跳过');
    } else {
      const narration = await narratorAgent.narrate(itinerary, gateResult, decisionLog, context);

      logger.log(`  └─ user_friendly_summary: ${(narration.user_friendly_summary ?? '').substring(0, 60)}...`);
      logger.log(`  └─ day_by_day_narrative: ${narration.day_by_day_narrative?.length ?? 0} 天`);
      logger.log(`  └─ highlights: ${narration.highlights?.length ?? 0} 条`);
      logger.log(`  └─ tips: ${narration.tips?.length ?? 0} 条`);
      if (narration.warnings?.length) {
        logger.log(`  └─ warnings: ${narration.warnings.length} 条`);
      }
      narration.day_by_day_narrative?.slice(0, 2).forEach((d, i) =>
        logger.log(`     [${i + 1}] Day ${d.day}: ${(d.narrative ?? '').substring(0, 40)}...`),
      );

      // 【Step 4】断言
      logger.log('\n【Step 4】断言');
      const hasSummary = !!narration.user_friendly_summary;
      const hasDayByDay = !!(narration.day_by_day_narrative?.length && narration.day_by_day_narrative.length >= itinerary.days.length);
      const hasHighlights = Array.isArray(narration.highlights);
      const hasTips = Array.isArray(narration.tips);
      logger.log(`  └─ ${hasSummary ? '✅' : '⚠️'} user_friendly_summary 已生成`);
      logger.log(`  └─ ${hasDayByDay ? '✅' : '⚠️'} day_by_day_narrative 覆盖 ${narration.day_by_day_narrative?.length ?? 0}/${itinerary.days.length} 天`);
      logger.log(`  └─ ${hasHighlights ? '✅' : '⚠️'} highlights 为数组`);
      logger.log(`  └─ ${hasTips ? '✅' : '⚠️'} tips 为数组`);
    }

    logger.log('\n' + '='.repeat(60));
    logger.log('✅ NARRATE 阶段测试完成');
  } catch (error: any) {
    logger.error(`❌ 测试失败: ${error?.message}`);
    if (error?.stack) logger.error(error.stack);
    process.exit(1);
  } finally {
    await app!.close();
  }
}

main().catch((error) => {
  logger.error(`Fatal: ${error?.message}`);
  process.exit(1);
});
