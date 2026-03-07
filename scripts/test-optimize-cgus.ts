#!/usr/bin/env npx ts-node
/**
 * OPTIMIZE (CGUS) 阶段测试
 *
 * 测试决策内核的优化适配器对可行方案进行效用排序与最优选择，
 * 将 optimizationHints 写入 DSO。
 *
 * 文档: docs/Decision_OS_实施例_旅行规划.md 236-269
 *
 * 输入（从 DSO 读取）：tripState.planDraft、environmentState、constraints、userIntent
 * 输出：DSO.optimizationHints（safetyTrend, fatigueTrend, dimensionBreakdown, expectedUtility）
 *
 * 使用 trip: 1c077df7-18ae-45b8-a58e-e71865d224f5
 *
 * 运行：
 *   npm run test:optimize-cgus
 *   # 或 ENABLE_READINESS_MODULE=true SKIP_GEO_MONITORING=1 npx ts-node --transpile-only scripts/test-optimize-cgus.ts
 *
 * 完整流程（含 PlanGen）：不设置 SKIP_PLAN_GEN 时，会先执行 PlanGen 获取真实 planDraft
 * 快速模式（mock planDraft）：SKIP_PLAN_GEN=1 npm run test:optimize-cgus
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
import type { PhaseExecutorContext, GateResultLike } from '../src/decision/kernel/interfaces/phase-executor.interface';
import type { OptimizationHints } from '../src/decision/kernel/decision-state.types';

const logger = new Logger('OptimizeCGUS-Test');

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

/** 构建 mock planDraft（第 3 天室内 SPA，规避暴风雨） */
function buildMockPlanDraft(tripData: { days: number; dateRange: { start: string } }) {
  const days = Array.from({ length: tripData.days }, (_, i) => {
    const d = new Date(tripData.dateRange.start);
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().split('T')[0],
      items: [
        {
          location_ref: { name: i === 2 ? '室内 SPA' : `POI Day ${i + 1}` },
          start_time: '09:00',
          end_time: '12:00',
        },
      ],
    };
  });
  return { request_id: TRIP_ID, days };
}

async function main(): Promise<void> {
  logger.log(`📋 OPTIMIZE (CGUS) 阶段测试 - Trip ID: ${TRIP_ID}`);
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

    let planDraft: unknown;

    if (process.env.SKIP_PLAN_GEN === '1') {
      logger.log('\n【Step 1】使用 mock planDraft（SKIP_PLAN_GEN=1）');
      planDraft = buildMockPlanDraft(tripData);
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
      planDraft = result.planDraft;
      logger.log(`  └─ PlanGen 完成，days: ${(planDraft as any)?.days?.length ?? 0}`);
    }

    // 【Step 2】构建 OPTIMIZE 输入 DSO
    logger.log('\n【Step 2】构建 OPTIMIZE 输入 DSO');
    const dso: DecisionState = {
      userIntent: {
        destination: tripData.destination,
        dateRange: { startDate: tripData.dateRange.start, endDate: tripData.dateRange.end },
        days: tripData.days,
        mode: 'drive',
        party: { count: 2 },
      },
      tripState: { planDraft },
      environmentState: {
        countryCode: 'IS',
        weatherRisk: 0.1, // LOW - 方案 C 规避暴风雨
        failureRiskLevel: 'LOW',
      },
      constraints: { feasible: true, violations: [] },
      systemState: { requestId: TRIP_ID, currentPhase: 'OPTIMIZE' },
    };

    // 模拟低疲劳（文档示例：方案 C 疲劳风险低）
    dso.tripState = { ...dso.tripState, fatigue: 0.2 };
    logger.log(`  └─ environmentState.weatherRisk: ${dso.environmentState?.weatherRisk}`);
    logger.log(`  └─ tripState.planDraft.days: ${(dso.tripState?.planDraft as any)?.days?.length ?? 0}`);

    // 【Step 3】调用优化适配器（CGUS 五步流程）
    logger.log('\n【Step 3】OptimizationEngineAdapter.getHintsAsync()');
    let hints: OptimizationHints | undefined = await kernel.getOptimizationHintsAsync(dso);
    if (!hints) {
      hints = kernel.getOptimizationHints(dso);
    }

    if (!hints) {
      logger.warn('  └─ ⚠️ 未获得 optimizationHints（可能依赖未注入）');
    } else {
      logger.log('  └─ optimizationHints:');
      logger.log(`     safetyTrend: ${hints.safetyTrend ?? 'N/A'}`);
      logger.log(`     fatigueTrend: ${hints.fatigueTrend ?? 'N/A'}`);
      logger.log(`     expectedUtility: ${hints.expectedUtility?.toFixed(3) ?? 'N/A'}`);
      if (hints.dimensionBreakdown) {
        logger.log(`     dimensionBreakdown: ${JSON.stringify(hints.dimensionBreakdown)}`);
      }
      if (hints.confidenceInterval) {
        logger.log(
          `     confidenceInterval: [${hints.confidenceInterval.lower.toFixed(2)}, ${hints.confidenceInterval.upper.toFixed(2)}]`,
        );
      }
    }

    // 【Step 4】断言
    logger.log('\n【Step 4】断言');
    const hasHints = !!hints && Object.keys(hints).length > 0;
    const hasExpectedUtility = hints?.expectedUtility !== undefined;
    const hasDimensionBreakdown = !!hints?.dimensionBreakdown;

    if (hasHints) {
      logger.log(`  └─ ✅ optimizationHints 已生成`);
      if (hasExpectedUtility) {
        logger.log(`  └─ ✅ expectedUtility = ${hints!.expectedUtility!.toFixed(3)}`);
      }
      if (hasDimensionBreakdown) {
        logger.log(`  └─ ✅ dimensionBreakdown 含 fatigue/weather/budget/crowdAvoidance`);
      }
    } else {
      logger.warn('  └─ ⚠️ 无 optimizationHints（OptimizationModule 或依赖未启用时可能为空）');
    }

    logger.log('\n' + '='.repeat(60));
    logger.log('✅ OPTIMIZE (CGUS) 测试完成');
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
