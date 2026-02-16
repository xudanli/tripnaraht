#!/usr/bin/env npx tsx
/**
 * 验证优化相关接口：evaluate, optimize, risk-assessment, negotiation
 *
 * 使用行程 7891922b 进行验证
 *
 * 用法: npx tsx scripts/verify-optimization-apis.ts
 * 前置: npm run start:dev 启动服务
 */

const BASE = process.env.API_URL || 'http://localhost:3000';
const TRIP_ID = '7891922b-f0cf-4b1d-90f3-89a259325fa0';

async function fetchApi(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function ok(icon: string, name: string, r: { status: number; ok: boolean }) {
  const s = r.ok ? '✅' : r.status === 401 ? '🔒' : '❌';
  console.log(`${s} ${name} [${r.status}]`);
}

async function main() {
  console.log('\n📋 优化接口验证\n');
  console.log(`BASE: ${BASE}`);
  console.log(`TRIP_ID: ${TRIP_ID}\n`);

  // 1. 获取 world（用于 evaluate）
  console.log('--- 1. 获取 world (buildContext) ---');
  const worldRes = await fetchApi('POST', '/api/world/buildContext', { tripId: TRIP_ID });
  ok('', 'buildContext', worldRes);
  if (!worldRes.ok || !worldRes.data?.data?.world) {
    console.log('   无法获取 world，evaluate 将跳过\n');
  }

  const world = worldRes.data?.data?.world;

  // 2. 获取 plan（从 DB）
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const trip = await prisma.trip.findUnique({
    where: { id: TRIP_ID },
    include: {
      TripDay: { orderBy: { date: 'asc' }, include: { ItineraryItem: { orderBy: { startTime: 'asc' } } } },
    },
  });
  await prisma.$disconnect();

  const plan = trip
    ? {
        tripId: TRIP_ID,
        routeDirectionId: (trip.metadata as any)?.routeDirectionId ?? 'default',
        segments: (trip.TripDay || []).map((d: any, i: number) => ({
          segmentId: d.id,
          dayIndex: i + 1,
          distanceKm: 0,
          ascentM: 0,
          slopePct: 0,
        })),
      }
    : null;

  if (!plan || plan.segments.length === 0) {
    console.log('   无法构建 plan，evaluate 将跳过\n');
  }

  // --- 接口调用 ---

  console.log('\n--- 2. evaluate (test 端点，无需认证) ---');
  if (plan && world) {
    const r = await fetchApi('POST', '/api/v2/user/optimization/test/evaluate', { plan, world });
    ok('', 'test/evaluate', r);
    if (r.ok && r.data?.totalUtility != null) {
      console.log(`   totalUtility: ${r.data.totalUtility?.toFixed(4)}`);
    }
  } else {
    console.log('   ⚠️ 跳过（缺少 plan 或 world）');
  }

  console.log('\n--- 3. optimize (需 tripId) ---');
  const optRes = await fetchApi('POST', '/api/v2/user/optimization/optimize', { tripId: TRIP_ID });
  ok('', 'optimize', optRes);
  if (optRes.ok && optRes.data?.summary) {
    console.log(`   finalUtility: ${optRes.data.summary?.finalUtility?.toFixed(4) ?? '-'}`);
  }
  if (optRes.status === 401) console.log('   需 JWT，可改用 test 端点或带 token');

  console.log('\n--- 4. risk-assessment (需 tripId) ---');
  const riskRes = await fetchApi('POST', '/api/v2/user/optimization/risk-assessment', {
    tripId: TRIP_ID,
    sampleSize: 50,
  });
  ok('', 'risk-assessment', riskRes);
  if (riskRes.ok && riskRes.data) {
    console.log(`   expectedUtility: ${riskRes.data.expectedUtility?.toFixed(4) ?? '-'}`);
    console.log(`   feasibilityProbability: ${riskRes.data.feasibilityProbability?.toFixed(4) ?? '-'}`);
  }
  if (riskRes.status === 401) console.log('   需 JWT');

  console.log('\n--- 5. negotiation (test 端点，无需认证) ---');
  const negRes = await fetchApi('POST', '/api/v2/user/optimization/test/negotiation', {
    tripId: TRIP_ID,
  });
  ok('', 'test/negotiation', negRes);
  if (negRes.ok && negRes.data) {
    const d = negRes.data;
    console.log(`   decision: ${d.decision}`);
    console.log(`   consensusLevel: ${(d.consensusLevel ?? 0).toFixed(2)}`);
    console.log(`   keyTradeoffs: ${JSON.stringify(d.keyTradeoffs ?? [])}`);
    console.log(`   conditions: ${JSON.stringify(d.conditions ?? [])}`);
    console.log(`   votingResult: ${JSON.stringify(d.votingResult ?? {})}`);
  }

  console.log('\n--- 完成 ---\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
