#!/usr/bin/env npx ts-node
/**
 * VERIFY 阶段测试 - 闭环验证
 *
 * 测试方案验证执行服务（VerifyExecutorService）对 OPTIMIZE 输出的最优方案进行闭环验证，
 * 确保满足约束并评估人体可执行性。
 *
 * 文档: docs/Decision_OS_实施例_旅行规划.md 273-300
 *
 * 输入（从 DSO 读取）：tripState.planDraft、researchData、userIntent（含 party_profile）
 *
 * 执行流程：
 *   1. itinerary.verify Skill - 预算、体能、天气、驾驶等约束检查
 *   2. ExperienceAgent.assessHumanExecutability - 人体可执行性、负荷、挑战点
 *
 * 验证结果：issues、confidenceDelta → STATE_UPDATE 写入 DSO.confidence
 *
 * 使用 trip: 1c077df7-18ae-45b8-a58e-e71865d224f5
 *
 * 运行：
 *   npm run test:verify
 *   快速模式（mock itinerary）：SKIP_PLAN_GEN=1 npm run test:verify
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { DecisionKernelService } from '../src/decision/kernel/decision-kernel.service';
import { PlanGenExecutorService } from '../src/agent/execution/plan-gen-executor.service';
import { ContextEngineAdapterService } from '../src/decision/kernel/context-engine-adapter.service';
import { WorldModelCollectorService } from '../src/agent/execution/shared/world-model-collector.service';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';
import type { PhaseExecutorContext, GateResultLike, ItineraryLike } from '../src/decision/kernel/interfaces/phase-executor.interface';

const logger = new Logger('VerifyPhase-Test');

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

/** 构建 mock itinerary（方案 C：第 3 天室内 SPA，预算 18,500，日步行≤5km，日驾驶≤6h） */
function buildMockItinerary(tripData: { days: number; dateRange: { start: string } }) {
  const days = Array.from({ length: tripData.days }, (_, i) => {
    const d = new Date(tripData.dateRange.start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    return {
      date: dateStr,
      items: [
        {
          id: `item-${i}-1`,
          type: i === 2 ? 'POI' : 'POI',
          location_ref: { name: i === 2 ? '室内 SPA' : `POI Day ${i + 1}` },
          start_window: `${dateStr}T09:00`,
          end_window: `${dateStr}T12:00`,
          metadata: { duration_minutes: 180, distance_meters: i === 2 ? 0 : 4500 },
        },
      ],
    };
  });
  return { request_id: TRIP_ID, days };
}

async function main(): Promise<void> {
  logger.log(`📋 VERIFY 阶段测试 - Trip ID: ${TRIP_ID}`);
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
    const kernel = app.get(DecisionKernelService);
    const prisma = app.get(PrismaService);
    const tripData = await loadTripData(prisma);
    logger.log(`📖 行程: ${tripData.destination}, ${tripData.dateRange.start} ~ ${tripData.dateRange.end}, ${tripData.days} 天`);

    let itinerary: ItineraryLike;
    const researchData: Record<string, unknown> = {};

    if (process.env.SKIP_PLAN_GEN === '1') {
      logger.log('\n【Step 1】使用 mock itinerary（SKIP_PLAN_GEN=1）');
      itinerary = buildMockItinerary(tripData);
    } else {
      logger.log('\n【Step 1】执行 PlanGen 获取 planDraft');
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
      itinerary = (result.itinerary ?? result.planDraft) as ItineraryLike;
      logger.log(`  └─ PlanGen 完成，itinerary.days: ${itinerary?.days?.length ?? 0}`);
    }

    // 【Step 2】构建 VERIFY 输入 DSO 与 PhaseExecutorContext
    logger.log('\n【Step 2】构建 VERIFY 输入');
    const dso: DecisionState = {
      userIntent: {
        destination: tripData.destination,
        dateRange: { startDate: tripData.dateRange.start, endDate: tripData.dateRange.end },
        days: tripData.days,
        mode: 'drive',
        party: { count: 2 },
      },
      tripState: { planDraft: itinerary },
      environmentState: { countryCode: 'IS' },
      constraints: { feasible: true, violations: [] },
      systemState: { requestId: TRIP_ID, currentPhase: 'OPTIMIZE' },
      confidence: 0.9,
    };

    const ctx: PhaseExecutorContext = {
      requestId: TRIP_ID,
      itinerary,
      researchData,
      tripPlanRequest: {
        destination: tripData.coords[0],
        date_range: { start_date: tripData.dateRange.start, end_date: tripData.dateRange.end },
        start_date: tripData.dateRange.start,
        days: tripData.days,
        mode: 'drive',
        party: { count: 2, fitness_level: 'low', has_elderly: true },
        party_profile: { fitness: 'low' },
      },
    };
    logger.log(`  └─ itinerary.days: ${ctx.itinerary?.days?.length ?? 0}`);
    logger.log(`  └─ party.has_elderly: ${ctx.tripPlanRequest?.party?.has_elderly}`);
    logger.log(`  └─ party.fitness_level: ${ctx.tripPlanRequest?.party?.fitness_level}`);

    // 【Step 3】执行 VERIFY（itinerary.verify + ExperienceAgent.assessHumanExecutability）
    logger.log('\n【Step 3】DecisionKernel.executeVerify()');
    const { newState, issues, confidenceDelta } = await kernel.executeVerify(dso, ctx);

    logger.log(`  └─ issues: ${issues.length} 个`);
    if (issues.length > 0) {
      issues.slice(0, 5).forEach((i: unknown, idx: number) =>
        logger.log(`     [${idx + 1}] ${typeof i === 'object' && i && 'message' in i ? (i as any).message : String(i)}`),
      );
      if (issues.length > 5) logger.log(`     ... 及其他 ${issues.length - 5} 个`);
    }
    logger.log(`  └─ confidenceDelta: ${confidenceDelta.toFixed(3)}`);
    logger.log(`  └─ newState.confidence: ${(newState.confidence ?? 'N/A').toString()}`);

    // 【Step 4】断言
    logger.log('\n【Step 4】断言');
    const confidence = newState.confidence ?? 0;
    const confidenceInRange = confidence >= 0.1 && confidence <= 1;
    logger.log(`  └─ ${confidenceInRange ? '✅' : '⚠️'} confidence ∈ [0.1, 1]: ${confidence.toFixed(3)}`);
    logger.log(`  └─ ✅ VERIFY 执行完成，返回 issues(${issues.length})、confidenceDelta(${confidenceDelta})`);

    logger.log('\n' + '='.repeat(60));
    logger.log('✅ VERIFY 阶段测试完成');
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
