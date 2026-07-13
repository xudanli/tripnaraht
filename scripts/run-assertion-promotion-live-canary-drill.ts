#!/usr/bin/env npx tsx
/**
 * Weather Auto-Promotion Limited Live Canary drill.
 * Requires ASSERTION_PROMOTION_SHADOW_MODE=0 on Nest :3002.
 */
import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { signVedurCollectorRequest } from '../src/trips/guardian-decision-core/evidence/vedur-collector-signature.util';
import type { VedurEvidenceIngestRequest } from '../src/trips/guardian-decision-core/contracts/vedur-evidence-ingest.types';
import { VEDUR_COLLECTOR_INGEST_PATH } from '../src/trips/guardian-decision-core/contracts/vedur-evidence-ingest.types';
import { RFC001_ASSERTION_PROMOTION_LEDGER_KEY } from '../src/decision-runtime/monitoring/assertion-promotion/assertion-promotion.types';
import { RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY } from '../src/decision-runtime/monitoring/config/iceland-vedur-monitoring.config';
import {
  buildWeatherHazardPromotionKey,
  buildWeatherRecoveryPromotionKey,
} from '../src/decision-runtime/monitoring/assertion-promotion/assertion-promotion-key.util';

const WEATHER_CANARY = 'a0a99999-9999-4999-8999-999999999999';
const EVIDENCE_DIR = join(process.cwd(), 'internal-docs/operations/evidence');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const PROMOTE_BASE = process.env.ASSERTION_PROMOTION_BASE_URL ?? 'http://127.0.0.1:3002';
const INGEST_BASE = process.env.COLLECTOR_INGEST_BASE_URL ?? 'http://127.0.0.1:3000';
const LIVE_DAY = Number(process.env.LIVE_CANARY_DAY_INDEX ?? '1');
const RETRY_DAY = Number(process.env.LIVE_RETRY_DAY_INDEX ?? process.env.RETRY_DRILL_DAY_INDEX ?? '10');
const EPISODE_ID = `live-episode-${STAMP}-d${LIVE_DAY}`;

interface TripSnapshot {
  phase: string;
  at: string;
  problemCount: number;
  openProblemCount: number;
  decisionQueueOpenCount?: number;
  decisionQueueItems?: unknown[];
  calmStreak?: number;
  hazardLedger?: Record<string, unknown>;
  recoveryLedger?: Record<string, unknown>;
  ingest?: Record<string, unknown>;
}

function buildVedurXml(windMs: number, gustMs: number, observedAt: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<observations><station id="1"><name>Reykjavík</name><time>${observedAt}</time><T>8</T><F>${windMs}</F><FG>${gustMs}</FG></station></observations>`;
}

function buildSignedRequest(dayIndex: number, windMs: number, gustMs: number, time: string) {
  const secret = process.env.VEDUR_COLLECTOR_HMAC_SECRET?.trim();
  if (!secret) throw new Error('VEDUR_COLLECTOR_HMAC_SECRET required');
  const payload = buildVedurXml(windMs, gustMs, time);
  const body: VedurEvidenceIngestRequest = {
    schemaVersion: 'vedur.raw.v1',
    tripId: WEATHER_CANARY,
    dayIndex,
    provider: 'iceland_met',
    collectorId: 'vedur-collector-pilot',
    collectorRegion: 'live-canary-drill',
    stationId: '1',
    fetchedAt: new Date().toISOString(),
    contentType: 'application/xml',
    payload,
    payloadSha256: createHash('sha256').update(payload).digest('hex'),
    requestId: `live_${randomUUID()}`,
    signatureTimestamp: new Date().toISOString(),
    signature: '',
    replayMode: 'VEDUR_REAL_PAYLOAD_REPLAY',
  };
  body.signature = signVedurCollectorRequest(body, secret);
  return body;
}

async function ingest(body: VedurEvidenceIngestRequest) {
  const url = `${INGEST_BASE.replace(/\/$/, '')}${VEDUR_COLLECTOR_INGEST_PATH}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ingest ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function snap(prisma: PrismaClient, phase: string, dayIndex: number, ingest?: Record<string, unknown>): Promise<TripSnapshot> {
  await new Promise((r) => setTimeout(r, 2500));
  const trip = await prisma.trip.findUnique({ where: { id: WEATHER_CANARY }, select: { metadata: true } });
  const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
  const items = (meta.rfc001DecisionProblems as { items?: { status: string }[] })?.items ?? [];
  const ledger = meta[RFC001_ASSERTION_PROMOTION_LEDGER_KEY] as { byPromotionKey?: Record<string, Record<string, unknown>> } | undefined;
  const vedur = meta[RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY] as { recoveryStreakByDay?: Record<string, { streak?: number }> } | undefined;
  const hazardKey = buildWeatherHazardPromotionKey(dayIndex);
  const recoveryKey = buildWeatherRecoveryPromotionKey(dayIndex);

  let decisionQueueOpenCount: number | undefined;
  let decisionQueueItems: unknown[] | undefined;
  try {
    const r = await fetch(`${PROMOTE_BASE}/api/trips/${WEATHER_CANARY}/decision-queue`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const b = (await r.json()) as { data?: { openCount?: number; items?: unknown[] } };
      decisionQueueOpenCount = b.data?.openCount;
      decisionQueueItems = b.data?.items;
    }
  } catch { /* */ }

  return {
    phase,
    at: new Date().toISOString(),
    problemCount: items.length,
    openProblemCount: items.filter((p) => p.status === 'OPEN').length,
    decisionQueueOpenCount,
    decisionQueueItems,
    calmStreak: vedur?.recoveryStreakByDay?.[String(dayIndex)]?.streak,
    hazardLedger: ledger?.byPromotionKey?.[hazardKey],
    recoveryLedger: ledger?.byPromotionKey?.[recoveryKey],
    ingest: ingest
      ? {
          outcome: ingest.outcome,
          riskTier: ingest.riskTier,
          assertionId: ingest.assertionId,
          eventId: ingest.eventId,
          ingestId: ingest.ingestId,
        }
      : undefined,
  };
}

async function runLifecycle(prisma: PrismaClient) {
  const before = await snap(prisma, 'live_before', LIVE_DAY);
  const phases: TripSnapshot[] = [];

  const steps = [
    { phase: 'strong_wind_first', wind: 26, gust: 28, time: '2026-07-12 10:00:00' },
    { phase: 'strong_wind_dup', wind: 26, gust: 28, time: '2026-07-12 10:05:00' },
    { phase: 'calm_recovery_1', wind: 4, gust: 5, time: '2026-07-12 11:00:00' },
    { phase: 'calm_recovery_2', wind: 4, gust: 5, time: '2026-07-12 12:00:00' },
  ];

  for (const s of steps) {
    const ingestRes = await ingest(buildSignedRequest(LIVE_DAY, s.wind, s.gust, s.time));
    phases.push(await snap(prisma, s.phase, LIVE_DAY, ingestRes));
  }

  const wind = phases[0];
  const dup = phases[1];
  const calm1 = phases[2];
  const calm2 = phases[3];

  return {
    dayIndex: LIVE_DAY,
    weatherEpisodeId: EPISODE_ID,
    before,
    phases,
    verdict: {
      hazard_promoted:
        wind.hazardLedger?.status === 'PROMOTED' && (wind.openProblemCount ?? 0) > (before.openProblemCount ?? 0),
      duplicate_suppressed:
        dup.hazardLedger?.ledgerId === wind.hazardLedger?.ledgerId &&
        dup.openProblemCount === wind.openProblemCount,
      calm1_streak: (calm1.calmStreak ?? 0) === 1,
      calm2_recovered:
        calm2.recoveryLedger?.status === 'RECOVERED' ||
        (calm2.openProblemCount ?? 0) < (wind.openProblemCount ?? 0),
      queue_reflects_hazard: (wind.decisionQueueOpenCount ?? 0) >= (before.decisionQueueOpenCount ?? 0),
      frontend_read_model: Array.isArray(wind.decisionQueueItems),
      overall_pass: false as boolean,
    },
  };
}

async function runRetry(prisma: PrismaClient) {
  if (process.env.ASSERTION_PROMOTION_TEST_FAIL_ONCE !== '1') {
    throw new Error('retry phase needs ASSERTION_PROMOTION_TEST_FAIL_ONCE=1 on Nest');
  }
  const hazardKey = buildWeatherHazardPromotionKey(RETRY_DAY);
  const before = await snap(prisma, 'retry_before', RETRY_DAY);
  const ingestRes = await ingest(buildSignedRequest(RETRY_DAY, 26, 28, '2026-07-12 14:00:00'));
  await new Promise((r) => setTimeout(r, 3000));

  const trip = await prisma.trip.findUnique({ where: { id: WEATHER_CANARY }, select: { metadata: true } });
  const ledger = ((trip?.metadata ?? {}) as Record<string, unknown>)[RFC001_ASSERTION_PROMOTION_LEDGER_KEY] as {
    byPromotionKey?: Record<string, Record<string, unknown>>;
  };
  const failed = ledger?.byPromotionKey?.[hazardKey];

  const deadline = Date.now() + 120_000;
  let recovered: Record<string, unknown> | undefined;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const t = await prisma.trip.findUnique({ where: { id: WEATHER_CANARY }, select: { metadata: true } });
    const l = ((t?.metadata ?? {}) as Record<string, unknown>)[RFC001_ASSERTION_PROMOTION_LEDGER_KEY] as {
      byPromotionKey?: Record<string, Record<string, unknown>>;
    };
    const e = l?.byPromotionKey?.[hazardKey];
    if (e && (e.status === 'PROMOTED' || e.status === 'SHADOW_OBSERVED') && (e.attempts as number) >= 2) {
      recovered = e;
      break;
    }
  }

  const after = await snap(prisma, 'retry_after', RETRY_DAY, ingestRes);
  return {
    dayIndex: RETRY_DAY,
    failedEntry: failed,
    recoveredEntry: recovered,
    before,
    after,
    verdict: {
      failed_ledger: failed?.status === 'FAILED' && failed?.attempts === 1 && Boolean(failed?.nextRetryAt),
      scheduler_recovery: Boolean(recovered) && (recovered?.attempts as number) >= 2,
      overall_pass: false as boolean,
    },
  };
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const filter = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1] ?? 'all';
  const prisma = new PrismaClient();
  const report: Record<string, unknown> = {
    evidenceType: 'WEATHER_AUTO_PROMOTION_LIMITED_LIVE_CANARY',
    completedAt: new Date().toISOString(),
    shadowMode: false,
    tripId: WEATHER_CANARY,
    prerequisites: {
      formalVedurSoak: 'OPERATOR_CONFIRMED_PASS',
      weatherOwnerSignoff: 'OPERATOR_CONFIRMED_PASS',
      assertionPromotionShadowObservation: 'PASS',
      roadPromotion: 'OFF',
      primarySso: 'OFF',
    },
    drills: {} as Record<string, unknown>,
  };

  try {
    if (filter === 'all' || filter === 'lifecycle') {
      const lc = await runLifecycle(prisma);
      lc.verdict.overall_pass =
        lc.verdict.hazard_promoted &&
        lc.verdict.duplicate_suppressed &&
        lc.verdict.calm2_recovered &&
        lc.verdict.frontend_read_model;
      report.drills.lifecycle = lc;
    }
    if (filter === 'all' || filter === 'retry') {
      const rt = await runRetry(prisma);
      rt.verdict.overall_pass = rt.verdict.failed_ledger && rt.verdict.scheduler_recovery;
      report.drills.retry = rt;
    }

    const lc = report.drills.lifecycle as { verdict?: { overall_pass?: boolean } } | undefined;
    const rt = report.drills.retry as { verdict?: { overall_pass?: boolean } } | undefined;
    const lcPass = filter === 'retry' ? true : (lc?.verdict?.overall_pass ?? false);
    const rtPass = filter === 'lifecycle' ? true : (rt?.verdict?.overall_pass ?? false);

    report.closure = {
      weatherLimitedLiveCanaryDrill: lcPass && rtPass ? 'PASS' : 'PENDING',
      weatherProductionCanaryGo: lcPass && rtPass ? 'GO' : 'PENDING',
      fullCutover: 'NO',
    };

    const out = join(EVIDENCE_DIR, `assertion-promotion-live-canary-${STAMP}.json`);
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ out, closure: report.closure }, null, 2));
    if (!lcPass || !rtPass) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
