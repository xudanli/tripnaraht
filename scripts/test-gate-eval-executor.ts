#!/usr/bin/env npx ts-node
/**
 * GateEvalExecutorService 测试
 *
 * 测试 GateEvalExecutorService 与 ClaudeGatekeeperAgentService、CostAgentService 的联动：
 * - WorldModelCollector 收集 researchData（含 CostAgent.cost_estimate、GeoAgent.geo_terrain、WeatherAgent.weather_forecast）
 * - GateEvalExecutorService 调用 ReadinessService + ClaudeGatekeeperAgentService.evaluateGate(researchData)
 *
 * 使用 trip: 1c077df7-18ae-45b8-a58e-e71865d224f5
 *
 * 运行：
 *   npx ts-node --transpile-only scripts/test-gate-eval-executor.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { GateEvalExecutorService } from '../src/agent/execution/gate-eval-executor.service';
import { WorldModelCollectorService } from '../src/agent/execution/shared/world-model-collector.service';
import type { PhaseExecutorContext } from '../src/decision/kernel/interfaces/phase-executor.interface';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';

const logger = new Logger('GateEval-Test');

const TRIP_ID = '1c077df7-18ae-45b8-a58e-e71865d224f5';

const ICELAND_COORDS_FALLBACK = [
  { lat: 64.1466, lng: -21.9426 }, // Reykjavik
  { lat: 63.4188, lng: -19.0069 }, // Vik
  { lat: 64.0685, lng: -16.2023 }, // Jökulsárlón
];

interface TripContext {
  destination: string;
  destinationCoords: { lat: number; lng: number };
  coords: Array<{ lat: number; lng: number }>;
  dateRange: { start: string; end: string };
  partyCount: number;
}

async function loadTripContext(prisma: PrismaService): Promise<TripContext> {
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

  if (!trip) {
    throw new Error(`行程不存在: ${TRIP_ID}`);
  }

  const startStr = trip.startDate.toISOString().split('T')[0];
  const endStr = trip.endDate.toISOString().split('T')[0];
  const placeIds: number[] = [];
  for (const day of trip.TripDay) {
    for (const item of day.ItineraryItem) {
      if (item.placeId) placeIds.push(item.placeId);
    }
  }

  const uniquePlaceIds = [...new Set(placeIds)];
  let coords: Array<{ lat: number; lng: number }> = [];
  if (uniquePlaceIds.length > 0) {
    const locs = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>(
      Prisma.sql`
        SELECT ST_Y(location::geometry)::float as lat, ST_X(location::geometry)::float as lng
        FROM "Place"
        WHERE id IN (${Prisma.join(uniquePlaceIds)}) AND location IS NOT NULL
      `,
    );
    if (locs.length > 0) coords = locs.map((r) => ({ lat: r.lat, lng: r.lng }));
  }

  if (coords.length === 0) coords = ICELAND_COORDS_FALLBACK;
  const destinationCoords = coords[0] || ICELAND_COORDS_FALLBACK[0];

  return {
    destination: trip.destination || 'Iceland',
    destinationCoords,
    coords,
    dateRange: { start: startStr, end: endStr },
    partyCount: 2,
  };
}

async function main(): Promise<void> {
  logger.log(`🚪 GateEvalExecutorService 测试 - Trip ID: ${TRIP_ID}`);
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
    const ctx = await loadTripContext(prisma);
    logger.log(`📖 行程: ${ctx.destination}, ${ctx.dateRange.start} ~ ${ctx.dateRange.end}`);
    logger.log(`   坐标点数: ${ctx.coords.length}\n`);

    // 1. WorldModelCollector 收集 researchData（含 CostAgent、GeoAgent、WeatherAgent）
    logger.log('【Step 1】WorldModelCollector.collect() 收集 researchData\n');
    const collector = app.get(WorldModelCollectorService);
    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];

    await collector.collect(
      {
        destination: ctx.destinationCoords,
        destination_name: ctx.destination,
        route_coords: ctx.coords,
        date_range: { start_date: ctx.dateRange.start, end_date: ctx.dateRange.end },
        party: { count: ctx.partyCount },
      },
      researchData,
      evidenceRefs,
    );

    logger.log('  └─ researchData keys:', Object.keys(researchData).join(', '));
    if (researchData.cost_estimate) {
      const c = researchData.cost_estimate as any;
      logger.log(`     cost_estimate: expected=$${c.total_estimate?.expected}`);
    }
    if (researchData.geo_terrain) {
      const g = researchData.geo_terrain as any;
      logger.log(`     geo_terrain: terrain_type=${g.terrain_type}, difficulty=${g.difficulty}`);
    }
    if (researchData.weather_forecast) {
      const w = researchData.weather_forecast as any;
      logger.log(`     weather_forecast: ${w.forecasts?.length || 0} days`);
    }
    logger.log(`  └─ evidenceRefs: ${evidenceRefs.length} 条\n`);

    // 2. 构建 PhaseExecutorContext
    const phaseCtx: PhaseExecutorContext = {
      requestId: `gate-eval-test-${Date.now()}`,
      tripPlanRequest: {
        destination: ctx.destinationCoords,
        origin: undefined,
        date_range: { start_date: ctx.dateRange.start, end_date: ctx.dateRange.end },
        start_date: ctx.dateRange.start,
        days: Math.ceil(
          (new Date(ctx.dateRange.end).getTime() - new Date(ctx.dateRange.start).getTime()) / (1000 * 60 * 60 * 24),
        ),
        mode: 'drive',
        party: { count: ctx.partyCount },
      },
      researchData,
    };

    // 3. 调用 GateEvalExecutorService
    logger.log('【Step 2】GateEvalExecutorService.execute()\n');
    const gateEvalExecutor = app.get(GateEvalExecutorService);
    const dso: DecisionState = {} as DecisionState;

    const { constraints, gateResult } = await gateEvalExecutor.execute(dso, phaseCtx);

    logger.log('  └─ gate_result:', gateResult.gate_result);
    logger.log('  └─ feasible:', constraints.feasible);
    logger.log('  └─ confidence:', gateResult.confidence);
    if (gateResult.violations?.length) {
      logger.log('  └─ violations:');
      gateResult.violations.forEach((v, i) => {
        logger.log(`     [${i}] type=${v.type}, severity=${v.severity}, detail=${v.detail}`);
      });
    }
    if (gateResult.required_adjustments?.length) {
      logger.log('  └─ required_adjustments:');
      gateResult.required_adjustments.forEach((a, i) => {
        logger.log(`     [${i}] action=${a.action}, why=${a.why}`);
      });
    }
    if (constraints.feasibleActions?.length) {
      logger.log('  └─ feasibleActions:', constraints.feasibleActions.join(', '));
    }

    logger.log('\n' + '='.repeat(60));
    logger.log('✅ GateEval 测试完成');
  } catch (error: any) {
    logger.error(`❌ 测试失败: ${error?.message}`);
    if (error?.stack) logger.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  logger.error(`Fatal: ${error?.message}`);
  process.exit(1);
});
