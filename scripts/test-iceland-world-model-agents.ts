#!/usr/bin/env npx ts-node
/**
 * 冰岛 WorldModelCollectorService 数据测试用例
 *
 * 测试通过 WeatherAgentService、GeoAgentService、CostAgentService 获取：
 * - WeatherAgent: getForecast() -> 目的地天气预报、travel_suitability（每日）
 * - WeatherAgent: assessRoadClosureProbability() -> 风险等级 risk_level
 * - GeoAgent: analyzeTerrain() -> 海拔、地形、路况难度（可扩展 getElevation、getRoadConditions）
 * - CostAgent: estimateTripCost() -> 行程成本估算、预算参考
 *
 * 使用方式：
 *   npx ts-node --transpile-only scripts/test-iceland-world-model-agents.ts
 *   若项目有 TS 严格检查错误，可加 --transpile-only 跳过类型检查
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { WeatherAgentService } from '../src/agent/services/domain-agents/weather-agent.service';
import { GeoAgentService } from '../src/agent/services/domain-agents/geo-agent.service';
import { CostAgentService } from '../src/agent/services/domain-agents/cost-agent.service';
import { WorldModelCollectorService } from '../src/agent/execution/shared/world-model-collector.service';

const logger = new Logger('Iceland-WorldModel-Test');

const TRIP_ID = '1c077df7-18ae-45b8-a58e-e71865d224f5';

// 冰岛坐标 fallback（雷克雅未克 -> 杰古沙龙冰河湖）
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
  logger.log(`🇮🇸 WorldModel 数据测试 - Trip ID: ${TRIP_ID}`);
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

    // 方式一：直接使用各 Agent 获取数据
    await testAgentsDirect(app, ctx);

    // 方式二：通过 WorldModelCollectorService 批量收集
    await testWorldModelCollector(app, ctx);

    logger.log('\n' + '='.repeat(60));
    logger.log('✅ WorldModel 数据测试完成');
  } catch (error: any) {
    logger.error(`❌ 测试失败: ${error?.message}`);
    process.exit(1);
  } finally {
    await app.close();
  }
}

async function testAgentsDirect(app: INestApplication, ctx: TripContext): Promise<void> {
  logger.log('【方式一】直接调用 Domain Agents\n');

  const weatherAgent = app.get(WeatherAgentService);
  const geoAgent = app.get(GeoAgentService);
  const costAgent = app.get(CostAgentService);

  // 1. WeatherAgentService - getForecast
  logger.log('📅 WeatherAgent.getForecast(destination, date_range)');
  const forecast = await weatherAgent.getForecast(ctx.destinationCoords, {
    start: ctx.dateRange.start,
    end: ctx.dateRange.end,
  });

  logger.log('  └─ 天气预报 (forecasts):');
  forecast.forecasts.forEach((f) => {
    logger.log(
      `     ${f.date}: ${f.temperature.min}~${f.temperature.max}°C, 降水${(f.precipitation.probability * 100).toFixed(0)}%, ` +
        `wind ${f.wind.speed_kmh}km/h, travel_suitability=${f.travel_suitability}`,
    );
  });
  logger.log(`  └─ overall_confidence: ${forecast.overall_confidence}`);
  logger.log(`  └─ data_quality: ${JSON.stringify(forecast.data_quality.source_type)}`);

  // 2. WeatherAgentService - 风险等级 (assessRoadClosureProbability)
  logger.log('\n⚠️ WeatherAgent.assessRoadClosureProbability(route, date) - 风险等级');
  const roadClosure = await weatherAgent.assessRoadClosureProbability(
    ctx.coords,
    ctx.dateRange.start,
  );
  logger.log(`  └─ risk_level: ${roadClosure.risk_level}`);
  logger.log(`  └─ overall_closure_probability: ${roadClosure.overall_closure_probability}`);
  logger.log(
    `  └─ closure_factors: ${roadClosure.closure_factors.map((f) => `${f.factor}=${f.probability}`).join(', ') || '无'}`,
  );

  // 3. GeoAgentService - analyzeTerrain
  logger.log('\n🏔️ GeoAgent.analyzeTerrain(coords) - 海拔、地形、路况');
  const terrain = await geoAgent.analyzeTerrain(ctx.coords);
  logger.log(`  └─ 海拔: min=${terrain.min_elevation_m}m, max=${terrain.max_elevation_m}m`);
  logger.log(`  └─ 爬升/下降: ascent=${terrain.total_ascent_m}m, descent=${terrain.total_descent_m}m`);
  logger.log(`  └─ 地形: terrain_type=${terrain.terrain_type}`);
  logger.log(`  └─ 路况/难度: difficulty=${terrain.difficulty}`);
  logger.log(`  └─ 最大坡度: max_slope_deg=${terrain.max_slope_deg}°`);
  if (terrain.elevation_profile.length > 0) {
    logger.log(
      `  └─ elevation_profile (前3点): ${terrain.elevation_profile.slice(0, 3).map((p) => `(${p.distance_km}km, ${p.elevation_m}m)`).join(' -> ')}`,
    );
  }

  // 4. CostAgentService - estimateTripCost
  logger.log('\n💰 CostAgent.estimateTripCost(destination, date_range, party) - 行程成本估算');
  const cost = await costAgent.estimateTripCost(
    ctx.destination,
    { start: ctx.dateRange.start, end: ctx.dateRange.end },
    ctx.partyCount,
  );
  logger.log(`  └─ 总预算参考 (USD):`);
  logger.log(`     optimistic: $${cost.total_estimate.optimistic}`);
  logger.log(`     expected: $${cost.total_estimate.expected}`);
  logger.log(`     pessimistic: $${cost.total_estimate.pessimistic}`);
  logger.log(`  └─ 成本分解 (breakdown):`);
  logger.log(
    `     accommodation=$${cost.breakdown.accommodation}, transport=$${cost.breakdown.transport}, ` +
      `activities=$${cost.breakdown.activities}, dining=$${cost.breakdown.dining}, other=$${cost.breakdown.other}`,
  );
  logger.log(`  └─ confidence: ${cost.confidence}`);
}

async function testWorldModelCollector(app: INestApplication, ctx: TripContext): Promise<void> {
  logger.log('\n【方式二】WorldModelCollectorService.collect() 批量收集\n');

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

  logger.log('  └─ researchData 收集结果:');
  if (researchData.geo_terrain) {
    const geo = researchData.geo_terrain as any;
    logger.log(
      `     geo_terrain: terrain_type=${geo.terrain_type}, difficulty=${geo.difficulty}, ` +
        `elevation=${geo.min_elevation_m}m~${geo.max_elevation_m}m`,
    );
  }
  if (researchData.weather_forecast) {
    const w = researchData.weather_forecast as any;
    logger.log(
      `     weather_forecast: ${w.forecasts?.length || 0} days, travel_suitability样本=${w.forecasts?.[0]?.travel_suitability || 'N/A'}`,
    );
  }
  if (researchData.cost_estimate) {
    const c = researchData.cost_estimate as any;
    logger.log(
      `     cost_estimate: expected=$${c.total_estimate?.expected}, breakdown keys=${Object.keys(c.breakdown || {}).join(', ')}`,
    );
  }
  logger.log(`  └─ evidenceRefs: ${evidenceRefs.length} 条`);
}

main().catch((error) => {
  logger.error(`Fatal: ${error?.message}`);
  process.exit(1);
});
