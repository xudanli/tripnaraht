#!/usr/bin/env npx tsx
/**
 * 为指定行程注入强风 / 暴雨因果 trace + 行中 weather 事件（演示 execution-advisory causalInsight）。
 *
 * Usage:
 *   npx tsx scripts/seed-trip-strong-wind-causal.ts [tripId] [--wind-mps=22] [--rain]
 */
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { buildIcelandCausalTraceSeed } from '../src/causal-protocol/adapters/iceland-causal-trace.adapter';
import { CAUSAL_SOURCE_REGISTRY } from '../src/causal-protocol/causal-source.registry';
import { CANONICAL_CAUSAL_TRACE_SCHEMA } from '../src/causal-protocol/causal-trace.types';
import type { CanonicalCausalTraceV1 } from '../src/causal-protocol/causal-trace.types';
import { projectCausalStoryView } from '../src/causal-protocol/projectors/causal-story-view.projector';
import { toInputJsonValue } from '../src/trips/budget-os/utils/prisma-json.util';

const TRIP_ID = process.argv[2] ?? '1ae5cd8b-84ba-457d-9e0b-50ac3813a104';
const windArg = process.argv.find((a) => a.startsWith('--wind-mps='));
const WIND_MPS = windArg ? Number(windArg.split('=')[1]) : 22;
const USE_RAIN = process.argv.includes('--rain');

const ROUTE_LABEL = '蓝湖温泉 → 哈尔格林姆斯教堂';
const PROBLEM_ID =
  'dp_travel:same_day_travel:123853b2-9580-4379-a653-291889742d31:5ee5ce0c-f6a7-44f1-8232-694a9aecd12e';

const prisma = new PrismaClient();

function buildTrace(input: {
  tripId: string;
  problemId: string;
  worldStateVersion: string;
  destination: string | null;
}): CanonicalCausalTraceV1 {
  const now = new Date().toISOString();
  const traceId = `ct_${randomBytes(8).toString('hex')}`;

  const seed = buildIcelandCausalTraceSeed({
    tripId: input.tripId,
    problemId: input.problemId,
    destination: input.destination,
    routeLabel: ROUTE_LABEL,
    distanceKm: 38.6,
    durationMinutes: 46,
    windMps: WIND_MPS,
    appointmentSlackMinutes: 8,
  });
  if (!seed) {
    throw new Error('Iceland causal seed failed — trip destination must be IS');
  }

  const facts = [...seed.facts];
  if (USE_RAIN) {
    facts.push({
      factId: `fact_rain_${input.problemId}`,
      factType: 'WEATHER_PRECIPITATION',
      subjectType: 'SEGMENT',
      subjectId: `${input.tripId}:segment:${input.problemId}`,
      observedAt: now,
      source: CAUSAL_SOURCE_REGISTRY.ICELAND_SELF_DRIVE_RUNTIME,
      confidence: 0.88,
      attributes: {
        precipMmPerHour: 18,
        routeLabel: ROUTE_LABEL,
        condition: 'heavy_rain',
      },
    });
  }

  return {
    schema: CANONICAL_CAUSAL_TRACE_SCHEMA,
    traceId,
    tripId: input.tripId,
    worldStateVersion: input.worldStateVersion,
    createdAt: now,
    updatedAt: now,
    trigger: {
      type: 'IN_TRIP_WEATHER_ALERT',
      source: CAUSAL_SOURCE_REGISTRY.ICELAND_SELF_DRIVE_RUNTIME,
      observedAt: now,
    },
    facts,
    effects: seed.effects,
    problems: [seed.problem],
    options: [
      {
        optionId: 'depart_20min_earlier',
        problemId: input.problemId,
        metricsBefore: { timeMinutes: seed.assessment?.travelTime.p90Minutes ?? 83 },
        metricsAfter: { timeMinutes: Math.max(46, (seed.assessment?.travelTime.p90Minutes ?? 83) - 20) },
      },
    ],
    status: 'PREVIEW',
  };
}

async function main() {
  const trip = await prisma.trip.findUnique({
    where: { id: TRIP_ID },
    select: { id: true, destination: true, status: true, metadata: true },
  });
  if (!trip) {
    throw new Error(`Trip ${TRIP_ID} not found`);
  }

  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  const revision = typeof meta.revision === 'number' ? meta.revision + 1 : 3;
  const worldStateVersion = `ws_${revision}`;

  const block = (meta.canonicalCausalTracesV1 as { traces?: CanonicalCausalTraceV1[] } | undefined) ?? {
    traces: [],
  };
  const staleTraces = (block.traces ?? []).map((tr) => {
    const matches = tr.problems.some((p) => p.problemId === PROBLEM_ID);
    if (!matches) return tr;
    return { ...tr, status: 'STALE' as const, updatedAt: new Date().toISOString() };
  });
  const otherTraces = staleTraces.filter(
    (tr) => !tr.problems.some((p) => p.problemId === PROBLEM_ID) || tr.status === 'STALE',
  );

  const trace = buildTrace({
    tripId: TRIP_ID,
    problemId: PROBLEM_ID,
    worldStateVersion,
    destination: trip.destination,
  });
  const guardian = projectCausalStoryView(trace, 'abu');
  const neutral = projectCausalStoryView(trace, 'neutral');

  const weatherDesc = USE_RAIN
    ? `${ROUTE_LABEL}：暴雨预警，路面湿滑且侧风 ${WIND_MPS} m/s，不建议按原计划出发`
    : `${ROUTE_LABEL}：强风预警（阵风 ${WIND_MPS} m/s），P90 通行时间显著增加，不建议按原计划出发`;

  await prisma.tripEnvironmentEvent.deleteMany({
    where: {
      tripId: TRIP_ID,
      type: 'weather',
      status: 'open',
      description: { contains: '蓝湖温泉' },
    },
  });

  const envEvent = await prisma.tripEnvironmentEvent.create({
    data: {
      tripId: TRIP_ID,
      type: 'weather',
      severity: 'red',
      description: weatherDesc,
      affectedItems: toInputJsonValue([
        {
          itemType: 'transport',
          itemId: '123853b2-9580-4379-a653-291889742d31',
          itemName: '蓝湖温泉',
          refundable: false,
        },
        {
          itemType: 'activity',
          itemId: '5ee5ce0c-f6a7-44f1-8232-694a9aecd12e',
          itemName: '哈尔格林姆斯教堂',
          refundable: true,
        },
      ]),
      alternativePlans: toInputJsonValue([
        {
          planId: 'plan_depart_early',
          name: '提前 20 分钟出发',
          description: '避开强风窗口，保留预约缓冲',
          timeAdjustment: '-20min departure',
          costDifference: 0,
          experienceEquivalence: 0.92,
          bookingRequired: false,
        },
      ]),
      cascadeImpact: toInputJsonValue([]),
      detectedAt: new Date(),
      status: 'open',
    },
  });

  await prisma.trip.update({
    where: { id: TRIP_ID },
    data: {
      metadata: toInputJsonValue({
        ...meta,
        canonicalCausalTracesV1: {
          traces: [...otherTraces, trace],
          lastUpdatedAt: new Date().toISOString(),
        },
        revision,
        inTripStrongWindSeed: {
          problemId: PROBLEM_ID,
          traceId: trace.traceId,
          routeLabel: ROUTE_LABEL,
          windMps: WIND_MPS,
          useRain: USE_RAIN,
          seededAt: new Date().toISOString(),
        },
      }),
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tripId: TRIP_ID,
        tripStatus: trip.status,
        problemId: PROBLEM_ID,
        traceId: trace.traceId,
        worldStateVersion,
        windMps: WIND_MPS,
        useRain: USE_RAIN,
        guardianHeadline: guardian.headline,
        causalChainTitles: neutral.chain.map((n) => n.title),
        environmentEventId: envEvent.id,
        verify: {
          decisionProblems: `GET /api/trips/${TRIP_ID}/decision-problems`,
          causalTrace: `GET /api/trips/${TRIP_ID}/decision-problems/${encodeURIComponent(PROBLEM_ID)}/causal-trace`,
          executionAdvisory: `GET /api/trips/${TRIP_ID}/in-trip/execution-advisory`,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
