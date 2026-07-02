/**
 * Trigger Gateway wiring closure status (catalog 12/12 dispatch).
 *
 * Usage:
 *   npm run trigger-wiring:status
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { evaluateTriggerWiringClosure } from '../../src/decision-runtime/production-transition/trigger-wiring-closure.evaluator';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'trigger-wiring-status');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [trigger-wiring] ${line}`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = evaluateTriggerWiringClosure();
  const outPath = path.join(OUT_DIR, 'closure.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  log(`written ${outPath}`);
  log(
    `pass=${report.pass} dispatch=${report.summary.dispatchWired}/${report.summary.total} lineage_only=${report.summary.lineageOnly}`,
  );
  if (report.nextActions[0]) {
    log(`next: ${report.nextActions[0]}`);
  }

  if (!report.pass && process.env.TRIGGER_WIRING_STRICT === '1') {
    process.exitCode = 1;
  }
}

main();
