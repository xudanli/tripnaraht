/**
 * P4 observation window — days elapsed since selective closure.
 *
 * Usage:
 *   npm run p4-observation:status
 *   CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=30 npm run p4-observation:status
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { readProductionObservationTimeWindow } from '../../src/decision-runtime/production-transition/production-observation-time-window.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-observation-status');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-observation] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const minDays = Number(process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS ?? '30');
  const tw = readProductionObservationTimeWindow();
  const pass = tw.selectiveClosureOverall === 'CANONICAL_SELECTIVE_READY' && tw.timePass;

  const status = {
    schemaId: 'tripnara.p4_observation_status@v1',
    generatedAt: new Date().toISOString(),
    selectiveClosureOverall: tw.selectiveClosureOverall ?? 'missing',
    selectiveClosureAt: tw.selectiveClosureAt,
    observationStartedAt: tw.observationStartedAt,
    anchorSource: tw.anchorSource,
    minObservationDays: minDays,
    elapsedDays: Number(tw.elapsedDays.toFixed(2)),
    archivedDays: tw.archivedDays,
    remainingDays: Math.max(0, Number((minDays - tw.elapsedDays).toFixed(2))),
    pass,
    detail: `${tw.elapsedDays.toFixed(1)}/${minDays}d elapsed · ${tw.archivedDays}/${minDays} archived`,
    nextCheck: pass
      ? 'Ready for dual-gate check: npm run production-observation:status'
      : `Wait ${Math.ceil(minDays - tw.elapsedDays)}d elapsed (and archived) or extend if volume low`,
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(status, null, 2));
  log(`written ${outPath}`);
  log(`pass=${pass} ${status.detail}`);

  if (!pass && process.env.P4_OBSERVATION_STRICT === '1') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
