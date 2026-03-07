#!/usr/bin/env npx ts-node
/**
 * PlanGenExecutorService 测试
 *
 * 测试方案生成执行服务：基于 ContextPackage 调用 itinerary.generate（通过 PlanGenExecutorService），
 * 生成候选行程方案，并按 DSO.constraints 进行可行域过滤，仅保留满足约束的方案写入 DSO。
 *
 * 输入（从 DSO 读取）：contextPackage（步骤 5 构建）、userIntent、environmentState、constraints
 *
 * 使用 trip: 1c077df7-18ae-45b8-a58e-e71865d224f5
 *
 * 前置条件：
 *   - npm run import:iceland-pack（可选，用于 ContextPackage 含 SAFETY/VISA 等块）
 *   - ENABLE_READINESS_MODULE=true
 *
 * 运行：
 *   npm run test:plan-gen
 *   # 或 ENABLE_READINESS_MODULE=true npx ts-node --transpile-only scripts/test-plan-gen-executor.ts
 *
 * 快速模式（跳过 GateEval LLM 调用，使用 mock 约束）：
 *   SKIP_GATE_EVAL=1 npm run test:plan-gen
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContextEngineAdapterService } from '../src/decision/kernel/context-engine-adapter.service';
import { PlanGenExecutorService } from '../src/agent/execution/plan-gen-executor.service';
import { GateEvalExecutorService } from '../src/agent/execution/gate-eval-executor.service';
import { WorldModelCollectorService } from '../src/agent/execution/shared/world-model-collector.service';
import {
  type DecisionState,
  type ConstraintReport,
  isInFeasibleRegion,
} from '../src/decision/kernel/decision-state.types';
import type {
  PhaseExecutorContext,
  ItineraryLike,
  GateResultLike,
} from '../src/decision/kernel/interfaces/phase-executor.interface';

const logger = new Logger('PlanGen-Test');

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
  const placeIds: number[] = [];
  for (const day of trip.TripDay) {
    for (const item of day.ItineraryItem) {
      if (item.placeId) placeIds.push(item.placeId);
    }
  }

  const uniquePlaceIds = [...new Set(placeIds)];
  let coords: { lat: number; lng: number }[] = [];
  let pois: Array<{ poi_id: string; name: string; nameCN?: string; nameEN?: string; lat: number; lng: number; address?: string }> = [];

  if (uniquePlaceIds.length > 0) {
    const locs = await prisma.$queryRaw<
      Array<{ id: number; name_cn: string; name_en: string | null; lat: number; lng: number; address: string | null }>
    >(
      Prisma.sql`
        SELECT p.id, p."nameCN" as name_cn, p."nameEN" as name_en,
               ST_Y(p.location::geometry)::float as lat, ST_X(p.location::geometry)::float as lng,
               p.address
        FROM "Place" p
        WHERE p.id IN (${Prisma.join(uniquePlaceIds)}) AND p.location IS NOT NULL
      `,
    );
    coords = locs.map((r) => ({ lat: r.lat, lng: r.lng }));
    pois = locs.map((r) => ({
      poi_id: String(r.id),
      name: r.name_cn || r.name_en || 'Place',
      nameCN: r.name_cn,
      nameEN: r.name_en || undefined,
      lat: r.lat,
      lng: r.lng,
      address: r.address || undefined,
    }));
  }

  if (coords.length === 0) coords = [ICELAND_COORDS_FALLBACK];
  const days = Math.ceil(
    (new Date(endStr).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24),
  ) || 6;

  return {
    destination: trip.destination || 'Iceland',
    coords,
    dateRange: { start: startStr, end: endStr },
    days,
    pois,
  };
}

async function main(): Promise<void> {
  logger.log(`📋 PlanGenExecutorService 测试 - Trip ID: ${TRIP_ID}`);
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
    logger.log(`📖 行程: ${tripData.destination}, ${tripData.dateRange.start} ~ ${tripData.dateRange.end}`);
    logger.log(`   天数: ${tripData.days}, POI 数: ${tripData.pois.length}\n`);

    // Step 1: 构建 ContextPackage（步骤 5）
    logger.log('【Step 1】构建 ContextPackage');
    const contextAdapter = app.get(ContextEngineAdapterService);
    const initialDSO: DecisionState = {
      userIntent: {
        destination: tripData.destination,
        dateRange: { startDate: tripData.dateRange.start, endDate: tripData.dateRange.end },
        days: tripData.days,
        mode: 'drive',
        party: { count: 2 },
      },
      tripState: {},
      environmentState: { countryCode: 'IS' },
      systemState: { requestId: TRIP_ID, currentPhase: 'GATE_EVAL' },
    };

    const contextPackage = await contextAdapter.buildContextPackage(initialDSO, {
      tripId: TRIP_ID,
      destinationCountryCode: 'IS',
    });
    if (!contextPackage) {
      logger.warn('  └─ ContextPackage 构建失败，继续使用空块');
    } else {
      logger.log(`  └─ blocks: ${contextPackage.blocks?.length ?? 0}, tokens: ${contextPackage.totalTokens ?? 0}`);
    }

    // Step 2: WorldModelCollector 收集 researchData
    logger.log('\n【Step 2】WorldModelCollector.collect()');
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
    (researchData as any).poi_evidence = tripData.pois;
    logger.log(`  └─ researchData keys: ${Object.keys(researchData).join(', ')}`);

    // Step 3: GateEval 获取 constraints（可跳过以加快测试）
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
    };

    let constraints: ConstraintReport;
    let gateResult: GateResultLike;

    if (process.env.SKIP_GATE_EVAL === '1') {
      logger.log('\n【Step 3】GateEval（跳过，使用 mock）');
      constraints = { feasible: true, violations: [] };
      gateResult = { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 };
    } else {
      logger.log('\n【Step 3】GateEvalExecutorService.execute()');
      const gateEvalExecutor = app.get(GateEvalExecutorService);
      const emptyDSO: DecisionState = {} as DecisionState;
      const result = await gateEvalExecutor.execute(emptyDSO, phaseCtx);
      constraints = result.constraints;
      gateResult = result.gateResult;
    }
    logger.log(`  └─ gate_result: ${gateResult.gate_result}, feasible: ${constraints.feasible}`);

    // Step 4: 构建完整 DSO（含 contextPackage, userIntent, environmentState, constraints）
    logger.log('\n【Step 4】构建 DSO');
    const dso: DecisionState = {
      userIntent: initialDSO.userIntent,
      tripState: {},
      environmentState: initialDSO.environmentState,
      systemState: { requestId: TRIP_ID, currentPhase: 'PLAN_GEN' },
      contextPackage: contextPackage ?? undefined,
      constraints,
    };
    logger.log(`  └─ contextPackage: ${!!dso.contextPackage ? '有' : '无'}`);
    logger.log(`  └─ constraints.feasible: ${dso.constraints?.feasible}`);

    // Step 5: 执行 PlanGen（调用 itinerary.generate，产出候选方案）
    logger.log('\n【Step 5】PlanGenExecutorService.execute()');
    const planGenExecutor = app.get(PlanGenExecutorService);
    const execCtx: PhaseExecutorContext = {
      ...phaseCtx,
      gateResult,
      researchData,
    };
    const { itinerary, planDraft } = await planGenExecutor.execute(dso, execCtx);

    // Step 6: 按 DSO.constraints 可行域过滤
    // 专利形式：g_i(s,a) ≤ 0, ∀i ⟺ 方案在可行域内；仅当 ∀i g_i≤0 时保留方案写入 DSO
    logger.log('\n【Step 6】按 constraints 可行域过滤（g_i(s,a) ≤ 0, ∀i）');
    const constraintsReport: ConstraintReport = dso.constraints ?? {
      feasible: true,
      violations: [],
    };

    const violations = constraintsReport.violations ?? [];
    const shouldWriteToDSO = isInFeasibleRegion(constraintsReport); // g_i(s,a) ≤ 0, ∀i

    if (violations.length > 0) {
      logger.log(`  └─ violations: ${violations.length} 项（g_i > 0 即违反）`);
      violations.forEach((v, i) => {
        const gi = v.degree ?? (v.severity === 'HARD' ? 1 : 0.5);
        logger.log(`     [${i}] g_${i + 1}=${gi > 0 ? gi.toFixed(2) : '0'} ${gi > 0 ? '>' : '≤'} 0: ${v.type} - ${v.detail}`);
      });
    }
    if (!shouldWriteToDSO) {
      logger.log(`  └─ ⚠️ ∃i g_i(s,a) > 0，不写入 DSO（仅保留 ∀i g_i≤0 的方案）`);
    } else {
      logger.log(`  └─ ✅ ∀i g_i(s,a) ≤ 0，方案在可行域内，写入 DSO`);
    }

    // Step 7: 写入 DSO（模拟 Kernel 的 merge）
    const newState = shouldWriteToDSO
      ? { ...dso, tripState: { ...dso.tripState, planDraft }, systemState: { ...dso.systemState, currentPhase: 'PLAN_GEN' } }
      : dso;

    // Step 8: 输出结果
    logger.log('\n【Step 8】构建结果');
    const it = itinerary as ItineraryLike;
    logger.log(`  └─ itinerary days: ${it?.days?.length ?? 0}`);
    if (it?.days?.length) {
      it.days.forEach((d: any, i: number) => {
        const itemCount = Array.isArray(d.items) ? d.items.length : 0;
        logger.log(`     [${i}] ${d.date}: ${itemCount} items`);
        if (itemCount > 0 && d.items[0]?.location_ref?.name) {
          logger.log(`         首项: ${d.items[0].location_ref.name}`);
        }
      });
    }
    logger.log(`  └─ 写入 DSO.tripState.planDraft: ${shouldWriteToDSO ? '是' : '否'}`);

    logger.log('\n' + '='.repeat(60));
    logger.log('✅ PlanGen 测试完成');
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
