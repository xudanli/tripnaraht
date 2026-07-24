/**
 * Holdout preflight — verify dataset scaffold + freeze config alignment before formal holdout run.
 *
 * Usage:
 *   npm run task-e1:holdout-preflight
 *   npm run task-e1:holdout-preflight -- --dry-run-instances 3
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildBenchmarkDatasetV1,
  filterDataset,
} from '../../src/decision-runtime/benchmark/benchmark-dataset-v1';
import { hashRunConfig, buildRunConfig } from '../../src/decision-runtime/benchmark/benchmark-config.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p2-phase-status');
const FREEZE_MANIFEST = path.join(
  process.cwd(),
  'artifacts',
  'task-e1-freeze',
  'calibration-v1-freeze-manifest.json',
);

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [holdout-preflight] ${line}`);
}

function parseMaxDryRun(): number | undefined {
  const idx = process.argv.indexOf('--dry-run-instances');
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const dataset = buildBenchmarkDatasetV1();
  const holdout = filterDataset(dataset, { split: 'HOLDOUT' });
  const calibration = filterDataset(dataset, { split: 'CALIBRATION' });

  const freeze = fs.existsSync(FREEZE_MANIFEST)
    ? (JSON.parse(fs.readFileSync(FREEZE_MANIFEST, 'utf8')) as {
        configHash?: string;
        freezeTag?: string;
        objectiveRegistryVersion?: string;
      })
    : null;

  const runConfig = buildRunConfig({
    dataset,
    split: 'HOLDOUT',
    baseUrl: process.env.BENCHMARK_BASE_URL ?? 'http://localhost:3001/api',
    concurrency: 1,
    maxAttempts: 3,
    shadowWaitTimeoutMs: 120_000,
  });
  const configHash = hashRunConfig(runConfig);

  const blockers: string[] = [];
  if (holdout.length < 30) {
    blockers.push(`holdout instance count ${holdout.length} < 30`);
  }
  if (!freeze) {
    blockers.push('calibration-v1-freeze-manifest.json missing');
  }
  if (freeze?.objectiveRegistryVersion !== 'objectives@v1') {
    blockers.push('objective registry version drift vs freeze');
  }

  const partitionDisjoint = holdout.every(
    (h) => !calibration.some((c) => c.instanceId === h.instanceId),
  );
  if (!partitionDisjoint) {
    blockers.push('holdout/calibration instance IDs overlap');
  }

  const dryRunN = parseMaxDryRun();
  const sampleInstances = (dryRunN ? holdout.slice(0, dryRunN) : holdout.slice(0, 5)).map(
    (i) => ({
      instanceId: i.instanceId,
      tripId: i.tripId,
      scenarioRef: i.scenarioRef,
    }),
  );

  const ready = blockers.length === 0;

  const report = {
    schemaId: 'tripnara.holdout_preflight@v1',
    generatedAt: new Date().toISOString(),
    ready,
    holdoutInstanceCount: holdout.length,
    calibrationInstanceCount: calibration.length,
    freezeTag: freeze?.freezeTag ?? null,
    freezeConfigHash: freeze?.configHash ?? null,
    preflightConfigHash: configHash,
    configHashMatchesFreeze: freeze?.configHash ? freeze.configHash === configHash : null,
    sampleInstances,
    blockers,
    nextCommand:
      'npm run task-e1:benchmark-batch -- --split holdout --concurrency 1 --max-instances 30',
  };

  const outPath = path.join(OUT_DIR, 'holdout-preflight.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`holdout instances=${holdout.length} ready=${ready}`);

  if (blockers.length) {
    log(`BLOCKERS: ${blockers.join('; ')}`);
    process.exitCode = 1;
  } else {
    log('holdout preflight PASS — safe to start holdout batch on :3001 SHADOW');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
