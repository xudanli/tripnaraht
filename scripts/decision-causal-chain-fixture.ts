#!/usr/bin/env npx ts-node
/**
 * 模拟行程冲突数据，测试 decision-causal-chain 接口（5 节点级联链）。
 *
 * 做法：向 trip.metadata.readinessCausalPreAnalysis 注入 fixture，调用 API 后自动恢复。
 *
 * Usage:
 *   npx ts-node scripts/decision-causal-chain-fixture.ts [tripId] [baseUrl]
 *
 * Example:
 *   npx ts-node scripts/decision-causal-chain-fixture.ts 3e4a1058-9218-467f-988a-c18008a14385
 */
import { Prisma, PrismaClient } from '@prisma/client';
import type { NonTransactionalReplanResult } from '../src/travel-cognition/types/travel-entity-graph.types';
import { READINESS_CAUSAL_PREANALYSIS_METADATA_KEY } from '../src/trips/readiness/utils/readiness-causal-preanalysis.util';

const tripId = process.argv[2] ?? '3e4a1058-9218-467f-988a-c18008a14385';
const baseUrl = (process.argv[3] ?? 'http://localhost:3000').replace(/\/$/, '');
const api = `${baseUrl}/api/trips/${tripId}/arrange-itinerary`;

const prisma = new PrismaClient();

function buildFixture(): NonTransactionalReplanResult {
  const now = new Date().toISOString();
  return {
    tripId,
    trigger: {
      factType: 'ROAD',
      entityRef: {
        kind: 'SEGMENT',
        id: 'seg-blue-lagoon-hallgrim',
        label: '蓝湖温泉 → 哈尔格林姆教堂',
      },
      value: { extraMinutes: 17, reason: '路况与天气导致通行变慢' },
      source: 'fixture:decision-causal-chain',
      observedAt: now,
      confidence: 0.85,
    },
    impact: {
      rootEntity: {
        kind: 'SEGMENT',
        id: 'seg-blue-lagoon-hallgrim',
        label: '蓝湖温泉 → 哈尔格林姆教堂',
      },
      rootFactType: 'ROAD',
      rootConfidence: 0.85,
      affected: [
        {
          entityRef: { kind: 'SEGMENT', id: 'transport-buffer-day1', label: '交通缓冲' },
          riskLevel: 'MEDIUM',
          message: '原计划交通缓冲被消耗',
          recommendation: 'ADJUST',
          netImpactMinutes: 17,
          propagationHop: 1,
          cascadeConfidence: 0.72,
        },
        {
          entityRef: { kind: 'POI', id: 'hallgrimskirkja', label: '哈尔格林姆教堂' },
          riskLevel: 'MEDIUM',
          message: '哈尔格林姆教堂到达时间延后',
          recommendation: 'ADJUST',
          netImpactMinutes: 17,
          propagationHop: 2,
          cascadeConfidence: 0.61,
        },
        {
          entityRef: { kind: 'POI', id: 'lunch-day1', label: '午餐' },
          riskLevel: 'HIGH',
          message: '午餐前可用余量下降',
          recommendation: 'ASK_USER',
          propagationHop: 3,
          cascadeConfidence: 0.52,
        },
        {
          entityRef: { kind: 'DAY', id: 'day-1', label: 'Day 1' },
          riskLevel: 'CRITICAL',
          message: '当天后续安排存在连锁延误风险',
          recommendation: 'ASK_USER',
          propagationHop: 4,
          cascadeConfidence: 0.44,
        },
      ],
    },
    coverage: {
      coveredFactTypes: ['ROAD', 'TRANSPORT_TIME'],
      sourcesUsed: ['fixture:decision-causal-chain'],
      uncoveredCapabilities: ['INVENTORY', 'PRICING', 'BOOKABILITY', 'AUTO_BOOKING'],
      summary: 'fixture — 仅用于 decision-causal-chain 接口联调',
      disclosedAt: now,
    },
    analyzedAt: now,
  };
}

function mergeMetadata(
  metadata: unknown,
  fixture: NonTransactionalReplanResult,
): Prisma.InputJsonValue {
  const base =
    metadata && typeof metadata === 'object'
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  base[READINESS_CAUSAL_PREANALYSIS_METADATA_KEY] = {
    latest: fixture,
    updatedAt: new Date().toISOString(),
  };
  return base as unknown as Prisma.InputJsonValue;
}

async function getJson(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${api}${path}`, { signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function unwrapData(json: Record<string, unknown>): Record<string, unknown> {
  if (json.success === true && json.data && typeof json.data === 'object') {
    return json.data as Record<string, unknown>;
  }
  return json;
}

function printChain(label: string, body: Record<string, unknown>) {
  console.log(`\n── ${label} ──`);
  console.log(`  schema: ${body.schema ?? '—'}`);
  console.log(`  basisSource: ${body.basisSource ?? '—'}`);
  console.log(`  basisUpdatedAt: ${body.basisUpdatedAt ?? '—'}`);
  const nodes = (body.nodes ?? []) as Array<{
    order: number;
    severity: string;
    title?: string;
    description: string;
    source?: string;
    netImpactMinutes?: number;
  }>;
  if (!nodes.length) {
    console.log('  nodes: (empty)');
    return;
  }
  console.log(`  nodes (${nodes.length}):`);
  for (const n of nodes) {
    const title = n.title ? `[${n.title}] ` : '';
    const mins = n.netImpactMinutes ? ` (+${n.netImpactMinutes}min)` : '';
    console.log(
      `    ${n.order + 1}. (${n.severity}) ${title}${n.description}${mins}  ← ${n.source ?? '?'}`,
    );
  }
}

async function main() {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true, name: true, metadata: true },
  });
  if (!trip) {
    console.error(`Trip not found: ${tripId}`);
    process.exit(1);
  }

  const originalMetadata = trip.metadata;
  const fixture = buildFixture();

  console.log(`Trip: ${trip.name ?? tripId}`);
  console.log(`Injecting readiness causal preanalysis fixture…`);

  await prisma.trip.update({
    where: { id: tripId },
    data: { metadata: mergeMetadata(originalMetadata, fixture) },
  });

  try {
    const before = await getJson('/decision-causal-chain');
    if (before.status !== 200 || before.json.success === false) {
      console.error(`API error ${before.status}:`, JSON.stringify(before.json, null, 2));
      process.exit(1);
    }
    const chain = unwrapData(before.json as Record<string, unknown>);
    printChain('decision-causal-chain (fixture)', chain);

    const nodeCount = ((chain.nodes ?? []) as unknown[]).length;
    if (nodeCount < 5) {
      console.warn(`\n⚠️  Expected ≥5 nodes, got ${nodeCount}`);
    } else {
      console.log(`\n✅ Causal chain fixture OK — ${nodeCount} nodes`);
    }

    const basis = await getJson('/decision-basis?conflictId=fixture-transport-day1');
    if (basis.status === 200 && basis.json.success !== false) {
      const basisData = unwrapData(basis.json as Record<string, unknown>);
      const what = basisData.whatHappened as { headline?: string } | undefined;
      console.log(`\n── decision-basis (optional) ──`);
      console.log(`  schema: ${basisData.schema ?? '—'}`);
      if (what?.headline) console.log(`  whatHappened: ${what.headline}`);
      const fields = (basisData.contextFields ?? []) as unknown[];
      console.log(`  contextFields: ${fields.length}`);
    }
  } finally {
    console.log('\nRestoring trip.metadata…');
    await prisma.trip.update({
      where: { id: tripId },
      data: { metadata: (originalMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue },
    });
    console.log('Done.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
