/**
 * P4 final engineering closure — selective + canonical default + flip drill.
 *
 * Usage:
 *   npm run p4-phase:final-closure
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-phase-status');

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-final-closure] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const selective = readJson<{ overall?: string }>('artifacts/p4-phase-status/closure.json');
  const canonical = readJson<{ overall?: string }>(
    'artifacts/p4-canonical-default-status/closure.json',
  );
  const flipDrill = readJson<{ pass?: boolean }>('artifacts/p4-flip-full-drill/report.json');
  const fallbackDrill = readJson<{ pass?: boolean }>(
    'artifacts/p4-legacy-fallback-drill/report.json',
  );
  const observation = readJson<{ pass?: boolean; detail?: string }>(
    'artifacts/p4-observation-status/status.json',
  );
  const rollout = snapshotConstraintOnRolloutCatalog();

  const items = [
    {
      id: 'selective-closure',
      pass: selective?.overall === 'CANONICAL_SELECTIVE_READY',
      detail: selective?.overall ?? 'missing',
    },
    {
      id: 'canonical-default-staging',
      pass: canonical?.overall === 'CANONICAL_DEFAULT_STAGING_READY',
      detail: canonical?.overall ?? 'missing',
    },
    {
      id: 'constraint-rollout-7-7',
      pass: rollout.onForSelectedCount === rollout.entryCount,
      detail: `${rollout.onForSelectedCount}/${rollout.entryCount}`,
    },
    {
      id: 'flip-full-drill',
      pass: flipDrill?.pass === true,
      detail: String(flipDrill?.pass ?? 'run p4-flip-full-drill'),
    },
    {
      id: 'legacy-fallback-drill',
      pass: fallbackDrill?.pass === true,
      detail: String(fallbackDrill?.pass ?? 'run p4-legacy-fallback:drill'),
    },
    {
      id: 'observation-window',
      pass: observation?.pass === true,
      requiredForProduction: true,
      detail: observation?.detail ?? 'run p4-observation:status',
    },
  ];

  const engineeringItems = items.filter((i) => i.id !== 'observation-window');
  const engineeringPass = engineeringItems.every((i) => i.pass);
  const failed = items.filter((i) => !i.pass);

  const overall = engineeringPass
    ? observation?.pass
      ? 'P4_COMPLETE_READY_FOR_PRODUCTION_FLIP'
      : 'P4_ENGINEERING_COMPLETE'
    : 'IN_PROGRESS';

  const closure = {
    schemaId: 'tripnara.p4_phase_final_closure@v1',
    generatedAt: new Date().toISOString(),
    overall,
    engineeringComplete: engineeringPass,
    productionFlipReady: overall === 'P4_COMPLETE_READY_FOR_PRODUCTION_FLIP',
    items,
    blockers: failed.map((f) => f.id),
    nextMilestone:
      overall === 'P4_ENGINEERING_COMPLETE'
        ? 'Wait observation window + production sign-off; then npm run p4-production-flip:advisory'
        : overall === 'P4_COMPLETE_READY_FOR_PRODUCTION_FLIP'
          ? 'Execute CANONICAL_DEFAULT_PRODUCTION_FLIP.md canary rollout'
          : 'Complete missing engineering artifacts',
    p5Entry: 'npm run p5-phase:status',
  };

  const outPath = path.join(OUT_DIR, 'final-closure.json');
  fs.writeFileSync(outPath, JSON.stringify(closure, null, 2));
  log(`written ${outPath}`);
  log(`overall=${overall} engineering=${engineeringPass} blockers=${failed.length}`);

  if (!engineeringPass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
