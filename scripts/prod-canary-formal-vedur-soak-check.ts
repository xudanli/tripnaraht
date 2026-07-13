#!/usr/bin/env npx tsx
/**
 * Check formal 24h Vedur soak completion.
 *
 * Usage: npx tsx scripts/prod-canary-formal-vedur-soak-check.ts [--evidence-file=...]
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY } from '../src/decision-runtime/monitoring/config/iceland-vedur-monitoring.config';
import { RFC001_VEDUR_COLLECTOR_RAW_EVIDENCE_KEY } from '../src/trips/guardian-decision-core/evidence/vedur-collector-ingest.service';

const CANARY_TRIP_ID = 'a0a99999-9999-4999-8999-999999999999';
const FRANKFURT_HOST = process.env.FRANKFURT_HOST ?? 'root@47.87.131.183';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

function findLatestSoakEvidence(): string {
  const dir = 'internal-docs/operations/evidence';
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('formal-vedur-soak-') && f.endsWith('.json'))
    .filter(
      (f) =>
        !f.includes('abort') &&
        !f.includes('check') &&
        !f.includes('superseded') &&
        !f.includes('voided') &&
        !f.includes('repair') &&
        !f.includes('watch'),
    )
    .sort()
    .reverse();
  if (files.length === 0) throw new Error('no formal-vedur-soak evidence found');
  return join(dir, files[0]!);
}

function shell(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', timeout: 20000 }).trim();
}

async function main() {
  const evidencePath = arg('evidence-file') ?? findLatestSoakEvidence();
  const soak = JSON.parse(readFileSync(evidencePath, 'utf8')) as {
    startedAt: string;
    endsAt: string;
    soakDurationHours: number;
    status: string;
  };

  const now = Date.now();
  const endsAtMs = Date.parse(soak.endsAt);
  const elapsedHours = (now - Date.parse(soak.startedAt)) / (3600 * 1000);
  const durationMet = now >= endsAtMs;

  let ingestHealth = 'down';
  let tunnelHealth = 'down';
  try {
    ingestHealth = shell('curl -4 -sS --max-time 5 http://127.0.0.1:3000/health');
  } catch {
    /* down */
  }
  try {
    tunnelHealth = shell(
      `ssh -o BatchMode=yes -o ConnectTimeout=8 ${FRANKFURT_HOST} 'curl -4 -sS --max-time 8 http://127.0.0.1:19080/health'`,
    );
  } catch {
    /* down */
  }

  let collectorLogLines = 0;
  let collectorHttp200 = 0;
  try {
    const log = shell(
      `ssh -o BatchMode=yes ${FRANKFURT_HOST} 'grep -c "\\[collector\\] http=200" /var/log/vedur-collector.log 2>/dev/null || echo 0'`,
    );
    collectorHttp200 = Number(log) || 0;
    const lines = shell(
      `ssh -o BatchMode=yes ${FRANKFURT_HOST} 'wc -l < /var/log/vedur-collector.log 2>/dev/null || echo 0'`,
    );
    collectorLogLines = Number(lines) || 0;
  } catch {
    /* optional */
  }

  const prisma = new PrismaClient();
  let rawCount = 0;
  let pollCount = 0;
  let ingestedPolls = 0;
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: CANARY_TRIP_ID },
      select: { metadata: true },
    });
    const meta = (trip?.metadata as Record<string, unknown>) ?? {};
    const raw = meta[RFC001_VEDUR_COLLECTOR_RAW_EVIDENCE_KEY] as { records?: unknown[] } | undefined;
    const vedur = meta[RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY] as {
      polls?: Array<{ outcome?: string }>;
    } | undefined;
    rawCount = raw?.records?.length ?? 0;
    pollCount = vedur?.polls?.length ?? 0;
    ingestedPolls = vedur?.polls?.filter((p) => p.outcome === 'INGESTED' || p.outcome === 'UNCHANGED').length ?? 0;
  } finally {
    await prisma.$disconnect();
  }

  const expectedRuns = Math.floor((elapsedHours * 60) / 15);
  const cronSuccessRate =
    expectedRuns > 0 ? Math.min(1, collectorHttp200 / Math.max(1, expectedRuns)) : 0;

  const pass =
    durationMet &&
    ingestHealth.includes('"ok":true') &&
    tunnelHealth.includes('"ok":true') &&
    rawCount >= 1 &&
    pollCount >= 1 &&
    cronSuccessRate >= 0.95;

  const report = {
    evidenceType: 'PRODUCTION_CANARY_FORMAL_VEDUR_SOAK_CHECK',
    checkedAt: new Date().toISOString(),
    sourceEvidence: evidencePath,
    elapsedHours: Math.round(elapsedHours * 10) / 10,
    durationMet,
    ingestHealth,
    tunnelHealth,
    collectorHttp200,
    collectorLogLines,
    expectedCronRuns: expectedRuns,
    cronSuccessRate: Math.round(cronSuccessRate * 1000) / 1000,
    tripMetadata: { rawCount, pollCount, ingestedPolls },
    verdict: pass ? 'FORMAL_VEDUR_SOAK_PASS' : durationMet ? 'FORMAL_VEDUR_SOAK_FAIL' : 'FORMAL_VEDUR_SOAK_IN_PROGRESS',
    signoffEligible: pass,
  };

  const out = evidencePath.replace('formal-vedur-soak-', 'formal-vedur-soak-check-');
  writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${out}`);
  console.log(`\n=== ${report.verdict} ===`);

  if (!durationMet) {
    console.log(`Soak still running — ends at ${soak.endsAt}`);
    process.exit(0);
  }
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
