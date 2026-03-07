#!/usr/bin/env npx ts-node
/**
 * ContextEngineAdapterService 测试
 *
 * 测试决策内核的上下文适配器：根据 DSO 构建 ContextPackage
 * 使用 trip: 1c077df7-18ae-45b8-a58e-e71865d224f5
 *
 * 运行前需导入冰岛 Pack：npm run import:iceland-pack
 * 需 ENABLE_READINESS_MODULE=true 以启用 PackStorageService（按 countryCode 查找 ReadinessPack）
 *
 * 运行：
 *   npm run test:context-engine-adapter
 *   # 或 ENABLE_READINESS_MODULE=true npx ts-node --transpile-only scripts/test-context-engine-adapter.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContextEngineAdapterService } from '../src/decision/kernel/context-engine-adapter.service';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';

const logger = new Logger('ContextEngineAdapter-Test');

const TRIP_ID = '1c077df7-18ae-45b8-a58e-e71865d224f5';

const ICELAND_COORDS_FALLBACK = { lat: 64.1466, lng: -21.9426 };

async function loadTripFromDb(prisma: PrismaService) {
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
  let coords: { lat: number; lng: number } | undefined;
  if (uniquePlaceIds.length > 0) {
    const locs = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>(
      Prisma.sql`
        SELECT ST_Y(location::geometry)::float as lat, ST_X(location::geometry)::float as lng
        FROM "Place"
        WHERE id IN (${Prisma.join(uniquePlaceIds)}) AND location IS NOT NULL
        LIMIT 1
      `,
    );
    if (locs.length > 0) coords = locs[0];
  }
  if (!coords) coords = ICELAND_COORDS_FALLBACK;

  const days = Math.ceil(
    (new Date(endStr).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    destination: trip.destination || 'Iceland',
    coords,
    dateRange: { start: startStr, end: endStr },
    days: days || 7,
  };
}

/** 从行程构建 DSO */
function buildDSOFromTrip(tripData: {
  destination: string;
  coords: { lat: number; lng: number };
  dateRange: { start: string; end: string };
  days: number;
}): DecisionState {
  return {
    userIntent: {
      destination: tripData.destination,
      dateRange: {
        startDate: tripData.dateRange.start,
        endDate: tripData.dateRange.end,
      },
      days: tripData.days,
      mode: 'drive',
      party: { count: 2 },
    },
    tripState: {},
    environmentState: {
      countryCode: 'IS',
    },
    systemState: {
      requestId: TRIP_ID,
      currentPhase: 'GATE_EVAL',
    },
  };
}

async function main(): Promise<void> {
  logger.log(`📦 ContextEngineAdapterService 测试 - Trip ID: ${TRIP_ID}`);
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
    const tripData = await loadTripFromDb(prisma);
    logger.log(`📖 行程: ${tripData.destination}, ${tripData.dateRange.start} ~ ${tripData.dateRange.end}`);
    logger.log(`   天数: ${tripData.days}\n`);

    const dso = buildDSOFromTrip(tripData);
    logger.log('【Step 1】DSO 构建完成');
    logger.log(`  └─ userIntent.destination: ${dso.userIntent?.destination}`);
    logger.log(`  └─ userIntent.dateRange: ${dso.userIntent?.dateRange?.startDate}~${dso.userIntent?.dateRange?.endDate}`);
    logger.log(`  └─ systemState.requestId: ${dso.systemState?.requestId}`);
    logger.log(`  └─ systemState.currentPhase: ${dso.systemState?.currentPhase}`);
    logger.log(`  └─ environmentState.countryCode: ${(dso as any).environmentState?.countryCode}\n`);

    const adapter = app.get(ContextEngineAdapterService);
    const package_ = await adapter.buildContextPackage(dso, {
      tripId: TRIP_ID,
      destinationCountryCode: 'IS',
    });

    if (!package_) {
      logger.warn('  └─ buildContextPackage 返回 undefined（可能 userQuery 推断失败或 contextEngineer 未注入）');
    } else {
      logger.log('【Step 2】ContextPackage 构建结果');
      logger.log(`  └─ blocks: ${package_.blocks?.length ?? 0} 个 (GATE_EVAL 期望含 ROAD_RULES, SAFETY, WEATHER_WINDOWS, VISA)`);
      logger.log(`  └─ totalTokens: ${package_.totalTokens ?? 0}`);
      if (package_.blocks?.length) {
        logger.log('  └─ block 列表:');
        package_.blocks.forEach((b, i) => {
          const preview = (b.text || '').slice(0, 80).replace(/\n/g, ' ');
          logger.log(`     [${i}] key=${b.key} type=${b.type} priority=${b.priority} tokens≈${b.estimatedTokens ?? '-'}`);
          logger.log(`         text: "${preview}..."`);
        });
      }
    }

    logger.log('\n' + '='.repeat(60));
    logger.log('✅ ContextEngineAdapter 测试完成');
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
