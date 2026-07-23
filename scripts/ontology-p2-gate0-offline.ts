#!/usr/bin/env npx tsx
/**
 * ONT-P2-00 — freeze Gate 0 offline validation artifact
 * Does NOT launch production Shadow Pilot.
 */

import { copyFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { evaluateP2Gate0Offline } from '../src/travel-ontology/p2-temporal';

async function main() {
  const report = evaluateP2Gate0Offline({
    nowMs: Date.parse('2026-07-23T18:00:00.000Z'),
  });

  const outDir = join(process.cwd(), 'artifacts/ontology-p2/gate0');
  mkdirSync(outDir, { recursive: true });
  const stamped = join(
    outDir,
    `gate0-offline-${report.generatedAt.replace(/[:.]/g, '-')}.json`,
  );
  const latest = join(outDir, 'gate0-offline.latest.json');
  writeFileSync(stamped, JSON.stringify(report, null, 2));
  copyFileSync(stamped, latest);

  console.log(
    JSON.stringify(
      {
        ok: report.verdict === 'PASS',
        verdict: report.verdict,
        phase: report.phase,
        checks: report.checks,
        summary: report.accuracy.summary,
        replayFingerprint: report.accuracy.replayFingerprint,
        nextAllowed: report.nextAllowed,
        nextForbidden: report.nextForbidden,
        artifact: latest,
      },
      null,
      2,
    ),
  );

  if (report.verdict !== 'PASS') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
