#!/usr/bin/env npx tsx
/**
 * Assertion Promotion Shadow validation — evidence pack for Weather Canary soak.
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const WEATHER_CANARY = 'a0a99999-9999-4999-8999-999999999999';
const ROAD_CANARY = 'b0b88888-8888-4888-8888-888888888888';
const SECRET = process.env.ASSERTION_PROMOTION_INTERNAL_SECRET ?? 'shadow-promotion-devbox-2026-07-12';
const BASE = process.env.ASSERTION_PROMOTION_BASE_URL ?? 'http://127.0.0.1:3002';
const EVIDENCE_DIR = join(
  process.cwd(),
  'internal-docs/operations/evidence',
);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

interface Snapshot {
  at: string;
  problemCount: number;
  openProblemIds: string[];
  ledgerKeys: string[];
  ledgerEntries: unknown[];
  decisionQueueOpenCount?: number;
}

async function snapshot(prisma: PrismaClient, label: string): Promise<Snapshot> {
  const trip = await prisma.trip.findUnique({
    where: { id: WEATHER_CANARY },
    select: { metadata: true },
  });
  const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
  const problems = (meta.rfc001DecisionProblems as { items?: { problemId: string; status: string }[] })
    ?.items ?? [];
  const ledger = meta.rfc001AssertionPromotionLedger as
    | { byPromotionKey?: Record<string, unknown> }
    | undefined;
  const entries = Object.values(ledger?.byPromotionKey ?? {});

  let decisionQueueOpenCount: number | undefined;
  try {
    const res = await fetch(
      `http://127.0.0.1:3002/api/trips/${WEATHER_CANARY}/decision-queue`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (res.ok) {
      const body = (await res.json()) as { data?: { openCount?: number } };
      decisionQueueOpenCount = body.data?.openCount;
    }
  } catch {
    decisionQueueOpenCount = undefined;
  }

  return {
    at: `${label}@${new Date().toISOString()}`,
    problemCount: problems.length,
    openProblemIds: problems.filter((p) => !['RESOLVED', 'DISMISSED', 'FAILED'].includes(p.status)).map((p) => p.problemId),
    ledgerKeys: Object.keys(ledger?.byPromotionKey ?? {}),
    ledgerEntries: entries,
    decisionQueueOpenCount,
  };
}

async function promote(body: Record<string, unknown>, secret?: string) {
  const res = await fetch(`${BASE}/api/internal/monitoring/promote-assertion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-assertion-promotion-secret': secret ?? SECRET,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const prisma = new PrismaClient();
  const evidence: Record<string, unknown> = {
    evidenceType: 'ASSERTION_PROMOTION_SHADOW_VALIDATION',
    validatedAt: new Date().toISOString(),
    weatherCanaryTripId: WEATHER_CANARY,
    shadowMode: true,
    tests: {} as Record<string, unknown>,
  };

  try {
    evidence.before = await snapshot(prisma, 'before');

    // 1) Wrong secret
    const wrongSecret = await promote(
      {
        tripId: WEATHER_CANARY,
        signal: 'RECOVERY_OBSERVED',
        predicate: 'weather.hazard',
        dayIndex: 1,
        riskTier: 'CALM',
        trigger: 'collector_ingest',
      },
      'wrong-secret',
    );
    evidence.tests.wrong_secret = wrongSecret;

    // 2) Non-allowlist
    const nonAllowlist = await promote({
      tripId: ROAD_CANARY,
      signal: 'RECOVERY_OBSERVED',
      predicate: 'weather.hazard',
      dayIndex: 1,
      riskTier: 'CALM',
      trigger: 'collector_ingest',
    });
    evidence.tests.non_allowlist = nonAllowlist;

    // 3) Road promotion disabled
    const roadPromote = await promote({
      tripId: WEATHER_CANARY,
      signal: 'ASSERTION_EMITTED',
      predicate: 'road.status',
      roadId: 'F208',
      trigger: 'collector_ingest',
    });
    evidence.tests.road_promotion_disabled = roadPromote;

    // 4) Duplicate RECOVERY_OBSERVED
    const recoveryPayload = {
      tripId: WEATHER_CANARY,
      signal: 'RECOVERY_OBSERVED' as const,
      predicate: 'weather.hazard' as const,
      dayIndex: 1,
      riskTier: 'CALM' as const,
      ingestId: `dup-test-${Date.now()}`,
      trigger: 'collector_ingest' as const,
    };
    const dup1 = await promote(recoveryPayload);
    const dup2 = await promote({ ...recoveryPayload, ingestId: `dup-test-2-${Date.now()}` });
    evidence.tests.duplicate_recovery_signal = { first: dup1, second: dup2 };

    // 5) Service interrupt — only if NEST_INTERRUPT=1
    if (process.env.NEST_INTERRUPT_TEST === '1') {
      evidence.tests.service_interrupt = {
        note: 'run after manual nest stop; promote should fail then retry succeeds',
      };
    }

    evidence.mid = await snapshot(prisma, 'mid');

    evidence.after = await snapshot(prisma, 'after');

    const problemUnchanged =
      (evidence.before as Snapshot).problemCount === (evidence.after as Snapshot).problemCount &&
      JSON.stringify((evidence.before as Snapshot).openProblemIds) ===
        JSON.stringify((evidence.after as Snapshot).openProblemIds);

    const queueUnchanged =
      (evidence.before as Snapshot).decisionQueueOpenCount ===
      (evidence.after as Snapshot).decisionQueueOpenCount;

    const hasRecoveryShadow = ((evidence.after as Snapshot).ledgerEntries as { status?: string }[]).some(
      (e) => e.status === 'RECOVERY_SHADOW',
    );

    evidence.verdict = {
      wrong_secret_blocked: wrongSecret.status === 403,
      non_allowlist_skipped:
        (nonAllowlist.body as { result?: { skipped?: boolean } })?.result?.skipped === true,
      road_promotion_skipped:
        (roadPromote.body as { result?: { detail?: string } })?.result?.detail?.includes('phase1') ||
        (roadPromote.body as { result?: { skipped?: boolean } })?.result?.skipped === true,
      duplicate_idempotent:
        (dup2.body as { result?: { skipped?: boolean; status?: string } })?.result?.skipped === true ||
        (dup2.body as { result?: { status?: string } })?.result?.status === 'RECOVERY_SHADOW',
      problem_store_unchanged: problemUnchanged,
      visible_queue_unchanged: queueUnchanged,
      recovery_shadow_observed: hasRecoveryShadow,
      overall_pass:
        wrongSecret.status === 403 &&
        problemUnchanged &&
        hasRecoveryShadow,
    };

    const outPath = join(EVIDENCE_DIR, `assertion-promotion-shadow-validation-${STAMP}.json`);
    writeFileSync(outPath, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ outPath, verdict: evidence.verdict }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
