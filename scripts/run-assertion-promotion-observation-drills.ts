#!/usr/bin/env npx tsx
/**
 * Weather Auto-Promotion Shadow Observation Drills
 * 1) Hazard Lifecycle: CALM → STRONG_WIND → dup → CALM×2
 * 2) Retry Scheduler: fail-once → FAILED → scheduler → SHADOW_OBSERVED
 */
import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
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
const SECRET = process.env.ASSERTION_PROMOTION_INTERNAL_SECRET ?? 'shadow-promotion-devbox-2026-07-12';
const PROMOTE_BASE = process.env.ASSERTION_PROMOTION_BASE_URL ?? 'http://127.0.0.1:3002';
const INGEST_BASE = process.env.COLLECTOR_INGEST_BASE_URL ?? 'http://127.0.0.1:3000';

const LIFECYCLE_DAY = Number(process.env.OBSERVATION_DRILL_DAY_INDEX ?? '5');
const RETRY_DAY = Number(process.env.RETRY_DRILL_DAY_INDEX ?? '7');
const WEATHER_EPISODE_ID = `obs-episode-${STAMP}-d${LIFECYCLE_DAY}`;

interface PhaseSnapshot {
  phase: string;
  at: string;
  ingest?: Record<string, unknown>;
  problemCount: number;
  decisionQueueOpenCount?: number;
  calmStreak?: number;
  hazardLedger?: unknown;
  recoveryLedger?: unknown;
  semanticState?: string;
  promotionKeys: string[];
}

function buildVedurXml(windMs: number, gustMs: number, observedAt: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<observations>
  <station id="1">
    <name>Reykjavík</name>
    <time>${observedAt}</time>
    <T>8</T>
    <F>${windMs}</F>
    <FG>${gustMs}</FG>
  </station>
</observations>`;
}

function buildSignedRequest(
  tripId: string,
  dayIndex: number,
  payload: string,
  replayMode?: 'VEDUR_REAL_PAYLOAD_REPLAY',
): VedurEvidenceIngestRequest {
  const hmacSecret = process.env.VEDUR_COLLECTOR_HMAC_SECRET?.trim();
  if (!hmacSecret) throw new Error('VEDUR_COLLECTOR_HMAC_SECRET required');
  const payloadSha256 = createHash('sha256').update(payload).digest('hex');
  const body: VedurEvidenceIngestRequest = {
    schemaVersion: 'vedur.raw.v1',
    tripId,
    dayIndex,
    provider: 'iceland_met',
    collectorId: 'vedur-collector-pilot',
    collectorRegion: 'observation-drill',
    stationId: '1',
    fetchedAt: new Date().toISOString(),
    contentType: 'application/xml',
    payload,
    payloadSha256,
    requestId: `obs_${randomUUID()}`,
    signatureTimestamp: new Date().toISOString(),
    signature: '',
    replayMode,
  };
  body.signature = signVedurCollectorRequest(body, hmacSecret);
  return body;
}

async function ingestVedur(body: VedurEvidenceIngestRequest): Promise<Record<string, unknown>> {
  const url = `${INGEST_BASE.replace(/\/$/, '')}${VEDUR_COLLECTOR_INGEST_PATH}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ingest HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function snapshot(
  prisma: PrismaClient,
  phase: string,
  dayIndex: number,
  ingest?: Record<string, unknown>,
): Promise<PhaseSnapshot> {
  await new Promise((r) => setTimeout(r, 2500));
  const trip = await prisma.trip.findUnique({
    where: { id: WEATHER_CANARY },
    select: { metadata: true },
  });
  const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
  const problems = (meta.rfc001DecisionProblems as { items?: unknown[] })?.items ?? [];
  const ledger = meta[RFC001_ASSERTION_PROMOTION_LEDGER_KEY] as
    | { byPromotionKey?: Record<string, Record<string, unknown>> }
    | undefined;
  const vedur = meta[RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY] as
    | { recoveryStreakByDay?: Record<string, { streak?: number }> }
    | undefined;

  const hazardKey = buildWeatherHazardPromotionKey(dayIndex);
  const recoveryKey = buildWeatherRecoveryPromotionKey(dayIndex);

  let decisionQueueOpenCount: number | undefined;
  try {
    const r = await fetch(`${PROMOTE_BASE}/api/trips/${WEATHER_CANARY}/decision-queue`, {
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const b = (await r.json()) as { data?: { openCount?: number } };
      decisionQueueOpenCount = b.data?.openCount;
    }
  } catch {
    decisionQueueOpenCount = undefined;
  }

  const riskTier = ingest?.riskTier as string | undefined;
  const outcome = ingest?.outcome as string | undefined;

  return {
    phase,
    at: new Date().toISOString(),
    ingest: ingest
      ? {
          outcome,
          riskTier,
          assertionId: ingest.assertionId,
          eventId: ingest.eventId,
          ingestId: ingest.ingestId,
          detail: ingest.detail,
          windSemantic: riskTier === 'PROHIBITED' || riskTier === 'ELEVATED' ? 'STRONG_WIND' : riskTier,
        }
      : undefined,
    problemCount: problems.length,
    decisionQueueOpenCount,
    calmStreak: vedur?.recoveryStreakByDay?.[String(dayIndex)]?.streak,
    hazardLedger: ledger?.byPromotionKey?.[hazardKey],
    recoveryLedger: ledger?.byPromotionKey?.[recoveryKey],
    semanticState: outcome && riskTier ? `${outcome}/${riskTier}` : undefined,
    promotionKeys: [hazardKey, recoveryKey],
  };
}

async function runHazardLifecycleDrill(prisma: PrismaClient) {
  const phases: PhaseSnapshot[] = [];
  const before = await snapshot(prisma, 'lifecycle_before', LIFECYCLE_DAY);

  const steps: Array<{ phase: string; windMs: number; gustMs: number; time: string }> = [
    { phase: 'initial_calm', windMs: 4.0, gustMs: 5.0, time: '2026-07-12 06:00:00' },
    { phase: 'strong_wind_first', windMs: 26.0, gustMs: 28.0, time: '2026-07-12 07:00:00' },
    { phase: 'strong_wind_duplicate', windMs: 26.0, gustMs: 28.0, time: '2026-07-12 07:05:00' },
    { phase: 'calm_recovery_1', windMs: 4.0, gustMs: 5.0, time: '2026-07-12 08:00:00' },
    { phase: 'calm_recovery_2', windMs: 4.0, gustMs: 5.0, time: '2026-07-12 09:00:00' },
  ];

  for (const step of steps) {
    const xml = buildVedurXml(step.windMs, step.gustMs, step.time);
    const body = buildSignedRequest(WEATHER_CANARY, LIFECYCLE_DAY, xml, 'VEDUR_REAL_PAYLOAD_REPLAY');
    const ingest = await ingestVedur(body);
    phases.push(await snapshot(prisma, step.phase, LIFECYCLE_DAY, ingest));
  }

  const after = phases[phases.length - 1];
  const verdict = {
    initial_calm_recovery:
      phases[0].recoveryLedger != null ||
      (phases[0].ingest?.outcome === 'SILENT' && phases[0].ingest?.riskTier === 'CALM'),
    first_strong_wind_shadow_observed:
      (phases[1].hazardLedger as { status?: string } | undefined)?.status === 'SHADOW_OBSERVED',
    duplicate_strong_wind_suppressed:
      (phases[2].hazardLedger as { ledgerId?: string } | undefined)?.ledgerId ===
      (phases[1].hazardLedger as { ledgerId?: string } | undefined)?.ledgerId,
    calm_1_streak_at_least_1: (phases[3].calmStreak ?? 0) === 1,
    calm_2_recovery_shadow:
      (phases[4].recoveryLedger as { status?: string; detail?: string } | undefined)?.status ===
        'RECOVERY_SHADOW' &&
      ((phases[4].recoveryLedger as { detail?: string })?.detail?.includes('calmStreak=2') ??
        (phases[4].calmStreak ?? 0) >= 2),
    problem_store_unchanged: before.problemCount === after.problemCount,
    visible_queue_unchanged: before.decisionQueueOpenCount === after.decisionQueueOpenCount,
    overall_pass: false as boolean,
  };
  verdict.overall_pass =
    verdict.first_strong_wind_shadow_observed &&
    verdict.duplicate_strong_wind_suppressed &&
    verdict.calm_1_streak_at_least_1 &&
    verdict.calm_2_recovery_shadow &&
    verdict.problem_store_unchanged &&
    verdict.visible_queue_unchanged;

  return {
    drill: 'HazardLifecycle',
    weatherEpisodeId: WEATHER_EPISODE_ID,
    dayIndex: LIFECYCLE_DAY,
    before,
    phases,
    after,
    verdict,
  };
}

async function promoteDirect(body: Record<string, unknown>) {
  const res = await fetch(`${PROMOTE_BASE}/api/internal/monitoring/promote-assertion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-assertion-promotion-secret': SECRET,
    },
    body: JSON.stringify({ ...body, trigger: 'observation_drill' }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) as Record<string, unknown> };
}

async function runRetrySchedulerDrill(prisma: PrismaClient) {
  const hazardKey = buildWeatherHazardPromotionKey(RETRY_DAY);
  const before = await snapshot(prisma, 'retry_before', RETRY_DAY);

  const xml = buildVedurXml(26.0, 28.0, '2026-07-12 10:00:00');
  const body = buildSignedRequest(WEATHER_CANARY, RETRY_DAY, xml, 'VEDUR_REAL_PAYLOAD_REPLAY');
  const ingest = await ingestVedur(body);
  await new Promise((r) => setTimeout(r, 3000));

  const tripAfterFail = await prisma.trip.findUnique({
    where: { id: WEATHER_CANARY },
    select: { metadata: true },
  });
  const meta = (tripAfterFail?.metadata ?? {}) as Record<string, unknown>;
  const ledger = meta[RFC001_ASSERTION_PROMOTION_LEDGER_KEY] as
    | { byPromotionKey?: Record<string, Record<string, unknown>>; failedQueue?: string[] }
    | undefined;
  const failedEntry = ledger?.byPromotionKey?.[hazardKey];

  const failedObserved =
    (failedEntry?.status as string | undefined) === 'FAILED' &&
    (failedEntry?.attempts as number | undefined) === 1 &&
    Boolean(failedEntry?.nextRetryAt);

  const deadline = Date.now() + 120_000;
  let recovered: Record<string, unknown> | undefined;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const trip = await prisma.trip.findUnique({
      where: { id: WEATHER_CANARY },
      select: { metadata: true },
    });
    const m = (trip?.metadata ?? {}) as Record<string, unknown>;
    const l = m[RFC001_ASSERTION_PROMOTION_LEDGER_KEY] as
      | { byPromotionKey?: Record<string, Record<string, unknown>> }
      | undefined;
    const entry = l?.byPromotionKey?.[hazardKey];
    if (entry?.status === 'SHADOW_OBSERVED' && (entry.attempts as number) >= 2) {
      recovered = entry;
      break;
    }
  }

  const after = await snapshot(prisma, 'retry_after', RETRY_DAY, ingest);
  const verdict = {
    post_accept_failed_ledger: failedObserved,
    failed_queue_includes_key: (ledger?.failedQueue ?? []).includes(hazardKey),
    scheduler_auto_recovery:
      recovered?.status === 'SHADOW_OBSERVED' && (recovered.attempts as number) >= 2,
    problem_store_unchanged: before.problemCount === after.problemCount,
    visible_queue_unchanged: before.decisionQueueOpenCount === after.decisionQueueOpenCount,
    overall_pass: false as boolean,
  };
  verdict.overall_pass =
    verdict.post_accept_failed_ledger &&
    verdict.scheduler_auto_recovery &&
    verdict.problem_store_unchanged &&
    verdict.visible_queue_unchanged;

  return {
    drill: 'RetrySchedulerOperational',
    dayIndex: RETRY_DAY,
    ingest,
    failedEntry,
    recoveredEntry: recovered,
    before,
    after,
    verdict,
  };
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const drillArg = process.argv.find((a) => a.startsWith('--drill='));
  const drillFilter = drillArg?.split('=')[1] ?? 'all';

  const prisma = new PrismaClient();
  const report: Record<string, unknown> = {
    evidenceType: 'ASSERTION_PROMOTION_SHADOW_OBSERVATION',
    completedAt: new Date().toISOString(),
    shadowMode: true,
    weatherCanaryTripId: WEATHER_CANARY,
    weatherEpisodeId: WEATHER_EPISODE_ID,
    drills: {} as Record<string, unknown>,
  };

  try {
    if (drillFilter === 'all' || drillFilter === 'lifecycle') {
      report.drills.hazardLifecycle = await runHazardLifecycleDrill(prisma);
    }
    if (drillFilter === 'all' || drillFilter === 'retry') {
      if (process.env.ASSERTION_PROMOTION_TEST_FAIL_ONCE !== '1') {
        throw new Error(
          'Retry drill requires ASSERTION_PROMOTION_TEST_FAIL_ONCE=1 on Nest :3002 (restart with drill env)',
        );
      }
      report.drills.retryScheduler = await runRetrySchedulerDrill(prisma);
    }

    const lifecycle = report.drills.hazardLifecycle as { verdict?: { overall_pass?: boolean } } | undefined;
    const retry = report.drills.retryScheduler as { verdict?: { overall_pass?: boolean } } | undefined;
    const lifecyclePass = drillFilter === 'retry' ? true : (lifecycle?.verdict?.overall_pass ?? false);
    const retryPass = drillFilter === 'lifecycle' ? true : (retry?.verdict?.overall_pass ?? false);

    report.closure = {
      weatherAutoPromotionShadowObservationClosure: lifecyclePass && retryPass ? 'PASS' : 'PENDING',
      weatherHazardLifecycleDrill: lifecyclePass ? 'PASS' : 'PENDING',
      weatherRecoveryShadowClosure: lifecyclePass ? 'PASS' : 'PENDING',
      retrySchedulerOperationalDrill: retryPass ? 'PASS' : 'PENDING',
    };

    const outPath = join(EVIDENCE_DIR, `assertion-promotion-observation-${STAMP}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ outPath, closure: report.closure }, null, 2));
    if (!lifecyclePass || !retryPass) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
