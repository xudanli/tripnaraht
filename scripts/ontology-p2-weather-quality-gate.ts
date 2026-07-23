#!/usr/bin/env npx tsx
/**
 * ONT-P2-02A — freeze Quality Gate baseline + human review ledger + Replay
 * On PASS → submit ONT-P2-02B Internal Temporal Advisory application (SUBMITTED)
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  evaluateWeatherTemporalPredictionQualityGate,
  submit02BInternalTemporalAdvisoryApplication,
} from '../src/travel-ontology/p2-temporal';

async function main() {
  delete process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH;
  const nowMs = Date.parse('2026-07-23T18:00:00.000Z');

  const gate = await evaluateWeatherTemporalPredictionQualityGate({ nowMs });
  const app02b = submit02BInternalTemporalAdvisoryApplication({
    qualityGate: gate,
    nowMs: Date.parse('2026-07-23T18:30:00.000Z'),
  });

  const outDir = join(process.cwd(), 'artifacts/ontology-p2/quality-gate');
  mkdirSync(outDir, { recursive: true });

  const write = (name: string, data: unknown) => {
    const latest = join(outDir, `${name}.latest.json`);
    writeFileSync(latest, JSON.stringify(data, null, 2));
    return latest;
  };

  const gatePath = write('quality-gate', gate);
  const baselinePath = write('quality-baseline', gate.baseline);
  const ledgerPath = write('human-review-ledger', gate.ledger);
  const replayIndex = write(
    'quality-discrepancy-replays',
    gate.ledger.entries.map((e) => ({
      discrepancyId: e.discrepancyId,
      kind: e.kind,
      classification: e.classification,
      replayCaseId: e.replayCaseId,
      replayFingerprint: e.replayFingerprint,
      humanReviewStatus: e.humanReviewStatus,
    })),
  );

  const appDir = join(process.cwd(), 'artifacts/ontology-p2/internal-advisory');
  mkdirSync(appDir, { recursive: true });
  const appPath = join(
    appDir,
    'internal-temporal-advisory-authorization.json',
  );
  writeFileSync(appPath, JSON.stringify(app02b, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: gate.verdict === 'PASS',
        workItem: 'ONT-P2-02A',
        verdict: gate.verdict,
        ledgerComplete: gate.ledger.ledgerComplete,
        metrics: gate.metrics,
        baseline: {
          onsetAbsErrorMinutesP95: gate.baseline.onsetAbsErrorMinutesP95,
          maxActionableFalseNegativeRate:
            gate.baseline.maxActionableFalseNegativeRate,
          maxFalsePositiveRate: gate.baseline.maxFalsePositiveRate,
          maxPredictionReversalRate: gate.baseline.maxPredictionReversalRate,
          minReconciliationCompletionRate:
            gate.baseline.minReconciliationCompletionRate,
          maxUnobservableRate: gate.baseline.maxUnobservableRate,
          replayFingerprint: gate.baseline.replayFingerprint,
        },
        nextAllowed: gate.nextAllowed,
        ontP2_02B: {
          status: app02b.status,
          audience: app02b.scope.audience,
          authorityMode: app02b.scope.authorityMode,
        },
        artifacts: {
          gate: gatePath,
          baseline: baselinePath,
          ledger: ledgerPath,
          replays: replayIndex,
          application02b: appPath,
        },
      },
      null,
      2,
    ),
  );

  if (gate.verdict !== 'PASS') process.exit(1);
  if (app02b.status !== 'SUBMITTED') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
