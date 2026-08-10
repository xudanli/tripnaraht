#!/usr/bin/env npx ts-node
/**
 * 用真实行程日程作为 planDraft 跑 CGUS OPTIMIZE（跳过 PlanGen）。
 *
 * 用法：
 *   TRIP_ID=<uuid> ENABLE_READINESS_MODULE=true SKIP_GEO_MONITORING=1 \
 *     npx ts-node --transpile-only scripts/test-cgus-trip-plan-draft.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Logger, type INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { DecisionKernelService } from '../src/decision/kernel/decision-kernel.service';
import type { DecisionState, OptimizationHints } from '../src/decision/kernel/decision-state.types';

const logger = new Logger('CGUS-TripPlanDraft');

function resolveTripId(): string {
  const fromArgv = process.argv.slice(2).find((a) => typeof a === 'string' && a.trim());
  return (fromArgv ?? process.env.TRIP_ID ?? '').trim();
}

async function buildPlanDraftFromTrip(prisma: PrismaService, tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
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
  if (!trip) throw new Error(`行程不存在: ${tripId}`);

  const days = trip.TripDay.map((d) => {
    const date = d.date.toISOString().slice(0, 10);
    const items = (d.ItineraryItem ?? [])
      .filter((it) => it.Place?.nameCN || it.Place?.nameEN || it.note)
      .map((it) => ({
        location_ref: {
          name: it.Place?.nameCN || it.Place?.nameEN || String(it.note ?? '').slice(0, 40) || 'POI',
          place_id: it.placeId ?? undefined,
        },
        start_time: it.startTime
          ? new Date(it.startTime).toISOString().slice(11, 16)
          : '09:00',
        end_time: it.endTime ? new Date(it.endTime).toISOString().slice(11, 16) : '12:00',
        note: it.note ?? undefined,
      }));
    return { date, items };
  }).filter((d) => d.items.length > 0);

  return {
    trip,
    planDraft: {
      request_id: tripId,
      source: 'trip_db',
      days,
    },
  };
}

async function main(): Promise<void> {
  const tripId = resolveTripId();
  if (!tripId) {
    logger.error('请提供 TRIP_ID 或 argv trip uuid');
    process.exit(1);
  }

  logger.log(`CGUS 真行程测试 trip=${tripId}`);
  let app: INestApplication | undefined;
  try {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log', 'debug'] });
    await app.init();

    const prisma = app.get(PrismaService);
    const kernel = app.get(DecisionKernelService);
    const { trip, planDraft } = await buildPlanDraftFromTrip(prisma, tripId);

    const start = trip.startDate.toISOString().slice(0, 10);
    const end = trip.endDate.toISOString().slice(0, 10);
    logger.log(
      `行程: ${trip.name ?? tripId} dest=${trip.destination} ${start}~${end} planDays=${planDraft.days.length}`,
    );
    for (const d of planDraft.days) {
      logger.log(`  ${d.date}: ${d.items.map((i) => i.location_ref.name).join(' → ')}`);
    }

    const tripMetadata =
      trip.metadata && typeof trip.metadata === 'object'
        ? (trip.metadata as Record<string, unknown>)
        : {};

    const dso: DecisionState = {
      userIntent: {
        destination: trip.destination || 'IS',
        dateRange: { startDate: start, endDate: end },
        days: planDraft.days.length,
        mode: 'drive',
        party: { count: 2 },
        constraints: (tripMetadata.constraints as Record<string, unknown>) ?? undefined,
      },
      tripState: { planDraft, fatigue: 0.25 },
      environmentState: {
        countryCode: 'IS',
        weatherRisk: 0.2,
        failureRiskLevel: 'LOW',
      },
      constraints: { feasible: true, violations: [] },
      systemState: {
        requestId: `cgus-trip-${tripId}`,
        currentPhase: 'OPTIMIZE',
        tripMetadata,
      },
    };

    logger.log('调用 OptimizationEngineAdapter / CGUS …');
    let hints: OptimizationHints | undefined = await kernel.getOptimizationHintsAsync(dso);
    if (!hints) hints = kernel.getOptimizationHints(dso);

    if (!hints) {
      logger.warn('未获得 optimizationHints（CGUS 可能被门控跳过）');
      process.exitCode = 2;
      return;
    }

    const trace = (hints as any).cgusDecisionTrace ?? (hints as any).cgus_decision_trace;
    logger.log('—— CGUS 结果 ——');
    logger.log(`expectedUtility: ${hints.expectedUtility ?? 'N/A'}`);
    logger.log(`safetyTrend: ${hints.safetyTrend ?? 'N/A'}`);
    logger.log(`fatigueTrend: ${hints.fatigueTrend ?? 'N/A'}`);
    if (hints.dimensionBreakdown) {
      logger.log(`dimensionBreakdown: ${JSON.stringify(hints.dimensionBreakdown)}`);
    }
    if (hints.confidenceInterval) {
      logger.log(
        `confidenceInterval: [${hints.confidenceInterval.lower}, ${hints.confidenceInterval.upper}]`,
      );
    }
    if (trace) {
      logger.log(
        `cgusDecisionTrace: recommended=${trace.recommended_candidate ?? 'n/a'} ` +
          `policySource=${trace.policySource ?? 'n/a'} contractVersion=${trace.contractVersion ?? 'n/a'}`,
      );
      logger.log(
        `effectiveConstraints: ${JSON.stringify(trace.effectiveConstraints ?? [])}`,
      );
      logger.log(
        `effectiveObjectives: ${JSON.stringify(trace.effectiveObjectives ?? [])}`,
      );
      logger.log(`ranking: ${JSON.stringify((trace.ranking ?? []).slice(0, 5))}`);
    } else {
      logger.log('cgusDecisionTrace: (absent — 可能走了 heuristic/MC 降级)');
    }
    logger.log('✅ 完成');
  } catch (e: any) {
    logger.error(e?.message ?? e);
    if (e?.stack) logger.error(e.stack);
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}

main();
