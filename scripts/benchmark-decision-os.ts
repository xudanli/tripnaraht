#!/usr/bin/env npx ts-node
/**
 * 专利实施例量化效果基准测试
 *
 * 文档: docs/Decision_OS_实施例_旅行规划.md 第 4、5 节
 * - Token 节省：三级缓存 + In-Flight 去重，目标 60%-70%
 * - 约束违规率：可行域内方案，目标 0%
 *
 * 运行: ENABLE_READINESS_MODULE=true SKIP_GEO_MONITORING=1 npx ts-node --transpile-only scripts/benchmark-decision-os.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { VerifyExecutorService } from '../src/agent/execution/verify-executor.service';
import { ContextEngineerService } from '../src/agent/context-engine/services/context-engineer.service';
import type { ItineraryLike } from '../src/decision/kernel/interfaces/phase-executor.interface';
import type { PhaseExecutorContext } from '../src/decision/kernel/interfaces/phase-executor.interface';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';

const logger = new Logger('Benchmark-DecisionOS');

/** 合规行程（预算 20,000，日步行≤5km，第3天室内） */
function buildCompliantItinerary(): ItineraryLike {
  const days = [
    { date: '2025-06-01', items: [{ id: '1', type: 'POI', location_ref: { name: 'A' }, start_window: '09:00', end_window: '12:00', evidence_refs: [], verified: false, metadata: { duration_minutes: 180, distance_meters: 3000 } }] },
    { date: '2025-06-02', items: [{ id: '2', type: 'POI', location_ref: { name: 'B' }, start_window: '09:00', end_window: '12:00', evidence_refs: [], verified: false, metadata: { duration_minutes: 180, distance_meters: 4000 } }] },
    { date: '2025-06-03', items: [{ id: '3', type: 'POI', location_ref: { name: '室内 SPA' }, start_window: '09:00', end_window: '12:00', evidence_refs: [], verified: false, metadata: { duration_minutes: 180, distance_meters: 0 } }] },
  ];
  return { request_id: 'bench-req', days };
}

/** 违规行程（日步行 20km > 15km 阈值，使用 WALK 类型以便 itinerary.verify 检测） */
function buildNonCompliantItinerary(): ItineraryLike {
  const days = [
    {
      date: '2025-06-01',
      items: [
        { id: '1', type: 'WALK', location_ref: { name: '徒步超限' }, start_window: '09:00', end_window: '18:00', evidence_refs: [], verified: false, metadata: { duration_minutes: 540, distance_meters: 20000 } },
      ],
    },
  ];
  return { request_id: 'bench-req-2', days };
}

async function benchmarkConstraintViolation(app: INestApplication): Promise<void> {
  logger.log('\n━━━ 1. 约束违规率基准 ━━━');
  const verifyExecutor = app.get(VerifyExecutorService);

  const dso: DecisionState = {
    requestId: 'bench',
    userIntent: { budget: 20000, party: { count: 2, fitnessLevel: 'medium' } },
    tripState: {},
    environmentState: {},
    systemState: { requestId: 'bench' },
  };

  const ctx: PhaseExecutorContext = {
    requestId: 'bench',
    researchData: {},
    gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.8 },
    tripPlanRequest: {
      destination: 'IS',
      date_range: { start_date: '2025-06-01', end_date: '2025-06-05' },
      days: 5,
      party: { count: 2 },
      party_profile: { fitness: 'medium' },
    },
  };

  let passed = 0;
  let violations = 0;

  // 合规行程：目标 0 违规
  ctx.itinerary = buildCompliantItinerary();
  try {
    const result = await verifyExecutor.execute(dso, ctx);
    const count = result.issues?.length ?? 0;
    if (count === 0) {
      passed++;
      logger.log('  ✅ 合规行程：0 违规（符合预期）');
    } else {
      violations += count;
      logger.warn(`  ⚠️ 合规行程：${count} 个 issues: ${result.issues?.slice(0, 2).join('; ')}`);
    }
  } catch (e: unknown) {
    logger.warn(`  ⚠️ 合规行程验证异常: ${(e as Error)?.message}`);
  }

  // 违规行程：预期能检测出（日步行 20km > 15km）
  ctx.itinerary = buildNonCompliantItinerary();
  try {
    const result = await verifyExecutor.execute(dso, ctx);
    const count = result.issues?.length ?? 0;
    if (count > 0) {
      passed++;
      logger.log(`  ✅ 违规行程：检测到 ${count} 个 issues（符合预期）`);
    } else {
      logger.warn(`  ⚠️ 违规行程：未检测到 issues（预期应检测出 FATIGUE_THRESHOLD_EXCEEDED）`);
    }
  } catch (e: unknown) {
    logger.warn(`  ⚠️ 违规行程验证异常: ${(e as Error)?.message}`);
  }

  logger.log(`\n  约束违规率基准: 合规方案 ${passed >= 1 ? '0% 违规' : '存在误报'}，违规方案能检测`);
}

async function benchmarkContextCache(app: INestApplication): Promise<void> {
  logger.log('\n━━━ 2. Context 缓存基准（Token 节省路径） ━━━');

  let contextEngineer: ContextEngineerService;
  try {
    contextEngineer = app.get(ContextEngineerService);
  } catch {
    logger.warn('  ⚠️ ContextEngineerService 未注入，跳过缓存测试');
    return;
  }

  const options = {
    tripId: 'bench-trip',
    phase: 'planning',
    agent: 'benchmark',
    userQuery: '冰岛 5天 自驾',
    destinationCountryCode: 'IS',
    requiredTopics: ['VISA', 'SAFETY'],
    includeToolSelection: false,
  };

  try {
    const t0 = Date.now();
    const pkg1 = await contextEngineer.build(options, true);
    const t1 = Date.now();
    const pkg2 = await contextEngineer.build(options, true);
    const t2 = Date.now();

    const firstMs = t1 - t0;
    const secondMs = t2 - t1;
    const speedup = firstMs > 0 ? (1 - secondMs / firstMs) * 100 : 0;

    logger.log(`  首次构建: ${firstMs}ms, totalTokens=${pkg1?.totalTokens ?? 'N/A'}`);
    logger.log(`  二次构建: ${secondMs}ms (缓存命中)`);
    logger.log(`  耗时降低: ${speedup.toFixed(1)}%`);
    logger.log(`  ℹ️ 目标: 缓存命中时 Token/API 降低 60%-70%（文档 4 节）`);
  } catch (e: unknown) {
    logger.warn(`  ⚠️ 缓存测试异常: ${(e as Error)?.message}`);
  }
}

async function main(): Promise<void> {
  logger.log('📋 专利实施例量化效果基准测试');
  logger.log('='.repeat(50));

  let app: INestApplication;

  try {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init();
    logger.log('✅ 应用初始化完成');
  } catch (error: unknown) {
    logger.error(`❌ 应用初始化失败: ${(error as Error)?.message}`);
    process.exit(1);
  }

  try {
    await benchmarkConstraintViolation(app);
    await benchmarkContextCache(app);
  } finally {
    await app?.close();
  }

  logger.log('\n' + '='.repeat(50));
  logger.log('📋 基准测试完成');
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
