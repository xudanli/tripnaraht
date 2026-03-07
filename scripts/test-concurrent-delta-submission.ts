#!/usr/bin/env npx ts-node
/**
 * 多代理并发提交 Delta 测试
 *
 * 场景：规划流程执行期间，世界模型持续推送更新（如 WeatherAgent 收到最新气象数据）。
 * PLAN_GEN 与 WeatherAgent 几乎同时向决策内核提交 delta，若无协调机制会导致：
 * - 状态覆盖（后提交者覆盖前者）
 * - 数据不一致（planDraft 或 environmentState 丢失）
 *
 * 使用 trip: 1c077df7-18ae-45b8-a58e-e71865d224f5
 *
 * 运行：
 *   npm run test:concurrent-delta
 *   # 或 ENABLE_READINESS_MODULE=true SKIP_GEO_MONITORING=1 npx ts-node --transpile-only scripts/test-concurrent-delta-submission.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { DecisionKernelService } from '../src/decision/kernel/decision-kernel.service';
import { StateManagerService } from '../src/decision/kernel/state-manager.service';
import { PlanGenExecutorService } from '../src/agent/execution/plan-gen-executor.service';
import { WorldModelCollectorService } from '../src/agent/execution/shared/world-model-collector.service';
import { ContextEngineAdapterService } from '../src/decision/kernel/context-engine-adapter.service';
import {
  type DecisionState,
  type DecisionStatePatch,
  StateCommitConflictError,
} from '../src/decision/kernel/decision-state.types';
import type { PhaseExecutorContext, GateResultLike } from '../src/decision/kernel/interfaces/phase-executor.interface';

const logger = new Logger('ConcurrentDelta-Test');

const TRIP_ID = '1c077df7-18ae-45b8-a58e-e71865d224f5';

const ICELAND_COORDS_FALLBACK = { lat: 64.1466, lng: -21.9426 };

/** 共享 DSO 存储（模拟决策内核的持久化层） */
interface SharedDSOStore {
  state: DecisionState;
  /** 模拟写入前的版本校验（CAS） */
  versionAtLastRead: number;
}

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
  const placeIds: number[] = [];
  const coords: { lat: number; lng: number }[] = [];
  for (const day of trip.TripDay) {
    for (const item of day.ItineraryItem) {
      if (item.placeId) placeIds.push(item.placeId);
    }
  }
  // 简化：使用 fallback 坐标
  if (coords.length === 0) coords.push(ICELAND_COORDS_FALLBACK);
  const days =
    Math.ceil((new Date(endStr).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) || 6;

  return { destination: trip.destination || 'Iceland', coords, dateRange: { start: startStr, end: endStr }, days };
}

async function main(): Promise<void> {
  logger.log(`📋 多代理并发 Delta 提交测试 - Trip ID: ${TRIP_ID}`);
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
    logger.log(`📖 行程: ${tripData.destination}, ${tripData.dateRange.start} ~ ${tripData.dateRange.end}`);

    // 初始 DSO
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
      systemState: {
        ...initialDSO.systemState,
        requestId: TRIP_ID,
        currentPhase: 'GATE_EVAL',
        version: 0,
      },
    };

    const store: SharedDSOStore = {
      state: dso,
      versionAtLastRead: 0,
    };

    // 准备 PhaseExecutorContext（用于 PlanGen）
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
      researchData: {},
      gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 } as GateResultLike,
    };

    // 预构建 ContextPackage 和 researchData（可选，用于真实 PlanGen）
    let planDraft: unknown;
    try {
      const contextAdapter = app.get(ContextEngineAdapterService);
      const contextPackage = await contextAdapter.buildContextPackage(dso, {
        tripId: TRIP_ID,
        destinationCountryCode: 'IS',
      });
      const collector = app.get(WorldModelCollectorService);
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
      phaseCtx.researchData = researchData;

      const planGenExecutor = app.get(PlanGenExecutorService);
      const enrichedDSO = { ...dso, contextPackage, constraints: { feasible: true, violations: [] } };
      const result = await planGenExecutor.execute(enrichedDSO, phaseCtx);
      planDraft = result.planDraft;
    } catch (e: any) {
      logger.warn(`  PlanGen 预执行失败，使用 mock planDraft: ${e?.message}`);
      planDraft = { request_id: TRIP_ID, days: [{ date: '2026-03-05', items: [] }], _mock: true };
    }

    const planGenPatch: DecisionStatePatch = {
      tripState: { planDraft },
      systemState: {
        requestId: TRIP_ID,
        currentPhase: 'PLAN_GEN',
        lastUpdatedAt: new Date().toISOString(),
      },
    };

    const weatherPatch: DecisionStatePatch = {
      environmentState: {
        weatherRisk: 0.35,
        countryCode: 'IS',
        _weatherUpdateAt: new Date().toISOString(),
        _simulatedBy: 'WeatherAgent',
      },
      systemState: {
        requestId: TRIP_ID,
        currentPhase: 'RESEARCH',
        lastUpdatedAt: new Date().toISOString(),
      },
    };

    // ========== 场景 A：顺序提交（正确流程，每次读取最新） ==========
    logger.log('\n【场景 A】顺序提交（每次 commit 前读取最新 store）');
    const storeA: SharedDSOStore = { state: { ...dso }, versionAtLastRead: 0 };

    const r1 = kernel.commitStateUpdate(storeA.state, planGenPatch, 'PLAN_GEN');
    storeA.state = r1.newState;
    storeA.versionAtLastRead = r1.newVersion;

    const r2 = kernel.commitStateUpdate(storeA.state, weatherPatch, 'RESEARCH');
    storeA.state = r2.newState;

    const hasPlanA = !!(storeA.state.tripState?.planDraft);
    const hasWeatherA = !!(storeA.state.environmentState?.weatherRisk !== undefined);
    logger.log(`  └─ planDraft: ${hasPlanA ? '✅ 有' : '❌ 无'}`);
    logger.log(`  └─ environmentState.weatherRisk: ${hasWeatherA ? '✅ 有' : '❌ 无'}`);
    logger.log(`  └─ 结论: 顺序提交且读取最新 → 两者均保留`);

    // ========== 场景 B：并发提交（模拟 WeatherAgent 使用陈旧读取） ==========
    logger.log('\n【场景 B】并发提交（WeatherAgent 使用陈旧 DSO，未刷新）');
    const storeB: SharedDSOStore = { state: { ...dso }, versionAtLastRead: 0 };

    const planGenCommit = () => {
      const current = storeB.state;
      const result = kernel.commitStateUpdate(current, planGenPatch, 'PLAN_GEN');
      storeB.state = result.newState;
      return { success: true as const, result };
    };

    let staleReadForWeather = { ...storeB.state };
    const weatherCommitStale = () => {
      const result = kernel.commitStateUpdate(staleReadForWeather, weatherPatch, 'RESEARCH');
      storeB.state = result.newState;
      return { success: true as const, result };
    };

    planGenCommit();
    weatherCommitStale();

    const hasPlanB = !!(storeB.state.tripState?.planDraft);
    const hasWeatherB = storeB.state.environmentState?.weatherRisk !== undefined;
    logger.log(`  └─ planDraft: ${hasPlanB ? '✅ 有' : '❌ 无'}`);
    logger.log(`  └─ environmentState.weatherRisk: ${hasWeatherB ? '✅ 有' : '❌ 无'}`);
    if (!hasPlanB || !hasWeatherB) {
      logger.warn(`  └─ ⚠️ 数据丢失！后提交者基于陈旧 state 合并，覆盖了前者的更新`);
    }

    // ========== 场景 C：版本冲突（WeatherAgent 持 expectedVersion=0 对已更新为 v1 的 store 提交） ==========
    logger.log('\n【场景 C】版本冲突（WeatherAgent 持 expectedVersion=0 对已更新为 v1 的 store 提交）');
    const storeC: SharedDSOStore = { state: { ...dso }, versionAtLastRead: 0 };

    const planGenResult = kernel.commitStateUpdate(storeC.state, planGenPatch, 'PLAN_GEN');
    storeC.state = planGenResult.newState;

    const stateManager = app.get(StateManagerService);
    let weatherConflict: StateCommitConflictError | null = null;

    try {
      stateManager.commit(
        {
          requestId: TRIP_ID,
          expectedVersion: 0,
          patch: weatherPatch,
          stageOutput: 'RESEARCH',
        },
        storeC.state,
      );
    } catch (e) {
      if (e instanceof StateCommitConflictError) {
        weatherConflict = e;
        logger.log(`  └─ WeatherAgent commit 抛出 StateCommitConflictError (expected ${e.expectedVersion} vs actual ${e.actualVersion})`);
      } else {
        throw e;
      }
    }

    if (weatherConflict) {
      logger.log(`  └─ ✅ 版本冲突被正确检测，WeatherAgent 需重试并读取最新 state 后重新 commit`);
    } else {
      logger.warn(`  └─ ⚠️ 未检测到冲突`);
    }

    const hasPlanC = !!(storeC.state.tripState?.planDraft);
    logger.log(`  └─ 最终 planDraft: ${hasPlanC ? '✅ 保留' : '❌ 丢失'}`);

    // ========== 总结 ==========
    logger.log('\n' + '='.repeat(60));
    logger.log('📌 结论');
    logger.log('  - 场景 A: 顺序提交 + 每次读最新 → 无数据丢失');
    logger.log('  - 场景 B: 陈旧读取导致后者覆盖 → 可能丢失 planDraft 或 weather');
    logger.log('  - 场景 C: 若 Kernel 使用 CAS（commit 时校验 store 版本），第二次应得冲突');
    logger.log('  - 建议: WeatherAgent 等后台 Agent 提交前需刷新 DSO，或 Kernel 提供 merge-friendly 的 delta 提交 API');
    logger.log('='.repeat(60));
    logger.log('✅ 并发 Delta 测试完成');
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
