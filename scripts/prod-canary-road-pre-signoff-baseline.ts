#!/usr/bin/env npx tsx
/**
 * Step 0 — Freeze Weather Formal Soak baseline before Road Pre-Signoff Drill.
 *
 * Usage:
 *   npx tsx scripts/prod-canary-road-pre-signoff-baseline.ts
 *   npx tsx scripts/prod-canary-road-pre-signoff-baseline.ts --label=post-drill
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  DRILL_STATUS,
  EVIDENCE_DIR,
  EVIDENCE_LABEL,
  GO_STATUS,
} from './prod-canary-road-pre-signoff.constants';
import {
  arg,
  assertProdDatabase,
  readWeatherSoakSnapshot,
  today,
} from './prod-canary-road-pre-signoff.util';

async function main() {
  assertProdDatabase();
  const label = arg('label', 'pre-drill')!;
  const prisma = new PrismaClient();

  function findLatestSoakEvidence(): string {
    const dir = EVIDENCE_DIR;
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

  let soakEvidence: Record<string, unknown> = {};
  try {
    const soakPath = arg('soak-evidence-file') ?? findLatestSoakEvidence();
    soakEvidence = JSON.parse(readFileSync(soakPath, 'utf8'));
    (soakEvidence as Record<string, unknown>)._baselineSourceFile = soakPath;
  } catch {
    soakEvidence = { status: 'UNKNOWN', note: 'formal soak evidence file missing' };
  }

  try {
    const weather = await readWeatherSoakSnapshot(prisma);
    const evidence = {
      evidenceType: 'ROAD_PRE_SIGNOFF_WEATHER_SOAK_BASELINE',
      evidenceLabel: EVIDENCE_LABEL,
      drillDefinition: 'Prod Canary Road A/B/C Pre-Signoff Drill',
      drillStatus: DRILL_STATUS,
      productionCanaryGoStatus: GO_STATUS,
      label,
      capturedAt: new Date().toISOString(),
      formalSoak: soakEvidence,
      weatherSnapshot: weather,
      note: 'Snapshot only — does not modify Weather Soak process or env.',
    };

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const out = `${EVIDENCE_DIR}/prod-canary-road-weather-baseline-${label}-${today()}.json`;
    writeFileSync(out, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
    console.log(`\nWritten: ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
